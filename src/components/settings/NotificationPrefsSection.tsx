'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { BellRing, FileCheck, FileWarning, TrendingUp, CheckCircle, CalendarDays, UserPlus, Loader2 } from 'lucide-react';

interface PrefDefinition {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const PREFS_LIST: PrefDefinition[] = [
  {
    key: 'documento_procesado',
    label: 'Documentos procesados',
    description: 'Recibe alertas cuando una factura se procese correctamente.',
    icon: FileCheck,
    color: 'text-emerald-500',
  },
  {
    key: 'documento_revision',
    label: 'Documentos en revisión',
    description: 'Entérate de inmediato si un documento requiere validación fiscal.',
    icon: FileWarning,
    color: 'text-amber-500',
  },
  {
    key: 'variacion_precio',
    label: 'Variaciones de precios',
    description: 'Detecta fluctuaciones de precios unitarios comparando con el historial del proveedor.',
    icon: TrendingUp,
    color: 'text-orange-500',
  },
  {
    key: 'factura_duplicada',
    label: 'Facturas duplicadas',
    description: 'Avisos cuando se detecten facturas emitidas o recibidas con el mismo número.',
    icon: FileWarning,
    color: 'text-red-500',
  },
  {
    key: 'incidencia_resuelta',
    label: 'Incidencias resueltas',
    description: 'Avisos cuando se validen incidencias individuales o por documento.',
    icon: CheckCircle,
    color: 'text-blue-500',
  },
  {
    key: 'trimestre_cerrado',
    label: 'Trimestres cerrados',
    description: 'Recibe notificaciones cuando se cierre exitosamente un trimestre fiscal.',
    icon: CalendarDays,
    color: 'text-purple-500',
  },
  {
    key: 'usuario_unido',
    label: 'Invitaciones aceptadas',
    description: 'Notifica a los administradores cuando un usuario acepte la invitación de la empresa.',
    icon: UserPlus,
    color: 'text-teal-500',
  },
];

export function NotificationPrefsSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/user/notif-prefs')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.prefs) {
          setPrefs(data.prefs);
        }
      })
      .catch((err) => console.error('Error fetching notification preferences:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (key: string, checked: boolean) => {
    setSavingKey(key);
    // Optimistic update
    setPrefs((prev) => ({ ...prev, [key]: checked }));

    try {
      const res = await fetch('/api/user/notif-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: checked }),
      });

      if (!res.ok) throw new Error('Error al guardar');

      toast({
        title: 'Preferencia guardada',
        description: 'Tus canales de notificaciones se actualizaron.',
      });
    } catch (err) {
      toast({
        title: 'Error al actualizar',
        description: 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
      // Revert optimistic update
      setPrefs((prev) => ({ ...prev, [key]: !checked }));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground animate-pulse">
            <BellRing className="h-5 w-5" /> Preferencias de Notificaciones
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-violet-100 dark:border-violet-900/40 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-violet-500 animate-pulse" /> Preferencias de Notificaciones
        </CardTitle>
        <CardDescription>
          Elige qué eventos internos dispararán notificaciones en tiempo real en la campana de tu barra superior.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {PREFS_LIST.map((p) => {
          const isChecked = prefs[p.key] !== false; // Default a true si no está especificado
          const Icon = p.icon;
          const isSaving = savingKey === p.key;

          return (
            <div key={p.key} className="flex items-start justify-between py-4 first:pt-0 last:pb-0 gap-4">
              <div className="flex gap-3">
                <div className={`p-2 rounded-lg bg-secondary/40 shrink-0 mt-0.5 ${p.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <Label htmlFor={`notif-toggle-${p.key}`} className="flex flex-col space-y-1 cursor-pointer">
                  <span className="text-sm font-semibold leading-none">{p.label}</span>
                  <span className="font-normal text-xs text-muted-foreground leading-normal">
                    {p.description}
                  </span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                {isSaving && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                <Switch
                  id={`notif-toggle-${p.key}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => handleToggle(p.key, checked)}
                  disabled={isSaving}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
