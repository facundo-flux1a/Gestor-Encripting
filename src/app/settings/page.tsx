export const dynamic = 'force-dynamic';

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
import { getCompanies } from "@/services/document-service";
import { getUsersByIds } from "@/services/user-service";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { Company, Invitation } from "@/lib/types";
import { getInvitationsByEmpresa } from "@/services/invitation-service";
import { TutorialReplaySection } from "@/components/settings/TutorialReplaySection";
import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { TwoFactorSettingsSection } from "@/components/settings/TwoFactorSettingsSection";
import { NotificationPrefsSection } from "@/components/settings/NotificationPrefsSection";
import { DelsolConfigSection } from "@/components/settings/DelsolConfigSection";


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

    // Obtener empresas y sus miembros
    const userCompanies = await getCompanies();

    // Resolver miembros e invitaciones para cada empresa
    const companiesWithMembers = await Promise.all(userCompanies.map(async (company: Company) => {
        let memberIds: number[] = [];
        try {
            const rawIds = (company as any).id_de_usuario;
            memberIds = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds || '[]');
        } catch (e) {
            memberIds = [];
        }

        const [members, invitations] = await Promise.all([
            getUsersByIds(memberIds, company.id),
            getInvitationsByEmpresa(company.id)
        ]);

        return {
            id: company.id,
            name: company.name,
            members: members as any[],
            invitations: invitations
        };
    }));

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <h2 className="text-3xl font-bold tracking-tight">Ajustes Generales</h2>
                </MainLayoutHeader>

                <div className="grid gap-6">
                    {/* Gestión de Equipo */}
                    <TeamManagement companies={companiesWithMembers} currentUser={user} />

                    {/* Integración Software DELSOL */}
                    <DelsolConfigSection
                        companies={userCompanies.map((c: Company) => ({ id: c.id, name: c.name }))}
                    />

                    {/* Perfil de Usuario */}
                    <UserProfileForm
                        initialName={user.nombre}
                        initialEmail={user.email}
                    />

                    {/* Autenticación en Dos Pasos */}
                    <TwoFactorSettingsSection />

                    {/* Preferencias de Notificaciones */}
                    <NotificationPrefsSection />


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

                    {/* Tutoriales / Replay */}
                    <TutorialReplaySection />

                    {/* Seguridad / Password */}
                    <PasswordEditDialog isGoogleAccount={isGoogleAccount} />

                    {/* Integración API */}
                    <ApiKeysSection
                        companies={userCompanies.map((c: Company) => ({ id: c.id, name: c.name }))}
                    />

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
