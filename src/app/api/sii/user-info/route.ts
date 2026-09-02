import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const empresaIdParam = searchParams.get('empresa_id');

    let companyIds: bigint[] = [];

    if (empresaIdParam && empresaIdParam !== 'all') {
      const ids = empresaIdParam.split(',').map(id => BigInt(id.trim())).filter(Boolean);
      if (ids.length > 0) companyIds = ids;
    }

    // Obtener empresas asociadas al usuario o filtrar por empresaIdParam
    const empresasRaw = await prisma.empresas.findMany({
      where: companyIds.length > 0 ? { id: { in: companyIds } } : {},
      select: {
        id: true,
        nombre_de_empresa: true,
        nombre_fiscal: true,
        CIF: true,
        delsol_api_cliente: true,
        delsol_api_base_datos: true,
      },
      take: 20
    });

    const empresas = empresasRaw.map((e: any) => ({
      id: Number(e.id),
      nombre_de_empresa: e.nombre_de_empresa || 'Empresa',
      nombre_fiscal: e.nombre_fiscal || e.nombre_de_empresa || '',
      cif: e.CIF || '',
      hasDelsol: !!(e.delsol_api_cliente && e.delsol_api_base_datos),
    }));

    // Estadísticas de documentos SII (Pendientes vs Enviados)
    const filterWhere: any = {};
    if (companyIds.length > 0) {
      filterWhere.id_de_empresa = { in: companyIds };
    }

    const [pendientes, enviados, total] = await Promise.all([
      prisma.documentos.count({
        where: {
          ...filterWhere,
          OR: [{ enviado_sii: false }, { enviado_sii: null }]
        }
      }),
      prisma.documentos.count({
        where: {
          ...filterWhere,
          enviado_sii: true
        }
      }),
      prisma.documentos.count({
        where: filterWhere
      })
    ]);

    return NextResponse.json({
      success: true,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
      },
      empresas,
      estadisticas: {
        pendientes,
        enviados,
        total,
      },
      entorno_sii: process.env.SII_ENVIRONMENT || 'pruebas',
    });
  } catch (error: any) {
    console.error('❌ [API GET /api/sii/user-info] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error al obtener información de usuario para SII'
      },
      { status: 500 }
    );
  }
}
