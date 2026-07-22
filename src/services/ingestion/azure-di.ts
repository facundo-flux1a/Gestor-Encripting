/**
 * Cliente REST de Azure AI Document Intelligence (ex Form Recognizer).
 * Primario para facturas PDF/imagen; Gemini queda como fallback.
 */

import { wLog } from '@/lib/worker-logger';

const API_VERSION = process.env.AZURE_DI_API_VERSION || '2024-11-30';

export function isAzureDiConfigured(): boolean {
  return Boolean(process.env.AZURE_DI_ENDPOINT?.trim() && process.env.AZURE_DI_KEY?.trim());
}

export function azureDiModelId(): string {
  const raw = (process.env.AZURE_DI_MODEL || 'prebuilt-invoice').trim();
  // Ignorar rutas azureml:// del catálogo Foundry — el analyze API usa ids cortos.
  if (raw.startsWith('azureml://') || raw.includes('/models/')) return 'prebuilt-invoice';
  return raw || 'prebuilt-invoice';
}

function endpointBase(): string {
  const ep = (process.env.AZURE_DI_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (!ep) throw new Error('AZURE_DI_ENDPOINT no configurado');
  return ep;
}

function apiKey(): string {
  const key = (process.env.AZURE_DI_KEY || '').trim();
  if (!key) throw new Error('AZURE_DI_KEY no configurado');
  return key;
}

export type AzureDiAnalyzeResult = {
  modelId?: string;
  documents?: Array<{
    docType?: string;
    fields?: Record<string, AzureDiField>;
    confidence?: number;
  }>;
  content?: string;
  pages?: unknown[];
};

export type AzureDiField = {
  type?: string;
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencySymbol?: string; currencyCode?: string };
  valueAddress?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryRegion?: string;
  };
  valueArray?: AzureDiField[];
  valueObject?: Record<string, AzureDiField>;
};

/**
 * Analiza un documento binario con prebuilt-invoice (o AZURE_DI_MODEL).
 * Lanza si HTTP/credenciales fallan; el caller decide fallback a Gemini.
 */
export async function analyzeInvoiceDocument(
  buffer: Buffer,
  mimeType?: string | null
): Promise<AzureDiAnalyzeResult> {
  const model = azureDiModelId();
  const base = endpointBase();
  const contentType = mimeType?.startsWith('image/')
    ? mimeType
    : mimeType === 'application/pdf' || !mimeType
      ? 'application/pdf'
      : mimeType;

  const analyzeUrl =
    `${base}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze` +
    `?api-version=${API_VERSION}&locale=es-ES`;

  wLog('AzureDI', `analyze model=${model} bytes=${buffer.length} mime=${contentType}`);

  const startRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey(),
      'Content-Type': contentType,
    },
    body: buffer,
  });

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '');
    throw new Error(`Azure DI analyze HTTP ${startRes.status}: ${body.slice(0, 300)}`);
  }

  const opLocation = startRes.headers.get('operation-location') || startRes.headers.get('Operation-Location');
  if (!opLocation) {
    throw new Error('Azure DI: falta header operation-location');
  }

  const result = await pollOperation(opLocation);
  return result;
}

async function pollOperation(operationUrl: string, maxWaitMs = 120_000): Promise<AzureDiAnalyzeResult> {
  const started = Date.now();
  let delay = 800;

  while (Date.now() - started < maxWaitMs) {
    const res = await fetch(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey() },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Azure DI poll HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      status?: string;
      analyzeResult?: AzureDiAnalyzeResult;
      error?: { message?: string };
    };

    if (json.status === 'succeeded' && json.analyzeResult) {
      return json.analyzeResult;
    }
    if (json.status === 'failed') {
      throw new Error(`Azure DI failed: ${json.error?.message || 'unknown'}`);
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 4000);
  }

  throw new Error(`Azure DI poll timeout after ${maxWaitMs}ms`);
}
