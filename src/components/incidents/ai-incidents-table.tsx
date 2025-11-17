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
}

export function AIIncidentsTable() {
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
      
      const params = new URLSearchParams();
      if (severidadFilter !== 'all') params.append('severidad', severidadFilter);
      if (providerFilter !== 'all') params.append('provider', providerFilter);

      const response = await fetch(`/api/ai-incidents?${params}`);
      
      if (!response.ok) {
        throw new Error('Error al cargar incidencias');
      }

      const data = await response.json();
      setIncidents(data);
    } catch (error) {
      console.error('Error loading AI incidents:', error);
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
  }, [severidadFilter, providerFilter]);

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

      // Recargar lista
      loadIncidents();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Incidencias Detectadas por IA
        </CardTitle>
        <CardDescription>
          Incidencias encontradas automáticamente durante el análisis con IA
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
                <SelectValue placeholder="Filtrar por proveedor" />
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{incident.numero_documento}</div>
                        <div className="text-xs text-muted-foreground">
                          {incident.tipo_documento}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {incident.empresa_nombre}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{incident.tipo}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate" title={incident.descripcion}>
                        {incident.descripcion}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getSeverityColor(incident.severidad)}>
                        {incident.severidad.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={getProviderColor(incident.provider)}>
                          {incident.provider}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {incident.model}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(incident.created_at).toLocaleDateString('es-AR')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(incident.created_at).toLocaleTimeString('es-AR')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/documentos/${incident.documento_id}`)}
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