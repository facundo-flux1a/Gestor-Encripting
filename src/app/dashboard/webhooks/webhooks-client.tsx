'use client';

import React, { useState } from 'react';
import { createWebhookAction, deleteWebhookAction, toggleWebhookStatusAction, toggleWebhookEventAction, toggleWebhookConfigAction, inlineUpdateWebhookAction } from './actions';

const TODOS_LOS_EVENTOS = [
  { id: 'documento.listo_para_erp', label: 'Documento Listo para ERP', desc: 'Se dispara cuando un documento se procesa limpio, sin incidencias ni descuadres.' },
  { id: 'documento.requiere_atencion', label: 'Documento Requiere Atención', desc: 'Se dispara cuando un documento tiene descuadres o incidencias pendientes.' },
  { id: 'incidencia.resuelta_manualmente', label: 'Incidencia Resuelta', desc: 'Se dispara cuando se aprueba manualmente una incidencia.' },
  { id: 'documento.modificado', label: 'Documento Modificado', desc: 'Se dispara cuando se edita un campo de un documento ya procesado.' },
  { id: 'documento.eliminado', label: 'Documento Eliminado', desc: 'Se dispara cuando se elimina un documento.' },
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

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccessMsg(`${label} copiado al portapapeles`);
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
        setErrorMsg('Selecciona al menos un evento para continuar.');
        setIsSubmitting(false);
        return;
      }
      const formEmpresaId = formData.get('empresaId') as string;
      const empresaId = formEmpresaId === 'ALL' ? 'ALL' : parseInt(formEmpresaId, 10);
      await createWebhookAction(empresaId, formData);
      setIsModalOpen(false);
      setSuccessMsg('Webhook creado exitosamente. Recargando página...');
      setTimeout(() => window.location.reload(), 1500);
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
    // Optimistic UI update
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, activo: newStatus } : w));
    try {
      await toggleWebhookStatusAction(empresaId, whId, newStatus);
    } catch (err: any) {
      // Revert on error
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, activo: currentStatus } : w));
      setErrorMsg('Error al actualizar el estado del webhook');
    }
  };

  const handleToggleEvent = async (whId: number, empresaId: number, eventId: string, isCurrentlySubscribed: boolean) => {
    // Find webhook
    const wh = webhooks.find(w => w.id === whId);
    if (!wh) return;

    let newEvents = [...wh.eventos_suscritos];
    if (isCurrentlySubscribed) {
      newEvents = newEvents.filter(e => e !== eventId);
    } else {
      newEvents.push(eventId);
    }

    // Optimistic update
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, eventos_suscritos: newEvents } : w));
    
    try {
      await toggleWebhookEventAction(empresaId, whId, newEvents);
    } catch (err: any) {
      // Revert on error
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, eventos_suscritos: wh.eventos_suscritos } : w));
      setErrorMsg('Error al actualizar los eventos del webhook');
    }
  };

  const handleToggleConfig = async (whId: number, empresaId: number, currentConfig: any) => {
    const isAgrupado = currentConfig?.agrupar_eventos ?? false;
    const newAgrupado = !isAgrupado;
    const newConfig = { ...(currentConfig || {}), agrupar_eventos: newAgrupado };

    // Optimistic UI update
    setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, config: newConfig } : w));
    try {
      await toggleWebhookConfigAction(empresaId, whId, newAgrupado);
    } catch (err: any) {
      // Revert on error
      setWebhooks(prev => prev.map(w => w.id === whId ? { ...w, config: currentConfig } : w));
      setErrorMsg('Error al actualizar la configuración del webhook');
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

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Volver
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Webhooks</h1>
            <p className="text-gray-500 text-sm mt-1">Configuración e integración externa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/docs#webhooks"
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            Ver Documentación
          </a>
          <button 
            onClick={() => { setIsModalOpen(true); setErrorMsg(null); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nuevo Webhook
          </button>
        </div>
      </div>

      {/* Notificación de éxito */}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg flex items-center gap-2 text-green-800 dark:text-green-300 text-sm animate-fade-in-up">
          <span>✅</span> {successMsg}
        </div>
      )}

      {/* Notificación de error */}
      {errorMsg && !isModalOpen && !deleteConfirmId && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2 text-red-800 dark:text-red-300 text-sm animate-fade-in-up">
          <span>⚠️</span> {errorMsg}
        </div>
      )}

      {/* Lista de Webhooks */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden w-full">
        <div className="overflow-x-auto">
          {webhooks.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 text-sm mb-1">Todavía no hay webhooks configurados.</p>
              <p className="text-gray-500 text-xs mb-4">Crea uno para empezar a recibir notificaciones en tu ERP.</p>
              <button 
                onClick={() => { setIsModalOpen(true); setErrorMsg(null); }}
                className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + Crear el primer Webhook
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {empresas.length > 1 && <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Empresa</th>}
                <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">URL Destino</th>
                <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Eventos</th>
                <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Secreto</th>
                <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                  {empresas.length > 1 && (
                    <td className="px-6 py-4 align-middle">
                      <select 
                        value={wh.id_de_empresa}
                        onChange={(e) => handleEmpresaChange(wh.id, wh.id_de_empresa, parseInt(e.target.value, 10))}
                        className="text-sm font-medium text-gray-900 dark:text-gray-200 bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:ring-0 focus:outline-none cursor-pointer py-1 px-0 focus:border-blue-500 max-w-[150px]"
                        title="Cambiar empresa"
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
                    </td>
                  )}
                  <td className="px-6 py-4 align-middle">
                    {editingUrlId === wh.id ? (
                      <div className="flex items-center gap-2 max-w-[300px]">
                        <input 
                          type="url" 
                          value={editingUrlValue} 
                          onChange={e => setEditingUrlValue(e.target.value)} 
                          className="flex-1 px-2.5 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-blue-500 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-gray-200 min-w-[200px]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveUrl(wh.id, wh.id_de_empresa, wh.url_destino);
                            if (e.key === 'Escape') setEditingUrlId(null);
                          }}
                        />
                        <button onClick={() => handleSaveUrl(wh.id, wh.id_de_empresa, wh.url_destino)} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="Guardar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={() => setEditingUrlId(null)} className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" title="Cancelar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 max-w-[300px]">
                        <button 
                          onClick={() => copyToClipboard(wh.url_destino, 'URL')}
                          className="text-left group/url flex items-center gap-2 flex-1 bg-gray-100 dark:bg-gray-800/80 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-copy truncate"
                          title="Copiar URL"
                        >
                          <span className="truncate block text-gray-600 dark:text-gray-300 font-mono text-xs">
                            {wh.url_destino}
                          </span>
                          <svg className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover/url:opacity-100 transition-opacity flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                        <button 
                          onClick={() => { setEditingUrlId(wh.id); setEditingUrlValue(wh.url_destino); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors flex-shrink-0"
                          title="Editar URL"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 align-middle">
                    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                      {TODOS_LOS_EVENTOS.map((evt) => {
                        const isSubscribed = wh.eventos_suscritos.includes(evt.id);
                        return (
                          <button
                            key={evt.id}
                            onClick={() => handleToggleEvent(wh.id, wh.id_de_empresa, evt.id, isSubscribed)}
                            className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                              isSubscribed
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20'
                                : 'bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            title={isSubscribed ? 'Click para desuscribir' : 'Click para suscribir'}
                          >
                            {evt.id.split('.')[1]}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-middle">
                    <button 
                      onClick={() => handleToggleStatus(wh.id, wh.id_de_empresa, wh.activo)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                      wh.activo 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20' 
                        : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${wh.activo ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      {wh.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-6 py-4 align-middle text-xs font-mono text-gray-400 dark:text-gray-500">
                    <button 
                      onClick={() => copyToClipboard(wh.secreto_firma, 'Secreto HMAC')}
                      className="group/sec flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-copy"
                      title="Copiar secreto completo"
                    >
                      <span>{wh.secreto_firma.substring(0, 12)}...</span>
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover/sec:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  </td>
                  <td className="px-6 py-4 align-middle text-right">
                    <button 
                      onClick={() => setDeleteConfirmId(wh.id)}
                      className="text-red-500 hover:text-red-700 text-xs hover:underline transition-colors"
                    >
                      Eliminar
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">¿Eliminar webhook?</h3>
              <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                Esta acción borrará el webhook y su historial de logs de forma permanente. No se enviarán más notificaciones a esta URL.
              </p>
              
              {/* Error inline si falla */}
              {errorMsg && (
                <div className="mt-4 p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-lg text-center border border-red-200 dark:border-red-800">
                  {errorMsg}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex justify-center gap-3 border-t border-gray-200 dark:border-gray-700">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
              >
                {isSubmitting ? 'Borrando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Webhook */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700 overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold dark:text-white">Nuevo Webhook</h2>
                <p className="text-xs text-gray-500 mt-0.5">Se generará un secreto de firma HMAC-SHA256 automáticamente.</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                
                {/* Error inline */}
                {errorMsg && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2 text-red-700 dark:text-red-400 text-sm">
                    <span className="mt-0.5">⚠️</span>
                    <span>{errorMsg}</span>
                  </div>
                )}

                 {/* Empresa selector (si hay más de 1) */}
                {empresas.length > 1 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Empresa <span className="text-red-500">*</span>
                    </label>
                    <select name="empresaId" required className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="ALL">Todas mis empresas</option>
                      {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre_de_empresa || `Empresa ${emp.id}`}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input type="hidden" name="empresaId" value={empresas[0]?.id} />
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    URL Destino <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="url" 
                    name="urlDestino" 
                    required 
                    placeholder="https://tu-erp.com/api/webhook"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Eventos a suscribir <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {TODOS_LOS_EVENTOS.map(evt => (
                      <label key={evt.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                        <input type="checkbox" name="eventos" value={evt.id} className="mt-0.5 accent-blue-600" />
                        <div>
                          <span className="text-sm font-medium dark:text-gray-200">{evt.label}</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{evt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmitting ? '⏳ Guardando...' : 'Crear Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


