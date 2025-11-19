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
        return 'text-red-600 bg-red-50 border-red-200';
      case 'media':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'baja':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getUsageColor = (porcentaje: number) => {
    if (porcentaje >= 90) return 'bg-red-500';
    if (porcentaje >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:w-[90vw] max-w-3xl h-[96vh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 flex flex-col">
        {/* Header fijo */}
        <DialogHeader className="px-3 py-3 sm:px-6 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-xl pr-8">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span>Métricas de IA</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            Resumen de uso de análisis con IA
          </DialogDescription>
        </DialogHeader>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-blue-600" />
              <span className="text-xs sm:text-sm text-gray-600">Cargando métricas...</span>
            </div>
          ) : error ? (
            <Alert variant="destructive" className="text-xs sm:text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : metrics ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Límites diarios */}
              {!metrics.limites.is_unlimited && (
                <div>
                  <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 flex-shrink-0" />
                    <span>Uso de Hoy</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {/* OpenAI */}
                    <div className="p-3 sm:p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm sm:text-base font-semibold text-gray-900">OpenAI</span>
                        <span className="text-[10px] sm:text-xs font-mono text-gray-500">
                          {metrics.limites.openai.usado_hoy}/{metrics.limites.openai.limite}
                        </span>
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex justify-between text-xs sm:text-sm">
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
                        <div className="h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getUsageColor(metrics.limites.openai.porcentaje)}`}
                            style={{ width: `${Math.min(100, metrics.limites.openai.porcentaje)}%` }}
                          />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 text-center">
                          {metrics.limites.openai.porcentaje.toFixed(0)}% usado
                        </p>
                      </div>
                    </div>

                    {/* Gemini */}
                    <div className="p-3 sm:p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm sm:text-base font-semibold text-gray-900">Gemini</span>
                        <span className="text-[10px] sm:text-xs font-mono text-gray-500">
                          {metrics.limites.gemini.usado_hoy}/{metrics.limites.gemini.limite}
                        </span>
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex justify-between text-xs sm:text-sm">
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
                        <div className="h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getUsageColor(metrics.limites.gemini.porcentaje)}`}
                            style={{ width: `${Math.min(100, metrics.limites.gemini.porcentaje)}%` }}
                          />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 text-center">
                          {metrics.limites.gemini.porcentaje.toFixed(0)}% usado
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Advertencias */}
                  {(metrics.limites.openai.porcentaje >= 80 || metrics.limites.gemini.porcentaje >= 80) && (
                    <Alert className="mt-3 border-yellow-500 bg-yellow-50 text-xs sm:text-sm">
                      <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-600 flex-shrink-0" />
                      <AlertDescription className="text-yellow-800 leading-snug">
                        <strong>Advertencia:</strong> Cerca del límite diario. 
                        Configura tu API key para análisis ilimitados.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Usuario ilimitado */}
              {metrics.limites.is_unlimited && (
                <Alert className="border-green-500 bg-green-50 text-xs sm:text-sm">
                  <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
                  <AlertDescription className="text-green-800">
                    <strong>✨ Usuario Ilimitado</strong> - Sin restricciones de uso
                  </AlertDescription>
                </Alert>
              )}

              {/* Totales generales */}
              <div>
                <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3">Totales Históricos</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="p-2.5 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-[10px] sm:text-sm text-blue-600 font-medium">Análisis</div>
                    <div className="text-lg sm:text-2xl font-bold text-blue-900 truncate">
                      {formatNumber(metrics.totales.total_analisis)}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-[10px] sm:text-sm text-green-600 font-medium">Tokens</div>
                    <div className="text-lg sm:text-2xl font-bold text-green-900 truncate">
                      {formatNumber(metrics.totales.total_tokens)}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="text-[10px] sm:text-sm text-purple-600 font-medium">API Propia</div>
                    <div className="text-lg sm:text-2xl font-bold text-purple-900 truncate">
                      {formatNumber(metrics.totales.analisis_con_propia_key)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Por proveedor */}
              <div>
                <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span>Por Proveedor</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {Object.entries(metrics.totales.por_provider).map(([provider, data]) => (
                    <div
                      key={provider}
                      className="p-3 sm:p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm sm:text-base font-semibold text-gray-900">
                          {getProviderLabel(provider)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-gray-500">
                          {((data.total_tokens / metrics.totales.total_tokens) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600">
                        <div>Análisis: {formatNumber(data.total_analisis)}</div>
                        <div>Tokens: {formatNumber(data.total_tokens)}</div>
                      </div>
                      <div className="mt-2 h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden">
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
                <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3">Por Modelo</h3>
                
                {/* Mobile: Cards */}
                <div className="sm:hidden space-y-2">
                  {metrics.por_modelo.map((row, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          row.provider === 'openai'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {getProviderLabel(row.provider)}
                        </span>
                        <span className="text-xs text-gray-600 font-medium">{row.model}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Análisis:</span>
                          <span className="ml-1 font-semibold">{formatNumber(row.total_analisis)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Tokens:</span>
                          <span className="ml-1 font-semibold">{formatNumber(row.total_tokens)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: Table */}
                <div className="hidden sm:block border border-gray-200 rounded-lg overflow-hidden">
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
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              row.provider === 'openai'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
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
                <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span>Incidencias</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  <div className="p-2.5 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="text-[10px] sm:text-sm text-gray-600 font-medium">Total</div>
                    <div className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                      {formatNumber(metrics.incidencias.total_incidencias)}
                    </div>
                  </div>
                  <div className={`p-2.5 sm:p-4 border rounded-lg ${getSeverityColor('alta')}`}>
                    <div className="text-[10px] sm:text-sm font-medium">Alta</div>
                    <div className="text-lg sm:text-2xl font-bold truncate">
                      {formatNumber(metrics.incidencias.incidencias_alta)}
                    </div>
                  </div>
                  <div className={`p-2.5 sm:p-4 border rounded-lg ${getSeverityColor('media')}`}>
                    <div className="text-[10px] sm:text-sm font-medium">Media</div>
                    <div className="text-lg sm:text-2xl font-bold truncate">
                      {formatNumber(metrics.incidencias.incidencias_media)}
                    </div>
                  </div>
                  <div className={`p-2.5 sm:p-4 border rounded-lg ${getSeverityColor('baja')}`}>
                    <div className="text-[10px] sm:text-sm font-medium">Baja</div>
                    <div className="text-lg sm:text-2xl font-bold truncate">
                      {formatNumber(metrics.incidencias.incidencias_baja)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer fijo */}
        <div className="border-t px-3 py-2.5 sm:px-6 sm:py-3 flex-shrink-0 bg-background">
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-9 text-xs sm:text-sm"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}