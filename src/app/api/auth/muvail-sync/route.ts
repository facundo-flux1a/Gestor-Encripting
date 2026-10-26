import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';
import { hashField } from '@/lib/encryption';
import { saveSelectedCompanies } from '@/lib/upstash';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/session-config';

const MUVAIL_CRM_URL = 'https://crm-263418105374.europe-southwest1.run.app';

/**
 * GET /api/auth/muvail-sync
 *
 * El frontend llama a este endpoint periódicamente (ej: cada 60s) mientras el
 * usuario está logueado via SSO de Muvail.
 *
 * Comportamiento:
 *   - Sin testigo en DB  → usuario no entró via SSO, no hace nada
 *   - Portal responde OK → compara sociedad_activa con la empresa activa en Redis.
 *                          Si cambió, actualiza Redis (CompanyProvider la levanta)
 *   - Portal responde 401 → sesión del Portal cerrada → cierra también la del Gestor
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ action: 'none', reason: 'sin_sesion' }, { status: 401 });
    }

    // Leer el testigo de la DB (NUNCA del browser)
    const userDb = await (prisma.usuarios as any).findUnique({
      where: { id: BigInt(session.userId) },
      select: { id: true, muvail_testigo: true },
    });

    if (!userDb?.muvail_testigo) {
      // Usuario que no entró via SSO Muvail → no necesita sync
      return NextResponse.json({ action: 'none', reason: 'sin_testigo' });
    }

    // Preguntar al Portal: ¿quién soy y en qué empresa estoy ahora?
    const portalRes = await fetch(
      `${MUVAIL_CRM_URL}/api/portal/quien-soy?modulo=gestor`,
      { headers: { Authorization: `Bearer ${userDb.muvail_testigo}` } }
    );

    // 401 → el Portal cerró sesión → cerramos también la nuestra
    if (portalRes.status === 401) {
      console.log(`[muvail-sync] Portal cerró sesión para userId=${session.userId}. Cerrando Gestor.`);
      try {
        await (prisma.usuarios as any).update({
          where: { id: BigInt(session.userId) },
          data: { muvail_testigo: null },
        });
      } catch (_) {}
      // Borrar la cookie de sesión del Gestor
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({ action: 'logout', reason: 'portal_cerro_sesion' });
    }

    if (!portalRes.ok) {
      // Error transitorio → mantener sesión, reintentar en el próximo ciclo
      return NextResponse.json({ action: 'none', reason: 'portal_error_transitorio' });
    }

    const portalData = await portalRes.json();
    const sociedadActiva = portalData?.sociedad_activa;

    if (!sociedadActiva?.nif) {
      return NextResponse.json({ action: 'none', reason: 'sin_sociedad_activa' });
    }

    // Buscar la empresa por NIF en nuestra DB
    const cifHash = hashField(sociedadActiva.nif);
    const empresa = await prisma.empresas.findFirst({
      where: { OR: [{ cif_hash: cifHash }, { CIF: sociedadActiva.nif }] },
      select: { id: true, id_de_usuario: true },
    });

    if (!empresa) {
      console.warn(`[muvail-sync] Empresa NIF ${sociedadActiva.nif} no encontrada en Gestor.`);
      return NextResponse.json({ action: 'none', reason: 'empresa_no_encontrada' });
    }

    const nuevaEmpresaId = Number(empresa.id);

    // Verificar que el usuario pertenece a esa empresa
    const usuariosDeEmpresa: number[] = Array.isArray(empresa.id_de_usuario)
      ? (empresa.id_de_usuario as any[])
      : [];

    if (!usuariosDeEmpresa.includes(session.userId)) {
      console.warn(`[muvail-sync] userId=${session.userId} no pertenece a empresa ID ${nuevaEmpresaId}`);
      return NextResponse.json({ action: 'none', reason: 'usuario_no_en_empresa' });
    }

    // Actualizar empresa activa en Redis → CompanyProvider la detecta y cambia la vista
    await saveSelectedCompanies(session.userId, [nuevaEmpresaId]);

    console.log(
      `✅ [muvail-sync] Empresa sincronizada | userId=${session.userId} | empresaId=${nuevaEmpresaId}`
    );

    return NextResponse.json({ action: 'empresa_actualizada', empresaId: nuevaEmpresaId });
  } catch (error) {
    console.error('[muvail-sync] Error inesperado:', error);
    return NextResponse.json({ action: 'none', reason: 'error_interno' }, { status: 500 });
  }
}
