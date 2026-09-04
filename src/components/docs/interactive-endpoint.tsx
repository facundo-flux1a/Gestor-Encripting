'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Play, Copy, Check, Loader2, AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// --- Types ---
export type ParamType = 'boolean' | 'enum' | 'async-enum' | 'text' | 'number';

export interface ParamDef {
  key: string;
  label: string;
  description: string;
  type: ParamType;
  defaultValue?: string | boolean | number;
  options?: string[]; // For enum type
  asyncOptionsUrl?: string;  // For async-enum: internal API endpoint to fetch options
  asyncOptionsKey?: string;  // Key in the response JSON that holds the array (e.g. 'proveedores')
}

interface InteractiveEndpointProps {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params: ParamDef[];
  apiKey: string;
  selectedKeyId?: number | null;  // When set, routes through the secure proxy (key never exposed)
  isMockOnly?: boolean;
  isBinaryResponse?: boolean;
  binaryFilename?: string;
  mockResponse?: object;
}

type ParamState = {
  enabled: boolean;
  value: string;
};

export function InteractiveEndpoint({
  method,
  path,
  description,
  params,
  apiKey,
  selectedKeyId = null,
  isMockOnly = false,
  isBinaryResponse = false,
  binaryFilename = 'export.xlsx',
  mockResponse,
}: InteractiveEndpointProps) {
  const [paramStates, setParamStates] = useState<Record<string, ParamState>>(() => {
    const initial: Record<string, ParamState> = {};
    for (const p of params) {
      initial[p.key] = {
        enabled: false,
        value: p.defaultValue !== undefined ? String(p.defaultValue) : (p.options?.[0] ?? ''),
      };
    }
    return initial;
  });

  // Async options cache: key -> string[]
  const [asyncOptions, setAsyncOptions] = useState<Record<string, string[]>>({});
  const [asyncLoading, setAsyncLoading] = useState<Record<string, boolean>>({});

  const fetchAsyncOptions = useCallback(async (param: ParamDef) => {
    if (!param.asyncOptionsUrl || asyncOptions[param.key] || asyncLoading[param.key]) return;
    setAsyncLoading(prev => ({ ...prev, [param.key]: true }));
    try {
      const res = await fetch(param.asyncOptionsUrl);
      if (res.ok) {
        const data = await res.json();
        const key = param.asyncOptionsKey ?? param.key;
        const list: string[] = Array.isArray(data[key])
          ? data[key].map((item: any) => (typeof item === 'string' ? item : item.nombre ?? item.name ?? String(item)))
          : [];
        setAsyncOptions(prev => ({ ...prev, [param.key]: list }));
        // Auto-select first option if value is empty
        if (list.length > 0) {
          setParamStates(prev => ({
            ...prev,
            [param.key]: { ...prev[param.key], value: prev[param.key].value || list[0] },
          }));
        }
      }
    } catch { /* silent */ }
    finally { setAsyncLoading(prev => ({ ...prev, [param.key]: false })); }
  }, [asyncOptions, asyncLoading]);

  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseImageUrl, setResponseImageUrl] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ limit: number; remaining: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState(false);

  const activeParams = useMemo(() => {
    return Object.entries(paramStates)
      .filter(([, state]) => state.enabled)
      .map(([key, state]) => ({ key, value: state.value }));
  }, [paramStates]);

  const builtUrl = useMemo(() => {
    let base = path;
    const queryParams: typeof activeParams = [];

    for (const p of activeParams) {
      const token = `[${p.key}]`;
      if (base.includes(token)) {
        const match = p.value.match(/^(\d+)/);
        const interpolatedValue = match ? match[1] : p.value;
        base = base.replace(token, encodeURIComponent(interpolatedValue));
      } else {
        queryParams.push(p);
      }
    }

    if (method === 'GET' && queryParams.length > 0) {
      const qs = queryParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      return `${base}?${qs}`;
    }
    return base;
  }, [method, path, activeParams]);

  const curlCommand = useMemo(() => {
    let baseUrl = `https://gestor.muvail.com${path}`;
    const queryParams: typeof activeParams = [];

    for (const p of activeParams) {
      const token = `[${p.key}]`;
      if (baseUrl.includes(token)) {
        const match = p.value.match(/^(\d+)/);
        const interpolatedValue = match ? match[1] : p.value;
        baseUrl = baseUrl.replace(token, encodeURIComponent(interpolatedValue));
      } else {
        queryParams.push(p);
      }
    }

    // Función para censurar la API key en el ejemplo visual por seguridad y privacidad
    const formatMaskedKey = (rawKey: string) => {
      if (!rawKey) return 'TU_API_KEY_AQUI';
      if (rawKey.startsWith('muvail_') || rawKey.startsWith('flux_')) {
        const prefix = rawKey.slice(0, 10);
        return `${prefix}••••••••••••••••••••••••••••••••`;
      }
      return rawKey.slice(0, 8) + '••••••••••••••••';
    };

    // If using proxy mode (selectedKeyId), show a redacted placeholder — the key is never in the browser
    const key = selectedKeyId ? '<CLAVE_GESTIONADA_POR_EL_SERVIDOR>' : formatMaskedKey(apiKey);

    if (method === 'GET') {
      const qs = queryParams.map(p => `--data-urlencode "${p.key}=${p.value}"`).join(' \\\n     ');
      return `curl -G "${baseUrl}" \\\n     -H "X-Api-Key: ${key}"${qs ? ' \\\n     ' + qs : ''}`;
    } else {
      const body = Object.fromEntries(queryParams.map(p => [p.key, p.value]));
      return `curl -X POST "${baseUrl}" \\\n     -H "X-Api-Key: ${key}" \\\n     -H "Content-Type: application/json" \\\n     -d '${JSON.stringify(body, null, 2)}'`;
    }
  }, [method, path, activeParams, apiKey, selectedKeyId]);

  const toggleParam = (key: string) => {
    const param = params.find(p => p.key === key);
    const wasEnabled = paramStates[key]?.enabled;
    setParamStates(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
    // Trigger async load on first enable
    if (!wasEnabled && param?.type === 'async-enum') {
      fetchAsyncOptions(param);
    }
  };

  const updateValue = (key: string, value: string) => {
    setParamStates(prev => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecute = async () => {
    const usingProxy = !!selectedKeyId;
    const hasManualKey = !!apiKey;

    if (!usingProxy && !hasManualKey) {
      setResponse(JSON.stringify({ error: 'Selecciona una clave de la lista o pega tu API Key arriba antes de ejecutar.' }, null, 2));
      setResponseStatus(401);
      setShowResponse(true);
      return;
    }

    // Mock-only: simulate without hitting backend
    if (isMockOnly) {
      setIsLoading(true);
      await new Promise(r => setTimeout(r, 600)); // Fake latency
      setResponse(JSON.stringify(mockResponse ?? { mensaje: 'Esta acción no se ejecuta en modo Playground.' }, null, 2));
      setResponseStatus(200);
      setIsLoading(false);
      setShowResponse(true);
      return;
    }

    setIsLoading(true);
    setShowResponse(false);
    setResponse(null);
    setResponseImageUrl(null);
    setResponseStatus(null);

    try {
      const handleRateLimitHeaders = (res: Response) => {
        const limitHeader = res.headers.get('x-ratelimit-limit') || res.headers.get('X-RateLimit-Limit');
        const remainingHeader = res.headers.get('x-ratelimit-remaining') || res.headers.get('X-RateLimit-Remaining');
        
        console.log('🛡️ [API-Docs] Rate Limit Headers:', { limitHeader, remainingHeader });

        if (limitHeader && remainingHeader) {
          setRateLimitInfo({
            limit: parseInt(limitHeader, 10),
            remaining: parseInt(remainingHeader, 10)
          });
        } else {
          if (res.status === 429) {
            setRateLimitInfo({ limit: 20, remaining: 0 });
          } else {
            setRateLimitInfo(null);
          }
        }
      };

      // ── Proxy mode: key ID resolved server-side, raw key never in browser ──
      if (usingProxy && !isMockOnly) {
        const queryParams = Object.fromEntries(activeParams.map(p => [p.key, p.value]));
        const res = await fetch('/api/docs/playground/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyId: selectedKeyId, path: builtUrl, queryParams }),
        });
        setResponseStatus(res.status);
        handleRateLimitHeaders(res);

        const contentType = res.headers.get('content-type');
        if (contentType && contentType.startsWith('image/')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setResponseImageUrl(url);
          setResponse(JSON.stringify({
            status: 'success',
            type: contentType,
            size: `${(blob.size / 1024).toFixed(2)} KB`,
            mensaje: 'Imagen recibida y renderizada correctamente.'
          }, null, 2));
        } else {
          const text = await res.text();
          try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
        }
        setShowResponse(true);
        setIsLoading(false);
        return;
      }

      // ── Direct mode: raw apiKey sent as X-Api-Key header ──
      const headers: Record<string, string> = { 'X-Api-Key': apiKey };
      let fetchUrl = builtUrl;
      let fetchOptions: RequestInit = { method, headers };

      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        const body = Object.fromEntries(activeParams.map(p => [p.key, p.value]));
        fetchOptions.body = JSON.stringify(body);
      }

      const res = await fetch(fetchUrl, fetchOptions);
      setResponseStatus(res.status);
      handleRateLimitHeaders(res);

      if (isBinaryResponse && res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = binaryFilename;
        a.click();
        URL.revokeObjectURL(url);
        setResponse(JSON.stringify({ ok: true, mensaje: `Archivo "${binaryFilename}" descargado correctamente.` }, null, 2));
        setDownloadedFile(true);
        setTimeout(() => setDownloadedFile(false), 3000);
      } else {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.startsWith('image/')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setResponseImageUrl(url);
          setResponse(JSON.stringify({
             status: 'success',
             type: contentType,
             size: `${(blob.size / 1024).toFixed(2)} KB`,
             mensaje: 'Imagen recibida y renderizada correctamente en la interfaz.'
          }, null, 2));
        } else {
          const text = await res.text();
          try {
            setResponse(JSON.stringify(JSON.parse(text), null, 2));
          } catch {
            setResponse(text);
          }
        }
      }
    } catch (err: any) {
      setResponse(JSON.stringify({ error: err.message ?? 'Error desconocido' }, null, 2));
      setResponseStatus(500);
    } finally {
      setIsLoading(false);
      setShowResponse(true);
    }
  };

  const statusColor = responseStatus
    ? responseStatus >= 200 && responseStatus < 300
      ? 'text-emerald-400'
      : responseStatus === 429
        ? 'text-red-500 font-bold'
        : responseStatus === 401
          ? 'text-amber-400'
          : 'text-red-400'
    : '';

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/40">
        <span className={cn(
          'font-mono text-xs px-2.5 py-1 rounded-md font-bold tracking-widest border',
          method === 'GET'
            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
        )}>
          {method}
        </span>
        <code className="font-mono text-sm text-foreground flex-1 font-semibold">{path}</code>
        {isMockOnly && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 font-medium">
            <AlertTriangle className="h-3 w-3" />
            Modo Playground — Solo lectura
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground">{description}</p>

        {/* Parameters */}
        {params.length > 0 && (
          <div className="space-y-2" data-tutorial="docs-param-inputs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Parámetros</h4>
            <div className="grid gap-2">
              {params.map(param => {
                const state = paramStates[param.key] || { enabled: false, value: '' };
                return (
                  <div
                    key={param.key}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-all duration-200',
                      state.enabled
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/60 bg-muted/20'
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      role="checkbox"
                      aria-checked={state.enabled}
                      onClick={() => toggleParam(param.key)}
                      className={cn(
                        'mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                        state.enabled
                          ? 'bg-primary border-primary'
                          : 'border-slate-300 dark:border-slate-600'
                      )}
                    >
                      {state.enabled && <Check className="h-2.5 w-2.5 text-white" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">{param.key}</code>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{param.type}</span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">{param.description}</p>

                      {/* Value Input */}
                      {state.enabled && (
                        <>
                          {param.type === 'boolean' && (
                            <div className="flex gap-2">
                              {['true', 'false'].map(v => (
                                <button
                                  key={v}
                                  onClick={() => updateValue(param.key, v)}
                                  className={cn(
                                    'px-2.5 py-1 rounded text-xs font-mono font-semibold border transition-all',
                                    state.value === v
                                      ? 'bg-primary text-white border-primary'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary'
                                  )}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}

                          {param.type === 'enum' && param.options && (
                            <div className="flex flex-wrap gap-1.5">
                              {param.options.map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => updateValue(param.key, opt)}
                                  className={cn(
                                    'px-2.5 py-1 rounded text-xs font-mono font-semibold border transition-all',
                                    state.value === opt
                                      ? 'bg-primary text-white border-primary'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary'
                                  )}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}

                          {param.type === 'async-enum' && (
                            asyncLoading[param.key] ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Loader2 className="h-3 w-3 animate-spin" /> Cargando opciones...
                              </div>
                            ) : (
                              <select
                                value={state.value}
                                onChange={e => updateValue(param.key, e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                {(asyncOptions[param.key] ?? []).length === 0 ? (
                                  <option value="">— Sin datos disponibles —</option>
                                ) : (
                                  (asyncOptions[param.key] ?? []).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))
                                )}
                              </select>
                            )
                          )}

                          {(param.type === 'text' || param.type === 'number') && (
                            <input
                              type={param.type === 'number' ? 'number' : 'text'}
                              value={state.value}
                              onChange={e => updateValue(param.key, e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder={`Ej: ${param.defaultValue ?? ''}`}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Generated cURL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Petición generada (cURL)</h4>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-x-auto shadow-inner">
            <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap break-all">{curlCommand}</pre>
          </div>
        </div>

        {/* Execute Button */}
        <div className="flex items-center gap-3" data-tutorial="docs-run-btn">
          <Button
            onClick={handleExecute}
            disabled={isLoading}
            className="flex items-center gap-2 min-w-[160px]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isBinaryResponse ? (
              <Download className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isLoading
              ? 'Ejecutando...'
              : isBinaryResponse
                ? 'Descargar Excel'
                : isMockOnly
                  ? 'Simular Petición'
                  : 'Ejecutar Petición'}
          </Button>

          {downloadedFile && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Archivo descargado
            </span>
          )}
        </div>

        {/* Response Viewer */}
        {showResponse && response && (
          <div className="space-y-1.5" data-tutorial="docs-json-response">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowResponse(v => !v)}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Respuesta
                {responseStatus && (
                  <span className={cn('font-mono font-bold ml-2', statusColor)}>
                    — HTTP {responseStatus}
                  </span>
                )}
                {rateLimitInfo && (
                  <span className={cn(
                    "ml-3 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                    rateLimitInfo.remaining <= 5 
                      ? "bg-red-500/10 text-red-500 border-red-500/30" 
                      : rateLimitInfo.remaining <= 10
                        ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  )}>
                    Límite: {rateLimitInfo.remaining}/{rateLimitInfo.limit}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {showResponse ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </button>
            </div>

            {isMockOnly && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span><strong>Playground seguro:</strong> Esta llamada nunca se ha ejecutado contra la base de datos. Los datos mostrados son de ejemplo estático y ninguna incidencia ha sido modificada.</span>
              </div>
            )}

            {responseStatus === 429 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span><strong>Límite de peticiones excedido:</strong> Por seguridad, el Playground tiene un límite estricto de uso. Espera un momento antes de realizar otra petición.</span>
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
              <div className="max-h-96 overflow-y-auto p-4">
                <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap">{response}</pre>
              </div>
            </div>

            {responseImageUrl && (
              <div className="mt-4 p-4 border border-border rounded-lg bg-muted/30 flex justify-center">
                <img 
                  src={responseImageUrl} 
                  alt="Thumbnail" 
                  className="max-w-full max-h-[500px] object-contain rounded shadow-sm border border-border" 
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
