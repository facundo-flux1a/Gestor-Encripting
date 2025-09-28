-- Este script corrige la lógica de los triggers y funciones en la base de datos.
-- DEBE ser ejecutado manualmente en tu cliente de base de datos.

-- Eliminar el trigger existente que tiene errores
DROP TRIGGER IF EXISTS `trigger_validar_impuestos`;

-- Crear el trigger corregido
DELIMITER ;;
CREATE TRIGGER `trigger_validar_impuestos` AFTER INSERT ON `validacion_impuestos` FOR EACH ROW 
BEGIN
    -- Crear incidencias para documentos que tienen impuestos inválidos en el rango de fechas especificado
    INSERT INTO incidencias_documento (documento_id, incidencia, descripcion, validado, fecha_incidencia)
    SELECT DISTINCT 
        d.id,
        1,
        CONCAT(
            'Impuesto inválido: ', 
            i.tipo_impuesto,
            ' al ',
            i.porcentaje,
            '% no es válido para el período (',
            NEW.date_init,
            ' - ',
            NEW.date_finish,
            ')'
        ),
        0,
        NOW()
    FROM documentos d
    INNER JOIN impuestos_documento i ON d.id = i.documento_id
    WHERE 
        NEW.vigente = 1
        AND d.fecha_emision >= NEW.date_init
        AND d.fecha_emision <= NEW.date_finish
        AND i.tipo_impuesto = NEW.tipo_impuesto
        AND i.porcentaje = NEW.porcentaje
        -- Evitar duplicar incidencias que ya existen
        AND NOT EXISTS (
            SELECT 1 FROM incidencias_documento inc 
            WHERE inc.documento_id = d.id 
            AND inc.validado = 0
            AND inc.descripcion LIKE CONCAT('%', NEW.tipo_impuesto, '%', NEW.porcentaje, '%')
        );
END ;;
DELIMITER ;

-- Crear función para validar totales de documento (referenciada en el trigger existente)
DELIMITER ;;
CREATE FUNCTION IF NOT EXISTS `validar_totales_documento`(p_documento_id BIGINT) RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_importe_calculado DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_importe_sin_impuestos_calculado DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_importe_total DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_importe_sin_impuestos DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_diferencia_total DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_diferencia_sin_impuestos DECIMAL(15,2) DEFAULT 0.00;
    DECLARE v_resultado JSON;
    DECLARE v_errores JSON DEFAULT JSON_ARRAY();
    
    -- Obtener totales del documento
    SELECT importe_total, importe_sin_impuestos 
    INTO v_importe_total, v_importe_sin_impuestos
    FROM documentos 
    WHERE id = p_documento_id;
    
    -- Calcular totales desde las líneas
    SELECT 
        COALESCE(SUM(importe_linea), 0),
        COALESCE(SUM(precio_neto), 0)
    INTO 
        v_importe_calculado,
        v_importe_sin_impuestos_calculado
    FROM lineas_documento 
    WHERE documento_id = p_documento_id;
    
    -- Calcular diferencias
    SET v_diferencia_total = ABS(v_importe_total - v_importe_calculado);
    SET v_diferencia_sin_impuestos = ABS(v_importe_sin_impuestos - v_importe_sin_impuestos_calculado);
    
    -- Verificar si hay errores (tolerancia de 0.01)
    IF v_diferencia_total > 0.01 THEN
        SET v_errores = JSON_ARRAY_APPEND(v_errores, '$', 
            CONCAT('Diferencia en importe total: esperado ', v_importe_calculado, ', actual ', v_importe_total));
    END IF;
    
    IF v_diferencia_sin_impuestos > 0.01 THEN
        SET v_errores = JSON_ARRAY_APPEND(v_errores, '$', 
            CONCAT('Diferencia en importe sin impuestos: esperado ', v_importe_sin_impuestos_calculado, ', actual ', v_importe_sin_impuestos));
    END IF;
    
    -- Crear resultado JSON
    SET v_resultado = JSON_OBJECT(
        'es_valido', IF(JSON_LENGTH(v_errores) = 0, 'true', 'false'),
        'errores', v_errores,
        'importe_total_esperado', v_importe_calculado,
        'importe_total_actual', v_importe_total,
        'importe_sin_impuestos_esperado', v_importe_sin_impuestos_calculado,
        'importe_sin_impuestos_actual', v_importe_sin_impuestos
    );
    
    RETURN v_resultado;
END ;;
DELIMITER ;

-- Crear vista para cálculos de impuestos por documento (referenciada en el procedimiento)
CREATE OR REPLACE VIEW `v_documento_impuestos` AS
SELECT 
    ld.documento_id,
    COALESCE(
        CASE 
            WHEN JSON_EXTRACT(ld.datos_extra, '$.impuesto_porcentaje') IS NOT NULL 
            THEN JSON_UNQUOTE(JSON_EXTRACT(ld.datos_extra, '$.impuesto_porcentaje'))
            ELSE '21'
        END, 
        '21'
    ) AS porcentaje,
    ld.precio_neto AS base_imponible,
    ROUND(
        ld.precio_neto * COALESCE(
            CASE 
                WHEN JSON_EXTRACT(ld.datos_extra, '$.impuesto_porcentaje') IS NOT NULL 
                THEN JSON_UNQUOTE(JSON_EXTRACT(ld.datos_extra, '$.impuesto_porcentaje'))
                ELSE '21'
            END, 
            '21'
        ) / 100, 
        2
    ) AS cuota_iva
FROM lineas_documento ld
WHERE ld.precio_neto IS NOT NULL;	
