'use client';

import { useState } from 'react';
import { usePreferences } from '@/contexts/preferences-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function FilteringPreferences() {
  const { preferences, loading, updatePreferences } = usePreferences();
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const handleToggle = async (key: 'dinamizar_actividad' | 'dinamizar_incidencias', value: boolean) => {
    setUpdating(true);
    try {
      await updatePreferences({ [key]: value });
      toast({
        title: '✅ Preferencia actualizada',
        description: 'Los cambios se aplicaron correctamente',
      });
    } catch (error) {
      toast({
        title: '❌ Error',
        description: 'No se pudo actualizar la preferencia',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleEmptySelectionChange = async (value: string) => {
    setUpdating(true);
    try {
      await updatePreferences({ sin_seleccion_mostrar_todo: value === 'all' });
      toast({
        title: '✅ Preferencia actualizada',
        description: 'Los cambios se aplicaron correctamente',
      });
    } catch (error) {
      toast({
        title: '❌ Error',
        description: 'No se pudo actualizar la preferencia',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Filtrado Dinámico */}
      <Card>
        <CardHeader>
          <CardTitle>Alertas y Filtrado por Empresa</CardTitle>
          <CardDescription>
            Controla cómo se filtran las alertas (badges) de Actividad e Incidencias según las empresas seleccionadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dinamizar Actividad */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dinamizar-actividad" className="text-base font-medium">
                Dinamizar Alertas de Actividad
              </Label>
              <p className="text-sm text-muted-foreground">
                Filtrar el contador de actividades según las empresas seleccionadas
              </p>
            </div>
            <Switch
              id="dinamizar-actividad"
              checked={preferences?.dinamizar_actividad ?? true}
              onCheckedChange={(checked) => handleToggle('dinamizar_actividad', checked)}
              disabled={updating}
            />
          </div>

          {/* Dinamizar Incidencias */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dinamizar-incidencias" className="text-base font-medium">
                Dinamizar Alertas de Incidencias
              </Label>
              <p className="text-sm text-muted-foreground">
                Filtrar el contador de incidencias según las empresas seleccionadas
              </p>
            </div>
            <Switch
              id="dinamizar-incidencias"
              checked={preferences?.dinamizar_incidencias ?? true}
              onCheckedChange={(checked) => handleToggle('dinamizar_incidencias', checked)}
              disabled={updating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Comportamiento sin selección */}
      <Card>
        <CardHeader>
          <CardTitle>Comportamiento sin Empresas Seleccionadas</CardTitle>
          <CardDescription>
            Qué mostrar cuando no hay ninguna empresa seleccionada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.sin_seleccion_mostrar_todo ? 'all' : 'none'}
            onValueChange={handleEmptySelectionChange}
            disabled={updating}
          >
            <div className="flex items-center space-x-2 mb-3">
              <RadioGroupItem value="all" id="show-all" />
              <Label htmlFor="show-all" className="font-normal cursor-pointer">
                Mostrar todo (todas las empresas)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="none" id="show-none" />
              <Label htmlFor="show-none" className="font-normal cursor-pointer">
                No mostrar nada
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Hint informativo */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>💡 Pista:</strong> La dinamización implica filtrar las alertas en base a las empresas seleccionadas, y también puedes decidir el comportamiento al no tener ninguna seleccionada.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
