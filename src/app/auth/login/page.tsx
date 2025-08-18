'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/services/auth-service";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from "@/components/ui/separator";
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px" {...props}>
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.223,0-9.655-3.356-11.303-8H6.306C9.656,39.663,16.318,44,24,44z"/>
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.99,34.552,44,29.865,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
    </svg>
  );
}


export default function LoginPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    
    const handleGoogleLogin = async () => {
        setIsGoogleLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            if (user) {
                const formData = new FormData();
                formData.append('email', user.email!);
                formData.append('displayName', user.displayName || 'Anonymous');
                formData.append('isGoogle', 'true');
                await login(formData);
            }
        } catch (error: any) {
             console.error('Google login failed', error);
        } finally {
            setIsGoogleLoading(false);
        }
    }

    const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        await login(formData);
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
                    <div className="space-y-4">
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
                        
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                O continúa con
                                </span>
                            </div>
                        </div>

                        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isGoogleLoading}>
                           {isGoogleLoading ? <Loader2 className="animate-spin mr-2"/> : <GoogleIcon className="mr-2"/>}
                           Google
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
