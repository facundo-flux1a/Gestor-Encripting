'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateUserProfile } from '@/services/user-service';
import { Loader2 } from 'lucide-react';

interface UserProfileFormProps {
    initialName: string;
    initialEmail: string;
}

export function UserProfileForm({ initialName, initialEmail }: UserProfileFormProps) {
    const [name, setName] = useState(initialName);
    const [email, setEmail] = useState(initialEmail);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await updateUserProfile(name, email);
            if (result.success) {
                toast({
                    title: 'Perfil actualizado',
                    description: 'Tus cambios se han guardado correctamente.',
                });
            } else {
                toast({
                    title: 'Error',
                    description: result.message || 'No se pudo actualizar el perfil.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Hubo un problema al guardar los cambios.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const hasChanges = name !== initialName || email !== initialEmail;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Perfil de Usuario</CardTitle>
                <CardDescription>
                    Esta es la información de tu cuenta.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                    <div className="space-y-2">
                        <Label htmlFor="companyName">Nombre</Label>
                        <Input
                            id="companyName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Tu nombre"
                            required
                            disabled={loading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email de Contacto</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tu@email.com"
                            required
                            disabled={loading}
                        />
                    </div>
                    <Button type="submit" disabled={!hasChanges || loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar Cambios'
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
