'use client';

import React, { useState } from 'react';
import { 
  Webhook, 
  Activity, 
  ShieldCheck, 
  Building2, 
  Plus, 
  ArrowLeft, 
  BookOpen, 
  Check, 
  Copy, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  X, 
  ExternalLink,
  CheckCircle2,
  Lock,
  Layers
} from 'lucide-react';
import { 
  createWebhookAction, 
  deleteWebhookAction, 
  toggleWebhookStatusAction, 
  toggleWebhookEventAction, 
  toggleWebhookConfigAction, 
  inlineUpdateWebhookAction 
} from './actions';

const TODOS_LOS_EVENTOS = [
  { 
    id: 'documento.listo_para_erp', 
    label: 'Documento Listo para ERP', 
    shortLabel: 'listo_para_erp',
    desc: 'Se dispara cuando un documento se procesa limpio, sin incidencias ni descuadres.',
    color: 'emerald' 
  },
  { 
    id: 'documento.requiere_atencion', 
    label: 'Documento Requiere Atención', 
    shortLabel: 'requiere_atencion',
    desc: 'Se dispara cuando un documento tiene descuadres o incidencias pendientes.',
    color: 'amber' 
  },
  { 
    id: 'incidencia.resuelta_manualmente', 
    label: 'Incidencia Resuelta', 
    shortLabel: 'resuelta_manualmente',
    desc: 'Se dispara cuando se aprueba manualmente una incidencia.',
    color: 'indigo' 
  },
  { 
    id: 'documento.modificado', 
    label: 'Documento Modificado', 
    shortLabel: 'modificado',
    desc: 'Se dispara cuando se edita un campo de un documento ya procesado.',
    color: 'sky' 
  },
  { 
    id: 'documento.eliminado', 
    label: 'Documento Eliminado', 
    shortLabel: 'eliminado',
    desc: 'Se dispara cuando se elimina un documento.',
    color: 'rose' 
  },
];

export default function WebhooksClient({ empresas, initialWebhooks }: { empresas: any[], initialWebhooks: any[] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editingUrlId, setEditingUrlId] = useState<number | null>(null);
  const [editingUrlValue, setEditingUrlValue] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Derived metrics
  const totalWebhooks = webhooks.length;
  const activeWebhooks = webhooks.filter(w => w.activo).length;
  const uniqueEmpresasCount = new Set(webhooks.map(w => w.id_de_empresa)).size;
  const totalSubscribedEvents = webhooks.reduce((acc, curr) => acc + (curr.eventos_suscritos?.length || 0), 0);

  const copyToClipboard = async (text: string, label: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(keyId);
      setSuccessMsg(`${label} copiado al portapapeles`);
      setTimeout(() => setCopiedId(null), 2000);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('Error al copiar al portapapeles');
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirmId === null) return;
    setIsSubmitting(true);
    try {
      const wh = webhooks.find(w => w.id === deleteConfirmId);
      if (!wh) return;
      await deleteWebhookAction(wh.id_de_empresa, deleteConfirmId);
      setWebhooks(prev => prev.filter(w => w.id !== deleteConfirmId));
      setSuccessMsg('Webhook eliminado correctamente.');
      setTimeout(() => setSuccessMsg(null), 3000);
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al eliminar el webhook.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const formData = new FormData(e.currentTarget);
      const eventos = formData.getAll('eventos');
      if (eventos.length === 0) {
        setErrorMsg('Seleccioná al menos un evento para continuar.');
        setIsSubmitting(false);
        return;
      }
      const formEmpresaId = formData.get('empresaId') as string;
      const empresaId = formEmpresaId === 'ALL' ? 'ALL' : parseInt(formEmpresaId, 10);
      await createWebhookAction(empresaId, formData);
      setIsModalOpen(false);
      setSuccessMsg('Webhook creado exitosamente. Recargando página...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setDeleteConfirmId(null);
    setErrorMsg(null);
  };

  const handleToggleStatus = async (whId: number, empresaId: number, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, activo: newStatus } : w));
    try {
      await toggleWebhookStatusAction(empresaId, whId, newStatus);
    } catch (err: any) {
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, activo: currentStatus } : w));
      setErrorMsg('Error al actualizar el estado del webhook');
    }
  };

  const handleToggleEvent = async (whId: number, empresaId: number, eventId: string, isCurrentlySubscribed: boolean) => {
    const wh = webhooks.find(w => w.id === whId);
    if (!wh) return;

    let newEvents = [...wh.eventos_suscritos];
    if (isCurrentlySubscribed) {
      newEvents = newEvents.filter(e => e !== eventId);
    } else {
      newEvents.push(eventId);
    }

    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, eventos_suscritos: newEvents } : w));
    
    try {
      await toggleWebhookEventAction(empresaId, whId, newEvents);
    } catch (err: any) {
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, eventos_suscritos: wh.eventos_suscritos } : w));
      setErrorMsg('Error al actualizar los eventos del webhook');
    }
  };

  const handleEmpresaChange = async (whId: number, currentEmpresaId: number, newEmpresaId: number) => {
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, id_de_empresa: newEmpresaId } : w));
    try {
      await inlineUpdateWebhookAction(currentEmpresaId, whId, { id_de_empresa: newEmpresaId });
      setSuccessMsg('Empresa del webhook actualizada');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, id_de_empresa: currentEmpresaId } : w));
      setErrorMsg('Error al actualizar la empresa');
    }
  };

  const handleSaveUrl = async (whId: number, currentEmpresaId: number, originalUrl: string) => {
    if (!editingUrlValue || editingUrlValue === originalUrl) {
      setEditingUrlId(null);
      return;
    }
    const newUrl = editingUrlValue;
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, url_destino: newUrl } : w));
    setEditingUrlId(null);
    try {
      await inlineUpdateWebhookAction(currentEmpresaId, whId, { url_destino: newUrl });
      setSuccessMsg('URL actualizada correctamente');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, url_destino: originalUrl } : w));
      setErrorMsg('Error al actualizar la URL');
    }
  };

  const getEventBadgeStyle = (eventId: string, isSubscribed: boolean) => {
    const evtMeta = TODOS_LOS_EVENTOS.find(e => e.id === eventId);
    const color = evtMeta?.color || 'blue';

    if (!isSubscribed) {
      return 'bg-gray-100 text-gray-400 dark:bg-gray-800/40 dark:text-gray-500 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 opacity-60';
    }

    switch (color) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20';
      case 'amber':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20';
      case 'indigo':
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20';
      case 'sky':
        return 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 border-sky-200 dark:border-sky-500/20 hover:bg-sky-100 dark:hover:bg-sky-500/20';
      case 'rose':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20';
      default:
        return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20';
    }
  };

  return (
    <>
      {/* Header Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8" data-tutorial="webhooks-header">
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm group"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          </a>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Webhooks</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                HMAC-SHA256 Active
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5">
              Integración HTTP en tiempo real para sincronización automática con tu ERP o backend
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <a
            href="/docs#webhooks"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/60 shadow-sm transition-all"
          >
            <BookOpen className="w-4 h-4 text-emerald-500" />
            Documentación
          </a>
          <button 
            data-tutorial="webhooks-create-btn"
            onClick={() => { setIsModalOpen(true); setErrorMsg(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-medium shadow-md shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nuevo Webhook
          </button>
        </div>
      </div>

      {/* KPI Cards summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/70 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Webhooks Activos</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Webhook className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{activeWebhooks}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">de {totalWebhooks} totales</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/70 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Empresas Vinculadas</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{uniqueEmpresasCount}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">de {empresas.length} disponibles</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/70 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Eventos Activos</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{totalSubscribedEvents}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">suscripciones</span>
          </div>
        </div>
      </div>

      {/* Toast Notificaciones */}
      {successMsg && (
        <div className="mb-6 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm shadow-sm animate-fade-in-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && !isModalOpen && !deleteConfirmId && (
        <div className="mb-6 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-300 text-xs sm:text-sm shadow-sm animate-fade-in-up">
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Lista de Webhooks */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-700/80 overflow-hidden w-full" data-tutorial="webhooks-list">
        <div className="overflow-x-auto">
          {webhooks.length === 0 ? (
            <div className="p-12 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-600 dark:text-emerald-400 shadow-inner">
                <Webhook className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Sin webhooks configurados</h3>
              <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-6 leading-relaxed">
                Recibí notificaciones HTTP automáticas en tu software contable o ERP cada vez que se procese o modifique una factura.
              </p>
              <button 
                onClick={() => { setIsModalOpen(true); setErrorMsg(null); }}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                Crear el primer Webhook
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50/80 dark:bg-gray-900/60 border-b border-gray-200/80 dark:border-gray-700/80 uppercase text-[11px] font-semibold text-gray-500 dark:text-gray-400 tracking-wider">
              <tr>
                {empresas.length > 1 && <th className="px-6 py-3.5">Empresa</th>}
                <th className="px-6 py-3.5">URL Destino</th>
                <th className="px-6 py-3.5" data-tutorial="webhooks-events">Eventos Suscritos</th>
                <th className="px-6 py-3.5" data-tutorial="webhooks-config">Estado</th>
                <th className="px-6 py-3.5">Secreto HMAC</th>
                <th className="px-6 py-3.5 text-right" data-tutorial="webhooks-logs">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/70 dark:divide-gray-700/70">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors group">
                  {empresas.length > 1 && (
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <select 
                          value={wh.id_de_empresa}
                          onChange={(e) => handleEmpresaChange(wh.id, wh.id_de_empresa, parseInt(e.target.value, 10))}
                          className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-200 bg-transparent border-0 border-b border-dashed border-gray-300 dark:border-gray-600 hover:border-emerald-500 dark:hover:border-emerald-400 focus:ring-0 focus:outline-none cursor-pointer py-0.5 px-0 focus:border-emerald-500 max-w-[160px]"
                          title="Cambiar empresa vinculada"
                        >
                          {empresas.map(e => (
                            <option 
                              key={e.id} 
                              value={e.id}
                              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200"
                            >
                              {e.nombre_de_empresa || `Empresa ${e.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  )}

                  {/* URL Destino */}
                  <td className="px-6 py-4 align-middle">
                    {editingUrlId === wh.id ? (
                      <div className="flex items-center gap-1.5 max-w-[340px]">
                        <input 
                          type="url" 
                          value={editingUrlValue} 
                          onChange={e => setEditingUrlValue(e.target.value)} 
                          className="flex-1 px-2.5 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-emerald-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-gray-200"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveUrl(wh.id, wh.id_de_empresa, wh.url_destino);
                            if (e.key === 'Escape') setEditingUrlId(null);
                          }}
                        />
                        <button 
                          onClick={() => handleSaveUrl(wh.id, wh.id_de_empresa, wh.url_destino)} 
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" 
                          title="Guardar URL"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setEditingUrlId(null)} 
                          className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" 
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 max-w-[340px]">
                        <button 
                          onClick={() => copyToClipboard(wh.url_destino, 'URL', `url-${wh.id}`)}
                          className="text-left group/url flex items-center gap-2 flex-1 bg-gray-50 dark:bg-gray-900/60 px-3 py-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/60 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-all cursor-pointer truncate"
                          title="Click para copiar URL"
                        >
                          <span className="truncate block text-gray-700 dark:text-gray-300 font-mono text-xs">
                            {wh.url_destino}
                          </span>
                          {copiedId === `url-${wh.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 ml-auto" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover/url:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
                          )}
                        </button>
                        <button 
                          onClick={() => { setEditingUrlId(wh.id); setEditingUrlValue(wh.url_destino); }}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors flex-shrink-0"
                          title="Editar URL"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Eventos Suscritos */}
                  <td className="px-6 py-4 align-middle">
                    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                      {TODOS_LOS_EVENTOS.map((evt) => {
                        const isSubscribed = wh.eventos_suscritos.includes(evt.id);
                        return (
                          <button
                            key={evt.id}
                            onClick={() => handleToggleEvent(wh.id, wh.id_de_empresa, evt.id, isSubscribed)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all cursor-pointer ${getEventBadgeStyle(evt.id, isSubscribed)}`}
                            title={`${evt.label} — ${isSubscribed ? 'Suscrito (Click para desuscribir)' : 'No suscrito (Click para activar)'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isSubscribed ? 'bg-current' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                            {evt.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* Estado Toggle */}
                  <td className="px-6 py-4 align-middle">
                    <button 
                      onClick={() => handleToggleStatus(wh.id, wh.id_de_empresa, wh.activo)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-all shadow-sm ${
                      wh.activo 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20' 
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/20'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${wh.activo ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`}></span>
                      {wh.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>

                  {/* Secreto HMAC */}
                  <td className="px-6 py-4 align-middle font-mono text-xs">
                    <button 
                      onClick={() => copyToClipboard(wh.secreto_firma, 'Secreto HMAC', `sec-${wh.id}`)}
                      className="group/sec inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-700/60 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer"
                      title="Copiar secreto HMAC completo"
                    >
                      <Lock className="w-3 h-3 text-purple-500" />
                      <span>{wh.secreto_firma ? `${wh.secreto_firma.substring(0, 10)}...` : '••••••••'}</span>
                      {copiedId === `sec-${wh.id}` ? (
                        <Check className="w-3 h-3 text-emerald-500 ml-1" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-0 group-hover/sec:opacity-100 transition-opacity ml-1" />
                      )}
                    </button>
                  </td>

                  {/* Acciones */}
                  <td className="px-6 py-4 align-middle text-right">
                    <button 
                      onClick={() => setDeleteConfirmId(wh.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors inline-flex items-center gap-1"
                      title="Eliminar webhook"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>

      {/* Modal Confirmación de Eliminación */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center mb-4 mx-auto text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5">¿Eliminar Webhook?</h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Esta acción es permanente. Tu servidor dejará de recibir notificaciones HTTP inmediatas para los eventos de esta empresa.
              </p>
              
              {errorMsg && (
                <div className="mt-4 p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs rounded-xl border border-rose-200 dark:border-rose-800">
                  {errorMsg}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-end gap-2.5 border-t border-gray-200 dark:border-gray-800">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? 'Borrando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Webhook */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 overflow-hidden">
            
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Webhook className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Nuevo Webhook</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Firma HMAC-SHA256 generada automáticamente</p>
                </div>
              </div>
              <button 
                onClick={closeModal} 
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                
                {errorMsg && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Empresa selector */}
                {empresas.length > 1 ? (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Empresa <span className="text-rose-500">*</span>
                    </label>
                    <select 
                      name="empresaId" 
                      required 
                      className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    >
                      <option value="ALL">Todas las empresas</option>
                      {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre_de_empresa || `Empresa ${emp.id}`}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input type="hidden" name="empresaId" value={empresas[0]?.id} />
                )}

                {/* URL Destino */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    URL Destino Endpoint <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="url" 
                    name="urlDestino" 
                    required 
                    placeholder="https://tu-erp.com/api/webhooks/muvail"
                    className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 placeholder:text-gray-400 placeholder:font-sans"
                  />
                </div>
                
                {/* Eventos a suscribir */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Eventos Notificados <span className="text-rose-500">*</span>
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {TODOS_LOS_EVENTOS.map(evt => (
                      <label 
                        key={evt.id} 
                        className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60 hover:border-emerald-500/40 dark:hover:border-emerald-500/40 cursor-pointer transition-all group"
                      >
                        <input 
                          type="checkbox" 
                          name="eventos" 
                          value={evt.id} 
                          className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 dark:bg-gray-900 border-gray-300 dark:border-gray-700 cursor-pointer accent-emerald-500" 
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {evt.label}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400 bg-gray-200/60 dark:bg-gray-700/60 px-1.5 py-0.5 rounded">
                              {evt.shortLabel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            {evt.desc}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2.5 bg-gray-50/50 dark:bg-gray-800/40">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? 'Guardando...' : 'Crear Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}



