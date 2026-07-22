/**
 * Cliente Azure OpenAI / Azure AI Foundry (chat completions).
 * Usado para paginate / repair / fallback LLM — no para extract primario (Azure DI).
 */

export type AzureOpenAiCallOpts = {
  prompt: string;
  fileBuffer?: Buffer;
  mimeType?: string;
  /** Si true, pide JSON (response_format json_object). */
  json?: boolean;
  maxCompletionTokens?: number;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} en el entorno`);
  return v;
}

export function isAzureOpenAiConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT?.trim() &&
      process.env.AZURE_OPENAI_API_KEY?.trim() &&
      process.env.AZURE_OPENAI_DEPLOYMENT?.trim()
  );
}

export function getLlmProvider(): 'azure-openai' | 'vertex' {
  const p = (process.env.LLM_PROVIDER || process.env.EXTRACT_LLM || 'azure-openai')
    .toLowerCase()
    .trim();
  if (p === 'vertex' || p === 'gemini') return 'vertex';
  if (p === 'azure-openai' || p === 'openai' || p === 'azure' || !p) {
    if (!isAzureOpenAiConfigured()) {
      console.warn('[AzureOpenAI] LLM_PROVIDER=azure-openai pero faltan credenciales → vertex');
      return 'vertex';
    }
    return 'azure-openai';
  }
  return isAzureOpenAiConfigured() ? 'azure-openai' : 'vertex';
}

function chatUrl(): string {
  const base = requireEnv('AZURE_OPENAI_ENDPOINT').replace(/\/$/, '');
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview';
  if (base.includes('/openai/deployments/')) {
    return `${base}/chat/completions?api-version=${apiVersion}`;
  }
  // Foundry / models hub: .../models/chat/completions
  if (base.endsWith('/models')) {
    return `${base}/chat/completions?api-version=${apiVersion}`;
  }
  return `${base}/models/chat/completions?api-version=${apiVersion}`;
}

function buildUserContent(
  prompt: string,
  fileBuffer?: Buffer,
  mimeType?: string
): string | Array<Record<string, unknown>> {
  if (!fileBuffer || fileBuffer.length === 0) return prompt;

  const mime = mimeType || 'application/octet-stream';
  const b64 = fileBuffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  const isImage = mime.startsWith('image/');

  if (isImage) {
    return [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ];
  }

  // PDF / otros: Foundry chat completions acepta type=file (no image_url con application/pdf)
  const filename =
    mime.includes('pdf') ? 'document.pdf' : mime.startsWith('image/') ? 'document.png' : 'document.bin';

  return [
    { type: 'text', text: prompt },
    {
      type: 'file',
      file: {
        filename,
        file_data: dataUrl,
      },
    },
  ];
}

export async function callAzureOpenAiChat(opts: AzureOpenAiCallOpts): Promise<{
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const key = requireEnv('AZURE_OPENAI_API_KEY');
  const deployment = requireEnv('AZURE_OPENAI_DEPLOYMENT');
  const url = chatUrl();

  const body: Record<string, unknown> = {
    model: deployment,
    messages: [
      {
        role: 'user',
        content: buildUserContent(opts.prompt, opts.fileBuffer, opts.mimeType),
      },
    ],
    max_completion_tokens: opts.maxCompletionTokens ?? 16384,
  };
  // Algunos deployments Foundry (p.ej. gpt-5.x) solo admiten temperature=1 (default)
  if (process.env.AZURE_OPENAI_TEMPERATURE !== 'omit') {
    const t = process.env.AZURE_OPENAI_TEMPERATURE;
    if (t === undefined || t === '') {
      /* omit — default del modelo */
    } else {
      body.temperature = Number(t);
    }
  }

  if (opts.json !== false) {
    body.response_format = { type: 'json_object' };
  }

  console.log(
    `[AzureOpenAI] 🚀 POST deployment=${deployment} bytes=${opts.fileBuffer?.length ?? 0} mime=${opts.mimeType || 'text'}`
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error(`[AzureOpenAI] ❌ HTTP ${res.status}: ${raw.slice(0, 500)}`);
    const err: any = new Error(`Azure OpenAI ${res.status}: ${raw.slice(0, 200)}`);
    err.status = res.status;
    err.statusCode = res.status;
    throw err;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Azure OpenAI: respuesta no JSON: ${raw.slice(0, 200)}`);
  }

  const text = parsed.choices?.[0]?.message?.content || '';
  const usage = parsed.usage;
  console.log(
    `[AzureOpenAI] 📬 OK tokens=${usage?.total_tokens ?? '?'} finish=${parsed.choices?.[0]?.finish_reason}`
  );

  return { text, usage };
}

/** Parsea JSON de la respuesta (limpia fences si vienen). */
export function parseLlmJson(text: string): any {
  let t = (text || '').trim();
  if (t.includes('```')) {
    t = t.replace(/```json\n?|```/g, '').trim();
  }
  // Si el modelo devolvió un array suelto, response_format json_object a veces lo envuelve
  const parsed = JSON.parse(t);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.documents)) {
    return parsed.documents;
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pages)) {
    return parsed.pages;
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
    return parsed.items;
  }
  return parsed;
}
