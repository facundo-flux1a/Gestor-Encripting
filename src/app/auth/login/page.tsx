
'use client';

import { useFormStatus } from 'react-dom';
import { login, handleGoogleSignInOnServer } from '@/services/auth-service';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Chrome } from 'lucide-react';
import React, { Suspense } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';


function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" type="submit" disabled={pending}>
      {pending ? 'Iniciando sesión...' : 'Iniciar Sesión'}
    </Button>
  );
}

function GoogleLoginButton() {
  const { toast } = useToast();
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const firebaseUser = result.user;
        
        const serverResponse = await handleGoogleSignInOnServer({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
        });

        if (serverResponse.success) {
            router.push('/documento/94');
        } else {
            throw new Error(serverResponse.error || 'El inicio de sesión con Google falló en el servidor.');
        }
    } catch (error: any) {
        let errorMessage = 'No se pudo iniciar sesión con Google.';
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'El proceso de inicio de sesión fue cancelado.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        toast({
            title: 'Error de Autenticación',
            description: errorMessage,
            variant: 'destructive',
        });
    }
  };


  return (
    <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn}>
      <Chrome className="mr-2 h-4 w-4" />
      Continuar con Google
    </Button>
  );
}

function LoginError() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    const getErrorMessage = (errorCode: string | null) => {
        switch (errorCode) {
            case 'invalid_credentials':
                return 'El correo electrónico o la contraseña son incorrectos.';
            case 'server_error':
                return 'Ha ocurrido un error en el servidor. Por favor, inténtalo de nuevo más tarde.';
            default:
                return null;
        }
    };
    const errorMessage = getErrorMessage(error);

    if (!errorMessage) return null;

    return (
        <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error de Autenticación</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
    )
}

function LoginForm() {
    return (
        <form action={login} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" name="email" type="email" placeholder="tu@email.com" required />
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                    <Link href="#" className="text-sm font-medium text-primary hover:underline" prefetch={false}>
                        ¿Olvidaste tu contraseña?
                    </Link>
                </div>
                <Input id="password" name="password" type="password" required />
            </div>
            <LoginButton />
        </form>
    )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
          <CardDescription>Ingresa tu correo electrónico y contraseña para acceder a tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginError />
          </Suspense>
          <LoginForm />
          <div className="my-4 flex items-center">
            <div className="flex-grow border-t border-muted" />
            <span className="mx-4 flex-shrink text-xs uppercase text-muted-foreground">O</span>
            <div className="flex-grow border-t border-muted" />
          </div>
          <GoogleLoginButton />
          <div className="mt-4 text-center text-sm">
            ¿No tienes una cuenta?{' '}
            <Link href="/auth/register" className="underline">
              Regístrate
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
