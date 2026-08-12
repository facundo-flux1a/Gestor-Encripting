'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key, Plus, Copy, Check, AlertTriangle, Eye, EyeOff,
  Loader2, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ApiKey {
  id: number;
  nombre: string;
  key_prefix: string;
  empresa_id: number;
  empresa_nombre: string;
  activa: boolean;
  ultimo_uso: string | null;
  fecha_creacion: string;
}

interface Company {
  id: number;
  name: string;
}

interface ApiKeyPanelProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  selectedKeyId: number | null;
  setSelectedKeyId: (id: number | null) => void;
}

export function ApiKeyPanel({ apiKey, setApiKey, selectedKeyId, setSelectedKeyId }: ApiKeyPanelProps) {
  const [copied, setCopied] = useState(false);

  // Existing keys
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showExistingKeys, setShowExistingKeys] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [creating, setCreating] = useState(false);

  // New key reveal dialog
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const [keysRes, companiesRes] = await Promise.all([
        fetch('/api/user/api-keys'),
        fetch('/api/companies'),
      ]);
      if (keysRes.ok) setKeys(await keysRes.json());
      if (companiesRes.ok) {
        const data = await companiesRes.json();
        // /api/companies may return { companies: [...] } or plain array
        setCompanies(Array.isArray(data) ? data : (data.companies ?? []));
      }
    } catch { /* silent */ }
    finally { setLoadingKeys(false); }
  }, []);

  useEffect(() => {
    if (showExistingKeys) fetchKeys();
  }, [showExistingKeys, fetchKeys]);

  const handleCreate = async () => {
    if (!nombre.trim() || !empresaId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), empresa_id: Number(empresaId) }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Error al crear la clave'); return; }

      setCreateOpen(false);
      setNombre('');
      setEmpresaId('');
      setNewRawKey(data.raw_key);
      setShowNewKey(false);
      setCopiedNew(false);
      setNewKeyDialogOpen(true);
      fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleUseKey = (raw: string) => {
    setApiKey(raw);
    setNewKeyDialogOpen(false);
    setNewRawKey(null);
  };

  const handleCopy = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleRevoke = async (keyId: number) => {
    await fetch(`/api/user/api-keys/${keyId}`, { method: 'DELETE' });
    fetchKeys();
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  // When user manually edits the input, clear the selectedKeyId (they're typing a raw key)
  const handleManualInput = (val: string) => {
    setApiKey(val);
    if (selectedKeyId) setSelectedKeyId(null);
  };

  return (
    <>
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4" data-tutorial="docs-api-keys">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            Configura tu API Key para el Playground
          </p>
          <Button
            size="sm"
            variant="outline"
            data-tutorial="docs-create-key-btn"
            className="flex items-center gap-1.5 text-xs h-8"
            onClick={() => { fetchKeys(); setCreateOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva Clave
          </Button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pega aquí una clave existente o genera una nueva. Se aplica a todos los exploradores de esta página y no se almacena en ningún servidor.
        </p>

        {/* API Key input */}
        <div className="flex gap-2" data-tutorial="docs-key-selector">
          <div className="flex-1 relative">
            <input
              type="password"
              value={selectedKeyId ? '••••••••••••••••••••••••' : apiKey}
              onChange={e => {
                if (!selectedKeyId) handleManualInput(e.target.value);
              }}
              onFocus={() => {
                // If a key is selected and user clicks the input, deselect and allow manual entry
                if (selectedKeyId) { setSelectedKeyId(null); setApiKey(''); }
              }}
              placeholder={selectedKeyId ? '' : 'muvail_aBcD1234efGh5678...'}
              readOnly={!!selectedKeyId}
              className={cn(
                'w-full bg-white dark:bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary pr-20',
                selectedKeyId
                  ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 cursor-default'
                  : 'border-slate-200 dark:border-slate-700'
              )}
            />
            {selectedKeyId && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-primary font-medium pointer-events-none">
                {keys.find(k => k.id === selectedKeyId)?.nombre ?? 'Clave seleccionada'}
              </span>
            )}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
              {selectedKeyId ? (
                <button
                  onClick={() => { setSelectedKeyId(null); setApiKey(''); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1.5 py-1"
                  title="Deseleccionar clave"
                >
                  ✕
                </button>
              ) : (
                apiKey && (
                  <button
                    onClick={() => handleCopy(apiKey, setCopied)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    title="Copiar"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Toggle — existing keys */}
        <button
          onClick={() => setShowExistingKeys(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          {showExistingKeys ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showExistingKeys ? 'Ocultar claves existentes' : 'Ver mis claves existentes'}
        </button>

        {/* Existing keys list */}
        {showExistingKeys && (
          <div className="space-y-2 pt-1">
            {loadingKeys ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando claves...
              </div>
            ) : keys.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No tienes claves API activas.</p>
            ) : (
              keys.map(k => (
                <div
                  key={k.id}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors cursor-pointer group',
                    selectedKeyId === k.id
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                      : 'border-slate-100 dark:border-slate-800 hover:border-primary/30 bg-white dark:bg-slate-900/50'
                  )}
                  onClick={() => {
                    setSelectedKeyId(k.id);
                    setApiKey(''); // clear any manually typed key
                    if (!showExistingKeys) setShowExistingKeys(true);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{k.nombre}</span>
                      <code className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">{k.key_prefix}…</code>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {k.empresa_nombre} · Creada {formatDate(k.fecha_creacion)}
                      {k.ultimo_uso ? ` · Último uso ${formatDate(k.ultimo_uso)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Revocar"
                      onClick={e => { e.stopPropagation(); handleRevoke(k.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Prefix-only notice */}
      {apiKey && apiKey.length < 30 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 px-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Solo se muestra el prefijo de la clave. Para ejecutar peticiones reales, pega la clave completa o genera una nueva con "Nueva Clave".
        </p>
      )}

      {/* ─── Create Key Dialog ─────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nueva clave API</DialogTitle>
            <DialogDescription>
              La clave completa solo será visible una vez al crearla. Guárdala en un lugar seguro.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-api-key-name">Etiqueta / Nombre</Label>
              <Input
                id="doc-api-key-name"
                placeholder="ej: Integración ERP Sage"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-api-key-empresa">Empresa</Label>
              {companies.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando empresas...
                </div>
              ) : (
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger id="doc-api-key-empresa">
                    <SelectValue placeholder="Selecciona una empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Esta clave solo podrá acceder a los datos de la empresa seleccionada.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !nombre.trim() || !empresaId}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...</> : 'Generar Clave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── New Key Reveal Dialog ─────────────────────────────────── */}
      <Dialog open={newKeyDialogOpen} onOpenChange={(open) => {
        if (!open) setNewRawKey(null);
        setNewKeyDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-500" />
              Clave API generada
            </DialogTitle>
            <DialogDescription>
              Cópiala ahora — <strong>no la volverás a ver completa</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Por seguridad, el token completo nunca se vuelve a almacenar. Si lo pierdes, deberás revocar esta clave y generar una nueva.
              </p>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border font-mono text-sm break-all pr-20 min-h-[48px]">
                {showNewKey ? newRawKey : newRawKey?.replace(/./g, '•')}
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNewKey(s => !s)}>
                  {showNewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => newRawKey && handleCopy(newRawKey, setCopiedNew)}
                >
                  {copiedNew ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => { setNewKeyDialogOpen(false); setNewRawKey(null); }}
            >
              Cerrar
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => newRawKey && handleUseKey(newRawKey)}
            >
              Usar en el Playground
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
