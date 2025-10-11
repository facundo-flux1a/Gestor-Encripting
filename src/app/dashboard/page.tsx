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
import { FileText, Users, AlertTriangle, Package, ArrowUpRight, ArrowDownLeft, Scale, Banknote } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        // Convertir los IDs de string a number
        const companyIdsAsNumbers = selectedCompanyIds.map(id => Number(id));
        const data = await getDashboardAnalytics(companyIdsAsNumbers);
        setAnalytics(data);
      } catch (err) {
        console.error('Error loading analytics:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar las analíticas');
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [selectedCompanyIds]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <MainLayoutHeader>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
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
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
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
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          </MainLayoutHeader>
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
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
          <h2 className="text-3xl font-bold tracking-tight">
            Dashboard
            {selectedCompanyIds.length > 1 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({selectedCompanyIds.length} empresas seleccionadas)
              </span>
            )}
          </h2>
        </MainLayoutHeader>

        <div className="space-y-4">
          {/* KPIs */}
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

          {/* Charts */}
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