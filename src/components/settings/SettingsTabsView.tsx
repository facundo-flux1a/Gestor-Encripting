'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserProfileForm } from '@/components/settings/UserProfileForm';
import { PasswordEditDialog } from '@/components/settings/PasswordEditDialog';
import { TwoFactorSettingsSection } from '@/components/settings/TwoFactorSettingsSection';
import { TeamManagement } from '@/components/settings/TeamManagement';
import { DelsolConfigSection } from '@/components/settings/DelsolConfigSection';
import { ApiKeysSection } from '@/components/settings/ApiKeysSection';
import { NotificationPrefsSection } from '@/components/settings/NotificationPrefsSection';
import { FilteringPreferences } from '@/components/settings/filtering-preferences';
import { TutorialReplaySection } from '@/components/settings/TutorialReplaySection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Users, Layers, Bell, GraduationCap, LogOut } from 'lucide-react';
import { logout } from '@/services/auth-service';
import type { Company, User as UserType } from '@/lib/types';

interface SettingsTabsViewProps {
  user: UserType;
  isGoogleAccount: boolean;
  userCompanies: Company[];
  companiesWithMembers: any[];
}

export function SettingsTabsView({
  user,
  isGoogleAccount,
  userCompanies,
  companiesWithMembers,
}: SettingsTabsViewProps) {
  const [activeTab, setActiveTab] = React.useState('cuenta');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
      {/* Selector de Pestañas Unificado */}
      <TabsList className="grid grid-cols-2 sm:grid-cols-5 h-auto p-1 bg-muted/50 border border-border/80 rounded-xl gap-1">
        <TabsTrigger
          value="cuenta"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <User className="h-4 w-4 text-primary shrink-0" />
          <span>Mi Cuenta</span>
        </TabsTrigger>

        <TabsTrigger
          value="equipo"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <Users className="h-4 w-4 text-primary shrink-0" />
          <span>Equipo</span>
        </TabsTrigger>

        <TabsTrigger
          value="integraciones"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <Layers className="h-4 w-4 text-primary shrink-0" />
          <span>Integraciones</span>
        </TabsTrigger>

        <TabsTrigger
          value="notificaciones"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <Bell className="h-4 w-4 text-primary shrink-0" />
          <span>Notificaciones</span>
        </TabsTrigger>

        <TabsTrigger
          value="tutoriales"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          <span>Tutoriales</span>
        </TabsTrigger>
      </TabsList>

      {/* ─── PESTAÑA 1: MI CUENTA & SEGURIDAD ─── */}
      <TabsContent value="cuenta" className="space-y-6 animate-in fade-in duration-200">
        <UserProfileForm
          initialName={user.nombre}
          initialEmail={user.email}
        />

        <PasswordEditDialog isGoogleAccount={isGoogleAccount} />

        <TwoFactorSettingsSection />

        {/* Zona de Peligro / Sesión */}
        <Card className="border-destructive/20 bg-destructive/[0.02]">
          <CardHeader>
            <CardTitle className="text-lg font-headline font-semibold text-destructive flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Sesión Activa
            </CardTitle>
            <CardDescription className="text-xs">
              Cierra tu sesión en este dispositivo de forma segura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={logout}>
              <Button
                variant="destructive"
                size="sm"
                type="submit"
                className="gap-2 shadow-sm text-xs"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar Sesión
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ─── PESTAÑA 2: EQUIPO ─── */}
      <TabsContent value="equipo" className="space-y-6 animate-in fade-in duration-200">
        <TeamManagement companies={companiesWithMembers} currentUser={user} />
      </TabsContent>

      {/* ─── PESTAÑA 3: INTEGRACIONES ─── */}
      <TabsContent value="integraciones" className="space-y-6 animate-in fade-in duration-200">
        <DelsolConfigSection
          companies={userCompanies.map((c) => ({ id: c.id, name: c.name }))}
        />

        <ApiKeysSection
          companies={userCompanies.map((c) => ({ id: c.id, name: c.name }))}
        />
      </TabsContent>

      {/* ─── PESTAÑA 4: NOTIFICACIONES & ALERTAS ─── */}
      <TabsContent value="notificaciones" className="space-y-6 animate-in fade-in duration-200">
        <NotificationPrefsSection />
        <FilteringPreferences />
      </TabsContent>

      {/* ─── PESTAÑA 5: TUTORIALES ─── */}
      <TabsContent value="tutoriales" className="space-y-6 animate-in fade-in duration-200">
        <TutorialReplaySection />
      </TabsContent>
    </Tabs>
  );
}
