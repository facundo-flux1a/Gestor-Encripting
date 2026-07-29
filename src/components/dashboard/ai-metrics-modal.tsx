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
  onNavigateToIncidents?: (severity?: 'alta' | 'media' | 'baja') => void;
}

export function AIMetricsModal({ open, onOpenChange, onNavigateToIncidents }: AIMetricsModalProps) {
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
    return 'OpenAI';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'alta':
        return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/20 dark:border-red-900';
      case 'media':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/20 dark:border-yellow-900';
      case 'baja':
        return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/20 dark:border-blue-900';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-950/20 dark:border-gray-800';
    }
  };

  const getUsageColor = (porcentaje: number) => {
    if (porcentaje >= 90) return 'bg-red-500';
    if (porcentaje >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleIncidentClick = (severity?: 'alta' | 'media' | 'baja', count?: number) => {
    if (count && count > 0 && onNavigateToIncidents) {
      onNavigateToIncidents(severity);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 📱 DIALOG RESPONSIVE */}
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[90vw] lg:max-w-3xl max-h-[95vh] sm:max-h-[85vh] p-0 gap-0 flex flex-col">
        
        {/* 📱 HEADER FIJO */}
        <DialogHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl pr-8">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="truncate">Métricas de IA</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            Resumen de uso de análisis con IA
          </DialogDescription>
        </DialogHeader>

        {/* 📱 CONTENIDO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 lg:px-6 sm:py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-2 sm:gap-3">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-blue-600" />
              <span className="text-xs sm:text-sm text-muted-foreground">Cargando métricas...</span>
            </div>
          ) : error ? (
            <Alert variant="destructive" className="text-xs sm:text-sm">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : metrics ? (
            <div className="space-y-3 sm:space-y-4 lg:space-y-6">
              
              {/* 📱 LÍMITES DIARIOS */}
              {!metrics.limites.is_unlimited && (
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 shrink-0" />
                    <span>Uso de Hoy</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                    {/* OpenAI */}
                    <div className="p-2.5 sm:p-3 lg:p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <span className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 dark:text-gray-100">OpenAI</span>
                        <span className="text-[10px] sm:text-xs font-mono text-gray-500 dark:text-gray-400 tabular-nums">
                          {metrics.limites.openai.usado_hoy}/{metrics.limites.openai.limite}
                        </span>
                      </div>
                      <div className="space-y-1 sm:space-y-1.5 lg:space-y-2">
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Restantes</span>
                          <span className={`font-semibold tabular-nums ${
                            metrics.limites.openai.restante === 0 
                              ? 'text-red-600 dark:text-red-400' 
                              : metrics.limites.openai.restante <= 2 
                              ? 'text-yellow-600 dark:text-yellow-400' 
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            {metrics.limites.openai.restante}
                          </span>
                        </div>
                        <div className="h-1.5 sm:h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${getUsageColor(metrics.limites.openai.porcentaje)}`}
                            style={{ width: `${Math.min(100, metrics.limites.openai.porcentaje)}%` }}
                          />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center tabular-nums">
                          {metrics.limites.openai.porcentaje.toFixed(0)}% usado
                        </p>
                      </div>
                    </div>

                  </div>
                  
                  {/* 📱 ADVERTENCIAS */}
                  {metrics.limites.openai.porcentaje >= 80 && (
                    <Alert className="mt-2 sm:mt-3 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900 text-xs sm:text-sm">
                      <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
                      <AlertDescription className="text-yellow-800 dark:text-yellow-200 leading-snug">
                        <strong>Advertencia:</strong> Cerca del límite diario. 
                        Configura tu API key para análisis ilimitados.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* 📱 USUARIO ILIMITADO */}
              {metrics.limites.is_unlimited && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20 dark:border-green-900 text-xs sm:text-sm">
                  <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-500 shrink-0" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>✨ Usuario Ilimitado</strong> - Sin restricciones de uso
                  </AlertDescription>
                </Alert>
              )}

              {/* 📱 TOTALES GENERALES - GRID RESPONSIVE */}
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3">Totales Históricos</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                  <div className="p-2 sm:p-2.5 lg:p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                    <div className="text-[10px] sm:text-xs lg:text-sm text-blue-600 dark:text-blue-400 font-medium">Análisis</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold text-blue-900 dark:text-blue-100 truncate tabular-nums">
                      {formatNumber(metrics.totales.total_analisis)}
                    </div>
                  </div>
                  <div className="p-2 sm:p-2.5 lg:p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                    <div className="text-[10px] sm:text-xs lg:text-sm text-green-600 dark:text-green-400 font-medium">Tokens</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold text-green-900 dark:text-green-100 truncate tabular-nums">
                      {formatNumber(metrics.totales.total_tokens)}
                    </div>
                  </div>
                  <div className="p-2 sm:p-2.5 lg:p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-lg">
                    <div className="text-[10px] sm:text-xs lg:text-sm text-purple-600 dark:text-purple-400 font-medium">API Propia</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold text-purple-900 dark:text-purple-100 truncate tabular-nums">
                      {formatNumber(metrics.totales.analisis_con_propia_key)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 📱 POR PROVEEDOR */}
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span>Por Proveedor</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                  {Object.entries(metrics.totales.por_provider).map(([provider, data]) => (
                    <div
                      key={provider}
                      className="p-2.5 sm:p-3 lg:p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <span className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 dark:text-gray-100">
                          {getProviderLabel(provider)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {((data.total_tokens / metrics.totales.total_tokens) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        <div>Análisis: <span className="tabular-nums">{formatNumber(data.total_analisis)}</span></div>
                        <div>Tokens: <span className="tabular-nums">{formatNumber(data.total_tokens)}</span></div>
                      </div>
                      <div className="mt-1.5 sm:mt-2 h-1.5 sm:h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
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

              {/* 📱 DETALLE POR MODELO - MOBILE CARDS / DESKTOP TABLE */}
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3">Por Modelo</h3>
                
                {/* 📱 MOBILE: CARDS */}
                <div className="lg:hidden space-y-2">
                  {metrics.por_modelo.map((row, idx) => (
                    <div key={idx} className="p-2.5 sm:p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                          row.provider === 'openai'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                        }`}>
                          {getProviderLabel(row.provider)}
                        </span>
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium truncate ml-2">{row.model}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Análisis:</span>
                          <span className="ml-1 font-semibold tabular-nums">{formatNumber(row.total_analisis)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Tokens:</span>
                          <span className="ml-1 font-semibold tabular-nums">{formatNumber(row.total_tokens)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 🖥️ DESKTOP: TABLE */}
                <div className="hidden lg:block border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Proveedor</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Modelo</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Análisis</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Tokens</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {metrics.por_modelo.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                row.provider === 'openai'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                              }`}>
                                {getProviderLabel(row.provider)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.model}</td>
                            <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 tabular-nums">
                              {formatNumber(row.total_analisis)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100 tabular-nums">
                              {formatNumber(row.total_tokens)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 📱 INCIDENCIAS - CLICKEABLE */}
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span>Incidencias</span>
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                  {/* Total - clickeable si hay incidencias */}
                  <div 
                    onClick={() => handleIncidentClick(undefined, metrics.incidencias.total_incidencias)}
                    className={`p-2 sm:p-2.5 lg:p-4 border border-gray-200 dark:border-gray-800 rounded-lg transition-all ${
                      metrics.incidencias.total_incidencias > 0 
                        ? 'cursor-pointer hover:shadow-lg hover:scale-105 hover:border-gray-400 dark:hover:border-gray-600' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-[10px] sm:text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium">Total</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate tabular-nums">
                      {formatNumber(metrics.incidencias.total_incidencias)}
                    </div>
                  </div>

                  {/* Alta - clickeable si hay incidencias */}
                  <div 
                    onClick={() => handleIncidentClick('alta', metrics.incidencias.incidencias_alta)}
                    className={`p-2 sm:p-2.5 lg:p-4 border rounded-lg transition-all ${getSeverityColor('alta')} ${
                      metrics.incidencias.incidencias_alta > 0 
                        ? 'cursor-pointer hover:shadow-lg hover:scale-105' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-[10px] sm:text-xs lg:text-sm font-medium">Alta</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold truncate tabular-nums">
                      {formatNumber(metrics.incidencias.incidencias_alta)}
                    </div>
                  </div>

                  {/* Media - clickeable si hay incidencias */}
                  <div 
                    onClick={() => handleIncidentClick('media', metrics.incidencias.incidencias_media)}
                    className={`p-2 sm:p-2.5 lg:p-4 border rounded-lg transition-all ${getSeverityColor('media')} ${
                      metrics.incidencias.incidencias_media > 0 
                        ? 'cursor-pointer hover:shadow-lg hover:scale-105' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-[10px] sm:text-xs lg:text-sm font-medium">Media</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold truncate tabular-nums">
                      {formatNumber(metrics.incidencias.incidencias_media)}
                    </div>
                  </div>

                  {/* Baja - clickeable si hay incidencias */}
                  <div 
                    onClick={() => handleIncidentClick('baja', metrics.incidencias.incidencias_baja)}
                    className={`p-2 sm:p-2.5 lg:p-4 border rounded-lg transition-all ${getSeverityColor('baja')} ${
                      metrics.incidencias.incidencias_baja > 0 
                        ? 'cursor-pointer hover:shadow-lg hover:scale-105' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-[10px] sm:text-xs lg:text-sm font-medium">Baja</div>
                    <div className="text-base sm:text-lg lg:text-2xl font-bold truncate tabular-nums">
                      {formatNumber(metrics.incidencias.incidencias_baja)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 📱 FOOTER FIJO */}
        <div className="border-t px-3 py-2.5 sm:px-4 lg:px-6 sm:py-3 flex-shrink-0 bg-background">
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-8 sm:h-9 text-xs sm:text-sm"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}