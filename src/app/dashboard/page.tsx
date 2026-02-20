'use client';

import { useEffect, useState } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { getSession } from '@/services/auth-service';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FinancialSummary } from '@/components/dashboard/financial-summary';
import { DocumentStatusChart } from '@/components/dashboard/document-status-chart';
import { IvaSummary } from '@/components/dashboard/iva-summary';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { DashboardTutorial } from '@/components/dashboard/dashboard-tutorial';
import { getDashboardAnalytics } from '@/services/document-service';
import { type DashboardAnalytics } from '@/lib/types';
import {
  LayoutDashboard,
  FileText,
  Users,
  AlertTriangle,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  TrendingUp,
  Euro,
  CalendarRange,
  PieChart,
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopProviders } from '@/components/dashboard/top-providers';

export default function DashboardPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningDB, setIsCleaningDB] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

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
  }; const FilterSheet = () => (
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

  // ✅ Load User ID for permissions
  useEffect(() => {
    async function loadUser() {
      const session = await getSession();
      if (session?.userId) {
        setUserId(session.userId);
      }
    }
    loadUser();
  }, []);

  const CleanButton = () => {
    const allowedIds = [4, 5, 6, 42];
    const canReset = userId && allowedIds.includes(userId);

    // If user not allowed, show disabled/forbidden state
    if (!canReset) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 hidden sm:flex cursor-not-allowed opacity-50 hover:bg-transparent"
          title="No tienes permisos para reiniciar el sistema"
          disabled
        >
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          <span className="hidden lg:inline text-muted-foreground">Reiniciar</span>
        </Button>
      );
    }

    return (
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
  };

  if (isLoading) {
    return (
      <MainLayout>
        <DashboardTutorial />
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <PageHeader
            title="Dashboard"
            icon={LayoutDashboard}
          >
            <div className="flex items-center gap-2">
              <FilterSheet />
              <Button
                size="sm"
                variant="outline"
                disabled
                className="hidden sm:flex"
                data-tutorial="export-button"
              >
                <FileText className="h-4 w-4 mr-2" />
                <span className="hidden lg:inline">Exportar</span>
              </Button>
              <CleanButton />
            </div>
          </PageHeader>
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
          <PageHeader
            title="Dashboard"
            icon={LayoutDashboard}
          />
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

  // ✅ Prepare data for FinancialSummary component
  const financialAnnualData = Object.keys(analytics.yearlySummary || {}).map(year => ({
    name: year,
    sales: analytics.yearlySummary[year].ingresos,
    expenses: analytics.yearlySummary[year].gastos
  }));

  const financialQuarterlyData: Record<string, any[]> = {};
  if (analytics.multiYearQuarterlySummary) {
    Object.keys(analytics.multiYearQuarterlySummary).forEach(year => {
      const yearData = analytics.multiYearQuarterlySummary[year];
      financialQuarterlyData[year] = [
        { name: 'T1', sales: yearData.T1?.ingresos || 0, expenses: yearData.T1?.gastos || 0 },
        { name: 'T2', sales: yearData.T2?.ingresos || 0, expenses: yearData.T2?.gastos || 0 },
        { name: 'T3', sales: yearData.T3?.ingresos || 0, expenses: yearData.T3?.gastos || 0 },
        { name: 'T4', sales: yearData.T4?.ingresos || 0, expenses: yearData.T4?.gastos || 0 },
      ];
    });
  }

  // ✅ Prepare data for IvaSummary component
  const ivaAnnualData = Object.keys(analytics.ivaYearlySummary || {}).map(year => ({
    name: year,
    ivaRepercutido: analytics.ivaYearlySummary[year].repercutido,
    ivaSoportado: analytics.ivaYearlySummary[year].soportado
  }));

  const ivaQuarterlyData: Record<string, any[]> = {};
  if (analytics.multiYearIvaSummary) {
    Object.keys(analytics.multiYearIvaSummary).forEach(year => {
      const yearData = analytics.multiYearIvaSummary[year];
      ivaQuarterlyData[year] = [
        { name: 'T1', ivaRepercutido: yearData.T1?.repercutido || 0, ivaSoportado: yearData.T1?.soportado || 0 },
        { name: 'T2', ivaRepercutido: yearData.T2?.repercutido || 0, ivaSoportado: yearData.T2?.soportado || 0 },
        { name: 'T3', ivaRepercutido: yearData.T3?.repercutido || 0, ivaSoportado: yearData.T3?.soportado || 0 },
        { name: 'T4', ivaRepercutido: yearData.T4?.repercutido || 0, ivaSoportado: yearData.T4?.soportado || 0 },
      ];
    });
  }

  return (
    <MainLayout>
      <DashboardTutorial />
      <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Dashboard"
          icon={LayoutDashboard}
        >
          <div data-tutorial="filters" className="hidden md:flex items-center gap-2">
            <Select
              value={selectedAño?.toString() || 'all'}
              onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Año fiscal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (Auto)</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedTrimestre?.toString() || 'all'}
              onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
              disabled={!selectedAño}
            >
              <SelectTrigger className="w-[180px]">
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
            <CleanButton />
          </div>
        </PageHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Resumen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-tutorial="kpis">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Ingresos (con IVA)
                      </CardTitle>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.totalIngresos)}</div>
                      <p className="text-xs text-muted-foreground">
                        {analytics.kpis.totalFacturasIngreso} facturas
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Ingresos</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Imponible:</span>
                      <span className="font-medium">{formatCurrency(analytics.kpis.totalIngresosSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA Rep. (incl. recargo):</span>
                      <span className="font-medium">{formatCurrency((analytics.kpis.ivaRepercutido || 0) + (analytics.kpis.recargoRepercutido || 0))}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="text-green-600">{formatCurrency(analytics.kpis.totalIngresos)}</span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Gastos (con IVA)
                      </CardTitle>
                      <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.totalGastos)}</div>
                      <p className="text-xs text-muted-foreground">
                        {analytics.kpis.totalFacturasGasto} facturas
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Gastos</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Imponible:</span>
                      <span className="font-medium">{formatCurrency(analytics.kpis.totalGastosSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA Sop. (incl. recargo):</span>
                      <span className="font-medium">{formatCurrency((analytics.kpis.ivaSoportado || 0) + (analytics.kpis.recargoSoportado || 0))}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="text-red-600">{formatCurrency(analytics.kpis.totalGastos)}</span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Beneficio Bruto (con IVA)
                      </CardTitle>
                      <Euro className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.beneficio || 0)}</div>
                      <p className="text-xs text-muted-foreground">
                        Ingresos - Gastos
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Beneficio</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ingresos Totales:</span>
                      <span className="text-green-600 font-medium">+{formatCurrency(analytics.kpis.totalIngresos)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gastos Totales:</span>
                      <span className="text-red-600 font-medium">-{formatCurrency(analytics.kpis.totalGastos)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className={analytics.kpis.beneficio >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(analytics.kpis.beneficio)}
                      </span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Resultado IVA
                      </CardTitle>
                      <Euro className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.resultadoIva || 0)}</div>
                      <p className="text-xs text-muted-foreground">
                        Repercutido - Soportado
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de IVA</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Repercutido + Recargo:</span>
                      <span className="text-green-600 font-medium">+{formatCurrency((analytics.kpis.ivaRepercutido || 0) + (analytics.kpis.recargoRepercutido || 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Soportado + Recargo:</span>
                      <span className="text-red-600 font-medium">-{formatCurrency((analytics.kpis.ivaSoportado || 0) + (analytics.kpis.recargoSoportado || 0))}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>A liquidar:</span>
                      <span className={analytics.kpis.resultadoIva >= 0 ? "text-green-600" : "text-green-600"}>
                        {formatCurrency(analytics.kpis.resultadoIva)}
                      </span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <Card className="hover:shadow-lg transition-all duration-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Documentos
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.kpis.totalDocs}</div>
                  <p className="text-xs text-muted-foreground">
                    En el sistema
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4" data-tutorial="financial-summary">
                <FinancialSummary
                  annualData={financialAnnualData}
                  quarterlyData={financialQuarterlyData}
                  defaultYear={selectedAño?.toString() || null}
                />
              </div>
              <div className="col-span-3">
                <DocumentStatusChart data={analytics.documentDistribution} />
              </div>
            </div>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4">
                <IvaSummary
                  annualData={ivaAnnualData}
                  quarterlyData={ivaQuarterlyData}
                  defaultYear={selectedAño?.toString() || null}
                />
              </div>
              <div className="col-span-3">
                <TopProviders data={analytics.topProviders} />
              </div>
            </div>
          </TabsContent>


        </Tabs>
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
    </MainLayout >
  );
}