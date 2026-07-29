'use client';

import { useFormStatus } from 'react-dom';
import { login } from '@/services/auth-service';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import React, { Suspense, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { LogoutDetector } from '@/components/auth/LogoutDetector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/* ─────────────────────── Paleta del panel oscuro ───────────────────────
   El login vive sobre un degradado violeta propio, fuera del tema
   claro/oscuro de la app, así que los controles se estilan a mano
   (los de shadcn asumen fondo claro y acá se perderían).
   El violeta sale de --primary: 252 82% 62%.                            */
const BRAND = {
  from: '#1a0b2e',
  via: '#2d1155',
  accent: '#7c5cfa',
  accentSoft: '#a855f7',
};

const inputBase =
  'w-full rounded-full px-5 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-60';

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1.5px solid rgba(255,255,255,0.15)',
  color: '#fff',
  caretColor: BRAND.accentSoft,
};

function focusRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.border = '1.5px solid rgba(168,85,247,0.8)';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,92,250,0.18)';
}

function blurRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.border = '1.5px solid rgba(255,255,255,0.15)';
  e.currentTarget.style.boxShadow = 'none';
}

const labelStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.75)',
  fontSize: '0.82rem',
  letterSpacing: '0.04em',
};

function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
      style={{ background: `linear-gradient(90deg, ${BRAND.accent}, ${BRAND.accentSoft})` }}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Iniciando sesión...
        </>
      ) : (
        'Iniciar Sesión'
      )}
    </button>
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
    <div
      className="mb-5 flex items-start gap-3 rounded-2xl px-4 py-3"
      style={{
        background: 'rgba(248,113,113,0.12)',
        border: '1px solid rgba(248,113,113,0.35)',
      }}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#fca5a5' }} />
      <div>
        <p className="text-sm font-medium" style={{ color: '#fecaca' }}>
          Error de autenticación
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(254,202,202,0.75)' }}>
          {errorMessage}
        </p>
      </div>
    </div>
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
        <button
          type="button"
          className="text-xs transition-colors hover:underline"
          style={{ color: 'rgba(196,181,253,0.9)' }}
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
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(90deg, ${BRAND.accent}, ${BRAND.accentSoft})` }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar instrucciones'
            )}
          </button>
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
    <p className="mt-6 text-center text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
      ¿No tienes una cuenta?{' '}
      <Link
        href={registerUrl}
        className="font-medium transition-colors hover:underline"
        style={{ color: 'rgba(196,181,253,0.95)' }}
      >
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

  return (
    <form action={login} className="space-y-5">
      {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}

      <div className="space-y-2">
        <label htmlFor="email" className="block pl-1" style={labelStyle}>
          CORREO ELECTRÓNICO
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          defaultValue={invitedEmail || ''}
          readOnly={emailLocked}
          required
          className={inputBase + (emailLocked ? ' cursor-not-allowed' : '')}
          style={{ ...inputStyle, opacity: emailLocked ? 0.7 : 1 }}
          onFocus={emailLocked ? undefined : focusRing}
          onBlur={emailLocked ? undefined : blurRing}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between pl-1">
          <label htmlFor="password" style={labelStyle}>
            CONTRASEÑA
          </label>
          <ForgotPasswordDialog />
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          className={inputBase}
          style={inputStyle}
          onFocus={focusRing}
          onBlur={blurRing}
        />
      </div>

      <LoginButton />
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${BRAND.from} 0%, ${BRAND.via} 50%, ${BRAND.from} 100%)`,
      }}
    >
      <Suspense fallback={null}>
        <LogoutDetector />
      </Suspense>

      {/* ---- Panel izquierdo: marca ---- */}
      <div className="relative hidden lg:flex lg:w-[58%] flex-col justify-between overflow-hidden p-10">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 700 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect x="320" y="-80" width="420" height="420" rx="60" transform="rotate(20 320 -80)" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
          <rect x="400" y="300" width="280" height="280" rx="50" transform="rotate(-15 400 300)" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <circle cx="60" cy="780" r="180" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
          <line x1="0" y1="600" x2="500" y2="200" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <rect x="520" y="650" width="200" height="200" rx="40" transform="rotate(10 520 650)" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
          <ellipse cx="550" cy="100" rx="160" ry="120" fill="rgba(168,85,247,0.10)" />
          <ellipse cx="100" cy="780" rx="140" ry="100" fill="rgba(124,92,250,0.10)" />
        </svg>

        <div className="relative z-10 flex items-center gap-3">
          <img src="/gm.png" alt="Gestor Documental" className="h-12 w-12 object-contain" />
          <span className="text-lg font-semibold tracking-tight text-white">Gestor Documental</span>
        </div>

        <div className="relative z-10 mb-16">
          <div className="mb-6 h-1 w-12 rounded-full bg-white/50" />
          <h1 className="mb-4 text-6xl font-extrabold leading-tight tracking-tight text-white">
            Bienvenido
          </h1>
          <p className="max-w-md text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            La plataforma inteligente de gestión fiscal. Ordená la documentación de
            tus empresas, automatizá la carga y encontrá todo en un solo lugar.
          </p>
        </div>
      </div>

      {/* ---- Panel derecho: formulario ---- */}
      <div
        className="relative flex w-full flex-col items-center justify-center p-8 lg:w-[42%]"
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Logo en mobile, donde el panel izquierdo no se ve */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <img src="/gm.png" alt="Gestor Documental" className="h-10 w-10 object-contain" />
          <span className="text-base font-semibold text-white">Gestor Documental</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="mb-1 text-3xl font-bold text-white">Iniciar sesión</h2>
            <div
              className="mt-2 h-0.5 w-10 rounded-full"
              style={{ background: `linear-gradient(90deg, ${BRAND.accent}, ${BRAND.accentSoft})` }}
            />
            <p className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
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
              <p className="mt-6 text-center text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                ¿No tienes una cuenta? <span className="underline">Regístrate</span>
              </p>
            }
          >
            <LoginFooter />
          </Suspense>
        </div>

        <p className="mt-10 text-center text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          © {new Date().getFullYear()} Gestor Documental Muvail
        </p>
      </div>
    </main>
  );
}
