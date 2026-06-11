-- =====================================================================
-- PASO 1: Ver el nombre exacto del Foreign Key en documentos_auditoria
-- =====================================================================
SELECT CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'documentos_auditoria'
  AND REFERENCED_TABLE_NAME = 'documentos'
  AND TABLE_SCHEMA = DATABASE();

-- =====================================================================
-- PASO 2: Eliminar el FK (que pone documento_id en NULL al borrar docs)
-- El nombre más probable es 'fk_audit_documento' pero confirmalo con el PASO 1.
-- Si el nombre es diferente, cambiá 'fk_audit_documento' por el que devuelva el PASO 1.
-- =====================================================================
ALTER TABLE documentos_auditoria DROP FOREIGN KEY fk_audit_documento;

-- =====================================================================
-- PASO 3: Ampliar la columna 'usuario' para que entren los textos encriptados
-- (los textos cifrados son mucho más largos que 100 caracteres)
-- =====================================================================
ALTER TABLE documentos_auditoria MODIFY COLUMN usuario TEXT;

-- =====================================================================
-- PASO 4: Crear la tabla de eventos del sistema si no existe
-- (logins, logouts, etc. requeridos por la Orden HAC/1177/2024)
-- =====================================================================
CREATE TABLE IF NOT EXISTS `eventos_sistema` (
  `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `id_de_empresa` bigint(20) unsigned DEFAULT NULL,
  `usuario`       longtext DEFAULT NULL COMMENT 'Email encriptado del usuario',
  `tipo_evento`   varchar(100)        NOT NULL COMMENT 'LOGIN, LOGOUT, CONFIG_CHANGE, ERROR',
  `metadata`      longtext            DEFAULT NULL COMMENT 'JSON encriptado: IP, user-agent, etc.',
  `fecha`         datetime            NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_eventos_empresa` (`id_de_empresa`),
  KEY `idx_eventos_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
