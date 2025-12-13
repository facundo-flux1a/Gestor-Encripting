'use client';

import { useEffect, useState } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FinancialSummary } from '@/components/dashboard/financial-summary';
import { DocumentStatusChart } from '@/components/dashboard/document-status-chart';
import { IvaSummary } from '@/components/dashboard/iva-summary';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { DashboardTutorial } from '@/components/dashboard/dashboard-tutorial';
import { getDashboardAnalytics, type DashboardAnalytics } from '@/services/document-service';
import { 
  FileText, 
  Users, 
  AlertTriangle, 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Scale, 
  Banknote, 
  Loader2, 
  RefreshCcw,
  X,
  Download
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function DashboardPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningDB, setIsCleaningDB] = useState(false);
  
  const [selectedAño, setSelectedAño] = useState<number | null>(null);
  const [selectedTrimestre, setSelectedTrimestre] = useState<number | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    exportId: number | null;
    status: string;
    urlArchivo: string | null;
    nombreArchivo: string | null;
  }>({
    exportId: null,
    status: 'idle',
    urlArchivo: null,
    nombreArchivo: null
  });
  
  const { toast } = useToast();

  useEffect(() => {
    async function loadAnalytics() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        setAnalytics(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const companyIdsAsNumbers = selectedCompanyIds.map(id => Number(id));
        
        const data = await getDashboardAnalytics(
          companyIdsAsNumbers,
          selectedAño ?? undefined,
          selectedTrimestre ?? undefined
        );
        
        setAnalytics(data);
      } catch (err) {
        console.error('Error loading analytics:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar las analíticas');
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [selectedCompanyIds, selectedAño, selectedTrimestre]);

  const checkExportStatus = async (exportId: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/check-export?exportId=${exportId}`);
      const data = await response.json();

      setExportStatus({
        exportId,
        status: data.status,
        urlArchivo: data.urlArchivo,
        nombreArchivo: data.nombreArchivo
      });

      if (data.status === 'completed') {
        setIsExporting(false);
        
        toast({
          title: "✅ PDF Generado",
          description: `Descargando: ${data.nombreArchivo}`,
          className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
        });
        
        if (data.urlArchivo) {
          const filename = data.nombreArchivo || data.urlArchivo.split('/').pop() || 'reporte.pdf';
          const downloadUrl = `/api/files/${filename}`;
          
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
        }
        return true;
      } else if (data.status === 'failed') {
        setIsExporting(false);
        toast({
          variant: "destructive",
          title: "Error al generar PDF",
          description: "Ocurrió un error al generar el PDF",
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking export status:', error);
      return false;
    }
  };

  const startPolling = (exportId: number) => {
    const intervalId = setInterval(async () => {
      const shouldStop = await checkExportStatus(exportId);
      if (shouldStop) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      }
    }, 3000);

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setIsExporting(false);
      toast({
        variant: "destructive",
        title: "Timeout",
        description: "El PDF está tardando más de lo esperado. Por favor, intenta nuevamente.",
      });
    }, 120000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus({
      exportId: null,
      status: 'pending',
      urlArchivo: null,
      nombreArchivo: null
    });
    
    try {
      const response = await fetch('/api/export-dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          empresaIds: selectedCompanyIds.map(id => Number(id)),
          año: selectedAño,
          trimestre: selectedTrimestre,
          analytics: analytics
        })
      });

      const result = await response.json();

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "Error al exportar",
          description: result.error || "No se pudo iniciar la exportación",
        });
        setIsExporting(false);
        return;
      }

      if (result.success && result.exportId) {
        startPolling(result.exportId);
        
        toast({
          title: "📄 Generando PDF",
          description: "Tu reporte se está generando. Te notificaremos cuando esté listo.",
          className: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
        });
      } else {
        setIsExporting(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo iniciar la exportación",
        });
      }

    } catch (error) {
      console.error('Error exporting:', error);
      setIsExporting(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error al exportar",
      });
    }
  };

  const handleCleanDatabase = async () => {
    setIsCleaningDB(true);
    
    try {
      const response = await fetch('/api/clean-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "🚫 Acceso Denegado",
          description: result.error || "No tienes permisos para realizar esta acción",
          className: "bg-gradient-to-br from-red-600 to-red-700 text-white border-red-500",
        });
        return;
      }

      toast({
        title: "✨ Sistema Reiniciado Exitosamente",
        description: "Todos los datos de desarrollo han sido eliminados. La página se recargará en un momento.",
        className: "bg-gradient-to-br from-violet-500 to-purple-600 text-white border-violet-400",
      });

      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err) {
      console.error('Error cleaning database:', err);
      toast({
        variant: "destructive",
        title: "❌ Error al Reiniciar",
        description: "Ocurrió un error inesperado. Por favor, intenta nuevamente.",
        className: "bg-gradient-to-br from-red-600 to-red-700 text-white border-red-500",
      });
    } finally {
      setIsCleaningDB(false);
    }
  };

  // FUNCIÓN MODIFICADA: Ahora formatea con separador de millares
  // Función manual: Formatea números con separador de millares
const formatNumber = (num: number | string): string => {
  const value = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(value)) return '0';
  
  const parts = value.toString().split('.');
  const integerPart = parts[0];
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return formattedInteger;
};

// Función manual: Formatea moneda con separador de millares
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
  const FilterSheet = () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="md:hidden hover:bg-accent transition-colors duration-200"
        >
          Filtros
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px]">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Filtra los datos del dashboard
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4" data-tutorial="filters-mobile">
          <div className="space-y-2">
            <label className="text-sm font-medium">Año</label>
            <Select
              value={selectedAño?.toString() || 'all'}
              onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
            >
              <SelectTrigger className="hover:bg-accent transition-colors duration-200">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Trimestre</label>
            <Select
              value={selectedTrimestre?.toString() || 'all'}
              onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
              disabled={!selectedAño}
            >
              <SelectTrigger className="hover:bg-accent transition-colors duration-200 disabled:cursor-not-allowed">
                <SelectValue placeholder="Trimestre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="1">T1</SelectItem>
                <SelectItem value="2">T2</SelectItem>
                <SelectItem value="3">T3</SelectItem>
                <SelectItem value="4">T4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selectedAño || selectedTrimestre) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedAño(null);
                setSelectedTrimestre(null);
              }}
              className="w-full hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            >
              <X className="h-4 w-4 mr-2" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  const CleanButton = () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          size="sm"
          variant="outline"
          className="gap-2 hidden sm:flex hover:bg-violet-50 hover:text-violet-600 hover:border-violet-300 dark:hover:bg-violet-950 dark:hover:text-violet-400 dark:hover:border-violet-700 transition-all duration-200 group"
        >
          <RefreshCcw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
          <span className="hidden lg:inline">Reiniciar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-violet-500/20 rounded-xl">
              <AlertTriangle className="h-6 w-6 text-violet-400" />
            </div>
            ¿Reiniciar el sistema?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <span className="font-semibold text-red-400 text-sm block">
                  ⚠️ Esta acción es irreversible
                </span>
              </div>
              <span className="text-sm block">
                Se eliminarán todos los datos del sistema.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="w-full sm:w-auto hover:bg-accent transition-colors duration-200">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanDatabase}
            disabled={isCleaningDB}
            className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700 transition-colors duration-200"
          >
            {isCleaningDB ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reiniciando...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reiniciar
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Estados de carga y sin datos
  if (isLoading) {
    return (
      <MainLayout>
        <DashboardTutorial />
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <MainLayoutHeader>
            <div className="flex items-center justify-between w-full">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">Dashboard</h2>
              <div className="flex items-center gap-2">
                <FilterSheet />
                <Button size="sm" variant="outline" disabled className="hidden sm:flex">
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="hidden lg:inline">Exportar</span>
                </Button>
                <CleanButton />
              </div>
            </div>
          </MainLayoutHeader>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 animate-pulse" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!analytics) {
    return (
      <MainLayout>
        <DashboardTutorial />
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <MainLayoutHeader>
            <div className="flex items-center justify-between w-full">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">Dashboard</h2>
            </div>
          </MainLayoutHeader>
          <div className="flex h-[400px] items-center justify-center text-muted-foreground text-center px-4">
            <div className="space-y-3 animate-fade-in">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <p className="text-lg">Selecciona al menos una empresa para ver el dashboard</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  const financialSummaryData = [
    { name: 'T1', sales: analytics.quarterlySummary.T1.ingresos, expenses: analytics.quarterlySummary.T1.gastos },
    { name: 'T2', sales: analytics.quarterlySummary.T2.ingresos, expenses: analytics.quarterlySummary.T2.gastos },
    { name: 'T3', sales: analytics.quarterlySummary.T3.ingresos, expenses: analytics.quarterlySummary.T3.gastos },
    { name: 'T4', sales: analytics.quarterlySummary.T4.ingresos, expenses: analytics.quarterlySummary.T4.gastos },
  ];
  
  const ivaSummaryData = [
    { name: 'T1', ivaRepercutido: analytics.ivaSummary.T1.repercutido, ivaSoportado: analytics.ivaSummary.T1.soportado },
    { name: 'T2', ivaRepercutido: analytics.ivaSummary.T2.repercutido, ivaSoportado: analytics.ivaSummary.T2.soportado },
    { name: 'T3', ivaRepercutido: analytics.ivaSummary.T3.repercutido, ivaSoportado: analytics.ivaSummary.T3.soportado },
    { name: 'T4', ivaRepercutido: analytics.ivaSummary.T4.repercutido, ivaSoportado: analytics.ivaSummary.T4.soportado },
  ];return (
    <MainLayout>
      <DashboardTutorial />
      <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        <MainLayoutHeader>
          <div data-tutorial="welcome" className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Dashboard
              </h2>
              
              {/* Filtros en desktop */}
              <div data-tutorial="filters" className="hidden md:flex items-center gap-2">
                <Select
                  value={selectedAño?.toString() || 'all'}
                  onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
                >
                  <SelectTrigger className="w-[100px] lg:w-[120px] hover:bg-accent transition-colors duration-200">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="hover:bg-accent transition-colors duration-150">Todos</SelectItem>
                    <SelectItem value="2025" className="hover:bg-accent transition-colors duration-150">2025</SelectItem>
                    <SelectItem value="2024" className="hover:bg-accent transition-colors duration-150">2024</SelectItem>
                    <SelectItem value="2023" className="hover:bg-accent transition-colors duration-150">2023</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedTrimestre?.toString() || 'all'}
                  onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
                  disabled={!selectedAño}
                >
                  <SelectTrigger className="w-[100px] lg:w-[120px] hover:bg-accent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50">
                    <SelectValue placeholder="Trimestre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="hover:bg-accent transition-colors duration-150">Todos</SelectItem>
                    <SelectItem value="1" className="hover:bg-accent transition-colors duration-150">T1</SelectItem>
                    <SelectItem value="2" className="hover:bg-accent transition-colors duration-150">T2</SelectItem>
                    <SelectItem value="3" className="hover:bg-accent transition-colors duration-150">T3</SelectItem>
                    <SelectItem value="4" className="hover:bg-accent transition-colors duration-150">T4</SelectItem>
                  </SelectContent>
                </Select>

                {(selectedAño || selectedTrimestre) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedAño(null);
                      setSelectedTrimestre(null);
                    }}
                    className="hover:bg-destructive/10 hover:text-destructive transition-all duration-200 group"
                  >
                    <X className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
                  </Button>
                )}
              </div>
            </div>
            
            {/* Botones de acción */}
            <div className="flex items-center gap-2 shrink-0">
              <FilterSheet />
              <Button
                data-tutorial="export-button"
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isExporting || !selectedCompanyIds.length}
                className="hidden sm:flex gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-all duration-200 disabled:cursor-not-allowed group"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden lg:inline">Generando...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform duration-200" />
                    <span className="hidden lg:inline">Exportar PDF</span>
                    <span className="lg:hidden">PDF</span>
                  </>
                )}
              </Button>
              <CleanButton />
            </div>
          </div>
        </MainLayoutHeader>

        <div className="space-y-4">
          {/* KPIs Grid - MODIFICADO: Ahora usa formatNumber para números enteros */}
          <div data-tutorial="kpis" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="animate-fade-in group" style={{ animationDelay: '0ms' }}>
              <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                <StatsCard
                  title="Total Ingresos"
                  value={formatCurrency(analytics.kpis.totalIngresos)}
                  icon={ArrowUpRight}
                  description={`${formatNumber(analytics.kpis.totalFacturasIngreso)} facturas`}
                />
              </div>
            </div>
            <div className="animate-fade-in group" style={{ animationDelay: '50ms' }}>
              <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                <StatsCard
                  title="Total Gastos"
                  value={formatCurrency(analytics.kpis.totalGastos)}
                  icon={ArrowDownLeft}
                  description={`${formatNumber(analytics.kpis.totalFacturasGasto)} facturas`}
                />
              </div>
            </div>
            <div className="animate-fade-in group" style={{ animationDelay: '100ms' }}>
              <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                <StatsCard
                  title="Beneficio Bruto"
                  value={formatCurrency(analytics.kpis.beneficio)}
                  icon={Scale}
                  description="Ingresos - Gastos"
                />
              </div>
            </div>
            <div className="animate-fade-in group" style={{ animationDelay: '150ms' }}>
              <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                <StatsCard
                  title="Resultado IVA"
                  value={formatCurrency(analytics.kpis.resultadoIva)}
                  icon={Banknote}
                  description="Repercutido - Soportado"
                />
              </div>
            </div>
            <div className="animate-fade-in group" style={{ animationDelay: '200ms' }}>
              <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                <StatsCard
                  title="Total Documentos"
                  value={formatNumber(analytics.kpis.totalDocs)}
                  icon={FileText}
                  description="En el sistema"
                />
              </div>
            </div>
          </div>
          

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <div data-tutorial="financial-chart" className="lg:col-span-4 animate-fade-in" style={{ animationDelay: '250ms' }}>
              <FinancialSummary data={financialSummaryData} />
            </div>
            <div data-tutorial="distribution-chart" className="lg:col-span-3 animate-fade-in" style={{ animationDelay: '300ms' }}>
              <DocumentStatusChart data={analytics.documentDistribution} />
            </div>
            <div data-tutorial="iva-chart" className="lg:col-span-full animate-fade-in" style={{ animationDelay: '350ms' }}>
              <IvaSummary data={ivaSummaryData} />
            </div>
            <div className="lg:col-span-4 animate-fade-in" style={{ animationDelay: '400ms' }}>
              <InsightsWidget 
                incidentRate={analytics.kpis.incidentRate}
                topProviders={analytics.topProviders}
              />
            </div>
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 auto-rows-min">
              <div className="animate-fade-in group" style={{ animationDelay: '450ms' }}>
                <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                  <StatsCard
                    title="Incidencias Abiertas"
                    value={formatNumber(analytics.kpis.incidenciasAbiertas)}
                    icon={AlertTriangle}
                    description={`${analytics.kpis.incidentRate.toFixed(1)}% de docs`}
                  />
                </div>
              </div>
              <div className="animate-fade-in group" style={{ animationDelay: '500ms' }}>
                <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                  <StatsCard
                    title="Proveedores"
                    value={formatNumber(analytics.kpis.totalProveedores)}
                    icon={Users}
                    description="Únicos registrados"
                  />
                </div>
              </div>
              <div className="animate-fade-in group" style={{ animationDelay: '550ms' }}>
                <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                  <StatsCard
                    title="Productos"
                    value={formatNumber(analytics.kpis.totalProductos)}
                    icon={Package}
                    description="Únicos registrados"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
}.animate-fade-in {
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
</MainLayout>);
}