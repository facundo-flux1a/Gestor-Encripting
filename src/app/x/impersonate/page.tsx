'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// /x/impersonate  — Panel de impersonación de admin
// URL no convencional, protegida por ADMIN_SHADOW_SECRET en .env
// ---------------------------------------------------------------------------

type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  organization_rol: string | null;
  empresa_id: number | null;
};

type Fase = 'gate' | 'selector';

const PRIMARY   = 'hsl(169, 72%, 49%)';   // verde Gestor
const PRIMARY_DIM = 'hsl(169, 72%, 38%)';
const BG        = 'hsl(175, 33%, 6%)';    // fondo oscuro del Gestor
const SURFACE   = 'hsl(175, 25%, 9%)';
const BORDER    = 'hsl(175, 20%, 14%)';
const MUTED     = 'hsl(175, 15%, 40%)';
const TEXT      = 'hsl(175, 20%, 90%)';

export default function ImpersonatePage() {
  const [fase, setFase] = useState<Fase>('gate');
  const [adminKey, setAdminKey] = useState('');
  const [gateError, setGateError] = useState('');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filtro, setFiltro] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [error, setError] = useState('');
  const [hasSession, setHasSession] = useState(false);
  const router = useRouter();

  // Detectar si hay sesión activa para saber a dónde volver al cerrar
  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (r.ok) setHasSession(true); }).catch(() => {});
  }, []);

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.history.length > 2) {
      router.back();
    } else if (hasSession) {
      router.push('/dashboard');
    } else {
      router.push('/auth/login');
    }
  };

  const cargarUsuarios = useCallback(async (key: string) => {
    const res = await fetch('/api/dev/shadow-login', {
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      const data = await res.json();
      setGateError(data.error || 'Clave incorrecta.');
      return false;
    }
    const data = await res.json();
    setUsuarios(data.usuarios || []);
    return true;
  }, []);

  const handleGate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    const ok = await cargarUsuarios(adminKey);
    if (ok) setFase('selector');
  };

  const handleImpersonate = async () => {
    if (!selectedId) return;
    setImpersonating(true);
    setError('');
    try {
      const res = await fetch('/api/dev/shadow-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey, userId: selectedId }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = '/dashboard';
      } else {
        setError(data.error || 'Error al impersonar.');
        setImpersonating(false);
      }
    } catch {
      setError('Error de conexión.');
      setImpersonating(false);
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => {
    const q = filtro.toLowerCase();
    return (
      u.nombre.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  const rolBadge = (rol: string | null) => {
    if (rol === 'ADMIN')  return { color: 'hsl(43,96%,56%)',  bg: 'hsl(43,96%,56%,0.12)'  };
    if (rol === 'VIEWER') return { color: MUTED,              bg: 'hsl(175,15%,40%,0.12)'  };
    return                       { color: PRIMARY,             bg: 'hsl(169,72%,49%,0.12)'  };
  };

  // ── GATE ──────────────────────────────────────────────────────────────────
  if (fase === 'gate') {
    return (
      <div style={s.bg}>
        <div style={s.logoWrap}>
          <img src="/branding/muvail-wordmark-light.svg" alt="Muvail" style={{ height: 28, opacity: 0.85 }} />
        </div>

        <div style={s.card}>
          {/* Botón cerrar */}
          <button
            onClick={handleClose}
            title={hasSession ? 'Volver al dashboard' : 'Ir al login'}
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'none', border: 'none', cursor: 'pointer',
              color: MUTED, fontSize: 20, lineHeight: 1, padding: 4,
              borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
          >
            ×
          </button>
          <div style={s.cardHeader}>
            <div style={s.shieldWrap}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="1.5">
                <path d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z"/>
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 style={s.title}>Panel de Administración</h1>
            <p style={s.subtitle}>Acceso restringido — solo administradores</p>
          </div>

          <form onSubmit={handleGate} style={s.form} autoComplete="on">
            {/* Username fijo — le dice al browser que guarde esto como una credencial
                separada de cualquier login de usuario real. Nunca puede ser un email válido. */}
            <input
              type="text"
              name="username"
              value="x-gestor-impersonate"
              readOnly
              autoComplete="username"
              style={{ display: 'none' }}
            />
            <label style={s.label}>Clave de administrador</label>
            <input
              type="password"
              name="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              autoComplete="current-password"
              style={s.input}
            />
            {gateError && <p style={s.errorMsg}>{gateError}</p>}
            <button
              type="submit"
              disabled={!adminKey}
              style={{ ...s.btn, opacity: adminKey ? 1 : 0.4 }}
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── SELECTOR ──────────────────────────────────────────────────────────────
  return (
    <div style={s.bg}>
      <div style={s.logoWrap}>
        <img src="/branding/muvail-wordmark-light.svg" alt="Muvail" style={{ height: 28, opacity: 0.85 }} />
      </div>

      <div style={{ ...s.card, maxWidth: 660 }}>
        {/* Botón cerrar */}
        <button
          onClick={handleClose}
          title={hasSession ? 'Volver al dashboard' : 'Ir al login'}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: MUTED, fontSize: 20, lineHeight: 1, padding: 4,
            borderRadius: 6, transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
          onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
        >
          ×
        </button>
        <div style={s.cardHeader}>
          <div style={s.shieldWrap}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="1.5">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={s.title}>Seleccionar usuario</h1>
          <p style={s.subtitle}>{usuarios.length} usuarios activos en el sistema</p>
        </div>

        {/* Buscador */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={s.searchWrap}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por nombre, email o ID..."
              style={s.searchInput}
              autoFocus
            />
          </div>
        </div>

        {/* Lista */}
        <div style={s.list}>
          {usuariosFiltrados.length === 0 && (
            <p style={{ color: MUTED, textAlign: 'center', padding: '24px 0', margin: 0, fontSize: 13 }}>
              Sin resultados
            </p>
          )}
          {usuariosFiltrados.map((u) => {
            const sel = selectedId === u.id;
            const badge = rolBadge(u.organization_rol);
            return (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id === selectedId ? null : u.id)}
                style={{
                  ...s.userRow,
                  background: sel ? `hsl(169,72%,49%,0.08)` : 'transparent',
                  borderColor: sel ? `hsl(169,72%,49%,0.35)` : BORDER,
                  outline: sel ? `1px solid hsl(169,72%,49%,0.2)` : 'none',
                }}
              >
                {/* Avatar */}
                <div style={{
                  ...s.avatar,
                  background: sel ? `hsl(169,72%,49%,0.2)` : 'hsl(175,20%,14%)',
                  color: sel ? PRIMARY : MUTED,
                  borderColor: sel ? `hsl(169,72%,49%,0.4)` : BORDER,
                }}>
                  {(u.nombre[0] || '?').toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ ...s.userName, color: sel ? TEXT : 'hsl(175,20%,78%)' }}>
                      {u.nombre}
                    </span>
                    <span style={{
                      ...s.badge,
                      color: badge.color,
                      background: badge.bg,
                      border: `1px solid ${badge.color}33`,
                    }}>
                      {u.organization_rol || u.rol}
                    </span>
                  </div>
                  <span style={s.userEmail}>{u.email}</span>
                </div>

                {/* ID */}
                <span style={{ ...s.userId, color: sel ? `hsl(169,72%,49%,0.7)` : 'hsl(175,15%,28%)' }}>
                  #{u.id}
                </span>

                {/* Check */}
                {sel && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          {error && <p style={{ ...s.errorMsg, marginBottom: 12 }}>{error}</p>}
          <button
            onClick={handleImpersonate}
            disabled={!selectedId || impersonating}
            style={{
              ...s.btn,
              opacity: selectedId && !impersonating ? 1 : 0.35,
              width: '100%',
            }}
          >
            {impersonating
              ? 'Entrando...'
              : selectedId
                ? `Entrar como ${usuarios.find(u => u.id === selectedId)?.nombre} (#${selectedId})`
                : 'Seleccioná un usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ESTILOS ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: BG,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    padding: '32px 16px',
    gap: 20,
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.3px',
  },
  card: {
    position: 'relative' as const,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
  },
  cardHeader: {
    padding: '28px 24px 20px',
    borderBottom: `1px solid ${BORDER}`,
    textAlign: 'center',
  },
  shieldWrap: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'hsl(169,72%,49%,0.1)',
    border: `1px solid hsl(169,72%,49%,0.2)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px',
  },
  title: {
    margin: '0 0 5px',
    fontSize: 18,
    fontWeight: 700,
    color: TEXT,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: 12,
    color: MUTED,
  },
  form: {
    padding: '22px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    fontSize: 12,
    color: MUTED,
    fontWeight: 500,
    letterSpacing: '0.2px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: TEXT,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '0 12px',
  },
  searchInput: {
    flex: 1,
    padding: '10px 0',
    background: 'transparent',
    border: 'none',
    color: TEXT,
    fontSize: 13,
    outline: 'none',
  },
  btn: {
    padding: '11px 20px',
    background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DIM})`,
    border: 'none',
    borderRadius: 8,
    color: 'hsl(175, 63%, 7%)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.1px',
    transition: 'opacity 0.2s',
  },
  errorMsg: {
    color: '#f87171',
    fontSize: 12,
    margin: 0,
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 6,
    padding: '8px 12px',
  },
  list: {
    maxHeight: 400,
    overflowY: 'auto',
    padding: '4px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '9px 11px',
    borderRadius: 8,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    width: '100%',
    boxSizing: 'border-box',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    border: '1px solid',
    transition: 'all 0.15s',
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
  },
  userEmail: {
    color: MUTED,
    fontSize: 11,
    display: 'block',
    marginTop: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 280,
  },
  badge: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 4,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  userId: {
    fontSize: 11,
    fontFamily: 'monospace',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  footer: {
    padding: '14px 20px 20px',
    borderTop: `1px solid ${BORDER}`,
  },
};
