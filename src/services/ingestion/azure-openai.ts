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
  /** URL pública de imagen de ejemplo para few-shot visual prompting */
  exampleImageUrl?: string;
};

// Cache en memoria para la imagen de ejemplo (se descarga 1 sola vez por proceso)
let _exampleImageCache: { b64: string; mime: string } | null = null;

async function fetchExampleImage(url: string): Promise<{ b64: string; mime: string } | null> {
  if (_exampleImageCache) return _exampleImageCache;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get('content-type') || 'image/jpeg';
    _exampleImageCache = { b64: Buffer.from(buf).toString('base64'), mime };
    return _exampleImageCache;
  } catch {
    return null;
  }
}

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

export function getLlmProvider(): 'azure-openai' {
  if (!isAzureOpenAiConfigured()) {
    throw new Error(
      'Azure OpenAI no configurado. Define AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY y AZURE_OPENAI_DEPLOYMENT.'
    );
  }
  return 'azure-openai';
}

export function assertAzureOpenAiConfigured(): void {
  getLlmProvider();
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

async function buildUserContent(
  prompt: string,
  fileBuffer?: Buffer,
  mimeType?: string,
  exampleImageUrl?: string
): Promise<string | Array<Record<string, unknown>>> {
  if (!fileBuffer || fileBuffer.length === 0) return prompt;

  const mime = mimeType || 'application/octet-stream';
  const b64 = fileBuffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  const isImage = mime.startsWith('image/');

  // Prefijo de ejemplo (few-shot visual prompting) si hay URL configurada
  const exampleParts: Array<Record<string, unknown>> = [];
  if (exampleImageUrl) {
    const example = await fetchExampleImage(exampleImageUrl);
    if (example) {
      exampleParts.push({
        type: 'text',
        text: 'REFERENCIA VISUAL: En algunas facturas el CIF del proveedor aparece impreso verticalmente (rotado 90°) en el margen izquierdo o inferior de cada página, como se muestra en esta imagen de ejemplo. DEBES buscarlo ahí también:',
      });
      exampleParts.push({
        type: 'image_url',
        image_url: { url: `data:${example.mime};base64,${example.b64}` },
      });
      exampleParts.push({
        type: 'text',
        text: 'Ahora analiza el siguiente documento real y extrae todos los datos, incluyendo el CIF que pueda aparecer rotado en los márgenes:',
      });
    }
  }

  if (isImage) {
    return [
      { type: 'text', text: prompt },
      ...exampleParts,
      { type: 'image_url', image_url: { url: dataUrl } },
    ];
  }

  // PDF / otros: Foundry chat completions acepta type=file
  const filename =
    mime.includes('pdf') ? 'document.pdf' : mime.startsWith('image/') ? 'document.png' : 'document.bin';

  return [
    { type: 'text', text: prompt },
    ...exampleParts,
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

  // URL de imagen de ejemplo para few-shot visual prompting (configurable en .env)
  const exampleImageUrl =
    opts.exampleImageUrl ??
    process.env.OPENAI_EXAMPLE_CIF_IMAGE_URL ??
    undefined;

  const body: Record<string, unknown> = {
    model: deployment,
    messages: [
      {
        role: 'user',
        content: await buildUserContent(opts.prompt, opts.fileBuffer, opts.mimeType, exampleImageUrl),
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

/**
 * Llama al LLM con múltiples imágenes PNG como contexto visual.
 * Usado como fallback de visión cuando el OCR produce resultados poco confiables.
 * El prompt puede incluir el texto OCR ya extraído como contexto complementario.
 */
export async function callAzureOpenAiChatWithImages(opts: {
  prompt: string;
  images: Buffer[];
  json?: boolean;
  maxCompletionTokens?: number;
}): Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  const key = requireEnv('AZURE_OPENAI_API_KEY');
  const deployment = requireEnv('AZURE_OPENAI_DEPLOYMENT');
  const url = chatUrl();

  const imageParts = opts.images.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${img.toString('base64')}` },
  }));

  const content = [
    { type: 'text', text: opts.prompt },
    ...imageParts,
  ];

  const body: Record<string, unknown> = {
    model: deployment,
    messages: [{ role: 'user', content }],
    max_completion_tokens: opts.maxCompletionTokens ?? 16384,
  };

  if (opts.json !== false) {
    body.response_format = { type: 'json_object' };
  }

  console.log(`[AzureOpenAI] 🖼️  POST vision deployment=${deployment} images=${opts.images.length}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error(`[AzureOpenAI] ❌ HTTP ${res.status}: ${raw.slice(0, 500)}`);
    const err: any = new Error(`Azure OpenAI vision ${res.status}: ${raw.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Azure OpenAI vision: respuesta no JSON: ${raw.slice(0, 200)}`);
  }

  const text = parsed.choices?.[0]?.message?.content || '';
  const usage = parsed.usage;
  console.log(`[AzureOpenAI] 📬 Vision OK tokens=${usage?.total_tokens ?? '?'} finish=${parsed.choices?.[0]?.finish_reason}`);

  return { text, usage };
}

