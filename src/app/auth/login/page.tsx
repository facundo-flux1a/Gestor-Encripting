'use client';

import { useFormStatus } from 'react-dom';
import { login } from '@/services/auth-service';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AuthBrandPanel, AuthBrandMobile } from '@/components/auth/auth-brand-panel';
import React, { Suspense, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getRecentEmails, rememberEmail, forgetEmails } from '@/lib/recent-emails';
import { LogoutDetector } from '@/components/auth/LogoutDetector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full h-11" type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Iniciando sesión...
        </>
      ) : (
        'Iniciar Sesión'
      )}
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
    <Alert variant="destructive" className="mb-5">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error de autenticación</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}

// POPUP DE RESET PASSWORD
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

      // 🚀 LLAMADA A NUESTRA API LOCAL (Migrado de n8n)
      const response = await fetch('/api/auth/forgot-password', {
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
        <button type="button" className="text-xs font-medium text-primary hover:underline">
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
              autoComplete="email"
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

function LoginFooter() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const registerUrl = token
    ? `/auth/register?token=${token}${email ? `&email=${encodeURIComponent(email)}` : ''}`
    : '/auth/register';

  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      ¿No tienes una cuenta?{' '}
      <Link href={registerUrl} className="font-medium text-primary hover:underline">
        Regístrate
      </Link>
    </p>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('token');
  const invitedEmail = searchParams.get('email');
  const emailLocked = !!inviteToken && !!invitedEmail;

  const [email, setEmail] = useState(invitedEmail || '');
  const [recientes, setRecientes] = useState<string[]>([]);

  // Los correos guardados se leen recién en el cliente: si se usaran para el
  // render inicial no coincidiría con el HTML del servidor (hidratación).
  useEffect(() => {
    if (invitedEmail) return;
    const guardados = getRecentEmails();
    setRecientes(guardados);
    if (guardados.length > 0) setEmail(guardados[0]);
  }, [invitedEmail]);

  // Guardamos el correo al enviar, antes de delegar en la server action.
  const enviar = (formData: FormData) => {
    rememberEmail(String(formData.get('email') || ''));
    return login(formData);
  };

  const olvidar = () => {
    forgetEmails();
    setRecientes([]);
    setEmail('');
  };

  return (
    <form action={enviar} className="space-y-5">
      {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={emailLocked}
          autoComplete="username"
          list={recientes.length > 0 ? 'correos-recientes' : undefined}
          className={emailLocked ? 'h-11 bg-muted cursor-not-allowed' : 'h-11'}
          required
        />
        {recientes.length > 0 && (
          <datalist id="correos-recientes">
            {recientes.map((correo) => (
              <option key={correo} value={correo} />
            ))}
          </datalist>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <ForgotPasswordDialog />
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11"
          required
        />
      </div>

      <LoginButton />

      {recientes.length > 0 && (
        <button
          type="button"
          onClick={olvidar}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Olvidar los correos guardados en este equipo
        </button>
      )}
    </form>
  );
}



export default function LoginPage() {
  const anio = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <Suspense fallback={null}>
        <LogoutDetector />
      </Suspense>

      <AuthBrandPanel titular="La gestión fiscal de tus empresas, ordenada y sin trabajo manual." />

      {/* ---- Mitad derecha: formulario ---- */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:min-h-0">
        <div className="w-full max-w-[380px]">
          <AuthBrandMobile />

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ingresá tus credenciales para acceder a tu cuenta.
            </p>
          </div>


          <Suspense>
            <LoginError />
          </Suspense>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <Suspense
            fallback={
              <p className="mt-6 text-center text-sm text-muted-foreground">
                ¿No tienes una cuenta? <span className="text-primary">Regístrate</span>
              </p>
            }
          >
            <LoginFooter />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

