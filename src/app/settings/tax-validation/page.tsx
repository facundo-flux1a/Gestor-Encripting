
'use server';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { TaxRulesTable } from "@/components/tax-validation/tax-rules-table";
import { Button } from "@/components/ui/button";
import { PlusCircle, ShieldCheck } from "lucide-react";
import { CreateTaxRuleDialog } from "@/components/tax-validation/create-tax-rule-dialog";
import { getTaxValidationRules } from "@/services/tax-validation-service";

export default async function TaxValidationPage() {
    // Fetch data directly on the server. No client-side state or effects.
    const rules = await getTaxValidationRules();

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
                         {/* The dialog will handle its own state and actions via Server Actions */}
                         <CreateTaxRuleDialog />
                     </div>
                </MainLayoutHeader>
                
                <div className="mt-6">
                    <TaxRulesTable rules={rules} />
                </div>
            </div>
        </MainLayout>
    );
}
