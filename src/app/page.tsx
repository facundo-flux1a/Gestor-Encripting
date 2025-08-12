import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { IvaSummary } from "@/components/dashboard/iva-summary";
import { type Document } from "@/lib/types";

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
    const quarterlyData: { [key: number]: { sales: number; expenses: number; ivaRepercutido: number; ivaSoportado: number } } = {
        1: { sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        2: { sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        3: { sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
        4: { sales: 0, expenses: 0, ivaRepercutido: 0, ivaSoportado: 0 },
    };

    documents.forEach(doc => {
        const quarter = getQuarter(new Date(doc.fecha_subida));
        
        if (doc.ingreso > 0) {
            quarterlyData[quarter].sales += doc.base_imponible;
            doc.iva_details.forEach(iva => {
                quarterlyData[quarter].ivaRepercutido += iva.cuota;
            });
        }

        if (doc.gasto > 0) {
            quarterlyData[quarter].expenses += doc.base_imponible;
            doc.iva_details.forEach(iva => {
                quarterlyData[quarter].ivaSoportado += iva.cuota;
            });
        }
    });

    return quarterlyData;
};


export default async function Home() {
  const documents = await getDocuments();
  const summaryData = processDataForSummary(documents);

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
        
        <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
                <FinancialSummary data={summaryData} />
            </div>
            <div>
                <IvaSummary data={summaryData} />
            </div>
        </div>
      </div>
    </MainLayout>
  );
}
