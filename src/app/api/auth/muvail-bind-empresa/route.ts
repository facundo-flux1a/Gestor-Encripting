import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { prisma } from '@/lib/prisma';
import { saveSelectedCompanies } from '@/lib/upstash';

/**
 * POST /api/auth/muvail-bind-empresa
 *
 * Llamado desde /auth/portal cuando el usuario tiene múltiples empresas
 * candidatas con el mismo CIF y necesita elegir manualmente.
 *
 * Body: { empresaId: number, muvailRef: string | null }
 *
 * Hace dos cosas:
 * 1. Guarda muvail_sociedad_ref en la empresa elegida (para que las próximas
 *    veces el match sea directo por ref, sin ambigüedad).
 * 2. Preselecciona la empresa en Redis (CompanyProvider la abre al entrar).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const empresaId = typeof body?.empresaId === 'number' ? body.empresaId : null;
    const muvailRef = typeof body?.muvailRef === 'string' ? body.muvailRef : null;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });
    }

    // Verificar que la empresa pertenece al usuario autenticado
    const empresa = await (prisma.empresas as any).findUnique({
      where: { id: BigInt(empresaId) },
      select: { id: true, id_de_usuario: true },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const ids: any[] = Array.isArray(empresa.id_de_usuario) ? empresa.id_de_usuario : [];
    const pertenece = ids.some((id) => String(id) === String(session.userId));

    if (!pertenece) {
      return NextResponse.json({ error: 'No tenés acceso a esa empresa' }, { status: 403 });
    }

    // Guardar ref de Muvail para que el próximo login sea directo (sin pantalla de selección)
    if (muvailRef) {
      try {
        await (prisma.empresas as any).update({
          where: { id: BigInt(empresaId) },
          data: { muvail_sociedad_ref: muvailRef },
        });
        console.log(`[muvail-bind] muvail_sociedad_ref="${muvailRef}" sellado en empresa ID=${empresaId} para userId=${session.userId}`);
      } catch (e) {
        console.warn('[muvail-bind] No se pudo guardar muvail_sociedad_ref:', e);
      }
    }

    // Preseleccionar en Redis para que CompanyProvider la abra al entrar al dashboard
    await saveSelectedCompanies(session.userId, [empresaId]);

    console.log(`✅ [muvail-bind] Empresa ID=${empresaId} seleccionada para userId=${session.userId}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[muvail-bind] Error inesperado:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
