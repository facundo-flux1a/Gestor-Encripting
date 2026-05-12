'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Lightbulb, 
    X, 
    Paperclip, 
    Send, 
    Loader2, 
    CheckCircle2, 
    Image as ImageIcon,
    FileText,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';
import { uploadSuggestionMedia, submitSuggestion } from '@/services/suggestion-service';
import { cn } from '@/lib/utils';

export function SuggestionBox() {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const { toast } = useToast();

    // 🔥 Gestionar URLs de previsualización para evitar fugas de memoria
    React.useEffect(() => {
        const newPreviews = files.map(file => 
            file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
        );
        setPreviews(newPreviews);

        // Limpieza: revocar URLs anteriores
        return () => {
            newPreviews.forEach(url => {
                if (url) URL.revokeObjectURL(url);
            });
        };
    }, [files]);

    const onDrop = (acceptedFiles: File[]) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 5,
        maxSize: 10 * 1024 * 1024, // 10MB
    });

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!message.trim()) {
            toast({
                title: "Campo requerido",
                description: "Por favor, escribe un mensaje.",
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Subir archivos a MinIO
            const mediaUrls: string[] = [];
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                const result = await uploadSuggestionMedia(formData);
                if (result.success && result.url) {
                    mediaUrls.push(result.url);
                } else {
                    console.error('Error subiendo archivo:', result.error);
                }
            }

            // 2. Guardar sugerencia en DB
            const result = await submitSuggestion(message, mediaUrls);
            
            if (result.success) {
                setIsSuccess(true);
                setMessage('');
                setFiles([]);
                setTimeout(() => {
                    setIsSuccess(false);
                    setIsOpen(false);
                }, 2000);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: "No se pudo enviar la sugerencia. Intenta nuevamente.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[60]">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="mb-4 w-[350px] sm:w-[400px]"
                    >
                        <Card className="border-violet-200 dark:border-violet-800 shadow-2xl bg-background/95 backdrop-blur-md overflow-hidden">
                            <CardHeader className="bg-violet-600 text-white p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Lightbulb className="h-5 w-5" />
                                        <CardTitle className="text-lg">Buzón de Sugerencias</CardTitle>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => setIsOpen(false)}
                                        className="h-8 w-8 text-white hover:bg-white/20"
                                    >
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {isSuccess ? (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center justify-center py-8 text-center"
                                    >
                                        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">¡Gracias!</h3>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Tu sugerencia ha sido enviada con éxito.
                                        </p>
                                    </motion.div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">
                                                ¿En qué podemos mejorar?
                                            </label>
                                            <Textarea
                                                placeholder="Escribe aquí tus ideas, fallos detectados o mejoras..."
                                                className="min-h-[120px] resize-none focus-visible:ring-violet-500"
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">
                                                Adjuntar multimedia (opcional)
                                            </label>
                                            <div 
                                                {...getRootProps()} 
                                                className={cn(
                                                    "border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer text-center",
                                                    isDragActive ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20" : "border-muted hover:border-violet-400 hover:bg-muted/50"
                                                )}
                                            >
                                                <input {...getInputProps()} />
                                                <Paperclip className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                                                <p className="text-xs text-muted-foreground">
                                                    Sube capturas de pantalla o documentos aclaratorios
                                                </p>
                                            </div>

                                            {files.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {files.map((file, idx) => {
                                                        const isImage = file.type.startsWith('image/');
                                                        const previewUrl = previews[idx];
                                                        
                                                        return (
                                                            <div key={idx} className="group relative h-16 w-16 rounded border bg-muted overflow-hidden shadow-sm">
                                                                {isImage && previewUrl ? (
                                                                    <img 
                                                                        src={previewUrl} 
                                                                        alt="preview" 
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="h-full w-full flex items-center justify-center bg-blue-50 dark:bg-blue-950/30">
                                                                        <FileText className="h-6 w-6 text-blue-500" />
                                                                    </div>
                                                                )}
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        removeFile(idx);
                                                                    }}
                                                                    className="absolute inset-0 bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <Button 
                                            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-6 shadow-lg shadow-violet-200 dark:shadow-none"
                                            onClick={handleSubmit}
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                    Enviando...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="mr-2 h-5 w-5" />
                                                    Enviar Sugerencia
                                                </>
                                            )}
                                        </Button>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300",
                    isOpen 
                        ? "bg-white text-violet-600 border-2 border-violet-600" 
                        : "bg-violet-600 text-white"
                )}
            >
                {isOpen ? <X className="h-7 w-7" /> : <Lightbulb className="h-7 w-7" />}
            </motion.button>
        </div>
    );
}
