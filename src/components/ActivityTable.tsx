'use client';

import { useState, useEffect } from 'react';
import { getSession } from '@/services/auth-service';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Building2,
  Calendar,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Activity {
  id: number;
  upload_id: string;
  id_de_empresa: number;
  documento_id: number | null;
  documento_nombre: string;
  documento_tipo: string;
  status: string;
  step: string;
  progress: number;
  mensaje: string;
  error_detalle: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  nombre_de_empresa: string;
  CIF: string;
}

interface ActivityTableProps {
  empresaId?: string;
  limit?: number;
}

export default function ActivityTable({ empresaId, limit = 50 }: ActivityTableProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit,
    offset: 0,
    hasMore: false,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchActivities();
    }
  }, [isAuthenticated, empresaId, pagination.offset]);

  const checkAuth = async () => {
    const session = await getSession();
    setIsAuthenticated(!!session);
  };

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      if (empresaId) {
        params.append('empresaId', empresaId);
      }

      const response = await fetch(`/api/activity?${params}`);
      
      if (!response.ok) {
        throw new Error('Error al cargar actividades');
      }

      const data = await response.json();
      
      setActivities(data.actividades);
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total,
        hasMore: data.pagination.hasMore,
      }));

    } catch (err: any) {
      console.error('Error al cargar actividades:', err);
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    const statusLower = status.toLowerCase();
    
    if (statusLower === 'completado') {
      return <CheckCircle2 className="w-5 h-5 text-violet-600" />;
    }
    if (statusLower === 'fallido' || statusLower === 'error') {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (statusLower === 'interrumpido') {
      return <AlertCircle className="w-5 h-5 text-amber-500" />;
    }
    return <Clock className="w-5 h-5 text-violet-400" />;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    
    let bgColor = 'bg-gray-100 text-gray-800';
    if (statusLower === 'completado') bgColor = 'bg-violet-100 text-violet-800';
    if (statusLower === 'fallido' || statusLower === 'error') bgColor = 'bg-red-100 text-red-800';
    if (statusLower === 'interrumpido') bgColor = 'bg-amber-100 text-amber-800';
    if (statusLower.includes('subiendo') || statusLower.includes('guardando') || statusLower.includes('clasificado')) {
      bgColor = 'bg-violet-50 text-violet-700';
    }
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${bgColor}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        <span className="ml-3 text-gray-600">Cargando actividad...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-red-800 font-medium">Error al cargar el historial</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={fetchActivities}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-12 text-center">
        <FileText className="w-16 h-16 text-violet-400 mx-auto mb-4" />
        <p className="text-violet-900 font-medium text-lg">No hay actividad registrada</p>
        <p className="text-violet-600 text-sm mt-2">
          Los documentos subidos aparecerán aquí
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con contador y botón refrescar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          Mostrando <span className="font-semibold text-violet-600">{activities.length}</span> de{' '}
          <span className="font-semibold text-violet-600">{pagination.total}</span> actividades
        </p>
        <button
          onClick={fetchActivities}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Tabla de actividades - SIN bg-white en ningún lado */}
      <div className="bg-gradient-to-br from-white via-violet-50/40 to-violet-100/50 border border-violet-200 rounded-lg overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-violet-100/70 backdrop-blur-sm border-b border-violet-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-violet-700 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-violet-700 uppercase tracking-wider">
                  Documento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-violet-700 uppercase tracking-wider">
                  Empresa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-violet-700 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-violet-700 uppercase tracking-wider">
                  Progreso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-200/50">
              {activities.map((activity) => (
                <tr key={activity.id} className="hover:bg-violet-200/30 transition-colors duration-150">
                  {/* Estado */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(activity.status)}
                      {getStatusBadge(activity.status)}
                    </div>
                  </td>

                  {/* Documento */}
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-violet-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {activity.documento_nombre}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {activity.step}
                        </p>
                        {activity.mensaje && (
                          <p className="text-xs text-gray-700 mt-1 max-w-md">
                            {activity.mensaje}
                          </p>
                        )}
                        {activity.error_detalle && (
                          <p className="text-xs text-red-700 mt-1 max-w-md font-medium">
                            ⚠️ {activity.error_detalle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Empresa */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-violet-500" />
                      <div>
                        <p className="text-sm text-gray-900 font-medium">{activity.nombre_de_empresa}</p>
                        <p className="text-xs text-gray-600">{activity.CIF}</p>
                      </div>
                    </div>
                  </td>

                  {/* Fecha */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-violet-500" />
                      <p className="text-sm text-gray-700">
                        {formatDate(activity.created_at)}
                      </p>
                    </div>
                  </td>

                  {/* Progreso */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-violet-200/50 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            activity.status.toLowerCase() === 'completado'
                              ? 'bg-violet-600'
                              : activity.status.toLowerCase() === 'fallido'
                              ? 'bg-red-500'
                              : 'bg-violet-400'
                          }`}
                          style={{ width: `${activity.progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-800 min-w-[45px]">
                        {activity.progress}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {pagination.hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            disabled={loading}
            className="px-6 py-2.5 font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 active:bg-violet-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Cargando...</span>
              </>
            ) : (
              <span>Cargar más</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}