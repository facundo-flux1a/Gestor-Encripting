import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/documents/:id/cif-ausente-similares
 *
 * Devuelve documentos de la misma empresa que:
 *   - tienen una entidad proveedor/emisor con CIF vacío / null / 'N/A'
 *   - O tienen una incidencia abierta con CIF_EMISOR_AUSENTE o CIF_INVALIDO
 *   - no son el documento actual
 *
 * Usado para el flujo de batch-fix-cif: el user elige a cuáles aplicar
 * el CIF que acaba de corregir en el doc actual.
 *
 * IMPORTANTE: se usa Prisma ORM (no $queryRaw) para que el middleware de
 * desencriptación automática aplique a nombre e identificador_fiscal.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const docId = parseInt(params.id, 10);
    if (isNaN(docId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Obtener empresa del doc actual verificando acceso del usuario
    // También obtenemos el nombre del proveedor/emisor para comparar con candidatos
    const docActual = await prisma.documentos.findFirst({
      where: {
        id: BigInt(docId),
        empresas: {
          id_de_usuario: { array_contains: session.userId }
        }
      },
      select: {
        id_de_empresa: true,
        entidades_documento: {
          where: { rol: { in: ['proveedor', 'emisor'] } },
          select: { nombre: true },
          take: 1
        }
      }
    });

    if (!docActual?.id_de_empresa) {
      return NextResponse.json({ error: 'Documento no encontrado o sin acceso' }, { status: 404 });
    }

    const empresaId = docActual.id_de_empresa;
    // nombre del proveedor del doc origen (ya desencriptado por Prisma)
    const nombreProveedorOrigen = docActual.entidades_documento[0]?.nombre?.trim().toLowerCase() ?? '';

    // ── Caso A: docs cuyo proveedor/emisor tiene CIF vacío/null ──────────
    // identificador_fiscal_hash es null/vacío cuando el CIF no fue registrado.
    // No filtramos por el valor encriptado directamente (evitamos $queryRaw).
    const docsConCifAusente = await prisma.documentos.findMany({
      where: {
        id_de_empresa: empresaId,
        id: { not: BigInt(docId) },
        entidades_documento: {
          some: {
            rol: { in: ['proveedor', 'emisor'] },
            // hash nulo o vacío = CIF nunca registrado
            OR: [
              { identificador_fiscal_hash: null },
              { identificador_fiscal_hash: '' },
            ]
          }
        }
      },
      select: {
        id: true,
        fecha_emision: true,
        importe_total: true,
        tipo_documento: true,
        entidades_documento: {
          where: { rol: { in: ['proveedor', 'emisor'] } },
          select: { nombre: true, identificador_fiscal: true },
          take: 1
        }
      },
      orderBy: { fecha_emision: 'desc' },
      take: 50
    });

    // ── Caso B: docs con incidencia CIF abierta ───────────────────────────
    // (CIF guardado incorrecto: OCR puso el CIF de la empresa, no del proveedor)
    const docsConIncidenciaCif = await prisma.documentos.findMany({
      where: {
        id_de_empresa: empresaId,
        id: { not: BigInt(docId) },
        incidencias_documento: {
          some: {
            validado: false,
            incidencia: true,
            OR: [
              { descripcion: { contains: 'CIF_EMISOR_AUSENTE' } },
              { descripcion: { contains: 'CIF_INVALIDO' } },
            ]
          }
        }
      },
      select: {
        id: true,
        fecha_emision: true,
        importe_total: true,
        tipo_documento: true,
        entidades_documento: {
          where: { rol: { in: ['proveedor', 'emisor'] } },
          select: { nombre: true, identificador_fiscal: true },
          take: 1
        }
      },
      orderBy: { fecha_emision: 'desc' },
      take: 50
    });

    // Fusionar y deduplicar por ID
    const seen = new Set<number>();
    const candidatos = [...docsConCifAusente, ...docsConIncidenciaCif]
      .filter(d => {
        const id = Number(d.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => {
        // Ordenar por fecha desc (pueden venir de distintas queries)
        const da = a.fecha_emision ? new Date(a.fecha_emision).getTime() : 0;
        const db_ = b.fecha_emision ? new Date(b.fecha_emision).getTime() : 0;
        return db_ - da;
      })
      .slice(0, 50)
      .map(d => {
        const nombreCandidato = d.entidades_documento[0]?.nombre?.trim().toLowerCase() ?? ''
        const coincide_nombre = !!(
          nombreProveedorOrigen &&
          nombreCandidato &&
          nombreCandidato === nombreProveedorOrigen
        )
        return {
          id: Number(d.id),
          fecha_emision: d.fecha_emision
            ? new Date(d.fecha_emision).toISOString().split('T')[0]
            : null,
          // nombre ya viene desencriptado por el middleware de Prisma
          proveedor_nombre: d.entidades_documento[0]?.nombre || '(sin nombre)',
          total: d.importe_total != null ? Number(d.importe_total) : null,
          tipo_documento: d.tipo_documento || null,
          coincide_nombre,
        }
      });

    return NextResponse.json({
      candidatos,
      total: candidatos.length,
      nombre_proveedor_origen: docActual.entidades_documento[0]?.nombre || null,
    });
  } catch (err) {
    console.error('[cif-ausente-similares] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
