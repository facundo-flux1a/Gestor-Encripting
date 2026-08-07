import {
  getConfiguredVoiceOptions,
  isElevenLabsVoiceConfigured,
  resolveVoiceForGender,
  type VoiceGender,
} from '@/lib/elevenlabs-voices';
import { prepareTextForTts } from '@/lib/assistant-tts-prepare';

export function isElevenLabsConfigured(): boolean {
  return isElevenLabsVoiceConfigured();
}

export type ElevenLabsSpeechOptions = {
  text: string;
  voiceGender?: VoiceGender;
  optimizeLatency?: boolean;
};

export type ElevenLabsSpeechResult = {
  audio: Buffer;
  contentType: string;
  modelId: string;
  voiceId: string;
  voiceName: string;
};

/** Genera audio MP3 con ElevenLabs (voz configurable). */
export async function synthesizeElevenLabsSpeech(
  opts: ElevenLabsSpeechOptions,
): Promise<ElevenLabsSpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voice = resolveVoiceForGender(opts.voiceGender ?? 'male');
  const modelId =
    process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

  if (!apiKey) {
    throw new Error('ElevenLabs no configurado (ELEVENLABS_API_KEY)');
  }

  const rawText = opts.text.trim();
  if (!rawText) {
    throw new Error('No hay texto para sintetizar');
  }

  const text = prepareTextForTts(rawText);

  // Voces clonadas suenan más naturales con estabilidad baja-media y alta similitud.
  const stability = Number(process.env.ELEVENLABS_STABILITY ?? 0.32);
  const similarityBoost = Number(process.env.ELEVENLABS_SIMILARITY_BOOST ?? 0.88);
  const style = Number(process.env.ELEVENLABS_STYLE ?? 0.45);

  const latency = opts.optimizeLatency ? '3' : '0';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?optimize_streaming_latency=${latency}&output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: Number.isFinite(stability) ? stability : 0.32,
        similarity_boost: Number.isFinite(similarityBoost) ? similarityBoost : 0.88,
        style: Number.isFinite(style) ? style : 0.45,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 300)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    audio: Buffer.from(arrayBuffer),
    contentType: res.headers.get('content-type') || 'audio/mpeg',
    modelId,
    voiceId: voice.id,
    voiceName: voice.name,
  };
}

export { getConfiguredVoiceOptions };
