'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { TrimestreSelector } from '@/components/trimestres/trimestre-selector';
import { TrimestreStatsCard } from '@/components/trimestres/trimestre-stats-card';
import { TrimestreTable } from '@/components/trimestres/trimestres-table';
import { CloseQuarterDialog } from '@/components/trimestres/close-quarter-dialog';
import { QuarterBadge } from '@/components/trimestres/quarter-badge';
import { CompaniesSelector } from '@/components/companies-selector';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Lock,
  FileText,
  TrendingUp,
  TrendingDown,
  Receipt,
} from 'lucide-react';
import type { Document, Trimestre } from '@/lib/types';

export default function TrimestresPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const { toast } = useToast();

  // Estados
  const [trimestres, setTrimestres] = React.useState<Trimestre[]>([]);
  const [documentos, setDocumentos] = React.useState<Document[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDocs, setIsLoadingDocs] = React.useState(false);
  const [mostrarVacios, setMostrarVacios] = React.useState(false);
  
  // Trimestre seleccionado
  const [selectedAño, setSelectedAño] = React.useState<number | null>(null);
  const [selectedTrimestre, setSelectedTrimestre] = React.useState<number | null>(null);
  
  // Dialog de cierre
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [trimestreToClose, setTrimestreToClose] = React.useState<Trimestre | null>(null);

  // Cargar lista de trimestres cuando cambian las empresas o el toggle
  React.useEffect(() => {
    loadTrimestres();
  }, [selectedCompanyIds, mostrarVacios, selectedAño]); // ✅ Agregado selectedAño para recargar al cambiar año

  // Cargar documentos cuando cambia la selección de trimestre o empresas
  React.useEffect(() => {
    if (selectedAño && selectedTrimestre) {
      loadDocumentos();
    }
  }, [selectedAño, selectedTrimestre, selectedCompanyIds]);

  const loadTrimestres = async () => {
    try {
      setIsLoading(true);
      
      const params = new URLSearchParams();
      
      // ✅ Agregar múltiples empresa_id si hay seleccionadas
      if (selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach(id => {
          params.append('empresa_id', id.toString());
        });
      }
      
      // Siempre pedir con mostrar_vacios=false a la BD (solo traer lo que tiene datos)
      params.append('mostrar_vacios', 'false');

      console.log('📡 [loadTrimestres] Fetching con params:', params.toString());

      const response = await fetch(`/api/trimestres?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.error || 'Error al cargar trimestres');
      }

      const dataFromDB = await response.json();
      console.log('✅ Trimestres de BD:', dataFromDB);

      // ✅ GENERAR TRIMESTRES VACÍOS SI EL TOGGLE ESTÁ ACTIVADO
      let trimestresFinales = dataFromDB;

      if (mostrarVacios) {
        // Usar el año seleccionado o el actual si no hay ninguno
        const añoParaGenerar = selectedAño || new Date().getFullYear();
        const trimestresCompletos: Trimestre[] = [];

        // Generar todos los trimestres del año seleccionado
        for (let trimestre = 1; trimestre <= 4; trimestre++) {
          const existeEnBD = dataFromDB.find(
            (t: Trimestre) => t.año === añoParaGenerar && t.trimestre === trimestre
          );

          if (existeEnBD) {
            // Si existe en BD, usar esos datos
            trimestresCompletos.push(existeEnBD);
          } else {
            // Si NO existe, crear uno vacío
            trimestresCompletos.push({
              año: añoParaGenerar,
              trimestre,
              empresa_id: null,
              empresa_nombre: null,
              total_documentos: 0,
              total_ingresos: 0,
              total_gastos: 0,
              iva_repercutido: 0,
              iva_soportado: 0,
              cerrado: false,
              fecha_cierre: null,
            });
          }
        }

        trimestresFinales = trimestresCompletos;
      }

      setTrimestres(trimestresFinales);

      // Seleccionar el trimestre más reciente automáticamente solo la primera vez
      if (trimestresFinales.length > 0 && !selectedAño) {
        const reciente = trimestresFinales[0];
        setSelectedAño(reciente.año);
        setSelectedTrimestre(reciente.trimestre);
      }
    } catch (error) {
      console.error('❌ Error loading trimestres:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudieron cargar los trimestres',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocumentos = async () => {
    if (!selectedAño || !selectedTrimestre) return;

    try {
      setIsLoadingDocs(true);

      const params = new URLSearchParams({
        año: selectedAño.toString(),
        trimestre: selectedTrimestre.toString(),
      });

      // ✅ Agregar múltiples empresa_id
      if (selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach(id => {
          params.append('empresa_id', id.toString());
        });
      }

      console.log('📡 [loadDocumentos] Fetching con params:', params.toString());

      const response = await fetch(`/api/trimestres/documentos?${params}`);
      if (!response.ok) throw new Error('Error al cargar documentos');

      const data = await response.json();
      console.log('✅ Documentos cargados:', data.length);
      setDocumentos(data);
    } catch (error) {
      console.error('❌ Error loading documentos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los documentos',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSelectAño = (año: number) => {
    console.log('🔄 Año seleccionado:', año);
    setSelectedAño(año);
    setSelectedTrimestre(1); // Seleccionar T1 por defecto al cambiar año
  };

  const handleCerrarTrimestre = async (empresaId: number | null) => {
    if (!trimestreToClose) return;

    try {
      const response = await fetch('/api/trimestres/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          año: trimestreToClose.año,
          trimestre: trimestreToClose.trimestre,
          empresa_id: empresaId,
        }),
      });

      if (!response.ok) throw new Error('Error al cerrar trimestre');

      const result = await response.json();

      // Recargar datos
      await loadTrimestres();
      await loadDocumentos();

      toast({
        title: '✅ Trimestre cerrado',
        description: `${result.affected} documento(s) de T${trimestreToClose.trimestre} ${trimestreToClose.año} cerrado(s)`,
      });

      setDialogOpen(false);
    } catch (error) {
      console.error('❌ Error closing trimestre:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cerrar el trimestre',
        variant: 'destructive',
      });
    }
  };

  // ✅ Calcular estadísticas agregadas si hay múltiples empresas
  const trimestreAgregado = React.useMemo(() => {
    if (!selectedAño || !selectedTrimestre) return null;

    const trimestresDelPeriodo = trimestres.filter(
      t => t.año === selectedAño && t.trimestre === selectedTrimestre
    );

    if (trimestresDelPeriodo.length === 0) return null;

    // Si hay una sola empresa o es agregado (empresa_id === null), mostrar directo
    if (trimestresDelPeriodo.length === 1) {
      return trimestresDelPeriodo[0];
    }

    // Agregar múltiples empresas
    return {
      año: selectedAño,
      trimestre: selectedTrimestre,
      empresa_id: null,
      empresa_nombre: `${trimestresDelPeriodo.length} empresas`,
      total_documentos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_documentos, 0),
      total_ingresos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_ingresos, 0),
      total_gastos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_gastos, 0),
      iva_repercutido: trimestresDelPeriodo.reduce((sum, t) => sum + t.iva_repercutido, 0),
      iva_soportado: trimestresDelPeriodo.reduce((sum, t) => sum + t.iva_soportado, 0),
      cerrado: trimestresDelPeriodo.every(t => t.cerrado),
      fecha_cierre: null,
    };
  }, [trimestres, selectedAño, selectedTrimestre]);

  // ✅ Preparar lista para el selector (sin duplicados de año-trimestre)
  const trimestresParaSelector = React.useMemo(() => {
    const unique = new Map<string, Trimestre>();
    
    trimestres.forEach(t => {
      const key = `${t.año}-${t.trimestre}`;
      if (!unique.has(key)) {
        unique.set(key, { 
          ...t,
          empresa_id: null,
          empresa_nombre: null,
        });
      } else {
        // Si alguno está cerrado, marcar como cerrado
        const existing = unique.get(key)!;
        if (t.cerrado) {
          existing.cerrado = true;
        }
      }
    });

    return Array.from(unique.values());
  }, [trimestres]);

  const puedeCerrarse = trimestreAgregado && !trimestreAgregado.cerrado;

  return (
    <MainLayout>
      <MainLayoutHeader>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Gestión de Trimestres</h1>
          <p className="text-sm text-muted-foreground">
            Visualiza y cierra los trimestres fiscales
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Toggle mostrar vacíos */}
          <div className="flex items-center space-x-2">
            <Switch
              id="mostrar-vacios"
              checked={mostrarVacios}
              onCheckedChange={setMostrarVacios}
            />
            <Label htmlFor="mostrar-vacios" className="text-sm">
              Mostrar vacíos
            </Label>
          </div>

          <CompaniesSelector />
        </div>
      </MainLayoutHeader>

      <div className="space-y-6 p-6">
        {/* Selector de Trimestre */}
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-center justify-between">
            <TrimestreSelector
              trimestres={trimestresParaSelector}
              selectedAño={selectedAño}
              selectedTrimestre={selectedTrimestre}
              onSelectTrimestre={(año, trimestre) => {
                setSelectedAño(año);
                setSelectedTrimestre(trimestre);
              }}
              onSelectAño={handleSelectAño}
              mostrarVacios={mostrarVacios}
              onToggleMostrarVacios={setMostrarVacios}
            />

            {trimestreAgregado && (
              <div className="flex items-center gap-3">
                <QuarterBadge cerrado={trimestreAgregado.cerrado} />
                {puedeCerrarse && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setTrimestreToClose(trimestreAgregado);
                      setDialogOpen(true);
                    }}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Cerrar Trimestre
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : trimestreAgregado ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TrimestreStatsCard
              title="Total Documentos"
              value={trimestreAgregado.total_documentos}
              icon={FileText}
              description={`T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`}
            />
            <TrimestreStatsCard
              title="Ingresos"
              value={`€${trimestreAgregado.total_ingresos.toFixed(2)}`}
              icon={TrendingUp}
              description="Total facturado"
              trend="up"
            />
            <TrimestreStatsCard
              title="Gastos"
              value={`€${trimestreAgregado.total_gastos.toFixed(2)}`}
              icon={TrendingDown}
              description="Total gastado"
              trend="down"
            />
            <TrimestreStatsCard
              title="IVA Neto"
              value={`€${(trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado).toFixed(2)}`}
              icon={Receipt}
              description="Repercutido - Soportado"
            />
          </div>
        ) : null}

        {/* Tabla de Documentos */}
        {isLoadingDocs ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <TrimestreTable documentos={documentos} />
        )}
      </div>

      {/* Dialog de Cierre */}
      <CloseQuarterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trimestre={trimestreToClose}
        onConfirm={handleCerrarTrimestre}
      />
    </MainLayout>
  );
}