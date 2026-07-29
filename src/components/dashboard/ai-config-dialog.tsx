'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Key, Sparkles, Info, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AIConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AIConfig {
  useOwnKey: boolean;
  ownProvider: 'openai' | 'openai' | null;
  ownApiKey: string;
  customPrompt: string;
  preferredModel: string;
  sharedProvider: 'openai' | 'openai';
}

export function AIConfigDialog({ isOpen, onClose }: AIConfigDialogProps) {
  const [config, setConfig] = useState<AIConfig>({
    useOwnKey: false,
    ownProvider: null,
    ownApiKey: '',
    customPrompt: '',
    preferredModel: 'gpt-4o-mini',
    sharedProvider: 'openai',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai-config');
      if (!response.ok) throw new Error('Error al cargar configuración');
      const data = await response.json();
      
      setConfig({
        useOwnKey: data.useOwnKey || false,
        ownProvider: data.ownProvider || null,
        ownApiKey: '',
        customPrompt: data.customPrompt || '',
        preferredModel: data.preferredModel || 'gpt-4o-mini',
        sharedProvider: data.sharedProvider || 'openai',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useOwnKey: config.useOwnKey,
          ownProvider: config.useOwnKey ? config.ownProvider : null,
          ownApiKey: config.useOwnKey && config.ownApiKey ? config.ownApiKey : null,
          customPrompt: config.customPrompt || null,
          preferredModel: config.preferredModel,
          sharedProvider: config.sharedProvider,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al guardar configuración');
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* 📱 DIALOG RESPONSIVE CON ALTURA MÁXIMA */}
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[90vw] lg:max-w-2xl max-h-[95vh] sm:max-h-[90vh] p-0 gap-0 flex flex-col">
        
        {/* 📱 HEADER FIJO - NO SCROLLEA */}
        <DialogHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl pr-8">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500 shrink-0" />
            <span className="truncate">Configuración IA</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            Configura el análisis con IA
          </DialogDescription>
        </DialogHeader>

        {/* 📱 CONTENIDO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 lg:px-6 sm:py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              
              {/* 📱 INFO COMPARTIDAS - COMPACTO */}
              <Alert className="text-xs sm:text-sm py-2 sm:py-3">
                <Info className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 mt-0.5" />
                <AlertDescription className="leading-snug">
                  <strong className="block sm:inline">API Keys Compartidas:</strong>
                  <span className="block sm:inline sm:ml-1">Por defecto usamos nuestras keys con límites diarios.</span>
                </AlertDescription>
              </Alert>

              {/* 📱 SELECTOR COMPARTIDO - SOLO VISIBLE CUANDO NO USA PROPIA */}
              {!config.useOwnKey && (
                <div className="space-y-2 rounded-lg border p-2.5 sm:p-3 bg-muted/50">
                  <Label htmlFor="shared-provider" className="text-xs sm:text-sm font-medium">
                    Proveedor Compartido
                  </Label>
                  <Select
                    value={config.sharedProvider}
                    onValueChange={(value) =>
                      setConfig({ ...config, sharedProvider: value as 'openai' })
                    }
                  >
                    <SelectTrigger id="shared-provider" className="h-8 sm:h-9 text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai" className="text-xs sm:text-sm">
                        🤖 OpenAI (5/día)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                    Análisis con OpenAI (límite diario compartido).
                  </p>
                </div>
              )}

              {/* 📱 TOGGLE API PROPIA - COMPACTO Y RESPONSIVE */}
              <div className="flex items-start justify-between gap-2 sm:gap-3 rounded-lg border p-2.5 sm:p-3">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <Label htmlFor="use-own-key" className="text-xs sm:text-sm font-medium cursor-pointer">
                    Usar mi API Key
                  </Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                    Sin límites. Costos por tu cuenta.
                  </p>
                </div>
                <Switch
                  id="use-own-key"
                  checked={config.useOwnKey}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, useOwnKey: checked })
                  }
                  className="shrink-0"
                />
              </div>

              {/* 📱 CONFIG API PROPIA - DESPLEGABLE */}
              {config.useOwnKey && (
                <div className="space-y-2.5 sm:space-y-3 rounded-lg border p-2.5 sm:p-3 bg-muted/50">
                  
                  {/* Proveedor */}
                  <div className="space-y-1.5">
                    <Label htmlFor="provider" className="text-xs sm:text-sm">
                      Proveedor
                    </Label>
                    <Select
                      value={config.ownProvider || ''}
                      onValueChange={(value) =>
                        setConfig({ ...config, ownProvider: value as 'openai' })
                      }
                    >
                      <SelectTrigger id="provider" className="h-8 sm:h-9 text-xs sm:text-sm">
                        <SelectValue placeholder="Selecciona proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai" className="text-xs sm:text-sm">
                          🤖 OpenAI
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* API Key */}
                  <div className="space-y-1.5">
                    <Label htmlFor="api-key" className="text-xs sm:text-sm">
                      API Key
                    </Label>
                    <div className="relative">
                      <Key className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        id="api-key"
                        type="password"
                        placeholder="sk-proj-..."
                        value={config.ownApiKey}
                        onChange={(e) =>
                          setConfig({ ...config, ownApiKey: e.target.value })
                        }
                        className="pl-7 sm:pl-8 h-8 sm:h-9 text-xs sm:text-sm"
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Se guarda encriptada. Nunca se comparte.
                    </p>
                  </div>

                  {/* Modelo */}
                  <div className="space-y-1.5">
                    <Label htmlFor="model" className="text-xs sm:text-sm">
                      Modelo Preferido
                    </Label>
                    <Select
                      value={config.preferredModel}
                      onValueChange={(value) =>
                        setConfig({ ...config, preferredModel: value })
                      }
                      disabled={!config.ownProvider}
                    >
                      <SelectTrigger id="model" className="h-8 sm:h-9 text-xs sm:text-sm">
                        <SelectValue placeholder="Selecciona modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {config.ownProvider === 'openai' && (
                          <>
                            <SelectItem value="gpt-4o-mini" className="text-xs sm:text-sm">
                              GPT-4o-mini (rápido)
                            </SelectItem>
                            <SelectItem value="gpt-4o" className="text-xs sm:text-sm">
                              GPT-4o (equilibrado)
                            </SelectItem>
                            <SelectItem value="gpt-4-turbo" className="text-xs sm:text-sm">
                              GPT-4 Turbo (potente)
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* 📱 PROMPT PERSONALIZADO */}
              <div className="space-y-1.5">
                <Label htmlFor="custom-prompt" className="text-xs sm:text-sm">
                  Prompt Personalizado (Opcional)
                </Label>
                <Textarea
                  id="custom-prompt"
                  placeholder="Ej: Prioriza facturas > 1000€ y verifica fechas de vencimiento..."
                  value={config.customPrompt}
                  onChange={(e) =>
                    setConfig({ ...config, customPrompt: e.target.value })
                  }
                  rows={2}
                  className="text-xs sm:text-sm resize-none min-h-[60px] sm:min-h-[80px]"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Se combina con nuestro prompt base optimizado
                </p>
              </div>

              {/* 📱 MENSAJES DE ERROR/ÉXITO */}
              {error && (
                <Alert variant="destructive" className="py-2 sm:py-2.5">
                  <AlertDescription className="text-xs sm:text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {saveSuccess && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20 py-2 sm:py-2.5">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-500 shrink-0" />
                  <AlertDescription className="text-xs sm:text-sm text-green-800 dark:text-green-200">
                    ✓ Configuración guardada correctamente
                  </AlertDescription>
                </Alert>
              )}

              {/* 📱 INFO BOX COMPARTIDO */}
              {!config.useOwnKey && (
                <div className="text-[10px] sm:text-xs p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg space-y-1.5">
                  <p className="font-medium text-blue-900 dark:text-blue-100">ℹ️ Límites de API keys compartidas:</p>
                  <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-0.5 pl-1">
                    <li>OpenAI: 50 análisis/día (recomendado)</li>
                    <li>OpenAI GPT-4o-mini: 5 análisis/día (fallback)</li>
                    <li>Reinicio automático: todos los días a las 00:00 hs</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 📱 FOOTER FIJO CON BOTONES */}
        <div className="border-t px-3 py-2.5 sm:px-4 lg:px-6 sm:py-3 flex-shrink-0 bg-background">
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={isSaving}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving || isLoading}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-1.5 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin shrink-0" />
                  <span>Guardando...</span>
                </>
              ) : (
                'Guardar Configuración'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}