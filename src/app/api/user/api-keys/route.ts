import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { generateApiKey, listApiKeys } from '@/services/api-key-service';

export const dynamic = 'force-dynamic';

// GET — Listar claves del usuario autenticado
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const keys = await listApiKeys(user.id);
    return NextResponse.json(keys);
  } catch (error) {
    console.error('❌ [api/user/api-keys GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener claves' }, { status: 500 });
  }
}

// POST — Crear nueva clave
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { nombre, empresa_id } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre/etiqueta es obligatorio' }, { status: 400 });
    }

    if (!empresa_id || isNaN(Number(empresa_id))) {
      return NextResponse.json({ error: 'empresa_id inválido' }, { status: 400 });
    }

    const result = await generateApiKey({
      nombre: nombre.trim(),
      empresa_id: Number(empresa_id),
      usuario_id: user.id
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // raw_key se envía una sola vez en esta respuesta
    return NextResponse.json({
      success: true,
      raw_key: result.raw_key,
      key: result.key
    }, { status: 201 });

  } catch (error) {
    console.error('❌ [api/user/api-keys POST] Error:', error);
    return NextResponse.json({ error: 'Error al crear la clave' }, { status: 500 });
  }
}
