

'use client';

import { useState, useEffect } from 'react';
import { MainLayout, MainLayoutHeader } from '@/components/layout/main-layout';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FinancialSummary } from '@/components/dashboard/financial-summary';
import { DocumentStatusChart } from '@/components/dashboard/document-status-chart';
import { IvaSummary } from '@/components/dashboard/iva-summary';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { getDashboardAnalytics, type DashboardAnalytics } from '@/services/document-service';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { FileText, Users, AlertTriangle, Package, Euro, ArrowUpRight, ArrowDownLeft } from 'lucide-react';


export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await getDashboardAnalytics();
        setAnalytics(data);
      } catch (error) {
        console.error("Failed to fetch dashboard analytics", error);
        // Here you could set an error state and show an error message
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading || !analytics) {
    return <DashboardSkeleton />;
  }
  
  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  
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
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </MainLayoutHeader>

        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <StatsCard
              title="Total Ingresos"
              value={formatCurrency(analytics.kpis.totalIngresos)}
              icon={ArrowUpRight}
              description={`${analytics.kpis.totalFacturasIngreso} facturas`}
            />
            <StatsCard
              title="Total Gastos"
              value={formatCurrency(analytics.kpis.totalGastos)}
              icon={ArrowDownLeft}
               description={`${analytics.kpis.totalFacturasGasto} facturas`}
            />
            <StatsCard
              title="Beneficio Bruto"
              value={formatCurrency(analytics.kpis.totalIngresos - analytics.kpis.totalGastos)}
              icon={Euro}
              description="Ingresos - Gastos"
            />
            <StatsCard
              title="Incidencias"
              value={analytics.kpis.incidenciasAbiertas.toString()}
              icon={AlertTriangle}
              description="Pendientes de revisión"
            />
             <StatsCard
              title="Proveedores"
              value={analytics.kpis.totalProveedores.toString()}
              icon={Users}
              description="Proveedores únicos"
            />
             <StatsCard
              title="Productos"
              value={analytics.kpis.totalProductos.toString()}
              icon={Package}
              description="Productos únicos registrados"
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
                <InsightsWidget 
                    incidentRate={analytics.kpis.incidentRate}
                    topProviders={analytics.topProviders}
                />
            </div>
             <div className="col-span-1 lg:col-span-full">
               <IvaSummary data={ivaSummaryData} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
