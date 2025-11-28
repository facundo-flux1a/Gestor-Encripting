'use client';

import { useEffect, useState } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FinancialSummary } from '@/components/dashboard/financial-summary';
import { DocumentStatusChart } from '@/components/dashboard/document-status-chart';
import { IvaSummary } from '@/components/dashboard/iva-summary';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { getDashboardAnalytics, type DashboardAnalytics } from '@/services/document-service';
import { FileText, Users, AlertTriangle, Package, ArrowUpRight, ArrowDownLeft, Scale, Banknote, Loader2, RefreshCcw } from 'lucide-react';
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

export default function DashboardPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningDB, setIsCleaningDB] = useState(false);
  
  const [selectedAño, setSelectedAño] = useState<number | null>(null);
  const [selectedTrimestre, setSelectedTrimestre] = useState<number | null>(null);
  
  // ✅ Estados para export con polling
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
      console.log('🔍 [Dashboard] selectedCompanyIds:', selectedCompanyIds); // ✅ Debug log
      
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        console.log('⚠️ [Dashboard] No hay empresas seleccionadas, limpiando analytics');
        setAnalytics(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const companyIdsAsNumbers = selectedCompanyIds.map(id => Number(id));
        
        console.log('📊 [Dashboard] Cargando analytics para empresas:', companyIdsAsNumbers);
        
        const data = await getDashboardAnalytics(
          companyIdsAsNumbers,
          selectedAño ?? undefined,
          selectedTrimestre ?? undefined
        );
        
        console.log('✅ [Dashboard] Analytics cargadas:', data);
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

  // ✅ Función para hacer polling del estado del export
  const checkExportStatus = async (exportId: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/check-export?exportId=${exportId}`);
      const data = await response.json();

      console.log('🔍 [Frontend] Respuesta de check-export:', data);
      console.log('🔍 [Frontend] Estado detectado:', data.status, '| Esperaba: completed');

      // ✅ Actualizar estado local
      setExportStatus({
        exportId,
        status: data.status,
        urlArchivo: data.urlArchivo,
        nombreArchivo: data.nombreArchivo
      });

      if (data.status === 'completed') {
        setIsExporting(false);
        
        console.log('🎉 Export completado! Iniciando descarga...', {
          status: data.status,
          urlArchivo: data.urlArchivo,
          nombreArchivo: data.nombreArchivo
        });
        
        toast({
          title: "✅ PDF Generado",
          description: `Descargando: ${data.nombreArchivo}`,
          className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
        });
        
        if (data.urlArchivo) {
          // ✅ Extraer solo el nombre del archivo de la URL completa
          // Ejemplo: "https://...ngrok.../api/files/Reporte_Dashboard_xxx.pdf" → "Reporte_Dashboard_xxx.pdf"
          const filename = data.nombreArchivo || data.urlArchivo.split('/').pop() || 'reporte.pdf';
          
          // ✅ Usar la API route interna en lugar de la URL externa
          const downloadUrl = `/api/files/${filename}`;
          
          console.log('📥 [Frontend] Descargando desde API interna:', downloadUrl);
          console.log('📄 [Frontend] Nombre del archivo:', filename);
          
          // ✅ Crear link temporal y forzar descarga
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          
          console.log('🔗 [Frontend] Link creado:', {
            href: link.href,
            download: link.download
          });
          
          link.click();
          
          // Limpiar después de un pequeño delay
          setTimeout(() => {
            document.body.removeChild(link);
            console.log('✅ [Frontend] Descarga iniciada, link removido');
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
      console.error('❌ [Frontend] Error checking export status:', error);
      return false;
    }
  };

  // ✅ Función para iniciar polling
  const startPolling = (exportId: number) => {
    const intervalId = setInterval(async () => {
      const shouldStop = await checkExportStatus(exportId);
      if (shouldStop) {
        clearInterval(intervalId);
        clearTimeout(timeoutId); // ✅ Limpiar timeout cuando termina exitosamente
      }
    }, 3000); // Revisar cada 3 segundos

    // Timeout después de 2 minutos
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

  // ✅ Función para exportar
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
        console.log('Export iniciado:', result.exportId);
        
        // Iniciar polling
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

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

  const CleanButton = () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          size="sm"
          className="gap-2 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-violet-600 hover:from-violet-600 hover:via-purple-600 hover:to-violet-700 text-white shadow-lg hover:shadow-violet-500/50 transition-all duration-200 border-2 border-violet-400/30"
        >
          <RefreshCcw className="h-4 w-4" />
          <span className="font-medium">Reiniciar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-gray-950 border-violet-500/30 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-xl text-white">
            <div className="p-2 bg-violet-500/20 rounded-xl">
              <AlertTriangle className="h-6 w-6 text-violet-400" />
            </div>
            ¿Reiniciar el sistema completamente?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <span className="font-semibold text-red-400 text-sm block">
                  ⚠️ Esta acción es irreversible
                </span>
              </div>
              <span className="text-sm text-gray-300 block">
                Se eliminarán permanentemente:
              </span>
              <div className="text-sm text-gray-400 space-y-1 pl-4">
                <div>• Todos los documentos</div>
                <div>• Todos los proveedores</div>
                <div>• Todos los productos</div>
                <div>• Todas las incidencias</div>
              </div>
              <div className="pt-2 flex items-center gap-2 text-xs text-violet-300 bg-violet-500/10 p-2 rounded-lg border border-violet-500/30">
                <RefreshCcw className="h-3 w-3" />
                <span className="font-medium">Solo usuarios autorizados pueden ejecutar esta acción</span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 border-gray-700">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanDatabase}
            disabled={isCleaningDB}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-xl text-white"
          >
            {isCleaningDB ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reiniciando...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Sí, reiniciar sistema
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <MainLayoutHeader>
            <div className="flex items-center justify-between w-full">
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled>
                  <FileText className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
                <CleanButton />
              </div>
            </div>
          </MainLayoutHeader>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-[300px]" />
            <Skeleton className="h-[300px]" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <MainLayoutHeader>
            <div className="flex items-center justify-between w-full">
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled>
                  <FileText className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
                <CleanButton />
              </div>
            </div>
          </MainLayoutHeader>
          <div className="flex h-[400px] items-center justify-center text-red-500">
            Error: {error}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!analytics) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <MainLayoutHeader>
            <div className="flex items-center justify-between w-full">
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled>
                  <FileText className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
                <CleanButton />
              </div>
            </div>
          </MainLayoutHeader>
          <div className="flex h-[400px] items-center justify-center text-muted-foreground text-lg">
            Selecciona al menos una empresa para ver el dashboard
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
  ];

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MainLayoutHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-bold tracking-tight">
                Dashboard
                {selectedCompanyIds.length > 1 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({selectedCompanyIds.length} empresas seleccionadas)
                  </span>
                )}
              </h2>
              
              <div className="flex items-center gap-2">
                <Select
                  value={selectedAño?.toString() || 'all'}
                  onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedTrimestre?.toString() || 'all'}
                  onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
                  disabled={!selectedAño}
                >
                  <SelectTrigger className="w-[120px]">
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

                {(selectedAño || selectedTrimestre) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedAño(null);
                      setSelectedTrimestre(null);
                    }}
                  >
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
            
            {/* ✅ Botones de acción con estado de export */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isExporting || !selectedCompanyIds.length}
                className="gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generando PDF...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Exportar PDF
                  </>
                )}
              </Button>
              <CleanButton />
            </div>
          </div>
        </MainLayoutHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <StatsCard
              title="Total Ingresos"
              value={formatCurrency(analytics.kpis.totalIngresos)}
              icon={ArrowUpRight}
              description={`${analytics.kpis.totalFacturasIngreso} facturas de venta`}
            />
            <StatsCard
              title="Total Gastos"
              value={formatCurrency(analytics.kpis.totalGastos)}
              icon={ArrowDownLeft}
              description={`${analytics.kpis.totalFacturasGasto} facturas de compra`}
            />
            <StatsCard
              title="Beneficio Bruto"
              value={formatCurrency(analytics.kpis.beneficio)}
              icon={Scale}
              description="Ingresos - Gastos"
            />
            <StatsCard
              title="Resultado IVA"
              value={formatCurrency(analytics.kpis.resultadoIva)}
              icon={Banknote}
              description="IVA Repercutido - Soportado"
            />
            <StatsCard
              title="Total Documentos"
              value={analytics.kpis.totalDocs.toString()}
              icon={FileText}
              description="Documentos en el sistema"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-1 lg:col-span-4">
              <FinancialSummary data={financialSummaryData} />
            </div>
            <div className="col-span-1 lg:col-span-3">
              <DocumentStatusChart data={analytics.documentDistribution} />
            </div>
            <div className="col-span-1 lg:col-span-full">
              <IvaSummary data={ivaSummaryData} />
            </div>
            <div className="col-span-1 lg:col-span-4">
              <InsightsWidget 
                incidentRate={analytics.kpis.incidentRate}
                topProviders={analytics.topProviders}
              />
            </div>
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 gap-4 auto-rows-min">
              <StatsCard
                title="Incidencias Abiertas"
                value={analytics.kpis.incidenciasAbiertas.toString()}
                icon={AlertTriangle}
                description={`${analytics.kpis.incidentRate.toFixed(1)}% de los documentos`}
              />
              <StatsCard
                title="Proveedores Únicos"
                value={analytics.kpis.totalProveedores.toString()}
                icon={Users}
                description="Total de proveedores registrados"
              />
              <StatsCard
                title="Productos Únicos"
                value={analytics.kpis.totalProductos.toString()}
                icon={Package}
                description="Total de productos registrados"
              />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}