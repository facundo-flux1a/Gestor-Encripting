'use client';

import { useState } from 'react';
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
            });

            if (analysisResult.incidentsFound > 0) {
                onAnalysisComplete();
            }

            // Recargar después de 2 segundos para mostrar las nuevas incidencias
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

    return (
        <>
            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-6 w-6 text-primary" />
                        Análisis Inteligente con IA
                    </CardTitle>
                    <CardDescription>
                        Utiliza OpenAI/Gemini para detectar inconsistencias, errores de cálculo y duplicados automáticamente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-4">
                    {/* Botones de Configuración y Métricas */}
                    <div className="flex justify-end gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsMetricsOpen(true)}
                            disabled={isLoading}
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Ver Métricas
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsConfigOpen(true)}
                            disabled={isLoading}
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Configurar IA
                        </Button>
                    </div>

                    {/* Resultado del Análisis */}
                    {result && !error && (
                        <Alert className="bg-primary/5 border-primary/20">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-primary">Análisis Finalizado</AlertTitle>
                            <AlertDescription className="space-y-2 mt-2">
                                <div className="flex justify-between items-center">
                                    <span>Incidencias Encontradas:</span>
                                    <Badge variant={result.incidentsFound > 0 ? "destructive" : "secondary"}>
                                        {result.incidentsFound}
                                    </Badge>
                                </div>
                                {result.provider && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span>Proveedor:</span>
                                        <span className="font-mono">{result.provider}</span>
                                    </div>
                                )}
                                {result.model && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span>Modelo:</span>
                                        <span className="font-mono">{result.model}</span>
                                    </div>
                                )}
                                {result.tokensUsed && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span>Tokens Usados:</span>
                                        <span className="font-mono">{result.tokensUsed.toLocaleString()}</span>
                                    </div>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Error */}
                    {error && (
                        <Alert variant="destructive">
                            <FileWarning className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Estado Inicial */}
                    {!result && !error && !isLoading && (
                        <div className="text-center text-muted-foreground p-4 border rounded-lg bg-muted/20">
                            <Sparkles className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                            <p className="font-medium">Listo para analizar</p>
                            <p className="text-sm mt-1">
                                Haz clic en el botón para detectar incidencias automáticamente
                            </p>
                        </div>
                    )}

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center p-8">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground">Analizando con IA...</span>
                                <span className="text-xs text-muted-foreground">Esto puede tomar unos segundos</span>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button 
                        onClick={handleAnalyze} 
                        disabled={isLoading} 
                        className="w-full"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>Analizando Documento...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                <span>Analizar con IA</span>
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
            />
        </>
    );
}