'use client';

import { MainLayout } from "@/components/layout/main-layout";
import { getDocuments, getUniqueProviders, getAllProducts } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FileText, FileWarning, Euro, Users, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { TotalsByProviderChart } from "@/components/dashboard/totals-by-provider-chart";
import { DocumentStatusChart } from "@/components/dashboard/document-status-chart";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart"; 
import { InsightsWidget } from "@/components/dashboard/insights-widget"; 

// === Helpers ===
const getQuarter = (date: Date) => {
  const month = date.getUTCMonth();
  if (month < 3) return 1;
  if (month < 6) return 2;
  if (month < 9) return 3;
  return 4;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

// === Procesador de datos ===
const processDashboardData = (documents: any[], providersCount: number, productsCount: number) => {
  const quarterlyData = {
    '1': { name: 'T1', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '2': { name: 'T2', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '3': { name: 'T3', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '4': { name: 'T4', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
  };

  let totalSales = 0;
  let totalExpenses = 0;
  let totalIncidents = 0;
  const providerExpenses: { [key: string]: number } = {};
  const documentTypeCounts: { [key: string]: number } = {};

  documents.forEach(doc => {
    const date = new Date(doc.fecha_emision);
    if (isNaN(date.getTime())) return;
    const quarter = getQuarter(date);

    if (doc.incidencia) totalIncidents++;
    documentTypeCounts[doc.tipo_documento] = (documentTypeCounts[doc.tipo_documento] || 0) + 1;

    if (doc.ingreso > 0) {
      quarterlyData[quarter].sales += (doc.base_imponible || 0);
      totalSales += (doc.base_imponible || 0);
      (doc.iva_details || []).forEach((iva: any) => quarterlyData[quarter].ivaRepercutido += (iva.cuota || 0));
    }

    if (doc.gasto > 0) {
      quarterlyData[quarter].expenses += (doc.base_imponible || 0);
      totalExpenses += (doc.base_imponible || 0);
      (doc.iva_details || []).forEach((iva: any) => quarterlyData[quarter].ivaSoportado += (iva.cuota || 0));
      if (doc.proveedor && doc.proveedor !== 'N/A') {
        providerExpenses[doc.proveedor] = (providerExpenses[doc.proveedor] || 0) + (doc.gasto || 0);
      }
    }
  });

  const financialChartData = Object.values(quarterlyData);
  const providerChartData = Object.entries(providerExpenses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));
  const documentStatusChartData = Object.entries(documentTypeCounts)
    .map(([name, value]) => ({ name, value }));

  return {
    financialChartData,
    providerChartData,
    documentStatusChartData,
    totalSales,
    totalExpenses,
    totalIncidents,
    totalDocuments: documents.length,
    totalProviders: providersCount,
    totalProducts: productsCount,
    variationPercent: 40, // ejemplo estático
    topProvidersByAmount: providerChartData.slice(0, 3),
  };
};

// === Página principal ===
export default function Home() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [providersCount, setProvidersCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [docs, provsCount, prodsCount] = await Promise.all([
          getDocuments(),
          getUniqueProviders(),
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
    financialChartData,
    providerChartData,
    documentStatusChartData,
    totalSales,
    totalExpenses,
    totalIncidents,
    totalDocuments,
    totalProviders,
    totalProducts,
    variationPercent,
    topProvidersByAmount
  } = processDashboardData(documents, providersCount, productsCount);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
          <p>Cargando dashboard...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </div>
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <StatsCard title="Ingresos" value={formatCurrency(totalSales)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Gastos" value={formatCurrency(totalExpenses)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Documentos" value={totalDocuments.toString()} icon={FileText} description="Total histórico" />
            <StatsCard title="Proveedores" value={totalProviders.toString()} icon={Users} description="Proveedores únicos" />
            <StatsCard title="Productos" value={totalProducts.toString()} icon={Package} description="Productos únicos" />
            <StatsCard title="Incidencias" value={totalIncidents.toString()} icon={FileWarning} description="Abiertas actualmente" />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-1 lg:col-span-4">
              <FinancialSummary data={financialChartData} />
            </div>
            <div className="col-span-1 lg:col-span-3">
              <DocumentStatusChart data={documentStatusChartData} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <TotalsByProviderChart data={providerChartData} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <TimeSeriesChart data={financialChartData} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <InsightsWidget variationPercent={variationPercent} topProviders={topProvidersByAmount} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
