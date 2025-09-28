

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
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(numericAmount);
};

interface FinancialDetailsCardProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

export function FinancialDetailsCard({ doc, isEditing, form }: FinancialDetailsCardProps) {
    const { fields: ivaFields } = useFieldArray({ control: form.control, name: "iva_details" });

    const renderEditableField = (fieldName: string, label: string) => {
        return (
            <FormField
                control={form.control}
                name={fieldName as keyof DocumentUpdatePayload}
                render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm font-medium">{label}</FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    value={field.value ?? 0}
                                    className="h-8 text-sm w-32 text-right"
                                />
                            ) : (
                                <p className="text-sm font-medium text-right">
                                    {formatCurrency(field.value ?? doc[fieldName as keyof Document], doc.moneda)}
                                </p>
                            )}
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Euro className="h-5 w-5" /> Detalles Financieros
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                {renderEditableField("base_imponible", "Base Imponible")}
                
                <Separator />
                
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Percent className="h-4 w-4" /> Desglose de Impuestos
                    </p>
                    {isEditing ? (
                         ivaFields.map((field, index) => (
                             <div key={field.id} className="flex items-center justify-between text-muted-foreground text-xs">
                                <FormField control={form.control} name={`iva_details.${index}.tipo_impuesto`} render={({field}) => (
                                    <Input {...field} value={field.value ?? ''} className="h-7 w-16" />
                                )} />
                                 <FormField control={form.control} name={`iva_details.${index}.porcentaje`} render={({field}) => (
                                    <Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-7 w-16" placeholder="%" />
                                )} />
                                <FormField control={form.control} name={`iva_details.${index}.cuota`} render={({field}) => (
                                     <Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-7 w-24 text-right" />
                                )} />
                            </div>
                        ))
                    ) : (
                        doc.iva_details.map((iva, index) => (
                            <div key={index} className="flex items-center justify-between text-muted-foreground">
                                <span>{iva.tipo_impuesto} ({iva.porcentaje}%)</span>
                                <span className="font-mono">{formatCurrency(iva.cuota, doc.moneda)}</span>
                            </div>
                        ))
                    )}
                </div>

                <Separator />
                
                <div className="text-base font-bold">
                    {renderEditableField("total", "Total Documento")}
                </div>
            </CardContent>
        </Card>
    );
}

