import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { prepareSpokenText } from '@/services/assistant-voice-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** POST — texto conversacional para mostrar / leer (sin generar audio). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: { text?: string; toolsUsed?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'Falta el texto.' }, { status: 400 });
  }

  try {
    const { spokenText, wasSummarized } = await prepareSpokenText(
      text,
      Array.isArray(body.toolsUsed) ? body.toolsUsed.filter((t) => typeof t === 'string') : [],
    );

    return NextResponse.json({
      spokenText: spokenText || text,
      wasSummarized,
      hasDetail: wasSummarized || spokenText !== text,
    });
  } catch (error) {
    console.error('[ai-assistant/spoken-text]', error);
    return NextResponse.json({ error: 'No pudimos preparar el resumen.' }, { status: 502 });
  }
}
