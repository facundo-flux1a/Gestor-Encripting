
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { TaxRulesTable } from "@/components/tax-validation/tax-rules-table";
import { Button } from "@/components/ui/button";
import { PlusCircle, ShieldCheck, Loader2 } from "lucide-react";
import { CreateTaxRuleDialog } from "@/components/tax-validation/create-tax-rule-dialog";
import { useState, useEffect, useCallback } from "react";
import type { TaxValidationRule } from "@/lib/types";
import { getTaxValidationRules, createTaxValidationRule, updateTaxRuleVigente, deleteTaxRule } from "@/services/tax-validation-service";
import { useToast } from "@/hooks/use-toast";
import type { CreateTaxValidationRulePayload } from "@/lib/types";


export default function TaxValidationPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [rules, setRules] = useState<TaxValidationRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    
    const fetchRules = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedRules = await getTaxValidationRules();
            setRules(fetchedRules);
        } catch (error) {
            toast({ title: "Error", description: "No se pudieron cargar las reglas de validación.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const onRuleCreated = useCallback(async (payload: CreateTaxValidationRulePayload) => {
        try {
            await createTaxValidationRule(payload);
            toast({ title: "Éxito", description: "Nueva regla de validación creada." });
            fetchRules();
            return true;
        } catch (error) {
            toast({ title: "Error", description: "No se pudo crear la regla.", variant: "destructive" });
            return false;
        }
    }, [fetchRules, toast]);
    
    const onRuleUpdated = useCallback(async (id: number, vigente: boolean) => {
        try {
            await updateTaxRuleVigente(id, vigente);
            setRules(prev => prev.map(r => r.id === id ? {...r, vigente} : r));
            toast({ title: "Regla Actualizada", description: `La regla ha sido ${vigente ? 'activada' : 'desactivada'}.` });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo actualizar el estado de la regla.", variant: "destructive" });
            fetchRules(); // Re-fetch to sync state
        }
    }, [fetchRules, toast]);

    const onRuleDeleted = useCallback(async (id: number) => {
        try {
            await deleteTaxRule(id);
            toast({ title: "Regla Eliminada", description: "La regla de validación ha sido eliminada." });
            setRules(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            toast({ title: "Error", description: "No se pudo eliminar la regla.", variant: "destructive" });
        }
    }, [toast]);


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
                     <div className="flex items-center space-x-2">
                         <Button onClick={() => setIsCreateOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Crear Nueva Regla
                        </Button>
                     </div>
                </MainLayoutHeader>
                
                <div className="mt-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <TaxRulesTable 
                            rules={rules} 
                            onRuleUpdated={onRuleUpdated}
                            onRuleDeleted={onRuleDeleted}
                        />
                    )}
                </div>
            </div>
            
            <CreateTaxRuleDialog 
                isOpen={isCreateOpen}
                setIsOpen={setIsCreateOpen}
                onRuleCreated={onRuleCreated}
            />
        </MainLayout>
    );
}
