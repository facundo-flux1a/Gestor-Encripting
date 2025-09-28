
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Bot, Loader2, FileWarning, Search, BarChart } from 'lucide-react';
import { analyzeSingleDocument } from '@/ai/flows/analyze-single-document';
import type { IncidentAnalysisResult } from '@/lib/types';

interface AnalyzeDocumentCardProps {
    documentId: number;
    onAnalysisComplete: () => void;
}

export function AnalyzeDocumentCard({ documentId, onAnalysisComplete }: AnalyzeDocumentCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<IncidentAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleAnalyze = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const analysisResult = await analyzeSingleDocument({ documentId });
            setResult(analysisResult);
            toast({
                title: "Análisis Completado",
                description: analysisResult.message,
            });
            if (analysisResult.newIncidentsFound > 0) {
                onAnalysisComplete();
            }
        } catch (e: any) {
            console.error("Analysis failed", e);
            const errorMessage = e.message || 'Ocurrió un error al analizar el documento.';
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
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bot className="h-6 w-6 text-primary" />
                    Análisis Inteligente
                </CardTitle>
                <CardDescription>
                    Utiliza IA para escanear este documento en busca de inconsistencias y duplicados.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                {result && !error && (
                    <Alert className="bg-primary/5 border-primary/20">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-primary">Análisis Finalizado</AlertTitle>
                        <AlertDescription className="space-y-2 mt-2">
                           <div className="flex justify-between items-center">
                               <span>Nuevas Incidencias:</span>
                               <Badge variant={result.newIncidentsFound > 0 ? "destructive" : "secondary"}>
                                    {result.newIncidentsFound}
                               </Badge>
                           </div>
                            <div className="flex justify-between items-center">
                               <span>Posibles Duplicados:</span>
                               <Badge variant="outline">{result.duplicates}</Badge>
                           </div>
                           <div className="flex justify-between items-center">
                               <span>Errores de Cálculo:</span>
                               <Badge variant="outline">{result.calculationErrors}</Badge>
                           </div>
                        </AlertDescription>
                    </Alert>
                )}
                 {error && (
                    <Alert variant="destructive">
                        <FileWarning className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            {error}
                        </AlertDescription>
                    </Alert>
                )}
                {!result && !error && !isLoading && (
                    <div className="text-center text-muted-foreground p-4">
                        <p>Haz clic en el botón para iniciar el análisis del documento.</p>
                    </div>
                )}
                 {isLoading && (
                    <div className="flex items-center justify-center p-8">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Analizando...</span>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleAnalyze} disabled={isLoading} className="w-full">
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <span>Analizando Documento...</span>
                        </>
                    ) : (
                       <>
                            <Search className="mr-2 h-4 w-4" />
                            <span>Analizar Documento</span>
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
}
