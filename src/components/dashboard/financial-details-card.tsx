'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Percent, FileText } from "lucide-react";
import { type Document, type DocumentUpdatePayload } from "@/lib/types";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useFieldArray } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { 
        style: 'currency', 
        currency 
    }).format(numericAmount);
};

interface FinancialDetailsCardProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

export function FinancialDetailsCard({ doc, isEditing, form }: FinancialDetailsCardProps) {
    const { fields: ivaFields } = useFieldArray({ 
        control: form.control, 
        name: "iva_details" 
    });

    const renderEditableField = (fieldName: string, label: string) => {
        return (
            <FormField
                control={form.control}
                name={fieldName as keyof DocumentUpdatePayload}
                render={({ field }) => (
                    <FormItem className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 xs:gap-2">
                        <FormLabel className="text-xs sm:text-sm font-medium">
                            {label}
                        </FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    value={field.value ?? 0}
                                    className="h-8 sm:h-9 text-xs sm:text-sm w-full xs:w-28 sm:w-32 text-right tabular-nums"
                                />
                            ) : (
                                <p className="text-xs sm:text-sm font-medium text-right tabular-nums">
                                    {formatCurrency(field.value ?? doc[fieldName as keyof Document], doc.moneda)}
                                </p>
                            )}
                        </FormControl>
                        <FormMessage className="text-xs xs:col-span-2" />
                    </FormItem>
                )}
            />
        );
    };

    return (
        <Card>
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Euro className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" /> 
                    <span className="truncate">Detalles Financieros</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 text-xs sm:text-sm px-3 sm:px-6 pb-3 sm:pb-6">
                {renderEditableField("base_imponible", "Base Imponible")}
                
                <Separator />
                
                <div className="space-y-2 sm:space-y-3">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
                        <Percent className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" /> 
                        Desglose de Impuestos
                    </p>
                    
                    {isEditing ? (
                        <div className="space-y-2">
                            {ivaFields.map((field, index) => (
                                <div 
                                    key={field.id} 
                                    className="grid grid-cols-3 gap-1.5 sm:gap-2 text-muted-foreground text-xs"
                                >
                                    <FormField 
                                        control={form.control} 
                                        name={`iva_details.${index}.tipo_impuesto`} 
                                        render={({field}) => (
                                            <Input 
                                                {...field} 
                                                value={field.value ?? ''} 
                                                className="h-7 sm:h-8 text-xs" 
                                                placeholder="Tipo"
                                            />
                                        )} 
                                    />
                                    <FormField 
                                        control={form.control} 
                                        name={`iva_details.${index}.porcentaje`} 
                                        render={({field}) => (
                                            <Input 
                                                type="number" 
                                                {...field} 
                                                value={field.value ?? 0} 
                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                className="h-7 sm:h-8 text-xs text-right tabular-nums" 
                                                placeholder="%"
                                            />
                                        )} 
                                    />
                                    <FormField 
                                        control={form.control} 
                                        name={`iva_details.${index}.cuota`} 
                                        render={({field}) => (
                                            <Input 
                                                type="number" 
                                                step="0.01" 
                                                {...field} 
                                                value={field.value ?? 0} 
                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                className="h-7 sm:h-8 text-xs text-right tabular-nums" 
                                                placeholder="Cuota"
                                            />
                                        )} 
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1.5 sm:space-y-2">
                            {doc.iva_details.map((iva, index) => (
                                <div 
                                    key={index} 
                                    className="flex items-center justify-between text-muted-foreground text-xs sm:text-sm"
                                >
                                    <span className="break-words">
                                        {iva.tipo_impuesto} ({iva.porcentaje}%)
                                    </span>
                                    <span className="font-mono tabular-nums shrink-0 ml-2">
                                        {formatCurrency(iva.cuota, doc.moneda)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <Separator />
                
                <div className="text-sm sm:text-base font-bold">
                    {renderEditableField("total", "Total Documento")}
                </div>
            </CardContent>
        </Card>
    );
}