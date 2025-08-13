
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments, getUniqueProviders, getAllProducts } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { type Document, type DocumentEntity, type DocumentLine } from "@/lib/types";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FileText, FileWarning, Euro, Users, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { TotalsByProviderChart } from "@/components/dashboard/totals-by-provider-chart";
import { DocumentStatusChart } from "@/components/dashboard/document-status-chart";

// Helper to get the quarter from a date
const getQuarter = (date: Date) => {
  const month = date.getUTCMonth();
  if (month < 3) return 1;
  if (month < 6) return 2;
  if (month < 9) return 3;
  return 4;
};

// Data processing
const processDashboardData = (documents: Document[], providersCount: number, productsCount: number) => {
    const quarterlyData: { [key: string]: { name: string, sales: number; expenses: number; ivaRepercutido: number; ivaSoportado: number } } = {
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
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date for document ${doc.id_documento}: ${doc.fecha_emision}`);
            return;
        }

        const quarter = getQuarter(date);

        if(doc.incidencia) {
            totalIncidents++;
        }
        
        // Count document types
        documentTypeCounts[doc.tipo_documento] = (documentTypeCounts[doc.tipo_documento] || 0) + 1;

        if (doc.ingreso > 0) {
            quarterlyData[quarter].sales += doc.base_imponible;
            totalSales += doc.base_imponible;
            doc.iva_details.forEach(iva => {
                quarterlyData[quarter].ivaRepercutido += iva.cuota;
            });
        }

        if (doc.gasto > 0) {
            quarterlyData[quarter].expenses += doc.base_imponible;
            totalExpenses += doc.base_imponible;
            doc.iva_details.forEach(iva => {
                quarterlyData[quarter].ivaSoportado += iva.cuota;
            });
            if (doc.proveedor && doc.proveedor !== 'N/A') {
                providerExpenses[doc.proveedor] = (providerExpenses[doc.proveedor] || 0) + doc.gasto;
            }
        }
    });

    const financialChartData = Object.values(quarterlyData);
    
    const providerChartData = Object.entries(providerExpenses)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5) // Top 5
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
    };
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

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
                    getUniqueProviders(),
                    getAllProducts()
                ]);
                setDocuments(docs);
                setProvidersCount(provsCount);
                setProductsCount(prodsCount);
            } catch (error) {
                console.error("Failed to load dashboard data", error);
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
      totalProducts
    } = processDashboardData(documents, providersCount, productsCount);

  if (isLoading) {
      return (
          <MainLayout>
              <div className="flex flex-1 items-center justify-center">
                  <p>Cargando dashboard...</p>
              </div>
          </MainLayout>
      )
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">
                        Visión general de la actividad de su empresa.
                    </p>
                </div>
            </div>
        </MainLayoutHeader>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatsCard title="Ingresos" value={formatCurrency(totalSales)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Gastos" value={formatCurrency(totalExpenses)} icon={Euro} description="Periodo actual" />
            <StatsCard title="Documentos" value={totalDocuments.toString()} icon={FileText} description="Total histórico" />
            <StatsCard title="Proveedores" value={totalProviders.toString()} icon={Users} description="Proveedores únicos" />
            <StatsCard title="Productos" value={totalProducts.toString()} icon={Package} description="Productos únicos" />
            <StatsCard title="Incidencias" value={totalIncidents.toString()} icon={FileWarning} description="Abiertas actualmente" />
        </div>
        
        <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
                <FinancialSummary data={financialChartData} />
            </div>
            <div className="lg:col-span-2">
                <DocumentStatusChart data={documentStatusChartData} />
            </div>
             <div className="lg:col-span-5">
                <TotalsByProviderChart data={providerChartData} />
            </div>
        </div>
      </div>
    </MainLayout>
  );
}

    
