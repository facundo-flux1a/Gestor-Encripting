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
  ownProvider: 'openai' | 'gemini' | null;
  ownApiKey: string;
  customPrompt: string;
  preferredModel: string;
  sharedProvider: 'gemini' | 'openai';
}

export function AIConfigDialog({ isOpen, onClose }: AIConfigDialogProps) {
  const [config, setConfig] = useState<AIConfig>({
    useOwnKey: false,
    ownProvider: null,
    ownApiKey: '',
    customPrompt: '',
    preferredModel: 'gpt-4o-mini',
    sharedProvider: 'gemini',
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
        sharedProvider: data.sharedProvider || 'gemini',
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
      <DialogContent className="w-[96vw] sm:w-[90vw] max-w-2xl h-[96vh] sm:h-auto sm:max-h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header fijo */}
        <DialogHeader className="px-3 py-3 sm:px-6 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-xl pr-8">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500 flex-shrink-0" />
            <span>Configuración IA</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            Configura el análisis con IA
          </DialogDescription>
        </DialogHeader>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {/* Info compartidas - más compacto */}
              <Alert className="text-xs sm:text-sm py-2 sm:py-3">
                <Info className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5" />
                <AlertDescription className="leading-snug">
                  <strong>API Keys Compartidas:</strong> Por defecto usamos nuestras keys con límites diarios.
                </AlertDescription>
              </Alert>

              {/* Selector compartido - compacto */}
              {!config.useOwnKey && (
                <div className="space-y-2 rounded-lg border p-2.5 sm:p-3 bg-muted/50">
                  <Label htmlFor="shared-provider" className="text-xs sm:text-sm font-medium">
                    Proveedor Compartido
                  </Label>
                  <Select
                    value={config.sharedProvider}
                    onValueChange={(value) =>
                      setConfig({ ...config, sharedProvider: value as 'gemini' | 'openai' })
                    }
                  >
                    <SelectTrigger id="shared-provider" className="h-9 text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini" className="text-xs sm:text-sm">
                        🚀 Gemini (50/día)
                      </SelectItem>
                      <SelectItem value="openai" className="text-xs sm:text-sm">
                        🤖 OpenAI (5/día)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                    {config.sharedProvider === 'gemini' 
                      ? 'Más rápido y mayor límite. Fallback a OpenAI.'
                      : 'Fallback automático a Gemini si alcanza límite.'}
                  </p>
                </div>
              )}

              {/* Toggle API propia - compacto */}
              <div className="flex items-start justify-between gap-3 rounded-lg border p-2.5 sm:p-3">
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
                  className="flex-shrink-0"
                />
              </div>

              {/* Config API propia - más compacto */}
              {config.useOwnKey && (
                <div className="space-y-2.5 sm:space-y-3 rounded-lg border p-2.5 sm:p-3 bg-muted/50">
                  <div className="space-y-1.5">
                    <Label htmlFor="provider" className="text-xs sm:text-sm">
                      Proveedor
                    </Label>
                    <Select
                      value={config.ownProvider || ''}
                      onValueChange={(value) =>
                        setConfig({ ...config, ownProvider: value as 'openai' | 'gemini' })
                      }
                    >
                      <SelectTrigger id="provider" className="h-9 text-xs sm:text-sm">
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai" className="text-xs sm:text-sm">
                          OpenAI
                        </SelectItem>
                        <SelectItem value="gemini" className="text-xs sm:text-sm">
                          Gemini
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api-key" className="text-xs sm:text-sm">
                      API Key
                    </Label>
                    <div className="relative">
                      <Key className="absolute left-2 sm:left-2.5 top-2 sm:top-2.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                      <Input
                        id="api-key"
                        type="password"
                        placeholder="sk-proj-..."
                        value={config.ownApiKey}
                        onChange={(e) =>
                          setConfig({ ...config, ownApiKey: e.target.value })
                        }
                        className="pl-7 sm:pl-8 h-9 text-xs sm:text-sm"
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Se guarda encriptada
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="model" className="text-xs sm:text-sm">
                      Modelo
                    </Label>
                    <Select
                      value={config.preferredModel}
                      onValueChange={(value) =>
                        setConfig({ ...config, preferredModel: value })
                      }
                    >
                      <SelectTrigger id="model" className="h-9 text-xs sm:text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {config.ownProvider === 'openai' && (
                          <>
                            <SelectItem value="gpt-4o-mini" className="text-xs sm:text-sm">
                              GPT-4o-mini
                            </SelectItem>
                            <SelectItem value="gpt-4o" className="text-xs sm:text-sm">
                              GPT-4o
                            </SelectItem>
                            <SelectItem value="gpt-4-turbo" className="text-xs sm:text-sm">
                              GPT-4 Turbo
                            </SelectItem>
                          </>
                        )}
                        {config.ownProvider === 'gemini' && (
                          <>
                            <SelectItem value="gemini-1.5-flash" className="text-xs sm:text-sm">
                              Gemini Flash
                            </SelectItem>
                            <SelectItem value="gemini-1.5-pro" className="text-xs sm:text-sm">
                              Gemini Pro
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Prompt - más compacto */}
              <div className="space-y-1.5">
                <Label htmlFor="custom-prompt" className="text-xs sm:text-sm">
                  Prompt Personalizado (Opcional)
                </Label>
                <Textarea
                  id="custom-prompt"
                  placeholder="Ej: Prioriza facturas > 1000€..."
                  value={config.customPrompt}
                  onChange={(e) =>
                    setConfig({ ...config, customPrompt: e.target.value })
                  }
                  rows={2}
                  className="text-xs sm:text-sm resize-none min-h-[60px] sm:min-h-[80px]"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Se combina con nuestro prompt base
                </p>
              </div>

              {/* Mensajes */}
              {error && (
                <Alert variant="destructive" className="py-2 text-xs sm:text-sm">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {saveSuccess && (
                <Alert className="border-green-500 bg-green-50 py-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Guardado correctamente
                  </AlertDescription>
                </Alert>
              )}

              {/* Info compartido - compacto */}
              {!config.useOwnKey && (
                <div className="text-[10px] sm:text-xs p-2.5 sm:p-3 bg-muted/50 rounded-lg space-y-1">
                  <p className="font-medium">ℹ️ API keys compartidas:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                    <li>Gemini: 50/día (rápido)</li>
                    <li>OpenAI: 5/día (fallback)</li>
                    <li>Reinicio: 00:00 hs</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer fijo con botones */}
        <div className="border-t px-3 py-2.5 sm:px-6 sm:py-3 flex-shrink-0 bg-background">
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button 
              variant="outline" 
              onClick={onClose} 
              disabled={isSaving}
              className="w-full sm:w-auto h-9 text-xs sm:text-sm"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="w-full sm:w-auto h-9 text-xs sm:text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}