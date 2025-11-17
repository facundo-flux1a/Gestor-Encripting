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
import { BarChart3, Loader2, TrendingUp, AlertCircle, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AIMetrics {
  totales: {
    total_analisis: number;
    total_tokens: number;
    analisis_con_propia_key: number;
    por_provider: Record<string, { total_analisis: number; total_tokens: number }>;
  };
  por_modelo: Array<{
    provider: string;
    model: string;
    total_analisis: number;
    total_tokens: number;
    analisis_con_propia_key: number;
    primer_analisis: string;
    ultimo_analisis: string;
  }>;
  incidencias: {
    total_incidencias: number;
    incidencias_alta: number;
    incidencias_media: number;
    incidencias_baja: number;
  };
  // ✅ NUEVO: Límites y uso diario
  limites: {
    openai: {
      limite: number;
      usado_hoy: number;
      restante: number;
      porcentaje: number;
    };
    gemini: {
      limite: number;
      usado_hoy: number;
      restante: number;
      porcentaje: number;
    };
    is_unlimited: boolean;
  };
}

interface AIMetricsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIMetricsModal({ open, onOpenChange }: AIMetricsModalProps) {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<AIMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadMetrics();
    }
  }, [open]);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-metrics');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar métricas');
      }

      setMetrics(data.data);
    } catch (err) {
      console.error('Error cargando métricas:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  const getProviderLabel = (provider: string) => {
    return provider === 'openai' ? 'OpenAI' : 'Gemini';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'alta':
        return 'text-red-600 bg-red-50';
      case 'media':
        return 'text-yellow-600 bg-yellow-50';
      case 'baja':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getUsageColor = (porcentaje: number) => {
    if (porcentaje >= 90) return 'bg-red-500';
    if (porcentaje >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Métricas de Uso de IA
          </DialogTitle>
          <DialogDescription>
            Resumen de tu uso de análisis con inteligencia artificial
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Cargando métricas...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        ) : metrics ? (
          <div className="space-y-6">
            {/* ✅ NUEVO: Límites diarios del día actual */}
            {!metrics.limites.is_unlimited && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Uso Diario de Hoy
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* OpenAI */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">OpenAI</span>
                      <span className="text-xs font-mono text-gray-500">
                        {metrics.limites.openai.usado_hoy}/{metrics.limites.openai.limite}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Restantes</span>
                        <span className={`font-semibold ${
                          metrics.limites.openai.restante === 0 
                            ? 'text-red-600' 
                            : metrics.limites.openai.restante <= 2 
                            ? 'text-yellow-600' 
                            : 'text-green-600'
                        }`}>
                          {metrics.limites.openai.restante}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getUsageColor(metrics.limites.openai.porcentaje)}`}
                          style={{ width: `${Math.min(100, metrics.limites.openai.porcentaje)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {metrics.limites.openai.porcentaje.toFixed(0)}% usado
                      </p>
                    </div>
                  </div>

                  {/* Gemini */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">Gemini</span>
                      <span className="text-xs font-mono text-gray-500">
                        {metrics.limites.gemini.usado_hoy}/{metrics.limites.gemini.limite}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Restantes</span>
                        <span className={`font-semibold ${
                          metrics.limites.gemini.restante === 0 
                            ? 'text-red-600' 
                            : metrics.limites.gemini.restante <= 10 
                            ? 'text-yellow-600' 
                            : 'text-green-600'
                        }`}>
                          {metrics.limites.gemini.restante}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getUsageColor(metrics.limites.gemini.porcentaje)}`}
                          style={{ width: `${Math.min(100, metrics.limites.gemini.porcentaje)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {metrics.limites.gemini.porcentaje.toFixed(0)}% usado
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Advertencias */}
                {(metrics.limites.openai.porcentaje >= 80 || metrics.limites.gemini.porcentaje >= 80) && (
                  <Alert className="mt-3 border-yellow-500 bg-yellow-50">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      <strong>Advertencia:</strong> Estás cerca de alcanzar tu límite diario. 
                      Considera configurar tu propia API key para análisis ilimitados.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Usuario ilimitado */}
            {metrics.limites.is_unlimited && (
              <Alert className="border-green-500 bg-green-50">
                <Zap className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <strong>✨ Usuario Ilimitado</strong> - No tienes restricciones de uso diario
                </AlertDescription>
              </Alert>
            )}

            {/* Totales generales */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Totales Históricos</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Total Análisis</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {formatNumber(metrics.totales.total_analisis)}
                  </div>
                </div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">Total Tokens</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatNumber(metrics.totales.total_tokens)}
                  </div>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">API Propia</div>
                  <div className="text-2xl font-bold text-purple-900">
                    {formatNumber(metrics.totales.analisis_con_propia_key)}
                  </div>
                </div>
              </div>
            </div>

            {/* Por proveedor */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Uso por Proveedor
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(metrics.totales.por_provider).map(([provider, data]) => (
                  <div
                    key={provider}
                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">
                        {getProviderLabel(provider)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {((data.total_tokens / metrics.totales.total_tokens) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>Análisis: {formatNumber(data.total_analisis)}</div>
                      <div>Tokens: {formatNumber(data.total_tokens)}</div>
                    </div>
                    {/* Barra de progreso */}
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          provider === 'openai' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{
                          width: `${(data.total_tokens / metrics.totales.total_tokens) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detalle por modelo */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Detalle por Modelo</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Proveedor</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Modelo</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Análisis</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {metrics.por_modelo.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              row.provider === 'openai'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {getProviderLabel(row.provider)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.model}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatNumber(row.total_analisis)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatNumber(row.total_tokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Incidencias detectadas */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Incidencias Detectadas
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="text-sm text-gray-600 font-medium">Total</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatNumber(metrics.incidencias.total_incidencias)}
                  </div>
                </div>
                <div className={`p-4 border rounded-lg ${getSeverityColor('alta')}`}>
                  <div className="text-sm font-medium">Alta</div>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.incidencias.incidencias_alta)}
                  </div>
                </div>
                <div className={`p-4 border rounded-lg ${getSeverityColor('media')}`}>
                  <div className="text-sm font-medium">Media</div>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.incidencias.incidencias_media)}
                  </div>
                </div>
                <div className={`p-4 border rounded-lg ${getSeverityColor('baja')}`}>
                  <div className="text-sm font-medium">Baja</div>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.incidencias.incidencias_baja)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}