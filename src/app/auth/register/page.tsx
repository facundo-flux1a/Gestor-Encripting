'use client';

import { useFormStatus } from 'react-dom';
import { register } from '@/services/auth-service';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import React, { Suspense, useEffect, useState } from 'react';
import { AuthBrandPanel, AuthBrandMobile } from '@/components/auth/auth-brand-panel';

function RegisterButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full h-11" type="submit" disabled={pending}>
      {pending ? 'Creando cuenta...' : 'Crear Cuenta'}
    </Button>
  );
}

function RegisterError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'missing_fields':
        return 'Por favor, completa todos los campos.';
      case 'user_exists':
        return 'Ya existe una cuenta con este correo electrónico.';
      case 'server_error':
        return 'Ha ocurrido un error en el servidor. Por favor, inténtalo de nuevo más tarde.';
      default:
        return null;
    }
  };
  const errorMessage = getErrorMessage(error);

  if (!errorMessage) return null;

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error de Registro</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    const invitedEmail = searchParams.get('email');
    const inviteToken = searchParams.get('token');

    if (invitedEmail) setEmail(invitedEmail);
    if (inviteToken) {
      setToken(inviteToken);
      // Opcional: Cargar detalles de la empresa para personalizar el mensaje
      fetch(`/api/auth/invitation-details?token=${inviteToken}`)
        .then(res => res.json())
        .then(data => {
          if (data.empresaNombre) setCompanyName(data.empresaNombre);
        })
        .catch(console.error);
    }
  }, [searchParams]);

  return (
    <form action={register} className="space-y-5">
      <Suspense fallback={null}>
        <RegisterError />
      </Suspense>

      {companyName && (
        <Alert className="border-primary/20 bg-primary/5">
          <AlertDescription className="text-foreground/80">
            Estás registrándote para colaborar con <strong>{companyName}</strong>.
          </AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="invite_token" value={searchParams.get('token') || ''} />

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="Tu Nombre Full" className="h-11" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          readOnly={!!token}
          className={token ? "h-11 bg-muted cursor-not-allowed" : "h-11"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" className="h-11" required />
      </div>
      <RegisterButton />
    </form>
  );
}

function RegisterFooter() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const loginUrl = token
    ? `/auth/login?token=${token}${email ? `&email=${encodeURIComponent(email)}` : ''}`
    : '/auth/login';

  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      ¿Ya tienes una cuenta?{' '}
      <Link href={loginUrl} className="font-medium text-primary hover:underline">
        Inicia sesión
      </Link>
    </p>
  );
}

export default function RegisterPage() {
  const [isInvited, setIsInvited] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Use a temporary component to read search params within Suspense
  const InvitationHeader = () => {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    useEffect(() => {
      if (token) {
        setIsInvited(true);
        fetch(`/api/auth/invitation-details?token=${token}`)
          .then(res => res.json())
          .then(data => {
            if (data.empresaNombre) setCompanyName(data.empresaNombre);
          })
          .catch(console.error);
      }
    }, [token]);

    return (
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">
          {isInvited ? (companyName ? `Únete a ${companyName}` : 'Completa tu Registro') : 'Crear una Cuenta'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isInvited
            ? 'Crea tu contraseña para empezar a colaborar en el equipo.'
            : 'Introduce tus datos para registrarte.'}
        </p>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <AuthBrandPanel titular="Sumate y empezá a ordenar la documentación fiscal de tus empresas." />

      <section className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:min-h-0">
        <div className="w-full max-w-[380px]">
          <AuthBrandMobile />

          <Suspense
            fallback={
              <div className="mb-8">
                <h2 className="text-2xl font-semibold tracking-tight">Cargando...</h2>
              </div>
            }
          >
            <InvitationHeader />
          </Suspense>

          <Suspense fallback={<div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
            <RegisterForm />
          </Suspense>

          <Suspense fallback={null}>
            <RegisterFooter />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
