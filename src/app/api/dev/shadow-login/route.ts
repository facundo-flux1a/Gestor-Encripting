import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/services/auth-service';
import { saveSelectedCompanies } from '@/lib/upstash';

// ---------------------------------------------------------------------------
// POST /api/dev/shadow-login
//
// Endpoint privado de impersonación para administradores.
// Requiere ADMIN_SHADOW_SECRET en las variables de entorno.
// NUNCA exponer esto en producción sin esa variable configurada.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.ADMIN_SHADOW_SECRET;

    if (!secret) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const body = await req.json();
    const { adminKey, userId } = body;

    // 1. Validar la clave de admin
    if (!adminKey || adminKey !== secret) {
      return NextResponse.json({ error: 'Acceso denegado.' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId requerido.' }, { status: 400 });
    }

    // 2. Buscar el usuario en la DB
    const user = await (prisma.usuarios as any).findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    }

    // 3. Buscar TODAS las empresas del usuario y pre-seleccionarlas en Redis
    //    Así el CompanyProvider las muestra todas seleccionadas al entrar.
    try {
      const todasLasEmpresas = await prisma.empresas.findMany({
        select: { id: true, id_de_usuario: true },
      });

      const empresasDelUsuario = todasLasEmpresas
        .filter((e) => {
          const ids: any[] = Array.isArray(e.id_de_usuario) ? (e.id_de_usuario as any[]) : [];
          // Comparar como string Y como número por si el JSON lo guarda de distinta forma
          return ids.some((id) => String(id) === String(userId));
        })
        .map((e) => Number(e.id));

      if (empresasDelUsuario.length > 0) {
        await saveSelectedCompanies(Number(userId), empresasDelUsuario);
        console.log(`🏢 [shadow-login] Empresas pre-cargadas para userId=${userId}:`, empresasDelUsuario);
      }
    } catch (e) {
      console.warn('[shadow-login] No se pudieron pre-cargar empresas en Redis:', e);
    }

    // 4. Crear sesión como ese usuario (mismo flujo que el login normal)
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
      t(user.tutorial_webhooks),
      t(user.tutorial_docs),
      (user.organization_rol as any) || 'EDITOR',
      t(user.tutorial_upload_queue),
      t(user.tutorial_cuentas_contables),
      t(user.tutorial_sii),
      t(user.tutorial_comprobantes)
    );

    console.log(`🔑 [shadow-login] Admin impersonó a userId=${userId} (${user.email})`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[shadow-login] Error inesperado:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// GET /api/dev/shadow-login — devuelve la lista de usuarios (también requiere secret en header)
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.ADMIN_SHADOW_SECRET;

    if (!secret) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const adminKey = req.headers.get('x-admin-key');
    if (!adminKey || adminKey !== secret) {
      return NextResponse.json({ error: 'Acceso denegado.' }, { status: 401 });
    }

    const usuarios = await prisma.usuarios.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        organization_rol: true,
        id_de_empresa: true,
      },
      orderBy: { id: 'asc' },
    });

    const result = usuarios.map((u) => ({
      id: Number(u.id),
      nombre: u.nombre ?? '(sin nombre)',
      email: u.email ?? '(sin email)',
      rol: u.rol,
      organization_rol: u.organization_rol,
      empresa_id: u.id_de_empresa ? Number(u.id_de_empresa) : null,
    }));

    return NextResponse.json({ usuarios: result });
  } catch (error) {
    console.error('[shadow-login] Error listando usuarios:', error);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
