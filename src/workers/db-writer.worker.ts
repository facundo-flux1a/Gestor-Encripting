/**
 * src/workers/db-writer.worker.ts
 *
 * Worker responsable de la persistencia atómica en Prisma.
 * Recibe el JSON normalizado (con keys lowercase, valores en MAYÚSCULAS)
 * del GeminiWorker y escribe en la base de datos.
 *
 * Esquema de aiResult esperado (output de PROMPT_EXTRACTOR_FACTURABLE):
 *   aiResult.tipo_documento           → string  ("FACTURA RECIBIDA", "TICKET", "(sin confirmar)", etc.)
 *   aiResult.categoria_principal      → string
 *   aiResult.subcategoria             → string
 *   aiResult.incidencia               → boolean
 *   aiResult.descripcion_incidencia   → string
 *   aiResult.empresa_emisora          → { nombre, cif, direccion, telefono, email }
 *   aiResult.cliente                  → { nombre, cif, direccion, numero_cliente, punto_venta }
 *   aiResult.documento                → { numero_documento, fecha_emision, importe_total, importe_sin_iva, forma_pago, fecha_vencimiento }
 *   aiResult.lineas                   → [ { albaran, fecha_albaran, articulos: [ { codigo, descripcion, cantidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea } ] } ]
 *   aiResult.totales_por_impuesto     → [ { tipo_iva, porcentaje, base_imponible, cuota_iva, total_con_iva } ]
 *   aiResult.metadatos                → { remitente, destinatario, numero_referencia, estado, periodo_fiscal }
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { dbWriterQueue, DbWriterJobData, DB_WRITER_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, updateParentProgress } from '@/lib/ingestion-progress';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { calcularTrimestreExtendido } from '@/lib/trimestre-utils';

const DB_WRITER_CONCURRENCY = parseInt(process.env.DB_WRITER_CONCURRENCY || '10', 10);

function getSha256(text: string | null | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

export function startDbWriterWorker() {
  const worker = new Worker<DbWriterJobData>(
    DB_WRITER_QUEUE_NAME,
    async (job: Job<DbWriterJobData>) => {
      const { ingestion, aiResult } = job.data;
      const { uploadId, fileName, empresaId } = ingestion;

      console.log(`[DbWriterWorker] 💾 Iniciando guardado para ${fileName} (Job: ${job.id})`);

      try {
        await updateIngestionProgress(uploadId, {
          status: 'procesando',
          step: 'Guardando en BD',
          progress: 90,
          mensaje: 'Escribiendo registros fiscales y entidades...',
        });

        // =====================================================================
        // GUARDIA DE DATOS VACÍOS (anti-zombi)
        // Verifica que el aiResult tenga al menos campos mínimos de un documento.
        // "sin confirmar" es un resultado válido (incidencia, pero se guarda igual).
        // =====================================================================
        const hasData = aiResult && (
          aiResult.TIPO_DOCUMENTO ||
          aiResult.EMPRESA_EMISORA?.NOMBRE ||
          aiResult.EMPRESA_RECEPTORA?.NOMBRE ||
          (aiResult.IMPORTE_TOTAL !== undefined)
        );

        if (!hasData) {
          console.error(`[DbWriterWorker] 🚫 Job ${job.id} rechazado: aiResult vacío o sin datos reales. Job fantasma descartado.`);
          await updateIngestionProgress(uploadId, {
            status: 'Fallido',
            step: 'Error de datos',
            progress: 0,
            mensaje: 'Error interno: el job llegó sin datos de extracción. Reintentar la subida.',
          }).catch(() => {});
          throw new Error('aiResult vacío — job fantasma descartado');
        }

        // =====================================================================
        // PREPARACIÓN DE DATOS
        // =====================================================================

        // 1. Tipo de documento y clasificación emitida/recibida
        const tipoDocumento = (aiResult.TIPO_DOCUMENTO || 'SIN CLASIFICAR').toString().toUpperCase();
        const isAbono = tipoDocumento.includes('ABONO') || tipoDocumento.includes('RECTIFICATIVA');
        const multiplicador = isAbono ? -1 : 1;

        // 2. Importes
        const importeTotal    = (Number(aiResult.IMPORTE_TOTAL) || 0) * multiplicador;
        const importeSinIva   = (Number(aiResult.IMPORTE_SIN_IMPUESTOS) || 0) * multiplicador;
        const numeroDocumento = aiResult.NUMERO_DOCUMENTO || `Doc-${Date.now()}`;
        const fechaEmisionRaw = aiResult.FECHA_EMISION || null;
        const fechaEmision    = fechaEmisionRaw ? new Date(fechaEmisionRaw) : new Date();
        const fechaVencimientoRaw = aiResult.FECHA_VENCIMIENTO || null;
        const fechaVencimiento = fechaVencimientoRaw ? new Date(fechaVencimientoRaw) : null;

        // 3. Trimestre fiscal
        // n8n usaba la fecha de hoy para calcular el trimestre de subida, pero lo correcto 
        // a nivel contable es fecha_emision. Lo mantendremos en fecha_emision pero
        // usaremos calcularTrimestreExtendido para compatibilidad.
        const trimestreDataRaw = calcularTrimestreExtendido(fechaEmision);
        const trimestreData = {
          ano_trimestre: trimestreDataRaw.año,
          num_trimestre: trimestreDataRaw.trimestre,
        };

        console.log(`[DbWriterWorker] 📊 ${fileName} | Base: ${importeSinIva} | Total: ${importeTotal} | Trimestre: ${trimestreData.num_trimestre}/${trimestreData.ano_trimestre}`);

        // 4. Entidades
        const emisor   = aiResult.EMPRESA_EMISORA || {};
        const receptor = aiResult.EMPRESA_RECEPTORA || {};

        // Determinar rol de cada entidad según tipo_documento
        const esEmitida  = tipoDocumento.includes('EMITIDA') || tipoDocumento.includes('EMITIDO');
        const esRecibida = tipoDocumento.includes('RECIBIDA') || tipoDocumento.includes('RECIBIDO');
        const isSinConfirmar = !esEmitida && !esRecibida;
        
        const rolEmisor  = esEmitida || isSinConfirmar ? 'emisor'   : 'proveedor';
        const rolReceptor= esEmitida || isSinConfirmar ? 'cliente'  : 'receptor';
        
        // Determinar CIF del documento para mostrar en Dashboard
        // Si es emitida o indeterminada, usamos el del cliente/receptor. Si es recibida, el del emisor/proveedor.
        const cifDocumento = (esEmitida || isSinConfirmar ? receptor.CIF : emisor.CIF) || '';

        // =====================================================================
        // TRANSACCIÓN ATÓMICA DE PRISMA
        // =====================================================================

        console.log(`[DbWriterWorker] ⏳ [Paso 1/5] Iniciando transacción Prisma para ${fileName}...`);
        await prisma.$transaction(async (tx) => {

          console.log(`[DbWriterWorker] 📝 [Paso 2/5] Creando registro principal del documento...`);
          const doc = await tx.documentos.create({
            data: {
              file_hash: ingestion.fileHash,
              tipo_documento: tipoDocumento,
              numero_documento: numeroDocumento,
              fecha_emision: fechaEmision,
              fecha_vencimiento: fechaVencimiento,
              importe_total: importeTotal,
              importe_sin_impuestos: importeSinIva,
              moneda: (aiResult.MONEDA || 'EUR').toString().toUpperCase(),
              id_de_empresa: BigInt(empresaId),
              is_new: 1,
              trimestre_cerrado: false,
              enviado_sii: false,
              año_trimestre: trimestreData.ano_trimestre,
              num_trimestre: trimestreData.num_trimestre,
              dashboard_correo: ingestion.origen || 'dashboard',
              datos_extra: {
                categoria: aiResult.CATEGORIA_PRINCIPAL || '',
                subcategoria: aiResult.SUBCATEGORIA || '',
                forma_pago: aiResult.FORMA_PAGO || '',
                cif: cifDocumento,
              },
            }
          });

          // 5. Vincular archivo
          await tx.archivos_documento.create({
            data: {
              documento_id: doc.id,
              nombre_archivo: ingestion.originalFileName,
              ruta_archivo: ingestion.publicUrl,
              tipo_archivo: ingestion.fileExtension,
              id_de_empresa: BigInt(empresaId),
            }
          });

          console.log(`[DbWriterWorker] 🏢 [Paso 3/5] Documento creado (ID: ${doc.id}). Procesando entidades (emisor/receptor)...`);

          // 6. Entidad emisora
          if (emisor.NOMBRE) {
            const rawCif    = emisor.CIF    || '';
            const rawNombre = emisor.NOMBRE || '';
            const rawDir    = emisor.DIRECCION || '';
            const rawTel    = emisor.TELEFONO || '';
            const rawEmail  = emisor.EMAIL || '';
            await tx.entidades_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                rol: rolEmisor,
                nombre: rawNombre,
                identificador_fiscal: rawCif,
                direccion: rawDir || null,
                telefono: rawTel || null,
                email: rawEmail || null,
                nombre_hash: getSha256(rawNombre),
                identificador_fiscal_hash: getSha256(rawCif),
              }
            });
          }

          // 7. Entidad receptora / cliente
          if (receptor.NOMBRE) {
            const rawCif    = receptor.CIF    || '';
            const rawNombre = receptor.NOMBRE || '';
            const rawDir    = receptor.DIRECCION || '';
            const rawTel    = receptor.TELEFONO || '';
            const rawEmail  = receptor.EMAIL || '';
            await tx.entidades_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                rol: rolReceptor,
                nombre: rawNombre,
                identificador_fiscal: rawCif,
                direccion: rawDir || null,
                telefono: rawTel || null,
                email: rawEmail || null,
                nombre_hash: getSha256(rawNombre),
                identificador_fiscal_hash: getSha256(rawCif),
              }
            });
          }

          console.log(`[DbWriterWorker] 🛒 [Paso 4/5] Entidades vinculadas. Procesando líneas de detalle...`);

          // 8. Líneas de detalle
          const lineas = aiResult.LINEAS_PRODUCTO;
          if (lineas && Array.isArray(lineas)) {
            const lineasToInsert: any[] = [];
            for (const art of lineas) {
              const cant       = Number(art.CANTIDAD)       || 1;
              const precioUni  = Number(art.PRECIO_UNITARIO) || 0;
              const precioNeto = Number(art.PRECIO_NETO)    || precioUni;
              const importeLin = (Number(art.IMPORTE_LINEA) || (precioNeto * cant)) * multiplicador;

              lineasToInsert.push({
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: art.DESCRIPCION || 'Sin descripción',
                cantidad: cant * multiplicador,
                precio_unitario: precioUni,
                descuento_porcentaje: Number(art.DESCUENTO_PORCENTAJE) || 0,
                precio_neto: precioNeto,
                importe_linea: importeLin,
              });
            }
            if (lineasToInsert.length > 0) {
              await tx.lineas_documento.createMany({ data: lineasToInsert });
            }
          }

          console.log(`[DbWriterWorker] 💰 [Paso 5/5] Líneas guardadas. Procesando impuestos y cierre...`);

          // 9. Impuestos / IVA (DESGLOSE_IVA)
          const totales = aiResult.DESGLOSE_IVA;
          if (totales && Array.isArray(totales)) {
            const impuestosToInsert = totales.map((imp: any) => {
              const tipo   = (imp.TIPO_IVA || 'IVA').toString().toUpperCase();
              // Retenciones siempre negativas
              const esRet  = tipo === 'RETENCION' || tipo.includes('RET');
              const cuota  = esRet
                ? -Math.abs(Number(imp.CUOTA_IVA) || 0)
                : (Number(imp.CUOTA_IVA) || 0) * multiplicador;
              const base   = (Number(imp.BASE_IMPONIBLE) || 0) * (esRet ? 1 : multiplicador);

              return {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                tipo_impuesto: tipo,
                porcentaje: Number(imp.PORCENTAJE_IVA) || 0,
                base_imponible: base,
                cuota: cuota,
                total_con_impuesto: base + cuota,
              };
            });

            if (impuestosToInsert.length > 0) {
              await tx.impuestos_documento.createMany({ data: impuestosToInsert });
            }
          }

          // 10. Incidencia (si el prompt marcó incidencia: true)
          const tieneIncidencia    = aiResult.INCIDENCIA === true || aiResult.INCIDENCIA === 'TRUE';
          const descIncidencia     = (aiResult.DESCRIPCION_INCIDENCIA || '').toString().trim();

          if (tieneIncidencia) {
            const descripcionFinal = descIncidencia ||
              `Documento clasificado como "${tipoDocumento}" con incidencia detectada por el extractor.`;

            await tx.incidencias_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: descripcionFinal,
                incidencia: true,
                validado: false,
              }
            });
            console.log(`[DbWriterWorker] ⚠️ Incidencia registrada para ${fileName}: ${descripcionFinal.substring(0, 80)}...`);
          }

          console.log(`[DbWriterWorker] ✅ Transacción Prisma completada con éxito (Doc ID: ${doc.id})`);
        }, {
          maxWait: 5000,
          timeout: 10000,
        });

        // ÉXITO: marcar el hijo como completado
        await updateIngestionProgress(uploadId, {
          status: 'Completado',
          step: 'Guardado',
          progress: 100,
          mensaje: `Documento procesado y guardado correctamente.`,
        });

        // Si este job es un hijo de un lote, propagar el progreso al padre.
        // updateIngestionProgress ya llama a updateParentProgress internamente,
        // pero lo llamamos explícitamente aquí también para garantizar que el
        // padre siempre refleje el estado actualizado del lote en la UI.
        if (ingestion.parentUploadId) {
          await updateParentProgress(ingestion.parentUploadId).catch(() => {});
          console.log(`[DbWriterWorker] 📡 Progreso propagado al padre: ${ingestion.parentUploadId}`);
        }

      } catch (error: any) {
        console.error(`[DbWriterWorker] ❌ Error en job ${job.id} (${fileName}):`, error.message);
        console.error(error.stack);

        await updateIngestionProgress(uploadId, {
          status: 'Fallido',
          step: 'Error guardando en base de datos',
          progress: 0,
          mensaje: `Error al guardar en base de datos: ${error.message}`,
        }).catch(() => {});

        throw error;
      }
    },
    {
      connection: redis,
      concurrency: DB_WRITER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => console.log(`[DbWriterWorker] ✅ Job completado: ${job.id}`));
  worker.on('failed', (job, err) => console.error(`[DbWriterWorker] ❌ Job fallido: ${job?.id} | ${err.message}`));

  console.log(`[DbWriterWorker] 🚀 Arrancado con concurrency=${DB_WRITER_CONCURRENCY}`);
  return worker;
}
