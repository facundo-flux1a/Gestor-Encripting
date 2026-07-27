'use client';

import { useEffect, useState, useRef } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { getSession } from '@/services/auth-service';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { StatsCard } from '@/components/dashboard/stats-card';
import { FinancialSummary } from '@/components/dashboard/financial-summary';
import { DocumentStatusChart } from '@/components/dashboard/document-status-chart';
import { IvaSummary } from '@/components/dashboard/iva-summary';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { DashboardTutorialRouter } from '@/components/dashboard/DashboardTutorialRouter';
import { getDashboardAnalytics } from '@/services/document-service';
import { type DashboardAnalytics } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LayoutDashboard,
  FileText,
  Users,
  AlertTriangle,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  TrendingUp,
  Euro,
  CalendarRange,
  PieChart,
  Loader2,
  RefreshCcw,
  Trash2,
  X,
  Download
} from 'lucide-react';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopProviders } from '@/components/dashboard/top-providers';
import { TopClients } from '@/components/dashboard/top-clients';


export default function DashboardPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningDB, setIsCleaningDB] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  const [selectedAño, setSelectedAño] = useState<number | null>(null);
  const [selectedTrimestre, setSelectedTrimestre] = useState<number | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

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
        const companyIdsAsNumbers = selectedCompanyIds.map(id => Number(id));

        const data = await getDashboardAnalytics(
          companyIdsAsNumbers,
          selectedAño ?? undefined,
          selectedTrimestre ?? undefined
        );

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

  const handleExport = async () => {
    if (!dashboardRef.current) return;
    setIsExporting(true);

    toast({
      title: '📄 Generando reporte...',
      description: 'Preparando datos financieros. Listo en segundos.',
      className: 'bg-gradient-to-br from-violet-600 to-indigo-700 text-white',
    });

    setTimeout(async () => {
      try {
        const { jsPDF } = await import('jspdf');

        const kpis = analytics?.kpis;
        if (!kpis) throw new Error('No hay datos para exportar');

        const fmt = (n: number) => {
          const fixed = Math.abs(n).toFixed(2);
          const [int, dec] = fixed.split('.');
          return (n < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec + ' €';
        };

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const W = pdf.internal.pageSize.getWidth();
        const H = pdf.internal.pageSize.getHeight();
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

        // ── Helpers ────────────────────────────────────────────────
        const BG   = [11, 11, 20]   as [number, number, number];
        const CARD = [22, 22, 38]   as [number, number, number];
        const VIO  = [124, 58, 237] as [number, number, number];
        const GREEN= [34, 197, 94]  as [number, number, number];
        const RED  = [239, 68, 68]  as [number, number, number];
        const MUTED= [120, 120, 160]as [number, number, number];
        const WHITE= [255,255,255]  as [number, number, number];

        const fillPage = (color: [number,number,number]) => {
          pdf.setFillColor(...color);
          pdf.rect(0, 0, W, H, 'F');
        };

        const roundedRect = (x: number, y: number, w: number, h: number, r: number, color: [number,number,number]) => {
          pdf.setFillColor(...color);
          pdf.roundedRect(x, y, w, h, r, r, 'F');
        };

        const txt = (text: string, x: number, y: number, size: number, color: [number,number,number], style: 'normal'|'bold' = 'normal', align?: 'left'|'center'|'right') => {
          pdf.setFontSize(size);
          pdf.setFont('helvetica', style);
          pdf.setTextColor(...color);
          if (align) pdf.text(text, x, y, { align });
          else pdf.text(text, x, y);
        };

        const divider = (y: number) => {
          pdf.setDrawColor(40, 40, 70);
          pdf.setLineWidth(0.2);
          pdf.line(14, y, W - 14, y);
        };

        // ════════════════════════════════════════════════════════════
        // PAGE 1 — COVER + KPIs
        // ════════════════════════════════════════════════════════════
        fillPage(BG);

        // violet top bar
        pdf.setFillColor(...VIO);
        pdf.rect(0, 0, W, 3, 'F');

        // left accent strip
        pdf.setFillColor(...VIO);
        pdf.rect(0, 3, 3, 52, 'F');

        // header block
        roundedRect(3, 3, W - 3, 52, 0, CARD);
        txt('Reporte Financiero', 12, 20, 22, WHITE, 'bold');
        txt('Dashboard de Gestión de Documentos', 12, 28, 10, MUTED);

        const filterLabel = selectedAño
          ? (selectedTrimestre ? `Período: Año ${selectedAño} — T${selectedTrimestre}` : `Período: Año ${selectedAño} completo`)
          : 'Período: Todos los años';
        txt(filterLabel, 12, 37, 9, [180, 180, 220] as [number,number,number]);
        txt(`Generado el ${dateStr}`, 12, 44, 8, MUTED);
        txt(`${kpis.totalDocs} documentos procesados`, W - 14, 44, 8, MUTED, 'normal', 'right');

        // violet line
        pdf.setFillColor(...VIO);
        pdf.rect(3, 55, W - 3, 0.5, 'F');

        // ── KPI CARDS (2×3 grid) ─────────────────────────────────
        const kpiData = [
          { label: 'Total Ingresos', sub: `${kpis.totalFacturasIngreso} facturas`, value: fmt(kpis.totalIngresos), color: GREEN, positive: true },
          { label: 'Total Gastos',   sub: `${kpis.totalFacturasGasto} facturas`,   value: fmt(kpis.totalGastos),   color: RED,   positive: false },
          { label: 'Beneficio Bruto',sub: 'Ingresos - Gastos',                    value: fmt(kpis.beneficio || 0),color: kpis.beneficio >= 0 ? GREEN : RED, positive: kpis.beneficio >= 0 },
          { label: 'Resultado IVA',  sub: 'Repercutido - Soportado',              value: fmt(kpis.resultadoIva || 0), color: kpis.resultadoIva >= 0 ? GREEN : RED, positive: kpis.resultadoIva >= 0 },
          { label: 'IVA Repercutido',sub: 'Cobrado a clientes',                   value: fmt(kpis.ivaRepercutido || 0), color: GREEN, positive: true },
          { label: 'IVA Soportado',  sub: 'Pagado a proveedores',                 value: fmt(kpis.ivaSoportado || 0),   color: RED,   positive: false },
        ];

        const cols = 2;
        const cardW = (W - 28) / cols;
        const cardH = 26;
        const cardGap = 4;
        const startY = 62;

        kpiData.forEach((k, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = 14 + col * (cardW + cardGap);
          const cy = startY + row * (cardH + cardGap);

          roundedRect(cx, cy, cardW, cardH, 2, CARD);

          // colored left accent
          pdf.setFillColor(...k.color);
          pdf.roundedRect(cx, cy, 2.5, cardH, 1, 1, 'F');

          txt(k.label, cx + 6, cy + 7, 8, MUTED, 'bold');
          txt(k.sub,   cx + 6, cy + 12, 6.5, [80, 80, 120] as [number,number,number]);
          txt(k.value, cx + cardW - 4, cy + 19, 11, k.color, 'bold', 'right');
        });

        // ── BASE IMPONIBLE BREAKDOWN ─────────────────────────────
        const afterKpis = startY + 3 * (cardH + cardGap) + 6;
        txt('Desglose de Bases Imponibles', 14, afterKpis, 10, WHITE, 'bold');
        pdf.setFillColor(...VIO);
        pdf.rect(14, afterKpis + 2, 35, 0.6, 'F');

        const bRows = [
          ['Base Imponible Ingresos', fmt(kpis.totalIngresosSinIva || 0), GREEN],
          ['IVA Repercutido',         fmt(kpis.ivaRepercutido || 0),      GREEN],
          ['Base Imponible Gastos',   fmt(-(kpis.totalGastosSinIva || 0)),RED],
          ['IVA Soportado',           fmt(-(kpis.ivaSoportado || 0)),      RED],
          ['Beneficio (sin IVA)',      fmt((kpis.totalIngresosSinIva||0) - (kpis.totalGastosSinIva||0)), kpis.totalIngresosSinIva >= kpis.totalGastosSinIva ? GREEN : RED],
        ];

        let tableY = afterKpis + 8;
        roundedRect(14, tableY, W - 28, bRows.length * 8 + 4, 2, CARD);
        tableY += 5;
        bRows.forEach(([label, value, color], idx) => {
          if (idx > 0) {
            pdf.setDrawColor(30, 30, 55);
            pdf.setLineWidth(0.15);
            pdf.line(18, tableY - 2, W - 18, tableY - 2);
          }
          txt(label as string, 18, tableY + 2, 8, MUTED as [number,number,number]);
          txt(value as string, W - 18, tableY + 2, 8, color as [number,number,number], 'bold', 'right');
          tableY += 8;
        });

        // ── FOOTER p1 ────────────────────────────────────────────
        pdf.setFillColor(...VIO);
        pdf.rect(0, H - 10, W, 10, 'F');
        txt('Gestor de Documentos  ·  Reporte Financiero Confidencial', W / 2, H - 4, 7, WHITE, 'normal', 'center');

        // ════════════════════════════════════════════════════════════
        // PAGE 2 — Proveedores + Clientes
        // ════════════════════════════════════════════════════════════
        pdf.addPage();
        fillPage(BG);
        pdf.setFillColor(...VIO);
        pdf.rect(0, 0, W, 3, 'F');

        txt('Análisis de Proveedores y Clientes', 14, 16, 14, WHITE, 'bold');
        txt(filterLabel, 14, 23, 8, MUTED);
        divider(27);

        // TOP PROVIDERS
        const providers = analytics?.topProviders || [];
        txt('Proveedores con mayor gasto', 14, 36, 10, WHITE, 'bold');
        pdf.setFillColor(...VIO);
        pdf.rect(14, 38, 28, 0.6, 'F');

        if (providers.length > 0) {
          const maxVal = Math.max(...providers.map((p: any) => Math.abs(Number(p.total || 0))));
          let pY = 44;
          roundedRect(14, pY - 4, W - 28, providers.slice(0, 8).length * 11 + 6, 2, CARD);
          providers.slice(0, 8).forEach((p: any, idx: number) => {
            const val = Math.abs(Number(p.total || 0));
            const barW = maxVal > 0 ? ((val / maxVal) * (W - 60)) : 0;
            const rank = idx + 1;
            // rank badge
            pdf.setFillColor(...VIO);
            pdf.circle(20, pY + 1.5, 3, 'F');
            txt(String(rank), 20, pY + 3, 6, WHITE, 'bold', 'center');
            // name + CIF
            const name = (p.nombre || p.name || 'Sin nombre').substring(0, 30);
            txt(name, 27, pY + 2, 7.5, WHITE, 'bold');
            txt(p.cif || '', 27, pY + 6.5, 6, MUTED);
            // mini bar
            pdf.setFillColor(40, 40, 70);
            pdf.rect(W - 54, pY - 0.5, 40, 4, 'F');
            pdf.setFillColor(...VIO);
            pdf.rect(W - 54, pY - 0.5, Math.min(barW, 40), 4, 'F');
            // amount
            txt(fmt(val), W - 14, pY + 3, 7.5, WHITE, 'bold', 'right');
            if (idx < providers.slice(0, 8).length - 1) {
              pdf.setDrawColor(30, 30, 55);
              pdf.setLineWidth(0.15);
              pdf.line(18, pY + 9, W - 18, pY + 9);
            }
            pY += 11;
          });
        } else {
          txt('Sin datos de proveedores para el período seleccionado', 14, 50, 8, MUTED);
        }

        // TOP CLIENTS
        const clients = analytics?.topClients || [];
        const providersSectionH = providers.slice(0, 8).length > 0 ? 44 + providers.slice(0, 8).length * 11 + 14 : 58;
        const clientsStartY = providersSectionH;

        txt('Clientes con mayor ingreso', 14, clientsStartY, 10, WHITE, 'bold');
        pdf.setFillColor(34, 197, 94);
        pdf.rect(14, clientsStartY + 2, 28, 0.6, 'F');

        if (clients.length > 0) {
          const maxCVal = Math.max(...clients.map((c: any) => Math.abs(Number(c.total || 0))));
          let cY = clientsStartY + 8;
          roundedRect(14, cY - 4, W - 28, clients.slice(0, 6).length * 11 + 6, 2, CARD);
          clients.slice(0, 6).forEach((c: any, idx: number) => {
            const val = Math.abs(Number(c.total || 0));
            const rank = idx + 1;
            pdf.setFillColor(...GREEN);
            pdf.circle(20, cY + 1.5, 3, 'F');
            txt(String(rank), 20, cY + 3, 6, WHITE, 'bold', 'center');
            const name = (c.nombre || c.name || 'Sin nombre').substring(0, 30);
            txt(name, 27, cY + 2, 7.5, WHITE, 'bold');
            txt(c.cif || '', 27, cY + 6.5, 6, MUTED);
            const barW2 = maxCVal > 0 ? ((val / maxCVal) * 40) : 0;
            pdf.setFillColor(20, 50, 30);
            pdf.rect(W - 54, cY - 0.5, 40, 4, 'F');
            pdf.setFillColor(...GREEN);
            pdf.rect(W - 54, cY - 0.5, Math.min(barW2, 40), 4, 'F');
            txt(fmt(val), W - 14, cY + 3, 7.5, WHITE, 'bold', 'right');
            if (idx < clients.slice(0, 6).length - 1) {
              pdf.setDrawColor(30, 30, 55);
              pdf.setLineWidth(0.15);
              pdf.line(18, cY + 9, W - 18, cY + 9);
            }
            cY += 11;
          });
        } else {
          txt('Sin datos de clientes para el período seleccionado', 14, clientsStartY + 10, 8, MUTED);
        }

        // footer p2
        pdf.setFillColor(...VIO);
        pdf.rect(0, H - 10, W, 10, 'F');
        txt(`Gestor de Documentos  ·  Página 2 de 2  ·  ${dateStr}`, W / 2, H - 4, 7, WHITE, 'normal', 'center');

        // ── Save ────────────────────────────────────────────────────
        const filename = `Reporte_Dashboard_${selectedAño || 'General'}_${now.toISOString().split('T')[0]}.pdf`;
        pdf.save(filename);

        toast({
          title: '✅ PDF descargado',
          description: filename,
          className: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white',
        });
      } catch (err) {
        console.error('❌ [handleExport] Error generando PDF:', err);
        toast({
          variant: 'destructive',
          title: 'Error al exportar',
          description: 'No se pudo generar el PDF. Inténtalo de nuevo.',
        });
      } finally {
        setIsExporting(false);
      }
    }, 150);
  };

  const handleCleanDatabase = async (empresaIds: number[]) => {
    setIsCleaningDB(true);

    try {
      const response = await fetch('/api/clean-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ empresaIds }),
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
        title: "✨ Empresas Reiniciadas Exitosamente",
        description: `Se limpiaron ${empresaIds.length} empresa(s). La página se recargará en un momento.`,
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

  const formatNumber = (num: number | string): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';

    const parts = value.toString().split('.');
    const integerPart = parts[0];
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return formattedInteger;
  };

  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0,00 €';

    const fixed = num.toFixed(2);
    const parts = fixed.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${formattedInteger},${decimalPart} €`;
  }; const FilterSheet = () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="md:hidden hover:bg-accent transition-colors duration-200"
        >
          Filtros
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px]">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Filtra los datos del dashboard
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4" data-tutorial="filters-mobile">
          <div className="space-y-2">
            <label className="text-sm font-medium">Año</label>
            <Select
              value={selectedAño?.toString() || 'all'}
              onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
            >
              <SelectTrigger className="hover:bg-accent transition-colors duration-200">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="2030">2030</SelectItem>
                <SelectItem value="2029">2029</SelectItem>
                <SelectItem value="2028">2028</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Trimestre</label>
            <Select
              value={selectedTrimestre?.toString() || 'all'}
              onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
              disabled={!selectedAño}
            >
              <SelectTrigger className="hover:bg-accent transition-colors duration-200 disabled:cursor-not-allowed">
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
          </div>

          {(selectedAño || selectedTrimestre) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedAño(null);
                setSelectedTrimestre(null);
              }}
              className="w-full hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            >
              <X className="h-4 w-4 mr-2" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  // ✅ Load User ID for permissions
  useEffect(() => {
    async function loadUser() {
      const session = await getSession();
      if (session?.userId) {
        setUserId(session.userId);
      }
    }
    loadUser();
  }, []);

  const CleanButton = () => {
    const allowedIds = [5, 6];
    const canReset = userId && allowedIds.includes(userId);
    const { companies } = useCompanyContext();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedToClean, setSelectedToClean] = useState<number[]>([]);
    const [confirmText, setConfirmText] = useState('');
    const isConfirmed = confirmText === 'CONFIRMAR';
    const allSelected = selectedToClean.length === companies.length && companies.length > 0;

    const toggleCompany = (id: number) => {
      setSelectedToClean(prev =>
        prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      );
    };

    const handleOpen = () => {
      setSelectedToClean([]);
      setConfirmText('');
      setIsDialogOpen(true);
    };

    const handleConfirm = async () => {
      await handleCleanDatabase(selectedToClean);
      setIsDialogOpen(false);
    };

    if (!canReset) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 hidden sm:flex cursor-not-allowed opacity-40 hover:bg-transparent"
          title="No tienes permisos para reiniciar el sistema"
          disabled
        >
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          <span className="hidden lg:inline text-muted-foreground">Reiniciar</span>
        </Button>
      );
    }

    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={handleOpen}
          className="gap-2 hidden sm:flex border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/60 hover:text-orange-300 transition-all duration-300 group"
        >
          <RefreshCcw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
          <span className="hidden lg:inline">Reiniciar</span>
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-0 overflow-hidden border border-white/10 shadow-2xl">
            {/* Gradient header */}
            <div className="relative bg-gradient-to-br from-red-950 via-red-900/80 to-zinc-900 px-6 pt-6 pb-5 border-b border-red-800/30">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.15),transparent_60%)]" />
              <DialogHeader className="relative">
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2.5 bg-red-500/20 rounded-xl ring-1 ring-red-500/30">
                    <Trash2 className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-white leading-tight">
                      Reiniciar datos de empresa
                    </DialogTitle>
                    <p className="text-xs text-red-300/70 mt-0.5">Herramienta de desarrollo — acción irreversible</p>
                  </div>
                </div>
              </DialogHeader>
              {/* Warning banner */}
              <div className="relative mt-3 flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300 leading-relaxed">
                  Se eliminarán <strong>todos los documentos, incidencias y actividad</strong> de las empresas seleccionadas.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 bg-zinc-950/60">
              {/* Company selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-zinc-200">Seleccioná las empresas</Label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSelectedToClean(companies.map(c => c.id))}
                      className="text-xs px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                    >
                      Todas
                    </button>
                    <span className="text-zinc-700 self-center">·</span>
                    <button
                      onClick={() => setSelectedToClean([])}
                      className="text-xs px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                    >
                      Ninguna
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
                  {companies.map(company => {
                    const isSelected = selectedToClean.includes(company.id);
                    return (
                      <label
                        key={company.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'bg-red-500/10 border-red-500/30 shadow-sm'
                            : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                        }`}
                      >
                        <div className={`h-4 w-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                          isSelected ? 'bg-red-500 border-red-500' : 'border-zinc-600'
                        }`}>
                          {isSelected && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                          {company.name}
                        </span>
                        {isSelected && (
                          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                            Seleccionada
                          </span>
                        )}
                        <Checkbox
                          className="hidden"
                          checked={isSelected}
                          onCheckedChange={() => toggleCompany(company.id)}
                        />
                      </label>
                    );
                  })}
                </div>

                {selectedToClean.length > 0 && (
                  <p className="text-xs text-zinc-500">
                    {selectedToClean.length} empresa{selectedToClean.length !== 1 ? 's' : ''} seleccionada{selectedToClean.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Confirm input — only shows when companies are selected */}
              {selectedToClean.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-white/5">
                  <Label htmlFor="confirm-input" className="text-xs text-zinc-400">
                    Escribí{' '}
                    <span className="font-mono font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      CONFIRMAR
                    </span>{' '}
                    para habilitar la acción
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-input"
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="CONFIRMAR"
                      autoComplete="off"
                      className={`bg-zinc-900 border font-mono text-sm transition-all duration-300 pr-9 ${
                        isConfirmed
                          ? 'border-emerald-500/50 ring-1 ring-emerald-500/20 text-emerald-300'
                          : confirmText.length > 0
                            ? 'border-red-500/40 text-zinc-300'
                            : 'border-white/10 text-zinc-300'
                      }`}
                    />
                    {isConfirmed && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <DialogFooter className="flex gap-2 px-6 py-4 bg-zinc-900/80 border-t border-white/5">
              <Button
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="flex-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isCleaningDB || selectedToClean.length === 0 || !isConfirmed}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white border-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-red-900/40"
              >
                {isCleaningDB ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Limpiando...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpiar {selectedToClean.length > 0 ? `(${selectedToClean.length})` : ''} empresa{selectedToClean.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  };

  if (isLoading) {
    return (
      <MainLayout>
        <DashboardTutorialRouter />
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <PageHeader
            title="Dashboard"
            icon={LayoutDashboard}
          >
            <div className="flex items-center gap-2">
              <FilterSheet />
              <CleanButton />
            </div>
          </PageHeader>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 animate-pulse" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!analytics) {
    return (
      <MainLayout>
        <DashboardTutorialRouter />
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <PageHeader
            title="Dashboard"
            icon={LayoutDashboard}
          />
          <div className="flex h-[400px] items-center justify-center text-muted-foreground text-center px-4">
            <div className="space-y-3 animate-fade-in">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <p className="text-lg">Selecciona al menos una empresa para ver el dashboard</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ✅ Prepare data for FinancialSummary component
  const financialAnnualData = Object.keys(analytics.yearlySummary || {}).map(year => ({
    name: year,
    sales: analytics.yearlySummary[year].ingresos,
    expenses: analytics.yearlySummary[year].gastos
  }));

  const financialQuarterlyData: Record<string, any[]> = {};
  if (analytics.multiYearQuarterlySummary) {
    Object.keys(analytics.multiYearQuarterlySummary).forEach(year => {
      const yearData = analytics.multiYearQuarterlySummary[year];
      financialQuarterlyData[year] = [
        { name: 'T1', sales: yearData.T1?.ingresos || 0, expenses: yearData.T1?.gastos || 0 },
        { name: 'T2', sales: yearData.T2?.ingresos || 0, expenses: yearData.T2?.gastos || 0 },
        { name: 'T3', sales: yearData.T3?.ingresos || 0, expenses: yearData.T3?.gastos || 0 },
        { name: 'T4', sales: yearData.T4?.ingresos || 0, expenses: yearData.T4?.gastos || 0 },
      ];
    });
  }

  // ✅ Prepare data for IvaSummary component
  const ivaAnnualData = Object.keys(analytics.ivaYearlySummary || {}).map(year => ({
    name: year,
    ivaRepercutido: analytics.ivaYearlySummary[year].repercutido,
    ivaSoportado: analytics.ivaYearlySummary[year].soportado
  }));

  const ivaQuarterlyData: Record<string, any[]> = {};
  if (analytics.multiYearIvaSummary) {
    Object.keys(analytics.multiYearIvaSummary).forEach(year => {
      const yearData = analytics.multiYearIvaSummary[year];
      ivaQuarterlyData[year] = [
        { name: 'T1', ivaRepercutido: yearData.T1?.repercutido || 0, ivaSoportado: yearData.T1?.soportado || 0 },
        { name: 'T2', ivaRepercutido: yearData.T2?.repercutido || 0, ivaSoportado: yearData.T2?.soportado || 0 },
        { name: 'T3', ivaRepercutido: yearData.T3?.repercutido || 0, ivaSoportado: yearData.T3?.soportado || 0 },
        { name: 'T4', ivaRepercutido: yearData.T4?.repercutido || 0, ivaSoportado: yearData.T4?.soportado || 0 },
      ];
    });
  }

  return (
    <MainLayout>
      <DashboardTutorialRouter />
      <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Dashboard"
          icon={LayoutDashboard}
        >
          <div data-tutorial="filters" className="hidden md:flex items-center gap-2">
            <Select
              value={selectedAño?.toString() || 'all'}
              onValueChange={(value) => setSelectedAño(value === 'all' ? null : parseInt(value))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Año fiscal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (Auto)</SelectItem>
                <SelectItem value="2030">2030</SelectItem>
                <SelectItem value="2029">2029</SelectItem>
                <SelectItem value="2028">2028</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedTrimestre?.toString() || 'all'}
              onValueChange={(value) => setSelectedTrimestre(value === 'all' ? null : parseInt(value))}
              disabled={!selectedAño}
            >
              <SelectTrigger className="w-[180px]">
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

            <CleanButton />
          </div>
        </PageHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Resumen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div ref={dashboardRef} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-tutorial="kpis">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        Total Ingresos (con IVA)
                      </CardTitle>
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.totalIngresos)}</div>
                      <p className="text-xs text-muted-foreground">
                        {analytics.kpis.totalFacturasIngreso} facturas
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Ingresos</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Imponible:</span>
                      <span className="font-medium">{formatCurrency(analytics.kpis.totalIngresosSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA Repercutido:</span>
                      <span className="font-medium text-green-600">+{formatCurrency(analytics.kpis.ivaRepercutido)}</span>
                    </div>
                    {Number(analytics.kpis.recargoRepercutido) !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Recargo de Equiv.:</span>
                        <span className="font-medium text-green-600">+{formatCurrency(analytics.kpis.recargoRepercutido)}</span>
                      </div>
                    )}
                    {(analytics.kpis.retencionRepercutido || 0) !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Retenciones IRPF:</span>
                        <span className="text-red-600 font-medium">-{formatCurrency(Math.abs(analytics.kpis.retencionRepercutido))}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total (con IVA):</span>
                      <span className="text-foreground">{formatCurrency(analytics.kpis.totalIngresos)}</span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        Total Gastos (con IVA)
                      </CardTitle>
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.totalGastos)}</div>
                      <p className="text-xs text-muted-foreground">
                        {analytics.kpis.totalFacturasGasto} facturas
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Gastos</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Imponible:</span>
                      <span className="font-medium">-{formatCurrency(analytics.kpis.totalGastosSinIva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA Soportado:</span>
                      <span className="font-medium text-red-600">-{formatCurrency(analytics.kpis.ivaSoportado)}</span>
                    </div>
                    {Number(analytics.kpis.recargoSoportado) !== 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Recargo de Equiv.:</span>
                        <span className="font-medium text-red-600">-{formatCurrency(analytics.kpis.recargoSoportado)}</span>
                      </div>
                    )}
                    {Math.abs(analytics.kpis.retencionSoportado || 0) > 0.001 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Retenciones IRPF:</span>
                        <span className="text-green-600 font-medium">+{formatCurrency(Math.abs(analytics.kpis.retencionSoportado))}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total (con IVA):</span>
                      <span className="text-foreground">{formatCurrency(analytics.kpis.totalGastos)}</span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Beneficio Bruto (con IVA)
                      </CardTitle>
                      <Euro className={`h-4 w-4 ${analytics.kpis.beneficio >= 0 ? "text-green-500" : "text-red-500"}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.beneficio || 0)}</div>
                      <p className="text-xs text-muted-foreground">
                        Ingresos - Gastos
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de Beneficio</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ingresos Totales:</span>
                      <span className="text-green-600 font-medium">+{formatCurrency(analytics.kpis.totalIngresos)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gastos Totales:</span>
                      <span className="text-red-600 font-medium">-{formatCurrency(analytics.kpis.totalGastos)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className={analytics.kpis.beneficio >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(analytics.kpis.beneficio)}
                      </span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard>
                <HoverCardTrigger asChild>
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-default">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Resultado IVA
                      </CardTitle>
                      <Euro className={`h-4 w-4 ${analytics.kpis.resultadoIva >= 0 ? "text-green-500" : "text-red-500"}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(analytics.kpis.resultadoIva || 0)}</div>
                      <p className="text-xs text-muted-foreground">
                        Repercutido - Soportado
                      </p>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Desglose de IVA</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA Neto:</span>
                      <span className={analytics.kpis.resultadoIva >= 0 ? "text-green-600" : "text-red-600 font-medium"}>
                        {analytics.kpis.resultadoIva >= 0 ? '+' : ''}{formatCurrency(analytics.kpis.resultadoIva)}
                      </span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                      <span>Total Liquidación:</span>
                      <span className={analytics.kpis.resultadoIva >= 0 ? "text-green-600" : "text-red-600 font-bold"}>
                        {formatCurrency(analytics.kpis.resultadoIva)}
                      </span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <Card className="hover:shadow-lg transition-all duration-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Documentos
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.kpis.totalDocs}</div>
                  <p className="text-xs text-muted-foreground">
                    En el sistema
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4" data-tutorial="financial-summary">
                <FinancialSummary
                  annualData={financialAnnualData}
                  quarterlyData={financialQuarterlyData}
                  defaultYear={selectedAño?.toString() || null}
                />
              </div>
              <div className="col-span-3">
                <DocumentStatusChart data={analytics.documentDistribution} />
              </div>
            </div>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4">
                <IvaSummary
                  annualData={ivaAnnualData}
                  quarterlyData={ivaQuarterlyData}
                  defaultYear={selectedAño?.toString() || null}
                />
              </div>
              <div className="col-span-3 flex flex-col gap-4">
                <TopProviders data={analytics.topProviders} />
                <TopClients data={analytics.topClients} />
              </div>
            </div>
            </div>
          </TabsContent>


        </Tabs>
      </div>

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </MainLayout >
  );
}