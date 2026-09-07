'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Camera, LogOut, Building2, CheckCircle2, Clock, AlertCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enqueueClientUploadBatch } from '@/lib/client-upload-queue';
import { MuvailLogo } from '@/components/brand/muvail-logo';
import { isNativeApp } from '@/lib/is-native-app';

// DataRefreshProvider + UploadProgressManager se cargan solo en el cliente
// para evitar el crash de useContext durante el SSR de Next.js
const MobileProgressOverlay = dynamic(
  async () => {
    const { DataRefreshProvider } = await import('@/context/DataRefreshProvider');
    const { UploadProgressManager } = await import('@/components/upload/upload-progress-card');
    return function MobileProgressOverlayInner({ userId }: { userId: number }) {
      return (
        <DataRefreshProvider>
          <UploadProgressManager userId={userId} />
        </DataRefreshProvider>
      );
    };
  },
  { ssr: false }
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Company {
  id: number;
  name: string;
}

interface MobileUploadRecord {
  id: string;         // uploadId o timestamp
  fileName: string;
  companyName: string;
  timestamp: number;  // ms epoch
  status: 'uploading' | 'done' | 'error';
}

interface SessionUser {
  id: number;
  email: string;
  nombre?: string;
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const MOBILE_HISTORY_KEY = 'muvail_mobile_history';
const TODAY_MS = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function loadTodayHistory(userId: number): MobileUploadRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${MOBILE_HISTORY_KEY}_${userId}`);
    if (!raw) return [];
    const all: MobileUploadRecord[] = JSON.parse(raw);
    const today = TODAY_MS();
    return all.filter((r) => r.timestamp >= today);
  } catch {
    return [];
  }
}

function saveHistory(userId: number, records: MobileUploadRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    // Guardar solo los últimos 7 días para no crecer indefinidamente
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = records.filter((r) => r.timestamp >= cutoff);
    localStorage.setItem(`${MOBILE_HISTORY_KEY}_${userId}`, JSON.stringify(filtered));
  } catch { /* ignore */ }
}

// ─── Componente interno (necesita DataRefreshProvider) ───────────────────────

function MobileContent() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  // true = la URL fue cargada desde la APK nativa
  const [isNative, setIsNative] = useState(false);

  // Evaluar isNativeApp() solo en el cliente (no en SSR)
  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  const [history, setHistory] = useState<MobileUploadRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);

  // ── Cargar sesión + redirección para usuarios de escritorio ──────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const u = data?.user || (data?.id ? data : null);
        if (u?.id) {
          setUser({ id: Number(u.id), email: u.email, nombre: u.nombre });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingUser(false));
  }, []);

  // ── Cargar empresas ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetch('/api/companies')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Company[]) => {
        setCompanies(data);
        if (data.length === 1) setSelectedCompanyId(String(data[0].id));
      })
      .catch(() => {});
  }, [user]);

  // ── Cargar historial del día ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setHistory(loadTodayHistory(user.id));
  }, [user]);

  // ── Añadir al historial ────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (record: MobileUploadRecord) => {
      if (!user) return;
      setHistory((prev) => {
        const next = [record, ...prev];
        saveHistory(user.id, next);
        return next;
      });
    },
    [user]
  );

  const updateHistoryStatus = useCallback(
    (id: string, status: MobileUploadRecord['status']) => {
      if (!user) return;
      setHistory((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, status } : r));
        saveHistory(user.id, next);
        return next;
      });
    },
    [user]
  );

  // ── Manejar foto capturada ─────────────────────────────────────────────────
  const handlePhotoCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedCompanyId) return;

      // Resetear el input para permitir tomar otra foto seguida
      if (cameraRef.current) cameraRef.current.value = '';

      const company = companies.find((c) => String(c.id) === selectedCompanyId);
      const tempId = `mobile_${Date.now()}`;

      addToHistory({
        id: tempId,
        fileName: file.name,
        companyName: company?.name ?? 'Empresa',
        timestamp: Date.now(),
        status: 'uploading',
      });

      setIsUploading(true);
      setUploadError(null);

      try {
        await enqueueClientUploadBatch({
          empresaId: selectedCompanyId,
          files: [file],
        });
        updateHistoryStatus(tempId, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al subir la foto';
        setUploadError(msg);
        updateHistoryStatus(tempId, 'error');
      } finally {
        setIsUploading(false);
      }
    },
    [selectedCompanyId, companies, addToHistory, updateHistoryStatus]
  );

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    window.location.reload();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDERS
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Sin sesión: según si es APK o desktop, el login va a destinos distintos
  if (!user) {
    // En desktop: ir al login normal que redirige al dashboard (no a /mobile)
    const loginHref = '/auth/login?next=/mobile';
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <MuvailLogo className="h-10 w-auto" />
        <p className="text-muted-foreground text-sm">Inicia sesión para continuar</p>
        <Button
          className="w-full max-w-xs"
          onClick={() => { window.location.href = loginHref; }}
        >
          Iniciar sesión
        </Button>
      </div>
    );
  }

  const selectedCompany = companies.find((c) => String(c.id) === selectedCompanyId);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <MuvailLogo className="h-7 w-auto" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {user.nombre ?? user.email}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col gap-5 px-4 py-6 max-w-lg mx-auto w-full">

        {/* Selector de empresa */}
        <section>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Empresa
          </label>
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cargando empresas…</p>
          ) : companies.length === 1 ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium">
              {companies[0].name}
            </div>
          ) : (
            <select
              id="mobile-company-select"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Seleccionar empresa…</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          )}
        </section>

        {/* Botón principal: Tomar foto */}
        <section className="flex flex-col items-center gap-3">
          {/* Input oculto con capture para la cámara nativa */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            className="hidden"
            id="mobile-camera-input"
          />

          <button
            id="mobile-take-photo-btn"
            disabled={!selectedCompanyId || isUploading}
            onClick={() => cameraRef.current?.click()}
            className={[
              'relative flex flex-col items-center justify-center gap-3',
              'w-48 h-48 rounded-full border-4 transition-all duration-200',
              'focus:outline-none focus:ring-4 focus:ring-primary/40',
              !selectedCompanyId || isUploading
                ? 'border-border bg-muted/30 text-muted-foreground cursor-not-allowed opacity-60'
                : 'border-primary bg-primary/5 text-primary active:scale-95 cursor-pointer hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20',
            ].join(' ')}
          >
            {isUploading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
            ) : (
              <>
                <Camera className="h-14 w-14" strokeWidth={1.5} />
                <span className="text-sm font-semibold">Tomar foto</span>
              </>
            )}
          </button>

          {!selectedCompanyId && (
            <p className="text-xs text-muted-foreground text-center">
              Seleccioná una empresa para habilitar la cámara
            </p>
          )}
          {selectedCompany && !isUploading && (
            <p className="text-xs text-muted-foreground text-center">
              Subiendo a <span className="font-medium text-foreground">{selectedCompany.name}</span>
            </p>
          )}

          {/* Error de subida */}
          {uploadError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg w-full text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </section>

        {/* También se puede subir desde galería */}
        <section className="flex justify-center">
          <label
            htmlFor="mobile-gallery-input"
            className={[
              'flex items-center gap-2 text-xs px-4 py-2 rounded-full border border-border',
              'cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground',
              !selectedCompanyId || isUploading ? 'opacity-40 pointer-events-none' : '',
            ].join(' ')}
          >
            <Upload className="h-3.5 w-3.5" />
            Seleccionar de galería
          </label>
          <input
            id="mobile-gallery-input"
            type="file"
            accept="image/*,application/pdf"
            disabled={!selectedCompanyId || isUploading}
            onChange={handlePhotoCapture}
            className="hidden"
          />
        </section>

        {/* Cola de progreso — cargada client-only para evitar crash SSR */}
        <MobileProgressOverlay userId={user.id} />

        {/* Historial del día */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Subidos hoy
            {history.length > 0 && (
              <span className="ml-1 bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px]">
                {history.filter((r) => r.status === 'done').length} ✓
              </span>
            )}
          </h2>

          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aún no subiste nada hoy
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((record) => (
                <li
                  key={record.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card text-sm"
                >
                  <span className="shrink-0">
                    {record.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {record.status === 'uploading' && (
                      <div className="animate-spin h-4 w-4 rounded-full border-2 border-primary border-t-transparent" />
                    )}
                    {record.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-foreground">{record.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.companyName} · {new Date(record.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Página exportada ────────────────────────────────────────────────────────

export default function MobilePage() {
  return <MobileContent />;
}
