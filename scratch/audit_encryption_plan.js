/**
 * SCRIPT DE AUDITORÍA - SOLO LECTURA (NO MODIFICA NADA)
 * =====================================================
 * Objetivo: Mapear todas las tablas de la BD y generar un plan
 * de migración a encriptación AES-256 para campos PII.
 *
 * Cómo correrlo:
 *   node scratch/audit_encryption_plan.js
 *
 * Output: scratch/encryption_audit_report.txt
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

// ===== CONFIGURACIÓN DE CAMPOS PII =====
// Definimos manualmente qué campos son candidatos a encriptación AES-256.
// Regla: solo campos de texto/varchar que contengan PII y que el código
// NUNCA necesite usar en un WHERE con >, <, BETWEEN, SUM, ORDER BY, etc.
const PII_FIELDS = {
  usuarios: {
    encrypt: ['email', 'nombre'],
    blind_index: ['email'], // email necesita búsqueda exacta → necesita blind index (SHA-256)
    skip: ['id', 'password', 'activo', 'tutorial', 'tutorial_documentos',
           'tutorial_trimestres', 'tutorial_actividad', 'tutorial_individual',
           'tutorial_incidencias', 'tutorial_proveedores', 'tutorial_health_check',
           'organization_rol', 'email_verified', 'two_factor_code', 'two_factor_expires_at'],
    reason: 'Datos personales de usuarios - RGPD Artículo 4'
  },
  entidades_documento: {
    encrypt: ['nombre', 'direccion', 'identificador_fiscal', 'telefono', 'email'],
    blind_index: ['identificador_fiscal', 'email'], // buscados por coincidencia exacta
    skip: ['id', 'documento_id', 'rol', 'datos_extra', 'fecha_creacion',
           'id_de_empresa', 'cuenta_contable'],
    reason: 'Datos personales/fiscales de proveedores y clientes - RGPD + LOPDGDD'
  },
  documentos: {
    encrypt: [], // Ninguno: son datos operacionales (montos, fechas, trimestres)
    blind_index: [],
    skip: ['*'], // Todo queda en texto plano, cubierto por TDE de Railway
    reason: 'Datos financieros operacionales - cubiertos por Railway TDE'
  },
  lineas_documento: {
    encrypt: ['descripcion'], // El nombre del producto podría considerarse sensible
    blind_index: [],
    skip: ['id', 'documento_id', 'codigo', 'cantidad', 'unidad', 'precio_unitario',
           'descuento_porcentaje', 'precio_neto', 'importe_linea', 'datos_extra',
           'fecha_creacion', 'id_de_empresa', 'cuenta_contable'],
    reason: 'Descripción de producto sensible; precios y cantidades son operacionales'
  },
  impuestos_documento: {
    encrypt: [],
    blind_index: [],
    skip: ['*'],
    reason: 'Datos fiscales operacionales - cubiertos por Railway TDE'
  },
  archivos_documento: {
    encrypt: ['nombre_archivo', 'ruta_archivo'],
    blind_index: [],
    skip: ['id', 'documento_id', 'tipo_archivo', 'hash_archivo', 'fecha_subida', 'id_de_empresa'],
    reason: 'Rutas de archivo pueden revelar estructura interna del sistema'
  },
  incidencias_documento: {
    encrypt: ['descripcion', 'observaciones_validacion'],
    blind_index: [],
    skip: ['id', 'documento_id', 'incidencia', 'fecha_incidencia', 'validado',
           'fecha_validacion', 'validado_por', 'usuario_validado_id', 'fecha_creacion',
           'fecha_actualizacion', 'id_de_empresa'],
    reason: 'Descripciones de disputas comerciales pueden ser sensibles'
  }
};

// ===== TEMPLATES DE MIGRACIÓN =====
// Para cada tabla con campos a encriptar, genera los SQL necesarios.
function generateMigrationPlan(tableName, config, columns) {
  if (config.encrypt.length === 0) {
    return `-- [${tableName}] Sin campos a encriptar a nivel de aplicación. Cubierto por TDE.\n`;
  }

  let sql = `-- ============================================================\n`;
  sql += `-- TABLA: ${tableName}\n`;
  sql += `-- Razón: ${config.reason}\n`;
  sql += `-- Campos a encriptar: ${config.encrypt.join(', ')}\n`;
  if (config.blind_index.length > 0) {
    sql += `-- Blind Indexes necesarios: ${config.blind_index.join(', ')}\n`;
  }
  sql += `-- ============================================================\n\n`;

  // PASO 1: Backup de la tabla
  sql += `-- PASO 1: Crear backup (SOLO LECTURA de la tabla original)\n`;
  sql += `-- CREATE TABLE ${tableName}_backup_pre_encryption AS SELECT * FROM ${tableName};\n\n`;

  // PASO 2: Si hay blind index, agregar columnas para ello
  if (config.blind_index.length > 0) {
    sql += `-- PASO 2: Agregar columnas de Blind Index para búsquedas exactas\n`;
    for (const field of config.blind_index) {
      sql += `-- ALTER TABLE ${tableName} ADD COLUMN ${field}_hash VARCHAR(64) NULL AFTER ${field};\n`;
      sql += `-- ALTER TABLE ${tableName} ADD INDEX idx_${tableName}_${field}_hash (${field}_hash);\n`;
    }
    sql += `\n`;
  }

  // PASO 3: Cambiar tipo de columna a TEXT para almacenar el valor encriptado (base64 es más largo)
  sql += `-- PASO 3: Ampliar columnas que van a almacenar el valor encriptado en base64\n`;
  sql += `-- (AES-256-GCM produce un string más largo que el original)\n`;
  for (const field of config.encrypt) {
    const col = columns.find(c => c.Field === field);
    const currentType = col ? col.Type : 'varchar(255)';
    sql += `-- ALTER TABLE ${tableName} MODIFY COLUMN ${field} TEXT NULL; -- era: ${currentType}\n`;
  }
  sql += `\n`;

  // PASO 4: Nota sobre el script de migración de datos
  sql += `-- PASO 4: Script Node.js de migración de datos (a correr desde código)\n`;
  sql += `-- El script debe:\n`;
  sql += `--   1. Leer todos los registros de ${tableName} en batches de 100\n`;
  sql += `--   2. Para cada registro, encriptar los campos: ${config.encrypt.join(', ')}\n`;
  if (config.blind_index.length > 0) {
    sql += `--   3. Calcular SHA-256 de los campos: ${config.blind_index.join(', ')}\n`;
    sql += `--   4. Actualizar registro con valores encriptados + hashes\n`;
  } else {
    sql += `--   3. Actualizar registro con valores encriptados\n`;
  }
  sql += `--   Use la ENCRYPTION_KEY del .env como llave maestra AES-256\n\n`;

  return sql;
}

// ===== MAIN =====
async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL no está definida en .env');
    return;
  }

  const connection = await mysql.createConnection(dbUrl);
  let report = '';
  let migrationPlan = '';

  try {
    console.log('🔍 Conectado a la BD. Mapeando todas las tablas...\n');

    // 1. Listar TODAS las tablas de la BD (no solo las conocidas)
    const [allTables] = await connection.query(
      `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME`
    );

    report += `AUDITORÍA DE ENCRIPTACIÓN - GESTOR MUVAIL\n`;
    report += `Generado: ${new Date().toISOString()}\n`;
    report += `Total de tablas: ${allTables.length}\n`;
    report += `${'='.repeat(70)}\n\n`;

    migrationPlan += `-- PLAN DE MIGRACIÓN A ENCRIPTACIÓN AES-256\n`;
    migrationPlan += `-- Generado: ${new Date().toISOString()}\n`;
    migrationPlan += `-- IMPORTANTE: Este archivo es SOLO REFERENCIA. No correr en producción sin revisión.\n`;
    migrationPlan += `${'='.repeat(70)}\n\n`;

    for (const tableInfo of allTables) {
      const tableName = tableInfo.TABLE_NAME;
      const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);

      report += `\nTABLA: ${tableName} (~${tableInfo.TABLE_ROWS || 0} filas)\n`;
      report += `${'─'.repeat(50)}\n`;

      const piiConfig = PII_FIELDS[tableName];

      for (const col of columns) {
        let classification = '🟢 Operacional (sin encriptar)';
        let note = '';

        if (piiConfig) {
          if (piiConfig.encrypt.includes(col.Field)) {
            classification = '🔴 PII → Encriptar con AES-256';
          } else if (piiConfig.blind_index.includes(col.Field)) {
            classification = '🔴 PII → Encriptar + Blind Index';
          } else if (col.Field === 'password') {
            classification = '✅ Hash Bcrypt (ya implementado)';
          }
        } else {
          // Tabla no mapeada manualmente
          // Heurística básica: buscar nombres comunes de campos PII
          if (/email|mail/.test(col.Field)) classification = '⚠️  POSIBLE PII - Revisar manualmente';
          if (/nombre|name/.test(col.Field)) classification = '⚠️  POSIBLE PII - Revisar manualmente';
          if (/telefono|phone|nif|cif|dni/.test(col.Field)) classification = '⚠️  POSIBLE PII - Revisar manualmente';
          if (/password|pass|secret|token/.test(col.Field)) classification = '⚠️  POSIBLE SECRET - Revisar manualmente';
        }

        report += `  ${col.Field.padEnd(28)} ${col.Type.padEnd(18)} ${classification}\n`;
      }

      // Generar plan de migración para tablas conocidas
      if (piiConfig && piiConfig.encrypt.length >= 0) {
        migrationPlan += generateMigrationPlan(tableName, piiConfig, columns);
      } else {
        migrationPlan += `-- [${tableName}] Tabla nueva/no mapeada - requiere revisión manual.\n\n`;
      }
    }

    report += `\n${'='.repeat(70)}\n`;
    report += `RESUMEN EJECUTIVO (Para Lanzadera)\n`;
    report += `${'='.repeat(70)}\n`;
    report += `- Tablas con campos PII a encriptar: usuarios, entidades_documento\n`;
    report += `- Campos críticos: email, nombre, identificador_fiscal (CIF/NIF), telefono\n`;
    report += `- Campos cubiertos por TDE de Railway: montos, importes, impuestos, fechas\n`;
    report += `- Ya implementado: Bcrypt en passwords, 2FA en autenticación\n`;
    report += `- Próximo paso: Prisma ORM + prisma-field-encryption para AES-256 automático\n`;
    report += `\nCLAVE MAESTRA DISPONIBLE EN .env: ENCRYPTION_KEY=${process.env.ENCRYPTION_KEY ? '✅ Configurada' : '❌ No encontrada'}\n`;

    // Guardar archivos
    const reportPath = path.join(__dirname, 'encryption_audit_report.txt');
    const planPath = path.join(__dirname, 'encryption_migration_plan.sql');

    fs.writeFileSync(reportPath, report);
    fs.writeFileSync(planPath, migrationPlan);

    console.log(`✅ Reporte guardado en: scratch/encryption_audit_report.txt`);
    console.log(`✅ Plan SQL guardado en: scratch/encryption_migration_plan.sql`);
    console.log(`\n📋 Vista rápida del reporte:\n`);
    console.log(report);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await connection.end();
  }
}

run();
