'use server';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth-service";
import { GOOGLE_PASSWORD_MARKER } from "@/lib/constants";
import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/services/user-service";
import { UserProfileForm } from "@/components/settings/UserProfileForm";
import { PasswordEditDialog } from "@/components/settings/PasswordEditDialog";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { redirect } from "next/navigation";

async function handleLogout() {
    'use server';
    await logout();
};

export default async function SettingsPage() {
    const user = await getCurrentUser();

    if (!user) {
        return redirect('/auth/login');
    }

    // Verificar si es cuenta de Google
    const [rows] = await db.query<RowDataPacket[]>(
        'SELECT password FROM usuarios WHERE id = ?',
        [user.id]
    );
    const isGoogleAccount = rows[0]?.password?.startsWith(GOOGLE_PASSWORD_MARKER);

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <h2 className="text-3xl font-bold tracking-tight">Ajustes Generales</h2>
                </MainLayoutHeader>

                <div className="grid gap-6">
                    {/* Perfil de Usuario */}
                    <UserProfileForm
                        initialName={user.nombre}
                        initialEmail={user.email}
                    />

                    {/* Configuración de Alertas */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuración de Alertas</CardTitle>
                            <CardDescription>
                                Personaliza el comportamiento de las alertas de Actividad e Incidencias
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                                Controla cómo se filtran las alertas según las empresas seleccionadas
                            </p>
                            <Button asChild>
                                <a href="/dashboard/configuracion">
                                    Configurar Alertas
                                </a>
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Seguridad / Password */}
                    <PasswordEditDialog isGoogleAccount={isGoogleAccount} />

                    {/* Sesión */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Sesión</CardTitle>
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
