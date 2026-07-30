import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { getNotifPrefs, updateNotifPrefs } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const prefs = await getNotifPrefs(user.id);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const body = await req.json();
    // body = { tipo: boolean, ... } — merge sobre las prefs existentes
    const current = await getNotifPrefs(user.id);
    const updated = { ...current, ...body };
    const ok = await updateNotifPrefs(user.id, updated);
    if (!ok) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    return NextResponse.json({ success: true, prefs: updated });
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }
}
