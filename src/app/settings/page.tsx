

'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                     <h2 className="text-3xl font-bold tracking-tight">Ajustes</h2>
                </MainLayoutHeader>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Perfil de Empresa</CardTitle>
                            <CardDescription>
                                Actualiza la información de tu empresa.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <form className="space-y-4 max-w-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="companyName">Nombre de la Empresa</Label>
                                    <Input id="companyName" defaultValue="Mi Empresa S.L." />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email de Contacto</Label>
                                    <Input id="email" type="email" defaultValue="contacto@miempresa.com" />
                                </div>
                                <Button type="submit">Guardar Cambios</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Notificaciones</CardTitle>
                            <CardDescription>
                                Gestiona tus preferencias de notificación.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-4 max-w-lg">
                               <p>Configuración de notificaciones no disponible.</p>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    )
}
