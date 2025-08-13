'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments, getUniqueProviders, getAllProducts } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FileText, FileWarning, Euro, Users, Package, Filter, Download, Bell } from "lucide-react";
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
const processDashboardData = (documents, providersCount, productsCount) => {
  const quarterlyData = {
    '1': { name: 'T1', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '2': { name: 'T2', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '3': { name: 'T3', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    '4': { name: 'T4', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
  };

  let totalSales = 0;
  let totalExpenses = 0;
  let totalIncidents = 0;
  const providerExpenses = {};
  const documentTypeCounts = {};

  documents.forEach(doc => {
    const date = new Date(doc.fecha_emision);
    if (isNaN(date.getTime())) return;
    const quarter = getQuarter(date);

    if (doc.incidencia) totalIncidents++;
    documentTypeCounts[doc.tipo_documento] = (documentTypeCounts[doc.tipo_documento] || 0) + 1;

    if (doc.ingreso > 0) {
      quarterlyData[quarter].sales += doc.base_imponible;
      totalSales += doc.base_imponible;
      doc.iva_details.forEach(iva => quarterlyData[quarter].ivaRepercutido += iva.cuota);
    }

    if (doc.gasto > 0) {
      quarterlyData[quarter].expenses += doc.base_imponible;
      totalExpenses += doc.base_imponible;
      doc.iva_details.forEach(iva => quarterlyData[quarter].ivaSoportado += iva.cuota);
      if (doc.proveedor && doc.proveedor !== 'N/A') {
        providerExpenses[doc.proveedor] = (providerExpenses[doc.proveedor] || 0) + doc.gasto;
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
  const [documents, setDocuments] = useState([]);
  const [providersCount, setProvidersCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    periodo: 'trimestre',
    proveedor: [],
    tipoDocumento: '',
    estado: '',
    departamento: '',
    responsable: '',
    etiqueta: '',
    producto: ''
  });

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
      {/* Barra superior */}
      <div className="flex items-center justify-between p-4 bg-white shadow rounded-md">
        <div className="flex gap-2 items-center">
          <select
            value={filters.periodo}
            onChange={e => setFilters(f => ({ ...f, periodo: e.target.value }))}
            className="border p-2 rounded"
          >
            <option value="trimestre">Trimestre actual</option>
            <option value="mes">Mes actual</option>
            <option value="año">Año actual</option>
          </select>
          <input
            type="text"
            placeholder="Búsqueda global..."
            className="border p-2 rounded"
          />
          <button className="p-2 border rounded flex items-center gap-1"><Bell size={16}/> Notificaciones</button>
        </div>
        <div className="flex gap-2">
          <button className="p-2 border rounded flex items-center gap-1"><Download size={16}/> CSV</button>
          <button className="p-2 border rounded flex items-center gap-1"><Download size={16}/> PDF</button>
        </div>
      </div>

      <div className="flex">
        {/* Panel lateral */}
        <aside className="w-64 p-4 bg-gray-50 border-r space-y-3">
          <h3 className="font-bold flex items-center gap-1"><Filter size={16}/> Filtros</h3>
          <select multiple className="border p-1 rounded"><option>Proveedor 1</option></select>
          <select className="border p-1 rounded"><option>Tipo documento</option></select>
          <select className="border p-1 rounded"><option>Estado</option></select>
          <button className="bg-blue-500 text-white p-2 rounded w-full">Guardar vista rápida</button>
        </aside>

        {/* Contenido principal */}
        <main className="flex-1 p-6 space-y-6">
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatsCard title="Ingresos" value={formatCurrency(totalSales)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Gastos" value={formatCurrency(totalExpenses)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Documentos" value={totalDocuments.toString()} icon={FileText} description="Total histórico" />
            <StatsCard title="Proveedores" value={totalProviders.toString()} icon={Users} description="Proveedores únicos" />
            <StatsCard title="Productos" value={totalProducts.toString()} icon={Package} description="Productos únicos" />
            <StatsCard title="Incidencias" value={totalIncidents.toString()} icon={FileWarning} description="Abiertas actualmente" />
          </div>

          {/* Gráficas */}
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3"><FinancialSummary data={financialChartData} /></div>
            <div className="lg:col-span-2"><DocumentStatusChart data={documentStatusChartData} /></div>
            <div className="lg:col-span-5"><TotalsByProviderChart data={providerChartData} /></div>
            <div className="lg:col-span-5"><TimeSeriesChart data={financialChartData} /></div>
          </div>

          {/* Insights rápidos */}
          <InsightsWidget variationPercent={variationPercent} topProviders={topProvidersByAmount} />
        </main>
      </div>
    </MainLayout>
  );
}
