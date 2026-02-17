'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { TrimestresProvider, useTrimestres } from '@/context/TrimestresProvider';
import { MainLayout } from '@/components/layout/main-layout';
import { TrimestreSelector } from '@/components/trimestres/trimestre-selector';
import { PageHeader } from '@/components/layout/page-header';
import { TrimestreStatsCard } from '@/components/trimestres/trimestre-stats-card';
import { TrimestreTable } from '@/components/trimestres/trimestres-table';
import { CloseQuarterDialog } from '@/components/trimestres/close-quarter-dialog';
import { QuarterBadge } from '@/components/trimestres/quarter-badge';
import { CompaniesHeaderSelector } from '@/components/companies-header-selector';
import { TrimestresTutorial } from '@/components/trimestres/TrimestresTutorial';
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
  Send,
  Building2,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
  Download,
} from 'lucide-react';
import type { Document, Trimestre } from '@/lib/types';
import { generateAdvancedExport } from '@/lib/export-utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function TrimestresPageContent() {
  const { selectedCompanyIds, isLoading: isLoadingCompanies } = useCompanyContext();
  const { isTutorialActive, currentStep, mostrarVacios, setMostrarVacios } = useTrimestres();
  const { toast } = useToast();

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

  // Trimestre seleccionado
  const [selectedAño, setSelectedAño] = React.useState<number>(new Date().getFullYear());
  const [selectedTrimestre, setSelectedTrimestre] = React.useState<number>(1);

  // Dialog de cierre
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [trimestreToClose, setTrimestreToClose] = React.useState<Trimestre | null>(null);

  React.useEffect(() => {
    if (isLoadingCompanies) {
      console.log('⏳ [Trimestres] Esperando a que carguen las empresas...');
      return;
    }

    console.log('🔄 [Trimestres] Cargando trimestres con empresas:', selectedCompanyIds);
    loadTrimestres();
  }, [selectedCompanyIds, mostrarVacios, selectedAño, isLoadingCompanies]);

  React.useEffect(() => {
    if (isLoadingCompanies) {
      console.log('⏳ [Trimestres] Esperando a que carguen las empresas para los documentos...');
      return;
    }

    console.log('🔄 [Trimestres] Cargando documentos con empresas:', selectedCompanyIds);
    loadDocumentos();
  }, [selectedAño, selectedTrimestre, selectedCompanyIds, isLoadingCompanies]);

  const loadTrimestres = async () => {
    try {
      setIsLoading(true);

      console.log('🔍 [loadTrimestres] Empresas seleccionadas:', selectedCompanyIds);

      const params = new URLSearchParams();

      if (selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach(id => {
          params.append('empresa_id', id.toString());
        });
      }

      params.append('mostrar_vacios', mostrarVacios.toString());

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
              total_ingresos_sin_iva: 0,
              total_gastos_sin_iva: 0,
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
          console.log('🔄 [loadTrimestres] Año actual sin datos, seleccionando trimestre más reciente:', reciente);
          setSelectedAño(reciente.año);
          setSelectedTrimestre(reciente.trimestre);
        }
      } else {
        console.log('⚠️ [loadTrimestres] No hay trimestres con datos');
        const now = new Date();
        const añoActual = now.getFullYear();
        const trimestreActual = Math.ceil((now.getMonth() + 1) / 3);
        setSelectedAño(añoActual);
        setSelectedTrimestre(trimestreActual);
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

      console.log('🔍 [loadDocumentos] Empresas seleccionadas:', selectedCompanyIds);

      if (selectedCompanyIds.length === 0) {
        console.log('⚠️ [loadDocumentos] No hay empresas seleccionadas, limpiando documentos');
        setDocumentos([]);
        return;
      }

      const params = new URLSearchParams({
        año: selectedAño.toString(),
        trimestre: selectedTrimestre.toString(),
      });

      selectedCompanyIds.forEach(id => {
        params.append('empresa_id', id.toString());
      });

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

  const handleExportar = async (año: number, trimestre: number | null) => {
    try {
      toast({
        title: 'Generando exportación...',
        description: 'Por favor espere mientras se recopilan los datos.',
      });

      const params = new URLSearchParams({
        año: año.toString(),
      });

      if (trimestre) {
        params.append('trimestre', trimestre.toString());
      }

      selectedCompanyIds.forEach(id => {
        params.append('empresa_id', id.toString());
      });

      // Usar endpoint existente que soporta filtros
      const response = await fetch(`/api/trimestres/documentos?${params}`);
      if (!response.ok) throw new Error('Error al cargar datos para exportación');

      const data = await response.json();

      if (data.length === 0) {
        toast({
          title: 'Sin datos',
          description: 'No hay documentos para exportar en el periodo seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      // Columnas para el reporte (definidas aquí o reutilizadas)
      const exportColumns = [
        { id: 'numero_documento', header: 'Número' },
        { id: 'fecha_emision', header: 'Fecha Emisión' },
        { id: 'proveedor', header: 'Emisor/Receptor' }, // Adaptar según modelo real
        { id: 'cif', header: 'CIF' },
        { id: 'base_imponible', header: 'Base Imponible' },
        { id: 'total', header: 'Total' },
        // Campos de impuestos específicos si queremos detalle
        { id: 'base_21', header: 'Base 21%' },
        { id: 'iva_21', header: 'IVA 21%' },
        { id: 'base_10', header: 'Base 10%' },
        { id: 'iva_10', header: 'IVA 10%' },
        { id: 'base_4', header: 'Base 4%' },
        { id: 'iva_4', header: 'IVA 4%' },
        { id: 'base_0', header: 'Base 0%' },
      ];

      generateAdvancedExport(data, exportColumns, {
        filename: `Export_Trimestres_${año}${trimestre ? `_T${trimestre}` : '_Anual'}`,
        format: 'excel',
        includeSummary: true,
        trimestre, // Nuevo para desglose
      });

      toast({
        title: '✅ Exportación completada',
        description: 'El archivo se ha descargado correctamente.',
      });

    } catch (error) {
      console.error('❌ Error exporting:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar la exportación',
        variant: 'destructive',
      });
    }
  };

  const handleCerrarTrimestre = async (empresaId: number | null, enviarAlSII: boolean = false) => {
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

      if (enviarAlSII) {
        const params = new URLSearchParams({
          año: trimestreToClose.año.toString(),
          trimestre: trimestreToClose.trimestre.toString(),
          empresa_id: empresaId?.toString() || 'all'
        });

        window.location.href = `/sii?${params.toString()}`;
      }

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

      // ✅ TOTALES CON IVA (principal)
      total_ingresos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_ingresos, 0),
      total_gastos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_gastos, 0),

      // ✅ TOTALES SIN IVA (para breakdown)
      total_ingresos_sin_iva: trimestresDelPeriodo.reduce((sum, t) => sum + (t.total_ingresos_sin_iva || 0), 0),
      total_gastos_sin_iva: trimestresDelPeriodo.reduce((sum, t) => sum + (t.total_gastos_sin_iva || 0), 0),

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
  const puedeEnviarAlSII = trimestreAgregado && trimestreAgregado.cerrado;

  return (
    <>
      <TrimestresTutorial />

      <MainLayout>
        <PageHeader
          title="Gestión de Trimestres"
          icon={Calendar}
          badgeCount={0} // Opcional, o null si no se necesita
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center space-x-2" data-tutorial="trimestres-toggle">
              <Switch
                id="mostrar-vacios"
                checked={mostrarVacios}
                onCheckedChange={setMostrarVacios}
              />
              <Label htmlFor="mostrar-vacios" className="text-xs sm:text-sm whitespace-nowrap cursor-pointer">
                Mostrar vacíos
              </Label>
            </div>

            <div className="w-[200px]" data-tutorial="trimestres-company-selector">
              <CompaniesHeaderSelector />
            </div>
          </div>
        </PageHeader>

        <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">

          {isLoading ? (
            <Skeleton className="h-12 sm:h-16 w-full" />
          ) : selectedCompanyIds.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="w-full sm:flex-1 sm:min-w-0" data-tutorial="trimestres-selector">
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

              {trimestreAgregado && (
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <QuarterBadge cerrado={trimestreAgregado.cerrado} />

                  {puedeCerrarse && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2 text-xs sm:text-sm h-8 sm:h-9"
                      data-tutorial="trimestres-close-button"
                      onClick={() => {
                        if (isTutorialActive && currentStep === 6) {
                          console.log('🛡️ Click bloqueado por el tutorial');
                          return;
                        }
                        console.log('🔴 Abriendo diálogo de cierre');
                        console.log('Trimestre:', trimestreAgregado);
                        setTrimestreToClose(trimestreAgregado);
                        setDialogOpen(true);
                      }}
                      disabled={isTutorialActive && currentStep === 6}
                    >
                      <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="hidden xs:inline">Cerrar Trimestre</span>
                      <span className="xs:hidden">Cerrar</span>
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs sm:text-sm h-8 sm:h-9"
                      >
                        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span className="hidden xs:inline">Exportar</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleExportar(selectedAño, selectedTrimestre)}
                        className="cursor-pointer"
                      >
                        Exportar Trimestre Actual (T{selectedTrimestre})
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportar(selectedAño, null)}
                        className="cursor-pointer"
                      >
                        Exportar Año Completo ({selectedAño})
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {puedeEnviarAlSII && (
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2 text-xs sm:text-sm h-8 sm:h-9 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        const params = new URLSearchParams({
                          año: selectedAño.toString(),
                          trimestre: selectedTrimestre.toString(),
                          empresa_id: trimestreAgregado.empresa_id?.toString() || 'all'
                        });

                        window.location.href = `/sii?${params.toString()}`;
                      }}
                    >
                      <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="hidden xs:inline">Enviar al SII</span>
                      <span className="xs:hidden">Enviar</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* CONTINUACIÓN EN PARTE 2 */}{/* ✅ MODIFICADO: Ahora con 7 cards CON BREAKDOWN que muestra CON IVA + SIN IVA */}
          {isLoading ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-7">
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-24 sm:h-28 lg:h-32" />
              ))}
            </div>
          ) : selectedCompanyIds.length === 0 ? null : trimestreAgregado ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-7" data-tutorial="trimestres-stats">

              {/* 1️⃣ Total Documentos - SIN CAMBIOS */}
              <TrimestreStatsCard
                title="Total Documentos"
                value={trimestreAgregado.total_documentos}
                icon={FileText}
                description={`T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`}
                breakdown={[
                  {
                    label: "Facturas del Sistema",
                    value: formatNumber(trimestreAgregado.total_documentos),
                    className: "text-foreground"
                  },
                  {
                    label: "Trimestre",
                    value: `T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`,
                    className: "text-muted-foreground"
                  }
                ]}
              />

              {/* 2️⃣ Ingresos - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="Ingresos"
                value={formatCurrency(trimestreAgregado.total_ingresos)}
                icon={TrendingUp}
                description="Total CON IVA"
                trend="up"
                breakdown={[
                  {
                    label: "Base (sin IVA)",
                    value: formatCurrency(trimestreAgregado.total_ingresos_sin_iva || 0),
                    className: "text-muted-foreground"
                  },
                  {
                    label: "IVA Repercutido",
                    value: formatCurrency(trimestreAgregado.iva_repercutido),
                    className: "text-green-600 dark:text-green-500"
                  },
                  {
                    label: "Total CON IVA",
                    value: formatCurrency(trimestreAgregado.total_ingresos),
                    className: "text-green-600 dark:text-green-500 font-bold"
                  }
                ]}
              />

              {/* 3️⃣ Gastos - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="Gastos"
                value={formatCurrency(trimestreAgregado.total_gastos)}
                icon={TrendingDown}
                description="Total CON IVA"
                trend="down"
                breakdown={[
                  {
                    label: "Base (sin IVA)",
                    value: formatCurrency(trimestreAgregado.total_gastos_sin_iva || 0),
                    className: "text-muted-foreground"
                  },
                  {
                    label: "IVA Soportado",
                    value: formatCurrency(trimestreAgregado.iva_soportado),
                    className: "text-red-600 dark:text-red-500"
                  },
                  {
                    label: "Total CON IVA",
                    value: formatCurrency(trimestreAgregado.total_gastos),
                    className: "text-red-600 dark:text-red-500 font-bold"
                  }
                ]}
              />

              {/* 4️⃣ Beneficio Bruto - ✅ MODIFICADO CON BREAKDOWN COMPLETO */}
              <TrimestreStatsCard
                title="Beneficio Bruto"
                value={formatCurrency(trimestreAgregado.total_ingresos - trimestreAgregado.total_gastos)}
                icon={DollarSign}
                description="CON IVA incluido"
                trend={
                  (trimestreAgregado.total_ingresos - trimestreAgregado.total_gastos) > 0
                    ? 'up'
                    : (trimestreAgregado.total_ingresos - trimestreAgregado.total_gastos) < 0
                      ? 'down'
                      : 'neutral'
                }
                breakdown={[
                  {
                    label: "Ingresos CON IVA",
                    value: formatCurrency(trimestreAgregado.total_ingresos),
                    className: "text-green-600 dark:text-green-500"
                  },
                  {
                    label: "Gastos CON IVA",
                    value: formatCurrency(trimestreAgregado.total_gastos),
                    className: "text-red-600 dark:text-red-500"
                  },
                  {
                    label: "Beneficio CON IVA",
                    value: formatCurrency(trimestreAgregado.total_ingresos - trimestreAgregado.total_gastos),
                    className: (trimestreAgregado.total_ingresos - trimestreAgregado.total_gastos) >= 0
                      ? 'text-green-600 dark:text-green-500 font-bold'
                      : 'text-red-600 dark:text-red-500 font-bold'
                  },
                  {
                    label: "---",
                    value: "---",
                    className: "text-muted-foreground"
                  },
                  {
                    label: "Beneficio SIN IVA",
                    value: formatCurrency(
                      (trimestreAgregado.total_ingresos_sin_iva || 0) -
                      (trimestreAgregado.total_gastos_sin_iva || 0)
                    ),
                    className: "text-muted-foreground italic"
                  }
                ]}
              />

              {/* 5️⃣ IVA REPERCUTIDO - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="IVA Repercutido"
                value={formatCurrency(trimestreAgregado.iva_repercutido)}
                icon={ArrowUpCircle}
                description="IVA cobrado"
                trend="neutral"
                breakdown={[
                  {
                    label: "Base Facturas Emitidas",
                    value: formatCurrency(trimestreAgregado.total_ingresos_sin_iva || 0),
                    className: "text-muted-foreground"
                  },
                  {
                    label: "IVA Repercutido",
                    value: formatCurrency(trimestreAgregado.iva_repercutido),
                    className: "text-green-600 dark:text-green-500 font-bold"
                  },
                  {
                    label: "Total Ingresos CON IVA",
                    value: formatCurrency(trimestreAgregado.total_ingresos),
                    className: "text-green-600 dark:text-green-500"
                  }
                ]}
              />

              {/* 6️⃣ IVA SOPORTADO - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="IVA Soportado"
                value={formatCurrency(trimestreAgregado.iva_soportado)}
                icon={ArrowDownCircle}
                description="IVA pagado"
                trend="neutral"
                breakdown={[
                  {
                    label: "Base Facturas Recibidas",
                    value: formatCurrency(trimestreAgregado.total_gastos_sin_iva || 0),
                    className: "text-muted-foreground"
                  },
                  {
                    label: "IVA Soportado",
                    value: formatCurrency(trimestreAgregado.iva_soportado),
                    className: "text-red-600 dark:text-red-500 font-bold"
                  },
                  {
                    label: "Total Gastos CON IVA",
                    value: formatCurrency(trimestreAgregado.total_gastos),
                    className: "text-red-600 dark:text-red-500"
                  }
                ]}
              />

              {/* 7️⃣ IVA NETO - ✅ MODIFICADO CON BREAKDOWN COMPLETO */}
              <TrimestreStatsCard
                title="IVA Neto"
                value={formatCurrency(trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado)}
                icon={Receipt}
                description={
                  (trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado) > 0
                    ? "A pagar a Hacienda"
                    : (trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado) < 0
                      ? "A devolver por Hacienda"
                      : "Sin diferencia"
                }
                trend={
                  (trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado) > 0
                    ? 'down'
                    : (trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado) < 0
                      ? 'up'
                      : 'neutral'
                }
                breakdown={[
                  {
                    label: "IVA Repercutido",
                    value: formatCurrency(trimestreAgregado.iva_repercutido),
                    className: "text-green-600 dark:text-green-500"
                  },
                  {
                    label: "IVA Soportado",
                    value: formatCurrency(trimestreAgregado.iva_soportado),
                    className: "text-red-600 dark:text-red-500"
                  },
                  {
                    label: "Resultado IVA",
                    value: formatCurrency(trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado),
                    className: (trimestreAgregado.iva_repercutido - trimestreAgregado.iva_soportado) >= 0
                      ? 'text-red-600 dark:text-red-500 font-bold'
                      : 'text-green-600 dark:text-green-500 font-bold'
                  }
                ]}
              />

            </div>
          ) : (
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

          {isLoadingDocs ? (
            <Skeleton className="h-64 sm:h-80 lg:h-96 w-full rounded-lg" />
          ) : selectedCompanyIds.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 sm:p-12 text-center bg-muted/20">
              <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">
                Selecciona una empresa
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Para visualizar los documentos del trimestre, primero debes seleccionar al menos una empresa.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const selector = document.querySelector('[data-tutorial="trimestres-company-selector"]');
                  selector?.scrollIntoView({ behavior: 'smooth', block: 'center' });

                  selector?.classList.add('ring-2', 'ring-violet-500', 'ring-offset-2');
                  setTimeout(() => {
                    selector?.classList.remove('ring-2', 'ring-violet-500', 'ring-offset-2');
                  }, 2000);
                }}
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                Ir al selector de empresas
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border bg-card" data-tutorial="trimestres-table">
              <TrimestreTable documentos={documentos} />
            </div>
          )}
        </div>

        <CloseQuarterDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trimestre={trimestreToClose}
          onConfirm={handleCerrarTrimestre}
        />
      </MainLayout>
    </>
  );
}

export default function TrimestresPage() {
  return (
    <TrimestresProvider>
      <TrimestresPageContent />
    </TrimestresProvider>
  );
}