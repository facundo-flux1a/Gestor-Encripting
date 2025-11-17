// app/api/column-order/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { saveColumnOrder, getColumnOrder, deleteColumnOrder } from '@/lib/upstash';

// ========================================
// GET - Obtener orden de columnas guardado
// ========================================
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ Validar sesión
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2️⃣ Obtener viewId desde query params
    const { searchParams } = new URL(request.url);
    const viewId = searchParams.get('viewId');

    if (!viewId) {
      return NextResponse.json(
        { error: 'viewId es requerido' },
        { status: 400 }
      );
    }

    // 3️⃣ Obtener orden desde Redis
    const columnOrder = await getColumnOrder(session.userId, viewId);

    if (!columnOrder) {
      return NextResponse.json(
        { columnOrder: null, message: 'No hay orden guardado' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      columnOrder,
      viewId,
      userId: session.userId,
    });

  } catch (error) {
    console.error('❌ [API] Error en GET /api/column-order:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ========================================
// POST - Guardar orden de columnas
// ========================================
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ Validar sesión
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2️⃣ Parsear body
    const body = await request.json();
    const { viewId, columnOrder } = body;

    // 3️⃣ Validar datos
    if (!viewId || !Array.isArray(columnOrder)) {
      return NextResponse.json(
        { error: 'viewId y columnOrder (array) son requeridos' },
        { status: 400 }
      );
    }

    if (columnOrder.length === 0) {
      return NextResponse.json(
        { error: 'columnOrder no puede estar vacío' },
        { status: 400 }
      );
    }

    // 4️⃣ Guardar en Redis
    const success = await saveColumnOrder(session.userId, viewId, columnOrder);

    if (!success) {
      return NextResponse.json(
        { error: 'Error guardando en Redis' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Orden guardado correctamente',
      viewId,
      columnCount: columnOrder.length,
    });

  } catch (error) {
    console.error('❌ [API] Error en POST /api/column-order:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ========================================
// DELETE - Resetear orden de columnas
// ========================================
export async function DELETE(request: NextRequest) {
  try {
    // 1️⃣ Validar sesión
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // 2️⃣ Obtener viewId desde query params
    const { searchParams } = new URL(request.url);
    const viewId = searchParams.get('viewId');

    if (!viewId) {
      return NextResponse.json(
        { error: 'viewId es requerido' },
        { status: 400 }
      );
    }

    // 3️⃣ Eliminar de Redis
    const success = await deleteColumnOrder(session.userId, viewId);

    if (!success) {
      return NextResponse.json(
        { error: 'Error eliminando de Redis' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Orden reseteado correctamente',
      viewId,
    });

  } catch (error) {
    console.error('❌ [API] Error en DELETE /api/column-order:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}