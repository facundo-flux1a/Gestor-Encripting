'use client';

import { useState, useEffect } from 'react';
import React from 'react';
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
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Zap,
  ZapOff,
  Filter,
  X,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DeleteActivityDialog } from '@/components/DeleteActivityDialog';
import { DeleteAllActivitiesDialog } from '@/components/DeleteAllActivitiesDialog';

interface Activity {
  id: number;
  upload_id: string;
  parent_upload_id: string | null;
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
  tipo_documento?: string;
  numero_documento?: string;
  empresa_emisora?: string;
  cliente?: string;
}

interface Filters {
  status: string;
  tipoDocumento: string;
  dateFrom: string;
  dateTo: string;
  searchText: string;
}

interface ActivityTableProps {
  empresaId?: string;
  limit?: number;
}

export default function ActivityTable({ 
  empresaId, 
  limit = 50,
}: ActivityTableProps) {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [expandedZips, setExpandedZips] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit,
    offset: 0,
    hasMore: false,
  });

  // Estado para el modal de eliminación individual
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado para el modal de eliminación masiva
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Filtros
  const [filters, setFilters] = useState<Filters>({
    status: '',
    tipoDocumento: '',
    dateFrom: '',
    dateTo: '',
    searchText: '',
  });

  // Control de auto-refresh
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);

  const intervalOptions = [
    { value: 5, label: '5 seg' },
    { value: 10, label: '10 seg' },
    { value: 30, label: '30 seg' },
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
  ];

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: 'completado', label: 'Completado' },
    { value: 'fallido', label: 'Fallido' },
    { value: 'interrumpido', label: 'Interrumpido' },
    { value: 'subiendo', label: 'En proceso' },
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchActivities();
    }
  }, [isAuthenticated, empresaId, pagination.offset, filters]);

  useEffect(() => {
    if (!isAuthenticated || !autoRefreshEnabled) return;

    const interval = setInterval(() => {
      fetchActivities(true);
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, empresaId, autoRefreshEnabled, refreshInterval]);

  const checkAuth = async () => {
    const session = await getSession();
    setIsAuthenticated(!!session);
  };

  const fetchActivities = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      if (empresaId) params.append('empresaId', empresaId);
      if (filters.status) params.append('status', filters.status);
      if (filters.tipoDocumento) params.append('tipoDocumento', filters.tipoDocumento);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.searchText) params.append('search', filters.searchText);

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
      if (!silent) {
        setError(err.message || 'Error desconocido');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleDeleteClick = (activity: Activity) => {
    setActivityToDelete(activity);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!activityToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/activity/${activityToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error al eliminar actividad');
      }

      await fetchActivities();
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      alert('Error al eliminar la actividad');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllClick = () => {
    setDeleteAllDialogOpen(true);
  };

  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const response = await fetch('/api/activity/delete-all', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error al eliminar todas las actividades');
      }

      const result = await response.json();
      
      // Resetear todo
      await fetchActivities();
      setPagination(prev => ({ ...prev, offset: 0 }));
      setDeleteAllDialogOpen(false);
      
      // Mostrar mensaje de éxito
      alert(`✅ ${result.deleted.activities} actividades y ${result.deleted.documents} documentos eliminados correctamente`);
      
    } catch (err: any) {
      console.error('Error al eliminar todas las actividades:', err);
      alert('Error al eliminar todas las actividades');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleDocumentClick = (documentId: number | null) => {
    if (documentId) {
      router.push(`/documento/${documentId}`);
    }
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      tipoDocumento: '',
      dateFrom: '',
      dateTo: '',
      searchText: '',
    });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const organizeActivities = () => {
    const childFiles = activities.filter(a => a.parent_upload_id);
    const zipUploadIds = new Set(childFiles.map(a => a.parent_upload_id).filter(Boolean));
    const parentFiles = activities.filter(a => !a.parent_upload_id);
    const zipFiles = parentFiles.filter(a => zipUploadIds.has(a.upload_id));
    const regularFiles = parentFiles.filter(a => !zipUploadIds.has(a.upload_id));

    const childrenMap = new Map<string, Activity[]>();
    childFiles.forEach(child => {
      if (!child.parent_upload_id) return;
      if (!childrenMap.has(child.parent_upload_id)) {
        childrenMap.set(child.parent_upload_id, []);
      }
      childrenMap.get(child.parent_upload_id)!.push(child);
    });

    return { zipFiles, regularFiles, childrenMap };
  };

  const toggleZip = (uploadId: string) => {
    setExpandedZips(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uploadId)) {
        newSet.delete(uploadId);
      } else {
        newSet.add(uploadId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    const statusLower = status.toLowerCase();
    
    if (statusLower === 'completado') {
      return <CheckCircle2 className="w-5 h-5 text-violet-400" />;
    }
    if (statusLower === 'fallido' || statusLower === 'error') {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    if (statusLower === 'interrumpido') {
      return <AlertCircle className="w-5 h-5 text-amber-400" />;
    }
    return <Clock className="w-5 h-5 text-violet-300" />;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    
    let bgColor = 'bg-violet-900/40 text-violet-200';
    if (statusLower === 'completado') bgColor = 'bg-violet-500/30 text-violet-100';
    if (statusLower === 'fallido' || statusLower === 'error') bgColor = 'bg-red-500/30 text-red-200';
    if (statusLower === 'interrumpido') bgColor = 'bg-amber-500/30 text-amber-200';
    if (statusLower.includes('subiendo') || statusLower.includes('guardando') || statusLower.includes('clasificado')) {
      bgColor = 'bg-violet-400/30 text-violet-100';
    }
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${bgColor} backdrop-blur-sm`}>
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

  const renderActivityRow = (activity: Activity, isChild = false) => {
    const canNavigate = activity.status.toLowerCase() === 'completado' && activity.documento_id;
    
    return (
      <tr 
        key={activity.id} 
        className={`transition-colors duration-150 ${
          isChild 
            ? 'bg-violet-600/25 hover:bg-violet-500/35' 
            : 'hover:bg-violet-600/25'
        } ${canNavigate ? 'cursor-pointer' : ''}`}
        onClick={() => canNavigate && handleDocumentClick(activity.documento_id)}
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            {getStatusIcon(activity.status)}
            {getStatusBadge(activity.status)}
          </div>
        </td>

        <td className="px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              {isChild && <div className="w-4 h-px bg-violet-400/50 ml-2" />}
              <FileText className="w-5 h-5 text-violet-300 mt-0.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${isChild ? 'text-violet-200' : 'text-violet-100'}`}>
                  {activity.documento_nombre}
                </p>
                {canNavigate && (
                  <ExternalLink className="w-4 h-4 text-violet-400" />
                )}
              </div>
              {activity.tipo_documento && (
                <p className="text-xs text-violet-300 mt-0.5">
                  {activity.tipo_documento}
                </p>
              )}
              <p className="text-xs text-violet-300 mt-1">
                {activity.step}
              </p>
              {activity.mensaje && (
                <p className="text-xs text-violet-200 mt-1 max-w-md">
                  {activity.mensaje}
                </p>
              )}
              {activity.error_detalle && (
                <p className="text-xs text-red-300 mt-1 max-w-md font-medium">
                  ⚠️ {activity.error_detalle}
                </p>
              )}
            </div>
          </div>
        </td>

        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-300" />
            <div>
              <p className="text-sm text-violet-100 font-medium">{activity.nombre_de_empresa}</p>
              <p className="text-xs text-violet-300">{activity.CIF}</p>
            </div>
          </div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-300" />
            <p className="text-sm text-violet-200">
              {formatDate(activity.created_at)}
            </p>
          </div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="w-24 bg-violet-900/50 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  activity.status.toLowerCase() === 'completado'
                    ? 'bg-violet-400'
                    : activity.status.toLowerCase() === 'fallido'
                    ? 'bg-red-400'
                    : 'bg-violet-500'
                }`}
                style={{ width: `${activity.progress}%` }}
              />
            </div>
            <span className="text-sm font-medium text-violet-200 min-w-[45px]">
              {activity.progress}%
            </span>
          </div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleDeleteClick(activity)}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Eliminar actividad"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </td>
      </tr>
    );
  };

  const renderZipRow = (zipActivity: Activity, children: Activity[]) => {
    const isExpanded = expandedZips.has(zipActivity.upload_id);
    
    return (
      <React.Fragment key={zipActivity.upload_id}>
        <tr 
          className={`transition-colors duration-150 cursor-pointer ${
            isExpanded 
              ? 'bg-violet-600/35 hover:bg-violet-500/45' 
              : 'hover:bg-violet-600/25'
          }`}
          onClick={() => toggleZip(zipActivity.upload_id)}
        >
          <td className="px-6 py-4 whitespace-nowrap">
            <div className="flex items-center gap-3">
              {getStatusIcon(zipActivity.status)}
              {getStatusBadge(zipActivity.status)}
            </div>
          </td>

          <td className="px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                {isExpanded ? (
                  <>
                    <ChevronDown className="w-4 h-4 text-violet-300" />
                    <FolderOpen className="w-5 h-5 text-violet-400 mt-0.5" />
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4 text-violet-300" />
                    <Folder className="w-5 h-5 text-violet-400 mt-0.5" />
                  </>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-violet-100 flex items-center gap-2">
                  {zipActivity.documento_nombre}
                  <span className="text-xs text-violet-300 font-normal">
                    ({children.length} archivo{children.length !== 1 ? 's' : ''})
                  </span>
                </p>
                <p className="text-xs text-violet-300 mt-1">
                  {zipActivity.step}
                </p>
                {zipActivity.mensaje && (
                  <p className="text-xs text-violet-200 mt-1 max-w-md">
                    {zipActivity.mensaje}
                  </p>
                )}
              </div>
            </div>
          </td>

          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-300" />
              <div>
                <p className="text-sm text-violet-100 font-medium">{zipActivity.nombre_de_empresa}</p>
                <p className="text-xs text-violet-300">{zipActivity.CIF}</p>
              </div>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-300" />
              <p className="text-sm text-violet-200">
                {formatDate(zipActivity.created_at)}
              </p>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="flex items-center gap-3">
              <div className="w-24 bg-violet-900/50 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    zipActivity.status.toLowerCase() === 'completado'
                      ? 'bg-violet-400'
                      : zipActivity.status.toLowerCase() === 'fallido'
                      ? 'bg-red-400'
                      : 'bg-violet-500'
                  }`}
                  style={{ width: `${zipActivity.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-violet-200 min-w-[45px]">
                {zipActivity.progress}%
              </span>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleDeleteClick(zipActivity)}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
              title="Eliminar actividad"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </td>
        </tr>

        {isExpanded && children.map(child => renderActivityRow(child, true))}
      </React.Fragment>
    );
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-violet-200">Cargando actividad...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 text-center backdrop-blur-sm">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-200 font-medium">Error al cargar el historial</p>
        <p className="text-red-300 text-sm mt-1">{error}</p>
        <button
          onClick={() => fetchActivities()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (activities.length === 0 && !showFilters) {
    return (
      <div className="bg-violet-900/30 border border-violet-500/50 rounded-lg p-12 text-center backdrop-blur-sm">
        <FileText className="w-16 h-16 text-violet-400 mx-auto mb-4" />
        <p className="text-violet-100 font-medium text-lg">No hay actividad registrada</p>
        <p className="text-violet-300 text-sm mt-2">
          Los documentos subidos aparecerán aquí
        </p>
      </div>
    );
  }

  const { zipFiles, regularFiles, childrenMap } = organizeActivities();
  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-700/50 hover:bg-violet-700 text-violet-100 rounded-lg transition-all duration-200 backdrop-blur-sm border border-violet-500/30"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
            
            <p className="text-sm text-violet-300">
              Mostrando <span className="font-semibold text-violet-200">{activities.length}</span> de{' '}
              <span className="font-semibold text-violet-200">{pagination.total}</span> actividades
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Botón Eliminar Todo - Solo se muestra si hay actividades */}
            {pagination.total > 0 && (
              <button
                onClick={handleDeleteAllClick}
                disabled={isDeletingAll}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar todo</span>
              </button>
            )}

            {/* Botón Filtros */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 backdrop-blur-sm border ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-violet-600 text-white border-violet-500'
                  : 'bg-violet-700/50 text-violet-100 border-violet-500/30 hover:bg-violet-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="bg-violet-400 text-violet-900 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Auto-refresh */}
            <div className="relative">
              <div className="flex items-center gap-2 bg-violet-800/40 backdrop-blur-sm border border-violet-600/30 rounded-lg px-3 py-2">
                <button
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    autoRefreshEnabled 
                      ? 'text-violet-200' 
                      : 'text-violet-400'
                  }`}
                >
                  {autoRefreshEnabled ? (
                    <Zap className="w-4 h-4 text-green-400" />
                  ) : (
                    <ZapOff className="w-4 h-4" />
                  )}
                  <span>Auto</span>
                </button>
                
                {autoRefreshEnabled && (
                  <>
                    <div className="w-px h-4 bg-violet-600/50" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowIntervalMenu(!showIntervalMenu);
                      }}
                      className="text-sm text-violet-200 hover:text-violet-100 font-medium px-2 py-0.5 rounded hover:bg-violet-700/30 transition-colors"
                    >
                      {intervalOptions.find(opt => opt.value === refreshInterval)?.label}
                    </button>
                  </>
                )}
              </div>
              
              {showIntervalMenu && autoRefreshEnabled && (
                <>
                  <div 
                    className="fixed inset-0 z-10"
                    onClick={() => setShowIntervalMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 bg-violet-900 border border-violet-700 rounded-lg shadow-xl z-20 py-1 min-w-[100px]">
                    {intervalOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefreshInterval(option.value);
                          setShowIntervalMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          refreshInterval === option.value
                            ? 'bg-violet-700 text-violet-100 font-medium'
                            : 'text-violet-200 hover:bg-violet-800/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Refresh manual */}
            <button
              onClick={() => fetchActivities()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Panel de Filtros */}
        {showFilters && (
          <div className="bg-violet-900/40 border border-violet-700/50 rounded-lg p-4 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Estado */}
              <div>
                <label className="block text-sm font-medium text-violet-200 mb-2">
                  Estado
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 bg-violet-950/50 border border-violet-700 rounded-lg text-violet-100 focus:outline-none focus:border-violet-500"
                >
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Fecha desde */}
              <div>
                <label className="block text-sm font-medium text-violet-200 mb-2">
                  Desde
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 bg-violet-950/50 border border-violet-700 rounded-lg text-violet-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Fecha hasta */}
              <div>
                <label className="block text-sm font-medium text-violet-200 mb-2">
                  Hasta
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 bg-violet-950/50 border border-violet-700 rounded-lg text-violet-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Búsqueda */}
              <div>
                <label className="block text-sm font-medium text-violet-200 mb-2">
                  Buscar
                </label>
                <input
                  type="text"
                  value={filters.searchText}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
                  placeholder="Nombre, CIF, documento..."
                  className="w-full px-3 py-2 bg-violet-950/50 border border-violet-700 rounded-lg text-violet-100 placeholder-violet-400 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-violet-300">
                  {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''} activo{activeFiltersCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-3 py-1 text-sm text-violet-200 hover:text-violet-100 hover:bg-violet-700/30 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tabla */}
        <div className="bg-gradient-to-br from-violet-950/90 via-violet-900/80 to-violet-950/90 border border-violet-700/50 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead className="bg-violet-800/60 backdrop-blur-sm border-b border-violet-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Empresa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Progreso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-violet-200 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-800/30">
                {zipFiles.map(zipActivity => {
                  const children = childrenMap.get(zipActivity.upload_id) || [];
                  return renderZipRow(zipActivity, children);
                })}
                
                {regularFiles.map(activity => renderActivityRow(activity))}
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

      {/* Modal de confirmación de eliminación individual */}
      <DeleteActivityDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        activityName={activityToDelete?.documento_nombre || ''}
        isDeleting={isDeleting}
      />

      {/* Modal de confirmación de eliminación masiva */}
      <DeleteAllActivitiesDialog
        isOpen={deleteAllDialogOpen}
        onOpenChange={setDeleteAllDialogOpen}
        onConfirm={handleConfirmDeleteAll}
        activityCount={pagination.total}
        isDeleting={isDeletingAll}
      />
    </>
  );
}