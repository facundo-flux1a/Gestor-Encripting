'use client';

import { useEffect, useState } from 'react';

type Estado = 'cargando' | 'error' | 'eligiendo' | 'ok';

interface Candidata {
  id: number;
  nombre: string;
  adminNombre?: string | null;
}

export default function PortalPage() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [mensaje, setMensaje] = useState('Verificando acceso desde el Portal...');
  const [candidatas, setCandidatas] = useState<Candidata[]>([]);
  const [muvailRef, setMuvailRef] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
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

    fetch('/api/auth/muvail-pase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pase }),
    })
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          setEstado('error');
          setMensaje(
            data.error || 'No se pudo verificar el acceso. Volvé al Portal y hacé click en el cristal nuevamente.'
          );
          return;
        }

        if (data.action === 'choose_empresa') {
          // Hay varias empresas con el mismo CIF → mostrar selector
          setCandidatas(data.candidates || []);
          setMuvailRef(data.muvailRef || null);
          setEstado('eligiendo');
          return;
        }

        // action === 'ok' → ir al dashboard
        setEstado('ok');
        window.location.href = '/dashboard';
      })
      .catch(() => {
        setEstado('error');
        setMensaje('Error de conexión. Verificá tu conexión e intentá de nuevo.');
      });
  }, []);

  async function elegirEmpresa(empresaId: number) {
    setVinculando(true);
    try {
      const res = await fetch('/api/auth/muvail-bind-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, muvailRef }),
      });
      if (res.ok) {
        setEstado('ok');
        window.location.href = '/dashboard';
      } else {
        const data = await res.json();
        setEstado('error');
        setMensaje(data.error || 'No se pudo seleccionar la empresa. Intentá de nuevo.');
      }
    } catch {
      setEstado('error');
      setMensaje('Error de conexión al seleccionar la empresa.');
    }
  }

  // ─── Estilos inline compartidos ──────────────────────────────────────────
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    background: 'hsl(220 20% 9%)',
    padding: '24px',
  };

  const cardStyle: React.CSSProperties = {
    background: 'hsl(220 16% 13%)',
    border: '1px solid hsl(220 12% 20%)',
    borderRadius: 16,
    padding: '36px 40px',
    maxWidth: 480,
    width: '100%',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  };

  const logoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
    justifyContent: 'center',
  };

  return (
    <div style={wrapStyle}>
      {/* Logo Muvail */}
      <div style={logoStyle}>
        <img src="/branding/muvail-wordmark-light.svg" alt="Muvail" height={28} />
      </div>

      {/* CARGANDO */}
      {estado === 'cargando' && (
        <div style={{ textAlign: 'center', color: 'hsl(220 10% 65%)' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid hsl(220 12% 25%)',
              borderTop: '3px solid hsl(169 72% 49%)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ fontSize: 15, margin: 0 }}>{mensaje}</p>
        </div>
      )}

      {/* ERROR */}
      {estado === 'error' && (
        <div style={{ ...cardStyle, border: '1px solid hsl(0 72% 35%)' }}>
          <p style={{ fontSize: 28, textAlign: 'center', margin: '0 0 12px' }}>⚠️</p>
          <h2
            style={{
              color: 'hsl(0 72% 65%)',
              fontWeight: 700,
              fontSize: 18,
              textAlign: 'center',
              margin: '0 0 10px',
            }}
          >
            No pudimos verificar el acceso
          </h2>
          <p style={{ color: 'hsl(0 30% 60%)', fontSize: 14, lineHeight: 1.7, textAlign: 'center', margin: 0 }}>
            {mensaje}
          </p>
        </div>
      )}

      {/* SELECCIÓN DE EMPRESA */}
      {estado === 'eligiendo' && (
        <div style={cardStyle}>
          <h2
            style={{
              color: 'hsl(220 10% 92%)',
              fontWeight: 700,
              fontSize: 20,
              margin: '0 0 8px',
              textAlign: 'center',
            }}
          >
            ¿Con qué empresa querés entrar?
          </h2>
          <p
            style={{
              color: 'hsl(220 10% 55%)',
              fontSize: 14,
              margin: '0 0 24px',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            Tenés más de una empresa registrada con el mismo CIF en el Portal. Elegí cuál querés usar ahora.
            <br />
            El sistema la recordará para las próximas veces.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidatas.map((c) => (
              <button
                key={c.id}
                disabled={vinculando}
                onClick={() => elegirEmpresa(c.id)}
                style={{
                  background: 'hsl(220 16% 18%)',
                  border: '1px solid hsl(220 12% 26%)',
                  borderRadius: 10,
                  padding: '16px 20px',
                  cursor: vinculando ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                  opacity: vinculando ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!vinculando) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(169 72% 49%)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'hsl(220 16% 22%)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(220 12% 26%)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'hsl(220 16% 18%)';
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'hsl(220 10% 90%)',
                    marginBottom: 4,
                  }}
                >
                  {c.nombre || `Empresa #${c.id}`}
                </span>
                <span style={{ fontSize: 12, color: 'hsl(220 10% 50%)' }}>
                  {c.adminNombre ? `Administrada por ${c.adminNombre}` : `ID ${c.id}`}
                </span>
              </button>
            ))}
          </div>

          {vinculando && (
            <p style={{ textAlign: 'center', color: 'hsl(169 72% 49%)', marginTop: 16, fontSize: 14 }}>
              Vinculando empresa…
            </p>
          )}
        </div>
      )}

      {/* OK — en transición */}
      {estado === 'ok' && (
        <p style={{ color: 'hsl(169 72% 49%)', fontSize: 16 }}>✓ Acceso verificado. Entrando…</p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      `}</style>
    </div>
  );
}
