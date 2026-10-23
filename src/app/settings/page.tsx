export const dynamic = 'force-dynamic';

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Settings as SettingsIcon } from "lucide-react";
import { getCurrentUser } from "@/services/user-service";
import db from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { redirect } from "next/navigation";
import { getCompanies } from "@/services/document-service";
import { getUsersByIds } from "@/services/user-service";
import { Company } from "@/lib/types";
import { getInvitationsByEmpresa } from "@/services/invitation-service";
import { SettingsTabsView } from "@/components/settings/SettingsTabsView";
import { GOOGLE_PASSWORD_MARKER } from "@/lib/constants";

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
            <PageHeader title="Ajustes Generales" icon={SettingsIcon} />
            <div className="flex-1 space-y-6 p-4 pt-4 md:p-8 max-w-5xl mx-auto w-full">
                <SettingsTabsView
                    user={user}
                    isGoogleAccount={Boolean(isGoogleAccount)}
                    userCompanies={userCompanies}
                    companiesWithMembers={companiesWithMembers}
                />
            </div>
        </MainLayout>
    );
}
