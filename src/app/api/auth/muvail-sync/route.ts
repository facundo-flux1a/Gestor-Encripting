import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';
import { hashField } from '@/lib/encryption';
import { saveSelectedCompanies } from '@/lib/upstash';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/session-config';

const MUVAIL_CRM_URL = process.env.MUVAIL_CRM_URL ?? 'https://crm-263418105374.europe-southwest1.run.app';

/**
 * GET /api/auth/muvail-sync
 *
 * El frontend llama a este endpoint periódicamente (cada 60s) mientras el
 * usuario está logueado via SSO de Muvail.
 *
 * Comportamiento:
 *   - Sin testigo en DB  → usuario no entró via SSO, no hace nada
 *   - Portal responde OK → si cambió de empresa, actualiza Redis
 *   - Portal responde 401 → sesión del Portal cerrada → cierra también la del Gestor
 *
 * MODO MOCK (MUVAIL_MOCK=true):
 *   - No llama al Portal real (evita que el testigo falso cause logout)
 *   - MUVAIL_MOCK_LOGOUT=true  → simula que el Portal cerró sesión
 *   - MUVAIL_MOCK_NIF2=B...    → simula cambio de empresa activa
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

    // ── MOCK ────────────────────────────────────────────────────────────────
    if (process.env.MUVAIL_MOCK === 'true') {
      // Simular logout del Portal
      if (process.env.MUVAIL_MOCK_LOGOUT === 'true') {
        console.log('[muvail-sync] MOCK: simulando logout del Portal');
        try {
          await (prisma.usuarios as any).update({
            where: { id: BigInt(session.userId) },
            data: { muvail_testigo: null },
          });
        } catch (_) {}
        const cookieStore = await cookies();
        cookieStore.delete(SESSION_COOKIE_NAME);
        return NextResponse.json({ action: 'logout', reason: 'mock_logout' });
      }

      // Simular cambio de empresa activa
      const nifAlternativo = process.env.MUVAIL_MOCK_NIF2;
      if (nifAlternativo) {
        const cifHash = hashField(nifAlternativo);
        // findMany porque puede haber varias empresas con el mismo NIF (distintos clientes)
        const empresas = await prisma.empresas.findMany({
          where: { OR: [{ cif_hash: cifHash }, { CIF: nifAlternativo }] },
          select: { id: true, id_de_usuario: true },
        });
        const miEmpresa = empresas.find((emp) => {
          const ids: any[] = Array.isArray(emp.id_de_usuario) ? (emp.id_de_usuario as any[]) : [];
          return ids.some((id) => String(id) === String(session.userId));
        });
        if (miEmpresa) {
          const nuevaEmpresaId = Number(miEmpresa.id);
          await saveSelectedCompanies(session.userId, [nuevaEmpresaId]);
          console.log(`[muvail-sync] MOCK: empresa cambiada a ID=${nuevaEmpresaId}`);
          return NextResponse.json({ action: 'empresa_actualizada', empresaId: nuevaEmpresaId });
        }
        console.warn(`[muvail-sync] MOCK: userId=${session.userId} no pertenece a ninguna empresa con NIF ${nifAlternativo}`);
      }

      // Sin cambios — sesión activa, nada que hacer
      return NextResponse.json({ action: 'none', reason: 'mock_ok' });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Preguntar al Portal: ¿quién soy y en qué empresa estoy ahora?
    const portalRes = await fetch(
      `${MUVAIL_CRM_URL}/api/portal/quien-soy?modulo=gestor`,
      { headers: { Authorization: `Bearer ${userDb.muvail_testigo}` } }
    );

    // 401 → sesión del Portal cerrada / 403 → acceso revocado (licencia, 2FA, bloqueo)
    // En ambos casos cerramos también la sesión del Gestor y borramos el testigo.
    if (portalRes.status === 401 || portalRes.status === 403) {
      const reason = portalRes.status === 403 ? 'acceso_revocado' : 'sesion_cerrada';
      console.log(`[muvail-sync] Portal devolvió ${portalRes.status} (${reason}) para userId=${session.userId}. Cerrando Gestor.`);
      try {
        await (prisma.usuarios as any).update({
          where: { id: BigInt(session.userId) },
          data: { muvail_testigo: null },
        });
      } catch (_) {}
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

    // Buscar empresa por NIF — findMany para manejar NIFs duplicados entre usuarios distintos
    const cifHash = hashField(sociedadActiva.nif);
    const empresas = await (prisma.empresas as any).findMany({
      where: { OR: [{ cif_hash: cifHash }, { CIF: sociedadActiva.nif }] },
      select: { id: true, id_de_usuario: true, muvail_sociedad_ref: true },
    });

    if (empresas.length === 0) {
      console.warn(`[muvail-sync] Empresa NIF ${sociedadActiva.nif} no encontrada en Gestor.`);
      return NextResponse.json({ action: 'none', reason: 'empresa_no_encontrada' });
    }

    // Prioridad 1: match directo por ref ya sellado
    let miEmpresa = sociedadActiva.ref
      ? empresas.find(
          (e: any) =>
            e.muvail_sociedad_ref === sociedadActiva.ref &&
            (Array.isArray(e.id_de_usuario) ? e.id_de_usuario : []).some(
              (id: any) => String(id) === String(session.userId)
            )
        )
      : undefined;

    // Prioridad 2: filtrar por userId (puede haber duplicados de NIF entre usuarios)
    if (!miEmpresa) {
      miEmpresa = empresas.find((emp: any) => {
        const ids: any[] = Array.isArray(emp.id_de_usuario) ? emp.id_de_usuario : [];
        return ids.some((id) => String(id) === String(session.userId));
      });
    }

    if (!miEmpresa) {
      console.warn(`[muvail-sync] userId=${session.userId} no pertenece a ninguna empresa con NIF ${sociedadActiva.nif}`);
      return NextResponse.json({ action: 'none', reason: 'usuario_no_en_empresa' });
    }

    const nuevaEmpresaId = Number(miEmpresa.id);

    // Actualizar empresa activa en Redis → CompanyProvider la detecta y cambia la vista
    await saveSelectedCompanies(session.userId, [nuevaEmpresaId]);

    console.log(`✅ [muvail-sync] Empresa sincronizada | userId=${session.userId} | empresaId=${nuevaEmpresaId}`);

    return NextResponse.json({ action: 'empresa_actualizada', empresaId: nuevaEmpresaId });
  } catch (error) {
    console.error('[muvail-sync] Error inesperado:', error);
    return NextResponse.json({ action: 'none', reason: 'error_interno' }, { status: 500 });
  }
}
