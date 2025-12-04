'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Bot, Loader2, FileWarning, Settings, Sparkles, BarChart3 } from 'lucide-react';
import { AIConfigDialog } from '../dashboard/ai-config-dialog';
import { AIMetricsModal } from '../dashboard/ai-metrics-modal';

interface AnalyzeDocumentCardProps {
    documentId: number;
    onAnalysisComplete: () => void;
}

interface AnalysisResult {
    success: boolean;
    incidentsFound: number;
    incidents?: any[];
    provider?: string;
    model?: string;
    tokensUsed?: number;
}

export function AnalyzeDocumentCard({ documentId, onAnalysisComplete }: AnalyzeDocumentCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isMetricsOpen, setIsMetricsOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const handleAnalyze = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch('/api/analyze-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al analizar el documento');
            }

            const analysisResult = await response.json();
            setResult(analysisResult);
            
            toast({
                title: "✅ Análisis Completado",
                description: `Se encontraron ${analysisResult.incidentsFound} incidencia${analysisResult.incidentsFound !== 1 ? 's' : ''}`,
                className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
            });

            if (analysisResult.incidentsFound > 0) {
                onAnalysisComplete();
            }

            setTimeout(() => {
                onAnalysisComplete();
            }, 2000);

        } catch (e: any) {
            console.error("Error en análisis:", e);
            const errorMessage = e.message || 'Ocurrió un error al analizar el documento.';
            setError(errorMessage);
            toast({
                title: "❌ Error en el Análisis",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleNavigateToIncidents = (severity?: 'alta' | 'media' | 'baja') => {
        if (severity) {
            router.push(`/incidents`);
        } else {
            router.push('/incidencias');
        }
    };

    return (
        <>
            <Card className="flex flex-col transition-all duration-300 hover:shadow-lg">
                <CardHeader className="space-y-2">
                    <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                        </div>
                        <span className="line-clamp-2">Análisis Inteligente con IA</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                        Utiliza OpenAI/Gemini para detectar inconsistencias, errores de cálculo y duplicados automáticamente.
                    </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-grow space-y-4">
                    {/* 🎯 BOTONES DE CONFIGURACIÓN - AJUSTADOS */}
                    <div className="grid grid-cols-2 gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsMetricsOpen(true)}
                            disabled={isLoading}
                            className="w-full hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 dark:hover:bg-purple-950 dark:hover:text-purple-400 dark:hover:border-purple-700 transition-all duration-200 group"
                        >
                            <BarChart3 className="h-3.5 w-3.5 mr-1.5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
                            <span className="truncate text-xs">Métricas</span>
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsConfigOpen(true)}
                            disabled={isLoading}
                            className="w-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-all duration-200 group"
                        >
                            <Settings className="h-3.5 w-3.5 mr-1.5 shrink-0 group-hover:rotate-90 transition-transform duration-300" />
                            <span className="truncate text-xs">Config</span>
                        </Button>
                    </div>

                    {/* 🎨 RESULTADO DEL ANÁLISIS */}
                    {result && !error && (
                        <Alert className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 transition-all duration-300 hover:shadow-md">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            <AlertTitle className="text-primary text-sm sm:text-base font-semibold">Análisis Finalizado</AlertTitle>
                            <AlertDescription className="space-y-2 mt-2 text-xs sm:text-sm">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="truncate">Incidencias:</span>
                                    <Badge 
                                        variant={result.incidentsFound > 0 ? "destructive" : "secondary"} 
                                        className="shrink-0 transition-all duration-200 hover:scale-105"
                                    >
                                        {result.incidentsFound}
                                    </Badge>
                                </div>
                                {result.provider && (
                                    <div className="flex justify-between items-center gap-2 text-xs opacity-70">
                                        <span className="truncate">Proveedor:</span>
                                        <span className="font-mono truncate">{result.provider}</span>
                                    </div>
                                )}
                                {result.model && (
                                    <div className="flex justify-between items-center gap-2 text-xs opacity-70">
                                        <span className="truncate">Modelo:</span>
                                        <span className="font-mono truncate">{result.model}</span>
                                    </div>
                                )}
                                {result.tokensUsed && (
                                    <div className="flex justify-between items-center gap-2 text-xs opacity-70">
                                        <span className="truncate">Tokens:</span>
                                        <span className="font-mono shrink-0">{result.tokensUsed.toLocaleString()}</span>
                                    </div>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* ❌ ERROR */}
                    {error && (
                        <Alert variant="destructive" className="transition-all duration-300 hover:shadow-md">
                            <FileWarning className="h-4 w-4 shrink-0" />
                            <AlertTitle className="text-sm sm:text-base font-semibold">Error</AlertTitle>
                            <AlertDescription className="text-xs sm:text-sm break-words">
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* ✨ ESTADO INICIAL */}
                    {!result && !error && !isLoading && (
                        <div className="text-center text-muted-foreground p-6 border-2 border-dashed rounded-lg bg-gradient-to-br from-muted/20 to-muted/5 transition-all duration-300 hover:border-primary/30 hover:bg-muted/30">
                            <div className="inline-flex p-3 bg-purple-500/10 rounded-full mb-3">
                                <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 animate-pulse" />
                            </div>
                            <p className="font-semibold text-sm sm:text-base">Listo para analizar</p>
                            <p className="text-xs sm:text-sm mt-1 opacity-70">
                                Detecta incidencias automáticamente con IA
                            </p>
                        </div>
                    )}

                    {/* ⏳ LOADING */}
                    {isLoading && (
                        <div className="flex items-center justify-center p-8">
                            <div className="flex flex-col items-center gap-3">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                                    <Loader2 className="relative h-8 w-8 sm:h-10 sm:w-10 animate-spin text-primary" />
                                </div>
                                <div className="text-center">
                                    <span className="text-sm sm:text-base font-medium text-foreground block">Analizando con IA...</span>
                                    <span className="text-xs text-muted-foreground">Esto puede tomar unos segundos</span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
                
                <CardFooter>
                    <Button 
                        onClick={handleAnalyze} 
                        disabled={isLoading} 
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:scale-100 disabled:opacity-50 group"
                        size="sm"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                                <span className="truncate">Analizando...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4 shrink-0 group-hover:rotate-12 transition-transform duration-200" />
                                <span className="truncate">Analizar con IA</span>
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>

            {/* Diálogo de Configuración */}
            <AIConfigDialog 
                isOpen={isConfigOpen} 
                onClose={() => setIsConfigOpen(false)} 
            />

            {/* Modal de Métricas */}
            <AIMetricsModal 
                open={isMetricsOpen} 
                onOpenChange={setIsMetricsOpen}
                onNavigateToIncidents={handleNavigateToIncidents}
            />
        </>
    );
}