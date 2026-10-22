import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { muvailService } from '@/services/muvail-service';

/**
 * GET /api/muvail/test?cifSociedad=...&nif=...
 *
 * Endpoint de diagnóstico interno para probar la conectividad con Muvail
 * desde el servidor sin exponer la clave API al cliente.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cifSociedad = searchParams.get('cifSociedad');
    const nif = searchParams.get('nif');

    if (!cifSociedad) {
      return NextResponse.json(
        { error: 'Falta el parámetro cifSociedad (CIF de la empresa en Muvail)' },
        { status: 400 }
      );
    }

    if (nif) {
      const tercero = await muvailService.buscarPorNif(cifSociedad, nif);
      return NextResponse.json({
        success: true,
        encontrado: Boolean(tercero),
        tercero,
      });
    }

    // Si no hay NIF, prueba de ping básico
    return NextResponse.json({
      success: true,
      message: 'Muvail endpoint de test activo',
      configured: Boolean(process.env.MUVAIL_API_KEY),
    });
  } catch (error: any) {
    console.error('[API MUVAIL TEST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error interno',
      },
      { status: 500 }
    );
  }
}
