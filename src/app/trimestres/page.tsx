'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { TrimestreSelector } from '@/components/trimestres/trimestre-selector';
import { TrimestreStatsCard } from '@/components/trimestres/trimestre-stats-card';
import { TrimestreTable } from '@/components/trimestres/trimestres-table';
import { CloseQuarterDialog } from '@/components/trimestres/close-quarter-dialog';
import { QuarterBadge } from '@/components/trimestres/quarter-badge';
import { CompaniesHeaderSelector } from '@/components/companies-header-selector';
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

  //Currencies
  const formatNumber = (num: number | string): string => {
  const value = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(value)) return '0';
  
  const parts = value.toString().split('.');
  const integerPart = parts[0];
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return formattedInteger;
};

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';
  
  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `${formattedInteger},${decimalPart} €`;
};

  // Estados
  const [trimestres, setTrimestres] = React.useState<Trimestre[]>([]);
  const [documentos, setDocumentos] = React.useState<Document[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDocs, setIsLoadingDocs] = React.useState(false);
  const [mostrarVacios, setMostrarVacios] = React.useState(false);
  
  // Trimestre seleccionado
  const [selectedAño, setSelectedAño] = React.useState<number>(new Date().getFullYear());
  const [selectedTrimestre, setSelectedTrimestre] = React.useState<number>(1);
  
  // Dialog de cierre
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [trimestreToClose, setTrimestreToClose] = React.useState<Trimestre | null>(null);

  // Cargar lista de trimestres cuando cambian las empresas o el toggle
  React.useEffect(() => {
    loadTrimestres();
  }, [selectedCompanyIds, mostrarVacios, selectedAño]);

  // Cargar documentos cuando cambia la selección de trimestre o empresas
  React.useEffect(() => {
    loadDocumentos();
  }, [selectedAño, selectedTrimestre, selectedCompanyIds]);

  const loadTrimestres = async () => {
    try {
      setIsLoading(true);
      
      const params = new URLSearchParams();
      
      if (selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach(id => {
          params.append('empresa_id', id.toString());
        });
      }
      
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

      let trimestresFinales = dataFromDB;

      if (mostrarVacios) {
        const añoParaGenerar = selectedAño;
        const trimestresCompletos: Trimestre[] = [];

        for (let trimestre = 1; trimestre <= 4; trimestre++) {
          const existeEnBD = dataFromDB.find(
            (t: Trimestre) => t.año === añoParaGenerar && t.trimestre === trimestre
          );

          if (existeEnBD) {
            trimestresCompletos.push(existeEnBD);
          } else {
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

      if (trimestresFinales.length > 0) {
        const tieneAñoActual = trimestresFinales.some((t: Trimestre) => t.año === selectedAño);
        
        if (!tieneAñoActual) {
          const reciente = trimestresFinales[0];
          setSelectedAño(reciente.año);
          setSelectedTrimestre(reciente.trimestre);
        }
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
    try {
      setIsLoadingDocs(true);

      const params = new URLSearchParams({
        año: selectedAño.toString(),
        trimestre: selectedTrimestre.toString(),
      });

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
    setSelectedTrimestre(1);
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

  const trimestreAgregado = React.useMemo(() => {
    const trimestresDelPeriodo = trimestres.filter(
      t => t.año === selectedAño && t.trimestre === selectedTrimestre
    );

    if (trimestresDelPeriodo.length === 0) return null;

    if (trimestresDelPeriodo.length === 1) {
      return trimestresDelPeriodo[0];
    }

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
        const existing = unique.get(key)!;
        if (t.cerrado) {
          existing.cerrado = true;
        }
      }
    });

    return Array.from(unique.values());
  }, [trimestres]);

  const puedeCerrarse = trimestreAgregado && !trimestreAgregado.cerrado;
console.log('🔵 Estado del diálogo:', {
  dialogOpen,
  trimestreToClose,
  puedeCerrarse
});
  return (
    <MainLayout>
      <MainLayoutHeader>
        {/* 📱 HEADER CON MEJOR LAYOUT */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 w-full">
          {/* Título */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">
              Gestión de Trimestres
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              Visualiza y cierra los trimestres fiscales
            </p>
          </div>
          
          {/* 🎯 CONTROLES COMPACTOS EN DESKTOP */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Switch de mostrar vacíos */}
            <div className="flex items-center space-x-2">
              <Switch
                id="mostrar-vacios"
                checked={mostrarVacios}
                onCheckedChange={setMostrarVacios}
              />
              <Label htmlFor="mostrar-vacios" className="text-xs sm:text-sm whitespace-nowrap cursor-pointer">
                Mostrar vacíos
              </Label>
            </div>

            {/* 🎯 SELECTOR DE EMPRESAS - WIDTH FIJO MÁXIMO */}
            <div className="w-[200px]">
              <CompaniesHeaderSelector />
            </div>
          </div>
        </div>
      </MainLayoutHeader>

      {/* 📱 CONTENIDO PRINCIPAL CON PADDING RESPONSIVE */}
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        
        {/* 📱 SELECTOR DE TRIMESTRE + BADGE */}
        {isLoading ? (
          <Skeleton className="h-12 sm:h-16 w-full" />
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            {/* 🎯 SELECTOR DE TRIMESTRE - WIDTH FULL EN MOBILE */}
            <div className="w-full sm:flex-1 sm:min-w-0">
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
            </div>

            {/* Badge y botón de cerrar */}
            {trimestreAgregado && (
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <QuarterBadge cerrado={trimestreAgregado.cerrado} />
                {puedeCerrarse && (
                  <Button
  variant="destructive"
  size="sm"
  className="gap-2 text-xs sm:text-sm h-8 sm:h-9"
  onClick={() => {
    console.log('🔴 Abriendo diálogo de cierre'); // DEBUG
    console.log('Trimestre:', trimestreAgregado); // DEBUG
    setTrimestreToClose(trimestreAgregado);
    setDialogOpen(true);
  }}
>
  <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
  <span className="hidden xs:inline">Cerrar Trimestre</span>
  <span className="xs:hidden">Cerrar</span>
</Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 📱 STATS CARDS - GRID RESPONSIVE */}
        {isLoading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 sm:h-28 lg:h-32" />
            ))}
          </div>
        ) : trimestreAgregado ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <TrimestreStatsCard
              title="Total Documentos"
              value={trimestreAgregado.total_documentos}
              icon={FileText}
              description={`T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`}
            />
            <TrimestreStatsCard
              title="Ingresos"
              value={formatCurrency(trimestreAgregado.total_ingresos)}
              icon={TrendingUp}
              description="Total facturado"
              trend="up"
            />
            <TrimestreStatsCard
              title="Gastos"
              value={formatCurrency(trimestreAgregado.total_gastos)}
              icon={TrendingDown}
              description="Total gastado"
              trend="down"
            />
            <TrimestreStatsCard
              title="IVA Neto"
              value={formatCurrency(trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado)}
              icon={Receipt}
              description="Repercutido - Soportado"
            />
          </div>
        ) : (
          // 📱 EMPTY STATE CUANDO NO HAY TRIMESTRE SELECCIONADO
          <div className="rounded-lg border border-dashed p-8 sm:p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-2">
              No hay datos disponibles
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              Selecciona un trimestre para ver las estadísticas o activa "Mostrar vacíos" para ver todos los trimestres del año.
            </p>
          </div>
        )}

        {/* 📱 TABLA DE DOCUMENTOS */}
        {isLoadingDocs ? (
          <Skeleton className="h-64 sm:h-80 lg:h-96 w-full rounded-lg" />
        ) : (
          <div className="rounded-lg border bg-card">
            <TrimestreTable documentos={documentos} />
          </div>
        )}
      </div>

      {/* 📱 DIALOG DE CIERRE - YA ES RESPONSIVE POR DEFECTO */}
      <CloseQuarterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trimestre={trimestreToClose}
        onConfirm={handleCerrarTrimestre}
      />
    </MainLayout>
  );
}