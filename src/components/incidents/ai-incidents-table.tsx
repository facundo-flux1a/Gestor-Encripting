'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIIncident {
  id: number;
  documento_id: number;
  tipo: string;
  descripcion: string;
  severidad: 'baja' | 'media' | 'alta';
  provider: string;
  model: string;
  created_at: string;
  numero_documento: string;
  tipo_documento: string;
  empresa_nombre: string;
  fecha_emision: string;
  importe_total: number;
  proveedor_nombre: string;
}

interface AIIncidentsTableProps {
  empresaIds: number[];
  onRefresh?: () => void;
}

export function AIIncidentsTable({ empresaIds, onRefresh }: AIIncidentsTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<AIIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [severidadFilter, setSeveridadFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      console.log('🔄 [AIIncidentsTable] Cargando con empresas:', empresaIds);
      
      const params = new URLSearchParams();
      
      if (empresaIds && empresaIds.length > 0) {
        empresaIds.forEach(id => params.append('empresaIds', id.toString()));
      }
      
      if (severidadFilter !== 'all') params.append('severidad', severidadFilter);
      if (providerFilter !== 'all') params.append('provider', providerFilter);

      const response = await fetch(`/api/ai-incidents?${params}`);
      
      if (!response.ok) {
        throw new Error('Error al cargar incidencias');
      }

      const data = await response.json();
      setIncidents(data);
      console.log('✅ [AIIncidentsTable] Incidencias AI cargadas:', data.length);
    } catch (error) {
      console.error('❌ [AIIncidentsTable] Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las incidencias de IA',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [empresaIds, severidadFilter, providerFilter]);

  const handleDelete = async (incidentId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta incidencia?')) {
      return;
    }

    try {
      setDeletingId(incidentId);

      const response = await fetch('/api/ai-incidents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      });

      if (!response.ok) {
        throw new Error('Error al eliminar incidencia');
      }

      toast({
        title: 'Éxito',
        description: 'Incidencia eliminada correctamente',
      });

      loadIncidents();
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error deleting incident:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la incidencia',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'alta': return 'destructive';
      case 'media': return 'default';
      case 'baja': return 'secondary';
      default: return 'outline';
    }
  };

  const getProviderColor = (provider: string) => {
    return provider === 'openai' ? 'default' : 'secondary';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-purple-600" />
          Incidencias Detectadas por IA
        </CardTitle>
        <CardDescription>
          Incidencias encontradas automáticamente durante el análisis manual con IA
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={severidadFilter} onValueChange={setSeveridadFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por severidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las severidades</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por proveedor IA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron incidencias con los filtros aplicados
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Tipo Incidencia</TableHead>
                  <TableHead>Motivo / Descripción</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>IA Usada</TableHead>
                  <TableHead>Fecha Detección</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    {/* Columna: Documento */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{incident.numero_documento || 'Sin número'}</div>
                        <div className="text-xs text-muted-foreground">
                          {incident.tipo_documento}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {incident.empresa_nombre}
                        </div>
                        <div className="text-xs font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(incident.importe_total)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(incident.fecha_emision).toLocaleDateString('es-AR')}
                        </div>
                      </div>
                    </TableCell>

                    {/* Columna: Proveedor */}
                    <TableCell>
                      <div className="text-sm font-medium">{incident.proveedor_nombre}</div>
                    </TableCell>

                    {/* Columna: Tipo de Incidencia */}
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {incident.tipo}
                      </Badge>
                    </TableCell>

                    {/* Columna: Descripción/Motivo */}
                    <TableCell className="max-w-md">
                      <div 
                        className="text-sm line-clamp-2 cursor-help" 
                        title={incident.descripcion}
                      >
                        {incident.descripcion}
                      </div>
                    </TableCell>

                    {/* Columna: Severidad */}
                    <TableCell>
                      <Badge variant={getSeverityColor(incident.severidad)}>
                        {incident.severidad.toUpperCase()}
                      </Badge>
                    </TableCell>

                    {/* Columna: Proveedor IA */}
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={getProviderColor(incident.provider)} className="whitespace-nowrap">
                          {incident.provider}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {incident.model}
                        </div>
                      </div>
                    </TableCell>

                    {/* Columna: Fecha */}
                    <TableCell>
                      <div className="text-sm whitespace-nowrap">
                        {new Date(incident.created_at).toLocaleDateString('es-AR')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(incident.created_at).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </TableCell>

                    {/* Columna: Acciones */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/documento/${incident.documento_id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(incident.id)}
                          disabled={deletingId === incident.id}
                        >
                          {deletingId === incident.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}