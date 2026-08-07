import { prepareTextForTts } from '@/lib/assistant-tts-prepare';
import {
  clampVoiceText,
  shouldSummarizeForVoice,
  stripMarkdownForSpeech,
} from '@/lib/assistant-voice-text';
import { summarizeTextForVoice } from '@/services/assistant-voice-summary';
import {
  isElevenLabsConfigured,
  synthesizeElevenLabsSpeech,
} from '@/services/elevenlabs-tts-service';
import { parseVoiceGender, type VoiceGender } from '@/lib/elevenlabs-voices';

export { isElevenLabsConfigured };

export type AssistantVoiceResult = {
  audioBase64: string;
  spokenText: string;
  wasSummarized: boolean;
  contentType: string;
};

export async function prepareSpokenText(
  markdownText: string,
  toolsUsed: string[] = [],
): Promise<{ spokenText: string; wasSummarized: boolean }> {
  const plain = stripMarkdownForSpeech(markdownText);
  if (!plain) {
    return { spokenText: '', wasSummarized: false };
  }

  if (shouldSummarizeForVoice(markdownText, toolsUsed)) {
    const summary = await summarizeTextForVoice(markdownText, toolsUsed);
    return { spokenText: summary, wasSummarized: true };
  }

  const spokenText = prepareTextForTts(clampVoiceText(plain));
  return { spokenText, wasSummarized: false };
}

export async function generateAssistantSpeech(
  markdownText: string,
  toolsUsed: string[] = [],
  voiceGender: VoiceGender = 'male',
): Promise<AssistantVoiceResult> {
  if (!isElevenLabsConfigured()) {
    throw new Error('La voz del asistente no está configurada.');
  }

  const { spokenText, wasSummarized } = await prepareSpokenText(markdownText, toolsUsed);
  if (!spokenText) {
    throw new Error('No hay contenido para reproducir en voz.');
  }

  const speech = await synthesizeElevenLabsSpeech({
    text: spokenText,
    voiceGender,
    optimizeLatency: process.env.ELEVENLABS_OPTIMIZE_LATENCY === 'true',
  });

  return {
    audioBase64: speech.audio.toString('base64'),
    spokenText,
    wasSummarized,
    contentType: speech.contentType,
  };
}
