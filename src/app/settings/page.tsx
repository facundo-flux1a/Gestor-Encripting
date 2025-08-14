
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
                            <CardTitle>Perfil</CardTitle>
                            <CardDescription>
                                Actualiza la información de tu cuenta.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <form className="space-y-4 max-w-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Nombre de Usuario</Label>
                                    <Input id="username" defaultValue="Admin User" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" defaultValue="admin@example.com" disabled />
                                </div>
                                <Button type="submit">Guardar Cambios</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Seguridad</CardTitle>
                            <CardDescription>
                                Gestiona tu contraseña.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-4 max-w-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="current-password">Contraseña Actual</Label>
                                    <Input id="current-password" type="password" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">Nueva Contraseña</Label>
                                    <Input id="new-password" type="password" />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                                    <Input id="confirm-password" type="password" />
                                </div>
                                <Button type="submit">Cambiar Contraseña</Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    )
}
