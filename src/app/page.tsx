
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
import { Loader2 } from "lucide-react";

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
const processDashboardData = (documents: Document[], providersCount: number, productsCount: number) => {
  const quarterlyData = {
    '1': { name: 'T1', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '2': { name: 'T2', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '3': { name: 'T3', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '4': { name: 'T4', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
  };

  let totalSales = 0;
  let totalExpenses = 0;
  let totalBaseExpenses = 0;
  let totalIncidents = 0;
  const providerExpenses: { [key: string]: { name: string; total: number; fiscalId: string } } = {};
  const documentTypeCounts: { [key: string]: number } = {};

  documents.forEach(doc => {
    const date = new Date(doc.fecha_emision);
    if (isNaN(date.getTime())) return;
    const quarter = getQuarter(date);

    if (doc.incidencia) totalIncidents++;
    documentTypeCounts[doc.tipo_documento] = (documentTypeCounts[doc.tipo_documento] || 0) + 1;
    
    // Gastos
    if (doc.gasto > 0) {
      const baseImponible = Number(doc.base_imponible) || 0;
      const total = Number(doc.total) || 0;
      
      quarterlyData[quarter].expenses += baseImponible;
      totalExpenses += total;
      totalBaseExpenses += baseImponible;

      (doc.iva_details || []).forEach((iva: any) => quarterlyData[quarter].ivaSoportado += (Number(iva.cuota) || 0));
      if (doc.proveedor && doc.proveedor !== 'N/A' && doc.cif) {
         if (!providerExpenses[doc.cif]) {
            providerExpenses[doc.cif] = { name: doc.proveedor, total: 0, fiscalId: doc.cif };
        }
        providerExpenses[doc.cif].total += total;
      }
    }
  });

  const financialChartData = Object.values(quarterlyData);
  const providerChartData = Object.values(providerExpenses)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const documentStatusChartData = Object.entries(documentTypeCounts)
    .map(([name, value]) => ({ name, value }));
    
  const incidentRate = documents.length > 0 ? (totalIncidents / documents.length) * 100 : 0;

  return {
    financialChartData,
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
    financialChartData,
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
    return (
      <MainLayout>
        <div className="flex flex-1 items-center justify-center">
           <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
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
              <FinancialSummary data={financialChartData} />
            </div>
            <div className="col-span-1 lg:col-span-3">
              <DocumentStatusChart data={documentStatusChartData} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <InsightsWidget incidentRate={incidentRate} topProviders={topProvidersByAmount} />
            </div>
            <div className="col-span-1 lg:col-span-full">
                <TimeSeriesChart data={financialChartData} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
