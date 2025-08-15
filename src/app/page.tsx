
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments, getUniqueProvidersCount, getAllProducts } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FileText, FileWarning, Euro, Users, Package, MinusCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentStatusChart } from "@/components/dashboard/document-status-chart";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { InsightsWidget } from "@/components/dashboard/insights-widget";
import type { Document } from "@/lib/types";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";


// === Helpers ===
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

const getQuarter = (date: Date): number => {
    const month = date.getUTCMonth();
    return Math.floor(month / 3) + 1;
};


// === Procesador de datos ===
const processDashboardData = (documents: Document[], providersCount: number, productsCount: number) => {
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const monthName = new Date(0, i).toLocaleString('es-ES', { month: 'short' });
        return {
          name: monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', ''),
          sales: 0,
          expenses: 0,
          ivaRepercutido: 0,
          ivaSoportado: 0,
        };
    });
    
    const quarterlyData = [
        { name: 'T1', sales: 0, expenses: 0 },
        { name: 'T2', sales: 0, expenses: 0 },
        { name: 'T3', sales: 0, expenses: 0 },
        { name: 'T4', sales: 0, expenses: 0 },
    ];

  let totalSales = 0;
  let totalExpenses = 0;
  let totalBaseExpenses = 0;
  let totalIncidents = 0;
  const providerExpenses: { [key: string]: { name: string; total: number; fiscalId: string } } = {};
  const documentTypeCounts: { [key: string]: number } = {};

  documents.forEach(doc => {
    const date = new Date(doc.fecha_emision);
    if (isNaN(date.getTime())) return;
    
    const month = date.getUTCMonth(); // 0-11 for Jan-Dec
    const quarter = getQuarter(date) - 1; // 0-3 for Q1-Q4

    if (doc.incidencia) totalIncidents++;
    documentTypeCounts[doc.tipo_documento] = (documentTypeCounts[doc.tipo_documento] || 0) + 1;
    
    // Gastos
    if (doc.gasto > 0) {
      const baseImponible = Number(doc.base_imponible) || 0;
      const total = Number(doc.total) || 0;
      
      // Populate monthly data
      monthlyData[month].expenses += baseImponible;
      (doc.iva_details || []).forEach((iva: any) => monthlyData[month].ivaSoportado += (Number(iva.cuota) || 0));

      // Populate quarterly data
      quarterlyData[quarter].expenses += baseImponible;

      totalExpenses += total;
      totalBaseExpenses += baseImponible;

      if (doc.proveedor && doc.proveedor !== 'N/A' && doc.cif) {
         if (!providerExpenses[doc.cif]) {
            providerExpenses[doc.cif] = { name: doc.proveedor, total: 0, fiscalId: doc.cif };
        }
        providerExpenses[doc.cif].total += total;
      }
    }
  });

  const timeSeriesChartData = Object.values(monthlyData);
  const financialSummaryChartData = Object.values(quarterlyData);

  const providerChartData = Object.values(providerExpenses)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const documentStatusChartData = Object.entries(documentTypeCounts)
    .map(([name, value]) => ({ name, value }));
    
  const incidentRate = documents.length > 0 ? (totalIncidents / documents.length) * 100 : 0;

  return {
    timeSeriesChartData,
    financialSummaryChartData,
    documentStatusChartData,
    totalExpenses,
    totalBaseExpenses,
    totalIncidents,
    totalDocuments: documents.length,
    totalProviders: providersCount,
    totalProducts: productsCount,
    incidentRate,
    topProvidersByAmount: providerChartData,
  };
};

// === Página principal ===
export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [providersCount, setProvidersCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [docs, provsCount, prodsCount] = await Promise.all([
          getDocuments(),
          getUniqueProvidersCount(),
          getAllProducts()
        ]);
        setDocuments(docs);
        setProvidersCount(provsCount);
        setProductsCount(prodsCount);
      } catch (error) {
        console.error("Error cargando dashboard", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const {
    timeSeriesChartData,
    financialSummaryChartData,
    documentStatusChartData,
    totalExpenses,
    totalBaseExpenses,
    totalIncidents,
    totalDocuments,
    totalProviders,
    totalProducts,
    incidentRate,
    topProvidersByAmount
  } = processDashboardData(documents, providersCount, productsCount);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MainLayoutHeader>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </MainLayoutHeader>

        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <StatsCard title="Gasto Total" value={formatCurrency(totalExpenses)} icon={Euro} description="Periodo actual (con IVA)" />
            <StatsCard title="Gasto sin Impuestos" value={formatCurrency(totalBaseExpenses)} icon={MinusCircle} description="Periodo actual (sin IVA)" />
            <StatsCard title="Documentos" value={totalDocuments.toString()} icon={FileText} description="Total histórico" />
            <StatsCard title="Proveedores" value={totalProviders.toString()} icon={Users} description="Proveedores únicos" />
            <StatsCard title="Productos" value={totalProducts.toString()} icon={Package} description="Productos únicos" />
            <StatsCard title="Incidencias" value={totalIncidents.toString()} icon={FileWarning} description="Abiertas actualmente" />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-1 lg:col-span-4">
              <FinancialSummary data={financialSummaryChartData} />
            </div>
            <div className="col-span-1 lg:col-span-3">
              <DocumentStatusChart data={documentStatusChartData} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <InsightsWidget incidentRate={incidentRate} topProviders={topProvidersByAmount} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <TimeSeriesChart data={timeSeriesChartData} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
