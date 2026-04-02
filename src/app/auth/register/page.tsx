'use client';

import { useFormStatus } from 'react-dom';
import { register } from '@/services/auth-service';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import React, { Suspense, useEffect, useState } from 'react';

function RegisterButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" type="submit" disabled={pending}>
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
    <form action={register} className="space-y-4">
      <Suspense fallback={null}>
        <RegisterError />
      </Suspense>

      {companyName && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertDescription className="text-blue-700">
            Estás registrándote para colaborar con <strong>{companyName}</strong>.
          </AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="invite_token" value={searchParams.get('token') || ''} />

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="Tu Nombre Full" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo Electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          readOnly={!!token}
          className={token ? "bg-muted cursor-not-allowed" : ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" required />
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
    <div className="mt-4 text-center text-sm">
      ¿Ya tienes una cuenta?{' '}
      <Link href={loginUrl} className="underline">
        Inicia sesión
      </Link>
    </div>
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
      <CardHeader>
        <CardTitle className="text-2xl">
          {isInvited ? (companyName ? `Únete a ${companyName}` : 'Completa tu Registro') : 'Crear una Cuenta'}
        </CardTitle>
        <CardDescription>
          {isInvited
            ? 'Crea tu contraseña para empezar a colaborar en el equipo.'
            : 'Introduce tus datos para registrarte.'}
        </CardDescription>
      </CardHeader>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg border-primary/20">
        <Suspense fallback={<CardHeader><CardTitle className="text-2xl">Cargando...</CardTitle></CardHeader>}>
          <InvitationHeader />
        </Suspense>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
            <RegisterForm />
          </Suspense>
          <Suspense fallback={null}>
            <RegisterFooter />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
