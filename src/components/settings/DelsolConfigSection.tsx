'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Key, Building2, ShoppingBag, Receipt, Trash2 } from 'lucide-react';

interface DelsolConfigSectionProps {
  companies?: { id: number | string; name: string }[];
}

export function DelsolConfigSection({ companies = [] }: DelsolConfigSectionProps) {
  const [empresaId, setEmpresaId] = useState<string>(
    companies.length > 0 ? String(companies[0].id) : '115'
  );
  const [clienteCode, setClienteCode] = useState<string>('');

  // FactuSOL (Ventas)
  const [baseDatosVentas, setBaseDatosVentas] = useState<string>('FS001');
  const [passwordVentas, setPasswordVentas] = useState<string>('');
  const [hasPasswordVentas, setHasPasswordVentas] = useState<boolean>(false);

  // ContaSOL (Compras)
  const [baseDatosCompras, setBaseDatosCompras] = useState<string>('CS001');
  const [passwordCompras, setPasswordCompras] = useState<string>('');
  const [hasPasswordCompras, setHasPasswordCompras] = useState<boolean>(false);

  const [hasCredentials, setHasCredentials] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string; token?: string }>({
    type: 'idle',
  });

  useEffect(() => {
    async function loadConfig() {
      if (!empresaId) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/delsol/config?empresaId=${empresaId}`);
        const data = await res.json();
        if (res.ok) {
          setClienteCode(data.clienteCode || '');
          setBaseDatosVentas(data.baseDatosVentas || 'FS001');
          setBaseDatosCompras(data.baseDatosCompras || 'CS001');
          setHasPasswordVentas(data.hasPasswordVentas || false);
          setHasPasswordCompras(data.hasPasswordCompras || false);
          setHasCredentials(data.hasCredentials || false);
        }
      } catch (err) {
        console.error('Error cargando configuración DELSOL:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, [empresaId]);

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus({ type: 'idle' });

    try {
      const res = await fetch('/api/delsol/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId,
          clienteCode,
          baseDatosVentas,
          baseDatosCompras,
          passwordVentas: passwordVentas || undefined,
          passwordCompras: passwordCompras || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus({
          type: 'success',
          message: data.message,
          token: data.testVentas?.tokenPreview,
        });
        setHasPasswordVentas(true);
        if (passwordCompras) setHasPasswordCompras(true);
        setHasCredentials(true);
        setPasswordVentas('');
        setPasswordCompras('');
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'No se pudo conectar con la API de Software DELSOL.',
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Error de red al intentar conectar.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar las credenciales de DELSOL para esta empresa?')) {
      return;
    }

    setIsDeleting(true);
    setStatus({ type: 'idle' });

    try {
      const res = await fetch(`/api/delsol/config?empresaId=${empresaId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setClienteCode('');
        setBaseDatosVentas('FS001');
        setBaseDatosCompras('CS001');
        setPasswordVentas('');
        setPasswordCompras('');
        setHasPasswordVentas(false);
        setHasPasswordCompras(false);
        setHasCredentials(false);
        setStatus({
          type: 'success',
          message: 'Las credenciales de Software DELSOL fueron eliminadas correctamente.',
        });
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'No se pudieron eliminar las credenciales.',
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Error de red al intentar eliminar.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="w-full border-slate-800 bg-slate-900/50 backdrop-blur-md shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-100">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Integración Software DELSOL (JSON Multi-Módulo)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Configura los accesos independientes para FactuSOL (Ventas) y ContaSOL (Compras) mediante la estructura JSON de la empresa.
            </CardDescription>
          </div>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            JSON Dynamic Config
          </span>
        </div>
      </CardHeader>

      <form onSubmit={handleSaveAndTest}>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Cargando configuración DELSOL...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selección de Empresa */}
                <div className="space-y-2">
                  <Label htmlFor="empresaId" className="text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    Empresa a configurar
                  </Label>
                  {companies.length > 0 ? (
                    <select
                      id="empresaId"
                      value={empresaId}
                      onChange={(e) => setEmpresaId(e.target.value)}
                      className="w-full h-10 px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="empresaId"
                      value={empresaId}
                      onChange={(e) => setEmpresaId(e.target.value)}
                      placeholder="Ej: 115"
                      className="bg-slate-950 border-slate-800 text-slate-100"
                      required
                    />
                  )}
                </div>

                {/* Código de Cliente DELSOL */}
                <div className="space-y-2">
                  <Label htmlFor="clienteCode" className="text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Código de Cliente API (Común)
                  </Label>
                  <Input
                    id="clienteCode"
                    value={clienteCode}
                    onChange={(e) => setClienteCode(e.target.value)}
                    placeholder="Ej: 502281"
                    className="bg-slate-950 border-slate-800 text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* Módulo Ventas (FactuSOL) */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-indigo-500/20 space-y-4">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                  <ShoppingBag className="w-4 h-4 text-indigo-400" />
                  Módulo Ventas / Facturación (FactuSOL)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseDatosVentas" className="text-xs text-slate-300">
                      Base de Datos (Facturas Emitidas)
                    </Label>
                    <Input
                      id="baseDatosVentas"
                      value={baseDatosVentas}
                      onChange={(e) => setBaseDatosVentas(e.target.value)}
                      placeholder="Ej: FS001"
                      className="bg-slate-900 border-slate-800 text-slate-100"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passwordVentas" className="text-xs text-slate-300">
                      Contraseña Ventas {hasPasswordVentas && <span className="text-xs text-emerald-400">(Configurada)</span>}
                    </Label>
                    <Input
                      id="passwordVentas"
                      type="password"
                      value={passwordVentas}
                      onChange={(e) => setPasswordVentas(e.target.value)}
                      placeholder={hasPasswordVentas ? '•••••••• (dejar en blanco para no cambiar)' : 'Password FS001'}
                      className="bg-slate-900 border-slate-800 text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Módulo Compras (ContaSOL) */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-emerald-500/20 space-y-4">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  Módulo Compras / Contabilidad (ContaSOL)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseDatosCompras" className="text-xs text-slate-300">
                      Base de Datos (Facturas Recibidas)
                    </Label>
                    <Input
                      id="baseDatosCompras"
                      value={baseDatosCompras}
                      onChange={(e) => setBaseDatosCompras(e.target.value)}
                      placeholder="Ej: CS001"
                      className="bg-slate-900 border-slate-800 text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passwordCompras" className="text-xs text-slate-300">
                      Contraseña Compras {hasPasswordCompras && <span className="text-xs text-emerald-400">(Configurada)</span>}
                    </Label>
                    <Input
                      id="passwordCompras"
                      type="password"
                      value={passwordCompras}
                      onChange={(e) => setPasswordCompras(e.target.value)}
                      placeholder={hasPasswordCompras ? '•••••••• (dejar en blanco para no cambiar)' : 'Password CS001'}
                      className="bg-slate-900 border-slate-800 text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Mensajes de Resultado */}
              {status.type === 'success' && (
                <Alert className="bg-emerald-950/40 border-emerald-800/60 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <AlertTitle className="font-semibold">Operación Exitosa</AlertTitle>
                  <AlertDescription className="text-xs mt-1 space-y-1">
                    <p>{status.message}</p>
                  </AlertDescription>
                </Alert>
              )}

              {status.type === 'error' && (
                <Alert className="bg-rose-950/40 border-rose-800/60 text-rose-300">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <AlertTitle className="font-semibold">Error de Operación</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {status.message}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between items-center border-t border-slate-800/60 pt-4">
          <div>
            {hasCredentials && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteCredentials}
                disabled={isDeleting || isSaving || isLoading}
                className="border-rose-800/60 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 text-xs gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                )}
                Eliminar Credenciales
              </Button>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSaving || isDeleting || isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Guardando Configuración JSON...
              </>
            ) : (
              'Guardar Configuración JSON'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
