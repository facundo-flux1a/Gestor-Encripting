'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Key, Plus, Copy, Check, Trash2, Eye, EyeOff, AlertTriangle, Terminal, RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';


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

interface ApiKeysSectionProps {
  companies: Company[];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function ApiKeysSection({ companies }: ApiKeysSectionProps) {
  const { toast } = useToast();
  const { selectedCompanyIds } = useCompanyContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);

  // Form
  const [nombre, setNombre] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Auto-select company when dialog opens and only one is selected in sidebar
  useEffect(() => {
    if (dialogOpen && selectedCompanyIds.length === 1) {
      setEmpresaId(String(selectedCompanyIds[0]));
    }
  }, [dialogOpen, selectedCompanyIds]);

  // Resultado de creación
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // ── Cargar claves ──────────────────────────────────────────────────────────
  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error al cargar las claves API' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  // ── Crear clave ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!nombre.trim() || !empresaId) {
      toast({ variant: 'destructive', title: 'Completa todos los campos' });

      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), empresa_id: Number(empresaId) })
      });

      const data = await res.json();

      if (!res.ok) {
      toast({ variant: 'destructive', title: 'Error', description: data.error || 'Error al crear la clave' });

        return;
      }

      setDialogOpen(false);
      setNombre('');
      setEmpresaId('');
      setNewRawKey(data.raw_key);
      setShowKey(false);
      setCopied(false);
      setNewKeyDialogOpen(true);
      fetchKeys();
    } catch {
      toast({ variant: 'destructive', title: 'Error de red al crear la clave' });
    } finally {
      setCreating(false);
    }
  };

  // ── Regenerar clave ────────────────────────────────────────────────────────
  const handleRegenerate = async (key: ApiKey) => {
    setRegeneratingId(key.id);
    try {
      // 1. Revocar la actual
      const delRes = await fetch(`/api/user/api-keys/${key.id}`, { method: 'DELETE' });
      if (!delRes.ok) {
        toast({ variant: 'destructive', title: 'Error al revocar la clave anterior' });
        return;
      }
      // 2. Crear una nueva con el mismo nombre y empresa
      const createRes = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: key.nombre, empresa_id: key.empresa_id }),
      });
      const data = await createRes.json();
      if (!createRes.ok) {
        toast({ variant: 'destructive', title: 'Error al generar la nueva clave', description: data.error });
        return;
      }
      setNewRawKey(data.raw_key);
      setShowKey(false);
      setCopied(false);
      setNewKeyDialogOpen(true);
      fetchKeys();
    } catch {
      toast({ variant: 'destructive', title: 'Error de red al regenerar' });
    } finally {
      setRegeneratingId(null);
    }
  };

  // ── Revocar clave ──────────────────────────────────────────────────────────
  const handleRevoke = async (keyId: number) => {
    try {
      const res = await fetch(`/api/user/api-keys/${keyId}`, { method: 'DELETE' });
      if (res.ok) {
      toast({ title: 'Clave revocada', description: 'Clave revocada correctamente' });

        fetchKeys();
      } else {
      toast({ variant: 'destructive', title: 'Error al revocar la clave' });

      }
    } catch {
      toast({ variant: 'destructive', title: 'Error de red' });
    }
  };

  // ── Copiar al portapapeles ─────────────────────────────────────────────────
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'Copiado', description: 'Copiado al portapapeles' });

      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar' });
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Integración API
            </CardTitle>
            <CardDescription>
              Genera claves API para acceder a tus datos desde sistemas externos como programas de contabilidad.
              Cada clave está vinculada a una empresa específica.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchKeys} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {/* Dialog: Nueva clave */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Clave
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear nueva clave API</DialogTitle>
                  <DialogDescription>
                    La clave solo será visible una vez al crearla. Guárdala en un lugar seguro.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="api-key-name">Etiqueta / Nombre</Label>
                    <Input
                      id="api-key-name"
                      placeholder="ej: Contabilidad"
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="api-key-empresa">Empresa</Label>
                    <Select value={empresaId} onValueChange={setEmpresaId}>
                      <SelectTrigger id="api-key-empresa">
                        <SelectValue placeholder="Selecciona una empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name} <span className="text-muted-foreground ml-2">(ID: {c.id})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Esta clave solo podrá acceder a los datos de la empresa seleccionada.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? 'Generando...' : 'Generar Clave'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {/* Lista de claves */}
          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Cargando claves...</div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No hay claves API activas. Genera una para empezar.
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map(key => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{key.nombre}</span>
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono">
                        {key.key_prefix}…
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>🏢 {key.empresa_nombre} <span className="opacity-60">(ID: {key.empresa_id})</span></span>
                      <span>Creada: {formatDate(key.fecha_creacion)}</span>
                      {key.ultimo_uso && <span>Último uso: {formatDate(key.ultimo_uso)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-primary"
                      title="Regenerar clave (revoca la actual y genera una nueva)"
                      disabled={regeneratingId === key.id}
                      onClick={() => handleRegenerate(key)}
                    >
                      <RefreshCw className={`h-4 w-4 ${regeneratingId === key.id ? 'animate-spin' : ''}`} />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Revocar clave &quot;{key.nombre}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción desactivará la clave de forma permanente. Cualquier integración que la use dejará de funcionar.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRevoke(key.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Revocar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sección: Cómo usar la API */}
          {keys.length > 0 && (
            <div className="mt-6 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Cómo usar la API</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Descarga el Excel de facturas de una empresa con un simple GET:
                </p>
                <pre className="text-xs bg-background rounded p-3 border overflow-x-auto font-mono">
{`curl -X POST \\
  "https://gestor.muvail.com/api/v1/export/excel" \\
  -H "X-Api-Key: muvail_TU_CLAVE_AQUI" \\
  -H "Content-Type: application/json" \\
  -d '{ "trimestre": 3, "año": 2025 }' \\
  --output export.xlsx`}
                </pre>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Parámetros opcionales:</strong>{' '}
                  <code className="text-xs">trimestre</code> (1-4),{' '}
                  <code className="text-xs">año</code>,{' '}
                  <code className="text-xs">proveedor</code>,{' '}
                  <code className="text-xs">cliente</code>,{' '}
                  <code className="text-xs">tipo</code> (emitidas | recibidas | todas)
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Mostrar clave nueva (UNA SOLA VEZ) */}
      <Dialog open={newKeyDialogOpen} onOpenChange={(open) => {
        if (!open) setNewRawKey(null);
        setNewKeyDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-500" />
              Clave API generada
            </DialogTitle>
            <DialogDescription>
              Esta es tu clave. <strong>Cópiala ahora</strong>: no la volveras a ver.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Por seguridad, el token completo no se almacena. Si lo pierdes, deberás revocar esta clave y generar una nueva.
              </p>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border font-mono text-sm break-all pr-20">
                {showKey
                  ? newRawKey
                  : newRawKey?.replace(/./g, '•')}
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowKey(s => !s)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => newRawKey && handleCopy(newRawKey)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => {
                setNewKeyDialogOpen(false);
                setNewRawKey(null);
              }}
            >
              Entendido, ya la guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
