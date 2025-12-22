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
import { AlertCircle, Chrome, Loader2 } from 'lucide-react';
import React, { Suspense, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { LogoutDetector } from '@/components/auth/LogoutDetector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// 🔥 WEBHOOK HARDCODEADO
const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/reset-password';

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
            router.push('/dashboard');
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
            case 'user_inactive':
                return 'Tu cuenta está inactiva. Por favor, contacta al administrador para reactivarla.';
            case 'google_account':
                return 'Esta cuenta fue creada con Google. Por favor, usa el botón "Continuar con Google" para iniciar sesión.';
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

// 🆕 POPUP DE RESET PASSWORD
function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Función para generar token único
  const generateToken = () => {
    const timestamp = Date.now().toString(36);
    const random1 = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    const random3 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random1}-${random2}-${random3}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast({
        title: 'Email inválido',
        description: 'Por favor ingresa un email válido.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Generar token y URL
      const token = generateToken();
      const resetUrl = `${window.location.origin}/auth/reset-password?token=${token}`;
      
      // Calcular expiración (30 minutos)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // 🔥 ENVIAR TODO A N8N (token incluido)
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          token: token,
          resetUrl: resetUrl,
          expiresAt: expiresAt,
          timestamp: new Date().toISOString(),
          source: 'forgot-password-form',
        }),
      });

      if (response.ok) {
        toast({
          title: '¡Email enviado!',
          description: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
        });
        setEmail('');
        setOpen(false);
      } else {
        throw new Error('Error al enviar la solicitud');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Hubo un problema al enviar la solicitud. Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button 
          type="button"
          className="text-sm font-medium text-primary hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Ingresa el correo electrónico asignado a la cuenta y te enviaremos instrucciones para restablecer tu contraseña.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Correo Electrónico</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar instrucciones'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
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
                    <ForgotPasswordDialog />
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
      <Suspense fallback={null}>
        <LogoutDetector />
      </Suspense>

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