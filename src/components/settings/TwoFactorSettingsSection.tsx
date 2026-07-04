'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck } from 'lucide-react';

export function TwoFactorSettingsSection() {
  const [enabled, setEnabled] = useState(true);
  const [durationHours, setDurationHours] = useState('24');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/user/settings/2fa')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enabled === 'boolean') {
          setEnabled(data.enabled);
          setDurationHours(data.durationHours?.toString() || '24');
        }
      })
      .catch(err => console.error('Error fetching 2FA config:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (newEnabled: boolean, newDuration: string) => {
    try {
      const res = await fetch('/api/user/settings/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: newEnabled,
          durationHours: parseInt(newDuration, 10),
        }),
      });

      if (!res.ok) throw new Error('Error al guardar configuración');

      toast({
        title: 'Configuración actualizada',
        description: 'Tus preferencias de seguridad se han guardado correctamente.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Hubo un problema al guardar la configuración.',
        variant: 'destructive',
      });
      // Revertir estado si falla
      setEnabled(!newEnabled);
    }
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    handleSave(checked, durationHours);
  };

  const handleDurationChange = (val: string) => {
    setDurationHours(val);
    handleSave(enabled, val);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground animate-pulse">
            <ShieldCheck className="h-5 w-5" /> Autenticación en Dos Pasos (2FA)
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Autenticación en Dos Pasos (2FA)
        </CardTitle>
        <CardDescription>
          Agrega una capa adicional de seguridad a tu cuenta pidiendo un código que será enviado al email de contacto de tu perfil.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="2fa-toggle" className="flex flex-col space-y-1">
            <span>Habilitar 2FA</span>
            <span className="font-normal text-sm text-muted-foreground">
              Recomendado para proteger tu información.
            </span>
          </Label>
          <Switch
            id="2fa-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {enabled && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
            <Label htmlFor="2fa-duration" className="flex flex-col space-y-1">
              <span>Recordar este dispositivo por</span>
              <span className="font-normal text-sm text-muted-foreground">
                Tiempo hasta volver a pedir código.
              </span>
            </Label>
            <Select value={durationHours} onValueChange={handleDurationChange}>
              <SelectTrigger className="w-[180px]" id="2fa-duration">
                <SelectValue placeholder="Seleccionar duración" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hora</SelectItem>
                <SelectItem value="6">6 horas</SelectItem>
                <SelectItem value="12">12 horas</SelectItem>
                <SelectItem value="24">24 horas</SelectItem>
                <SelectItem value="168">7 días</SelectItem>
                <SelectItem value="720">30 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
