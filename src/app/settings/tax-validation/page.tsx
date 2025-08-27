

'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getTaxValidationRules, createTaxValidationRule, updateTaxRuleVigente, deleteTaxRule } from "@/services/tax-validation-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, PlusCircle } from "lucide-react";
import { CreateTaxRuleDialog } from "@/components/tax-validation/create-tax-rule-dialog";
import { TaxRulesTable } from "@/components/tax-validation/tax-rules-table";
import { useState, useEffect, useCallback } from "react";
import type { TaxValidationRule } from "@/lib/types";

export default function TaxValidationPage() {
    const [rules, setRules] = useState<TaxValidationRule[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchRules = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedRules = await getTaxValidationRules();
            setRules(fetchedRules);
        } catch (error) {
            console.error("Failed to fetch rules", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const onRuleCreated = useCallback(async () => {
        await fetchRules();
    }, [fetchRules]);

    const onRuleUpdated = useCallback(async (id: number, vigente: boolean) => {
        await updateTaxRuleVigente(id, vigente);
        await fetchRules();
    }, [fetchRules]);

    const onRuleDeleted = useCallback(async (id: number) => {
        await deleteTaxRule(id);
        await fetchRules();
    }, [fetchRules]);

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                           <ShieldCheck className="h-8 w-8" />
                           Validación de Impuestos
                        </h2>
                        <p className="text-muted-foreground">
                            Gestiona las reglas para la validación de impuestos en los documentos.
                        </p>
                    </div>
                     <Button onClick={() => setIsCreateOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Nueva Regla
                    </Button>
                </MainLayoutHeader>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Reglas de Validación Existentes</CardTitle>
                        <CardDescription>Activa, desactiva o elimina las reglas de validación.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <p>Cargando reglas...</p>
                        ) : (
                           <TaxRulesTable 
                                rules={rules}
                                onRuleUpdated={onRuleUpdated}
                                onRuleDeleted={onRuleDeleted}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
            <CreateTaxRuleDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onRuleCreated={onRuleCreated}
            />
        </MainLayout>
    );
}

