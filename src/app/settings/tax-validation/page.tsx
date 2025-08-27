'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { getTaxValidationRules, type TaxValidationRule } from "@/services/tax-validation-service";
import { TaxRulesTable } from "@/components/tax-validation/tax-rules-table";
import { CreateTaxRuleDialog } from "@/components/tax-validation/create-tax-rule-dialog";
import { useToast } from "@/hooks/use-toast";

export default function TaxValidationPage() {
    const [rules, setRules] = useState<TaxValidationRule[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const { toast } = useToast();

    const fetchRules = useCallback(async () => {
        try {
            const fetchedRules = await getTaxValidationRules();
            setRules(fetchedRules);
        } catch (error) {
            console.error("Failed to fetch tax rules", error);
            toast({
                title: "Error",
                description: "No se pudieron cargar las reglas de validación.",
                variant: "destructive"
            });
        }
    }, [toast]);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const onRuleCreated = useCallback(() => {
        fetchRules();
        toast({
            title: "Regla Creada",
            description: "La nueva regla de validación de impuestos ha sido creada con éxito."
        });
    }, [fetchRules, toast]);

    const onRuleUpdated = useCallback(() => {
        fetchRules();
        toast({
            title: "Regla Actualizada",
            description: "La regla ha sido actualizada."
        });
    }, [fetchRules, toast]);

    const onRuleDeleted = useCallback(() => {
        fetchRules();
        toast({
            title: "Regla Eliminada",
            description: "La regla ha sido eliminada con éxito."
        });
    }, [fetchRules, toast]);


    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                        <h2 className="text-3xl font-bold tracking-tight">Validación de Impuestos</h2>
                         <p className="text-muted-foreground">
                            Crea y gestiona reglas para invalidar documentos con tipos de impuestos incorrectos en períodos específicos.
                        </p>
                    </div>
                     <Button onClick={() => setIsCreateOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Nueva Regla
                    </Button>
                </MainLayoutHeader>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reglas de Validación de Impuestos</CardTitle>
                            <CardDescription>
                                Aquí puedes ver y gestionar todas las reglas de validación. Las reglas vigentes se usarán para marcar documentos con incidencias.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <TaxRulesTable 
                                rules={rules}
                                onRuleUpdated={onRuleUpdated}
                                onRuleDeleted={onRuleDeleted}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
             <CreateTaxRuleDialog
                isOpen={isCreateOpen}
                setIsOpen={setIsCreateOpen}
                onRuleCreated={onRuleCreated}
            />
        </MainLayout>
    )
}
