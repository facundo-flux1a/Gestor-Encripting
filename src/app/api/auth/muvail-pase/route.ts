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
        ref: 'mock-ref-sociedad',
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

    // 3. Buscar la empresa por NIF — es fundamental porque los usuarios pueden tener N empresas
    //    y Muvail nos dice exactamente con cuál quiere entrar el usuario.
    let empresaId: number | null = null;
    if (sociedad?.nif) {
      try {
        const cifHash = hashField(sociedad.nif);
        const empresa = await prisma.empresas.findFirst({
          where: { OR: [{ cif_hash: cifHash }, { CIF: sociedad.nif }] },
          select: { id: true, id_de_usuario: true },
        });

        if (!empresa) {
          console.warn(`[muvail-pase] Empresa con NIF ${sociedad.nif} no encontrada en el Gestor.`);
        } else {
          // Verificar que el usuario realmente pertenece a esa empresa
          const usuariosDeEmpresa: number[] = Array.isArray(empresa.id_de_usuario)
            ? (empresa.id_de_usuario as any[])
            : [];
          if (usuariosDeEmpresa.includes(Number(user.id))) {
            empresaId = Number(empresa.id);
          } else {
            console.warn(
              `[muvail-pase] El usuario ${usuario.correo} no pertenece a la empresa NIF ${sociedad.nif} en el Gestor.`
            );
          }
        }
      } catch (e) {
        console.warn('[muvail-pase] Error buscando empresa por NIF:', e);
      }
    }

    // 4. Preseleccionar la empresa en Redis para que el CompanyProvider la abra directo
    if (empresaId !== null) {
      try {
        await saveSelectedCompanies(Number(user.id), [empresaId]);
      } catch (e) {
        console.warn('[muvail-pase] No se pudo guardar empresa en Redis:', e);
      }
    }

    // 5. Guardar el testigo en la DB (NUNCA se manda al browser)
    try {
      await (prisma.usuarios as any).update({
        where: { id: user.id },
        data: { muvail_testigo: testigo },
      });
    } catch (e) {
      console.warn('[muvail-pase] No se pudo guardar el testigo (¿falta ALTER TABLE?):', e);
    }

    // 6. Crear sesión normal del Gestor (igual que cualquier otro login)
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

    console.log(
      `✅ [muvail-pase] Login SSO | usuario=${usuario.correo} | empresa=${sociedad?.nombre} (ID=${empresaId}) | modo=${useMock ? 'MOCK' : 'REAL'}`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[muvail-pase] Error inesperado:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
