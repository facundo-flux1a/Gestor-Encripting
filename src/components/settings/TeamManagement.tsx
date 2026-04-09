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

import { Invitation, User } from '@/lib/types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

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

export function TeamManagement({
    companies,
    currentUser
}: {
    companies: CompanyWithMembers[],
    currentUser: User
}) {
    const { toast } = useToast();
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [isRevoking, setIsRevoking] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState<number | null>(null);
    const [isResending, setIsResending] = useState<number | null>(null);
    const [isRemovingMember, setIsRemovingMember] = useState<number | null>(null);
    const [isUpdatingRole, setIsUpdatingRole] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ companyId: number, member: Member } | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
        companies.length > 0 ? companies[0].id : null
    );

    // Ya no usamos un isAdmin global, sino que lo calculamos por empresa en el loop

    const handleUpdateRole = async (userId: number, newRole: string, companyId: number) => {
        setIsUpdatingRole(userId);
        try {
            const response = await fetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rol: newRole, companyId: companyId }),
            });

            if (response.ok) {
                toast({
                    title: "Rol actualizado",
                    description: "El rol del usuario ha sido modificado exitosamente.",
                });
                window.location.reload();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Error al actualizar rol");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            });
        } finally {
            setIsUpdatingRole(null);
        }
    };

    const handleRemoveMember = async () => {
        if (!removeMemberConfirm) return;

        const { companyId, member } = removeMemberConfirm;
        setIsRemovingMember(member.id);
        setRemoveMemberConfirm(null);

        try {
            const response = await fetch(`/api/companies/${companyId}/members/${member.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Miembro eliminado",
                    description: `${member.nombre} ha sido removido de la empresa.`,
                });
                window.location.reload();
            } else {
                const data = await response.json();
                throw new Error(data.error || "Error al eliminar miembro");
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message,
            });
        } finally {
            setIsRemovingMember(null);
        }
    };

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
                setIsInviteOpen(false);
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

                    {(() => {
                        const adminCompanies = companies.filter(c => c.members.find(m => m.id === currentUser.id)?.organization_rol === 'ADMIN');
                        const selectedCompany = adminCompanies.find(c => c.id === selectedCompanyId) || adminCompanies[0];

                        return adminCompanies.length > 0 && (
                            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-none">
                                        <UserPlus className="h-4 w-4" />
                                        <span>Invitar Colaborador</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Invitar al Equipo</DialogTitle>
                                        <DialogDescription>
                                            Enviá una invitación por email para que un colaborador se una a una de tus empresas.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="company">Empresa</Label>
                                            <div className="relative">
                                                <select
                                                    id="company"
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={selectedCompanyId || ''}
                                                    onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                                                >
                                                    {adminCompanies.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Correo Electrónico</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="email"
                                                    placeholder="ejemplo@correo.com"
                                                    className="pl-10"
                                                    value={inviteEmail}
                                                    onChange={(e) => setInviteEmail(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="role">Rol asignado</Label>
                                            <div className="relative">
                                                <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <select
                                                    id="role"
                                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={inviteRole}
                                                    onChange={(e) => setInviteRole(e.target.value as any)}
                                                >
                                                    <option value="ADMIN">ADMIN (Control Total)</option>
                                                    <option value="EDITOR">EDITOR (Subir y Editar)</option>
                                                    <option value="VIEWER">VIEWER (Solo Ver)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleInvite} disabled={isInviting || !inviteEmail || !selectedCompanyId}>
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
                        );
                    })()}
                </CardHeader>

                <CardContent>
                    <div className="space-y-12">
                        {companies.map((company) => (
                            <div key={company.id} className="space-y-6">
                                <div className="flex items-center gap-2 border-b pb-2">
                                    <Building2 className="h-5 w-5 text-muted-foreground" />
                                    <h3 className="text-lg font-bold">{company.name}</h3>
                                </div>

                                {(() => {
                                    const isUserAdminOfCompany = company.members.find(m => m.id === currentUser.id)?.organization_rol === 'ADMIN';

                                    return (
                                        <>
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
                                                                        {isUserAdminOfCompany && member.id !== currentUser.id ? (
                                                                            <Select
                                                                                disabled={isUpdatingRole === member.id}
                                                                                value={member.organization_rol || 'EDITOR'}
                                                                                onValueChange={(val) => handleUpdateRole(member.id, val, company.id)}
                                                                            >
                                                                                <SelectTrigger className="h-8 w-[120px] text-[10px] uppercase tracking-wider font-semibold border-primary/20">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="ADMIN" className="text-[10px]">ADMIN</SelectItem>
                                                                                    <SelectItem value="EDITOR" className="text-[10px]">EDITOR</SelectItem>
                                                                                    <SelectItem value="VIEWER" className="text-[10px]">VIEWER</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                        ) : (
                                                                            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary uppercase text-[10px] tracking-wider">
                                                                                {member.organization_rol || 'EDITOR'}
                                                                            </Badge>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {isUserAdminOfCompany && member.id !== currentUser.id ? (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="text-red-500 hover:text-red-600 hover:bg-neutral-100 h-8 px-2"
                                                                                disabled={isRemovingMember === member.id}
                                                                                onClick={() => setRemoveMemberConfirm({ companyId: company.id, member })}
                                                                            >
                                                                                {isRemovingMember === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
                                                                            </Button>
                                                                        ) : (
                                                                            <span className="text-[10px] text-muted-foreground uppercase italic opacity-50 px-2">Lectura</span>
                                                                        )}
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
                                                                                    {isUserAdminOfCompany && inv.status === 'PENDING' && (
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
                                                                                    {isUserAdminOfCompany && (
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
                                                                                    )}
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
                                        </>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Modal de confirmación de eliminación de invitación */}
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

            {/* Modal de confirmación de remoción de MIEMBRO */}
            <Dialog open={removeMemberConfirm !== null} onOpenChange={(open) => { if (!open) setRemoveMemberConfirm(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                <Ban className="h-5 w-5 text-red-600" />
                            </div>
                            <DialogTitle className="text-lg">Remover Miembro</DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-muted-foreground">
                            ¿Estás seguro que querés remover a <strong>{removeMemberConfirm?.member.nombre}</strong> de esta empresa? Perderá el acceso instantáneamente.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setRemoveMemberConfirm(null)}
                            disabled={isRemovingMember !== null}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={isRemovingMember !== null}
                            onClick={handleRemoveMember}
                        >
                            {isRemovingMember !== null ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removiendo...</> : 'Sí, remover acceso'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
