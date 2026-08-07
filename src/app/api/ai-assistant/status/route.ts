import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  isAssistantAvailable,
  isFullAssistantAvailable,
} from '@/services/ai-assistant-service';
import { getConfiguredVoiceOptions } from '@/lib/elevenlabs-voices';
import { isElevenLabsConfigured } from '@/services/assistant-voice-service';

export const dynamic = 'force-dynamic';

/** GET — indica si el asistente unificado está disponible. */
export async function GET() {
  const session = await getSession();
  const voices = getConfiguredVoiceOptions();
  return NextResponse.json({
    available: isAssistantAvailable(),
    /** true = FAQ + documentos (Azure). false = solo FAQ fallback (AllBase). */
    documentsEnabled: isFullAssistantAvailable(),
    voiceEnabled: isElevenLabsConfigured(),
    voices: {
      male: voices.male ?? null,
      female: voices.female ?? null,
    },
    authenticated: Boolean(session?.userId),
  });
}
