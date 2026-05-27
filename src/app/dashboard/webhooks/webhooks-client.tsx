'use client';

import React, { useState } from 'react';
import { createWebhookAction, deleteWebhookAction } from './actions';

const TODOS_LOS_EVENTOS = [
  { id: 'documento.listo_para_erp', label: 'Documento Listo para ERP', desc: 'Se dispara cuando un documento se procesa limpio, sin incidencias ni descuadres.' },
  { id: 'documento.requiere_atencion', label: 'Documento Requiere Atención', desc: 'Se dispara cuando un documento tiene descuadres o incidencias pendientes.' },
  { id: 'incidencia.resuelta_manualmente', label: 'Incidencia Resuelta', desc: 'Se dispara cuando se aprueba manualmente una incidencia.' },
  { id: 'documento.modificado', label: 'Documento Modificado', desc: 'Se dispara cuando se edita un campo de un documento ya procesado.' },
  { id: 'documento.eliminado', label: 'Documento Eliminado', desc: 'Se dispara cuando se elimina un documento.' },
];

export default function WebhooksClient({ empresas, initialWebhooks }: { empresas: any[], initialWebhooks: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (deleteConfirmId === null) return;
    setIsSubmitting(true);
    try {
      const wh = initialWebhooks.find(w => w.id === deleteConfirmId);
      if (!wh) return;
      await deleteWebhookAction(wh.id_de_empresa, deleteConfirmId);
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
      setSuccessMsg('Webhook creado exitosamente.');
      setTimeout(() => setSuccessMsg(null), 4000);
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

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Webhooks</h1>
          <p className="text-gray-500 text-sm mt-1">Configuración oculta — solo admin/testing</p>
        </div>
        <button 
          onClick={() => { setIsModalOpen(true); setErrorMsg(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nuevo Webhook
        </button>
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

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {initialWebhooks.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm mb-1">Todavía no hay webhooks configurados.</p>
            <p className="text-gray-500 text-xs">Creá uno para empezar a recibir notificaciones en tu ERP.</p>
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
              {initialWebhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  {empresas.length > 1 && (
                    <td className="px-6 py-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {empresas.find(e => e.id === wh.id_de_empresa)?.nombre_de_empresa || `ID: ${wh.id_de_empresa}`}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span className="truncate block max-w-[260px] text-blue-600 dark:text-blue-400 font-mono text-xs" title={wh.url_destino}>
                      {wh.url_destino}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {wh.eventos_suscritos.map((ev: string, i: number) => (
                        <span key={i} className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs px-2 py-0.5 rounded-full">
                          {ev.split('.')[1]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${wh.activo ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
                      {wh.activo ? '● Activo' : '● Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-gray-400">
                    {wh.secreto_firma.substring(0, 12)}...
                  </td>
                  <td className="px-6 py-4 text-right">
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


