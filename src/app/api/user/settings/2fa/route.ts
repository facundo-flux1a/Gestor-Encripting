import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser, update2FAConfig } from '@/services/user-service';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, durationHours } = body;

    if (typeof enabled !== 'boolean' || typeof durationHours !== 'number') {
      return NextResponse.json({ error: 'Invalid configuration data' }, { status: 400 });
    }

    const success = await update2FAConfig(user.id, { enabled, durationHours });

    if (!success) {
      return NextResponse.json({ error: 'Error al actualizar la configuración' }, { status: 500 });
    }

    // Al cambiar la configuración, invalidamos el "dispositivo de confianza" actual
    // para forzar que los nuevos cambios apliquen la próxima vez que inicie sesión.
    const cookieStore = await cookies();
    cookieStore.delete('trusted_device_2fa');

    return NextResponse.json({ success: true, message: 'Configuración de 2FA actualizada correctamente' });
  } catch (error) {
    console.error('Error updating 2FA settings:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { get2FAConfig } = await import('@/services/user-service');
    const config = await get2FAConfig(user.id);

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching 2FA settings:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
