'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { IvaSummary } from "@/components/dashboard/iva-summary";
import { type Document } from "@/lib/types";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FileText, FileWarning, Euro } from "lucide-react";
import { useEffect, useState } from "react";

// Helper to get the quarter from a date
const getQuarter = (date: Date) => {
  const month = date.getUTCMonth();
  if (month < 3) return 1;
  if (month < 6) return 2;
  if (month < 9) return 3;
  return 4;
};

// Data processing
const processDataForSummary = (documents: Document[]) => {
    const quarterlyData: { [key: string]: { name: string, sales: number; expenses: number; ivaRepercutido: number; ivaSoportado: number } } = {
        '1': { name: 'T1', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        '2': { name: 'T2', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        '3': { name: 'T3', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        '4': { name: 'T4', sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    };

    let totalSales = 0;
    let totalExpenses = 0;
    let totalIncidents = 0;

    documents.forEach(doc => {
        const date = new Date(doc.fecha_subida);
        // Validate date before processing
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date for document ${doc.id_documento}: ${doc.fecha_subida}`);
            return;
        }

        const quarter = getQuarter(date);

        if(doc.incidencia) {
            totalIncidents++;
        }
        
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
        }
    });

    const chartData = Object.values(quarterlyData);

    return { chartData, totalSales, totalExpenses, totalIncidents, totalDocuments: documents.length };
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

export default function Home() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getDocuments().then(docs => {
            setDocuments(docs);
            setIsLoading(false);
        });
    }, []);

  const { chartData, totalSales, totalExpenses, totalIncidents, totalDocuments } = processDataForSummary(documents);

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
                        Resumen financiero trimestral.
                    </p>
                </div>
            </div>
        </MainLayoutHeader>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="Ingresos Totales" value={formatCurrency(totalSales)} icon={Euro} />
            <StatsCard title="Gastos Totales" value={formatCurrency(totalExpenses)} icon={Euro} />
            <StatsCard title="Total Documentos" value={totalDocuments.toString()} icon={FileText} />
            <StatsCard title="Incidencias" value={totalIncidents.toString()} icon={FileWarning} />
        </div>
        
        <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
                <FinancialSummary data={chartData} />
            </div>
            <div>
                <IvaSummary data={chartData} />
            </div>
        </div>
      </div>
    </MainLayout>
  );
}
