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
import { calcularTrimestreExtendido, obtenerSiguienteTrimestreAbierto } from '@/lib/trimestre-utils';
import { wLog } from '@/lib/worker-logger';
import {
  FiscalStatus,
  FISCAL_GUARD_VERSION,
  FISCAL_GUARD_VERSION_KEY,
  FISCAL_REVISION_REASONS_KEY,
  FISCAL_STATUS_KEY,
} from '@/lib/document-fiscal-status';
import { formatGuardFailures } from '@/services/ingestion/fiscal-guards';
import { forceAbonoSign } from '@/services/duplicates/canonical';

const DB_WRITER_CONCURRENCY = parseInt(process.env.DB_WRITER_CONCURRENCY || '10', 10);

function getSha256(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/[,.]/g, '').trim();
  return crypto.createHash('sha256').update(cleanText).digest('hex');
}

export function startDbWriterWorker() {
  const worker = new Worker<DbWriterJobData>(
    DB_WRITER_QUEUE_NAME,
    async (job: Job<DbWriterJobData>) => {
      const { ingestion, aiResult, fiscalStatus, fiscalRevisionReasons } = job.data;
      const { uploadId, fileName, empresaId } = ingestion;
      const resolvedFiscalStatus =
        fiscalStatus === FiscalStatus.REVISION ? FiscalStatus.REVISION : FiscalStatus.VALIDADO;
      const revisionReasons = fiscalRevisionReasons || [];

      wLog('DbWriterWorker', `💾 Iniciando guardado: ${fileName} (Job ${job.id})`);

      try {
        await updateIngestionProgress(uploadId, {
          status: 'procesando',
          step: 'Guardando en BD',
          progress: 90,
          mensaje: 'Escribiendo registros fiscales y entidades...',
        });

        // =====================================================================
        // GUARDIA DE DATOS VACÍOS (anti-zombi)
        // =====================================================================
        const hasData = aiResult && (
          aiResult.tipo_documento ||
          aiResult.empresa_emisora?.nombre ||
          aiResult.empresa_receptora?.nombre ||
          aiResult.cliente?.nombre ||
          (aiResult.importe_total !== undefined) ||
          (aiResult.documento?.importe_total !== undefined)
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
        // PREPARACIÓN DE DATOS (Mapeo de Nuevo y Legacy Format)
        // =====================================================================

        // 1. Tipo de documento y clasificación emitida/recibida
        const rawTipo = aiResult.tipo_documento || 'SIN CLASIFICAR';
        let tipoDocumento = rawTipo.toString().toUpperCase();
        const isAbono = tipoDocumento.includes('ABONO') || tipoDocumento.includes('RECTIFICATIVA');

        // VALIDACIÓN FUERTE POR CIF (Ignorando a la IA si el CIF es exacto)
        const cleanCif = (c: any) => {
          let cif = (c || '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (cif.startsWith('ES') && cif.length > 9) {
            cif = cif.slice(2);
          }
          return cif;
        };
        const cifDashboard = cleanCif(ingestion.cif);
        const cifEmisor = cleanCif(aiResult.empresa_emisora?.cif);
        const cifCliente = cleanCif(aiResult.cliente?.cif || aiResult.empresa_receptora?.cif);

        if (cifDashboard) {
          if (cifEmisor === cifDashboard) {
            tipoDocumento = isAbono ? 'ABONO EMITIDO' : 'FACTURA EMITIDA';
            wLog('DbWriterWorker', `🔍 Clasificación forzada por CIF: EMITIDA (${cifDashboard})`);
          } else if (cifCliente === cifDashboard) {
            tipoDocumento = isAbono ? 'ABONO RECIBIDO' : 'FACTURA RECIBIDA';
            wLog('DbWriterWorker', `🔍 Clasificación forzada por CIF: RECIBIDA (${cifDashboard})`);
          }
        }

        const applySign = (n: number) => (isAbono ? forceAbonoSign(n) : n);

        // 2. Importes y Fechas (soportando anidado 'documento' o flat)
        const docInfo = aiResult.documento || {};
        const rawImporteTotal = docInfo.importe_total ?? aiResult.importe_total ?? 0;
        const rawImporteSinIva = docInfo.importe_sin_iva ?? aiResult.importe_sin_impuestos ?? 0;
        
        const importeTotal    = applySign(Number(rawImporteTotal) || 0);
        const importeSinIva   = applySign(Number(rawImporteSinIva) || 0);
        const numeroDocumento = docInfo.numero_documento || aiResult.numero_documento || `Doc-${Date.now()}`;
        const fechaEmisionRaw = docInfo.fecha_emision || aiResult.fecha_emision || null;
        const fechaEmision    = fechaEmisionRaw ? new Date(fechaEmisionRaw) : new Date();
        const fechaVencimientoRaw = docInfo.fecha_vencimiento || aiResult.fecha_vencimiento || null;
        const fechaVencimiento = fechaVencimientoRaw ? new Date(fechaVencimientoRaw) : null;
        const formaPago       = docInfo.forma_pago || aiResult.forma_pago || '';

        // 3. Trimestre fiscal
        const trimestreDataRaw = calcularTrimestreExtendido(fechaEmision);
        
        console.log(`[DbWriterWorker] 📊 ${fileName} | Trimestre inicial calculado: ${trimestreDataRaw.trimestre}/${trimestreDataRaw.año} (Fecha emisión: ${fechaEmision.toISOString().split('T')[0]})`);
        
        // Buscar el trimestre abierto (hasta 10 años adelante)
        const trimestreData = await obtenerSiguienteTrimestreAbierto(
          trimestreDataRaw.año,
          trimestreDataRaw.trimestre,
          Number(empresaId), // Convertir a number para la query
          null // No tenemos userId en el worker, pero empresaId es suficiente
        );

        console.log(`[DbWriterWorker] 📊 ${fileName} | Base: ${importeSinIva} | Total: ${importeTotal} | Trimestre Asignado: ${trimestreData.trimestre}/${trimestreData.año}`);

        // 4. Entidades
        const emisor   = aiResult.empresa_emisora || {};
        const receptor = aiResult.cliente || aiResult.empresa_receptora || {};

        // Determinar rol de cada entidad según tipo_documento
        const esEmitida  = tipoDocumento.includes('EMITIDA') || tipoDocumento.includes('EMITIDO');
        const esRecibida = tipoDocumento.includes('RECIBIDA') || tipoDocumento.includes('RECIBIDO');
        const isSinConfirmar = !esEmitida && !esRecibida;
        
        const rolEmisor  = esEmitida || isSinConfirmar ? 'emisor'   : 'proveedor';
        const rolReceptor= esEmitida || isSinConfirmar ? 'cliente'  : 'receptor';
        
        // Determinar CIF del documento para mostrar en Dashboard
        // Si es emitida o indeterminada, usamos el del cliente/receptor. Si es recibida, el del emisor/proveedor.
        const cifDocumento = (esEmitida || isSinConfirmar ? receptor.cif : emisor.cif) || '';

        // =====================================================================
        // TRANSACCIÓN ATÓMICA DE PRISMA
        // =====================================================================

        console.log(`[DbWriterWorker] ⏳ [Paso 1/5] Iniciando transacción Prisma para ${fileName}...`);
        let savedDocumentoId: bigint | null = null;
        await prisma.$transaction(async (tx: any) => {

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
              moneda: (aiResult.moneda || 'EUR').toString().toUpperCase(),
              id_de_empresa: BigInt(empresaId),
              is_new: 1,
              trimestre_cerrado: false,
              enviado_sii: false,
              año_trimestre: trimestreData.año,
              num_trimestre: trimestreData.trimestre,
              dashboard_correo: ingestion.origen || 'dashboard',
              datos_extra: {
                categoria: aiResult.categoria_principal || aiResult.categoria_documento || '',
                subcategoria: aiResult.subcategoria || '',
                forma_pago: formaPago,
                cif: cifDocumento,
                valor_referencia_no_fiscal: aiResult.valor_referencia_no_fiscal || '',
                concepto_valor_referencia: aiResult.concepto_valor_referencia || '',
                [FISCAL_STATUS_KEY]: resolvedFiscalStatus,
                [FISCAL_GUARD_VERSION_KEY]: FISCAL_GUARD_VERSION,
                ...(revisionReasons.length > 0
                  ? { [FISCAL_REVISION_REASONS_KEY]: revisionReasons }
                  : {}),
              },
            }
          });
          savedDocumentoId = doc.id;

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
          if (emisor.nombre) {
            const rawCif    = cleanCif(emisor.cif)    || '';
            const rawNombre = emisor.nombre || '';
            const rawDir    = emisor.direccion || '';
            const rawTel    = emisor.telefono || '';
            const rawEmail  = emisor.email || '';
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
          if (receptor.nombre) {
            const rawCif    = cleanCif(receptor.cif)    || '';
            const rawNombre = receptor.nombre || '';
            const rawDir    = receptor.direccion || '';
            const rawTel    = receptor.telefono || '';
            const rawEmail  = receptor.email || '';
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
          const lineas = aiResult.lineas || aiResult.lineas_producto;
          if (lineas && Array.isArray(lineas)) {
            const lineasToInsert: any[] = [];
            // Soportar array directo de artículos (legacy) o agrupados por albarán (nuevo)
            const articulosList = [];
            for (const item of lineas) {
              if (item.articulos && Array.isArray(item.articulos)) {
                articulosList.push(...item.articulos); // Nuevo formato
              } else {
                articulosList.push(item); // Legacy format
              }
            }

            for (const art of articulosList) {
              const cant       = Number(art.cantidad)       || 1;
              const precioUni  = Number(art.precio_unitario) || 0;
              const precioNeto = Number(art.precio_neto)    || precioUni;
              const importeLin = applySign(Number(art.importe_linea) || (precioNeto * cant));

              lineasToInsert.push({
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: art.descripcion || 'Sin descripción',
                cantidad: isAbono ? -Math.abs(cant) : cant,
                precio_unitario: precioUni,
                descuento_porcentaje: Number(art.descuento_porcentaje) || 0,
                precio_neto: precioNeto,
                importe_linea: importeLin,
              });
            }
            if (lineasToInsert.length > 0) {
              await tx.lineas_documento.createMany({ data: lineasToInsert });
            }
          }

          console.log(`[DbWriterWorker] 💰 [Paso 5/5] Líneas guardadas. Procesando impuestos y cierre...`);

          // 9. Impuestos / IVA (nuevo: totales_por_impuesto, legacy: desglose_iva)
          const totales = aiResult.totales_por_impuesto || aiResult.desglose_iva;
          if (totales && Array.isArray(totales)) {
            const impuestosToInsert = totales.map((imp: any) => {
              const tipo   = (imp.tipo_iva || 'IVA').toString().toUpperCase();
              // Retenciones siempre negativas
              const esRet  = tipo === 'RETENCION' || tipo.includes('RET');
              const cuota  = esRet
                ? -Math.abs(Number(imp.cuota_iva) || 0)
                : applySign(Number(imp.cuota_iva) || 0);
              const base   = esRet
                ? (Number(imp.base_imponible) || 0)
                : applySign(Number(imp.base_imponible) || 0);
              const porcentaje = Number(imp.porcentaje) || Number(imp.porcentaje_iva) || 0;

              return {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                tipo_impuesto: tipo,
                porcentaje: porcentaje,
                base_imponible: base,
                cuota: cuota,
                total_con_impuesto: base + cuota,
              };
            });

            if (impuestosToInsert.length > 0) {
              await tx.impuestos_documento.createMany({ data: impuestosToInsert });
            }
          }

          // 10. Incidencia: guards en REVISION y/o incidencia blanda del extractor
          const rawIncidencia = aiResult.incidencia;
          const tieneIncidenciaBlanda =
            rawIncidencia === true || String(rawIncidencia).toUpperCase() === 'TRUE';
          const descIncidencia = (aiResult.descripcion_incidencia || '').toString().trim();
          const enRevision = resolvedFiscalStatus === FiscalStatus.REVISION;

          if (enRevision || tieneIncidenciaBlanda) {
            const descripcionFinal = enRevision
              ? `REVISION fiscal: ${formatGuardFailures(revisionReasons as any) || descIncidencia || 'fallo de validación dura'}`
              : descIncidencia ||
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

        // ÉXITO: marcar el hijo como completado (VALIDADO o REVISION — archivo siempre queda)
        await updateIngestionProgress(uploadId, {
          status: 'Completado',
          step: resolvedFiscalStatus === FiscalStatus.REVISION ? 'Guardado en revisión' : 'Guardado',
          progress: 100,
          mensaje:
            resolvedFiscalStatus === FiscalStatus.REVISION
              ? 'Documento guardado en REVISIÓN (excluido de agregados hasta corregir).'
              : 'Documento procesado y validado correctamente.',
          documentoId: savedDocumentoId ?? undefined,
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
        // ─── Duplicado detectado ────────────────────────────────────────────────
        // El constraint unique_hash_empresa evita insertar el mismo archivo dos veces
        // para la misma empresa. Esto ocurre en reintentos de BullMQ cuando el 1er
        // intento insertó el documento pero falló *después* (ej: al guardar entidades).
        // En ese caso NO es un error real: el doc ya está guardado. Lo marcamos como
        // Completado para evitar el bucle de reintentos.
        const isDuplicate =
          error?.code === 'P2002' ||
          (error?.message || '').includes('unique_hash_empresa') ||
          (error?.message || '').includes('Unique constraint');

        if (isDuplicate) {
          wLog('DbWriterWorker', `⚠️ Duplicado: ${fileName} ya existe en BD — marcado como Completado`, 'warn');
          await updateIngestionProgress(uploadId, {
            status: 'Completado',
            step: 'Guardado (duplicado ignorado)',
            progress: 100,
            mensaje: 'Documento ya procesado anteriormente. Registro existente conservado.',
          }).catch(() => {});

          if (ingestion.parentUploadId) {
            await updateParentProgress(ingestion.parentUploadId).catch(() => {});
          }
          // Retornar sin throw para que BullMQ marque el job como completado
          return;
        }

        // ─── Error real ──────────────────────────────────────────────────────────
        wLog('DbWriterWorker', `❌ Error en job ${job.id} (${fileName}): ${error.message}`, 'error');
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

  worker.on('completed', (job) => {
    console.log(`[DbWriterWorker] ✅ Job completado: ${job.id}`);
    wLog('DbWriterWorker', `✅ Guardado OK: ${job.id}`, 'success');
  });
  worker.on('failed', (job, err) => {
    console.error(`[DbWriterWorker] ❌ Job fallido: ${job?.id} | ${err.message}`);
    wLog('DbWriterWorker', `❌ Fallido: ${job?.id} — ${err.message}`, 'error');
  });

  console.log(`[DbWriterWorker] 🚀 Arrancado con concurrency=${DB_WRITER_CONCURRENCY}`);
  return worker;
}
