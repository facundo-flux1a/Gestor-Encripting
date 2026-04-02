'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Users, Mail, UserPlus, Shield, Loader2, Building2, Trash2, RotateCcw, Ban } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { Invitation } from '@/lib/types';

interface Member {
    id: number;
    nombre: string;
    email: string;
    organization_rol?: 'ADMIN' | 'EDITOR' | 'VIEWER';
}

interface CompanyWithMembers {
    id: number;
    name: string;
    members: Member[];
    invitations: Invitation[];
}

export function TeamManagement({ companies }: { companies: CompanyWithMembers[] }) {
    const { toast } = useToast();
    const [isInviting, setIsInviting] = useState(false);
    const [isRevoking, setIsRevoking] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);
    const [isResending, setIsResending] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
        companies.length > 0 ? companies[0].id : null
    );

    const handleInvite = async () => {
        if (!inviteEmail || !selectedCompanyId) return;

        setIsInviting(true);
        try {
            const response = await fetch(`/api/companies/${selectedCompanyId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail, rol: inviteRole }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: "Invitación enviada",
                    description: `Se ha enviado un enlace mágico a ${inviteEmail} como ${inviteRole}`,
                });
                setInviteEmail('');
                // Opcional: Recargar la página o actualizar estado local
                window.location.reload();
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: data.error || "No se pudo enviar la invitación",
                });
            }
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Ocurrió un error inesperado al enviar la invitación",
            });
        } finally {
            setIsInviting(false);
        }
    };

    const handleRevoke = async (invitationId: number) => {
        setIsRevoking(invitationId);
        try {
            const response = await fetch(`/api/auth/revoke-invitation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invitationId }),
            });

            if (response.ok) {
                toast({
                    title: "Invitación revocada",
                    description: "La invitación ha sido cancelada con éxito.",
                });
                window.location.reload();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Error al revocar");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            });
        } finally {
            setIsRevoking(null);
        }
    };

    const handleDeleteInvitation = async (invitationId: number) => {
        setDeleteConfirmId(null);

        setIsDeleting(invitationId);
        try {
            const response = await fetch(`/api/auth/delete-invitation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invitationId }),
            });

            if (response.ok) {
                toast({
                    title: "Invitación eliminada",
                    description: "El registro ha sido borrado de la base de datos.",
                });
                window.location.reload();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Error al eliminar");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            });
        } finally {
            setIsDeleting(null);
        }
    };

    const handleResendInvitation = async (invitationId: number) => {
        setIsResending(invitationId);
        try {
            const response = await fetch(`/api/auth/resend-invitation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invitationId }),
            });

            if (response.ok) {
                toast({
                    title: "Invitación re-enviada",
                    description: "Se ha vuelto a enviar el correo de acceso.",
                });
            } else {
                const data = await response.json();
                throw new Error(data.error || "Error al re-enviar");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            });
        } finally {
            setIsResending(null);
        }
    };

    if (companies.length === 0) {
        return null;
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200">Pendiente</Badge>;
            case 'ACCEPTED': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Aceptada</Badge>;
            case 'REVOKED': return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-gray-200">Revocada</Badge>;
            case 'EXPIRED': return <Badge className="bg-red-100 text-red-600 hover:bg-red-100 border-red-200">Expirada</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <>
            <Card className="shadow-md border-primary/5">
                {/* Header y Dialog de Invitación permanecen igual */}
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Gestión de Equipo
                        </CardTitle>
                        <CardDescription>
                            Administra los usuarios que tienen acceso a tus empresas
                        </CardDescription>
                    </div>

                    <Dialog>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-2">
                                <UserPlus className="h-4 w-4" />
                                Invitar Usuario
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Invitar a un colaborador</DialogTitle>
                                <DialogDescription>
                                    Se enviará un correo con un enlace de acceso seguro.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Correo Electrónico</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="company">Empresa</Label>
                                        <select
                                            id="company"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={selectedCompanyId || ''}
                                            onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                                        >
                                            {companies.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="role">Rol</Label>
                                        <select
                                            id="role"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value as any)}
                                        >
                                            <option value="ADMIN">ADMIN</option>
                                            <option value="EDITOR">EDITOR</option>
                                            <option value="VIEWER">VIEWER</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleInvite} disabled={isInviting || !inviteEmail}>
                                    {isInviting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        'Enviar Invitación'
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardHeader>

                <CardContent>
                    <div className="space-y-12">
                        {companies.map((company) => (
                            <div key={company.id} className="space-y-6">
                                <div className="flex items-center gap-2 border-b pb-2">
                                    <Building2 className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="text-lg font-bold">{company.name}</h3>
                                </div>

                                {/* TABLA DE MIEMBROS ACTUALES */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                        Miembros Activos
                                        <Badge variant="secondary">{company.members.length}</Badge>
                                    </h4>
                                    <div className="rounded-md border border-primary/5 overflow-hidden shadow-sm">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead>Usuario</TableHead>
                                                    <TableHead>Email</TableHead>
                                                    <TableHead>Rol en Empresa</TableHead>
                                                    <TableHead className="text-right">Acciones</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {company.members.map((member) => (
                                                    <TableRow key={member.id}>
                                                        <TableCell className="font-medium underline decoration-primary/30 underline-offset-4">{member.nombre}</TableCell>
                                                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary uppercase text-[10px] tracking-wider">
                                                                {member.organization_rol || 'EDITOR'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-neutral-100" disabled title="Próximamente">
                                                                Eliminar
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                {/* TABLA DE HISTORIAL DE INVITACIONES */}
                                {company.invitations.length > 0 && (
                                    <div className="space-y-3 pt-2">
                                        <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                            Historial de Invitaciones
                                            <Badge variant="outline" className="text-[10px] font-normal">{company.invitations.length}</Badge>
                                        </h4>
                                        <div className="rounded-md border border-primary/5 overflow-hidden shadow-sm bg-muted/5">
                                            <Table>
                                                <TableHeader className="bg-muted/50">
                                                    <TableRow className="h-10 text-[11px] uppercase tracking-tighter">
                                                        <TableHead>Destinatario</TableHead>
                                                        <TableHead>Rol</TableHead>
                                                        <TableHead>Enviada por</TableHead>
                                                        <TableHead>Estado</TableHead>
                                                        <TableHead className="text-right">Acción</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {company.invitations.map((inv) => {
                                                        const meta = inv.metadata as any;
                                                        return (
                                                            <TableRow key={inv.id} className="group h-12">
                                                                <TableCell className="font-medium text-xs">{inv.email}</TableCell>
                                                                <TableCell>
                                                                    <span className="text-[10px] font-semibold text-muted-foreground">{inv.rol}</span>
                                                                </TableCell>
                                                                <TableCell className="text-[10px] text-muted-foreground italic">
                                                                    {meta?.senderName || 'Sistema'}
                                                                    <br />
                                                                    <span className="text-[9px] opacity-70">{new Date(inv.fecha_creacion || '').toLocaleDateString()}</span>
                                                                </TableCell>
                                                                <TableCell>
                                                                    {getStatusBadge(inv.status)}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex justify-end gap-1">
                                                                        {inv.status === 'PENDING' && (
                                                                            <>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    title="Re-enviar email"
                                                                                    className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                                                                                    disabled={isResending === inv.id}
                                                                                    onClick={() => handleResendInvitation(inv.id!)}
                                                                                >
                                                                                    {isResending === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                                                                </Button>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    title="Revocar acceso"
                                                                                    className="h-8 w-8 p-0 text-orange-600 hover:bg-orange-50"
                                                                                    disabled={isRevoking === inv.id}
                                                                                    onClick={() => handleRevoke(inv.id!)}
                                                                                >
                                                                                    {isRevoking === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-4 w-4" />}
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            title="Eliminar registro"
                                                                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                                                                            disabled={isDeleting === inv.id}
                                                                            onClick={() => setDeleteConfirmId(inv.id!)}
                                                                        >
                                                                            {isDeleting === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Modal de confirmación de eliminación */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                <Trash2 className="h-5 w-5 text-red-600" />
                            </div>
                            <DialogTitle className="text-lg">Eliminar Invitación</DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-muted-foreground">
                            ¿Estás seguro que querés eliminar permanentemente este registro? Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={isDeleting !== null}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={isDeleting !== null}
                            onClick={() => deleteConfirmId && handleDeleteInvitation(deleteConfirmId)}
                        >
                            {isDeleting !== null ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando...</> : 'Sí, eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
