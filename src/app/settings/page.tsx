
'use server';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth-service";
import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/services/user-service";

export default async function SettingsPage() {
    const user = await getCurrentUser();

    const handleLogout = async () => {
        'use server';
        await logout();
    };

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                     <h2 className="text-3xl font-bold tracking-tight">Ajustes Generales</h2>
                </MainLayoutHeader>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Perfil de Usuario</CardTitle>
                            <CardDescription>
                                Esta es la información de tu cuenta.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-4 max-w-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="companyName">Nombre</Label>
                                    <Input id="companyName" defaultValue={user?.nombre || ''} disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email de Contacto</Label>
                                    <Input id="email" type="email" defaultValue={user?.email || ''} disabled />
                                </div>
                                <Button type="submit" disabled>Guardar Cambios</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Seguridad</CardTitle>
                            <CardDescription>
                                Gestiona tu sesión actual.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form action={handleLogout}>
                                <Button variant="destructive" type="submit">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Cerrar Sesión
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    )
}
