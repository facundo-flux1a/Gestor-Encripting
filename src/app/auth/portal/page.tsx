'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Estado = 'cargando' | 'error' | 'ok';

export default function PortalPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [mensaje, setMensaje] = useState('Verificando acceso desde el Portal...');

  useEffect(() => {
    // Leer el pase del fragmento de la URL (el # no llega al servidor automáticamente)
    const hash = window.location.hash; // "#pase=XXXX"
    const params = new URLSearchParams(hash.replace('#', ''));
    const pase = params.get('pase');

    // Borrar el pase de la barra de direcciones inmediatamente (seguridad)
    history.replaceState(null, '', window.location.pathname);

    if (!pase) {
      setEstado('error');
      setMensaje(
        'No se recibió ningún pase del Portal. Volvé al Portal de Muvail y hacé click en el cristal del Gestor nuevamente.'
      );
      return;
    }

    // Mandar el pase a NUESTRO SERVIDOR (nunca directamente a Muvail desde el browser)
    fetch('/api/auth/muvail-pase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pase }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setEstado('ok');
          setMensaje('Acceso verificado. Entrando al Gestor...');
          router.replace('/dashboard');
        } else {
          setEstado('error');
          setMensaje(
            data.error ||
              'No se pudo verificar el acceso. Volvé al Portal y hacé click en el cristal nuevamente.'
          );
        }
      })
      .catch(() => {
        setEstado('error');
        setMensaje('Error de conexión. Verificá tu conexión e intentá de nuevo.');
      });
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f9fafb',
      }}
    >
      {estado === 'cargando' && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto',
            }}
          />
          <p style={{ marginTop: 20, color: '#6b7280', fontSize: 15 }}>{mensaje}</p>
        </div>
      )}

      {estado === 'error' && (
        <div
          style={{
            maxWidth: 440,
            textAlign: 'center',
            padding: '28px 32px',
            border: '1px solid #fca5a5',
            borderRadius: 12,
            background: '#fef2f2',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{ fontSize: 24, marginBottom: 8 }}>⚠️</p>
          <p style={{ color: '#991b1b', fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
            No pudimos verificar el acceso
          </p>
          <p style={{ color: '#7f1d1d', fontSize: 14, lineHeight: 1.6 }}>{mensaje}</p>
        </div>
      )}

      {estado === 'ok' && (
        <p style={{ color: '#059669', fontSize: 16 }}>✓ {mensaje}</p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
