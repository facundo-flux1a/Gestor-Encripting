'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verify2FACode } from '@/services/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function TwoFactorPage() {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('El código debe tener 6 dígitos');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('code', code);

    const result = await verify2FACode(formData);
    
    if (!result.success) {
      setError(result.error || 'Código inválido o expirado');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md p-8 bg-card rounded-2xl shadow-xl border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Autenticación Segura</h1>
          <p className="text-muted-foreground text-center mb-8">
            Hemos enviado un código de acceso a tu correo electrónico.
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

            <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={loading || code.length !== 6}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-8 text-center">
            Si no lo recibiste, revisa tu carpeta de spam o intenta iniciar sesión nuevamente para pedir otro.
          </p>
        </div>
      </div>
    </div>
  );
}
