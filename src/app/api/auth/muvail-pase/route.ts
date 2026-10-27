import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByEmail, createSession } from '@/services/auth-service';
import { hashField } from '@/lib/encryption';
import { saveSelectedCompanies } from '@/lib/upstash';

const MUVAIL_CRM_URL = 'https://crm-263418105374.europe-southwest1.run.app';

// ---------------------------------------------------------------------------
// MOCK: simula exactamente la respuesta que devolvería el Portal de Muvail.
// Se activa con MUVAIL_MOCK=true en .env.local (NUNCA en producción).
// ---------------------------------------------------------------------------
function mockCanjearPase(pase: string) {
  if (pase === 'TEST_FAIL') {
    return {
      ok: false,
      status: 401,
      data: {
        codigo: 'PASE_NO_VALE',
        error: 'Ese pase no vale: vuelve al Portal y pulsa otra vez el cristal.',
      },
    };
  }
  return {
    ok: true,
    status: 200,
    data: {
      testigo: `mock-testigo-${Date.now()}`,
      caduca_en: new Date(Date.now() + 3600 * 1000).toISOString(),
      usuario: {
        ref: 'mock-ref-usuario',
        nombre: process.env.MUVAIL_MOCK_NOMBRE || 'Usuario Mock',
        correo: process.env.MUVAIL_MOCK_EMAIL || 'test@empresa.com',
      },
      sociedad: {
        ref: process.env.MUVAIL_MOCK_REF || 'mock-ref-sociedad',
        nombre: process.env.MUVAIL_MOCK_EMPRESA || 'Empresa Mock SL',
        nif: process.env.MUVAIL_MOCK_NIF || 'B00000000',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// REAL: llama a la API del Portal de Muvail (server → server, nunca browser)
// ---------------------------------------------------------------------------
async function realCanjearPase(pase: string) {
  const res = await fetch(`${MUVAIL_CRM_URL}/api/pase/canjear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pase, modulo: 'gestor' }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Helper: crea la sesión del Gestor para un usuario de la BD
// ---------------------------------------------------------------------------
async function crearSesion(user: any) {
  const t = (v: any) => (typeof v === 'boolean' ? Number(v) : Number(v ?? 0));
  await createSession(
    Number(user.id),
    user.email as string,
    user.nombre as string,
    t(user.tutorial),
    t(user.tutorial_documentos),
    t(user.tutorial_trimestres),
    t(user.tutorial_actividad),
    t(user.tutorial_individual),
    t(user.tutorial_incidencias),
    t(user.tutorial_proveedores),
    t(user.tutorial_health_check),
    t((user as any).tutorial_webhooks),
    t((user as any).tutorial_docs),
    (user.organization_rol as any) || 'EDITOR',
    t((user as any).tutorial_upload_queue),
    t((user as any).tutorial_cuentas_contables),
    t((user as any).tutorial_sii),
    t((user as any).tutorial_comprobantes)
  );
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pase = typeof body?.pase === 'string' ? body.pase.trim() : null;

    if (!pase) {
      return NextResponse.json({ error: 'Pase inválido.' }, { status: 400 });
    }

    // 1. Canjear el pase (mock o real según variable de entorno)
    const useMock = process.env.MUVAIL_MOCK === 'true';
    const canje = useMock ? mockCanjearPase(pase) : await realCanjearPase(pase);

    if (!canje.ok) {
      return NextResponse.json(
        { error: canje.data?.error || 'El pase no es válido. Volvé al Portal y hacé click en el cristal nuevamente.' },
        { status: 401 }
      );
    }

    const { testigo, usuario, sociedad } = canje.data;

    // 2. Buscar al usuario por email en NUESTRA base de datos
    const user = await findUserByEmail(usuario.correo);
    if (!user) {
      return NextResponse.json(
        { error: `Tu usuario del Portal (${usuario.correo}) no tiene cuenta en el Gestor. Contactá al administrador.` },
        { status: 403 }
      );
    }

    const userId = Number(user.id);

    // 3. Guardar el testigo en la DB (NUNCA se manda al browser)
    try {
      await (prisma.usuarios as any).update({
        where: { id: user.id },
        data: { muvail_testigo: testigo },
      });
    } catch (e) {
      console.warn('[muvail-pase] No se pudo guardar el testigo (¿falta ALTER TABLE?):', e);
    }

    // 4. Determinar empresa
    let empresaId: number | null = null;

    if (sociedad?.nif) {
      try {
        const cifHash = hashField(sociedad.nif);

        // Traer todas las empresas que coincidan con NIF, incluyendo el ref de Muvail
        const empresas = await (prisma.empresas as any).findMany({
          where: { OR: [{ cif_hash: cifHash }, { CIF: sociedad.nif }] },
          select: { id: true, id_de_usuario: true, nombre_de_empresa: true, muvail_sociedad_ref: true, config_roles: true },
        });

        // 4a. Match directo por sociedad.ref (ya vinculada antes) → camino feliz
        if (sociedad.ref) {
          const porRef = empresas.find(
            (e: any) =>
              e.muvail_sociedad_ref === sociedad.ref &&
              (Array.isArray(e.id_de_usuario) ? e.id_de_usuario : []).some(
                (id: any) => String(id) === String(userId)
              )
          );
          if (porRef) {
            empresaId = Number(porRef.id);
            console.log(`[muvail-pase] Match por ref=${sociedad.ref} → empresa ID=${empresaId}`);
          }
        }

        if (empresaId === null) {
          // Filtrar candidatas que pertenecen a este usuario
          const candidatas = empresas.filter((emp: any) => {
            const ids: any[] = Array.isArray(emp.id_de_usuario) ? emp.id_de_usuario : [];
            return ids.some((id) => String(id) === String(userId));
          });

          if (candidatas.length === 0) {
            console.warn(`[muvail-pase] userId=${userId} no pertenece a ninguna empresa con NIF ${sociedad.nif}`);

          } else if (candidatas.length === 1) {
            // Única candidata: la elegimos y sellamos el ref para siempre
            empresaId = Number(candidatas[0].id);
            console.log(`[muvail-pase] 1 candidata → empresa ID=${empresaId}. Guardando muvail_sociedad_ref.`);
            if (sociedad.ref) {
              (prisma.empresas as any)
                .update({ where: { id: candidatas[0].id }, data: { muvail_sociedad_ref: sociedad.ref } })
                .catch((e: any) => console.warn('[muvail-pase] No se pudo guardar muvail_sociedad_ref:', e));
            }

          } else {
            // Múltiples candidatas → el usuario tiene que elegir
            await crearSesion(user);

            // Enriquecer con el nombre del admin para que el usuario pueda distinguirlas
            const adminIds = candidatas.map((c: any) => {
              const roles: Record<string, string> =
                typeof c.config_roles === 'string' ? JSON.parse(c.config_roles) : (c.config_roles || {});
              const adminEntry = Object.entries(roles).find(([, rol]) => rol === 'ADMIN');
              return adminEntry ? Number(adminEntry[0]) : null;
            });

            const uniqueAdminIds = [...new Set(adminIds.filter(Boolean))] as number[];
            const admins = uniqueAdminIds.length
              ? await prisma.usuarios.findMany({
                  where: { id: { in: uniqueAdminIds.map((id) => BigInt(id)) } },
                  select: { id: true, nombre: true },
                })
              : [];
            const adminMap = Object.fromEntries(admins.map((a) => [Number(a.id), a.nombre]));

            const candidatasList = candidatas.map((c: any, i: number) => ({
              id: Number(c.id),
              nombre: c.nombre_de_empresa,
              adminNombre: adminIds[i] ? (adminMap[adminIds[i]!] ?? null) : null,
            }));

            console.log(`[muvail-pase] ${candidatas.length} candidatas para userId=${userId}. Pidiendo selección.`);

            return NextResponse.json({
              action: 'choose_empresa',
              candidates: candidatasList,
              muvailRef: sociedad.ref ?? null,
            });
          }
        }
      } catch (e) {
        console.warn('[muvail-pase] Error buscando empresa por NIF:', e);
      }
    }

    // 5. Preseleccionar la empresa en Redis
    if (empresaId !== null) {
      try {
        await saveSelectedCompanies(userId, [empresaId]);
      } catch (e) {
        console.warn('[muvail-pase] No se pudo guardar empresa en Redis:', e);
      }
    }

    // 6. Crear sesión normal del Gestor
    await crearSesion(user);

    console.log(
      `✅ [muvail-pase] Login SSO | usuario=${usuario.correo} | empresa=${sociedad?.nombre} (ID=${empresaId}) | modo=${useMock ? 'MOCK' : 'REAL'}`
    );

    return NextResponse.json({ action: 'ok' });
  } catch (error) {
    console.error('[muvail-pase] Error inesperado:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
