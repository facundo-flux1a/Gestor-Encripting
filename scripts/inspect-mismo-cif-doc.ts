import { queryWithRetry } from '../src/lib/db';
import { prisma } from '../src/lib/prisma';

const targetUrl = 'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-mismo-cif-test_2026_08_12_17_15_04.pdf';
const fileName = 'alquila-y-descansa-factura-mismo-cif-test_2026_08_12_17_15_04.pdf';

async function run() {
  console.log("=========================================================================");
  console.log("🔍 ANÁLISIS DE CONSISTENCIA DE FACTURA CON MISMO CIF EN CLIENTE Y PROVEEDOR");
  console.log(`📄 Archivo: ${fileName}`);
  console.log(`🔗 URL: ${targetUrl}`);
  console.log("=========================================================================\n");

  // 1. Buscar en archivos_documento
  const [archivos] = await queryWithRetry(
    `SELECT a.*, d.numero_documento, d.tipo_documento, d.importe_total, d.importe_sin_impuestos, d.id_de_empresa, e.nombre_de_empresa, e.CIF as empresa_cif
     FROM archivos_documento a
     LEFT JOIN documentos d ON a.documento_id = d.id
     LEFT JOIN empresas e ON d.id_de_empresa = e.id
     WHERE a.ruta_archivo LIKE ? OR a.nombre_archivo LIKE ?`,
    [`%${fileName}%`, `%${fileName}%`]
  );

  // 2. Buscar en tabla actividad
  const [actividades] = await queryWithRetry(
    `SELECT * FROM actividad 
     WHERE documento_nombre LIKE ? OR upload_id LIKE ? OR file_path LIKE ?
     ORDER BY created_at DESC LIMIT 5`,
    [`%${fileName}%`, `%${fileName}%`, `%${fileName}%`]
  );

  console.log("--- 1. REGISTROS DE INGESTIÓN (ACTIVIDAD) ---");
  if (actividades.length === 0) {
    console.log("⚠️ No se encontraron registros en la tabla 'actividad' para este archivo.");
  } else {
    for (const act of actividades) {
      console.log(`  🔹 Upload ID: ${act.upload_id}`);
      console.log(`     Status: ${act.status} | Step: ${act.step} | Progress: ${act.progress}%`);
      console.log(`     Empresa ID: ${act.id_de_empresa} | Doc ID: ${act.documento_id ?? 'N/A'}`);
      console.log(`     Mensaje: ${act.mensaje || 'N/A'}`);
      if (act.error_detalle) console.log(`     Error Detalle: ${act.error_detalle}`);
    }
  }
  console.log("");

  console.log("--- 2. DOCUMENTO PERSISTIDO (DOCUMENTOS / ARCHIVOS) ---");
  if (archivos.length === 0) {
    console.log("⚠️ El archivo no se ha encontrado en la tabla 'archivos_documento'.");
  } else {
    for (const arc of archivos) {
      const docId = arc.documento_id;
      console.log(`✔ Documento ID: ${docId}`);
      console.log(`   Empresa ID: ${arc.id_de_empresa} (${arc.nombre_de_empresa || 'Sin Nombre'})`);
      console.log(`   Tipo Documento: ${arc.tipo_documento || 'No especificado'}`);
      console.log(`   N° Documento: ${arc.numero_documento || 'Sin número'}`);
      console.log(`   Importe Total: ${arc.importe_total ?? 'N/A'} € (Base: ${arc.importe_sin_impuestos ?? 'N/A'} €)`);
      console.log(`   Fecha Subida: ${arc.fecha_subida}`);

      // Entidades desencriptadas via Prisma
      const entidades = await prisma.entidades_documento.findMany({
        where: { documento_id: BigInt(docId) }
      });

      console.log(`\n   👥 Entidades asociadas (${entidades.length}):`);
      let proveedorCIF = null;
      let receptorCIF = null;

      for (const ent of entidades) {
        console.log(`     - [Rol: ${ent.rol.toUpperCase()}] ID: ${ent.id} | Nombre: "${ent.nombre || 'N/A'}" | CIF/NIF: "${ent.identificador_fiscal || 'N/A'}"`);
        if (ent.rol.toLowerCase() === 'proveedor' || ent.rol.toLowerCase() === 'emisor') {
          proveedorCIF = ent.identificador_fiscal;
        }
        if (ent.rol.toLowerCase() === 'receptor' || ent.rol.toLowerCase() === 'cliente') {
          receptorCIF = ent.identificador_fiscal;
        }
      }

      // Evaluación de Consistencia de CIFs
      console.log(`\n   ⚖️ EVALUACIÓN DE CONSISTENCIA DE CIF:`);
      console.log(`      - CIF Proveedor: "${proveedorCIF}"`);
      console.log(`      - CIF Receptor:  "${receptorCIF}"`);

      if (proveedorCIF && receptorCIF && proveedorCIF.trim().toUpperCase() === receptorCIF.trim().toUpperCase()) {
        console.log(`      ⚠️ [ALERTA DE CONSISTENCIA] ¡El CIF del Proveedor y Receptor coinciden exactamente! (${proveedorCIF})`);
        console.log(`         Esto suele indicar una autocorregida de emisor/receptor o una factura emitida/recibida confusa.`);
      } else {
        console.log(`      ✔ [OK] Los CIFs son distintos o uno de ellos no está definido.`);
      }

      // Incidencias del documento
      const incidencias = await prisma.incidencias_documento.findMany({
        where: { documento_id: BigInt(docId) }
      });

      console.log(`\n   ⚠️ Incidencias registradas (${incidencias.length}):`);
      if (incidencias.length === 0) {
        console.log(`      ✔ [OK] Sin incidencias registradas en 'incidencias_documento'.`);
      } else {
        for (const inc of incidencias) {
          console.log(`      - [${inc.validado ? 'RESUELTA' : 'PENDIENTE'}] Desc: ${inc.descripcion}`);
        }
      }

      // Health checks
      const [health] = await queryWithRetry(
        `SELECT * FROM health_check_status WHERE documento_id = ?`,
        [docId]
      );
      if (health.length > 0) {
        console.log(`\n   🏥 Health Check Status: verified=${health[0].verified} | check_type=${health[0].check_type} | motivo=${health[0].motivo}`);
      }
    }
  }

  process.exit(0);
}

run().catch(err => {
  console.error("❌ Error analizando documento:", err);
  process.exit(1);
});
