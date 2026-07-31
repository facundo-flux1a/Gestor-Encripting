'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Info, ArrowRight, LogOut, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface InviteDetails {
    email: string;
    empresaNombre: string;
    senderName?: string;
    rol: string;
    userExists: boolean;
}

interface SessionInfo {
    loggedIn: boolean;
    user?: {
        email: string;
        nombre: string;
    };
}

function AcceptInvitationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [invitation, setInvitation] = useState<InviteDetails | null>(null);
    const [session, setSession] = useState<SessionInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [accepted, setAccepted] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('Token de invitación no encontrado.');
            setLoading(false);
            return;
        }

        const loadData = async () => {
            try {
                // Paralelizar fetch de invitación y sesión
                const [inviteRes, sessionRes] = await Promise.all([
                    fetch(`/api/auth/invitation-details?token=${token}`),
                    fetch('/api/auth/me')
                ]);

                if (!inviteRes.ok) {
                    throw new Error('La invitación no es válida o ha expirado.');
                }

                const inviteData = await inviteRes.json();
                const sessionData = await sessionRes.json();

                setInvitation(inviteData);
                setSession(sessionData);
            } catch (err: any) {
                setError(err.message || 'Error al cargar la invitación.');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [token]);

    const handleAccept = async () => {
        setProcessing(true);
        try {
            const response = await fetch('/api/auth/accept-invitation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setAccepted(true);
                toast({
                    title: "¡Bienvenido!",
                    description: "Invitación aceptada con éxito.",
                });
                setTimeout(() => {
                    router.push('/dashboard');
                }, 2000);
            } else {
                throw new Error(data.error || 'No se pudo aceptar la invitación.');
            }
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: err.message,
            });
            setProcessing(false);
        }
    };

    const handleSwitchAccount = async () => {
        setProcessing(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push(`/auth/login?token=${token}&email=${encodeURIComponent(invitation?.email || '')}`);
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo cerrar la sesión.",
            });
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted/30">
                <div className="text-center space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground animate-pulse">Cargando detalles de tu invitación...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-md shadow-xl border-red-100">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mb-2">
                            <XCircle className="h-10 w-10 text-red-500" />
                        </div>
                        <CardTitle className="text-2xl text-red-700">Error</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground">
                        <p>{error}</p>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
                            Volver al inicio
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (accepted) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-md shadow-2xl border-green-100 overflow-hidden">
                    <div className="h-2 bg-green-500" />
                    <CardHeader className="text-center pt-8">
                        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <CardTitle className="text-2xl font-bold text-green-700">¡Todo Listo!</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4 pb-8">
                        <p className="text-muted-foreground">
                            Has aceptado la invitación para unirte a <span className="font-bold text-foreground">{invitation?.empresaNombre}</span>.
                        </p>
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-green-500" />
                        <p className="text-xs text-muted-foreground">Entrando al Dashboard...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // LÓGICA DE ACTIONS SEGÚN ESTADO DE SESIÓN
    const isMismatch = session?.loggedIn && session.user?.email.toLowerCase() !== invitation?.email.toLowerCase();
    const isCorrectUser = session?.loggedIn && session.user?.email.toLowerCase() === invitation?.email.toLowerCase();

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 font-sans">
            <Card className="w-full max-w-lg shadow-2xl border-primary/5 overflow-hidden">
                <div className="bg-primary/5 p-6 border-b text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-primary/60 mb-2">Invitación de Equipo</h2>
                        <h1 className="text-3xl font-bold text-foreground truncate px-4">{invitation?.empresaNombre}</h1>
                        <Badge variant="secondary" className="mt-4 px-3 py-1 bg-primary/10 text-primary shadow-sm border-primary/20 hover:bg-primary/20">
                            Rol: {invitation?.rol}
                        </Badge>
                    </div>
                    {/* Decoración */}
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                    <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                </div>

                <CardContent className="p-8 space-y-6">
                    <div className="text-center">
                        <p className="text-lg text-muted-foreground">
                            {invitation?.senderName ? (
                                <>
                                    <span className="font-bold text-foreground">{invitation.senderName}</span> te ha invitado a colaborar.
                                </>
                            ) : (
                                "Has recibido una invitación para unirte como colaborador."
                            )}
                        </p>
                    </div>

                    <div className="bg-muted p-4 rounded-xl border border-primary/5 space-y-3">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Info className="h-3 w-3" /> Estado de la Cuenta
                        </h3>

                        {!session?.loggedIn ? (
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                    <UserPlus className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">No has iniciado sesión</p>
                                    <p className="text-xs text-muted-foreground">La invitación es para: <span className="font-semibold">{invitation?.email}</span></p>
                                </div>
                            </div>
                        ) : isMismatch ? (
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                                    <XCircle className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-orange-700">Conflicto de Cuentas</p>
                                    <p className="text-xs text-muted-foreground truncate">Logueado como: {session.user?.email}</p>
                                    <p className="text-[10px] text-orange-600/70 font-medium">Esta invitación es para otra persona.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Cuenta Correcta</p>
                                    <p className="text-xs text-muted-foreground">Aceptarás como: <span className="font-semibold">{session.user?.nombre}</span></p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-3 pt-4">
                        {isCorrectUser ? (
                            <Button
                                className="w-full h-12 text-lg shadow-lg"
                                onClick={handleAccept}
                                disabled={processing}
                            >
                                {processing ? <Loader2 className="animate-spin h-5 w-5" /> : "Aceptar y Continuar"}
                            </Button>
                        ) : isMismatch ? (
                            <>
                                <Button
                                    variant="outline"
                                    className="w-full h-12 text-orange-600 border-orange-200 hover:bg-orange-50 bg-white"
                                    onClick={handleSwitchAccount}
                                    disabled={processing}
                                >
                                    {processing ? <Loader2 className="animate-spin h-4 w-4" /> : <><LogOut className="mr-2 h-4 w-4" /> Cambiar de Cuenta</>}
                                </Button>
                                <p className="text-[11px] text-center text-muted-foreground italic px-8">
                                    Se cerrará la sesión actual para que puedas entrar con el email invitado ({invitation?.email}).
                                </p>
                            </>
                        ) : (
                            <>
                                {invitation?.userExists ? (
                                    <Button
                                        className="w-full h-12 text-lg shadow-lg group"
                                        onClick={() => router.push(`/auth/login?token=${token}&email=${encodeURIComponent(invitation?.email || '')}`)}
                                    >
                                        Iniciar Sesión <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                ) : (
                                    <Button
                                        className="w-full h-12 text-lg shadow-lg group"
                                        onClick={() => router.push(`/auth/register?token=${token}&email=${encodeURIComponent(invitation?.email || '')}`)}
                                    >
                                        Crear mi Cuenta <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="bg-muted/20 border-t flex flex-col p-4 gap-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Seguridad Gestor Documental</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                        Este enlace caduca en 7 días. Si no esperabas esta invitación o crees que es un error, simplemente ignora este mensaje.
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function AcceptInvitationPage() {
    return (
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <AcceptInvitationContent />
        </Suspense>
    );
}
