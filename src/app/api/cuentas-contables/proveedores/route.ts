import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import connection from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SuggestionDetail {
  codigo: string;
  nombre: string;
  justificacion?: string;
}

function inferSugerencias(
  datosExtra: Record<string, any> | null,
  tipoDoc: string | null,
  roles: string[],
  nombreEntidad?: string,
  cifEntidad?: string
): {
  cuenta_compra_sugerida: SuggestionDetail | null;
  cuenta_venta_sugerida: SuggestionDetail | null;
  cuenta_gasto_sugerida: SuggestionDetail | null;
  cuenta_ingreso_sugerida: SuggestionDetail | null;
} {
  const d = datosExtra || {};
  const isEmitida = (tipoDoc || '').toUpperCase().includes('EMITID') || roles.includes('cliente') || roles.includes('receptor');
  const isProveedor = roles.includes('proveedor') || roles.includes('emisor');
  const nom = (nombreEntidad || '').toLowerCase();
  const sub = (d.subcategoria || '').toLowerCase();
  const cat = (d.categoria || '').toLowerCase();
  const desc = (d.descripcion_operacion || '').toLowerCase();

  let cuenta_compra_sugerida: SuggestionDetail | null = null;
  let cuenta_venta_sugerida: SuggestionDetail | null = null;
  let cuenta_gasto_sugerida: SuggestionDetail | null = null;
  let cuenta_ingreso_sugerida: SuggestionDetail | null = null;

  // ── 1. Cuenta Gasto (6xxx) ──
  if (isProveedor) {
    if (d.cuenta_gasto_sugerida?.codigo) {
      cuenta_gasto_sugerida = d.cuenta_gasto_sugerida;
    } else {
      // Reglas basadas en indicaciones de Javier Allbase y PGC español
      if (
        nom.includes('all base') ||
        nom.includes('allbase') ||
        sub.includes('asesor') ||
        sub.includes('profesional') ||
        sub.includes('abogad') ||
        sub.includes('notari') ||
        sub.includes('juridic') ||
        sub.includes('consultor') ||
        desc.includes('honorarios')
      ) {
        // Javier: "en el caso de all base irai a una 6230000 que son gastos de profesionales"
        cuenta_gasto_sugerida = {
          codigo: '6230000',
          nombre: 'Servicios de profesionales independientes',
          justificacion: 'Honorarios profesionales, asesoría o servicios legales',
        };
      } else if (
        sub.includes('materia') ||
        sub.includes('mercaderi') ||
        cat.includes('materia') ||
        cat.includes('mercaderi')
      ) {
        // Javier: "si son proveedores de materias primas a una 600000"
        cuenta_gasto_sugerida = {
          codigo: '6000000',
          nombre: 'Compras de mercaderías / materias primas',
          justificacion: 'Aprovisionamiento de materias primas o existencias',
        };
      } else if (
        sub.includes('combustible') ||
        sub.includes('gasolina') ||
        sub.includes('gasoleo') ||
        sub.includes('diesel') ||
        nom.includes('repsol') ||
        nom.includes('cepsa')
      ) {
        // Javier: "si son proveedores combustibles 6280000"
        cuenta_gasto_sugerida = {
          codigo: '6280000',
          nombre: 'Suministros y combustibles',
          justificacion: 'Combustibles, carburantes y suministros',
        };
      } else if (
        nom.includes('office') ||
        nom.includes('papeleria') ||
        sub.includes('oficina') ||
        sub.includes('material') ||
        sub.includes('suministro') ||
        cat.includes('suministro')
      ) {
        cuenta_gasto_sugerida = {
          codigo: '6290001',
          nombre: 'Material y suministros de oficina',
          justificacion: `Suministros de oficina y papelería`,
        };
      } else if (
        sub.includes('software') ||
        sub.includes('licencia') ||
        sub.includes('saas') ||
        cat.includes('tecnolog') ||
        cat.includes('infraestructura')
      ) {
        cuenta_gasto_sugerida = {
          codigo: '6290000',
          nombre: 'Software y licencias SaaS',
          justificacion: `Software, licencias y servicios en la nube`,
        };
      } else if (sub.includes('alquiler') || sub.includes('arrendam')) {
        cuenta_gasto_sugerida = {
          codigo: '6210000',
          nombre: 'Arrendamientos y cánones',
          justificacion: 'Alquiler o canon de instalaciones',
        };
      } else if (sub.includes('seguro')) {
        cuenta_gasto_sugerida = {
          codigo: '6250000',
          nombre: 'Primas de seguros',
          justificacion: 'Pólizas de seguro comercial',
        };
      } else if (sub.includes('luz') || sub.includes('agua') || sub.includes('gas') || sub.includes('electric') || sub.includes('telecom')) {
        cuenta_gasto_sugerida = {
          codigo: '6280000',
          nombre: 'Suministros (electricidad, agua, telecom)',
          justificacion: 'Suministros básicos y energía',
        };
      } else if (sub.includes('transporte') || sub.includes('mensajeria') || sub.includes('envio')) {
        cuenta_gasto_sugerida = {
          codigo: '6240000',
          nombre: 'Transportes y mensajería',
          justificacion: 'Envíos y logística',
        };
      } else {
        cuenta_gasto_sugerida = {
          codigo: '6290000',
          nombre: 'Otros servicios operativos',
          justificacion: `Servicios operativos generales (Grupo 629)`,
        };
      }
    }
  }

  // ── 2. Cuenta Compra (40xxx / 41xxx) ──
  if (isProveedor) {
    if (d.cuenta_proveedor_sugerida) {
      cuenta_compra_sugerida = {
        codigo: String(d.cuenta_proveedor_sugerida),
        nombre: 'Proveedor / Acreedor',
        justificacion: 'Sugerida en validación fiscal del documento',
      };
    } else {
      // Si el gasto es compra de mercaderías (600), va a Proveedores (400)
      // Si el gasto es prestación de servicios (62x), va a Acreedores (410)
      const esMercaderia = cuenta_gasto_sugerida?.codigo?.startsWith('600');
      const isExtranjero = d.pais_emisor && d.pais_emisor !== 'ES';

      if (esMercaderia) {
        cuenta_compra_sugerida = {
          codigo: '40000000',
          nombre: 'Proveedores nacionales',
          justificacion: 'Suministrador de bienes y existencias (Grupo 400)',
        };
      } else {
        cuenta_compra_sugerida = {
          codigo: isExtranjero ? '41000000' : '4100000',
          nombre: isExtranjero ? 'Acreedores varios (extranjero)' : 'Acreedores por prestaciones de servicios',
          justificacion: 'Acreedor de servicios según PGC (Grupo 410)',
        };
      }
    }
  }

  // ── 3. Cuenta Venta (43xxx) ──
  if (isEmitida) {
    if (d.cuenta_cliente_sugerida) {
      cuenta_venta_sugerida = {
        codigo: String(d.cuenta_cliente_sugerida),
        nombre: 'Cliente',
        justificacion: 'Sugerida en factura emitida',
      };
    } else {
      cuenta_venta_sugerida = {
        codigo: '43000000',
        nombre: 'Clientes nacionales',
        justificacion: 'Cuenta estándar PGC para clientes (Grupo 430)',
      };
    }
  }

  // ── 4. Cuenta Ingreso (7xxx) ──
  if (isEmitida) {
    if (d.cuenta_ingreso_sugerida?.codigo) {
      cuenta_ingreso_sugerida = d.cuenta_ingreso_sugerida;
    } else {
      if (sub.includes('servicio') || sub.includes('licencia') || sub.includes('software') || cat.includes('servicio')) {
        cuenta_ingreso_sugerida = {
          codigo: '7050000',
          nombre: 'Prestaciones de servicios',
          justificacion: 'Factura emitida por servicios / licencias (705)',
        };
      } else {
        cuenta_ingreso_sugerida = {
          codigo: '7000000',
          nombre: 'Ventas de mercaderías',
          justificacion: 'Factura emitida por venta estándar (700)',
        };
      }
    }
  }

  return {
    cuenta_compra_sugerida,
    cuenta_venta_sugerida,
    cuenta_gasto_sugerida,
    cuenta_ingreso_sugerida,
  };
}

/**
 * GET /api/cuentas-contables/proveedores
 *
 * Devuelve entidades agrupadas por hash fiscal con:
 * - Cuentas canónicas asignadas (entidades_config)
 * - Nombres/CIFs desencriptados automáticamente
 * - Sugerencias IA inteligentes para cada una de las 4 cuentas
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyIds = searchParams.getAll('companyId').map(Number).filter(Boolean);

    if (companyIds.length === 0) {
      return NextResponse.json({ entities: [] });
    }

    const companyIdsBig = companyIds.map(BigInt);
    const placeholders = companyIds.map(() => '?').join(', ');

    // ─── 1. Obtener hashes únicos de entidades_documento ──────────────────────
    const [hashRows] = await connection.query(
      `
      SELECT
        ed.identificador_fiscal_hash        AS hash,
        ed.id_de_empresa                    AS empresa_id,
        COUNT(DISTINCT ed.documento_id)     AS total_documentos,
        ANY_VALUE(ec.nombre_referencia)     AS nombre_config,
        ANY_VALUE(ec.identificador_fiscal)  AS cif_config,
        ANY_VALUE(ec.cuenta_compra)         AS cuenta_compra,
        ANY_VALUE(ec.cuenta_venta)          AS cuenta_venta,
        ANY_VALUE(ec.cuenta_gasto)          AS cuenta_gasto,
        ANY_VALUE(ec.cuenta_ingreso)        AS cuenta_ingreso,
        ANY_VALUE(ec.fecha_modificacion)    AS fecha_modificacion,
        ANY_VALUE((
          SELECT d2.datos_extra
          FROM entidades_documento ed3
          INNER JOIN documentos d2 ON ed3.documento_id = d2.id
          WHERE ed3.identificador_fiscal_hash = ed.identificador_fiscal_hash
            AND ed3.id_de_empresa = ed.id_de_empresa
          ORDER BY d2.fecha_creacion DESC
          LIMIT 1
        ))                                  AS datos_extra,
        ANY_VALUE((
          SELECT d2.tipo_documento
          FROM entidades_documento ed3
          INNER JOIN documentos d2 ON ed3.documento_id = d2.id
          WHERE ed3.identificador_fiscal_hash = ed.identificador_fiscal_hash
            AND ed3.id_de_empresa = ed.id_de_empresa
          ORDER BY d2.fecha_creacion DESC
          LIMIT 1
        ))                                  AS tipo_documento,
        GROUP_CONCAT(DISTINCT ed.rol)       AS roles
      FROM entidades_documento ed
      LEFT JOIN entidades_config ec
        ON ec.identificador_fiscal_hash = ed.identificador_fiscal_hash
        AND ec.empresa_id = ed.id_de_empresa
      WHERE ed.id_de_empresa IN (${placeholders})
        AND ed.identificador_fiscal_hash IS NOT NULL
        AND ed.identificador_fiscal_hash NOT IN (
          SELECT cif_hash FROM empresas WHERE id IN (${placeholders}) AND cif_hash IS NOT NULL
        )
        AND ed.rol IN ('proveedor', 'emisor', 'cliente', 'receptor')
      GROUP BY ed.identificador_fiscal_hash, ed.id_de_empresa
      ORDER BY total_documentos DESC
      `,
      [...companyIds, ...companyIds]
    ) as any[];

    if (!hashRows.length) {
      return NextResponse.json({ entities: [] });
    }

    // ─── 2. Para los que NO tienen entidades_config, desencriptar via Prisma ──
    const needsDecrypt = (hashRows as any[]).filter(r => !r.nombre_config && r.hash);
    let decryptedMap: Map<string, { nombre: string; cif: string }> = new Map();

    if (needsDecrypt.length > 0) {
      const prismaRows = await prisma.entidades_documento.findMany({
        where: {
          identificador_fiscal_hash: { in: needsDecrypt.map(r => r.hash) },
          id_de_empresa: { in: companyIdsBig },
          rol: { in: ['proveedor', 'emisor', 'cliente', 'receptor'] },
        },
        select: {
          identificador_fiscal_hash: true,
          nombre: true,
          identificador_fiscal: true,
        },
        orderBy: { fecha_creacion: 'desc' },
      });

      for (const row of prismaRows) {
        const key = row.identificador_fiscal_hash ?? '';
        if (key && !decryptedMap.has(key)) {
          decryptedMap.set(key, {
            nombre: row.nombre ?? '—',
            cif: row.identificador_fiscal ?? '—',
          });
        }
      }
    }

    // ─── 3. Combinar y devolver con sugerencias completas ──────────────────────
    const entities = (hashRows as any[]).map(row => {
      const decrypted = decryptedMap.get(row.hash);
      const roles = (row.roles || '').split(',').filter(Boolean) as string[];

      let parsedDatosExtra: Record<string, any> | null = null;
      if (row.datos_extra) {
        try {
          parsedDatosExtra = typeof row.datos_extra === 'string'
            ? JSON.parse(row.datos_extra)
            : row.datos_extra;
        } catch { /* ignore */ }
      }

      const nombre = row.nombre_config || decrypted?.nombre || '—';
      const cif = row.cif_config || decrypted?.cif || '—';
      const sugs = inferSugerencias(parsedDatosExtra, row.tipo_documento, roles, nombre, cif);

      return {
        empresa_id: Number(row.empresa_id),
        identificador_fiscal: cif,
        nombre: nombre,
        cuenta_compra: row.cuenta_compra || null,
        cuenta_venta: row.cuenta_venta || null,
        cuenta_gasto: row.cuenta_gasto || null,
        cuenta_ingreso: row.cuenta_ingreso || null,
        cuenta_compra_sugerida: sugs.cuenta_compra_sugerida,
        cuenta_venta_sugerida: sugs.cuenta_venta_sugerida,
        cuenta_gasto_sugerida: sugs.cuenta_gasto_sugerida,
        cuenta_ingreso_sugerida: sugs.cuenta_ingreso_sugerida,
        fecha_modificacion: row.fecha_modificacion,
        total_documentos: Number(row.total_documentos),
        roles,
      };
    });

    return NextResponse.json({ entities });
  } catch (error: any) {
    console.error('❌ [CC-PROVEEDORES] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
