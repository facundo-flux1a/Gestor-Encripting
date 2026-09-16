import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';
import { runHealthChecksForDocument } from '@/services/health-check-service';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/documents/[id]/extranjero
 * 
 * Cambia el estado de un documento entre Nacional (Local) y Proveedor Extranjero (UE/Extracomunitario).
 * Body: { esExtranjero: boolean }
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { esExtranjero } = body;

    if (typeof esExtranjero !== 'boolean') {
      return NextResponse.json(
        { error: 'El campo "esExtranjero" debe ser un booleano (true | false).' },
        { status: 400 }
      );
    }

    const doc = await prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      include: {
        impuestos_documento: true,
        entidades_documento: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const currentDatosExtra = ((doc.datos_extra as Record<string, any>) || {});
    const isCurrentlyForeign = Boolean(currentDatosExtra.es_proveedor_extranjero_ue);

    if (esExtranjero === isCurrentlyForeign) {
      return NextResponse.json({
        success: true,
        message: `El documento ya se encuentra como ${esExtranjero ? 'extranjero' : 'local'}.`,
        documento: {
          id: documentId,
          es_proveedor_extranjero_ue: esExtranjero,
          importe_sin_impuestos: Number(doc.importe_sin_impuestos),
          importe_total: Number(doc.importe_total),
        },
      });
    }

    if (esExtranjero) {
      // ─────────────────────────────────────────────────────────────────────────
      // CASO A: LOCAL ➔ EXTRANJERO
      // 1. Respaldar impuestos actuales, base y retenciones en backup_fiscal_origen
      // 2. Resetear en datos_extra: base_no_sujeta=0, retencion_irpf=0, descuento_global=0
      // 3. Eliminar filas de impuestos_documento (0 filas)
      // 4. Actualizar importe_sin_impuestos = importe_total (gasto íntegro no deducible)
      // 5. Marcar es_proveedor_extranjero_ue = true
      // ─────────────────────────────────────────────────────────────────────────
      const backupFiscal = {
        importe_sin_impuestos_original: Number(doc.importe_sin_impuestos) || 0,
        base_no_sujeta_original: Number(currentDatosExtra.base_no_sujeta) || 0,
        retencion_irpf_original: Number(currentDatosExtra.retencion_irpf) || 0,
        descuento_global_original: Number(currentDatosExtra.descuento_global) || 0,
        impuestos_originales: doc.impuestos_documento.map((imp: any) => ({
          tipo: imp.tipo_impuesto,
          porcentaje: Number(imp.porcentaje) || 0,
          base: Number(imp.base_imponible) || 0,
          cuota: Number(imp.cuota) || 0,
        })),
      };

      const updatedDatosExtra = {
        ...currentDatosExtra,
        es_proveedor_extranjero_ue: true,
        cuenta_proveedor_sugerida: currentDatosExtra.cuenta_proveedor_sugerida || '4100000',
        base_no_sujeta: 0,
        retencion_irpf: 0,
        descuento_global: 0,
        backup_fiscal_origen: backupFiscal,
      };

      await prisma.$transaction(async (tx: any) => {
        // Borrar todos los impuestos vinculados
        await tx.impuestos_documento.deleteMany({
          where: { documento_id: BigInt(documentId) },
        });

        // Actualizar documento: base computada pasa a ser el total íntegro
        await tx.documentos.update({
          where: { id: BigInt(documentId) },
          data: {
            importe_sin_impuestos: doc.importe_total,
            datos_extra: updatedDatosExtra,
          },
        });

        // Registrar incidencia informativa
        await tx.incidencias_documento.create({
          data: {
            documento_id: BigInt(documentId),
            id_de_empresa: doc.id_de_empresa,
            descripcion: 'Marcado manualmente como proveedor extranjero. IVA de origen no deducible en España, importe total computado íntegramente como base del gasto contable.',
            incidencia: false,
            validado: true,
          },
        });
      });

      // Recalcular health checks en segundo plano
      runHealthChecksForDocument(documentId).catch(() => {});

      return NextResponse.json({
        success: true,
        message: 'Documento convertido a proveedor extranjero correctamente.',
        documento: {
          id: documentId,
          es_proveedor_extranjero_ue: true,
          importe_sin_impuestos: Number(doc.importe_total),
          importe_total: Number(doc.importe_total),
        },
      });
    } else {
      // ─────────────────────────────────────────────────────────────────────────
      // CASO B: EXTRANJERO ➔ LOCAL
      // 1. Quitar flag es_proveedor_extranjero_ue (false)
      // 2. Restaurar base original si existe en backup, o conservar la actual
      // 3. Restaurar flags previas de datos_extra desde backup_fiscal_origen si existían
      // 4. Dejar impuestos_documento limpio (0 filas) para que el usuario ingrese
      //    manualmente las cuotas de IVA en el editor fiscal según corresponda
      // ─────────────────────────────────────────────────────────────────────────
      const backup = (currentDatosExtra.backup_fiscal_origen as Record<string, any>) || {};
      const restoredBase = backup.importe_sin_impuestos_original !== undefined
        ? Number(backup.importe_sin_impuestos_original)
        : Number(doc.importe_sin_impuestos);

      const updatedDatosExtra = {
        ...currentDatosExtra,
        es_proveedor_extranjero_ue: false,
        base_no_sujeta: 0,
        retencion_irpf: 0,
        descuento_global: 0,
      };

      await prisma.$transaction(async (tx: any) => {
        await tx.documentos.update({
          where: { id: BigInt(documentId) },
          data: {
            importe_sin_impuestos: restoredBase,
            datos_extra: updatedDatosExtra,
          },
        });

        // Marcar incidencias previas de proveedor extranjero como validadas
        await tx.incidencias_documento.updateMany({
          where: {
            documento_id: BigInt(documentId),
            descripcion: { contains: 'proveedor extranjero' },
          },
          data: { validado: true },
        });
      });

      runHealthChecksForDocument(documentId).catch(() => {});

      return NextResponse.json({
        success: true,
        message: 'Documento convertido a local. Por favor define manualmente las cuotas de IVA si corresponden.',
        documento: {
          id: documentId,
          es_proveedor_extranjero_ue: false,
          importe_sin_impuestos: restoredBase,
          importe_total: Number(doc.importe_total),
        },
      });
    }
  } catch (error: any) {
    console.error('❌ Error en PATCH /api/documents/[id]/extranjero:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al actualizar estado extranjero del documento.' },
      { status: 500 }
    );
  }
}
