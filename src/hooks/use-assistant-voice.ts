'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceGender } from '@/lib/elevenlabs-voices';

const SPEECH_ENDPOINT = '/api/ai-assistant/speech';
const SPOKEN_TEXT_ENDPOINT = '/api/ai-assistant/spoken-text';

export type SpokenTextResult = {
  spokenText: string;
  wasSummarized: boolean;
  hasDetail: boolean;
};

type QueuedPlay = {
  messageId: string;
  text: string;
  toolsUsed?: string[];
  voiceGender: VoiceGender;
};

export function useAssistantVoice(voiceGender: VoiceGender = 'male') {
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const playQueueRef = useRef<QueuedPlay[]>([]);
  const playingRef = useRef(false);
  const voiceGenderRef = useRef(voiceGender);

  useEffect(() => {
    voiceGenderRef.current = voiceGender;
  }, [voiceGender]);

  const cleanupBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playQueueRef.current = [];
    playingRef.current = false;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    audioRef.current = null;
    setSpeakingMessageId(null);
    setLoadingVoiceId(null);
  }, []);

  useEffect(() => () => {
    stop();
    cleanupBlob();
  }, [stop, cleanupBlob]);

  const fetchSpokenText = useCallback(
    async (text: string, toolsUsed?: string[]): Promise<SpokenTextResult> => {
      const res = await fetch(SPOKEN_TEXT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, toolsUsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No pudimos preparar el resumen.');
      return {
        spokenText: data.spokenText ?? text,
        wasSummarized: Boolean(data.wasSummarized),
        hasDetail: Boolean(data.hasDetail),
      };
    },
    [],
  );

  const playMessageInternal = useCallback(
    async (messageId: string, text: string, toolsUsed: string[] | undefined, gender: VoiceGender) => {
      cleanupBlob();
      setLoadingVoiceId(messageId);

      try {
        const res = await fetch(SPEECH_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, toolsUsed, voiceGender: gender }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No pudimos generar la voz.');

        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: data.contentType || 'audio/mpeg' });
        blobUrlRef.current = URL.createObjectURL(blob);

        const audio = new Audio(blobUrlRef.current);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            setSpeakingMessageId(null);
            audioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            setSpeakingMessageId(null);
            audioRef.current = null;
            reject(new Error('No se pudo reproducir el audio.'));
          };

          setSpeakingMessageId(messageId);
          audio.play().catch(reject);
        });
      } finally {
        setLoadingVoiceId(null);
      }
    },
    [cleanupBlob],
  );

  const drainPlayQueue = useCallback(async () => {
    if (playingRef.current) return;
    const next = playQueueRef.current.shift();
    if (!next) return;

    playingRef.current = true;
    try {
      await playMessageInternal(next.messageId, next.text, next.toolsUsed, next.voiceGender);
    } catch (err) {
      console.warn('[assistant-voice] Error reproduciendo:', err);
    } finally {
      playingRef.current = false;
      if (playQueueRef.current.length > 0) {
        void drainPlayQueue();
      }
    }
  }, [playMessageInternal]);

  const playMessage = useCallback(
    (messageId: string, text: string, toolsUsed?: string[]) => {
      playQueueRef.current.push({
        messageId,
        text,
        toolsUsed,
        voiceGender: voiceGenderRef.current,
      });
      void drainPlayQueue();
    },
    [drainPlayQueue],
  );

  return {
    speakingMessageId,
    loadingVoiceId,
    fetchSpokenText,
    playMessage,
    stop,
    isSpeaking: speakingMessageId !== null,
  };
}
