import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { prisma } from '@/lib/prisma';
import connection, { dbName } from '@/lib/db';
import crypto from 'crypto';
import { resolverTrimestreContableImportacion, parseFechaLocal } from '@/lib/trimestre-utils';
import { RowDataPacket } from 'mysql2';
import { s3, getBucketName } from '@/lib/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

function getSha256(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleanText = text.toLowerCase().replace(/[,.]/g, '').trim();
  return crypto.createHash('sha256').update(cleanText).digest('hex');
}

function resolveCC(tipo: string, porcentaje: number, esEmitida: boolean): string | null {
  const t = (tipo || 'IVA').toUpperCase();
  const base = esEmitida ? '477' : '472';
  if (t === 'RETENCION' || t.includes('IRPF') || t.includes('RET')) {
    return esEmitida ? '4730000' : '4751000';
  }
  if (t === 'IVA' || t.includes('IVA')) {
    const pct = Math.round(porcentaje);
    if (pct === 21) return `${base}0021`;
    if (pct === 10) return `${base}0010`;
    if (pct === 4) return `${base}0004`;
    if (pct === 0) return `${base}0000`;
    return `${base}0000`;
  }
  return null;
}

/**
 * POST /api/documents/manual
 * Permite registrar un documento cargado o editado manualmente por el usuario.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      empresaId,
      tipoDocumento = 'FACTURA RECIBIDA',
      numeroDocumento = '',
      fechaEmision: rawFechaEmision,
      fechaVencimiento: rawFechaVencimiento,
      formaPago = '',
      moneda = 'EUR',
      emisor = {},
      receptor = {},
      lineas = [],
      impuestos = [],
      totales = {},
    } = body;

    const numEmpresaId = parseInt(String(empresaId), 10);
    if (!numEmpresaId || isNaN(numEmpresaId)) {
      return NextResponse.json({ error: 'empresaId requerido y válido' }, { status: 400 });
    }

    // Verificar que el usuario tenga acceso a la empresa y extraer CIF
    const [empresaCheck] = await connection.query<RowDataPacket[]>(
      `SELECT id, nombre_de_empresa, CIF FROM ${dbName}.empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [numEmpresaId, session.userId]
    );

    if (empresaCheck.length === 0) {
      return NextResponse.json({ error: 'Empresa no encontrada o sin permisos' }, { status: 403 });
    }

    const nombreEmpresaActual = empresaCheck[0].nombre_de_empresa || '';
    const cifEmpresaActual = empresaCheck[0].CIF || '';

    // Fechas
    const fechaEmision = rawFechaEmision ? parseFechaLocal(rawFechaEmision) : new Date();
    const fechaVencimiento = rawFechaVencimiento ? parseFechaLocal(rawFechaVencimiento) : null;

    // Resolver trimestre contable abierto
    const trimestreData = await resolverTrimestreContableImportacion(
      fechaEmision || new Date(),
      numEmpresaId,
      null
    );

    // Tipos y Roles
    const tipoDocUpper = (tipoDocumento || 'FACTURA RECIBIDA').toUpperCase();
    const esEmitida = tipoDocUpper.includes('EMITIDA') || tipoDocUpper.includes('EMITIDO') || tipoDocUpper.includes('VENTA');
    const esRecibida = !esEmitida;
    const esTicketDoc = tipoDocUpper.includes('TICKET') || tipoDocUpper.includes('SIMPLIFICADA');

    const rolEmisor = esEmitida ? 'emisor' : 'proveedor';
    const rolReceptor = esEmitida ? 'cliente' : 'receptor';

    // Importes
    const baseCalculada = Number(totales.baseImponible) || (Array.isArray(lineas) ? lineas.reduce((acc: number, l: any) => acc + (Number(l.importeLinea) || (Number(l.cantidad || 1) * Number(l.precioUnitario || 0))), 0) : 0);
    const impuestosCalculados = Number(totales.totalImpuestos) || (Array.isArray(impuestos) ? impuestos.reduce((acc: number, imp: any) => acc + (Number(imp.cuota) || 0), 0) : 0);
    const totalCalculado = Number(totales.total) || (baseCalculada + impuestosCalculados);

    const importeTotal = Math.round(totalCalculado * 100) / 100;
    const importeSinIva = Math.round(baseCalculada * 100) / 100;

    const cifDocumento = (esEmitida ? (receptor?.cif || '') : (emisor?.cif || cifEmpresaActual)) || '';
    const cleanNumDoc = (numeroDocumento || '').trim();
    const normNumDoc = cleanNumDoc ? cleanNumDoc.toLowerCase().replace(/[^a-z0-9]/g, '') : null;

    // Generar file_hash único para el documento manual
    const manualHash = `manual_${numEmpresaId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    console.log(`📝 [API-MANUAL-DOC] Creando documento manual: ${tipoDocUpper} para empresa #${numEmpresaId}`);

    // Preparar Entidades
    const entidadesToCreate: any[] = [];

    // Emisor
    const nombreEmisor = (emisor?.nombre || (esEmitida ? nombreEmpresaActual : '')).trim();
    const cifEmisor = (emisor?.cif || (esEmitida ? cifEmpresaActual : '')).trim();
    if (nombreEmisor || esEmitida) {
      entidadesToCreate.push({
        id_de_empresa: BigInt(numEmpresaId),
        rol: rolEmisor,
        nombre: nombreEmisor || 'Emisor',
        identificador_fiscal: cifEmisor || null,
        direccion: emisor?.direccion?.trim() || null,
        telefono: emisor?.telefono?.trim() || null,
        email: emisor?.email?.trim() || null,
        cuenta_contable: emisor?.cuentaContable?.trim() || (esEmitida ? null : '4000000'),
        nombre_hash: getSha256(nombreEmisor),
        identificador_fiscal_hash: getSha256(cifEmisor),
      });
    }

    // Receptor
    const nombreReceptor = (receptor?.nombre || (esRecibida ? nombreEmpresaActual : '')).trim();
    const cifReceptor = (receptor?.cif || (esRecibida ? cifEmpresaActual : '')).trim();
    if (nombreReceptor || esRecibida) {
      entidadesToCreate.push({
        id_de_empresa: BigInt(numEmpresaId),
        rol: rolReceptor,
        nombre: nombreReceptor || 'Receptor',
        identificador_fiscal: cifReceptor || null,
        direccion: receptor?.direccion?.trim() || null,
        telefono: receptor?.telefono?.trim() || null,
        email: receptor?.email?.trim() || null,
        cuenta_contable: receptor?.cuentaContable?.trim() || (esEmitida ? '4300000' : null),
        nombre_hash: getSha256(nombreReceptor),
        identificador_fiscal_hash: getSha256(cifReceptor),
      });
    }

    // Preparar Líneas con Código / SKU y Cuenta Contable
    const lineasToCreate = (Array.isArray(lineas) && lineas.length > 0)
      ? lineas.map((linea: any, idx: number) => {
          const cantidad = Number(linea.cantidad) || 1;
          const precioUnitario = Number(linea.precioUnitario) || 0;
          const descuento = Number(linea.descuentoPorcentaje) || 0;
          const precioNeto = precioUnitario * (1 - descuento / 100);
          const importeLinea = Number(linea.importeLinea) || Math.round(cantidad * precioNeto * 100) / 100;
          const cuentaContable = linea.cuentaContable?.trim() || (esEmitida ? '7000000' : '6000000');

          return {
            id_de_empresa: BigInt(numEmpresaId),
            codigo: linea.codigo?.trim() || null,
            descripcion: linea.descripcion?.trim() || `Línea ${idx + 1}`,
            cantidad,
            precio_unitario: precioUnitario,
            descuento_porcentaje: descuento,
            precio_neto: precioNeto,
            importe_linea: importeLinea,
            cuenta_contable: cuentaContable,
          };
        })
      : [];

    // Preparar Impuestos con Cuenta Contable y total_con_impuesto
    const cuentasSugeridasMap: Record<string, string> = {};
    const impuestosToCreate = (Array.isArray(impuestos) && impuestos.length > 0)
      ? impuestos.map((imp: any) => {
          const tipo = (imp.tipo || 'IVA').toUpperCase();
          const porcentaje = Number(imp.porcentaje) || 0;
          const base = Number(imp.base) || 0;
          const cuota = Number(imp.cuota) || Math.round(((base * porcentaje) / 100) * 100) / 100;
          const totalConImpuesto = Math.round((base + cuota) * 100) / 100;
          const cuenta = imp.cuentaContable?.trim() || resolveCC(tipo, porcentaje, esEmitida);

          if (cuenta) {
            cuentasSugeridasMap[`${tipo}_${Math.round(porcentaje)}`] = cuenta;
          }

          return {
            id_de_empresa: BigInt(numEmpresaId),
            tipo_impuesto: tipo,
            porcentaje,
            base_imponible: base,
            cuota,
            total_con_impuesto: totalConImpuesto,
            cuenta_contable: cuenta,
          };
        })
      : [];

    // Preparar Archivo Físico adjunto si el usuario subió uno (PDF o imagen)
    const archivosToCreate: any[] = [];
    if (body.archivo && body.archivo.base64) {
      try {
        const fileBuffer = Buffer.from(body.archivo.base64, 'base64');
        const origName = body.archivo.nombre || 'comprobante.pdf';
        const cleanName = origName.replace(/ /g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');
        const ext = origName.includes('.') ? origName.split('.').pop()?.toLowerCase() || 'pdf' : 'pdf';
        const mimeType = body.archivo.mimeType || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
        const uniqueKey = `archivos/manual_${numEmpresaId}_${Date.now()}_${cleanName}`;
        const bucket = getBucketName();

        console.log(`📤 [API-MANUAL-DOC] Subiendo archivo adjunto a MinIO: ${uniqueKey}`);

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: uniqueKey,
            Body: fileBuffer,
            ContentType: mimeType,
          })
        );

        const endpoint = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
        const publicUrl = `${endpoint}/${bucket}/${uniqueKey}`;

        archivosToCreate.push({
          nombre_archivo: origName,
          ruta_archivo: publicUrl,
          tipo_archivo: ext,
          id_de_empresa: BigInt(numEmpresaId),
        });
      } catch (attachErr) {
        console.warn('⚠️ [API-MANUAL-DOC] No se pudo subir el archivo adjunto a MinIO:', attachErr);
      }
    }

    // Crear documento e insertar entidades, líneas e impuestos en una sola operación atómica anidada
    const doc = await prisma.documentos.create({
      data: {
        file_hash: manualHash,
        tipo_documento: tipoDocUpper,
        numero_documento: cleanNumDoc || null,
        numero_documento_normalizado: normNumDoc,
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVencimiento,
        importe_total: importeTotal,
        importe_sin_impuestos: importeSinIva,
        moneda: (moneda || 'EUR').toUpperCase(),
        id_de_empresa: BigInt(numEmpresaId),
        is_new: 1,
        trimestre_cerrado: false,
        enviado_sii: false,
        año_trimestre: trimestreData.año,
        num_trimestre: trimestreData.trimestre,
        dashboard_correo: 'manual',
        datos_extra: {
          creacion_manual: true,
          creado_por_usuario: session.email,
          creado_en: new Date().toISOString(),
          cif: cifDocumento,
          forma_pago: formaPago,
          categoria: esEmitida ? 'Ventas' : 'Compras y Gastos',
          subcategoria: esTicketDoc ? 'Tickets' : 'Facturas',
          fiscal_status: 'VALIDADO',
          fiscal_guard_version: 'manual_v1',
          cuentas_sugeridas: cuentasSugeridasMap,
        },
        ...(entidadesToCreate.length > 0
          ? {
              entidades_documento: {
                create: entidadesToCreate,
              },
            }
          : {}),
        ...(lineasToCreate.length > 0
          ? {
              lineas_documento: {
                create: lineasToCreate,
              },
            }
          : {}),
        ...(impuestosToCreate.length > 0
          ? {
              impuestos_documento: {
                create: impuestosToCreate,
              },
            }
          : {}),
        ...(archivosToCreate.length > 0
          ? {
              archivos_documento: {
                create: archivosToCreate,
              },
            }
          : {}),
      },
    });

    const createdDocId = doc.id;

    console.log(`✅ [API-MANUAL-DOC] Documento #${createdDocId} guardado con éxito (Prisma nested)`);

    return NextResponse.json({
      success: true,
      documentId: Number(createdDocId),
      message: 'Documento creado e integrado con éxito',
    });
  } catch (error) {
    console.error('❌ [API-MANUAL-DOC] Error al crear documento manual:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno al guardar el documento',
      },
      { status: 500 }
    );
  }
}
