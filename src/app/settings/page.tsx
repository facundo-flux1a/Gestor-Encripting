'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth-service";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { type User } from "@/lib/types";
import { getCurrentUser } from "@/services/user-service";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);
            } catch (error) {
                console.error("Failed to fetch user:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUser();
    }, []);

    const handleLogout = async () => {
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
                             <form className="space-y-4 max-w-lg">
                                {isLoading ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="companyName">Nombre</Label>
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email de Contacto</Label>
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="companyName">Nombre</Label>
                                            <Input id="companyName" defaultValue={user?.nombre || ''} disabled />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email de Contacto</Label>
                                            <Input id="email" type="email" defaultValue={user?.email || ''} disabled />
                                        </div>
                                    </>
                                )}
                                <Button type="submit" disabled>Guardar Cambios</Button>
                            </form>
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
                            <Button variant="destructive" onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Cerrar Sesión
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    )
}
