'use client';

import { useState, useEffect } from 'react';
import React from 'react';
import { getSession } from '@/services/auth-service';
import { useCompanyContext } from '@/context/CompanyProvider';
import {
  HelpCircle,
  Monitor,
  Mail,
  Info,
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
  ChevronUp,
  FolderOpen,
  Folder,
  Zap,
  ZapOff,
  Filter,
  X,
  Trash2,
  ExternalLink,
  RotateCw,
  Sparkles,
  CheckCheck,
  CheckCircle,
} from 'lucide-react';
import { Activity } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useActividad, ActividadFilters } from '@/context/ActividadProvider';
import { DeleteActivityDialog } from '@/components/DeleteActivityDialog';
import { DeleteAllActivitiesDialog } from '@/components/DeleteAllActivitiesDialog';
import { ActivityErrorModal } from '@/components/ActivityErrorModal';
import { useToast } from '@/hooks/use-toast';
// ✅ IMPORTAR EL COMPONENTE TABLE DE SHADCN
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


// ✅ Usar la interfaz exportada del Provider
export type Filters = ActividadFilters;

interface ActivityTableProps {
  empresaId?: string;
  limit?: number;
}

export default function ActivityTable({
  empresaId,
  limit = 50,
}: ActivityTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  // ✅ Usar contexto de compañías
  const { selectedCompanyIds, companies, toggleCompanyId } = useCompanyContext();

  // ✅ Obtener filtros del proveedor de actividad si está disponible
  const actividadContext = useActividad();

  const filters = actividadContext.filters;
  const setFilters = actividadContext.setFilters;


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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [retrying, setRetrying] = useState<Set<number>>(new Set());

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedErrorActivity, setSelectedErrorActivity] = useState<Activity | null>(null);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [showActiveFilterHint, setShowActiveFilterHint] = useState(false);

  // 🆕 Estados para selección múltiple
  const [rowSelection, setRowSelection] = useState<Record<number, boolean>>({});
  const [isBulkMarkingRead, setIsBulkMarkingRead] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  // 🆕 Calcular IDs seleccionados
  const selectedIds = React.useMemo(() => {
    return Object.keys(rowSelection)
      .filter(key => rowSelection[parseInt(key)])
      .map(key => activities[parseInt(key)]?.id)
      .filter(Boolean);
  }, [rowSelection, activities]);

  const [sortConfig, setSortConfig] = useState<{
    key: 'status' | 'documento' | 'empresa' | 'fecha' | 'progreso' | null;
    direction: 'asc' | 'desc';
  }>({
    key: 'fecha',
    direction: 'desc',
  });

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
    { value: 'error', label: 'Error' },
    { value: 'subiendo', label: 'En proceso' },
  ];

  useEffect(() => {
    checkAuth();
    // Mostrar hint si inicia con filtros por defecto
    if (filters.status.length > 0) {
      setShowActiveFilterHint(true);
      const timer = setTimeout(() => setShowActiveFilterHint(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !actividadContext.isLoading) {
      fetchActivities();
    }
  }, [isAuthenticated, empresaId, pagination.offset, filters, selectedCompanyIds, actividadContext.tutorialActive, actividadContext.isLoading]);

  useEffect(() => {
    if (!isAuthenticated || !autoRefreshEnabled || actividadContext.tutorialActive || actividadContext.isLoading) return;
    const interval = setInterval(() => {
      fetchActivities(true);
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, empresaId, autoRefreshEnabled, refreshInterval, selectedCompanyIds, actividadContext.tutorialActive, actividadContext.isLoading]);

  const checkAuth = async () => {
    const session = await getSession();
    setIsAuthenticated(!!session);
  };

  const fetchActivities = async (silent = false) => {
    // ✅ Si no hay empresas seleccionadas, no cargar nada y limpiar estado
    if (selectedCompanyIds.length === 0) {
      setActivities([]);
      setPagination(prev => ({ ...prev, total: 0, hasMore: false }));
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      // ✅ Usar selectedCompanyIds
      if (selectedCompanyIds.length > 0) {
        params.append('empresaId', selectedCompanyIds.join(','));
      }

      if (filters.status && filters.status.length > 0) {
        params.append('status', filters.status.join(','));
      }
      if (filters.tipoDocumento) params.append('tipoDocumento', filters.tipoDocumento);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.searchText) params.append('search', filters.searchText);

      const response = await fetch(`/api/activity?${params}`);
      if (!response.ok) throw new Error('Error al cargar actividades');

      const data = await response.json();
      setActivities(data.actividades);
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total,
        hasMore: data.pagination.hasMore,
      }));
    } catch (err: any) {
      console.error('Error al cargar actividades:', err);
      if (!silent) setError(err.message || 'Error desconocido');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const markActivityAsRead = async (activityId: number) => {
    try {
      const response = await fetch(`/api/activity/${activityId}/mark-read`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al marcar como leída');
      }

      setActivities(prev =>
        prev.map(act =>
          act.id === activityId ? { ...act, is_new: 0 } : act
        )
      );
    } catch (err: any) {
      console.error('Error al marcar como leída:', err);
      toast({
        title: '❌ Error',
        description: 'No se pudo marcar la actividad como leída',
        variant: 'destructive',
      });
    }
  };

  const markAllAsRead = async () => {
    setIsMarkingRead(true);
    try {
      const response = await fetch('/api/activity/mark-all-read', {
        method: 'PATCH',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al marcar todas como leídas');
      }

      const result = await response.json();

      setActivities(prev => prev.map(act => ({ ...act, is_new: 0 })));

      toast({
        title: '✅ Éxito',
        description: `${result.updated} actividades marcadas como leídas`,
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });
    } catch (err: any) {
      console.error('Error al marcar todas como leídas:', err);
      toast({
        title: '❌ Error',
        description: err.message || 'No se pudieron marcar las actividades',
        variant: 'destructive',
      });
    } finally {
      setIsMarkingRead(false);
    }
  };

  // 🆕 Marcar múltiples como vistas
  const handleBulkMarkAsRead = async () => {
    if (selectedIds.length === 0) return;

    // Filtrar solo las actividades que son nuevas (is_new = 1)
    const selectedActivities = selectedIds
      .map(id => activities.find(act => act.id === id))
      .filter((act): act is Activity => act !== undefined);

    const newActivities = selectedActivities.filter(act => act.is_new === 1);
    const alreadyReadCount = selectedActivities.length - newActivities.length;
    const newActivityIds = newActivities.map(act => act.id);

    // Si no hay actividades nuevas para marcar
    if (newActivityIds.length === 0) {
      toast({
        title: 'ℹ️ Información',
        description: 'Todas las actividades seleccionadas ya están marcadas como vistas',
        className: "bg-gradient-to-br from-blue-500 to-cyan-600 text-white",
      });
      return;
    }

    setIsBulkMarkingRead(true);
    try {
      const response = await fetch('/api/activity/mark-multiple-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityIds: newActivityIds })
      });

      if (!response.ok) {
        throw new Error('Error al marcar actividades como vistas');
      }

      const data = await response.json();

      // Refrescar actividades
      await fetchActivities();
      setRowSelection({});

      // Mensaje personalizado según si había actividades ya vistas
      const description = alreadyReadCount > 0
        ? `${newActivityIds.length} actividad${newActivityIds.length !== 1 ? 'es' : ''} marcada${newActivityIds.length !== 1 ? 's' : ''} como vista${newActivityIds.length !== 1 ? 's' : ''}. ${alreadyReadCount} ya estaba${alreadyReadCount !== 1 ? 'n' : ''} vista${alreadyReadCount !== 1 ? 's' : ''}.`
        : `${newActivityIds.length} actividad${newActivityIds.length !== 1 ? 'es' : ''} marcada${newActivityIds.length !== 1 ? 's' : ''} como vista${newActivityIds.length !== 1 ? 's' : ''}`;

      toast({
        title: '✅ Éxito',
        description,
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron marcar las actividades como vistas',
        variant: 'destructive',
      });
    } finally {
      setIsBulkMarkingRead(false);
    }
  };

  // 🆕 Eliminar múltiples (confirmación)
  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const response = await fetch('/api/activity/delete-multiple', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityIds: selectedIds })
      });

      if (!response.ok) {
        throw new Error('Error al eliminar actividades');
      }

      // Refrescar actividades
      await fetchActivities();
      setRowSelection({});
      setIsBulkDeleteDialogOpen(false);

      toast({
        title: '✅ Éxito',
        description: `${selectedIds.length} actividad${selectedIds.length !== 1 ? 'es' : ''} eliminada${selectedIds.length !== 1 ? 's' : ''}`,
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron eliminar las actividades',
        variant: 'destructive',
      });
    } finally {
      setIsBulkDeleting(false);
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
      const response = await fetch(`/api/activity/${activityToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Error al eliminar actividad');
      await fetchActivities();
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
      toast({
        title: '✅ Éxito',
        description: 'Actividad eliminada correctamente',
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      toast({ title: '❌ Error', description: 'Error al eliminar la actividad', variant: 'destructive' });
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
      const response = await fetch('/api/activity/delete-all', { method: 'DELETE' });
      if (!response.ok) throw new Error('Error al eliminar todas las actividades');
      const result = await response.json();
      await fetchActivities();
      setPagination(prev => ({ ...prev, offset: 0 }));
      setDeleteAllDialogOpen(false);
      toast({
        title: '✅ Éxito',
        description: `${result.deleted.activities} actividades eliminadas`,
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });
    } catch (err: any) {
      console.error('Error al eliminar todas las actividades:', err);
      toast({ title: '❌ Error', description: 'Error al eliminar todas las actividades', variant: 'destructive' });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleRetry = async (activity: Activity, e?: React.MouseEvent) => {
    e?.stopPropagation();

    try {
      setRetrying(prev => new Set(prev).add(activity.id));

      const response = await fetch(`/api/activity/${activity.id}/retry`, { method: 'POST' });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Error al reintentar');
      }

      const result = await response.json();
      console.log('✅ Reintento exitoso:', result);

      if (result.uploadId && (window as any).__uploadProgressManager) {
        (window as any).__uploadProgressManager.addUpload(
          result.uploadId,
          activity.documento_nombre
        );
        toast({
          title: '🔄 Reintento iniciado',
          description: `Procesando "${activity.documento_nombre}"`,
          className: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
        });
      } else {
        toast({ title: '⚠️ Aviso', description: 'Reintento iniciado pero no se pudo abrir el modal de progreso' });
      }

      setTimeout(() => fetchActivities(true), 1000);

    } catch (error) {
      console.error('❌ Error al reintentar:', error);
      toast({ title: '❌ Error', description: error instanceof Error ? error.message : 'Error desconocido al reintentar', variant: 'destructive' });
    } finally {
      setRetrying(prev => {
        const newSet = new Set(prev);
        newSet.delete(activity.id);
        return newSet;
      });
    }
  };

  const handleSuccessActivityClick = async (activity: Activity) => {
    if (activity.documento_id) {
      if (activity.is_new === 1) {
        await markActivityAsRead(activity.id);
      }
      router.push(`/documento/${activity.documento_id}`);
    }
  };

  const handleErrorActivityClick = async (activity: Activity) => {
    setSelectedErrorActivity(activity);
    setErrorModalOpen(true);

    if (activity.is_new === 1) {
      await markActivityAsRead(activity.id);
    }
  };

  const handleRetryFromModal = async (activity: Activity) => {
    try {
      setRetrying(prev => new Set(prev).add(activity.id));

      const response = await fetch(`/api/activity/${activity.id}/retry`, { method: 'POST' });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Error al reintentar');
      }

      const result = await response.json();

      if (result.uploadId && (window as any).__uploadProgressManager) {
        (window as any).__uploadProgressManager.addUpload(
          result.uploadId,
          activity.documento_nombre
        );
        toast({
          title: '🔄 Reintento iniciado',
          description: `Procesando "${activity.documento_nombre}"`,
          className: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
        });
      }

      setErrorModalOpen(false);
      setSelectedErrorActivity(null);

      setTimeout(() => fetchActivities(true), 1000);

    } catch (error) {
      console.error('❌ Error al reintentar:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Error desconocido al reintentar',
        variant: 'destructive'
      });
    } finally {
      setRetrying(prev => {
        const newSet = new Set(prev);
        newSet.delete(activity.id);
        return newSet;
      });
    }
  };

  const clearFilters = () => {
    setFilters({
      status: ['fallido', 'interrumpido', 'error'],
      tipoDocumento: '',
      dateFrom: '',
      dateTo: '',
      searchText: ''
    });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleSort = (key: 'status' | 'documento' | 'empresa' | 'fecha' | 'progreso') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ChevronUp className="w-4 h-4 opacity-0 group-hover:opacity-30 transition-opacity" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="w-4 h-4 text-primary" />
      : <ChevronDown className="w-4 h-4 text-primary" />;
  };

  const sortActivities = (activities: Activity[]) => {
    if (!sortConfig.key) return activities;

    const sorted = [...activities].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case 'status':
          const statusOrder = { 'completado': 1, 'fallido': 2, 'interrumpido': 3 };
          aValue = statusOrder[a.status?.toLowerCase() as keyof typeof statusOrder] || 999;
          bValue = statusOrder[b.status?.toLowerCase() as keyof typeof statusOrder] || 999;
          break;
        case 'documento':
          aValue = (a.documento_nombre || '').toLowerCase();
          bValue = (b.documento_nombre || '').toLowerCase();
          break;
        case 'empresa':
          aValue = (a.nombre_de_empresa || '').toLowerCase();
          bValue = (b.nombre_de_empresa || '').toLowerCase();
          break;
        case 'fecha':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'progreso':
          aValue = a.progress || 0;
          bValue = b.progress || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const extractParentNameFromSub = (subDocName: string): string | null => {
    const match = subDocName.match(/^[Ss]ub-[^-]+-(.+)$/i);
    return match ? match[1] : null;
  };

  const isSubDocument = (docName: string): boolean => {
    return /^[Ss]ub-/.test(docName);
  };

  const organizeActivities = () => {
    const sortedActivities = sortActivities(activities);

    const childFiles = sortedActivities.filter(a => a.parent_upload_id);
    const zipUploadIds = new Set(childFiles.map(a => a.parent_upload_id).filter(Boolean));

    const subDocuments = sortedActivities.filter(a => !a.parent_upload_id && isSubDocument(a.documento_nombre));

    const subDocParentMap = new Map<string, Activity[]>();
    subDocuments.forEach(sub => {
      const parentName = extractParentNameFromSub(sub.documento_nombre);
      if (parentName) {
        if (!subDocParentMap.has(parentName)) {
          subDocParentMap.set(parentName, []);
        }
        subDocParentMap.get(parentName)!.push(sub);
      }
    });

    const parentPdfNames = new Set(subDocParentMap.keys());

    const parentFiles = sortedActivities.filter(a =>
      !a.parent_upload_id && !isSubDocument(a.documento_nombre)
    );

    const childrenMap = new Map<string, Activity[]>();

    childFiles.forEach(child => {
      if (!child.parent_upload_id) return;
      if (!childrenMap.has(child.parent_upload_id)) {
        childrenMap.set(child.parent_upload_id, []);
      }
      childrenMap.get(child.parent_upload_id)!.push(child);
    });

    parentFiles.forEach(parent => {
      if (subDocParentMap.has(parent.documento_nombre)) {
        const subs = subDocParentMap.get(parent.documento_nombre)!;
        childrenMap.set(parent.upload_id, subs);
        zipUploadIds.add(parent.upload_id);
      }
    });

    childrenMap.forEach((children, parentId) => {
      childrenMap.set(parentId, sortActivities(children));
    });

    return { parentFiles, childrenMap, zipUploadIds };
  };

  const toggleZip = (uploadId: string) => {
    setExpandedZips(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uploadId)) newSet.delete(uploadId);
      else newSet.add(uploadId);
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'completado') return <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" />;
    if (s === 'fallido' || s === 'error') return <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />;
    if (s === 'interrumpido') return <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />;
    return <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />;
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    let classes = 'bg-primary/20 text-primary border-primary/30';

    if (s === 'completado') classes = 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30';
    if (s === 'fallido' || s === 'error') classes = 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30';
    if (s === 'interrumpido') classes = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30';
    if (s.includes('subiendo') || s.includes('guardando') || s.includes('clasificado')) {
      classes = 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30';
    }

    return (
      <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-sm transition-all duration-200 hover:scale-105 ${classes}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  const getSourceIcon = (source?: string | null) => {
    const sourceMap: Record<string, { icon: JSX.Element; label: string; color: string }> = {
      'dashboard': {
        icon: <Monitor className="w-4 h-4 shrink-0" />,
        label: 'Dashboard',
        color: 'text-blue-500'
      },
      'correo': {
        icon: <Mail className="w-4 h-4 shrink-0" />,
        label: 'Correo',
        color: 'text-green-500'
      },
    };

    const config = source && sourceMap[source.toLowerCase()]
      ? sourceMap[source.toLowerCase()]
      : {
        icon: <HelpCircle className="w-4 h-4 shrink-0" />,
        label: 'Origen desconocido',
        color: 'text-muted-foreground'
      };

    return (
      <div
        className="flex items-center gap-1.5 transition-colors duration-200"
        title={`Origen: ${config.label}`}
      >
        <div className={`${config.color} opacity-70 hover:opacity-100 transition-opacity`}>
          {config.icon}
        </div>
      </div>
    );
  };

  const renderNewBadge = (activity: Activity, children?: Activity[]) => {
    if (children && children.length > 0) {
      const hasUnreadChildren = children.some(child => child.is_new === 1);
      if (!hasUnreadChildren) return null;

      const hasErrorChildren = children.some(
        child => child.is_new === 1 && ['fallido', 'interrumpido', 'error'].includes(child.status.toLowerCase())
      );

      if (hasErrorChildren) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Alerta</span>
          </span>
        );
      }

      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 hover:scale-105 transition-transform">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="hidden sm:inline">Nuevo</span>
        </span>
      );
    }

    if (activity.is_new !== 1) return null;

    const status = activity.status.toLowerCase();
    const isError = status === 'fallido' || status === 'interrumpido' || status === 'error';

    if (isError) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="hidden sm:inline">Alerta</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 hover:scale-105 transition-transform">
        <Sparkles className="w-3 h-3 shrink-0" />
        <span className="hidden sm:inline">Nuevo</span>
      </span>
    );
  };

  const renderActivityRow = (activity: Activity, isChild = false) => {
    const status = activity.status.toLowerCase();
    const canNavigate = status === 'completado' && activity.documento_id;
    const canRetry = ['fallido', 'interrumpido', 'error'].includes(status);
    const isError = canRetry;

    const isFirstRow = !isChild && activities.indexOf(activity) === 0;

    const handleRowClick = () => {
      if (canNavigate) {
        handleSuccessActivityClick(activity);
      } else if (isError) {
        handleErrorActivityClick(activity);
      }
    };

    return (
      <TableRow
        key={activity.id}
        className={`transition-all duration-200 hover:bg-accent/50 ${isChild ? 'bg-muted/30' : ''
          } ${canNavigate || isError ? 'cursor-pointer' : ''} animate-fade-in group`}
        style={{ animationDelay: `${activities.indexOf(activity) * 50}ms` }}
        onClick={handleRowClick}
      >
        {/* 🆕 Columna de checkbox */}
        <TableCell className="px-3 sm:px-6 py-3 sm:py-4 w-[60px]">
          <div
            className="flex items-center justify-center p-2 -m-2 cursor-pointer rounded hover:bg-accent/30 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const newChecked = !rowSelection[activities.indexOf(activity)];
              setRowSelection(prev => ({
                ...prev,
                [activities.indexOf(activity)]: newChecked
              }));
            }}
          >
            <Checkbox
              checked={rowSelection[activities.indexOf(activity)] || false}
              onCheckedChange={(checked) => {
                setRowSelection(prev => ({
                  ...prev,
                  [activities.indexOf(activity)]: !!checked
                }));
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Seleccionar fila"
              className="h-5 w-5 transition-all duration-300 hover:scale-110 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        </TableCell>
        <TableCell
          className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap"
          data-tutorial={isFirstRow ? "actividad-badges" : undefined}
        >
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="group-hover:scale-110 transition-transform duration-200">
              {getStatusIcon(activity.status)}
            </div>
            {getStatusBadge(activity.status)}
            {renderNewBadge(activity)}
          </div>
        </TableCell>
        <TableCell className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              {isChild && <div className="w-4 h-px bg-border ml-2 hidden sm:block" />}
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary group-hover:scale-110 transition-all duration-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-xs sm:text-sm font-medium truncate ${isChild ? 'text-muted-foreground' : ''} group-hover:text-primary transition-colors`}>
                  {activity.documento_nombre}
                </p>
                {canNavigate && <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />}
              </div>
              {activity.tipo_documento && (
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{activity.tipo_documento}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{activity.step}</p>
              {activity.mensaje && (
                <p className="text-xs text-foreground/70 mt-1 max-w-md truncate sm:whitespace-normal">{activity.mensaje}</p>
              )}
              {activity.error_detalle && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-md font-medium truncate sm:whitespace-normal">
                  ⚠️ {activity.error_detalle}
                </p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:scale-110 transition-all duration-200" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{activity.nombre_de_empresa}</p>
              <p className="text-xs text-muted-foreground truncate">{activity.CIF}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden lg:table-cell">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs sm:text-sm text-muted-foreground">{formatDate(activity.created_at)}</p>
          </div>
        </TableCell>
        <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-16 sm:w-24 bg-secondary rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${activity.status.toLowerCase() === 'completado'
                  ? 'bg-green-500'
                  : activity.status.toLowerCase() === 'fallido'
                    ? 'bg-red-500'
                    : 'bg-primary'
                  }`}
                style={{ width: `${activity.progress}%` }}
              />
            </div>
            <span className="text-xs sm:text-sm font-medium text-foreground min-w-[35px] sm:min-w-[45px] group-hover:scale-105 transition-transform">
              {activity.progress}%
            </span>
          </div>
        </TableCell>
        <TableCell
          className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
          data-tutorial={isFirstRow ? "actividad-actions" : undefined}
        >
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex">
              {getSourceIcon(activity['dashboard-correo'])}
            </div>

            {activity.is_new === 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markActivityAsRead(activity.id);
                }}
                className="p-1.5 sm:p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-110"
                title="Marcar leído"
              >
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
              </button>
            )}

            {canRetry && (
              <button
                onClick={(e) => handleRetry(activity, e)}
                disabled={retrying.has(activity.id)}
                className="p-1.5 sm:p-2 hover:bg-accent rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-110"
                title="Reintentar procesamiento"
              >
                <RotateCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0 ${retrying.has(activity.id) ? 'animate-spin' : ''}`} />
              </button>
            )}

            <button
              onClick={() => handleDeleteClick(activity)}
              className="p-1.5 sm:p-2 hover:bg-destructive/10 rounded-lg transition-all duration-200 hover:scale-110 group/delete"
              title="Eliminar actividad"
            >
              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive shrink-0 group-hover/delete:scale-110 transition-transform" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderZipRow = (zipActivity: Activity, children: Activity[]) => {
    const isExpanded = expandedZips.has(zipActivity.upload_id);
    const canRetry = ['fallido', 'interrumpido', 'error'].includes(zipActivity.status.toLowerCase());

    const isFirstZip = activities.indexOf(zipActivity) === 0;

    return (
      <React.Fragment key={zipActivity.upload_id}>
        <TableRow
          className={`transition-all duration-200 cursor-pointer hover:bg-accent/50 animate-fade-in group ${isExpanded ? 'bg-muted/50' : ''
            }`}
          style={{ animationDelay: `${activities.indexOf(zipActivity) * 50}ms` }}
          onClick={() => toggleZip(zipActivity.upload_id)}
          data-tutorial={isFirstZip ? "actividad-zip" : undefined}
        >
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="group-hover:scale-110 transition-transform duration-200">
                {getStatusIcon(zipActivity.status)}
              </div>
              {getStatusBadge(zipActivity.status)}
              {renderNewBadge(zipActivity, children)}
            </div>
          </TableCell>
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                {isExpanded ? (
                  <>
                    <ChevronDown className="w-4 h-4 text-primary shrink-0 animate-in" />
                    <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Folder className="w-4 h-4 sm:w-5 sm:h-5 text-primary mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                  </>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium flex items-center gap-2 group-hover:text-primary transition-colors">
                  <span className="truncate">{zipActivity.documento_nombre}</span>
                  <span className="text-xs text-muted-foreground font-normal whitespace-nowrap bg-muted px-2 py-0.5 rounded-full">
                    {children.length}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{zipActivity.step}</p>
                {zipActivity.mensaje && (
                  <p className="text-xs text-foreground/70 mt-1 max-w-md truncate sm:whitespace-normal">{zipActivity.mensaje}</p>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:scale-110 transition-all duration-200" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{zipActivity.nombre_de_empresa}</p>
                <p className="text-xs text-muted-foreground truncate">{zipActivity.CIF}</p>
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden lg:table-cell">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-xs sm:text-sm text-muted-foreground">{formatDate(zipActivity.created_at)}</p>
            </div>
          </TableCell>
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-16 sm:w-24 bg-secondary rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${zipActivity.status.toLowerCase() === 'completado'
                    ? 'bg-green-500'
                    : zipActivity.status.toLowerCase() === 'fallido'
                      ? 'bg-red-500'
                      : 'bg-primary'
                    }`}
                  style={{ width: `${zipActivity.progress}%` }}
                />
              </div>
              <span className="text-xs sm:text-sm font-medium text-foreground min-w-[35px] sm:min-w-[45px] group-hover:scale-105 transition-transform">
                {zipActivity.progress}%
              </span>
            </div>
          </TableCell>
          <TableCell className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="hidden sm:flex">
                {getSourceIcon(zipActivity['dashboard-correo'])}
              </div>

              {canRetry && (
                <button
                  onClick={(e) => handleRetry(zipActivity, e)}
                  disabled={retrying.has(zipActivity.id)}
                  className="p-1.5 sm:p-2 hover:bg-accent rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-110"
                  title="Reintentar procesamiento"
                >
                  <RotateCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0 ${retrying.has(zipActivity.id) ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => handleDeleteClick(zipActivity)}
                className="p-1.5 sm:p-2 hover:bg-destructive/10 rounded-lg transition-all duration-200 hover:scale-110 group/delete"
                title="Eliminar actividad"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive shrink-0 group-hover/delete:scale-110 transition-transform" />
              </button>
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && children.map(child => renderActivityRow(child, true))}
      </React.Fragment>
    );
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 sm:p-12 animate-fade-in">
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary shrink-0" />
        <span className="ml-3 text-sm sm:text-base">Cargando actividad...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 sm:p-6 text-center backdrop-blur-sm animate-fade-in">
        <XCircle className="w-10 h-10 sm:w-12 sm:h-12 text-destructive mx-auto mb-3 shrink-0" />
        <p className="text-sm sm:text-base text-destructive font-medium">Error al cargar el historial</p>
        <p className="text-xs sm:text-sm text-destructive/80 mt-1">{error}</p>
        <button
          onClick={() => fetchActivities()}
          className="mt-4 px-4 py-2 bg-destructive text-destructive-foreground text-sm rounded-lg hover:bg-destructive/90 transition-all duration-200 hover:scale-105"
        >
          Reintentar
        </button>
      </div>
    );
  }


  if (loading && activities.length === 0) {
    return (
      <div className="w-full space-y-4 p-4 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="flex gap-2">
            <div className="h-9 bg-muted rounded w-24"></div>
            <div className="h-9 bg-muted rounded w-24"></div>
          </div>
        </div>
        <div className="h-16 bg-muted rounded-lg w-full mb-6"></div>
        <div className="space-y-3">
          <div className="h-12 bg-muted rounded w-full"></div>
          <div className="h-12 bg-muted rounded w-full"></div>
          <div className="h-12 bg-muted rounded w-full"></div>
          <div className="h-12 bg-muted rounded w-full"></div>
        </div>
      </div>
    );
  }

  const { parentFiles, childrenMap, zipUploadIds } = organizeActivities();
  const baseFiltersCount = Object.values(filters).filter(v => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== '' && v !== null && v !== undefined;
  }).length;

  // 🔥 Durante el tutorial forzamos a 0 para una UI limpia
  const activeFiltersCount = actividadContext.tutorialActive ? 0 : baseFiltersCount;

  const unreadCount = activities.filter(a => a.is_new === 1).length;

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3 sm:gap-4 animate-fade-in relative z-[60]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-all duration-200 backdrop-blur-sm border hover:scale-105 group"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 group-hover:-translate-x-1 transition-transform" />
              <span>Volver</span>
            </button>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{activities.length}</span> de{' '}
              <span className="font-semibold text-foreground">{pagination.total}</span>
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto relative z-50">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                disabled={isMarkingRead}
                data-tutorial="actividad-mark-read"
                title="Marcar todos como leídos"
                className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium bg-primary/90 hover:bg-primary text-primary-foreground rounded-lg transition-all duration-200 backdrop-blur-sm border border-primary disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 group"
              >
                <CheckCheck className={`w-4 h-4 shrink-0 ${isMarkingRead ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`} />
                <span className="hidden sm:inline">Marcar leídos</span>
                {unreadCount > 0 && (
                  <span className="bg-primary-foreground text-primary rounded-full px-1.5 py-0.5 text-xs font-bold min-w-[20px] text-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}

            {pagination.total > 0 && (
              <button
                onClick={handleDeleteAllClick}
                disabled={isDeletingAll}
                title="Eliminar todas las actividades"
                className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-lg transition-all duration-200 backdrop-blur-sm border border-destructive disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 group"
              >
                <Trash2 className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Eliminar</span>
              </button>
            )}

            <div className="relative z-[100]">
              <button
                onClick={() => {
                  setShowFilters(!showFilters);
                  setShowActiveFilterHint(false);
                }}
                data-tutorial="actividad-filters"
                title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 backdrop-blur-sm border hover:scale-105 ${showFilters || activeFiltersCount > 0
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary hover:bg-secondary/80 border-border'
                  }`}
              >
                <Filter className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-primary-foreground text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
              {showActiveFilterHint && !actividadContext.tutorialActive && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 bg-primary text-primary-foreground text-[10px] py-1 px-2 rounded-md shadow-lg animate-bounce z-[100] text-center pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-primary">
                  Filtros aplicados
                </div>
              )}
            </div>

            <div className="relative z-[80]" data-tutorial="actividad-autorefresh">
              <button
                onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                title={autoRefreshEnabled ? "Desactivar actualización automática" : "Activar actualización automática"}
                className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 backdrop-blur-sm border hover:scale-105 ${autoRefreshEnabled
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30'
                  : 'bg-secondary hover:bg-secondary/80 border-border'
                  }`}
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${autoRefreshEnabled ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Auto</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${autoRefreshEnabled
                  ? 'bg-green-500/30 text-green-600 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
                  }`}>
                  {autoRefreshEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="bg-muted/50 border rounded-lg p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {/* ✅ NUEVO: Filtro de Empresas Separado */}
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Empresa</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal border-dashed h-10">
                      <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      {selectedCompanyIds.length > 0 ? (
                        <>
                          <Badge variant="secondary" className="rounded-sm px-1 font-normal mr-1">
                            {selectedCompanyIds.length}
                          </Badge>
                          <span className="truncate">seleccionadas</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Seleccionar empresa...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar empresa..." />
                      <CommandList>
                        <CommandEmpty>No encontrada.</CommandEmpty>
                        <CommandGroup>
                          {companies.map((company) => {
                            const isSelected = selectedCompanyIds.includes(company.id);
                            return (
                              <CommandItem
                                key={company.id}
                                onSelect={() => {
                                  toggleCompanyId(company.id);
                                  setPagination(prev => ({ ...prev, offset: 0 }));
                                }}
                                className="cursor-pointer"
                              >
                                <div
                                  className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50 [&_svg]:invisible"
                                  )}
                                >
                                  <Check className={cn("h-4 w-4")} />
                                </div>
                                <span className="truncate">{company.name}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Estado</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal border-dashed h-10">
                      <Filter className="mr-2 h-4 w-4" />
                      {filters.status && filters.status.length > 0 ? (
                        <>
                          <Badge variant="secondary" className="mr-1 rounded-sm px-1 font-normal lg:hidden">
                            {filters.status.length}
                          </Badge>
                          <div className="hidden lg:flex space-x-1">
                            {filters.status.length > 2 ? (
                              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                {filters.status.length} seleccionados
                              </Badge>
                            ) : (
                              statusOptions
                                .filter(opt => opt.value !== '' && filters.status.includes(opt.value))
                                .map(opt => (
                                  <Badge variant="secondary" key={opt.value} className="rounded-sm px-1 font-normal">
                                    {opt.label}
                                  </Badge>
                                ))
                            )}
                          </div>
                        </>
                      ) : (
                        <span>Todos los estados</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Estado..." />
                      <CommandList>
                        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                        <CommandGroup>
                          {statusOptions.filter(opt => opt.value !== '').map((option) => {
                            const isSelected = filters.status.includes(option.value);
                            return (
                              <CommandItem
                                key={option.value}
                                onSelect={() => {
                                  setFilters(prev => {
                                    const current = prev.status || [];
                                    const newStatus = isSelected
                                      ? current.filter(value => value !== option.value)
                                      : [...current, option.value];
                                    return { ...prev, status: newStatus };
                                  });
                                  setPagination(prev => ({ ...prev, offset: 0 }));
                                }}
                              >
                                <div
                                  className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50 [&_svg]:invisible"
                                  )}
                                >
                                  <Check className={cn("h-4 w-4")} />
                                </div>
                                {option.label}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {filters.status.length > 0 && (
                          <>
                            <CommandSeparator />
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setFilters(prev => ({ ...prev, status: [] }));
                                  setPagination(prev => ({ ...prev, offset: 0 }));
                                }}
                                className="justify-center text-center"
                              >
                                Borrar filtros
                              </CommandItem>
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Desde</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Hasta</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Buscar</label>
                <input
                  type="text"
                  value={filters.searchText}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
                  placeholder="Nombre, CIF..."
                  className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm bg-background border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-200"
                />
              </div>
            </div>
            {activeFiltersCount > 0 && (
              <div className="mt-3 sm:mt-4 flex items-center justify-between animate-fade-in" style={{ animationDelay: '100ms' }}>
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs sm:text-sm hover:bg-destructive/10 text-destructive rounded-lg transition-all duration-200 hover:scale-105 group"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 group-hover:rotate-90 transition-transform" />
                  Limpiar
                </button>
              </div>
            )}
          </div>
        )}


        {/* ✅ CONTENIDO PRINCIPAL: Tabla o Estados Vacíos */}
        <div
          className="bg-card border rounded-lg overflow-hidden shadow-sm backdrop-blur-sm animate-fade-in"
          style={{ animationDelay: '150ms' }}
          data-tutorial="actividad-table"
        >
          {selectedCompanyIds.length === 0 && !actividadContext.tutorialActive ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-muted/10">
              <Building2 className="w-16 h-16 sm:w-20 sm:h-20 text-muted-foreground/40 mx-auto mb-4 shrink-0" />
              <p className="text-lg sm:text-xl font-medium text-foreground">Selecciona una empresa</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Utiliza el filtro superior "Empresa" o el selector del menú lateral para comenzar a ver la actividad.
              </p>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center bg-muted/10">
              <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground/50 mx-auto mb-4 shrink-0" />
              <p className="text-base sm:text-lg font-medium">No hay actividad registrada</p>
              <p className="text-sm text-muted-foreground mt-2">
                No se encontraron documentos ni actividades para la empresa seleccionada con los filtros actuales.
              </p>
              {activeFiltersCount > 0 && (
                <Button variant="link" onClick={clearFilters} className="mt-2 text-primary">
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 backdrop-blur-sm border-b">
                <TableRow>
                  {/* 🆕 Columna de checkbox */}
                  <TableHead className="w-[180px] px-3 sm:px-6 py-2 sm:py-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={activities.length > 0 && activities.every((_, idx) => rowSelection[idx])}
                        onCheckedChange={(checked) => {
                          const newSelection: Record<number, boolean> = {};
                          if (checked) {
                            activities.forEach((_, idx) => { newSelection[idx] = true; });
                          }
                          setRowSelection(newSelection);
                        }}
                        aria-label="Seleccionar todos"
                        className="h-5 w-5 transition-all duration-300 hover:scale-110 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <span className="font-medium text-xs uppercase tracking-wider">Selección Múltiple</span>
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('status')}
                    className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-accent/50 transition-all duration-200 select-none group"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span>Estado</span>
                      {getSortIcon('status')}
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('documento')}
                    className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-accent/50 transition-all duration-200 select-none group"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span>Documento</span>
                      {getSortIcon('documento')}
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('empresa')}
                    className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-accent/50 transition-all duration-200 select-none hidden md:table-cell group"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span>Empresa</span>
                      {getSortIcon('empresa')}
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('fecha')}
                    className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-accent/50 transition-all duration-200 select-none hidden lg:table-cell group"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span>Fecha</span>
                      {getSortIcon('fecha')}
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('progreso')}
                    className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-accent/50 transition-all duration-200 select-none hidden sm:table-cell group"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span>Progreso</span>
                      {getSortIcon('progreso')}
                    </div>
                  </TableHead>
                  <TableHead className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/50">
                {parentFiles.map(activity => {
                  if (zipUploadIds.has(activity.upload_id)) {
                    const children = childrenMap.get(activity.upload_id) || [];
                    return renderZipRow(activity, children);
                  }
                  return renderActivityRow(activity);
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {pagination.hasMore && (
          <div className="flex justify-center mt-4 sm:mt-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <button
              onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
              disabled={loading}
              className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin shrink-0" />
                  <span>Cargando...</span>
                </>
              ) : (
                <>
                  <span>Cargar más</span>
                  <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 group-hover:translate-y-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <DeleteActivityDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        activityName={activityToDelete?.documento_nombre || ''}
        isDeleting={isDeleting}
      />

      <DeleteAllActivitiesDialog
        isOpen={deleteAllDialogOpen}
        onOpenChange={setDeleteAllDialogOpen}
        onConfirm={handleConfirmDeleteAll}
        activityCount={pagination.total}
        isDeleting={isDeletingAll}
      />

      {/* 🆕 FLOATING BULK ACTIONS BAR */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none">
          <div className="glass-panel pointer-events-auto rounded-full px-6 py-3 shadow-2xl flex items-center gap-4 border border-primary/20 bg-background/80 backdrop-blur-xl">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              <span className="font-bold text-primary">{selectedIds.length}</span> seleccionado{selectedIds.length !== 1 ? 's' : ''}
            </span>
            <div className="h-4 w-px bg-border"></div>

            {/* Botón Marcar como Vistas */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-9 px-5 shadow-sm hover:shadow-md transition-all border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
              onClick={handleBulkMarkAsRead}
              disabled={isBulkMarkingRead || isBulkDeleting}
            >
              {isBulkMarkingRead ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Marcando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Marcar como vistas
                </span>
              )}
            </Button>

            {/* Botón Eliminar */}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              disabled={isBulkDeleting || isBulkMarkingRead}
              className="rounded-full h-9 px-5 shadow-sm hover:shadow-md transition-all"
            >
              {isBulkDeleting ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Eliminar {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}
            </Button>

            {/* Botón Cancelar */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRowSelection({})}
              className="rounded-full h-8 w-8 ml-1 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="sr-only">Cancelar</span>
              <div className="h-4 w-4 font-bold">✕</div>
            </Button>
          </div>
        </div>
      )}

      {/* 🆕 BULK DELETE CONFIRMATION DIALOG */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg transition-all duration-300 animate-in fade-in zoom-in-95">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Eliminar {selectedIds.length} actividad{selectedIds.length !== 1 ? 'es' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2 pt-2">
              <p>
                Esta acción <span className="font-semibold text-destructive">no se puede deshacer</span>.
                Estás a punto de eliminar permanentemente <span className="font-bold text-foreground">{selectedIds.length} registro{selectedIds.length !== 1 ? 's' : ''} de actividad</span>.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              disabled={isBulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActivityErrorModal
        isOpen={errorModalOpen}
        onOpenChange={setErrorModalOpen}
        activity={selectedErrorActivity}
        onRetry={(activity) => handleRetry(activity)}
        isRetrying={selectedErrorActivity ? retrying.has(selectedErrorActivity.id) : false}
      />

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
          }
          
          .group-hover\:scale-110,
          .hover\:scale-105,
          .group-hover\:-translate-x-1,
          .group-hover\:translate-y-1,
          .group-hover\:rotate-90 {
            transform: none !important;
          }
        }

        @media (min-width: 475px) {
          .xs\:inline {
            display: inline;
          }
        }
      `}</style>
    </>
  );
}