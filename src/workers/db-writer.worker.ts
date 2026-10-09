/**
 * src/workers/db-writer.worker.ts
 *
 * Worker responsable de la persistencia atómica en Prisma.
 * Recibe el JSON normalizado (con keys lowercase, valores en MAYÚSCULAS)
 * del ExtractionWorker y escribe en la base de datos.
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
import connection, { dbName } from '@/lib/db';
import { calcularTrimestreExtendido, obtenerPrimerTrimestreAbiertoDelAnio, parseFechaLocal, parseFechaLocalNullable, resolverTrimestreContableImportacion } from '@/lib/trimestre-utils';
import { wLog } from '@/lib/worker-logger';
import {
  FiscalStatus,
  FISCAL_GUARD_VERSION,
  FISCAL_GUARD_VERSION_KEY,
  FISCAL_REVISION_REASONS_KEY,
  FISCAL_STATUS_KEY,
} from '@/lib/document-fiscal-status';
import { evaluarFechaContable } from '@/lib/fecha-contable-utils';
import { formatGuardFailures } from '@/services/ingestion/fiscal-guards';
import { normalizeCIF, detectCountryFromCIF, normalizeInvoiceNumber } from '@/services/ingestion/normalize';
import { forceAbonoSign } from '@/services/duplicates/canonical';
import { createNotification, getUserIdsForEmpresa } from '@/services/notification-service';
import { checkAndNotifyPriceVariation } from '@/services/price-variation-checker';

const DB_WRITER_CONCURRENCY = parseInt(process.env.DB_WRITER_CONCURRENCY || '10', 10);

function getSha256(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/[,.]/g, '').trim();
  return crypto.createHash('sha256').update(cleanText).digest('hex');
}

/**
 * Devuelve la cuenta contable estándar sugerida para un impuesto.
 * No escribe en BD — es solo una sugerencia que el user valida en la UI.
 */
function resolveCC(tipo: string, porcentaje: number, esEmitida: boolean): string | null {
  const t = tipo.toUpperCase();
  const base = esEmitida ? '477' : '472';
  if (t === 'RETENCION' || t.includes('IRPF') || t.includes('RET')) {
    return esEmitida ? '4730000' : '4751000';
  }
  if (t === 'IVA' || t.includes('IVA')) {
    const pct = Math.round(porcentaje);
    return `${base}000${pct.toString().padStart(2, '0')}`;
  }
  if (t === 'RECARGO' || t.includes('RECARGO')) {
    const pct = Math.round(porcentaje);
    return `${base}000${pct.toString().padStart(2, '0')}`;
  }
  return null;
}

export function startDbWriterWorker() {
  const worker = new Worker<DbWriterJobData>(
    DB_WRITER_QUEUE_NAME,
    async (job: Job<DbWriterJobData>) => {
      const { ingestion, fiscalStatus, fiscalRevisionReasons, verifactu } = job.data;
      let aiResult = job.data.aiResult;
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
        // GUARDIA DE DATOS VACÍOS (FALTA TODO → Registrar en Revisión)
        // =====================================================================
        const hasAnyData = aiResult && Boolean(
          aiResult.tipo_documento ||
          aiResult.empresa_emisora?.nombre ||
          aiResult.empresa_emisora?.cif ||
          aiResult.empresa_receptora?.nombre ||
          aiResult.empresa_receptora?.cif ||
          aiResult.cliente?.nombre ||
          aiResult.cliente?.cif ||
          aiResult.documento?.numero_documento ||
          aiResult.numero_documento ||
          (aiResult.importe_total && Number(aiResult.importe_total) > 0) ||
          (aiResult.documento?.importe_total && Number(aiResult.documento?.importe_total) > 0) ||
          (Array.isArray(aiResult.lineas) && aiResult.lineas.length > 0)
        );

        if (!hasAnyData) {
          console.warn(`[DbWriterWorker] ⚠️ Sin datos utilizables para ${ingestion.fileName}. Guardando registro en Revisión por falta total de datos.`);
          aiResult = {
            es_facturable: Boolean(aiResult?.es_facturable),
            es_multiple: false,
            tipo_documento: 'DOCUMENTO SIN CLASIFICAR',
            categoria_principal: 'General / Miscelánea',
            subcategoria: 'Sin Clasificar',
            incidencia: true,
            descripcion_incidencia: 'El agente de IA no ha encontrado información legible para extraer en este archivo.',
            tipos_incidencia: ['sin_informacion_extraible'],
            empresa_emisora: { nombre: '', cif: '' },
            cliente: { nombre: '', cif: '' },
            documento: { numero_documento: '', importe_total: 0, importe_sin_iva: 0 }
          };
        }

        // =====================================================================
        // CARRIL RÁPIDO: NO FACTURABLES (es_facturable === false)
        // Bypass total del pipeline de facturas: no corre guards, no exige CIF,
        // no valida importes. Se guarda limpiamente con su categoría.
        // =====================================================================
        if (aiResult.es_facturable === false) {
          // Priorizar categoria_principal (el campo que usa el prompt de no-facturables)
          // con fallback a categoria_documento. Si ninguno encaja con las 8 categorías
          // predefinidas del sistema, cae en "No clasificado".
          const CATEGORIAS_VALIDAS = [
            'Fiscal y Contable',
            'Legal y Societario',
            'Laboral y RR.HH.',
            'Bancos y Financiación',
            'Clientes',
            'Proveedores',
            'Administración Pública',
            'Interno / Operaciones',
          ];
          const rawCategoria = (aiResult.categoria_principal || aiResult.categoria_documento || '').toString().trim();
          const categoria = CATEGORIAS_VALIDAS.includes(rawCategoria) ? rawCategoria : 'No clasificado';
          const tipoDocNF = (aiResult.tipo_documento || aiResult.tipo || 'DOCUMENTO NO FACTURABLE').toString().toUpperCase();

          wLog('DbWriterWorker', `📂 No facturable → categoría: "${categoria}" | tipo: "${tipoDocNF}": ${fileName}`);

          let savedNoFactId: bigint | null = null;
          await prisma.$transaction(async (tx: any) => {
            const docNF = await tx.documentos.create({
              data: {
                file_hash: ingestion.fileHash,
                tipo_documento: tipoDocNF,
                numero_documento: (aiResult.documento?.numero_documento || aiResult.numero_documento || `NF-${Date.now()}`).toString(),
                numero_documento_normalizado: `NF-${Date.now()}`,
                fecha_emision: null,
                fecha_vencimiento: null,
                importe_total: 0,
                importe_sin_impuestos: 0,
                moneda: 'EUR',
                id_de_empresa: BigInt(empresaId),
                is_new: 1,
                trimestre_cerrado: false,
                enviado_sii: false,
                dashboard_correo: ingestion.origen || 'dashboard',
                datos_extra: {
                  es_facturable: false,
                  categoria_documento: categoria, // una de las 8 categorías válidas o 'No clasificado'
                  subcategoria: aiResult.subcategoria || '',
                  valor_referencia_no_fiscal: aiResult.valor_referencia_no_fiscal || 0,
                  concepto_valor_referencia: aiResult.concepto_valor_referencia || '',
                },
              }
            });
            savedNoFactId = docNF.id;

            await tx.archivos_documento.create({
              data: {
                documento_id: docNF.id,
                nombre_archivo: ingestion.originalFileName,
                ruta_archivo: ingestion.publicUrl,
                tipo_archivo: ingestion.fileExtension,
                id_de_empresa: BigInt(empresaId),
              }
            });
          }, { maxWait: 10000, timeout: 30000 });

          if (savedNoFactId) {
            await updateIngestionProgress(uploadId, {
              status: 'Completado',
              step: 'Guardado',
              progress: 100,
              mensaje: `Documento no facturable guardado como "${categoria}".`,
              documentoId: savedNoFactId ?? undefined,
            });
            if (ingestion.parentUploadId) await updateParentProgress(ingestion.parentUploadId).catch(() => {});
          }
          return; // salir del job limpiamente
        }

        // =====================================================================
        // PREPARACIÓN DE DATOS (Mapeo de Nuevo y Legacy Format)
        // =====================================================================

        // 1. Tipo de documento y clasificación emitida/recibida
        const rawTipo = aiResult.tipo_documento || 'SIN CLASIFICAR';
        let tipoDocumento = rawTipo.toString().toUpperCase();
        const isAbono = tipoDocumento.includes('ABONO') || tipoDocumento.includes('RECTIFICATIVA');
        const esTicketDoc = tipoDocumento.includes('TICKET');

        // Normalización CIF/NIF/NIE (espacios, ES, paréntesis OCR, etc.)
        // IMPORTANTE: detectCountryFromCIF debe correr ANTES de cleanCif (que quita el prefijo 'ES')
        const rawCifEmisor = aiResult.empresa_emisora?.cif ?? null;
        const countryInfo = detectCountryFromCIF(rawCifEmisor ? String(rawCifEmisor) : null);

        const cleanCif = (c: unknown): string => normalizeCIF(c == null ? null : String(c)) ?? '';
        const cifDashboard = cleanCif(ingestion.cif);
        const cifEmisor = cleanCif(aiResult.empresa_emisora?.cif);
        const cifCliente = cleanCif(aiResult.cliente?.cif || aiResult.empresa_receptora?.cif);

        // Persistir CIFs limpios en el payload (evita basura OCR en BD e incidencias)
        if (aiResult.empresa_emisora && cifEmisor) aiResult.empresa_emisora.cif = cifEmisor;
        if (aiResult.cliente && cifCliente) aiResult.cliente.cif = cifCliente;
        if (aiResult.empresa_receptora && cifCliente) aiResult.empresa_receptora.cif = cifCliente;

        if (cifDashboard) {
          if (cifEmisor === cifDashboard) {
            tipoDocumento = isAbono ? 'ABONO EMITIDO' : 'FACTURA EMITIDA';
            wLog('DbWriterWorker', `🔍 Clasificación forzada por CIF: EMITIDA (${cifDashboard})`);
          } else if (cifCliente === cifDashboard) {
            tipoDocumento = isAbono ? 'ABONO RECIBIDO' : 'FACTURA RECIBIDA';
            wLog('DbWriterWorker', `🔍 Clasificación forzada por CIF: RECIBIDA (${cifDashboard})`);
          } else if (!esTicketDoc && !tipoDocumento.includes('SIN CONFIRMAR')) {
            // Tickets nunca llevan (SIN CONFIRMAR): no tienen CIF receptor por diseño
            tipoDocumento = `${tipoDocumento} (SIN CONFIRMAR)`;
            wLog('DbWriterWorker', `⚠️ CIF no coincide con empresa — marcado sin confirmar`);
          }
        }

        const applySign = (n: number) => (isAbono ? forceAbonoSign(n) : n);

        // 2. Importes y Fechas (soportando anidado 'documento' o flat)
        const docInfo = aiResult.documento || {};
        const rawImporteTotal = docInfo.importe_total ?? aiResult.importe_total ?? 0;
        const rawImporteSinIva = docInfo.importe_sin_iva ?? aiResult.importe_sin_impuestos ?? 0;
        
        const importeTotal    = applySign(Number(rawImporteTotal) || 0);
        const importeSinIva   = applySign(Number(rawImporteSinIva) || 0);
        const rawNumDoc = (docInfo.numero_documento || aiResult.numero_documento || '').toString().trim();
        const hasRealInvoiceNumber =
          rawNumDoc.length > 0 &&
          !rawNumDoc.startsWith('Doc-') &&
          !rawNumDoc.startsWith('NF-') &&
          rawNumDoc !== '0' &&
          rawNumDoc.toUpperCase() !== 'N/A' &&
          rawNumDoc.toUpperCase() !== 'SIN NUMERO' &&
          rawNumDoc.toUpperCase() !== 'S/N';

        const numeroDocumento = hasRealInvoiceNumber ? rawNumDoc : null;
        const numeroDocumentoNorm = numeroDocumento ? (normalizeInvoiceNumber(numeroDocumento) || numeroDocumento) : null;
        const fechaEmisionRaw = docInfo.fecha_emision || aiResult.fecha_emision || null;
        const fechaEmision = parseFechaLocalNullable(fechaEmisionRaw ? String(fechaEmisionRaw) : null);
        const fechaVencimientoRaw = docInfo.fecha_vencimiento || aiResult.fecha_vencimiento || null;
        const fechaVencimiento = parseFechaLocalNullable(fechaVencimientoRaw ? String(fechaVencimientoRaw) : null);

        // ── Fecha contable (independiente del trimestre asignado) ──
        const ejercicioActual = new Date().getFullYear();
        const evalFecha = evaluarFechaContable(fechaEmisionRaw, {
          ejercicioActual,
          fechaVencimientoRaw,
        });
        if (evalFecha.requiereConfirmacion && !tipoDocumento.includes('SIN CONFIRMAR')) {
          tipoDocumento = `${tipoDocumento} (SIN CONFIRMAR)`;
          const logMotivo = evalFecha.motivosIncidencia[0]
            ?? (evalFecha.fechaAusente ? 'sin fecha contable' : 'fecha contable a revisar');
          wLog('DbWriterWorker', `📅 ${logMotivo} — requiere confirmación manual`);
        }

        const formaPago       = docInfo.forma_pago || aiResult.forma_pago || '';
        
        const descuentoGlobal = applySign(Number(docInfo.descuento_global ?? aiResult.descuento_global ?? 0));
        const baseNoSujeta    = applySign(Number(docInfo.base_no_sujeta ?? aiResult.base_no_sujeta ?? 0));

        // ── Trimestre operativo (dónde inyectar en el gestor; no sustituye validación de fecha) ──
        const trimestreNatural = fechaEmision ? calcularTrimestreExtendido(fechaEmision) : null;
        let trimestreData: { año: number; trimestre: number };
        if (fechaEmision) {
          console.log(
            `[DbWriterWorker] 📊 ${fileName} | Trimestre natural (fecha): ${trimestreNatural!.trimestre}/${trimestreNatural!.año} | Fecha: ${fechaEmision.toISOString().split('T')[0]}`
          );
          trimestreData = await resolverTrimestreContableImportacion(
            fechaEmision,
            Number(empresaId),
            null
          );
        } else {
          trimestreData = await obtenerPrimerTrimestreAbiertoDelAnio(ejercicioActual, Number(empresaId), null);
          console.log(`[DbWriterWorker] 📊 ${fileName} | Sin fecha — trimestre operativo: ${trimestreData.trimestre}/${trimestreData.año}`);
        }

        if (trimestreNatural && (trimestreNatural.año !== trimestreData.año || trimestreNatural.trimestre !== trimestreData.trimestre)) {
          console.log(
            `[DbWriterWorker] ↪️ ${fileName} | Trimestre operativo ${trimestreData.trimestre}/${trimestreData.año} (natural ${trimestreNatural.trimestre}/${trimestreNatural.año} no disponible)`
          );
        }

        console.log(`[DbWriterWorker] 📊 ${fileName} | Base: ${importeSinIva} | Total: ${importeTotal} | Trimestre Asignado: ${trimestreData.trimestre}/${trimestreData.año}`);

        // 4. Entidades
        const emisor   = aiResult.empresa_emisora || {};
        const receptor = aiResult.cliente || aiResult.empresa_receptora || {};

        // Determinar rol de cada entidad según tipo_documento
        const esEmitida  = tipoDocumento.includes('EMITIDA') || tipoDocumento.includes('EMITIDO');
        const esRecibida = tipoDocumento.includes('RECIBIDA') || tipoDocumento.includes('RECIBIDO');
        const isSinConfirmar = !esEmitida && !esRecibida && !esTicketDoc;
        const esExtranjeroRecibido = Boolean(countryInfo.isForeign && !esEmitida);
        const esIntracomunitario = Boolean(esExtranjeroRecibido && countryInfo.isEuropeanUnion);
        const esExtracomunitario = Boolean(esExtranjeroRecibido && !countryInfo.isEuropeanUnion);
        
        const rolEmisor  = esEmitida || isSinConfirmar ? 'emisor'   : 'proveedor';
        const rolReceptor= esEmitida || isSinConfirmar ? 'cliente'  : 'receptor';
        
        // Determinar CIF del documento para mostrar en Dashboard
        // Si es emitida o indeterminada, usamos el del cliente/receptor. Si es recibida, el del emisor/proveedor.
        const cifDocumento = (esEmitida || isSinConfirmar ? cifCliente : cifEmisor) || '';

        const rawTotales = aiResult.totales_por_impuesto || aiResult.desglose_iva || [];
        const impuestosOriginales = Array.isArray(rawTotales)
          ? rawTotales.map((imp: any) => ({
              tipo: (imp.tipo_iva || 'IVA').toString().toUpperCase(),
              porcentaje: Number(imp.porcentaje) || Number(imp.porcentaje_iva) || 0,
              base: Number(imp.base_imponible) || 0,
              cuota: Number(imp.cuota_iva) || 0,
            }))
          : [];

        // =====================================================================
        // DETECCIÓN DE DUPLICADO POR NÚMERO DE FACTURA
        // =====================================================================
        let duplicateMatchDoc: { id: bigint | number; numero_documento: string } | null = null;

        if (hasRealInvoiceNumber && numeroDocumento) {
          try {
            const cleanNum = numeroDocumento.toLowerCase().replace(/\s+/g, '');
            const cleanNorm = (numeroDocumentoNorm || '').toLowerCase().replace(/\s+/g, '');

            if (esEmitida) {
              const [existing] = await connection.query<any[]>(
                `SELECT d.id, d.numero_documento 
                 FROM ${dbName}.documentos d
                 WHERE d.id_de_empresa = ? 
                   AND d.numero_documento IS NOT NULL 
                   AND d.numero_documento != ''
                   AND (LOWER(REPLACE(d.numero_documento, ' ', '')) = ? OR LOWER(REPLACE(COALESCE(d.numero_documento_normalizado, ''), ' ', '')) = ?)
                   AND (LOWER(d.tipo_documento) LIKE '%emitid%')
                 ORDER BY d.id ASC
                 LIMIT 1`,
                [empresaId, cleanNum, cleanNorm || cleanNum]
              );
              if (existing && existing.length > 0) {
                duplicateMatchDoc = { id: existing[0].id, numero_documento: existing[0].numero_documento };
                wLog('DbWriterWorker', `⚠️ Duplicado por número detectado (Emitida): ${numeroDocumento} coincide con doc #${duplicateMatchDoc.id}`);
              }
            } else {
              // Recibida / Gasto: verificar contra el mismo proveedor (CIF o nombre)
              const [existing] = await connection.query<any[]>(
                `SELECT d.id, d.numero_documento,
                        e.identificador_fiscal as proveedor_cif,
                        e.identificador_fiscal_hash as proveedor_cif_hash,
                        e.nombre as proveedor_nombre,
                        e.nombre_hash as proveedor_nombre_hash
                 FROM ${dbName}.documentos d
                 LEFT JOIN ${dbName}.entidades_documento e ON (d.id = e.documento_id AND e.rol IN ('proveedor', 'emisor'))
                 WHERE d.id_de_empresa = ? 
                   AND d.numero_documento IS NOT NULL 
                   AND d.numero_documento != ''
                   AND (LOWER(REPLACE(d.numero_documento, ' ', '')) = ? OR LOWER(REPLACE(COALESCE(d.numero_documento_normalizado, ''), ' ', '')) = ?)
                   AND (LOWER(d.tipo_documento) LIKE '%recibid%' OR LOWER(d.tipo_documento) LIKE '%gasto%')
                 ORDER BY d.id ASC
                 LIMIT 5`,
                [empresaId, cleanNum, cleanNorm || cleanNum]
              );

              if (existing && existing.length > 0) {
                const currentCifClean = cleanCif(cifEmisor);
                const currentCifHash = getSha256(cifEmisor);
                const currentNombreClean = (emisor.nombre || '').toString().trim().toLowerCase();
                const currentNombreHash = getSha256(emisor.nombre);

                for (const row of existing) {
                  const rowCif = (row.proveedor_cif || '').toString().trim().toUpperCase();
                  const rowCifHash = row.proveedor_cif_hash;
                  const rowNombre = (row.proveedor_nombre || '').toString().trim().toLowerCase();
                  const rowNombreHash = row.proveedor_nombre_hash;

                  let isSameProvider = false;
                  if (currentCifClean && (rowCif || rowCifHash)) {
                    if (rowCif && rowCif === currentCifClean.toUpperCase()) isSameProvider = true;
                    if (currentCifHash && rowCifHash && currentCifHash === rowCifHash) isSameProvider = true;
                  } else if (currentNombreClean && (rowNombre || rowNombreHash)) {
                    if (rowNombre && rowNombre === currentNombreClean) isSameProvider = true;
                    if (currentNombreHash && rowNombreHash && currentNombreHash === rowNombreHash) isSameProvider = true;
                  }

                  if (isSameProvider) {
                    duplicateMatchDoc = { id: row.id, numero_documento: row.numero_documento };
                    wLog('DbWriterWorker', `⚠️ Duplicado por número detectado (Recibida): ${numeroDocumento} de proveedor coincide con doc #${duplicateMatchDoc.id}`);
                    break;
                  }
                }
              }
            }
          } catch (err: any) {
            console.warn(`[DbWriterWorker] ⚠️ Error comprobando duplicados por número (no bloqueante):`, err?.message);
          }
        }

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
              numero_documento_normalizado: numeroDocumentoNorm,
              fecha_emision: fechaEmision,
              fecha_vencimiento: fechaVencimiento,
              importe_total: importeTotal,
              importe_sin_impuestos: esExtranjeroRecibido ? importeTotal : importeSinIva,
              moneda: (aiResult.moneda || 'EUR').toString().toUpperCase(),
              id_de_empresa: BigInt(empresaId),
              is_new: 1,
              trimestre_cerrado: false,
              enviado_sii: false,
              año_trimestre: trimestreData.año,
              num_trimestre: trimestreData.trimestre,
              dashboard_correo: ingestion.origen || 'dashboard',
              datos_extra: {
                numero_documento_normalizado: numeroDocumentoNorm,
                categoria: aiResult.categoria_principal || aiResult.categoria_documento || '',
                subcategoria: aiResult.subcategoria || '',
                forma_pago: formaPago,
                cif: cifDocumento,
                valor_referencia_no_fiscal: aiResult.valor_referencia_no_fiscal || '',
                concepto_valor_referencia: aiResult.concepto_valor_referencia || '',
                descuento_global: esExtranjeroRecibido ? 0 : descuentoGlobal,
                base_no_sujeta: esExtranjeroRecibido ? 0 : baseNoSujeta,
                ...(esExtranjeroRecibido ? {
                  es_proveedor_extranjero_ue: true,
                  zona_emisor: countryInfo.region,
                  pais_emisor: countryInfo.countryCode,
                  pais_emisor_nombre: countryInfo.countryName,
                  cuenta_proveedor_sugerida: '4100000',
                  backup_fiscal_origen: {
                    importe_sin_impuestos_original: importeSinIva,
                    base_no_sujeta_original: baseNoSujeta,
                    descuento_global_original: descuentoGlobal,
                    impuestos_originales: impuestosOriginales,
                  },
                } : {}),
                ...(trimestreNatural
                  ? {
                      trimestre_natural_año: trimestreNatural.año,
                      trimestre_natural_num: trimestreNatural.trimestre,
                    }
                  : {}),
                [FISCAL_STATUS_KEY]: resolvedFiscalStatus,
                [FISCAL_GUARD_VERSION_KEY]: FISCAL_GUARD_VERSION,
                ...(revisionReasons.length > 0
                  ? { [FISCAL_REVISION_REASONS_KEY]: revisionReasons }
                  : {}),
                // ── Veri*Factu QR (si se detectó un QR válido) ───────────────────
                ...(verifactu ? {
                  verifactu_verificado: true,
                  verifactu_url: verifactu.url,
                  verifactu_campos: verifactu.params,
                  verifactu_fetch_ok: verifactu.fetchOk,
                  ...(verifactu.discrepanciaImporte ? {
                    verifactu_discrepancia_importe: verifactu.discrepanciaImporte,
                  } : {}),
                } : {}),
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
              const codigoArt  = (art.codigo_articulo || art.codigo || '').toString().trim() || null;

              lineasToInsert.push({
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                codigo: codigoArt,
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
          if (!esExtranjeroRecibido) {
            // ── Caso normal (proveedor nacional) ──────────────────────────────
            const totales = aiResult.totales_por_impuesto || aiResult.desglose_iva;
            const cuentasSugeridas: Record<string, string> = {};

            if (totales && Array.isArray(totales)) {
              const impuestosToInsert = totales.map((imp: any) => {
                const tipo   = (imp.tipo_iva || 'IVA').toString().toUpperCase();
                const esRet  = tipo === 'RETENCION' || tipo.includes('RET');
                const cuotaRaw = Number(imp.cuota_iva) || 0;
                const cuota  = esRet
                  ? (isAbono ? Math.abs(cuotaRaw) : cuotaRaw)
                  : applySign(cuotaRaw);
                const base   = esRet
                  ? (Number(imp.base_imponible) || 0)
                  : applySign(Number(imp.base_imponible) || 0);
                const porcentaje = Number(imp.porcentaje) || Number(imp.porcentaje_iva) || 0;

                // Calcular sugerencia de CC (no se escribe en BD, se guarda en datos_extra)
                const ccSugerida = resolveCC(tipo, porcentaje, esEmitida);
                if (ccSugerida) {
                  const key = `${tipo}_${Math.round(porcentaje)}`;
                  cuentasSugeridas[key] = ccSugerida;
                }

                return {
                  documento_id: doc.id,
                  id_de_empresa: BigInt(empresaId),
                  tipo_impuesto: tipo,
                  porcentaje: porcentaje,
                  base_imponible: base,
                  cuota: cuota,
                  total_con_impuesto: base + cuota,
                  // cuenta_contable queda NULL — el user la acepta/rechaza desde la UI
                };
              });

              if (impuestosToInsert.length > 0) {
                await tx.impuestos_documento.createMany({ data: impuestosToInsert });
              }
            }

            // Persistir sugerencias de CC en datos_extra del documento (para la UI)
            if (Object.keys(cuentasSugeridas).length > 0) {
              await tx.documentos.update({
                where: { id: doc.id },
                data: {
                  datos_extra: {
                    ...((doc.datos_extra as Record<string, any>) || {}),
                    cuentas_impuestos_sugeridas: cuentasSugeridas,
                  },
                },
              });
            }

          } else if (esIntracomunitario) {
            // ── Caso UE: inversión del sujeto pasivo (espejo IVA) ────────────
            // El comprador español auto-repercute el IVA: genera un IVA soportado
            // (deducible, 472) y uno repercutido (auto-repercutido, 477) que se anulan.
            // Neto fiscal = 0. Ambas filas van a impuestos_documento para el Modelo 303.
            const totales = aiResult.totales_por_impuesto || aiResult.desglose_iva;
            const paisNombre = countryInfo.countryName || countryInfo.countryCode || 'UE';
            console.log(
              `[DbWriterWorker] 🇪🇺 Proveedor intracomunitario (${paisNombre}): espejo IVA (inversión del sujeto pasivo)`
            );

            const cuentasSugeridasUE: Record<string, string> = {};

            if (totales && Array.isArray(totales) && totales.length > 0) {
              const espejoRows: any[] = [];
              for (const imp of totales) {
                const tipo = (imp.tipo_iva || 'IVA').toString().toUpperCase();
                const porcentaje = Number(imp.porcentaje) || Number(imp.porcentaje_iva) || 0;
                const base = applySign(Number(imp.base_imponible) || 0);
                const cuota = applySign(Number(imp.cuota_iva) || 0);

                // Fila soportada (deducible) — 472
                espejoRows.push({
                  documento_id: doc.id,
                  id_de_empresa: BigInt(empresaId),
                  tipo_impuesto: `${tipo}_INTRA_SOPORTADO`,
                  porcentaje,
                  base_imponible: base,
                  cuota,
                  total_con_impuesto: base + cuota,
                });
                // Fila auto-repercutida (devengada) — 477
                espejoRows.push({
                  documento_id: doc.id,
                  id_de_empresa: BigInt(empresaId),
                  tipo_impuesto: `${tipo}_INTRA_REPERCUTIDO`,
                  porcentaje,
                  base_imponible: base,
                  cuota: -cuota, // negativo: anula al soportado
                  total_con_impuesto: base - cuota,
                });

                // Sugerencias de CC para ambas filas
                cuentasSugeridasUE[`${tipo}_${Math.round(porcentaje)}_SOPORTADO`] = `472000${Math.round(porcentaje).toString().padStart(2, '0')}`;
                cuentasSugeridasUE[`${tipo}_${Math.round(porcentaje)}_REPERCUTIDO`] = `477000${Math.round(porcentaje).toString().padStart(2, '0')}`;
              }

              if (espejoRows.length > 0) {
                await tx.impuestos_documento.createMany({ data: espejoRows });
              }
            }

            // Incidencia informativa (no bloqueante, ya validada)
            const descIntra = `Proveedor intracomunitario (${paisNombre}). Se aplicó inversión del sujeto pasivo: IVA auto-repercutido (espejo 472/477). Revisar y confirmar en Modelo 303.`;
            await tx.incidencias_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: descIntra,
                incidencia: false, // informativa, no bloqueante
                validado: true,
              }
            });

            // Persistir sugerencias en datos_extra
            if (Object.keys(cuentasSugeridasUE).length > 0) {
              await tx.documentos.update({
                where: { id: doc.id },
                data: {
                  datos_extra: {
                    ...((doc.datos_extra as Record<string, any>) || {}),
                    cuentas_impuestos_sugeridas: cuentasSugeridasUE,
                  },
                },
              });
            }

          } else {
            // ── Caso extracomunitario (USA, UK, TERCER_PAIS) ─────────────────
            // IVA de origen no deducible. 100% del importe computa como gasto.
            const paisNombre = countryInfo.countryName || countryInfo.countryCode || 'Extranjero';
            const paisCodigo = countryInfo.countryCode && countryInfo.countryCode !== paisNombre ? ` (${countryInfo.countryCode})` : '';
            console.log(
              `[DbWriterWorker] 🌍 Proveedor extracomunitario (${paisNombre}): IVA no deducible — 100% gasto`
            );
            const descExtranjero = `Proveedor extracomunitario: ${paisNombre}${paisCodigo}. Factura de origen internacional no UE. El IVA de origen no es deducible en España (Modelo 303), el total computa íntegramente como base del gasto contable. Requiere validación.`;

            await tx.incidencias_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: descExtranjero,
                incidencia: true,
                validado: false,
              }
            });
          }

          // 10. Incidencia: guards en REVISION, extractor blando, fecha ausente o ejercicio anterior
          const rawIncidencia = aiResult.incidencia;
          const tieneIncidenciaBlanda =
            rawIncidencia === true || String(rawIncidencia).toUpperCase() === 'TRUE';
          const descIncidencia = (aiResult.descripcion_incidencia || '').toString().trim();
          const enRevision = resolvedFiscalStatus === FiscalStatus.REVISION;
          const incidenciasFecha = evalFecha.motivosIncidencia;

          if (enRevision || tieneIncidenciaBlanda || incidenciasFecha.length > 0) {
            // Combinar TODOS los motivos encontrados en lugar de usar prioridad excluyente
            const motivosParts: string[] = [];

            if (enRevision) {
              const guardText = formatGuardFailures(revisionReasons as any) || 'fallo de validación dura';
              // Incluir la explicación del LLM/normalizer si aporta contexto extra al guard
              const aiExplain = descIncidencia && !guardText.toLowerCase().includes(descIncidencia.substring(0, 30).toLowerCase())
                ? ` — ${descIncidencia}`
                : '';
              motivosParts.push(`REVISION fiscal: ${guardText}${aiExplain}`);
            }

            if (incidenciasFecha.length > 0) {
              motivosParts.push(incidenciasFecha.join(' '));
            }

            if (!enRevision && descIncidencia) {
              motivosParts.push(descIncidencia);
            } else if (!enRevision && !incidenciasFecha.length) {
              motivosParts.push(
                `Documento clasificado como "${tipoDocumento}" con incidencia detectada por el extractor.`
              );
            }

            const descripcionFinal = motivosParts.join(' | ');

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

          // 11. Incidencia de número de factura duplicado (registrado con trazabilidad)
          if (duplicateMatchDoc) {
            const descDuplicado = `Número de factura duplicado: "${numeroDocumento}". También presente en documentos: ${duplicateMatchDoc.id}`;
            await tx.incidencias_documento.create({
              data: {
                documento_id: doc.id,
                id_de_empresa: BigInt(empresaId),
                descripcion: descDuplicado,
                incidencia: true,
                validado: false,
              }
            });
            console.log(`[DbWriterWorker] ⚠️ Incidencia de duplicado por número registrada para doc #${doc.id}: ${descDuplicado}`);

            // Asegurar que el documento previo también quede registrado en el grupo de duplicados si no lo está
            try {
              const prevIncs: any[] = await tx.$queryRawUnsafe(
                `SELECT id FROM ${dbName}.incidencias_documento WHERE documento_id = ? AND descripcion LIKE '%factura duplicado:%' AND validado = 0 LIMIT 1`,
                duplicateMatchDoc.id
              );
              if (!prevIncs || prevIncs.length === 0) {
                await tx.incidencias_documento.create({
                  data: {
                    documento_id: BigInt(duplicateMatchDoc.id),
                    id_de_empresa: BigInt(empresaId),
                    descripcion: `Número de factura duplicado: "${duplicateMatchDoc.numero_documento}". También presente en documentos: ${doc.id}`,
                    incidencia: true,
                    validado: false,
                  }
                });
              }
            } catch (e: any) {
              console.warn(`[DbWriterWorker] ⚠️ No se pudo vincular incidencia en doc previo #${duplicateMatchDoc.id} (ignorado):`, e?.message);
            }
          }

          console.log(`[DbWriterWorker] ✅ Transacción Prisma completada con éxito (Doc ID: ${doc.id})`);
        }, {
          maxWait: 10000,
          timeout: 30000,
        });

        if (savedDocumentoId) {
          import('@/services/health-check-service').then(({ runHealthChecksForDocument }) =>
            runHealthChecksForDocument(Number(savedDocumentoId)).catch(() => {})
          );
        }

        // ÉXITO: marcar el hijo como completado (VALIDADO o REVISION — archivo siempre queda)
        await updateIngestionProgress(uploadId, {
          status: 'Completado',
          step: duplicateMatchDoc
            ? 'Guardado con incidencia (número duplicado)'
            : resolvedFiscalStatus === FiscalStatus.REVISION ? 'Guardado en revisión' : 'Guardado',
          progress: 100,
          mensaje: duplicateMatchDoc
            ? `Factura ${numeroDocumento} duplicada (coincide con doc #${duplicateMatchDoc.id}). Guardada con incidencia para revisión.`
            : resolvedFiscalStatus === FiscalStatus.REVISION
              ? 'Documento guardado en REVISIÓN (excluido de agregados hasta corregir).'
              : 'Documento procesado y validado correctamente.',
          documentoId: savedDocumentoId ?? undefined,
        });

        // Si este job es un hijo de un lote, propagar el progreso al padre.
        if (ingestion.parentUploadId) {
          await updateParentProgress(ingestion.parentUploadId).catch(() => {});
        }

        // --- Notificaciones in-app (fire-and-forget, nunca interrumpen el flujo) ---
        getUserIdsForEmpresa(Number(empresaId)).then(async (userIds) => {
          if (userIds.length === 0) return;

          const proveedorNombre = (aiResult.empresa_emisora?.nombre || aiResult.cliente?.nombre || '').toString();
          const numDoc = numeroDocumento || 'Sin nº';

          if (duplicateMatchDoc) {
            await createNotification({
              userIds,
              empresaId: Number(empresaId),
              tipo: 'documento_revision',
              titulo: `Factura duplicada detectada`,
              mensaje: `La factura ${numDoc}${proveedorNombre ? ` de ${proveedorNombre}` : ''} tiene un número duplicado (coincide con doc #${duplicateMatchDoc.id}). Guardada con incidencia para revisión.`,
              metadata: { uploadId, documentoId: savedDocumentoId?.toString(), numeroDocumento: numDoc, duplicadoDocId: duplicateMatchDoc.id.toString() },
            });
          } else if (resolvedFiscalStatus === FiscalStatus.REVISION) {
            await createNotification({
              userIds,
              empresaId: Number(empresaId),
              tipo: 'documento_revision',
              titulo: `Documento requiere revision`,
              mensaje: `La factura ${numDoc}${proveedorNombre ? ` de ${proveedorNombre}` : ''} fue guardada en estado REVISION.`,
              metadata: { uploadId, documentoId: savedDocumentoId?.toString(), numeroDocumento: numDoc },
            });
          } else {
            await createNotification({
              userIds,
              empresaId: Number(empresaId),
              tipo: 'documento_procesado',
              titulo: `Documento procesado`,
              mensaje: `La factura ${numDoc}${proveedorNombre ? ` de ${proveedorNombre}` : ''} fue validada correctamente.`,
              metadata: { uploadId, documentoId: savedDocumentoId?.toString(), numeroDocumento: numDoc },
            });
          }

          // --- Variación de Precios ---
          const tieneIncidenciaBlandaNotif =
            aiResult.incidencia === true ||
            String(aiResult.incidencia ?? '').toUpperCase() === 'TRUE';

          if (
            !duplicateMatchDoc &&
            resolvedFiscalStatus !== FiscalStatus.REVISION &&
            !tieneIncidenciaBlandaNotif &&
            !evalFecha.requiereConfirmacion &&
            fechaEmision &&
            savedDocumentoId
          ) {
            await checkAndNotifyPriceVariation(savedDocumentoId, Number(empresaId));
          }

        }).catch(() => {});
        // -------------------------------------------------------------------------

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

        let userMsg = 'Error al guardar los datos del documento en la base de datos.';
        if ((error?.message || '').includes('fecha_vencimiento') || (error?.message || '').includes('fecha_emision')) {
          userMsg = 'Error en el formato de fecha del documento extraído.';
        } else if ((error?.message || '').includes('Prisma') || (error?.message || '').includes('invocation')) {
          userMsg = 'Error de estructura en los datos extraídos del documento.';
        }

        await updateIngestionProgress(uploadId, {
          status: 'Fallido',
          step: 'Error de guardado',
          progress: 0,
          mensaje: userMsg,
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
