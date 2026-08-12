import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const table = searchParams.get('table') || 'documentos_auditoria';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const empresaIdParam = searchParams.get('empresaId');
  const documentoIdParam = searchParams.get('documentoId');

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Obtener las empresas permitidas para el usuario
    const userEmpresas = await prisma.empresas.findMany({
      where: {
        id_de_usuario: { array_contains: user.id }
      },
      select: { id: true, nombre_de_empresa: true }
    });

    const empresaMap = new Map<number, string>();
    userEmpresas.forEach((e: { id: bigint; nombre_de_empresa: string | null }) => empresaMap.set(Number(e.id), e.nombre_de_empresa || `Empresa ${e.id}`));

    const userEmpresaIds = Array.from(empresaMap.keys()).map(id => BigInt(id));

    // Helper to serialize BigInts and parse nested JSON string details
    const processRows = (rows: any[]) => {
      return rows.map(row => {
        const item = JSON.parse(JSON.stringify(row, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ));

        if (item.detalle && typeof item.detalle === 'string') {
          try {
            item.detalle = JSON.parse(item.detalle);
          } catch {}
        }
        if (item.metadata && typeof item.metadata === 'string') {
          try {
            item.metadata = JSON.parse(item.metadata);
          } catch {}
        }

        const empId = Number(item.id_de_empresa || 0);
        item.empresa_nombre = empresaMap.get(empId) || (empId ? `Empresa #${empId}` : 'Sistema / Sin empresa');

        return item;
      });
    };

    if (table === 'documentos_auditoria') {
      const whereCondition: any = {};
      if (userEmpresaIds.length > 0) {
        whereCondition.OR = [
          { id_de_empresa: { in: userEmpresaIds } },
          ...(user.email ? [{ usuario: user.email }] : [])
        ];
      }

      if (empresaIdParam) {
        whereCondition.id_de_empresa = BigInt(empresaIdParam);
      }
      if (documentoIdParam) {
        whereCondition.documento_id = BigInt(documentoIdParam);
      }

      const rows = await prisma.documentos_auditoria.findMany({
        where: whereCondition,
        orderBy: { fecha_accion: 'desc' },
        take: limit,
      });

      return NextResponse.json({ table, rows: processRows(rows), count: rows.length });
    }

    if (table === 'eventos_sistema') {
      const whereCondition: any = {};
      if (userEmpresaIds.length > 0) {
        whereCondition.id_de_empresa = { in: userEmpresaIds };
      }

      const rows = await prisma.eventos_sistema.findMany({
        where: whereCondition,
        orderBy: { fecha: 'desc' },
        take: limit,
      });

      return NextResponse.json({ table, rows: processRows(rows), count: rows.length });
    }

    return NextResponse.json({ error: 'Tabla no válida' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ [api/audit-log] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener auditoría' }, { status: 500 });
  }
}
