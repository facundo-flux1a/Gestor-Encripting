'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Percent, FileText, PlusCircle } from "lucide-react";
import { type Document, type DocumentUpdatePayload } from "@/lib/types";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useFieldArray } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";

// 🎯 FUNCIONES DE FORMATO MANUAL
const formatNumber = (num: number | string): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';

    const parts = value.toString().split('.');
    const integerPart = parts[0];
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return formattedInteger;
};

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
    const { fields: ivaFields, append } = useFieldArray({
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
                                    value={(field.value as any) ?? 0}
                                    className="h-8 sm:h-9 text-xs sm:text-sm w-full xs:w-28 sm:w-32 text-right tabular-nums transition-all duration-200 focus:ring-2 focus:ring-primary/20"
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
        <Card className="transition-all duration-300 hover:shadow-lg">
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                    <Euro className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-green-600 dark:text-green-400 transition-transform duration-200 hover:rotate-12" />
                    <span className="truncate">Detalles Financieros</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 text-xs sm:text-sm px-3 sm:px-6 pb-3 sm:pb-6">
                {renderEditableField("base_imponible", "Base Imponible")}

                <Separator />

                <div className="space-y-2 sm:space-y-3">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
                        <Percent className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 transition-transform duration-200 hover:rotate-12" />
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
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({
                                    id: 0, // ID temporal
                                    tipo_impuesto: 'Recargo',
                                    porcentaje: 0,
                                    base_imponible: 0,
                                    cuota: 0
                                })}
                                className="w-full h-7 text-xs hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-200"
                            >
                                <PlusCircle className="mr-1.5 h-3 w-3" />
                                Añadir Impuesto
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-1.5 sm:space-y-2">
                            {doc.iva_details.map((iva, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between text-muted-foreground text-xs sm:text-sm transition-all duration-200 hover:text-foreground group"
                                >
                                    <span className="break-words transition-colors duration-200 group-hover:text-primary">
                                        {iva.tipo_impuesto} ({iva.porcentaje}%)
                                    </span>
                                    <span className="font-mono tabular-nums shrink-0 ml-2 transition-colors duration-200 group-hover:text-primary">
                                        {formatCurrency(iva.cuota, doc.moneda)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <Separator />

                <div className="text-sm sm:text-base font-bold bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 p-2 sm:p-3 rounded-lg transition-all duration-300 hover:shadow-md">
                    {renderEditableField("total", "Total Documento")}
                </div>
            </CardContent>
        </Card>
    );
}