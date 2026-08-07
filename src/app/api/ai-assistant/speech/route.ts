import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  generateAssistantSpeech,
  isElevenLabsConfigured,
} from '@/services/assistant-voice-service';
import { parseVoiceGender } from '@/lib/elevenlabs-voices';

export const runtime = 'nodejs';
export const maxDuration = 45;

/** POST — sintetiza voz (ElevenLabs) con resumen automático si la respuesta es larga. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Tienes que iniciar sesión para usar la voz del asistente.' },
      { status: 401 },
    );
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { error: 'La voz del asistente no está disponible en este momento.' },
      { status: 503 },
    );
  }

  let body: { text?: string; toolsUsed?: string[]; voiceGender?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'Falta el texto a leer.' }, { status: 400 });
  }

  try {
    const result = await generateAssistantSpeech(
      text,
      Array.isArray(body.toolsUsed) ? body.toolsUsed.filter((t) => typeof t === 'string') : [],
      parseVoiceGender(body.voiceGender),
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[ai-assistant/speech]', error);
    const msg =
      error instanceof Error ? error.message : 'No pudimos generar el audio.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
