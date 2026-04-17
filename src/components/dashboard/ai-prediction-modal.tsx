'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Check, Edit2, X, Info } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface AIPredictionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    onEdit: () => void;
    isSaving: boolean;
    prediction: {
        description: string;
        account: string;
        justification: string;
        code?: string;
    };
}

export function AIPredictionModal({
    isOpen,
    onClose,
    onConfirm,
    onEdit,
    isSaving,
    prediction
}: AIPredictionModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[450px] border-none shadow-2xl overflow-hidden p-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-primary to-emerald-400" />

                <div className="p-6 pt-8">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="bg-primary/10 p-2 rounded-xl border border-primary/20">
                                <Brain className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                    Revisar Clasificación IA
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Valida la sugerencia del experto contable digital
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="mt-6 space-y-6">
                        {/* Product Section */}
                        <div className="bg-muted/30 rounded-xl p-4 border border-muted/50">
                            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                                <Info className="w-3 h-3" /> Producto / Servicio
                            </h4>
                            <p className="text-sm font-semibold text-foreground">
                                {prediction.description}
                            </p>
                            {prediction.code && (
                                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                                    Código: {prediction.code}
                                </p>
                            )}
                        </div>

                        {/* Reasoning Section */}
                        <div className="relative">
                            <div className="absolute -left-1 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-200 to-amber-400 rounded-full" />
                            <div className="pl-5">
                                <h4 className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> Razonamiento del Agente
                                </h4>
                                <p className="text-xs text-foreground leading-relaxed italic">
                                    "{prediction.justification}"
                                </p>
                            </div>
                        </div>

                        {/* Proposed Account Section */}
                        <div className="bg-primary/5 rounded-2xl p-6 border-2 border-primary/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Brain className="w-24 h-24" />
                            </div>
                            <div className="flex flex-col items-center justify-center relative z-10">
                                <h4 className="text-[11px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                                    Cuenta Sugerida
                                </h4>
                                <span className="text-5xl font-black text-primary tracking-tighter tabular-nums drop-shadow-sm">
                                    {prediction.account}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-muted/30 p-4 border-t border-muted/50 gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Ignorar
                    </Button>
                    <div className="flex gap-2 w-full sm:w-auto ml-auto">
                        <Button
                            variant="outline"
                            onClick={onEdit}
                            className="gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                        >
                            <Edit2 className="w-4 h-4" />
                            Modificar
                        </Button>
                        <Button
                            onClick={onConfirm}
                            disabled={isSaving}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
                        >
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            Confirmar y Guardar
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
