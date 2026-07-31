'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { verifyEmailCode, resendCode } from '@/services/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, RefreshCw } from 'lucide-react';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email') || '';
  const inviteToken = searchParams.get('invite_token') || '';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    setError('');
    setSuccessMsg('');
    try {
      const formData = new FormData();
      formData.append('email', email);
      const res = await resendCode(formData);
      if (res.success) {
        setSuccessMsg('Código reenviado con éxito. Revisa tu bandeja de entrada o spam.');
      } else {
        setError(res.error || 'No se pudo reenviar el código.');
      }
    } catch (err) {
      setError('Error al reenviar el código.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('El código debe tener 6 dígitos');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccessMsg('');
    
    const formData = new FormData();
    formData.append('email', email);
    formData.append('code', code);
    if (inviteToken) formData.append('invite_token', inviteToken);

    const result = await verifyEmailCode(formData);
    
    if (!result.success) {
      setError(result.error || 'Código inválido o expirado');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-card rounded-2xl shadow-xl border relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Verifica tu correo</h1>
        <p className="text-muted-foreground text-center mb-8">
          Hemos enviado un código de 6 dígitos a <br/>
          <span className="font-semibold text-foreground">{email}</span>
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center text-3xl tracking-[0.5em] font-bold h-16 bg-muted/50 focus:bg-background transition-colors"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm font-medium text-center">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-600 rounded-lg text-sm font-medium text-center">
              {successMsg}
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={loading || code.length !== 6}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verificar Cuenta'}
          </Button>
        </form>

        <div className="mt-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            ¿No recibiste el correo o se expiró el código?
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResend} 
            disabled={resending || loading}
            className="w-full max-w-[200px]"
          >
            {resending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reenviar Código
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Suspense fallback={<div className="h-32 w-32 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
