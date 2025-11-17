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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Configuración de Análisis con IA
          </DialogTitle>
          <DialogDescription>
            Configura cómo se analizan tus documentos con inteligencia artificial
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Información sobre keys compartidas */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>API Keys Compartidas:</strong> Por defecto, usamos nuestras API keys con límites diarios.
                Si necesitás análisis ilimitados, podés configurar tu propia API key.
              </AlertDescription>
            </Alert>

            {/* Selector de proveedor compartido */}
            {!config.useOwnKey && (
              <div className="space-y-2 rounded-lg border p-4 bg-muted/50">
                <Label htmlFor="shared-provider">Proveedor Compartido</Label>
                <Select
                  value={config.sharedProvider}
                  onValueChange={(value) =>
                    setConfig({ ...config, sharedProvider: value as 'gemini' | 'openai' })
                  }
                >
                  <SelectTrigger id="shared-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">
                      🚀 Google Gemini (50 análisis/día)
                    </SelectItem>
                    <SelectItem value="openai">
                      🤖 OpenAI GPT-4o-mini (5 análisis/día)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config.sharedProvider === 'gemini' 
                    ? 'Gemini es más rápido y tiene mayor límite. Fallback automático a OpenAI si alcanza el límite.'
                    : 'OpenAI como prioridad. Fallback automático a Gemini si alcanza el límite.'}
                </p>
              </div>
            )}

            {/* Toggle para usar API key propia */}
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="use-own-key" className="text-base">
                  Usar mi propia API Key
                </Label>
                <p className="text-sm text-muted-foreground">
                  Sin límites diarios. Costos por tu cuenta.
                </p>
              </div>
              <Switch
                id="use-own-key"
                checked={config.useOwnKey}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, useOwnKey: checked })
                }
              />
            </div>

            {/* Configuración de API key propia */}
            {config.useOwnKey && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="provider">Proveedor</Label>
                  <Select
                    value={config.ownProvider || ''}
                    onValueChange={(value) =>
                      setConfig({ ...config, ownProvider: value as 'openai' | 'gemini' })
                    }
                  >
                    <SelectTrigger id="provider">
                      <SelectValue placeholder="Selecciona un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="sk-proj-... o AIza..."
                      value={config.ownApiKey}
                      onChange={(e) =>
                        setConfig({ ...config, ownApiKey: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tu API key se guarda encriptada y nunca se comparte.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Modelo</Label>
                  <Select
                    value={config.preferredModel}
                    onValueChange={(value) =>
                      setConfig({ ...config, preferredModel: value })
                    }
                  >
                    <SelectTrigger id="model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config.ownProvider === 'openai' && (
                        <>
                          <SelectItem value="gpt-4o-mini">GPT-4o-mini (Recomendado)</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        </>
                      )}
                      {config.ownProvider === 'gemini' && (
                        <>
                          <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Recomendado)</SelectItem>
                          <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Prompt personalizado */}
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">
                Prompt Personalizado (Opcional)
              </Label>
              <Textarea
                id="custom-prompt"
                placeholder="Ej: Prioriza facturas superiores a 1000€, ignora errores menores en descripciones..."
                value={config.customPrompt}
                onChange={(e) =>
                  setConfig({ ...config, customPrompt: e.target.value })
                }
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Instrucciones adicionales para el análisis. Se combinarán con nuestro prompt base optimizado.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Success message */}
            {saveSuccess && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Configuración guardada correctamente
                </AlertDescription>
              </Alert>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Configuración'
                )}
              </Button>
            </div>

            {/* Info de uso compartido */}
            {!config.useOwnKey && (
              <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">ℹ️ Usando API keys compartidas:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Gemini: 50 análisis/día (más rápido y mayor límite)</li>
                  <li>OpenAI: 5 análisis/día (fallback automático)</li>
                  <li>Los límites se reinician a las 00:00 hs</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}