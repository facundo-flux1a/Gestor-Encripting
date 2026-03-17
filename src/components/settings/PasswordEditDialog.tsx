'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { updateUserPassword } from '@/services/user-service';
import { logout } from '@/services/auth-service';
import { AlertCircle, Loader2, Eye, EyeOff, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PasswordEditDialogProps {
    isGoogleAccount?: boolean;
    minimal?: boolean;
}

export function PasswordEditDialog({ isGoogleAccount, minimal }: PasswordEditDialogProps) {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 8) {
            toast({
                title: 'Contraseña muy corta',
                description: 'La contraseña debe tener al menos 8 caracteres.',
                variant: 'destructive',
            });
            return;
        }

        if (password !== confirmPassword) {
            toast({
                title: 'Las contraseñas no coinciden',
                description: 'Por favor verifica que ambas contraseñas sean iguales.',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);

        try {
            const result = await updateUserPassword(password, currentPassword);
            if (result.success) {
                toast({
                    title: 'Contraseña actualizada',
                    description: 'Tu contraseña ha sido cambiada exitosamente.',
                });
                setPassword('');
                setConfirmPassword('');
                setCurrentPassword('');
                setOpen(false);

                // Redirigir al logout después de un breve delay para que se vea el toast
                setTimeout(async () => {
                    await logout();
                }, 2000);
            } else {
                toast({
                    title: 'Error',
                    description: result.message || 'No se pudo actualizar la contraseña.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Hubo un problema al actualizar la contraseña.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    if (isGoogleAccount) {
        const googleAlert = (
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Tu cuenta está vinculada a Google. La contraseña debe gestionarse directamente desde tu cuenta de Google.
                </AlertDescription>
            </Alert>
        );

        if (minimal) return googleAlert;

        return (
            <Card>
                <CardHeader>
                    <CardTitle>Seguridad</CardTitle>
                    <CardDescription>
                        Gestiona la seguridad de tu cuenta.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {googleAlert}
                </CardContent>
            </Card>
        );
    }

    const dialogContent = (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className={minimal ? "w-full sm:w-auto" : ""}>
                    <Lock className="mr-2 h-4 w-4" />
                    Cambiar Contraseña
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Cambiar Contraseña</DialogTitle>
                    <DialogDescription>
                        Ingresa tu contraseña actual y la nueva a continuación.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <Label htmlFor="current-password">Contraseña Actual</Label>
                        <div className="relative">
                            <Input
                                id="current-password"
                                type={showCurrentPassword ? 'text' : 'password'}
                                placeholder="Ingresa tu contraseña actual"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Nueva Contraseña</Label>
                        <div className="relative">
                            <Input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Mínimo 8 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                        <div className="relative">
                            <Input
                                id="confirm-password"
                                type={showConfirmPassword ? 'text' : 'password'}
                                placeholder="Repite tu contraseña"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            Tu contraseña debe tener al menos 8 caracteres.
                        </AlertDescription>
                    </Alert>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Actualizando...
                            </>
                        ) : (
                            'Actualizar Contraseña'
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );

    if (minimal) return dialogContent;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Seguridad</CardTitle>
                <CardDescription>
                    Gestiona la seguridad de tu cuenta.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {dialogContent}
            </CardContent>
        </Card>
    );
}
