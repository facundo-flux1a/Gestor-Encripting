'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Database, Loader2, FileWarning, Search } from 'lucide-react';
import { analyzeDocumentsForIncidents } from '@/ai/flows/analyze-incidents';
import type { IncidentAnalysisResult } from '@/lib/types';

interface AnalyzeDocumentsCardProps {
    onAnalysisComplete: () => Promise<void>;
}

export function AnalyzeDocumentsCard({ onAnalysisComplete }: AnalyzeDocumentsCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<IncidentAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleAnalyze = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const analysisResult = await analyzeDocumentsForIncidents();
            setResult(analysisResult);
            toast({
                title: "Análisis Completado",
                description: analysisResult.message,
            });
            await onAnalysisComplete();
        } catch (e: any) {
            console.error("Analysis failed", e);
            const errorMessage = e.message || 'Ocurrió un error al analizar los documentos.';
            setError(errorMessage);
            toast({
                title: "Error en el Análisis",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                    <span className="line-clamp-2">Análisis Automático</span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                    Revisa todos los documentos comparando datos para detectar duplicados, errores de cálculo y datos incompletos.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                {result && !error && (
                    <Alert className="bg-primary/5 border-primary/20">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <AlertTitle className="text-primary text-sm sm:text-base">Análisis Finalizado</AlertTitle>
                        <AlertDescription className="space-y-2 mt-2 text-xs sm:text-sm">
                           <div className="flex justify-between items-center gap-2">
                               <span className="truncate">Nuevas Incidencias:</span>
                               <Badge variant={result.newIncidentsFound > 0 ? "destructive" : "secondary"} className="shrink-0">
                                    {result.newIncidentsFound}
                               </Badge>
                           </div>
                            <div className="flex justify-between items-center gap-2">
                               <span className="truncate">Documentos Duplicados:</span>
                               <Badge variant="outline" className="shrink-0">{result.duplicates}</Badge>
                           </div>
                           <div className="flex justify-between items-center gap-2">
                               <span className="truncate">Errores de Cálculo:</span>
                               <Badge variant="outline" className="shrink-0">{result.calculationErrors}</Badge>
                           </div>
                        </AlertDescription>
                    </Alert>
                )}
                 {error && (
                    <Alert variant="destructive">
                        <FileWarning className="h-4 w-4 shrink-0" />
                        <AlertTitle className="text-sm sm:text-base">Error</AlertTitle>
                        <AlertDescription className="text-xs sm:text-sm break-words">
                            {error}
                        </AlertDescription>
                    </Alert>
                )}
                {!result && !error && !isLoading && (
                    <div className="text-center text-muted-foreground p-4">
                        <p className="text-xs sm:text-sm">Haz clic en el botón para iniciar la revisión.</p>
                    </div>
                )}
                 {isLoading && (
                    <div className="flex items-center justify-center p-6 sm:p-8">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                            <span className="text-xs sm:text-sm text-muted-foreground">Analizando...</span>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button 
                    onClick={handleAnalyze} 
                    disabled={isLoading} 
                    className="w-full"
                    size="sm"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                            <span className="truncate">Analizando Documentos...</span>
                        </>
                    ) : (
                       <>
                            <Search className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">Analizar Documentos</span>
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
}