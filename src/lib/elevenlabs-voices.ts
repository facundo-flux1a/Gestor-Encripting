export type VoiceGender = 'male' | 'female';

export type VoiceOption = {
  id: string;
  name: string;
};

function envVoice(idKey: string, nameKey: string, fallbackId?: string): VoiceOption | null {
  const id = process.env[idKey]?.trim() || fallbackId?.trim();
  if (!id) return null;
  const name = process.env[nameKey]?.trim() || (idKey.includes('FEMALE') ? 'Femenina' : 'Masculina');
  return { id, name };
}

export function getConfiguredVoiceOptions(): Partial<Record<VoiceGender, VoiceOption>> {
  const male = envVoice(
    'ELEVENLABS_VOICE_ID_MALE',
    'ELEVENLABS_VOICE_NAME_MALE',
    process.env.ELEVENLABS_VOICE_ID,
  );
  const female = envVoice('ELEVENLABS_VOICE_ID_FEMALE', 'ELEVENLABS_VOICE_NAME_FEMALE');

  const options: Partial<Record<VoiceGender, VoiceOption>> = {};
  if (male) options.male = male;
  if (female) options.female = female;
  return options;
}

export function isElevenLabsVoiceConfigured(): boolean {
  return Object.keys(getConfiguredVoiceOptions()).length > 0;
}

export function resolveVoiceForGender(gender: VoiceGender): VoiceOption {
  const options = getConfiguredVoiceOptions();
  const picked = options[gender] ?? options.male ?? options.female;
  if (!picked) {
    throw new Error('No hay voces de ElevenLabs configuradas.');
  }
  return picked;
}

export function parseVoiceGender(value: unknown): VoiceGender {
  return value === 'female' ? 'female' : 'male';
}
