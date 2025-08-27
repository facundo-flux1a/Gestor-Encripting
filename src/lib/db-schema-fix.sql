-- Este archivo contiene la sentencia SQL para corregir el trigger en la base de datos.
-- Por favor, ejecuta este comando en tu cliente de base de datos para resolver el error.

-- Elimina el trigger existente si existe para evitar errores.
DROP TRIGGER IF EXISTS `trigger_validar_impuestos`;

-- Crea el nuevo trigger corregido.
CREATE TRIGGER `trigger_validar_impuestos` AFTER INSERT ON `validacion_impuestos`
FOR EACH ROW
BEGIN
    -- Actualiza los documentos que están dentro del rango de fechas
    -- y que tengan el tipo de impuesto y porcentaje inválidos.
    -- Se ha corregido 'fecha' por 'fecha_emision' que es el nombre correcto de la columna.
    UPDATE documentos
    SET 
        incidencia = TRUE,
        descripcion_incidencia = CONCAT(
            'No es válido: utiliza ',
            NEW.tipo_impuesto,
            ' al ',
            NEW.porcentaje,
            '% en este rango (',
            NEW.date_init,
            ' - ',
            NEW.date_finish,
            ')'
        )
    WHERE 
        fecha_emision >= NEW.date_init
        AND fecha_emision <= NEW.date_finish
        AND tipo_documento = NEW.tipo_impuesto
        AND porcentaje = NEW.porcentaje;
END;
