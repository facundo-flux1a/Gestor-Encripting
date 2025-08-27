
'use server';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getTaxValidationRules, createTaxValidationRule, updateTaxRuleVigente, deleteTaxRule } from "@/services/tax-validation-service";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, PlusCircle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const formatDate = (dateString: string) => {
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return 'N/A';
    }
}

async function createRuleAction(formData: FormData) {
    'use server';
    const payload = {
        date_init: formData.get('date_init') as string,
        date_finish: formData.get('date_finish') as string,
        tipo_impuesto: formData.get('tipo_impuesto') as string,
        porcentaje: parseFloat(formData.get('porcentaje') as string || '0'),
    };
    // Simple validation
    if (!payload.date_init || !payload.date_finish || !payload.tipo_impuesto) {
        // Handle error appropriately in a real app
        console.error("Validation failed: missing fields");
        return;
    }
    await createTaxValidationRule(payload);
    revalidatePath('/settings/tax-validation');
}

async function toggleRuleAction(id: number, currentStatus: boolean) {
    'use server';
    await updateTaxRuleVigente(id, !currentStatus);
    revalidatePath('/settings/tax-validation');
}

async function deleteRuleAction(id: number) {
    'use server';
    await deleteTaxRule(id);
    revalidatePath('/settings/tax-validation');
}

export default async function TaxValidationPage() {
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
                </MainLayoutHeader>
                
                <div className="grid gap-8 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Reglas de Validación Existentes</CardTitle>
                                <CardDescription>Activa, desactiva o elimina las reglas de validación.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Activa</TableHead>
                                                <TableHead>Tipo Impuesto</TableHead>
                                                <TableHead>Porcentaje</TableHead>
                                                <TableHead>Fecha Inicio</TableHead>
                                                <TableHead>Fecha Fin</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {rules.length > 0 ? (
                                                rules.map((rule) => (
                                                    <TableRow key={rule.id}>
                                                        <TableCell>
                                                            <form action={toggleRuleAction.bind(null, rule.id, rule.vigente)}>
                                                                <button type="submit" className="flex items-center">
                                                                    <Switch checked={rule.vigente} />
                                                                </button>
                                                            </form>
                                                        </TableCell>
                                                        <TableCell>{rule.tipo_impuesto}</TableCell>
                                                        <TableCell>{rule.porcentaje}%</TableCell>
                                                        <TableCell>{formatDate(rule.date_init)}</TableCell>
                                                        <TableCell>{formatDate(rule.date_finish)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon">
                                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Esta acción es irreversible y eliminará la regla permanentemente.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <form action={deleteRuleAction.bind(null, rule.id)}>
                                                                            <AlertDialogAction type="submit" className="bg-destructive hover:bg-destructive/90">
                                                                                Eliminar
                                                                            </AlertDialogAction>
                                                                        </form>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                        No hay reglas de validación.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div>
                         <Card>
                            <CardHeader>
                                <CardTitle>Crear Nueva Regla</CardTitle>
                                <CardDescription>Define una nueva regla de validación.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form action={createRuleAction} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="tipo_impuesto">Tipo de Impuesto</Label>
                                        <Input id="tipo_impuesto" name="tipo_impuesto" defaultValue="IVA" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="porcentaje">Porcentaje</Label>
                                        <Input id="porcentaje" name="porcentaje" type="number" step="0.01" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date_init">Fecha de Inicio</Label>
                                        <Input id="date_init" name="date_init" type="date" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date_finish">Fecha de Fin</Label>
                                        <Input id="date_finish" name="date_finish" type="date" required />
                                    </div>
                                    <Button type="submit" className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Crear Regla
                                    </Button>
                                </form>
                            </CardContent>
                         </Card>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
