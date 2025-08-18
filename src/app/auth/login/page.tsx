
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/services/auth-service";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';

function Logo() {
    return (
        <div className="flex items-center gap-2.5">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                className="h-8 w-8 text-primary flex-shrink-0"
                fill="currentColor"
            >
                <path d="M156,128a28,28,0,1,1-28-28A28.03,28.03,0,0,1,156,128ZM48,128a80,80,0,1,0,80-80A80.09,80.09,0,0,0,48,128Zm160,0A80.11,80.11,0,0,1,154.2,205.82,12,12,0,0,1,136,204.13V151.3a52,52,0,1,0-52-52H31.87A12,12,0,0,1,14.2,81.8a80.11,80.11,0,0,1,193.6,0,12,12,0,0,1-17.67,17.46H160A36,36,0,1,1,124,160h44.13a12,12,0,0,1,11.66,8.2A80.11,80.11,0,0,1,208,128Zm-80,44a44,44,0,1,0-44-44A44.05,44.05,0,0,0,128,172Z"/>
            </svg>
            <h1 className="text-2xl font-bold text-primary">FluxiDocs</h1>
        </div>
    )
}

export default function LoginPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const [isLoading, setIsLoading] = useState(false);
    
    const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        await login(formData);
        // If login is successful, the service redirects. If not, it redirects back with an error.
        // We set loading to false here in case the redirect doesn't happen due to an unhandled client-side error.
        setIsLoading(false);
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
            <Card className="mx-auto max-w-sm w-full">
                <CardHeader className="space-y-4">
                    <div className="flex justify-center">
                        <Logo />
                    </div>
                    <CardTitle className="text-2xl text-center">Iniciar Sesión</CardTitle>
                    <CardDescription className="text-center">
                        Introduce tus credenciales para acceder a tu dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="m@example.com"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input 
                                id="password" 
                                name="password" 
                                type="password" 
                                required 
                            />
                        </div>

                         {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error de Autenticación</AlertTitle>
                                <AlertDescription>
                                    Las credenciales proporcionadas son incorrectas.
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="animate-spin mr-2"/>}
                            Iniciar Sesión
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
