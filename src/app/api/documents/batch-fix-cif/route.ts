import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { prisma } from '@/lib/prisma';
import { normalizeCIF } from '@/services/ingestion/normalize';
import { validateDocumentIncidents } from '@/services/document-service';
import crypto from 'crypto';

/**
 * PATCH /api/documents/batch-fix-cif
 *
 * Aplica un CIF a los proveedores/emisores de una lista de documentos
 * donde el CIF estaba ausente o era incorrecto.
 *
 * Body: { documentoIds: number[], cif: string, empresaId: number }
 *
 * Lógica:
 *   1. Verifica acceso del usuario a la empresa.
 *   2. Carga los documentos con sus entidades_documento e incidencias abiertas.
 *   3. Desencripta y actualiza cada entidad proveedor/emisor usando prisma.entidades_documento.update
 *      (lo cual encripta automáticamente con AES-256 y calcula el hash SHA-256).
 *   4. Actualiza datos_extra.cif en la tabla documentos.
 *   5. Si la ÚNICA incidencia abierta del documento era el CIF, lo valida por completo
 *      (marcando incidencias resueltas, status VALIDADO, y retirándolo del Centro de Seguridad).
 *   6. Si el documento tiene OTRAS incidencias abiertas, resuelve solo la del CIF y
 *      lo mantiene en revisión para que el usuario pueda corregir el resto.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { documentoIds, cif, empresaId } = body as {
      documentoIds: number[];
      cif: string;
      empresaId: number;
    };

    // Validaciones básicas
    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return NextResponse.json({ error: 'documentoIds requerido' }, { status: 400 });
    }
    if (!cif || typeof cif !== 'string' || cif.trim().length < 3) {
      return NextResponse.json({ error: 'CIF inválido' }, { status: 400 });
    }
    if (!empresaId || isNaN(Number(empresaId))) {
      return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });
    }

    // Verificar que el user tenga acceso a esta empresa
    const accesoEmpresa = await prisma.empresas.findFirst({
      where: {
        id: BigInt(empresaId),
        id_de_usuario: { array_contains: session.userId },
      },
      select: { id: true }
    });
    if (!accesoEmpresa) {
      return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 });
    }

    // Normalizar el CIF y calcular su hash SHA-256
    const cifNormalizado = normalizeCIF(cif.trim()) || cif.trim().toUpperCase();
    const cifHash = crypto.createHash('sha256').update(cifNormalizado.toLowerCase().trim()).digest('hex');

    // Filtrar y obtener los docs que pertenezcan a esa empresa
    const docsBigInt = documentoIds.map(id => BigInt(id));

    const docsValidos = await prisma.documentos.findMany({
      where: {
        id: { in: docsBigInt },
        id_de_empresa: BigInt(empresaId),
      },
      include: {
        entidades_documento: true,
        incidencias_documento: {
          where: { validado: false }
        }
      }
    });

    if (docsValidos.length === 0) {
      return NextResponse.json({ actualizados: 0, validados: 0, mensaje: 'Ningún documento válido encontrado' });
    }

    let entidadesActualizadasCount = 0;
    let docsCompletamenteValidadosCount = 0;

    for (const doc of docsValidos) {
      const docIdNum = Number(doc.id);

      // 1. Entidades proveedor/emisor del documento
      const provEntidades = (doc.entidades_documento || []).filter(
        (e: any) => e.rol === 'proveedor' || e.rol === 'emisor'
      );

      for (const ent of provEntidades) {
        const cifActual = ent.identificador_fiscal?.trim();
        const cifVacioOInvalido = !cifActual || cifActual === '' || cifActual.toUpperCase() === 'N/A';

        // Actualizamos si estaba vacío/inválido o si es diferente al nuevo CIF
        if (cifVacioOInvalido || cifActual !== cifNormalizado) {
          await prisma.entidades_documento.update({
            where: { id: ent.id },
            data: {
              identificador_fiscal: cifNormalizado,
              identificador_fiscal_hash: cifHash,
            }
          });
          entidadesActualizadasCount++;
        }
      }

      if (provEntidades.length === 0) {
        await prisma.entidades_documento.create({
          data: {
            documento_id: doc.id,
            rol: 'proveedor',
            nombre: 'Proveedor',
            identificador_fiscal: cifNormalizado,
            identificador_fiscal_hash: cifHash,
            id_de_empresa: BigInt(empresaId),
          }
        });
        entidadesActualizadasCount++;
      }

      // 2. Actualizar datos_extra en tabla documentos
      const rawDatosExtra = doc.datos_extra;
      const datosExtra = (typeof rawDatosExtra === 'string' ? JSON.parse(rawDatosExtra) : rawDatosExtra) || {};
      datosExtra.cif = cifNormalizado;

      const revisionReasons = Array.isArray(datosExtra.fiscal_revision_reasons)
        ? datosExtra.fiscal_revision_reasons
        : [];
      const reasonsRestantes = revisionReasons.filter(
        (r: any) => r.code !== 'CIF_EMISOR_AUSENTE' && r.code !== 'CIF_INVALIDO'
      );

      // 3. Revisar incidencias abiertas en incidencias_documento
      const incidenciasNoCif = (doc.incidencias_documento || []).filter(
        (inc: any) =>
          !inc.descripcion.includes('CIF_EMISOR_AUSENTE') &&
          !inc.descripcion.includes('CIF_INVALIDO')
      );

      // ¿El CIF era la ÚNICA incidencia abierta del documento?
      const eraUnicaIncidencia = incidenciasNoCif.length === 0 && reasonsRestantes.length === 0;

      if (eraUnicaIncidencia) {
        // Guardamos primero el CIF en datos_extra
        datosExtra.fiscal_revision_reasons = [];
        await prisma.documentos.update({
          where: { id: doc.id },
          data: { datos_extra: datosExtra }
        });

        // Validamos el documento completamente (limpia incidencias, estado VALIDADO, fuera de Centro de Seguridad)
        await validateDocumentIncidents(docIdNum);
        docsCompletamenteValidadosCount++;
      } else {
        // Solo resolvemos la incidencia específica de CIF
        await prisma.incidencias_documento.updateMany({
          where: {
            documento_id: doc.id,
            validado: false,
            OR: [
              { descripcion: { contains: 'CIF_EMISOR_AUSENTE' } },
              { descripcion: { contains: 'CIF_INVALIDO' } }
            ]
          },
          data: {
            validado: true,
            fecha_validacion: new Date(),
            validado_por: 'batch_cif',
            observaciones_validacion: `CIF corregido en lote: ${cifNormalizado}`
          }
        });

        datosExtra.fiscal_revision_reasons = reasonsRestantes;
        await prisma.documentos.update({
          where: { id: doc.id },
          data: { datos_extra: datosExtra }
        });
      }
    }

    console.log(
      `[batch-fix-cif] User ${session.userId} aplicó CIF ${cifNormalizado} a ${entidadesActualizadasCount} entidades. ` +
      `Docs autovalidados: ${docsCompletamenteValidadosCount}/${docsValidos.length}`
    );

    // Intentar disparar chequeo de duplicados en background para la empresa
    try {
      fetch(`${req.nextUrl.origin}/api/documents/check-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId }),
      }).catch(() => {});
    } catch {}

    return NextResponse.json({
      actualizados: entidadesActualizadasCount,
      validados: docsCompletamenteValidadosCount,
      cif: cifNormalizado,
      mensaje: `CIF aplicado a ${entidadesActualizadasCount} proveedor${entidadesActualizadasCount !== 1 ? 'es' : ''}${
        docsCompletamenteValidadosCount > 0
          ? ` (${docsCompletamenteValidadosCount} validado${docsCompletamenteValidadosCount !== 1 ? 's' : ''} automáticamente)`
          : ''
      }`
    });

  } catch (err) {
    console.error('[batch-fix-cif] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
