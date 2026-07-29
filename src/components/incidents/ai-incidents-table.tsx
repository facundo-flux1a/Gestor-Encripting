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
import { Eye, Trash2, Loader2, AlertTriangle, Filter } from 'lucide-react';
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
        title: '✅ Éxito',
        description: 'Incidencia eliminada correctamente',
        className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
      });

      loadIncidents();
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error deleting incident:', error);
      toast({
        title: '❌ Error',
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
    <Card className="transition-all duration-300 hover:shadow-lg">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <div className="p-1.5 bg-purple-500/10 rounded-lg shrink-0">
            <AlertTriangle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <span className="line-clamp-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Incidencias Detectadas por IA
          </span>
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Incidencias encontradas automáticamente durante el análisis manual con IA
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros - Responsive con hover effects */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <div className="flex-1">
            <Select value={severidadFilter} onValueChange={setSeveridadFilter}>
              <SelectTrigger className="w-full hover:bg-accent transition-colors duration-200">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar por severidad" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="hover:bg-accent transition-colors duration-150">
                  Todas las severidades
                </SelectItem>
                <SelectItem value="alta" className="hover:bg-accent transition-colors duration-150">
                  Alta
                </SelectItem>
                <SelectItem value="media" className="hover:bg-accent transition-colors duration-150">
                  Media
                </SelectItem>
                <SelectItem value="baja" className="hover:bg-accent transition-colors duration-150">
                  Baja
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full hover:bg-accent transition-colors duration-200">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar por proveedor IA" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="hover:bg-accent transition-colors duration-150">
                  Todos los proveedores
                </SelectItem>
                <SelectItem value="openai" className="hover:bg-accent transition-colors duration-150">
                  OpenAI
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabla - Con scroll horizontal en mobile y hover effects */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">Cargando incidencias...</span>
            </div>
          </div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm bg-muted/30 rounded-lg border border-dashed border-border">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">No se encontraron incidencias</p>
            <p className="text-xs mt-1">Prueba con otros filtros</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 overflow-x-auto transition-all duration-300 hover:border-border hover:shadow-md">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-muted/80 transition-colors duration-200">
                  <TableHead className="min-w-[180px] font-semibold">Documento</TableHead>
                  <TableHead className="min-w-[120px] font-semibold">Proveedor</TableHead>
                  <TableHead className="min-w-[140px] font-semibold">Tipo Incidencia</TableHead>
                  <TableHead className="min-w-[200px] font-semibold">Motivo / Descripción</TableHead>
                  <TableHead className="min-w-[100px] font-semibold">Severidad</TableHead>
                  <TableHead className="min-w-[120px] font-semibold">IA Usada</TableHead>
                  <TableHead className="min-w-[120px] font-semibold">Fecha Detección</TableHead>
                  <TableHead className="text-right min-w-[100px] font-semibold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident, index) => (
                  <TableRow 
                    key={incident.id}
                    className="hover:bg-muted/50 transition-colors duration-200 animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Columna: Documento */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm transition-colors duration-300 hover:text-primary">
                          {incident.numero_documento || 'Sin número'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {incident.tipo_documento}
                        </div>
                        <div 
                          className="text-xs text-muted-foreground truncate max-w-[160px] transition-colors duration-300 hover:text-foreground" 
                          title={incident.empresa_nombre}
                        >
                          {incident.empresa_nombre}
                        </div>
                        <div className="text-xs font-medium text-green-600 dark:text-green-400 transition-all duration-300 hover:scale-105">
                          {formatCurrency(incident.importe_total)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(incident.fecha_emision).toLocaleDateString('es-AR')}
                        </div>
                      </div>
                    </TableCell>

                    {/* Columna: Proveedor */}
                    <TableCell>
                      <div 
                        className="text-sm font-medium truncate max-w-[110px] transition-colors duration-300 hover:text-primary" 
                        title={incident.proveedor_nombre}
                      >
                        {incident.proveedor_nombre}
                      </div>
                    </TableCell>

                    {/* Columna: Tipo de Incidencia */}
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className="whitespace-nowrap text-xs transition-all duration-300 hover:scale-105 hover:shadow-md"
                      >
                        {incident.tipo}
                      </Badge>
                    </TableCell>

                    {/* Columna: Descripción/Motivo */}
                    <TableCell className="max-w-[200px]">
                      <div 
                        className="text-xs sm:text-sm line-clamp-2 cursor-help transition-colors duration-300 hover:text-foreground" 
                        title={incident.descripcion}
                      >
                        {incident.descripcion}
                      </div>
                    </TableCell>

                    {/* Columna: Severidad */}
                    <TableCell>
                      <Badge 
                        variant={getSeverityColor(incident.severidad)} 
                        className="text-xs transition-all duration-300 hover:scale-105 hover:shadow-md"
                      >
                        {incident.severidad.toUpperCase()}
                      </Badge>
                    </TableCell>

                    {/* Columna: Proveedor IA */}
                    <TableCell>
                      <div className="space-y-1">
                        <Badge 
                          variant={getProviderColor(incident.provider)} 
                          className="whitespace-nowrap text-xs transition-all duration-300 hover:scale-105 hover:shadow-md"
                        >
                          {incident.provider}
                        </Badge>
                        <div 
                          className="text-xs text-muted-foreground truncate max-w-[110px] transition-colors duration-300 hover:text-foreground" 
                          title={incident.model}
                        >
                          {incident.model}
                        </div>
                      </div>
                    </TableCell>

                    {/* Columna: Fecha */}
                    <TableCell>
                      <div className="text-xs sm:text-sm whitespace-nowrap transition-colors duration-300 hover:text-primary">
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
                          className="transition-all duration-300 hover:scale-110 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950 dark:hover:text-blue-400 dark:hover:border-blue-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(incident.id)}
                          disabled={deletingId === incident.id}
                          className="transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-destructive/30 disabled:scale-100"
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

      {/* Estilos de animación */}
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
        }
      `}</style>
    </Card>
  );
}