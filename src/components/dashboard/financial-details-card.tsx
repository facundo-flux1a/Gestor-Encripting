'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Percent, PlusCircle, Trash2, Plus } from "lucide-react";
import { type Document, type DocumentUpdatePayload } from "@/lib/types";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useFieldArray } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";

// 🎯 FUNCIONES DE FORMATO MANUAL
const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR'): string => {
    if (amount === null || amount === undefined) return 'N/A';

    let numericAmount: number;
    if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
    } else {
        numericAmount = amount;
    }

    if (isNaN(numericAmount)) return 'N/A';

    const fixed = numericAmount.toFixed(2);
    const parts = fixed.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${formattedInteger},${decimalPart} €`;
};

interface FinancialDetailsCardProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

export function FinancialDetailsCard({ doc, isEditing, form }: FinancialDetailsCardProps) {
    const { fields: ivaFields, append, remove } = useFieldArray({
        control: form.control,
        name: "iva_details"
    });

    return (
        <Card className="transition-all duration-300 hover:shadow-lg">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                    <Euro className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-green-600 dark:text-green-400 transition-transform duration-200 hover:rotate-12" />
                    <span className="truncate">Detalles Financieros</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 text-xs sm:text-sm px-3 sm:px-6 pb-3 sm:pb-6">
                {isEditing ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 px-1">
                        <FormField
                            control={form.control}
                            name="base_imponible"
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Base Imponible</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value) || 0;
                                            field.onChange(val);
                                            // Auto-sync base if only one tax line
                                            const taxes = form.getValues('iva_details');
                                            if (taxes && taxes.length === 1) {
                                                form.setValue('iva_details.0.base_imponible', val);
                                            }
                                        }}
                                        className="h-8 sm:h-9 text-xs sm:text-sm font-medium tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20 bg-background/50 border-muted-foreground/20"
                                    />
                                </div>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="descuento_global"
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5" title="Descuento aplicado al final">Descuento Global</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        value={field.value ?? 0}
                                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                        className="h-8 sm:h-9 text-xs sm:text-sm font-medium tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20 bg-background/50 border-muted-foreground/20 text-orange-600 dark:text-orange-400"
                                    />
                                </div>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="base_no_sujeta"
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5" title="Importes sin IVA (Tasas, suplidos)">Base no sujeta</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        value={field.value ?? 0}
                                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                        className="h-8 sm:h-9 text-xs sm:text-sm font-medium tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20 bg-background/50 border-muted-foreground/20 text-indigo-600 dark:text-indigo-400"
                                    />
                                </div>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="total"
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Total Documento</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        {...field}
                                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                        className="h-8 sm:h-9 text-xs sm:text-sm font-bold tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20 bg-primary/[0.03] border-primary/20 text-primary"
                                    />
                                </div>
                            )}
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Base Imponible</span>
                            <span className="font-medium">{formatCurrency(doc.base_imponible, doc.moneda)}</span>
                        </div>
                        {Number((doc as any).descuento_global) > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Descuento Global</span>
                                <span className="font-medium text-orange-600 dark:text-orange-400">-{formatCurrency((doc as any).descuento_global, doc.moneda)}</span>
                            </div>
                        )}
                        {Number((doc as any).base_no_sujeta) > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Base no sujeta / Suplidos</span>
                                <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatCurrency((doc as any).base_no_sujeta, doc.moneda)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-base sm:text-lg font-bold">
                            <span className="text-primary">Total Documento</span>
                            <span className="text-primary">{formatCurrency(doc.total, doc.moneda)}</span>
                        </div>
                    </div>
                )}

                <Separator />

                {/* DESGLOSE DE IMPUESTOS */}
                <div className="bg-background/40 rounded-xl border border-muted-foreground/10 p-3 sm:p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Percent className="h-3 w-3" />
                            Desglose de Impuestos
                        </span>
                        {isEditing && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => append({ tipo_impuesto: 'IVA', porcentaje: 21, base_imponible: 0, cuota: 0 })}
                                className="h-7 px-2 text-[10px] items-center gap-1 hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:scale-105"
                            >
                                <Plus className="w-3 h-3" />
                                Añadir
                            </Button>
                        )}
                    </div>

                    <div className="space-y-2">
                        {isEditing ? (
                            ivaFields.map((field, index) => (
                                <div
                                    key={field.id}
                                    className="flex items-center gap-1.5 sm:gap-2 group/tax-line text-xs"
                                >
                                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1">
                                        <FormField
                                            control={form.control}
                                            name={`iva_details.${index}.tipo_impuesto`}
                                            render={({ field }) => (
                                                <Input
                                                    {...field}
                                                    value={field.value ?? ''}
                                                    className="h-7 sm:h-8 text-xs transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Tipo"
                                                />
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`iva_details.${index}.base_imponible`}
                                            render={({ field }) => (
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...field}
                                                    value={field.value ?? 0}
                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                    className="h-7 sm:h-8 text-xs text-right tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Base"
                                                />
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`iva_details.${index}.porcentaje`}
                                            render={({ field }) => (
                                                <Input
                                                    type="number"
                                                    {...field}
                                                    value={field.value ?? 0}
                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                    className="h-7 sm:h-8 text-xs text-right tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                                                    placeholder="%"
                                                />
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`iva_details.${index}.cuota`}
                                            render={({ field }) => (
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...field}
                                                    value={field.value ?? 0}
                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                    className="h-7 sm:h-8 text-xs text-right tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                                                    placeholder="Cuota"
                                                />
                                            )}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => remove(index)}
                                        className="h-7 w-7 text-destructive hover:text-white hover:bg-red-500 transition-all duration-200"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))
                        ) : (
                            doc.iva_details.map((iva, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between text-muted-foreground text-xs sm:text-sm transition-all duration-200 hover:text-foreground group"
                                >
                                    <span className="break-words transition-colors duration-200 group-hover:text-primary">
                                        {iva.tipo_impuesto || 'IVA'} ({iva.porcentaje}%)
                                    </span>
                                    <span className="font-mono tabular-nums shrink-0 ml-2 transition-colors duration-200 group-hover:text-primary">
                                        {formatCurrency(iva.cuota, doc.moneda)}
                                    </span>
                                </div>
                            ))
                        )}
                        {isEditing && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({
                                    tipo_impuesto: 'Retención',
                                    porcentaje: 15,
                                    base_imponible: 0,
                                    cuota: 0
                                })}
                                className="w-full h-7 text-[10px] hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-200 flex items-center justify-center gap-1.5"
                            >
                                <PlusCircle className="h-3 w-3" />
                                Añadir Retención/Otro
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}