import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const env = { ...loadEnv(path.resolve(process.cwd(), '.env')), ...process.env };
const dbUrl = env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL no encontrada en .env');
  process.exit(1);
}

const targetUrls = [
  'https://minio.allbase.com.ar/gestor-documental/archivos/doc_upload_1786535249216_d7436206b1_doc_4820ecd9_2026_08_12_10_17_59.pdf',
  'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-registro-mercantil_2026_08_11_16_26_39_2026_08_12_10_17_59.pdf'
];

async function run() {
  const conn = await mysql.createConnection(dbUrl);
  const reportLines = [];
  const log = (str = '') => {
    console.log(str);
    reportLines.push(str);
  };

  log("=========================================================================");
  log("        REPORTE DE CONSISTENCIA Y VERIFICACIÓN DE ENTIDADES / DOCS");
  log(`        Fecha: ${new Date().toLocaleString('es-AR')}`);
  log("=========================================================================\n");

  log("--- 1. CHEQUEO GENERAL DE DUPLICADOS EN LA BASE DE DATOS DE ENTIDADES ---");
  const [entDups] = await conn.query(`
    SELECT documento_id, rol, COUNT(*) as cantidad, GROUP_CONCAT(id SEPARATOR ', ') as ids
    FROM entidades_documento
    GROUP BY documento_id, rol
    HAVING COUNT(*) > 1
  `);

  if (entDups.length === 0) {
    log("✔ [OK] No se detectaron entidades duplicadas por (documento_id, rol) en toda la base de datos.");
  } else {
    log(`⚠️ [ALERTA] Se encontraron ${entDups.length} documentos con entidades duplicadas por mismo rol:`);
    for (const dup of entDups) {
      log(`   - Documento ID: ${dup.documento_id} | Rol: '${dup.rol}' | Cantidad: ${dup.cantidad} | Entidad IDs: ${dup.ids}`);
    }
  }
  log("");

  log("--- 2. CHEQUEO GENERAL DE CONSISTENCIA EN ENTIDADES (Roles y CIFs vacíos) ---");
  const [invalidEnts] = await conn.query(`
    SELECT id, documento_id, rol, nombre, identificador_fiscal
    FROM entidades_documento
    WHERE (rol IS NULL OR rol = '') OR (nombre IS NULL AND identificador_fiscal IS NULL)
  `);

  if (invalidEnts.length === 0) {
    log("✔ [OK] Todas las entidades tienen un rol asignado y al menos nombre o identificador fiscal.");
  } else {
    log(`⚠️ [ALERTA] Se encontraron ${invalidEnts.length} entidades inconsistentes sin rol o sin datos básicos:`);
    for (const ie of invalidEnts) {
      log(`   - Entidad ID: ${ie.id} | Doc ID: ${ie.documento_id} | Rol: '${ie.rol}' | Nombre: '${ie.nombre}'`);
    }
  }
  log("");

  log("--- 3. ANÁLISIS ESPECÍFICO DE DOCUMENTOS SOLICITADOS ---");

  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    const fileName = url.split('/').pop();
    log(`\n=========================================================================`);
    log(`📄 DOCUMENTO #${i + 1}: ${fileName}`);
    log(`URL: ${url}`);
    log(`-------------------------------------------------------------------------`);

    // Buscar en archivos_documento o actividad por nombre o URL
    const [archivos] = await conn.query(`
      SELECT a.*, d.numero_documento, d.tipo_documento, d.importe_total, d.id_de_empresa, e.nombre_de_empresa
      FROM archivos_documento a
      LEFT JOIN documentos d ON a.documento_id = d.id
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      WHERE a.ruta_archivo LIKE ? OR a.ruta_archivo LIKE ? OR a.nombre_archivo LIKE ?
    `, [`%${fileName}%`, `%${url}%`, `%${fileName}%`]);

    const [actividades] = await conn.query(`
      SELECT * FROM actividad 
      WHERE documento_nombre LIKE ? OR upload_id LIKE ? OR file_path LIKE ?
      ORDER BY created_at DESC LIMIT 5
    `, [`%${fileName}%`, `%${fileName}%`, `%${fileName}%`]);

    if (archivos.length === 0) {
      log(`🔍 Archivo no encontrado registrado en 'archivos_documento'.`);
      if (actividades.length > 0) {
        log(`   📌 Sin embargo, se encontraron ${actividades.length} registros en la tabla 'actividad':`);
        for (const act of actividades) {
          log(`      - Upload ID: ${act.upload_id} | Status: ${act.status} | Step: ${act.step} | Mensaje: ${act.mensaje}`);
        }
      } else {
        log(`   ℹ️ No hay rastros de subida de este archivo en la base de datos.`);
      }
    } else {
      log(`✔ Encontrado en 'archivos_documento': ${archivos.length} coincidencia(s).`);
      for (const arc of archivos) {
        log(`\n   🔹 Documento ID en BD: ${arc.documento_id}`);
        log(`      - Empresa: ${arc.nombre_de_empresa || 'ID ' + arc.id_de_empresa}`);
        log(`      - Tipo Documento: ${arc.tipo_documento || 'No especificado'}`);
        log(`      - N° Documento: ${arc.numero_documento || 'Sin número'}`);
        log(`      - Importe Total: ${arc.importe_total ?? 'N/A'}`);
        log(`      - Hash Archivo: ${arc.hash_archivo || 'N/A'}`);
        log(`      - Fecha Subida: ${arc.fecha_subida}`);

        // Consultar Entidades de este Documento
        const [entidades] = await conn.query(`
          SELECT id, rol, nombre, identificador_fiscal, cuenta_contable
          FROM entidades_documento
          WHERE documento_id = ?
        `, [arc.documento_id]);

        log(`\n      👥 Entidades asociadas (${entidades.length}):`);
        if (entidades.length === 0) {
          log(`         ⚠️ [ALERTA] Este documento no tiene entidades registradas.`);
        } else {
          for (const ent of entidades) {
            log(`         - [Rol: ${ent.rol || 'SIN ROL'}] ID: ${ent.nombre || 'Sin nombre'} | CIF/NIF: ${ent.identificador_fiscal || 'N/A'} | Cta: ${ent.cuenta_contable || 'N/A'}`);
          }
        }

        // Consultar Incidencias
        const [incidencias] = await conn.query(`
          SELECT id, tipo_incidencia, descripcion, validado
          FROM incidencias_documento
          WHERE documento_id = ?
        `, [arc.documento_id]);

        log(`\n      ⚠️ Incidencias asociadas (${incidencias.length}):`);
        if (incidencias.length === 0) {
          log(`         ✔ [OK] Sin incidencias registradas.`);
        } else {
          for (const inc of incidencias) {
            log(`         - [${inc.validado ? 'RESUELTA' : 'PENDIENTE'}] ${inc.tipo_incidencia}: ${inc.descripcion}`);
          }
        }

        // Consultar Health Check Status
        const [health] = await conn.query(`
          SELECT verified, status_code, status_message
          FROM health_check_status
          WHERE documento_id = ?
        `, [arc.documento_id]);

        if (health.length > 0) {
          log(`\n      🏥 Health Check: verified=${health[0].verified} | ${health[0].status_code}: ${health[0].status_message}`);
        }
      }
    }
  }

  log("\n=========================================================================");
  log("4. RESUMEN DE DIAGNÓSTICO Y RECOMENDACIONES:");
  log("   - Entidades Duplicadas: " + (entDups.length === 0 ? "PASÓ (Ninguna duplicada)" : `FALLÓ (${entDups.length} encontradas)`));
  log("   - Inconsistencia de Datos: " + (invalidEnts.length === 0 ? "PASÓ (Datos limpios)" : `FALLÓ (${invalidEnts.length} encontradas)`));
  log("=========================================================================\n");

  await conn.end();

  const outputPath = path.resolve(process.cwd(), 'reporte_consistencia_debug.txt');
  fs.writeFileSync(outputPath, reportLines.join('\n'), 'utf8');
  console.log(`\nReporte guardado exitosamente en: ${outputPath}`);
}

run().catch(err => {
  console.error("Error ejecutando script de verificación:", err);
  process.exit(1);
});
