'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import {
  Loader2, CheckCircle, XCircle, Upload, Search,
  Building2, User as UserIcon, RefreshCw, ShieldCheck,
  FileText, ArrowDownCircle, ArrowUpCircle, BookOpen, Lock, Trash2, AlertTriangle, PlusCircle, Send,
  Eye, Globe, X, Edit3, AlertCircle, Landmark
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SIIUserInfo {
  usuario?: { nombre: string; email: string };
  empresas?: Array<{ id: number; nombre_de_empresa: string; nombre_fiscal: string; cif: string; hasDelsol: boolean }>;
  estadisticas?: { pendientes: number; enviados: number; total: number };
}

type TabKey = 'credenciales' | 'emitidas' | 'recibidas' | 'llaa' | 'enviar' | 'documentos_locales';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function periodoLabel(p: string) {
  const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const n = parseInt(p, 10);
  return meses[n] || p;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SIIDashboardPage() {
  const { toast } = useToast();
  const { selectedCompanyIds } = useCompanyContext();

  // ── SII credentials (persisted across ops) ──────────────────────────────────
  const [certB64, setCertB64] = useState('');
  const [certPass, setCertPass] = useState('');
  const [certValid, setCertValid] = useState<boolean | null>(null);
  const [certInfo, setCertInfo] = useState<any>(null);
  const [testingCert, setTestingCert] = useState(false);

  // ── User/company info ────────────────────────────────────────────────────────
  const [userInfo, setUserInfo] = useState<SIIUserInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  // ── Active tab ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabKey>('credenciales');

  // ── Query filters ────────────────────────────────────────────────────────────
  const [ejercicio, setEjercicio] = useState('2026');
  const [periodo, setPeriodo] = useState('01');
  const [selectedTrimestres, setSelectedTrimestres] = useState<string[]>(['1T', '2T', '3T', '4T']);
  const [useEspecificos, setUseEspecificos] = useState(false);
  const [selectedMeses, setSelectedMeses] = useState<string[]>([]);
  const [useFechaRango, setUseFechaRango] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ── Query results ────────────────────────────────────────────────────────────
  const [querying, setQuerying] = useState(false);
  const [resultEmitidas, setResultEmitidas] = useState<any>(null);
  const [resultRecibidas, setResultRecibidas] = useState<any>(null);
  const [resultLLAA, setResultLLAA] = useState<any>(null);

  // ── Anulación state ───────────────────────────────────────────────────────────
  const [anulNumFactura, setAnulNumFactura] = useState('');
  const [anulFecha, setAnulFecha] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [resultAnulacion, setResultAnulacion] = useState<any>(null);
  const [showAnulForm, setShowAnulForm] = useState(false);

  // ── Envío (Alta) state ────────────────────────────────────────────────────────
  const [showEnvioForm, setShowEnvioForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultEnvio, setResultEnvio] = useState<any>(null);
  const [envioNumFactura, setEnvioNumFactura] = useState('');
  const [envioFecha, setEnvioFecha] = useState('');
  const [envioBase, setEnvioBase] = useState('');
  const [envioTipoIVA, setEnvioTipoIVA] = useState('21');
  const [envioNifCliente, setEnvioNifCliente] = useState('');
  const [envioNombreCliente, setEnvioNombreCliente] = useState('');
  const [envioDescripcion, setEnvioDescripcion] = useState('Prestación de servicios');

  // ── Envío masivo desde BD ──────────────────────────────────────────────────────
  const [masivoDocs, setMasivoDocs] = useState<any[]>([]);
  const [masivoLoading, setMasivoLoading] = useState(false);
  const [masivoAno, setMasivoAno] = useState(String(new Date().getFullYear()));
  const [masivoTrim, setMasivoTrim] = useState('1');
  const [masivoTipoLibro, setMasivoTipoLibro] = useState('all');
  const [masivoIncluirEnviadas, setMasivoIncluirEnviadas] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [masivoEnviando, setMasivoEnviando] = useState(false);
  const [masivoResultados, setMasivoResultados] = useState<{ id: number; num: string; ok: boolean; msg: string; codigoError?: string; descripcionError?: string }[]>([]);

  // ── Modal de Visión & Edición de Documento SII ─────────────────────────────────
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [editNif, setEditNif] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editPais, setEditPais] = useState('ES');
  const [editTipoFactura, setEditTipoFactura] = useState('F1');
  const [editClaveRegimen, setEditClaveRegimen] = useState('01');
  const [editBase, setEditBase] = useState('');
  const [editCuotaIVA, setEditCuotaIVA] = useState('');

  const [previewKey, setPreviewKey] = useState<number>(Date.now());

  // ── Documentos Locales (Gestor vs SII) ─────────────────────────────────────────
  const [docsLocales, setDocsLocales] = useState<any[]>([]);
  const [loadingDocsLocales, setLoadingDocsLocales] = useState(false);
  const [filterDocsLocalesText, setFilterDocsLocalesText] = useState('');
  const [filterDocsLocalesEnvio, setFilterDocsLocalesEnvio] = useState<'all' | 'enviado' | 'pendiente'>('all');

  const fetchDocsLocales = async () => {
    if (!selectedCompanyIds || selectedCompanyIds.length === 0) return;
    setLoadingDocsLocales(true);
    try {
      const res = await fetch(`/api/sii/documentos-locales?empresa_id=${selectedCompanyIds.join(',')}&año=${ejercicio}`);
      const d = await res.json();
      if (d.success) {
        setDocsLocales(d.documentos || []);
      }
    } catch (e) {
      console.error('Error al cargar documentos locales:', e);
    } finally {
      setLoadingDocsLocales(false);
    }
  };

  useEffect(() => {
    if (tab === 'documentos_locales') {
      fetchDocsLocales();
    }
  }, [tab, selectedCompanyIds, ejercicio]);

  const handleOpenEditModal = (doc: any) => {
    setEditingDoc(doc);
    setPreviewKey(Date.now());
    setEditNif(doc.nif_cliente || doc.identificador_fiscal || '');
    setEditNombre(doc.nombre_cliente || doc.nombre || '');
    setEditPais(doc.pais_cliente || 'ES');
    setEditTipoFactura(doc.tipo_factura || 'F1');
    setEditClaveRegimen(doc.clave_regimen || '01');
    setEditBase(doc.base_imponible?.toString() || '0');
    setEditCuotaIVA(doc.cuota_iva?.toString() || '0');
  };

  const handleSaveDocChanges = async () => {
    if (!editingDoc) return;
    const docId = editingDoc.id;
    const nifLimpio = editNif.trim();
    const nombreLimpio = editNombre.trim();
    const paisLimpio = editPais.trim().toUpperCase();
    const baseNum = parseFloat(editBase) || editingDoc.base_imponible;
    const cuotaNum = parseFloat(editCuotaIVA) || editingDoc.cuota_iva;

    setMasivoDocs(prev => prev.map(d => {
      if (d.id === docId) {
        return {
          ...d,
          nif_cliente: nifLimpio,
          nombre_cliente: nombreLimpio,
          pais_cliente: paisLimpio,
          tipo_factura: editTipoFactura,
          clave_regimen: editClaveRegimen,
          base_imponible: baseNum,
          cuota_iva: cuotaNum,
        };
      }
      return d;
    }));

    try {
      const res = await fetch('/api/sii/guardar-datos-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          nif_cliente: nifLimpio,
          nombre_cliente: nombreLimpio,
          pais_cliente: paisLimpio,
          tipo_factura: editTipoFactura,
          clave_regimen: editClaveRegimen,
          base_imponible: baseNum,
          cuota_iva: cuotaNum
        })
      });

      if (res.ok) {
        toast({ title: '✅ Cambios guardados permanentemente en la base de datos', className: 'bg-emerald-600 text-white' });
      } else {
        toast({ title: '⚠️ Guardado en memoria (error al actualizar BD)', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Error guardando en BD:', err);
      toast({ title: '⚠️ Guardado en memoria (error de red con la BD)', variant: 'destructive' });
    }

    setEditingDoc(null);
  };

  const handleDeleteDoc = (docId: number) => {
    setMasivoDocs(prev => prev.filter(d => d.id !== docId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(docId);
      return next;
    });
    toast({ title: '🗑️ Factura eliminada del lote de envío SII' });
  };

  // ── Load user info ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoadingInfo(true);
        const params = new URLSearchParams();
        if (selectedCompanyIds.length > 0) params.append('empresa_id', selectedCompanyIds.join(','));
        const r = await fetch(`/api/sii/user-info?${params}`);
        if (r.ok) { const d = await r.json(); if (d.success) setUserInfo(d); }
      } finally { setLoadingInfo(false); }
    })();
  }, [selectedCompanyIds]);

  const empresa = userInfo?.empresas?.[0];

  // ── Test certificate ──────────────────────────────────────────────────────────
  const handleTestCert = async (switchTab: boolean = true) => {
    if (!certB64 || !certPass) {
      toast({ title: 'Falta certificado o contraseña', description: 'Carga tus credenciales en la pestaña Certificado Digital', variant: 'destructive' });
      setTab('credenciales');
      return;
    }
    setTestingCert(true); setCertValid(null); setCertInfo(null);
    try {
      const r = await fetch('/api/sii/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificado_pfx: certB64, password: certPass }),
      });
      const d = await r.json();
      setCertValid(d.success);
      if (d.success) {
        setCertInfo(d.details);
        toast({ title: '🏓 Pong! Conexión activa con la AEAT', description: `Certificado válido. Sujeto: ${d.details?.subject || 'OK'}`, className: 'bg-emerald-600 text-white' });
        if (switchTab) setTab('emitidas');
      } else {
        toast({ title: '❌ Conexión fallida con la AEAT', description: d.error || d.mensaje, variant: 'destructive' });
      }
    } catch (e: any) {
      setCertValid(false);
      toast({ title: 'Error de conexión con la AEAT', description: e.message, variant: 'destructive' });
    } finally { setTestingCert(false); }
  };

  // ── Query AEAT direct ─────────────────────────────────────────────────────────
  const handleQuery = async (tipo: 'emitidas' | 'recibidas') => {
    if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
    if (!empresa?.cif) return toast({ title: 'Selecciona una empresa con CIF', variant: 'destructive' });
    setQuerying(true);

    let periodosPayload: string[] = [];
    if (!useEspecificos) {
      if (selectedTrimestres.length > 0) {
        periodosPayload = selectedTrimestres;
      } else {
        periodosPayload = [periodo];
      }
    } else {
      if (selectedMeses.length > 0) {
        periodosPayload = selectedMeses;
      } else if (selectedTrimestres.length > 0) {
        periodosPayload = selectedTrimestres;
      } else {
        periodosPayload = [periodo];
      }
    }

    try {
      const r = await fetch('/api/sii/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificado_pfx: certB64, password: certPass,
          ejercicio, periodo,
          periodos: periodosPayload,
          fechaDesde: (useEspecificos && useFechaRango && fechaDesde) ? fechaDesde : undefined,
          fechaHasta: (useEspecificos && useFechaRango && fechaHasta) ? fechaHasta : undefined,
          empresa_nif: empresa.cif,
          empresa_nombre: empresa.nombre_fiscal || empresa.nombre_de_empresa,
          tipo,
        }),
      });
      const d = await r.json();
      if (tipo === 'emitidas') setResultEmitidas(d);
      else setResultRecibidas(d);
      if (d.success) {
        toast({ title: `✅ Consulta ${tipo} recibida de la AEAT`, className: 'bg-emerald-600 text-white' });
      } else {
        toast({ title: 'Error en consulta', description: d.error, variant: 'destructive' });
      }
    } finally { setQuerying(false); }
  };

  const handleQueryLLAA = async () => {
    if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
    if (!empresa?.cif) return toast({ title: 'Selecciona una empresa con CIF', variant: 'destructive' });
    setQuerying(true);

    console.log('🔍 [handleQueryLLAA] selectedTrimestres:', selectedTrimestres, 'useEspecificos:', useEspecificos, 'selectedMeses:', selectedMeses, 'periodo:', periodo);

    let periodosPayload: string[] = [];
    if (!useEspecificos) {
      if (selectedTrimestres.length > 0) {
        periodosPayload = selectedTrimestres;
      } else {
        periodosPayload = [periodo];
      }
    } else {
      if (selectedMeses.length > 0) {
        periodosPayload = selectedMeses;
      } else if (selectedTrimestres.length > 0) {
        periodosPayload = selectedTrimestres;
      } else {
        periodosPayload = [periodo];
      }
    }

    try {
      const r = await fetch('/api/sii/consulta-llaa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificado_pfx: certB64, password: certPass,
          ejercicio, periodo,
          periodos: periodosPayload,
          empresa_nif: empresa.cif,
          empresa_nombre: empresa.nombre_fiscal || empresa.nombre_de_empresa,
        }),
      });
      const d = await r.json();
      setResultLLAA(d);
      if (!d.success) toast({ title: 'Error en consulta LLAA', description: d.error, variant: 'destructive' });
    } finally { setQuerying(false); }
  };

  // ── Anular factura emitida / recibida ──────────────────────────────────────────
  const [anularTarget, setAnularTarget] = useState<{ num: string; fecha: string; tipoLibro: string; nifEmisor?: string; nombreEmisor?: string } | null>(null);

  const executeAnular = async (numToAnul: string, fechaToAnul: string, tipoLibro = 'emitidas', nifEmisor?: string, nombreEmisor?: string) => {
    if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
    if (!empresa?.cif) return toast({ title: 'Selecciona una empresa con CIF', variant: 'destructive' });

    setAnulando(true); setResultAnulacion(null);
    try {
      const r = await fetch('/api/sii/anular-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificado_pfx: certB64, password: certPass,
          ejercicio, periodo,
          empresa_nif: empresa.cif,
          empresa_nombre: empresa.nombre_fiscal || empresa.nombre_de_empresa,
          numero_factura: numToAnul.trim(),
          fecha_expedicion: fechaToAnul.trim(),
          tipo_libro: tipoLibro,
          nif_emisor: nifEmisor,
          nombre_emisor: nombreEmisor,
        }),
      });
      const d = await r.json();
      setResultAnulacion(d);
      if (d.success) {
        toast({ title: `✅ Factura ${numToAnul} dada de baja / anulada en la AEAT`, className: 'bg-emerald-600 text-white' });
        if (numToAnul === anulNumFactura) {
          setAnulNumFactura(''); setAnulFecha('');
        }
        handleQuery(tab === 'recibidas' ? 'recibidas' : 'emitidas');
      } else {
        toast({ title: '❌ Error al anular factura en la AEAT', description: d.error || d.mensaje, variant: 'destructive' });
      }
    } finally { setAnulando(false); }
  };

  const handleAnular = async (targetNum?: string, targetFecha?: string, nifEmisor?: string, nombreEmisor?: string) => {
    const numToAnul = targetNum || anulNumFactura;
    const fechaToAnul = targetFecha || anulFecha;
    const tipoLibro = tab === 'recibidas' ? 'recibidas' : 'emitidas';

    if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
    if (!empresa?.cif) return toast({ title: 'Selecciona una empresa con CIF', variant: 'destructive' });
    if (!numToAnul?.trim()) return toast({ title: 'Introduce el número de factura', variant: 'destructive' });
    if (!fechaToAnul?.trim()) return toast({ title: 'Introduce la fecha de expedición', variant: 'destructive' });

    setAnularTarget({ num: numToAnul.trim(), fecha: fechaToAnul.trim(), tipoLibro, nifEmisor, nombreEmisor });
  };

  // ── Enviar factura emitida (Alta A0) ──────────────────────────────────────────
  const handleEnviar = async () => {
    if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
    if (!empresa?.cif) return toast({ title: 'Selecciona una empresa con CIF', variant: 'destructive' });
    if (!envioNumFactura.trim() || !envioFecha || !envioBase) {
      return toast({ title: 'Completa los campos obligatorios', description: 'Nº Factura, Fecha y Base Imponible son requeridos', variant: 'destructive' });
    }
    const base = parseFloat(envioBase);
    const tipoIva = parseFloat(envioTipoIVA);
    const cuota = parseFloat((base * tipoIva / 100).toFixed(2));
    setEnviando(true); setResultEnvio(null);
    try {
      const r = await fetch('/api/sii/enviar-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate: certB64, password: certPass,
          factura: {
            nif_empresa: empresa.cif,
            nombre_empresa: empresa.nombre_fiscal || empresa.nombre_de_empresa,
            num_factura: envioNumFactura.trim(),
            fecha_factura: envioFecha,
            base_imponible: base,
            tipo_iva: tipoIva,
            cuota_iva: cuota,
            descripcion: envioDescripcion || 'Prestación de servicios',
            nif_cliente: envioNifCliente || undefined,
            nombre_cliente: envioNombreCliente || undefined,
            tipo_factura: 'F1',
            clave_regimen: '01',
          },
        }),
      });
      const d = await r.json();
      setResultEnvio(d);
      if (d.success) {
        toast({ title: '✅ Factura enviada correctamente a la AEAT', className: 'bg-emerald-600 text-white' });
        setEnvioNumFactura(''); setEnvioFecha(''); setEnvioBase('');
        setEnvioNifCliente(''); setEnvioNombreCliente('');
        setEnvioDescripcion('Prestación de servicios');
      } else {
        toast({ title: '❌ Error al enviar factura a la AEAT', description: d.error, variant: 'destructive' });
      }
    } finally { setEnviando(false); }
  };

  // ── Funciones de Cierre y Carga de Trimestres en el SII ─────────────────────────
  const [cerrandoTrimestre, setCerrandoTrimestre] = useState(false);

  const handleCargarPendientes = async () => {
    setMasivoLoading(true); setMasivoDocs([]); setSelectedIds(new Set()); setMasivoResultados([]);
    try {
      const params = new URLSearchParams();
      if (masivoTipoLibro) params.append('tipo_libro', masivoTipoLibro);
      if (ejercicio && ejercicio !== 'all') params.append('año', ejercicio);

      if (selectedTrimestres.length > 0) {
        params.append('trimestres', selectedTrimestres.join(','));
      } else if (periodo && periodo !== '00') {
        params.append('trimestre', periodo);
      }

      if (useEspecificos) {
        if (selectedMeses.length > 0) params.append('meses', selectedMeses.join(','));
        if (useFechaRango) {
          if (fechaDesde) params.append('fecha_desde', fechaDesde);
          if (fechaHasta) params.append('fecha_hasta', fechaHasta);
        }
      }

      if (masivoIncluirEnviadas) params.append('incluir_enviadas', 'true');
      if (empresa?.id) params.append('empresa_id', String(empresa.id));

      const r = await fetch(`/api/trimestres/documentos-sii?${params}`);
      const d = await r.json();
      if (d.success) {
        const docs = d.documentos || [];
        setMasivoDocs(docs);
        const cerrados = docs.filter((doc: any) => doc.trimestre_cerrado || doc.enviado_sii).map((doc: any) => doc.id);
        setSelectedIds(new Set(cerrados));
        if (docs.length === 0) toast({ title: 'No se encontraron facturas con los filtros seleccionados', className: 'bg-slate-700 text-white' });
      } else toast({ title: 'Error al cargar', description: d.error, variant: 'destructive' });
    } finally { setMasivoLoading(false); }
  };

  const handleCerrarTrimestre = async (ano?: number, trim?: number) => {
    if (!empresa?.id) return toast({ title: 'Selecciona una empresa primero', variant: 'destructive' });
    setCerrandoTrimestre(true);
    try {
      const targets: { ano: number; trim: number }[] = [];
      if (ano && trim) {
        targets.push({ ano, trim });
      } else {
        const setMap = new Set<string>();
        masivoDocs.forEach((doc: any) => {
          if (!doc.trimestre_cerrado && doc.año_trimestre && doc.num_trimestre) {
            setMap.add(`${doc.año_trimestre}-${doc.num_trimestre}`);
          }
        });
        setMap.forEach(item => {
          const [a, t] = item.split('-');
          targets.push({ ano: parseInt(a), trim: parseInt(t) });
        });
      }

      if (targets.length === 0) {
        return toast({ title: 'No hay trimestres abiertos para cerrar' });
      }

      let cerradosCount = 0;
      for (const target of targets) {
        const r = await fetch('/api/trimestres/cerrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            año: target.ano,
            trimestre: target.trim,
            empresa_id: Number(empresa.id),
          }),
        });
        const d = await r.json();
        if (d.success) cerradosCount++;
      }

      if (cerradosCount > 0) {
        toast({
          title: '✅ Trimestre(s) cerrado(s) correctamente',
          description: 'Las facturas ahora están listas para ser enviadas a la AEAT.',
          className: 'bg-emerald-600 text-white',
        });
        await handleCargarPendientes();
      } else {
        toast({ title: 'No se pudieron cerrar los trimestres', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error de conexión', description: err.message, variant: 'destructive' });
    } finally {
      setCerrandoTrimestre(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">

        {/* Modern Page Header */}
        <PageHeader
          title="SII AEAT — Libros Registro"
          mobileTitle="SII AEAT"
          icon={Landmark}
        >
          <div className="flex flex-wrap items-center gap-2">
            {/* Cert status pill */}
            <button
              type="button"
              disabled={testingCert}
              onClick={() => handleTestCert(false)}
              title="Haz clic para comprobar la conexión con la AEAT (Ping)"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border shadow-sm backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                certValid === true
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : certValid === false
                  ? 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              {testingCert ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : certValid === true ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              ) : certValid === false ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span>
                {testingCert
                  ? 'Comprobando conexión...'
                  : certValid === true
                  ? 'Certificado Conectado'
                  : certValid === false
                  ? 'Certificado Inválido'
                  : 'Certificado Pendiente'}
              </span>
              <RefreshCw className={`h-3 w-3 ml-0.5 opacity-70 ${testingCert ? 'animate-spin' : ''}`} />
            </button>

            {/* Environment Badge */}
            <Badge variant="outline" className="font-mono text-xs py-1 px-3 border-primary/20 bg-primary/5 text-primary">
              <Globe className="h-3 w-3 mr-1" />
              AEAT PRUEBAS
            </Badge>
          </div>
        </PageHeader>

        {/* Top Summary Stats Cards Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card border-border/60 shadow-sm p-4 flex items-center justify-between rounded-xl">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Facturas Pendientes</p>
              <p className="text-2xl font-bold text-amber-500 mt-1">{userInfo?.estadisticas?.pendientes ?? 0}</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Lock className="h-5 w-5 text-amber-500" />
            </div>
          </Card>

          <Card className="bg-card border-border/60 shadow-sm p-4 flex items-center justify-between rounded-xl">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Registrados en AEAT</p>
              <p className="text-2xl font-bold text-emerald-500 mt-1">{userInfo?.estadisticas?.enviados ?? 0}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </Card>

          <Card className="bg-card border-border/60 shadow-sm p-4 flex items-center justify-between rounded-xl">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Empresa Seleccionada</p>
              <p className="text-sm font-bold text-foreground truncate max-w-[180px] mt-1">{empresa?.nombre_fiscal || empresa?.nombre_de_empresa || 'No seleccionada'}</p>
              {empresa?.cif && <p className="text-xs font-mono text-muted-foreground">NIF: {empresa.cif}</p>}
            </div>
            <div className="p-3 bg-primary/10 rounded-xl">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </Card>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex flex-wrap gap-1.5 p-1.5 bg-muted/50 rounded-xl border border-border/60 backdrop-blur-md">
          {([
            { key: 'credenciales', label: 'Certificado Digital', icon: ShieldCheck },
            { key: 'enviar', label: 'Enviar a la AEAT', icon: Send },
            { key: 'documentos_locales', label: 'Documentos Gestor', icon: FileText },
            { key: 'emitidas', label: 'Facturas Emitidas', icon: ArrowUpCircle },
            { key: 'recibidas', label: 'Facturas Recibidas', icon: ArrowDownCircle },
            { key: 'llaa', label: 'Estado Envíos (LLAA)', icon: BookOpen },
          ] as { key: TabKey; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 min-w-[140px] sm:min-w-[170px] px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
                  active
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border/80 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* MAIN CONTENT AREA */}
        <main className="space-y-6">

            {/* ── TAB: CERTIFICADO ── */}
            {tab === 'credenciales' && (
              <div className="space-y-4">
                <SectionHeader title="Identificación y Certificado Digital" subtitle="Introduce tu certificado (.p12/.pfx) y contraseña para operar con el SII de la AEAT" />

                <Card className="border border-border shadow-sm bg-card rounded-xl">
                  <CardContent className="p-6 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-foreground">
                          Certificado Digital (.p12 / .pfx)
                        </label>
                        <input
                          type="file"
                          accept=".pfx,.p12"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const b64 = ev.target?.result?.toString().split(',')[1];
                              if (b64) { setCertB64(b64); setCertValid(null); setCertInfo(null); }
                            };
                            reader.readAsDataURL(f);
                          }}
                          className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer bg-background rounded-lg border border-input p-2 transition-colors"
                        />
                        {certB64 && <p className="text-xs text-emerald-500 font-medium flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Certificado cargado en memoria</p>}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-foreground">
                          Contraseña del Certificado
                        </label>
                        <input
                          type="password"
                          value={certPass}
                          onChange={(e) => { setCertPass(e.target.value); setCertValid(null); }}
                          placeholder="Contraseña del certificado"
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleTestCert}
                      disabled={testingCert || !certB64 || !certPass}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-2.5 shadow-sm transition-all rounded-lg"
                    >
                      {testingCert
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Validando con AEAT...</>
                        : <><ShieldCheck className="h-4 w-4 mr-2" />Validar Certificado y Conectar</>}
                    </Button>

                    {certValid === true && certInfo && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5 text-xs text-foreground">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          Conexión establecida con los servidores de la AEAT
                        </p>
                        {certInfo.certificate && <>
                          <p><span className="text-muted-foreground">Titular:</span> <strong>{certInfo.certificate.subject}</strong></p>
                          <p><span className="text-muted-foreground">Emisor:</span> {certInfo.certificate.issuer}</p>
                          <p><span className="text-muted-foreground">Válido hasta:</span> {new Date(certInfo.certificate.validTo).toLocaleDateString('es-ES')}</p>
                          <p><span className="text-muted-foreground">Nº Serie:</span> <span className="font-mono">{certInfo.certificate.serialNumber}</span></p>
                        </>}
                        <p className="mt-2 text-emerald-600 dark:text-emerald-400 font-medium">Ya puedes consultar o registrar facturas en los Libros Registro.</p>
                      </div>
                    )}

                    {certValid === false && (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-medium flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        El certificado no pudo ser validado. Comprueba el archivo y la contraseña.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── TAB: ENVIAR A AEAT (Envío masivo desde BD) ── */}
            {tab === 'enviar' && (
              <div className="space-y-4">
                <SectionHeader title="Enviar Facturas a la AEAT" subtitle="SuministroLRFacturasEmitidas · Alta A0 desde registros internos" />

                <FilterBar
                  ejercicio={ejercicio} setEjercicio={setEjercicio}
                  periodo={periodo} setPeriodo={setPeriodo}
                  selectedTrimestres={selectedTrimestres} setSelectedTrimestres={setSelectedTrimestres}
                  useEspecificos={useEspecificos} setUseEspecificos={setUseEspecificos}
                  selectedMeses={selectedMeses} setSelectedMeses={setSelectedMeses}
                  useFechaRango={useFechaRango} setUseFechaRango={setUseFechaRango}
                  fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
                  fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
                  certValid={certValid} onQuery={handleCargarPendientes} querying={masivoLoading} label="Cargar Facturas para Envío"
                  extraControls={
                    <div className="flex flex-wrap items-center gap-4 border-t border-border/40 pt-3 w-full">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-muted-foreground">Libro / Tipo Documento</label>
                        <select value={masivoTipoLibro} onChange={e => setMasivoTipoLibro(e.target.value)}
                          className="w-56 px-3 py-1 border border-input rounded-lg text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                          <option value="all">Todas (Emitidas + Recibidas)</option>
                          <option value="emitidas">Solo Emitidas (Ventas)</option>
                          <option value="recibidas">Solo Recibidas (Compras)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground select-none">
                          <input
                            type="checkbox"
                            checked={masivoIncluirEnviadas}
                            onChange={(e) => setMasivoIncluirEnviadas(e.target.checked)}
                            className="w-4 h-4 rounded border-input text-primary accent-primary cursor-pointer"
                          />
                          <span>Incluir ya enviadas (Reenviar a la AEAT)</span>
                        </label>
                      </div>
                    </div>
                  }
                />

                {/* Banner de aviso sobre trimestres abiertos */}
                {masivoDocs.length > 0 && masivoDocs.some((d: any) => !d.trimestre_cerrado) && (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-300 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <p className="font-bold text-sm">⚠️ Existen facturas pertenecientes a trimestres abiertos</p>
                        <p className="mt-0.5 text-amber-800 dark:text-amber-400">
                          Para poder enviar facturas a la AEAT es necesario cerrar su trimestre contable correspondiente. Podés cerrarlos directamente desde aquí con un clic.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={cerrandoTrimestre}
                      onClick={() => handleCerrarTrimestre()}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 text-xs gap-1.5 shadow-sm"
                    >
                      {cerrandoTrimestre ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                      Cerrar Trimestres Abiertos
                    </Button>
                  </div>
                )}

                {/* Tabla de facturas con checkboxes */}
                {masivoDocs.length > 0 && (
                  <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
                    <CardHeader className="px-4 py-3.5 border-b border-border bg-muted/40 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        {masivoDocs.length} facturas pendientes de envío
                        <Badge variant="secondary" className="ml-1 font-mono">{selectedIds.size} seleccionadas</Badge>
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedIds(new Set(masivoDocs.filter((d: any) => d.trimestre_cerrado).map((d: any) => d.id)))}>
                          Seleccionar cerradas
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedIds(new Set())}>
                          Deseleccionar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/60 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider border-b border-border">
                            <tr>
                              <th className="p-3 w-8"></th>
                              <th className="p-3">Nº Factura</th>
                              <th className="p-3">Fecha</th>
                              <th className="p-3">Tipo</th>
                              <th className="p-3">NIF Cliente</th>
                              <th className="p-3">Cliente</th>
                              <th className="p-3 text-right">Base</th>
                              <th className="p-3 text-right">IVA</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3">Estado / Trimestre</th>
                              <th className="p-3 text-center">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {masivoDocs.map((doc: any) => {
                              const resultado = masivoResultados.find(r => r.id === doc.id);
                              const checked = selectedIds.has(doc.id);
                              const canSelect = (!resultado) && (doc.trimestre_cerrado || doc.enviado_sii || masivoIncluirEnviadas);

                              return (
                                <tr key={doc.id} className={`hover:bg-muted/30 transition-colors ${
                                  !doc.trimestre_cerrado ? 'bg-muted/10' :
                                  resultado?.ok ? 'bg-emerald-500/5' :
                                  resultado ? 'bg-destructive/5' : ''
                                }`}>
                                  <td className="p-3">
                                    <input type="checkbox" checked={checked} disabled={!canSelect}
                                      onChange={e => {
                                        const next = new Set(selectedIds);
                                        e.target.checked ? next.add(doc.id) : next.delete(doc.id);
                                        setSelectedIds(next);
                                      }}
                                      className="w-4 h-4 rounded border-input text-primary accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
                                  </td>
                                  <td className="p-3 font-mono font-bold text-foreground">
                                    <button
                                      onClick={() => handleOpenEditModal(doc)}
                                      className="hover:underline text-primary font-bold flex items-center gap-1 text-left"
                                      title="Click para ver documento y editar"
                                    >
                                      {doc.num_factura || doc.numero_documento || 'N/A'}
                                    </button>
                                  </td>
                                  <td className="p-2.5 text-slate-600 dark:text-slate-400">{doc.fecha_factura ? new Date(doc.fecha_factura).toLocaleDateString('es-ES') : '-'}</td>
                                  <td className="p-2.5 text-slate-500 truncate max-w-[80px]">{doc.tipo_documento}</td>
                                  <td className="p-2.5 font-mono text-slate-500">{doc.nif_cliente || '-'}</td>
                                  <td className="p-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{doc.nombre_cliente || '-'}</td>
                                  <td className="p-2.5 text-right font-mono">{parseFloat(doc.base_imponible || 0).toFixed(2)} €</td>
                                  <td className="p-2.5 text-right font-mono text-slate-500">{parseFloat(doc.cuota_iva || 0).toFixed(2)} €</td>
                                  <td className="p-2.5 text-right font-mono font-semibold">{(parseFloat(doc.base_imponible || 0) + parseFloat(doc.cuota_iva || 0)).toFixed(2)} €</td>
                                  <td className="p-2.5">
                                    {resultado ? (
                                      <Badge variant={resultado.ok ? 'default' : 'destructive'} className="text-[10px]">
                                        {resultado.ok ? '✅ Enviado' : '❌ Error'}
                                      </Badge>
                                    ) : !doc.trimestre_cerrado ? (
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 text-[10px] gap-1">
                                          <AlertTriangle className="h-3 w-3 shrink-0" />
                                          Abierto
                                        </Badge>
                                        {doc.año_trimestre && doc.num_trimestre && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={cerrandoTrimestre}
                                            onClick={() => handleCerrarTrimestre(doc.año_trimestre, doc.num_trimestre)}
                                            className="h-6 px-2 text-[10px] text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                                            title={`Cerrar T${doc.num_trimestre} ${doc.año_trimestre}`}
                                          >
                                            {cerrandoTrimestre ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3 mr-1 inline" />}
                                            Cerrar T{doc.num_trimestre}
                                          </Button>
                                        )}
                                      </div>
                                    ) : doc.enviado_sii ? (
                                      <Badge variant="outline" className="border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] w-fit">
                                        ✅ Ya Enviada (Re-envío)
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-[10px] w-fit">
                                        🔒 Listo (Trimestre cerrado)
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleOpenEditModal(doc)}
                                        className="h-7 w-7 p-0 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-400"
                                        title="Ver documento y editar datos SII"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDeleteDoc(doc.id)}
                                        className="h-7 w-7 p-0 text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400"
                                        title="Quitar de la lista SII"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>

                    {/* Barra de acción */}
                    <div className="px-4 py-3.5 border-t border-border bg-muted/40 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">
                        {selectedIds.size} de {masivoDocs.length} facturas seleccionadas para envío
                      </p>
                      <Button
                        onClick={async () => {
                          if (!certB64 || !certPass) return toast({ title: 'Debes validar tu certificado primero', variant: 'destructive' });
                          if (selectedIds.size === 0) return toast({ title: 'Seleccioná al menos una factura', variant: 'destructive' });
                          setMasivoEnviando(true);
                          const docsSelec = masivoDocs.filter((d: any) => selectedIds.has(d.id));
                          const resultados: typeof masivoResultados = [];
                          const enviados: number[] = [];

                          for (const doc of docsSelec) {
                            try {
                              const r = await fetch('/api/sii/enviar-factura', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  certificate: certB64, password: certPass,
                                  factura: {
                                    id: doc.id,
                                    empresaId: doc.id_de_empresa || empresa?.id,
                                    nif_empresa: doc.nif_empresa || empresa?.cif,
                                    nombre_empresa: doc.nombre_empresa || empresa?.nombre_fiscal || empresa?.nombre_de_empresa,
                                    num_factura: doc.num_factura || doc.numero_documento,
                                    fecha_factura: doc.fecha_factura,
                                    base_imponible: parseFloat(doc.base_imponible),
                                    tipo_iva: parseFloat(doc.tipo_iva),
                                    cuota_iva: parseFloat(doc.cuota_iva),
                                    tipo_documento: doc.tipo_documento,
                                    descripcion: doc.descripcion || doc.tipo_documento || 'Factura',
                                    nif_cliente: doc.nif_cliente || undefined,
                                    nombre_cliente: doc.nombre_cliente || undefined,
                                    pais_cliente: doc.pais_cliente || 'ES',
                                    tipo_factura: doc.tipo_factura || 'F1',
                                    clave_regimen: doc.clave_regimen || '01',
                                  },
                                }),
                              });
                              const d = await r.json();
                              if (d.success) {
                                resultados.push({ id: doc.id, num: doc.num_factura || doc.numero_documento, ok: true, msg: d.respuesta?.csv || 'Correcto' });
                                enviados.push(doc.id);
                              } else {
                                const rawRespuestaLinea = Array.isArray(d.respuestaAEAT?.RespuestaLinea) 
                                  ? d.respuestaAEAT?.RespuestaLinea?.[0] 
                                  : d.respuestaAEAT?.RespuestaLinea;
                                const aeatDetalle = d.respuesta?.detalles?.[0] || rawRespuestaLinea;
                                
                                const codigoErr = aeatDetalle?.codigoError || aeatDetalle?.CodigoErrorRegistro || (aeatDetalle?.errores?.[0]?.codigo);
                                let descErr = aeatDetalle?.descripcionError || aeatDetalle?.DescripcionErrorRegistro || (aeatDetalle?.errores?.[0]?.descripcion);
                                
                                const estadoDup = rawRespuestaLinea?.RegistroDuplicado?.EstadoRegistro;
                                if (estadoDup) {
                                  descErr = `${descErr || 'Factura duplicada'} (Estado en AEAT: ${estadoDup})`;
                                } else if (!descErr || descErr === 'Algunas facturas fueron rechazadas') {
                                  descErr = d.mensaje || d.error || 'Error en validación AEAT';
                                }

                                const prefix = codigoErr ? `[Error ${codigoErr}] ` : '';
                                const fullMsg = `${prefix}${descErr}`;

                                resultados.push({
                                  id: doc.id,
                                  num: doc.num_factura || doc.numero_documento,
                                  ok: false,
                                  msg: fullMsg,
                                  codigoError: codigoErr ? String(codigoErr) : undefined,
                                  descripcionError: descErr ? String(descErr) : undefined,
                                });
                              }
                            } catch (err: any) {
                              resultados.push({ id: doc.id, num: doc.num_factura || doc.numero_documento, ok: false, msg: err.message });
                            }
                          }

                          // Marcar en BD las que fueron enviadas OK
                          if (enviados.length > 0) {
                            await fetch('/api/sii/marcar-enviado', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ids: enviados }),
                            });
                          }

                          setMasivoResultados(resultados);
                          setMasivoEnviando(false);
                          const ok = resultados.filter(r => r.ok).length;
                          const fail = resultados.filter(r => !r.ok).length;
                          toast({
                            title: ok > 0 ? `✅ ${ok} facturas enviadas a la AEAT` : '❌ Todas fallaron',
                            description: fail > 0 ? `${fail} no pudieron enviarse` : undefined,
                            className: ok > 0 ? 'bg-emerald-600 text-white' : undefined,
                            variant: ok === 0 ? 'destructive' : undefined,
                          });
                        }}
                        disabled={masivoEnviando || certValid !== true || selectedIds.size === 0}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-sm transition-all rounded-lg"
                      >
                        {masivoEnviando
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando {selectedIds.size} facturas...</>
                          : <><Send className="h-4 w-4 mr-2" />Enviar {selectedIds.size} facturas a la AEAT</>}
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Resumen de resultados */}
                {masivoResultados.length > 0 && (
                  <Card className="border border-slate-300 dark:border-slate-700 shadow-sm">
                    <CardHeader className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300">Resumen del Proceso de Envío</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex gap-4 text-sm mb-3">
                        <span className="text-emerald-600 font-semibold">✅ Enviadas: {masivoResultados.filter(r => r.ok).length}</span>
                        <span className="text-red-600 font-semibold">❌ Errores: {masivoResultados.filter(r => !r.ok).length}</span>
                      </div>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {masivoResultados.map(r => (
                          <div key={r.id} className={`flex items-start gap-2 text-xs p-2 rounded ${
                            r.ok ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                          }`}>
                            <span className="font-mono font-bold shrink-0">{r.num}</span>
                            <span>{r.ok ? `CSV: ${r.msg}` : r.msg}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── TAB: DOCUMENTOS LOCALES (GESTOR VS SII) ── */}
            {tab === 'documentos_locales' && (() => {
              const filteredDocsLocales = docsLocales.filter(doc => {
                const textMatch = !filterDocsLocalesText || 
                  doc.numero_documento?.toLowerCase().includes(filterDocsLocalesText.toLowerCase()) ||
                  doc.contraparte_nombre?.toLowerCase().includes(filterDocsLocalesText.toLowerCase()) ||
                  doc.contraparte_nif?.toLowerCase().includes(filterDocsLocalesText.toLowerCase());

                const envioMatch = filterDocsLocalesEnvio === 'all' ||
                  (filterDocsLocalesEnvio === 'enviado' && doc.enviado_sii) ||
                  (filterDocsLocalesEnvio === 'pendiente' && !doc.enviado_sii);

                return textMatch && envioMatch;
              });

              return (
                <div className="space-y-4">
                  <SectionHeader
                    title="Sincronización de Documentos Locales (Gestor vs AEAT)"
                    subtitle="Documentos guardados en el Gestor con su estado de ejercicio, cierre trimestral y estado de envío al SII"
                  />

                  <Card className="bg-card border border-border/60 shadow-sm p-4 sm:p-5 rounded-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Buscar por nº factura, contraparte o NIF..."
                            value={filterDocsLocalesText}
                            onChange={(e) => setFilterDocsLocalesText(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <select
                          value={filterDocsLocalesEnvio}
                          onChange={(e: any) => setFilterDocsLocalesEnvio(e.target.value)}
                          className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-medium focus:outline-none"
                        >
                          <option value="all">Todos los envíos SII</option>
                          <option value="enviado">Solo Enviados a AEAT</option>
                          <option value="pendiente">Solo Pendientes de Envío</option>
                        </select>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={fetchDocsLocales}
                        disabled={loadingDocsLocales}
                        className="text-xs gap-1.5"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingDocsLocales ? 'animate-spin' : ''}`} />
                        Actualizar Lista
                      </Button>
                    </div>

                    {loadingDocsLocales ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                        <span className="text-xs text-muted-foreground">Cargando documentos del gestor...</span>
                      </div>
                    ) : filteredDocsLocales.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-border rounded-xl">
                        <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">No se encontraron documentos locales</p>
                        <p className="text-xs text-muted-foreground mt-1">Intenta cambiando los filtros o la empresa seleccionada.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-border rounded-xl">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/60 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider border-b border-border">
                            <tr>
                              <th className="p-3">Nº Factura / Doc</th>
                              <th className="p-3">Fecha Emisión</th>
                              <th className="p-3">Contraparte (NIF / Nombre)</th>
                              <th className="p-3 text-right">Base Imponible</th>
                              <th className="p-3 text-right">Cuota IVA</th>
                              <th className="p-3 text-right">Importe Total</th>
                              <th className="p-3 text-center">Ejercicio / Trimestre</th>
                              <th className="p-3 text-center">Estado Trimestre (Gestor)</th>
                              <th className="p-3 text-center">Estado Envío SII</th>
                              <th className="p-3 text-center">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {filteredDocsLocales.map((doc: any) => (
                              <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3 font-mono font-bold text-foreground">
                                  {doc.numero_documento}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {doc.fecha_emision}
                                </td>
                                <td className="p-3">
                                  <span className="block text-foreground font-medium">{doc.contraparte_nombre}</span>
                                  <span className="font-mono text-[11px] text-muted-foreground">{doc.contraparte_nif}</span>
                                </td>
                                <td className="p-3 text-right font-mono text-muted-foreground">
                                  {doc.base_imponible.toFixed(2)} €
                                </td>
                                <td className="p-3 text-right font-mono text-muted-foreground">
                                  {doc.cuota_iva.toFixed(2)} €
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                  {doc.importe_total.toFixed(2)} €
                                </td>
                                <td className="p-3 text-center font-mono font-semibold">
                                  <Badge variant="outline" className="font-mono text-[11px]">
                                    {doc.año_trimestre} - T{doc.num_trimestre}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-medium border ${
                                      doc.estado_trimestre === 'Cerrado'
                                        ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30'
                                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                    }`}
                                  >
                                    {doc.estado_trimestre}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-semibold border ${
                                      doc.enviado_sii
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                    }`}
                                  >
                                    {doc.enviado_sii ? '✅ Enviado a AEAT' : '⏳ Pendiente'}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center">
                                  {!doc.enviado_sii ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setTab('enviar');
                                        setMasivoAno(String(doc.año_trimestre));
                                        setMasivoTrim(String(doc.num_trimestre));
                                      }}
                                      className="h-7 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                                    >
                                      <Send className="h-3 w-3 mr-1" />
                                      Preparar Envío
                                    </Button>
                                  ) : (
                                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                      Registrado
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })()}

            {/* ── TAB: EMITIDAS ── */}
            {tab === 'emitidas' && (
              <div className="space-y-4">
                <SectionHeader title="Libro Registro de Facturas Emitidas" subtitle="ConsultaLRFacturasEmitidas · Endpoint: /ws/fe/SiiFactFEV1SOAP" />
                <FilterBar
                  ejercicio={ejercicio} setEjercicio={setEjercicio}
                  periodo={periodo} setPeriodo={setPeriodo}
                  selectedTrimestres={selectedTrimestres} setSelectedTrimestres={setSelectedTrimestres}
                  useEspecificos={useEspecificos} setUseEspecificos={setUseEspecificos}
                  selectedMeses={selectedMeses} setSelectedMeses={setSelectedMeses}
                  useFechaRango={useFechaRango} setUseFechaRango={setUseFechaRango}
                  fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
                  fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
                  certValid={certValid}
                  onQuery={() => handleQuery('emitidas')} querying={querying} label="Consultar Facturas Emitidas"
                />
                {resultEmitidas && <ResultPanel result={resultEmitidas} onAnular={(num, fecha, nifEmisor, nombreEmisor) => handleAnular(num, fecha, nifEmisor, nombreEmisor)} />}

                {/* ───── Enviar / Alta de Factura ───── */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <button
                    onClick={() => setShowEnvioForm(v => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {showEnvioForm ? 'Ocultar formulario de envío' : 'Dar de alta / Enviar una nueva factura a la AEAT'}
                  </button>

                  {showEnvioForm && (
                    <Card className="mt-3 border border-emerald-200 dark:border-emerald-900 shadow-sm">
                      <CardHeader className="px-4 py-3 border-b border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <CardTitle className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Alta de Factura Emitida — TipoComunicacion: A0 (entorno: PRUEBAS)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Rellena los datos de la factura. Se enviará al Libro Registro de la AEAT en el entorno de pruebas. Podrás anularla después con el formulario de abajo.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Nº Factura *</label>
                            <input value={envioNumFactura} onChange={e => setEnvioNumFactura(e.target.value)}
                              placeholder="Ej: F-2026-001"
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Fecha Expedición *</label>
                            <input type="date" value={envioFecha} onChange={e => setEnvioFecha(e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Base Imponible (€) *</label>
                            <input type="number" step="0.01" value={envioBase} onChange={e => setEnvioBase(e.target.value)}
                              placeholder="1000.00"
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Tipo IVA (%)</label>
                            <select value={envioTipoIVA} onChange={e => setEnvioTipoIVA(e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                              <option value="21">21% — General</option>
                              <option value="10">10% — Reducido</option>
                              <option value="4">4% — Superreducido</option>
                              <option value="0">0% — Exento</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">NIF Cliente (opcional)</label>
                            <input value={envioNifCliente} onChange={e => setEnvioNifCliente(e.target.value)}
                              placeholder="Ej: B12345678"
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Nombre Cliente (opcional)</label>
                            <input value={envioNombreCliente} onChange={e => setEnvioNombreCliente(e.target.value)}
                              placeholder="Razón Social S.L."
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Descripción</label>
                            <input value={envioDescripcion} onChange={e => setEnvioDescripcion(e.target.value)}
                              placeholder="Prestación de servicios"
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                          </div>
                          <div className="space-y-1 flex items-end">
                            <Button
                              onClick={handleEnviar}
                              disabled={enviando || certValid !== true || !envioNumFactura || !envioFecha || !envioBase}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-9 px-5"
                            >
                              {enviando
                                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</>
                                : <><Send className="h-4 w-4 mr-2" />Enviar a la AEAT</>}
                            </Button>
                          </div>
                        </div>

                        {/* Preview cuota en tiempo real */}
                        {envioBase && parseFloat(envioBase) > 0 && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-600 dark:text-slate-400 flex gap-6">
                            <span>Base: <strong>{parseFloat(envioBase).toFixed(2)} €</strong></span>
                            <span>Cuota IVA ({envioTipoIVA}%): <strong>{(parseFloat(envioBase) * parseFloat(envioTipoIVA) / 100).toFixed(2)} €</strong></span>
                            <span>Total: <strong>{(parseFloat(envioBase) * (1 + parseFloat(envioTipoIVA) / 100)).toFixed(2)} €</strong></span>
                          </div>
                        )}

                        {resultEnvio && (
                          <div className={`p-3 rounded border text-xs ${
                            resultEnvio.success
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                          }`}>
                            {resultEnvio.success
                              ? <><CheckCircle className="h-3.5 w-3.5 inline mr-1" />Factura registrada. {resultEnvio.mensaje} {resultEnvio.respuesta?.csv && <span className="font-mono ml-2">CSV: {resultEnvio.respuesta.csv}</span>}</>
                              : <><XCircle className="h-3.5 w-3.5 inline mr-1" />{resultEnvio.error || resultEnvio.mensaje}</>
                            }
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* ───── Anulación / Baja de Factura ───── */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <button
                    onClick={() => setShowAnulForm(v => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    {showAnulForm ? 'Ocultar formulario de anulación' : 'Anular / Dar de baja una factura enviada'}
                  </button>

                  {showAnulForm && (
                    <Card className="mt-3 border border-red-200 dark:border-red-900 shadow-sm">
                      <CardHeader className="px-4 py-3 border-b border-red-100 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
                        <CardTitle className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Anulación / Baja de Factura Emitida (entorno: PRUEBAS)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Introduce los datos de identificación de la factura que querés anular. Debe coincidir exactamente con lo enviado a la AEAT (NIF emisor, Nº factura y Fecha).
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Ejercicio</label>
                            <input value={ejercicio} onChange={e => setEjercicio(e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-400"
                              placeholder="2026" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Periodo (Mes)</label>
                            <select value={periodo} onChange={e => setPeriodo(e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-400">
                              {Array.from({ length: 12 }, (_, i) => {
                                const v = String(i + 1).padStart(2, '0');
                                const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
                                return <option key={v} value={v}>{v} – {meses[i]}</option>;
                              })}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Nº Factura (exacto)</label>
                            <input
                              value={anulNumFactura}
                              onChange={e => setAnulNumFactura(e.target.value)}
                              placeholder="Ej: F-2026-001"
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-400 font-mono"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Fecha de Expedición (YYYY-MM-DD)</label>
                            <input
                              type="date"
                              value={anulFecha}
                              onChange={e => setAnulFecha(e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          </div>
                          <div className="space-y-1 flex items-end">
                            <Button
                              onClick={() => handleAnular()}
                              disabled={anulando || certValid !== true || !anulNumFactura || !anulFecha}
                              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold h-9 px-5"
                            >
                              {anulando
                                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Anulando.....</>
                                : <><Trash2 className="h-4 w-4 mr-2" />Anular en AEAT</>}
                            </Button>
                          </div>
                        </div>

                        {resultAnulacion && (
                          <div className={`p-3 rounded border text-xs font-mono ${
                            resultAnulacion.success
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                          }`}>
                            {resultAnulacion.success
                              ? <><CheckCircle className="h-3.5 w-3.5 inline mr-1" />Anulación aceptada por la AEAT. Estado: {JSON.stringify(resultAnulacion.resultado?.EstadoEnvio || resultAnulacion.resultado?.RespuestaLinea?.[0]?.EstadoRegistro || 'Correcto')}</>
                              : <><XCircle className="h-3.5 w-3.5 inline mr-1" />{resultAnulacion.error}</>
                            }
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: RECIBIDAS ── */}
            {tab === 'recibidas' && (
              <div className="space-y-4">
                <SectionHeader title="Libro Registro de Facturas Recibidas" subtitle="ConsultaLRFacturasRecibidas · Endpoint: /ws/fr/SiiFactFRV1SOAP" />
                <FilterBar
                  ejercicio={ejercicio} setEjercicio={setEjercicio}
                  periodo={periodo} setPeriodo={setPeriodo}
                  selectedTrimestres={selectedTrimestres} setSelectedTrimestres={setSelectedTrimestres}
                  useEspecificos={useEspecificos} setUseEspecificos={setUseEspecificos}
                  selectedMeses={selectedMeses} setSelectedMeses={setSelectedMeses}
                  useFechaRango={useFechaRango} setUseFechaRango={setUseFechaRango}
                  fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
                  fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
                  certValid={certValid}
                  onQuery={() => handleQuery('recibidas')} querying={querying} label="Consultar Facturas Recibidas"
                />
                {resultRecibidas && <ResultPanel result={resultRecibidas} onAnular={(num, fecha, nifEmisor, nombreEmisor) => handleAnular(num, fecha, nifEmisor, nombreEmisor)} />}
              </div>
            )}

            {/* ── TAB: LLAA ── */}
            {tab === 'llaa' && (
              <div className="space-y-4">
                <SectionHeader title="Estado de Envíos — Libros Registro (LLAA)" subtitle="ConsultaLLAA · Endpoint: /ws/llaa/SiiLLAAV1SOAP" />
                <FilterBar
                  ejercicio={ejercicio} setEjercicio={setEjercicio}
                  periodo={periodo} setPeriodo={setPeriodo}
                  selectedTrimestres={selectedTrimestres} setSelectedTrimestres={setSelectedTrimestres}
                  useEspecificos={useEspecificos} setUseEspecificos={setUseEspecificos}
                  selectedMeses={selectedMeses} setSelectedMeses={setSelectedMeses}
                  useFechaRango={useFechaRango} setUseFechaRango={setUseFechaRango}
                  fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
                  fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
                  certValid={certValid}
                  onQuery={handleQueryLLAA} querying={querying} label="Consultar Estado Envíos (LLAA)"
                />
                {resultLLAA && <ResultPanel result={resultLLAA} />}
              </div>
            )}

            {/* ── Modal de Visión & Edición de Documento SII ── */}
            {editingDoc && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                          Visor & Edición de Datos SII — Factura {editingDoc.num_factura || editingDoc.numero_documento || editingDoc.id}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Verificá la vista previa del documento y ajustá el NIF, Nombre, País o Tipo de Factura antes de enviar a la AEAT
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setEditingDoc(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Body Grid: Left = Preview Image, Right = Form */}
                  <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Image Preview */}
                    <div className="lg:col-span-7 bg-slate-100 dark:bg-slate-950 p-4 rounded-lg flex flex-col items-center justify-between border border-slate-200 dark:border-slate-800 min-h-[420px] relative">
                      <div className="w-full flex justify-between items-center mb-2 px-1">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Página 1 / Documento #{editingDoc.id}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewKey(Date.now())}
                          className="h-7 text-xs gap-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Recargar vista previa
                        </Button>
                      </div>

                      <div className="flex-1 w-full flex items-center justify-center relative">
                        <img
                          key={previewKey}
                          src={`/api/documents/${editingDoc.id}/thumbnail?t=${previewKey}`}
                          alt="Vista previa del documento"
                          className="max-h-[60vh] w-auto object-contain rounded shadow-md border border-slate-300 dark:border-slate-700 bg-white"
                          onError={(e: any) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className="hidden flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                          <FileText className="h-12 w-12 stroke-1 text-slate-400" />
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            Sin vista previa disponible o error de carga
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setPreviewKey(Date.now())}
                            className="text-xs gap-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reintentar cargar vista previa
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Edit Form */}
                    <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                      <div className="space-y-4">
                        {(() => {
                          const editingDocResult = masivoResultados.find(r => r.id === editingDoc.id);
                          if (!editingDocResult || editingDocResult.ok) return null;

                          const isTitularError = editingDocResult.codigoError === '1100' || editingDocResult.codigoError === '1101' || editingDocResult.codigoError === '1104' || editingDocResult.msg?.toLowerCase().includes('titular') || editingDocResult.msg?.toLowerCase().includes('emisor');
                          const isNifError = editingDocResult.codigoError === '1169' || editingDocResult.codigoError === '1124' || editingDocResult.codigoError === '4111' || editingDocResult.msg?.includes('NIF') || editingDocResult.msg?.includes('Contraparte') || !isTitularError;
                          const isChecksumError = editingDocResult.codigoError === '4111' || editingDocResult.descripcionError?.includes('formato erróneo') || editingDocResult.msg?.includes('formato erróneo');

                          return (
                            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs space-y-1.5">
                              <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-400">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                                Rechazado por la AEAT {editingDocResult.codigoError ? `(Código ${editingDocResult.codigoError})` : ''}
                              </div>
                              <p className="text-slate-700 dark:text-slate-200 font-mono text-[11px] leading-relaxed">
                                {editingDocResult.descripcionError || editingDocResult.msg}
                              </p>

                              {isTitularError && (
                                <div className="text-amber-800 dark:text-amber-300 text-[11px] pt-1.5 border-t border-red-200 dark:border-red-900/50 space-y-1">
                                  <div className="flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
                                    <span>💡</span>
                                    <span>Error en Datos del Emisor / Titular (Tu Empresa)</span>
                                  </div>
                                  <p className="text-[11px] text-slate-700 dark:text-slate-300">
                                    La AEAT indica que el NIF propio (<code>{editingDoc.nif_empresa || empresa?.cif}</code>) o la Razón Social de tu empresa no coinciden con el Censo o Certificado Digital de la AEAT. Verificá los datos en el selector de empresa superior.
                                  </p>
                                </div>
                              )}

                              {isNifError && (
                                <div className="text-amber-800 dark:text-amber-300 text-[11px] pt-1.5 border-t border-red-200 dark:border-red-900/50 space-y-1">
                                  <div className="flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
                                    <span>💡</span>
                                    <span>¿Cómo solucionar este error de Contraparte en la AEAT?</span>
                                  </div>
                                  <ul className="list-disc ml-4 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                                    {isChecksumError ? (
                                      <li><b>Error 4111 (Dígito de control inválido):</b> El NIF ingresado tiene 9 caracteres pero el dígito final no cumple con el algoritmo oficial del Censo AEAT (CIFs tipo <code>B</code> requieren un dígito de control específico). Verificá el último número/letra en la vista previa del documento.</li>
                                    ) : (
                                      <li><b>Opción 1 (Cliente de España):</b> El NIF debe tener <b>exactamente 9 caracteres</b> (ej: <code>B12345678</code>). Corregí el NIF en el campo de abajo.</li>
                                    )}
                                    <li><b>Opción 2 (Cliente Extranjero / No Censado):</b> Si es una empresa de otro país o ID especial, <b>cambiá el selector de País</b> de "ES" a su país de origen (ej: <code>DE</code>, <code>FR</code>, <code>US</code>). La AEAT lo procesará usando el bloque oficial <code>&lt;IDOtro&gt;</code>.</li>
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Datos Empresa Emisora (Propia) */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-1">
                          <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                            <span>🏢 Empresa Emisora (Titular Cabecera)</span>
                            <span className="font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-700 dark:text-slate-300">
                              {editingDoc.nif_empresa || empresa?.cif || 'Sin NIF'}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 font-medium text-[11px] truncate">
                            {editingDoc.nombre_empresa || empresa?.nombre_fiscal || empresa?.nombre_de_empresa || 'Sin Razón Social'}
                          </p>
                        </div>

                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                          <span className="font-semibold">Documento ID: #{editingDoc.id}</span> · {editingDoc.tipo_documento}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            NIF / CIF Cliente / Contraparte
                          </label>
                          <input
                            type="text"
                            value={editNif}
                            onChange={e => setEditNif(e.target.value)}
                            placeholder="Ej: B12345678"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 font-mono font-semibold"
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            9 caracteres para NIF español. Si tiene otra longitud, la AEAT requerirá Código de País.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Nombre / Razón Social
                          </label>
                          <input
                            type="text"
                            value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            placeholder="Nombre del cliente"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-slate-500" />
                            País de la Contraparte (ISO 2 letras)
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={editPais}
                              onChange={e => setEditPais(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 font-medium"
                            >
                              <option value="ES">ES — España</option>
                              <option value="DE">DE — Alemania</option>
                              <option value="FR">FR — Francia</option>
                              <option value="IT">IT — Italia</option>
                              <option value="PT">PT — Portugal</option>
                              <option value="GB">GB — Reino Unido</option>
                              <option value="US">US — Estados Unidos</option>
                              <option value="NL">NL — Países Bajos</option>
                              <option value="BE">BE — Bélgica</option>
                              <option value="AD">AD — Andorra</option>
                              <option value="CH">CH — Suiza</option>
                              <option value="AT">AT — Austria</option>
                              <option value="IE">IE — Irlanda</option>
                              <option value="SE">SE — Suecia</option>
                              <option value="DK">DK — Dinamarca</option>
                              <option value="NO">NO — Noruega</option>
                              <option value="MX">MX — México</option>
                              <option value="AR">AR — Argentina</option>
                            </select>
                            <input
                              type="text"
                              maxLength={2}
                              value={editPais}
                              onChange={e => setEditPais(e.target.value.toUpperCase())}
                              placeholder="ES"
                              className="w-20 px-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono uppercase text-center bg-white dark:bg-slate-900"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Tipo Factura SII
                            </label>
                            <select
                              value={editTipoFactura}
                              onChange={e => setEditTipoFactura(e.target.value)}
                              className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900"
                            >
                              <option value="F1">F1 — Factura Completa</option>
                              <option value="F2">F2 — Simplificada / Ticket</option>
                              <option value="R1">R1 — Rectificativa Error</option>
                              <option value="R2">R2 — Rectificativa Art 80.3</option>
                              <option value="R3">R3 — Rectificativa Art 80.4</option>
                              <option value="R4">R4 — Rectificativa Resto</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Clave Régimen
                            </label>
                            <select
                              value={editClaveRegimen}
                              onChange={e => setEditClaveRegimen(e.target.value)}
                              className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900"
                            >
                              <option value="01">01 — Op. General</option>
                              <option value="02">02 — Exportación</option>
                              <option value="03">03 — Bienes Usados</option>
                              <option value="05">05 — Agencias Viaje</option>
                              <option value="07">07 — Criterio Caja</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Base Imponible (€)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={editBase}
                              onChange={e => setEditBase(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono bg-white dark:bg-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Cuota IVA (€)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={editCuotaIVA}
                              onChange={e => setEditCuotaIVA(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono bg-white dark:bg-slate-900"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                        <Button variant="outline" onClick={() => setEditingDoc(null)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSaveDocChanges} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                          Guardar Cambios SII
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Confirmación de Anulación SII */}
            {anularTarget && (
              <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                      <div className="p-2.5 bg-red-100 dark:bg-red-950/60 rounded-full border border-red-200 dark:border-red-800">
                        <AlertTriangle className="h-6 w-6 stroke-[2]" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          Anular Factura en la AEAT
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Baja de registro oficial en el SII
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      ¿Estás seguro de que querés solicitar la baja de la factura <strong className="text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">"{anularTarget.num}"</strong> en los servidores de la Agencia Tributaria?
                    </p>

                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <span>
                        Esta acción enviará una comunicación de baja (Baja A0) firmada con tu certificado digital directamente al SII de la AEAT.
                      </span>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={anulando}
                      onClick={() => setAnularTarget(null)}
                      className="text-xs font-semibold"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={anulando}
                      onClick={async () => {
                        const { num, fecha, tipoLibro, nifEmisor, nombreEmisor } = anularTarget;
                        setAnularTarget(null);
                        await executeAnular(num, fecha, tipoLibro, nifEmisor, nombreEmisor);
                      }}
                      className="text-xs font-semibold gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {anulando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Confirmar Anulación en AEAT
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </main>
      </div>
    </MainLayout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1 pb-2 border-b border-border/60">
      <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary inline-block" />
        {title}
      </h2>
      {subtitle && <p className="text-xs text-muted-foreground font-mono">{subtitle}</p>}
    </div>
  );
}

function FilterBar({
  ejercicio, setEjercicio,
  periodo, setPeriodo,
  selectedTrimestres, setSelectedTrimestres,
  useEspecificos, setUseEspecificos,
  selectedMeses, setSelectedMeses,
  useFechaRango, setUseFechaRango,
  fechaDesde, setFechaDesde,
  fechaHasta, setFechaHasta,
  certValid, onQuery, querying, label, extraControls
}: {
  ejercicio: string; setEjercicio: (v: string) => void;
  periodo: string; setPeriodo: (v: string) => void;
  selectedTrimestres: string[]; setSelectedTrimestres: (v: string[]) => void;
  useEspecificos: boolean; setUseEspecificos: (v: boolean) => void;
  selectedMeses: string[]; setSelectedMeses: (v: string[]) => void;
  useFechaRango: boolean; setUseFechaRango: (v: boolean) => void;
  fechaDesde: string; setFechaDesde: (v: string) => void;
  fechaHasta: string; setFechaHasta: (v: string) => void;
  certValid: boolean | null; onQuery: () => void; querying: boolean; label: string;
  extraControls?: React.ReactNode;
}) {
  const isFullYear = selectedTrimestres.length === 4;
  const toggleFullYear = () => {
    if (isFullYear) setSelectedTrimestres([]);
    else setSelectedTrimestres(['1T', '2T', '3T', '4T']);
  };

  const trimestres = [
    { id: '1T', label: 'T1 (Ene-Mar)' },
    { id: '2T', label: 'T2 (Abr-Jun)' },
    { id: '3T', label: 'T3 (Jul-Sep)' },
    { id: '4T', label: 'T4 (Oct-Dic)' },
  ];

  const mesesNombres = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  return (
    <Card className="border border-border/60 shadow-sm bg-card/80 backdrop-blur-sm space-y-4">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Parámetros de Consulta SII</p>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={useEspecificos}
              onChange={e => setUseEspecificos(e.target.checked)}
              className="w-4 h-4 rounded border-input text-primary accent-primary cursor-pointer"
            />
            <span>Mostrar / Activar Filtros Específicos</span>
          </label>
        </div>

        {/* ── SECCIÓN A: FILTROS RÁPIDOS ── */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Filtros Rápidos</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-muted-foreground">Ejercicio</label>
              <input
                value={ejercicio}
                onChange={e => setEjercicio(e.target.value)}
                className="w-24 px-2.5 py-1 border border-input rounded-lg text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                placeholder="2026"
              />
            </div>

            {/* Presets Trimestres */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-muted-foreground">Períodos Rápidos (Trimestres)</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleFullYear}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                    isFullYear
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Año Completo
                </button>
                {trimestres.map(t => {
                  const active = selectedTrimestres.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer select-none transition-all ${
                        active
                          ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                          : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={e => {
                          if (e.target.checked) setSelectedTrimestres([...selectedTrimestres, t.id]);
                          else setSelectedTrimestres(selectedTrimestres.filter(x => x !== t.id));
                        }}
                        className="w-3.5 h-3.5 rounded border-input text-primary accent-primary cursor-pointer"
                      />
                      <span>{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECCIÓN B: FILTROS ESPECÍFICOS (DESPLEGABLES) ── */}
        {useEspecificos && (
          <div className="pt-3 border-t border-border/60 space-y-3.5 animate-in fade-in">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              Filtros Específicos (Meses & Rangos de Fecha / Hora)
            </span>

            {/* Checkboxes para Meses */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground">Meses Específicos</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
                {mesesNombres.map((m, idx) => {
                  const val = String(idx + 1).padStart(2, '0');
                  const checked = selectedMeses.includes(val);
                  return (
                    <label
                      key={val}
                      className={`flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer select-none transition-all ${
                        checked
                          ? 'bg-primary text-primary-foreground border-primary font-semibold'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          if (e.target.checked) setSelectedMeses([...selectedMeses, val]);
                          else setSelectedMeses(selectedMeses.filter(x => x !== val));
                        }}
                        className="w-3 h-3 rounded border-input accent-primary cursor-pointer"
                      />
                      <span>{m}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Checkbox Rango Exacto Fecha/Hora */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={useFechaRango}
                  onChange={e => setUseFechaRango(e.target.checked)}
                  className="w-4 h-4 rounded border-input text-primary accent-primary cursor-pointer"
                />
                <span>Filtrar por Rango Exacto de Fechas (con Hora)</span>
              </label>

              {useFechaRango && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/30 border border-border/60 rounded-lg animate-in fade-in">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-muted-foreground">Desde (Fecha y Hora)</label>
                    <input
                      type="datetime-local"
                      value={fechaDesde}
                      onChange={e => setFechaDesde(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-muted-foreground">Hasta (Fecha y Hora)</label>
                    <input
                      type="datetime-local"
                      value={fechaHasta}
                      onChange={e => setFechaHasta(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {extraControls}

        {/* Botón de Ejecución de Consulta */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/40">
          <Button
            onClick={onQuery}
            disabled={querying || certValid !== true}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-9 px-6 shadow-sm transition-all rounded-lg"
          >
            {querying ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando...</> : <><Search className="h-4 w-4 mr-2" />{label}</>}
          </Button>

          {certValid !== true && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Valida tu certificado primero en "Certificado Digital"
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result, onAnular }: { result: any; onAnular?: (num: string, fecha: string, nifEmisor?: string, nombreEmisor?: string) => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = result.resultado || result;
  const isSuccess = result.success !== false && !result.error;
  const resultadoConsulta = data?.ResultadoConsulta || (isSuccess ? (data?.RegistroRespuestaConsultaLLAA ? 'ConDatos' : 'SinDatos') : 'Error');

  // Extract records if present
  const emitidas = data?.RegistroRespuestaConsultaLRFacturasEmitidas;
  const recibidas = data?.RegistroRespuestaConsultaLRFacturasRecibidas;
  const registros = Array.isArray(emitidas) ? emitidas : (emitidas ? [emitidas] : (Array.isArray(recibidas) ? recibidas : (recibidas ? [recibidas] : [])));
  const llaa = data?.RegistroRespuestaConsultaLLAA;

  return (
    <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
      <CardHeader className="px-4 py-3.5 border-b border-border bg-muted/40 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
          {isSuccess
            ? <><CheckCircle className="h-4 w-4 text-emerald-500" />Respuesta Oficial AEAT Recibida</>
            : <><XCircle className="h-4 w-4 text-destructive" />Error en Consulta AEAT</>}
          <Badge variant={llaa ? 'default' : (resultadoConsulta === 'ConDatos' ? 'default' : (resultadoConsulta === 'SinDatos' ? 'secondary' : 'destructive'))} className="ml-2 font-medium">
            {llaa ? 'Estado Libros Registro (LLAA)' : (resultadoConsulta === 'SinDatos' ? 'Sin registros presentados' : (resultadoConsulta === 'ConDatos' ? `${registros.length} registros encontrados` : 'Error'))}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowRaw(!showRaw)} className="text-xs h-7 text-muted-foreground hover:text-foreground">
            {showRaw ? 'Ver Formateado' : 'Ver JSON Raw'}
          </Button>
          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
            {result.entorno || 'PRUEBAS'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {!isSuccess && (
          <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs font-mono text-destructive">{result.error || 'No se pudo completar la consulta'}</p>
          </div>
        )}

        {showRaw ? (
          <pre className="text-xs font-mono text-muted-foreground bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <>
            {/* Header info summary */}
            {data?.Cabecera && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-muted/40 border border-border/60 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Titular:</span>
                  <span className="font-semibold text-foreground truncate block">{data.Cabecera.Titular?.NombreRazon || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">NIF Titular:</span>
                  <span className="font-mono font-semibold text-foreground">{data.Cabecera.Titular?.NIF || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Ejercicio / Periodo:</span>
                  <span className="font-semibold text-foreground">{data.PeriodoLiquidacion?.Ejercicio} - {data.PeriodoLiquidacion?.Periodo}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Versión SII:</span>
                  <span className="font-semibold text-foreground">v{data.Cabecera.IDVersionSii || '1.1'}</span>
                </div>
              </div>
            )}

            {/* LLAA View */}
            {llaa ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <span className="text-xs text-primary font-medium block mb-1">Total IVA Devengado</span>
                    <span className="text-2xl font-bold font-mono text-foreground">{parseFloat(llaa.IvaDevengado?.TotalCuota || '0').toFixed(2)} €</span>
                  </div>
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block mb-1">Total IVA Deducible</span>
                    <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{parseFloat(llaa.IvaDeducible?.TotalDeducir || '0').toFixed(2)} €</span>
                  </div>
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium block mb-1">Resultado Estimado Liquidación</span>
                    <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                      {(parseFloat(llaa.IvaDevengado?.TotalCuota || '0') - parseFloat(llaa.IvaDeducible?.TotalDeducir || '0')).toFixed(2)} €
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* IVA Devengado breakdown */}
                  <div className="border border-border/80 rounded-xl p-4 text-xs space-y-2 bg-card">
                    <p className="font-bold text-foreground border-b border-border pb-2 flex items-center justify-between">
                      <span>IVA Devengado (Ventas / Emitidas)</span>
                      <span className="font-mono text-primary">{llaa.IvaDevengado?.TotalCuota || '0'} €</span>
                    </p>
                    <div className="space-y-1.5 font-mono text-muted-foreground">
                      <div className="flex justify-between py-0.5"><span>Régimen General 21%:</span><span>BI: {llaa.IvaDevengado?.BI_RegimenGeneral21 || 0} € | Cuota: {llaa.IvaDevengado?.CI_RegimenGeneral21 || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Régimen General 10%:</span><span>BI: {llaa.IvaDevengado?.BI_RegimenGeneral10 || 0} € | Cuota: {llaa.IvaDevengado?.CI_RegimenGeneral10 || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Régimen General 4%:</span><span>BI: {llaa.IvaDevengado?.BI_RegimenGeneral4 || 0} € | Cuota: {llaa.IvaDevengado?.CI_RegimenGeneral4 || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Adquisiciones Intracomunitarias (AIB):</span><span>BI: {llaa.IvaDevengado?.BI_AIBBienesYservicios || 0} € | Cuota: {llaa.IvaDevengado?.CI_AIBBienesYservicios || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Inversión del Sujeto Pasivo (ISP):</span><span>BI: {llaa.IvaDevengado?.BI_OtrasOperacionesISP || 0} € | Cuota: {llaa.IvaDevengado?.CI_OtrasOperacionesISP || 0} €</span></div>
                    </div>
                  </div>

                  {/* IVA Deducible breakdown */}
                  <div className="border border-border/80 rounded-xl p-4 text-xs space-y-2 bg-card">
                    <p className="font-bold text-foreground border-b border-border pb-2 flex items-center justify-between">
                      <span>IVA Deducible (Compras / Recibidas)</span>
                      <span className="font-mono text-emerald-500">{llaa.IvaDeducible?.TotalDeducir || '0'} €</span>
                    </p>
                    <div className="space-y-1.5 font-mono text-muted-foreground">
                      <div className="flex justify-between py-0.5"><span>Operaciones Interiores Corrientes:</span><span>BI: {llaa.IvaDeducible?.BI_CuotasSoportadasOperacInterioresCorrientes || 0} € | Cuota: {llaa.IvaDeducible?.CI_CuotasSoportadasOperacInterioresCorrientes || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Bienes de Inversión:</span><span>BI: {llaa.IvaDeducible?.BI_CuotasSoportadasOperacInterioresBienesInversion || 0} € | Cuota: {llaa.IvaDeducible?.CI_CuotasSoportadasOperacInterioresBienesInversion || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>Importaciones:</span><span>BI: {llaa.IvaDeducible?.BI_CuotasSoportadasImportacionesBienesCorrientes || 0} € | Cuota: {llaa.IvaDeducible?.CI_CuotasSoportadasImportacionesBienesCorrientes || 0} €</span></div>
                      <div className="flex justify-between py-0.5"><span>AIB Deducibles:</span><span>BI: {llaa.IvaDeducible?.BI_AIBBienesServiciosCorrientes || 0} € | Cuota: {llaa.IvaDeducible?.CI_AIBBienesServiciosCorrientes || 0} €</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : registros.length === 0 && isSuccess ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-semibold text-foreground">Sin registros en el periodo seleccionado</p>
                <p className="text-xs text-muted-foreground mt-1">No se encontraron facturas registradas en la AEAT para este ejercicio y periodo.</p>
              </div>
            ) : registros.length > 0 ? (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="p-3">Nº Factura / Serie</th>
                      <th className="p-3">Fecha Exp.</th>
                      <th className="p-3">Contraparte (NIF / Nombre)</th>
                      <th className="p-3 text-right">Base Imponible</th>
                      <th className="p-3 text-right">Cuota IVA</th>
                      <th className="p-3 text-right">Importe Total</th>
                      <th className="p-3">Estado Registro</th>
                      <th className="p-3">CSV AEAT</th>
                      <th className="p-3 text-center">Acciones AEAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {registros.map((reg: any, idx: number) => {
                      const idFact = reg.IDFactura || {};
                      const datos = reg.DatosFacturaEmitida || reg.DatosFacturaRecibida || {};
                      const estado = reg.EstadoFactura || {};
                      const pres = reg.DatosPresentacion || {};
                      const contraparte = datos.Contraparte || {};

                      const numFact = idFact.NumSerieFacturaEmisor;
                      const fechaFact = idFact.FechaExpedicionFacturaEmisor;
                      const nifEmisor = idFact.IDEmisorFactura?.NIF || idFact.IDEmisorFactura?.IDOtro?.ID || contraparte.NIF;
                      const nombreEmisor = idFact.IDEmisorFactura?.NombreRazon || contraparte.NombreRazon;

                      // Extraer desglose fiscal AEAT
                      const detalle = datos.TipoDesglose?.DesgloseFactura?.Sujeta?.NoExenta?.DesgloseIVA?.DetalleIVA 
                        || datos.DesgloseFactura?.Sujeta?.NoExenta?.DesgloseIVA?.DetalleIVA;
                      const primerDetalle = Array.isArray(detalle) ? detalle[0] : detalle;
                      const baseImp = primerDetalle?.BaseImponible || datos.BaseImponible;
                      const cuotaIva = primerDetalle?.Cuota || datos.CuotaDeducible || datos.Cuota;

                      return (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-foreground">
                            {numFact || 'N/A'}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {fechaFact || '-'}
                          </td>
                          <td className="p-3">
                            <span className="block text-foreground font-medium">{contraparte.NombreRazon || '-'}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{contraparte.NIF || contraparte.IDOtro?.ID || '-'}</span>
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {baseImp ? `${parseFloat(baseImp).toFixed(2)} €` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {cuotaIva ? `${parseFloat(cuotaIva).toFixed(2)} €` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-foreground">
                            {datos.ImporteTotal ? `${parseFloat(datos.ImporteTotal).toFixed(2)} €` : '-'}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-medium border ${
                                estado.EstadoRegistro === 'Correcta'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : estado.EstadoRegistro === 'Anulada'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  : 'bg-destructive/10 text-destructive border-destructive/30'
                              }`}
                            >
                              {estado.EstadoRegistro || 'Registrado'}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-muted-foreground truncate max-w-[120px]" title={pres.CSV || '-'}>
                            {pres.CSV || '-'}
                          </td>
                          <td className="p-3 text-center">
                            {numFact && fechaFact && onAnular ? (
                              estado.EstadoRegistro === 'Anulada' ? (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/30 inline-flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> Ya Anulada
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onAnular(numFact, fechaFact, nifEmisor, nombreEmisor)}
                                  className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                                  title="Dar de baja / Anular esta factura oficialmente en la AEAT"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Anular en AEAT
                                </Button>
                              )
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
