'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { TrimestresProvider, useTrimestres } from '@/context/TrimestresProvider';
import { MainLayout } from '@/components/layout/main-layout';
import { TrimestreSelector } from '@/components/trimestres/trimestre-selector';
import { PageHeader } from '@/components/layout/page-header';
import { TrimestreStatsCard } from '@/components/trimestres/trimestre-stats-card';
import { TrimestreTable } from '@/components/trimestres/trimestres-table';
import { StatsHoverTable } from '@/components/trimestres/stats-hover-table'; // 🆕 IMPORT
import { CloseQuarterDialog } from '@/components/trimestres/close-quarter-dialog';
import { QuarterBadge } from '@/components/trimestres/quarter-badge';
import { CompaniesHeaderSelector } from '@/components/companies-header-selector';
import { TrimestreExcelView } from '@/components/trimestres/trimestre-excel-view';
import { TrimestresTutorialRouter } from '@/components/trimestres/TrimestresTutorialRouter';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Lock,
  FileText,
  TrendingUp,
  TrendingDown,
  Receipt,
  Send,
  Building2,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
  Download,
} from 'lucide-react';
import type { Document, Trimestre } from '@/lib/types';
import { generateAdvancedExport } from '@/lib/export-utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TrimestresFilterBar, type TrimestresFilterState } from '@/components/trimestres/trimestres-filter-bar';
import { calculateFinancials } from '@/lib/financial-engine';

// Valor inicial de filtros — declarado fuera del componente para ser estable
const EMPTY_FILTERS: TrimestresFilterState = {
  searchText: '',
  selectedTipos: [],
  selectedProveedores: [],
  selectedClientes: [],
  selectedEmpresas: [],
  fechaDesde: '',
  fechaHasta: '',
  baseMin: '',
  baseMax: '',
  ivaMin: '',
  ivaMax: '',
  totalMin: '',
  totalMax: '',
};

function TrimestresPageContent() {
  const { selectedCompanyIds, isLoading: isLoadingCompanies } = useCompanyContext();
  const { isTutorialActive, currentStep, mostrarVacios, setMostrarVacios } = useTrimestres();
  const { toast } = useToast();

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
  };

  // Estados
  const [trimestres, setTrimestres] = React.useState<Trimestre[]>([]);
  const [documentos, setDocumentos] = React.useState<Document[]>([]);
  const [annualDocumentos, setAnnualDocumentos] = React.useState<Document[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDocs, setIsLoadingDocs] = React.useState(false);
  const [isLoadingAnnualDocs, setIsLoadingAnnualDocs] = React.useState(false);

  // Trimestre seleccionado
  const [selectedAño, setSelectedAño] = React.useState<number>(new Date().getFullYear());
  const [selectedTrimestre, setSelectedTrimestre] = React.useState<number>(1);

  // ─── FILTROS DE LA TABLA DE DOCUMENTOS ─────────────────────────────────────
  const [filters, setFilters] = React.useState<TrimestresFilterState>(EMPTY_FILTERS);

  // ── Resetear filtros al cambiar de trimestre o año ──
  React.useEffect(() => {
    setFilters(EMPTY_FILTERS);
  }, [selectedAño, selectedTrimestre]);

  // ── Documentos visibles en la tabla (con filtros aplicados) ─────────────────
  // NOTA: `footerValues` usa siempre `documentos` (trimestre completo, sin filtrar).
  // Si en el futuro se quiere que los totales reflejen el filtro activo,
  // reemplaza `documentos` por `documentosFiltrados` en el bloque `footerValues`.
  const documentosFiltrados = React.useMemo(() => {
    const {
      searchText, selectedTipos, selectedProveedores, selectedClientes, selectedEmpresas,
      fechaDesde, fechaHasta,
      baseMin, baseMax, ivaMin, ivaMax, totalMin, totalMax,
    } = filters;

    const noFilters =
      !searchText &&
      selectedTipos.length === 0 &&
      selectedProveedores.length === 0 &&
      selectedClientes.length === 0 &&
      selectedEmpresas.length === 0 &&
      !fechaDesde && !fechaHasta &&
      !baseMin && !baseMax &&
      !ivaMin && !ivaMax &&
      !totalMin && !totalMax;

    // Atajo: si no hay filtros activos, devolvemos el array original directamente
    if (noFilters) return documentos;

    // Parsear límites de fecha una sola vez
    const desde = fechaDesde ? new Date(fechaDesde) : null;
    const hasta = fechaHasta ? new Date(fechaHasta) : null;

    // Parsear límites numéricos una sola vez
    const baseMinN = baseMin !== '' ? parseFloat(baseMin) : null;
    const baseMaxN = baseMax !== '' ? parseFloat(baseMax) : null;
    const ivaMinN = ivaMin !== '' ? parseFloat(ivaMin) : null;
    const ivaMaxN = ivaMax !== '' ? parseFloat(ivaMax) : null;
    const totalMinN = totalMin !== '' ? parseFloat(totalMin) : null;
    const totalMaxN = totalMax !== '' ? parseFloat(totalMax) : null;

    return documentos.filter(doc => {
      // Búsqueda de texto libre
      if (searchText) {
        const q = searchText.toLowerCase();
        const haystack = [
          doc.numero_documento,
          doc.proveedor,
          doc.empresa_nombre,
          doc.observaciones,
          ...(doc.entidades || []).map(e => e.nombre),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Tipo de documento (multi-select)
      if (selectedTipos.length > 0 && !selectedTipos.includes(doc.tipo_documento)) return false;

      // Proveedor (multi-select)
      if (selectedProveedores.length > 0 && !selectedProveedores.includes(doc.proveedor || '')) return false;

      // Cliente (multi-select)
      if (selectedClientes.length > 0) {
        const cliente =
          doc.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor')?.nombre || '';
        if (!selectedClientes.includes(cliente)) return false;
      }

      // Empresa del sistema (multi-select)
      if (selectedEmpresas.length > 0 && !selectedEmpresas.includes(doc.empresa_nombre || '')) return false;

      // Fecha desde/hasta (por fecha_emision)
      if (desde || hasta) {
        const fechaDoc = doc.fecha_emision ? new Date(doc.fecha_emision) : null;
        if (!fechaDoc) return false;
        if (desde && fechaDoc < desde) return false;
        if (hasta) {
          // Comparar hasta fin del día
          const hastaFinDia = new Date(hasta);
          hastaFinDia.setHours(23, 59, 59, 999);
          if (fechaDoc > hastaFinDia) return false;
        }
      }

      // Rangos numéricos
      const base = parseFloat(String(doc.base_imponible)) || 0;
      const iva = parseFloat(String(doc.iva)) || 0;
      const total = parseFloat(String(doc.total)) || 0;

      if (baseMinN !== null && base < baseMinN) return false;
      if (baseMaxN !== null && base > baseMaxN) return false;
      if (ivaMinN !== null && iva < ivaMinN) return false;
      if (ivaMaxN !== null && iva > ivaMaxN) return false;
      if (totalMinN !== null && total < totalMinN) return false;
      if (totalMaxN !== null && total > totalMaxN) return false;

      return true;
    });
  }, [documentos, filters]);
  // ─────────────────────────────────────────────────────────────────────────────

  // Dialog de cierre
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [trimestreToClose, setTrimestreToClose] = React.useState<Trimestre | null>(null);

  React.useEffect(() => {
    if (isLoadingCompanies) {
      console.log('⏳ [Trimestres] Esperando a que carguen las empresas...');
      return;
    }

    console.log('🔄 [Trimestres] Cargando trimestres con empresas:', selectedCompanyIds);
    loadTrimestres();
  }, [selectedCompanyIds, mostrarVacios, selectedAño, isLoadingCompanies]);

  React.useEffect(() => {
    if (isLoadingCompanies) {
      console.log('⏳ [Trimestres] Esperando a que carguen las empresas para los documentos...');
      return;
    }

    console.log('🔄 [Trimestres] Cargando documentos con empresas:', selectedCompanyIds);
    loadDocumentos();
    loadAnnualDocumentos();
  }, [selectedAño, selectedTrimestre, selectedCompanyIds, isLoadingCompanies]);

  const loadTrimestres = async () => {
    try {
      setIsLoading(true);

      console.log('🔍 [loadTrimestres] Empresas seleccionadas:', selectedCompanyIds);

      const params = new URLSearchParams();

      if (selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach(id => {
          params.append('empresa_id', id.toString());
        });
      }

      params.append('mostrar_vacios', mostrarVacios.toString());

      console.log('📡 [loadTrimestres] Fetching con params:', params.toString());

      const response = await fetch(`/api/trimestres?${params}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.error || 'Error al cargar trimestres');
      }

      const dataFromDB = await response.json();
      console.log('✅ Trimestres de BD:', dataFromDB);

      let trimestresFinales = dataFromDB;

      if (mostrarVacios) {
        const añoParaGenerar = selectedAño;
        const trimestresCompletos: Trimestre[] = [];

        for (let trimestre = 1; trimestre <= 4; trimestre++) {
          const existeEnBD = dataFromDB.find(
            (t: Trimestre) => t.año === añoParaGenerar && t.trimestre === trimestre
          );

          if (existeEnBD) {
            trimestresCompletos.push(existeEnBD);
          } else {
            trimestresCompletos.push({
              año: añoParaGenerar,
              trimestre,
              empresa_id: null,
              empresa_nombre: null,
              total_documentos: 0,
              total_ingresos: 0,
              total_gastos: 0,
              total_ingresos_sin_iva: 0,
              total_gastos_sin_iva: 0,
              iva_repercutido: 0,
              iva_soportado: 0,
              recargo_repercutido: 0,
              recargo_soportado: 0,
              cerrado: false,
              fecha_cierre: null,
            });
          }
        }

        trimestresFinales = trimestresCompletos;
      }

      setTrimestres(trimestresFinales);

      if (trimestresFinales.length > 0) {
        const tieneAñoActual = trimestresFinales.some((t: Trimestre) => t.año === selectedAño);

        if (!tieneAñoActual) {
          const reciente = trimestresFinales[0];
          console.log('🔄 [loadTrimestres] Año actual sin datos, seleccionando trimestre más reciente:', reciente);
          setSelectedAño(reciente.año);
          setSelectedTrimestre(reciente.trimestre);
        }
      } else {
        console.log('⚠️ [loadTrimestres] No hay trimestres con datos');
        const now = new Date();
        const añoActual = now.getFullYear();
        const trimestreActual = Math.ceil((now.getMonth() + 1) / 3);
        setSelectedAño(añoActual);
        setSelectedTrimestre(trimestreActual);
      }
    } catch (error) {
      console.error('❌ Error loading trimestres:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudieron cargar los trimestres',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocumentos = async () => {
    try {
      setIsLoadingDocs(true);

      console.log('🔍 [loadDocumentos] Empresas seleccionadas:', selectedCompanyIds);

      if (selectedCompanyIds.length === 0) {
        console.log('⚠️ [loadDocumentos] No hay empresas seleccionadas, limpiando documentos');
        setDocumentos([]);
        return;
      }

      const params = new URLSearchParams({
        año: selectedAño.toString(),
        trimestre: selectedTrimestre.toString(),
      });

      selectedCompanyIds.forEach(id => {
        params.append('empresa_id', id.toString());
      });

      console.log('📡 [loadDocumentos] Fetching con params:', params.toString());

      const response = await fetch(`/api/trimestres/documentos?${params}`);
      if (!response.ok) throw new Error('Error al cargar documentos');

      const data = await response.json();
      console.log('✅ Documentos cargados:', data.length);
      setDocumentos(data);
    } catch (error) {
      console.error('❌ Error loading documentos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los documentos',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const loadAnnualDocumentos = async () => {
    try {
      if (selectedCompanyIds.length === 0) {
        setAnnualDocumentos([]);
        return;
      }

      setIsLoadingAnnualDocs(true);

      const params = new URLSearchParams({
        año: selectedAño.toString(),
      });

      selectedCompanyIds.forEach(id => {
        params.append('empresa_id', id.toString());
      });

      console.log('📡 [loadAnnualDocumentos] Fetching con params:', params.toString());

      const response = await fetch(`/api/trimestres/documentos?${params}`);
      if (!response.ok) throw new Error('Error al cargar documentos anuales');

      const data = await response.json();
      console.log('✅ Documentos anuales cargados:', data.length);
      setAnnualDocumentos(data);
    } catch (error) {
      console.error('❌ Error loading annual documents:', error);
    } finally {
      setIsLoadingAnnualDocs(false);
    }
  };

  const handleSelectAño = (año: number) => {
    console.log('🔄 Año seleccionado:', año);
    setSelectedAño(año);
    setSelectedTrimestre(1);
  };

  const handleExportar = async (año: number, trimestre: number | null) => {
    try {
      toast({
        title: 'Generando exportación...',
        description: 'Por favor espere mientras se recopilan los datos.',
      });

      const params = new URLSearchParams({
        año: año.toString(),
      });

      if (trimestre) {
        params.append('trimestre', trimestre.toString());
      }

      selectedCompanyIds.forEach(id => {
        params.append('empresa_id', id.toString());
      });

      // Usar endpoint existente que soporta filtros
      const response = await fetch(`/api/trimestres/documentos?${params}`);
      if (!response.ok) throw new Error('Error al cargar datos para exportación');

      const data = await response.json();

      if (data.length === 0) {
        toast({
          title: 'Sin datos',
          description: 'No hay documentos para exportar en el periodo seleccionado.',
          variant: 'destructive',
        });
        return;
      }

      // 🔄 Pre-procesar datos para dividirlos claramente en Ingresos vs Gastos en Excel
      const processedData = data.map((doc: any) => {
        const tipo = (doc.tipo_documento || '').toLowerCase();

        // Extraer emisor/receptor de forma resiliente
        let emisorNombre = '';
        let emisorCif = '';
        let receptorNombre = '';

        if (doc.entidades && Array.isArray(doc.entidades)) {
          doc.entidades.forEach((e: any) => {
            if (e.rol === 'emisor' || e.rol === 'proveedor') {
              emisorNombre = e.nombre;
              emisorCif = e.identificador_fiscal;
            }
            if (e.rol === 'receptor' || e.rol === 'cliente') {
              receptorNombre = e.nombre;
            }
          });
        }

        // Fallbacks si entidades viene vacío o nulo
        if (!emisorNombre && !receptorNombre) {
          const datosExtra = typeof doc.datos_extra === 'string'
            ? JSON.parse(doc.datos_extra)
            : (doc.datos_extra || {});

          // A veces el proveedor viene en la raíz o en datos_extra
          emisorNombre = doc.proveedor || datosExtra?.EMPRESA_EMISORA?.NOMBRE || '';
          emisorCif = doc.cif || datosExtra?.EMPRESA_EMISORA?.CIF || '';
          receptorNombre = datosExtra?.CLIENTE?.NOMBRE || '';
        }

        // Lógica espejo de la SQL (misma que Hover Cards + Fallback robusto)
        const isIssued = !!(
          doc.empresa_cif &&
          emisorCif &&
          emisorCif.trim().toLowerCase() === doc.empresa_cif.trim().toLowerCase()
        );

        // Si es un abono el valor resta
        const isAbono = tipo.includes('abono') || tipo.includes('crédito') || tipo.includes('credito') || doc.total < 0;
        const sign = isAbono ? -1 : 1;

        const baseDoc = Math.abs(Number(doc.base_imponible) || 0) * sign;
        const ivaDoc = Math.abs(Number(doc.iva) || 0) * sign;
        const totalDoc = Math.abs(Number(doc.total) || 0) * sign;

        // Apply sign to the deeply nested iva_details so the Resumen IVA sums correctly
        const correctedIvaDetails = (doc.iva_details || []).map((detail: any) => ({
          ...detail,
          base_imponible: Math.abs(Number(detail.base_imponible) || 0) * sign,
          cuota: Math.abs(Number(detail.cuota) || 0) * sign,
        }));

        return {
          ...doc,
          proveedor: isIssued ? receptorNombre : emisorNombre,
          cif: isIssued ? '' : emisorCif,
          total: totalDoc,
          base_imponible: baseDoc,
          iva_details: correctedIvaDetails,
          is_issued: isIssued
        };
      });

      // Columnas para el reporte (formato original restaurado)
      const exportColumns = [
        { id: 'numero_documento', header: 'Número' },
        { id: 'fecha_emision', header: 'Fecha Emisión' },
        { id: 'proveedor', header: 'Emisor/Receptor' },
        { id: 'cif', header: 'CIF' },
        { id: 'base_imponible', header: 'Base Imponible' },
        { id: 'total', header: 'Total' },
        { id: 'base_21', header: 'Base 21%' },
        { id: 'iva_21', header: 'IVA 21%' },
        { id: 'base_10', header: 'Base 10%' },
        { id: 'iva_10', header: 'IVA 10%' },
      ];

      generateAdvancedExport(processedData, exportColumns, {
        filename: `Trimestre_${año}${trimestre ? `_T${trimestre}` : '_Anual'}`,
        format: 'excel',
        includeSummary: true,
        exportContext: 'trimestres',
        trimestre: trimestre ?? null,
      });

      toast({
        title: '✅ Exportación completada',
        description: 'El archivo se ha descargado correctamente con los totales desglosados.',
      });

    } catch (error) {
      console.error('❌ Error exporting:', error);
      toast({
        title: 'Error',
        description: 'No se pudo generar la exportación',
        variant: 'destructive',
      });
    }
  };

  const handleCerrarTrimestre = async (empresaId: number | null, enviarAlSII: boolean = false) => {
    if (!trimestreToClose) return;

    try {
      const response = await fetch('/api/trimestres/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          año: trimestreToClose.año,
          trimestre: trimestreToClose.trimestre,
          empresa_id: empresaId,
        }),
      });

      if (!response.ok) throw new Error('Error al cerrar trimestre');

      const result = await response.json();

      await loadTrimestres();
      await loadDocumentos();

      toast({
        title: '✅ Trimestre cerrado',
        description: `${result.affected} documento(s) de T${trimestreToClose.trimestre} ${trimestreToClose.año} cerrado(s)`,
      });

      setDialogOpen(false);

      if (enviarAlSII) {
        const params = new URLSearchParams({
          año: trimestreToClose.año.toString(),
          trimestre: trimestreToClose.trimestre.toString(),
          empresa_id: empresaId?.toString() || 'all'
        });

        window.location.href = `/sii?${params.toString()}`;
      }

    } catch (error) {
      console.error('❌ Error closing trimestre:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cerrar el trimestre',
        variant: 'destructive',
      });
    }
  };

  const trimestreAgregado = React.useMemo(() => {
    const trimestresDelPeriodo = trimestres.filter(
      t => t.año === selectedAño && t.trimestre === selectedTrimestre
    );

    if (trimestresDelPeriodo.length === 0) return null;

    if (trimestresDelPeriodo.length === 1) {
      return trimestresDelPeriodo[0];
    }

    return {
      año: selectedAño,
      trimestre: selectedTrimestre,
      empresa_id: null,
      empresa_nombre: `${trimestresDelPeriodo.length} empresas`,
      total_documentos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_documentos, 0),

      // ✅ TOTALES CON IVA (principal)
      total_ingresos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_ingresos, 0),
      total_gastos: trimestresDelPeriodo.reduce((sum, t) => sum + t.total_gastos, 0),

      // ✅ TOTALES SIN IVA (para breakdown)
      total_ingresos_sin_iva: trimestresDelPeriodo.reduce((sum, t) => sum + (t.total_ingresos_sin_iva || 0), 0),
      total_gastos_sin_iva: trimestresDelPeriodo.reduce((sum, t) => sum + (t.total_gastos_sin_iva || 0), 0),
      iva_repercutido: trimestresDelPeriodo.reduce((sum, t) => sum + t.iva_repercutido, 0),
      iva_soportado: trimestresDelPeriodo.reduce((sum, t) => sum + t.iva_soportado, 0),
      recargo_repercutido: trimestresDelPeriodo.reduce((sum, t) => sum + (t.recargo_repercutido || 0), 0),
      recargo_soportado: trimestresDelPeriodo.reduce((sum, t) => sum + (t.recargo_soportado || 0), 0),

      cerrado: trimestresDelPeriodo.every(t => t.cerrado),
      fecha_cierre: null,
    };
  }, [trimestres, selectedAño, selectedTrimestre]);

  const trimestresParaSelector = React.useMemo(() => {
    const unique = new Map<string, Trimestre>();

    trimestres.forEach(t => {
      const key = `${t.año}-${t.trimestre}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ...t,
          empresa_id: null,
          empresa_nombre: null,
        });
      } else {
        const existing = unique.get(key)!;
        if (t.cerrado) {
          existing.cerrado = true;
        }
      }
    });

    return Array.from(unique.values());
  }, [trimestres]);

  // ── NUEVO: CÁLCULO UNIFICADO USANDO EL MOTOR FINANCIERO ────────────────────
  const auditedResults = React.useMemo(() => {
    // Usamos el CIF de la primera empresa seleccionada como referencia principal
    // (Opcional: el motor ya usa d.empresa_cif si lo detecta en el documento)
    return calculateFinancials(documentos, null);
  }, [documentos]);

  const auditedFiltrado = React.useMemo(() => {
    return calculateFinancials(documentosFiltrados, null);
  }, [documentosFiltrados]);

  // Adaptadores para mantener compatibilidad con StatsHoverTable
  const mapToStatsBreakdown = (summary: any) => {
    const totalBase = Object.values(summary.bases).reduce((acc: number, b: any) => acc + b.total, 0);

    // ✅ MODELO TEÓRICO AGREGADO (Paridad absoluta con Excel)
    // Redondeamos sobre el total sumado de bases por tasa, no por cada documento.
    const quotas = {
      iva21: Math.round((summary.bases[21]?.total || 0) * 21) / 100,
      iva15: Math.round((summary.bases[15]?.total || 0) * 15) / 100,
      iva10: Math.round((summary.bases[10]?.total || 0) * 10) / 100,
      iva4: Math.round((summary.bases[4]?.total || 0) * 4) / 100,
    };

    const totalIVA = Object.values(quotas).reduce((acc, v) => acc + v, 0);
    const totalRecargo = summary.recargos.total;
    const totalRetencion = summary.retenciones.total;

    // Calculamos el total de la card como suma de sus partes teóricas para consistencia visual
    const totalTeorico = totalBase + totalIVA + totalRecargo - totalRetencion;

    return {
      bases: {
        base21: summary.bases[21].total,
        base15: summary.bases[15].total,
        base10: summary.bases[10].total,
        base4: summary.bases[4].total,
        base0: summary.bases[0].total,
      },
      quotas,
      recargo: totalRecargo,
      retencion: totalRetencion,
      totalBase,
      totalIVA,
      total: totalTeorico,
      mismatchDocs: [
        ...(summary.mismatchDocs.total[selectedTrimestre] || []),
        ...Object.values(summary.mismatchDocs.iva[selectedTrimestre] || {}).flat()
      ]
    };
  };

  const { ingresosBreakdown, gastosBreakdown, mismatchDocsIngresos, mismatchDocsGastos } = React.useMemo(() => {
    const ing = mapToStatsBreakdown(auditedResults.ingresos);
    const gas = mapToStatsBreakdown(auditedResults.gastos);
    return {
      ingresosBreakdown: ing,
      gastosBreakdown: gas,
      mismatchDocsIngresos: ing.mismatchDocs,
      mismatchDocsGastos: gas.mismatchDocs
    };
  }, [auditedResults, selectedTrimestre]);

  const { ingresosFiltrado, gastosFiltrado, mismatchFiltradoIngresos, mismatchFiltradoGastos } = React.useMemo(() => {
    const ing = mapToStatsBreakdown(auditedFiltrado.ingresos);
    const gas = mapToStatsBreakdown(auditedFiltrado.gastos);
    return {
      ingresosFiltrado: ing,
      gastosFiltrado: gas,
      mismatchFiltradoIngresos: ing.mismatchDocs,
      mismatchFiltradoGastos: gas.mismatchDocs
    };
  }, [auditedFiltrado, selectedTrimestre]);

  // ── Toggle: las cards reflejan los documentos filtrados ───────────────────
  const [dinamizarCards, setDinamizarCards] = React.useState(false);

  // Elegir qué breakdown y totales usar en las cards
  const cardsIngresos = dinamizarCards ? ingresosFiltrado : ingresosBreakdown;
  const cardsGastos = dinamizarCards ? gastosFiltrado : gastosBreakdown;
  const mismatchDocsIng = dinamizarCards ? mismatchFiltradoIngresos : mismatchDocsIngresos;
  const mismatchDocsGas = dinamizarCards ? mismatchFiltradoGastos : mismatchDocsGastos;

  // Totales calculados desde los docs filtrados (para modo dinámico)
  const totalIngresosDinamico = ingresosFiltrado.total;
  const totalGastosDinamico = gastosFiltrado.total;
  const ivaRepercutidoDinamico = ingresosFiltrado.totalIVA;
  const ivaSoportadoDinamico = gastosFiltrado.totalIVA;
  const totalIngresosSinIvaDinamico = ingresosFiltrado.totalBase;
  const totalGastosSinIvaDinamico = gastosFiltrado.totalBase;

  const numDocsCard = dinamizarCards ? documentosFiltrados.length : (trimestreAgregado?.total_documentos || 0);
  const totIngresosCard = dinamizarCards ? totalIngresosDinamico : ingresosBreakdown.total;
  const totGastosCard = dinamizarCards ? totalGastosDinamico : gastosBreakdown.total;
  const totIngresosBaseCard = dinamizarCards ? totalIngresosSinIvaDinamico : ingresosBreakdown.totalBase;
  const totGastosBaseCard = dinamizarCards ? totalGastosSinIvaDinamico : gastosBreakdown.totalBase;
  const ivaRepCard = dinamizarCards ? ivaRepercutidoDinamico : ingresosBreakdown.totalIVA;
  const ivaSopCard = dinamizarCards ? ivaSoportadoDinamico : gastosBreakdown.totalIVA;
  const beneficioBrutoCard = totIngresosCard - totGastosCard;
  const beneficioBaseCard = totIngresosBaseCard - totGastosBaseCard;
  const ivaNetoCard = ivaRepCard - ivaSopCard;

  const puedeCerrarse = trimestreAgregado && !trimestreAgregado.cerrado;
  const puedeEnviarAlSII = trimestreAgregado && trimestreAgregado.cerrado;

  return (
    <>
      <TrimestresTutorialRouter />

      <MainLayout>
        <PageHeader
          title="Gestión de Trimestres"
          icon={Calendar}
          badgeCount={0} // Opcional, o null si no se necesita
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center space-x-2" data-tutorial="trimestres-toggle">
              <Switch
                id="mostrar-vacios"
                checked={mostrarVacios}
                onCheckedChange={setMostrarVacios}
              />
              <Label htmlFor="mostrar-vacios" className="text-xs sm:text-sm whitespace-nowrap cursor-pointer">
                Mostrar vacíos
              </Label>
            </div>

            {/* Toggle: Cards dinámicas por filtro */}
            <div className="flex items-center space-x-2">
              <Switch
                id="dinamizar-cards"
                checked={dinamizarCards}
                onCheckedChange={setDinamizarCards}
              />
              <Label htmlFor="dinamizar-cards" className="text-xs sm:text-sm whitespace-nowrap cursor-pointer">
                Cards dinámicas
              </Label>
            </div>

            <div className="w-[200px]" data-tutorial="trimestres-company-selector">
              <CompaniesHeaderSelector />
            </div>
          </div>
        </PageHeader>

        <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">

          {isLoading ? (
            <Skeleton className="h-12 sm:h-16 w-full" />
          ) : selectedCompanyIds.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="w-full sm:flex-1 sm:min-w-0" data-tutorial="trimestres-selector">
                <TrimestreSelector
                  trimestres={trimestresParaSelector}
                  selectedAño={selectedAño}
                  selectedTrimestre={selectedTrimestre}
                  onSelectTrimestre={(año, trimestre) => {
                    setSelectedAño(año);
                    setSelectedTrimestre(trimestre);
                  }}
                  onSelectAño={handleSelectAño}
                  mostrarVacios={mostrarVacios}
                  onToggleMostrarVacios={setMostrarVacios}
                />
              </div>

              {trimestreAgregado && (
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <QuarterBadge cerrado={trimestreAgregado.cerrado} />

                  {puedeCerrarse && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2 text-xs sm:text-sm h-8 sm:h-9"
                      data-tutorial="trimestres-close-button"
                      onClick={() => {
                        if (isTutorialActive && currentStep === 6) {
                          console.log('🛡️ Click bloqueado por el tutorial');
                          return;
                        }
                        console.log('🔴 Abriendo diálogo de cierre');
                        console.log('Trimestre:', trimestreAgregado);
                        setTrimestreToClose(trimestreAgregado);
                        setDialogOpen(true);
                      }}
                      disabled={isTutorialActive && currentStep === 6}
                    >
                      <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="hidden xs:inline">Cerrar Trimestre</span>
                      <span className="xs:hidden">Cerrar</span>
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs sm:text-sm h-8 sm:h-9"
                      >
                        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span className="hidden xs:inline">Exportar</span>
                        <span className="xs:hidden">Export</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleExportar(selectedAño, selectedTrimestre)}
                        className="cursor-pointer"
                      >
                        Exportar Trimestre Actual (T{selectedTrimestre})
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportar(selectedAño, null)}
                        className="cursor-pointer"
                      >
                        Exportar Año Completo ({selectedAño})
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {puedeEnviarAlSII && (
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2 text-xs sm:text-sm h-8 sm:h-9 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        const params = new URLSearchParams({
                          año: selectedAño.toString(),
                          trimestre: selectedTrimestre.toString(),
                          empresa_id: trimestreAgregado.empresa_id?.toString() || 'all'
                        });

                        window.location.href = `/sii?${params.toString()}`;
                      }}
                    >
                      <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="hidden xs:inline">Enviar al SII</span>
                      <span className="xs:hidden">Enviar</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* CONTINUACIÓN EN PARTE 2 */}{/* ✅ MODIFICADO: Ahora con 7 cards CON BREAKDOWN que muestra CON IVA + SIN IVA */}
          {isLoading ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-7">
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-24 sm:h-28 lg:h-32" />
              ))}
            </div>
          ) : selectedCompanyIds.length === 0 ? null : trimestreAgregado ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-7" data-tutorial="trimestres-stats">

              {/* 1️⃣ Total Documentos - SIN CAMBIOS */}
              <TrimestreStatsCard
                title="Total Documentos"
                value={numDocsCard}
                icon={FileText}
                description={`T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`}
                breakdown={[
                  {
                    label: "Facturas del Sistema",
                    value: formatNumber(numDocsCard),
                    className: "text-foreground"
                  },
                  {
                    label: "Trimestre",
                    value: `T${trimestreAgregado.trimestre} ${trimestreAgregado.año}`,
                    className: "text-muted-foreground"
                  }
                ]}
              />

              {/* 2️⃣ Ingresos - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="Ingresos"
                value={formatCurrency(totIngresosCard)}
                icon={TrendingUp}
                description="Total CON IVA"
                trend="up"
                richTooltip={<StatsHoverTable
                  {...cardsIngresos}
                  type="ingresos"
                  totalBaseOverride={totIngresosBaseCard}
                  totalIvaOverride={ivaRepCard}
                  totalOverride={totIngresosCard}
                  mismatchDocs={mismatchDocsIng}
                />}
              />

              {/* 3️⃣ Gastos - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="Gastos"
                value={formatCurrency(totGastosCard)}
                icon={TrendingDown}
                description="Total CON IVA"
                trend="down"
                richTooltip={<StatsHoverTable
                  {...cardsGastos}
                  type="gastos"
                  totalBaseOverride={totGastosBaseCard}
                  totalIvaOverride={ivaSopCard}
                  totalOverride={totGastosCard}
                  mismatchDocs={mismatchDocsGas}
                />}
              />

              {/* 4️⃣ Beneficio Bruto - ✅ MODIFICADO CON BREAKDOWN COMPLETO */}
              <TrimestreStatsCard
                title="Beneficio Bruto"
                value={formatCurrency(beneficioBrutoCard)}
                icon={DollarSign}
                description="CON IVA incluido"
                trend={
                  beneficioBrutoCard > 0
                    ? 'up'
                    : beneficioBrutoCard < 0
                      ? 'down'
                      : 'neutral'
                }
                breakdown={[
                  {
                    label: "Ingresos CON IVA",
                    value: formatCurrency(totIngresosCard),
                    className: "text-green-600 dark:text-green-500"
                  },
                  {
                    label: "Gastos CON IVA",
                    value: formatCurrency(totGastosCard),
                    className: "text-red-600 dark:text-red-500"
                  },
                  {
                    label: "Beneficio CON IVA",
                    value: formatCurrency(beneficioBrutoCard),
                    className: beneficioBrutoCard >= 0
                      ? 'text-green-600 dark:text-green-500 font-bold'
                      : 'text-red-600 dark:text-red-500 font-bold'
                  },
                  {
                    label: "---",
                    value: "---",
                    className: "text-muted-foreground"
                  },
                  {
                    label: "Beneficio SIN IVA",
                    value: formatCurrency(beneficioBaseCard),
                    className: "text-muted-foreground italic"
                  }
                ]}
              />

              {/* 5️⃣ IVA REPERCUTIDO - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="IVA Repercutido"
                value={formatCurrency(ivaRepCard)}
                icon={ArrowUpCircle}
                description="IVA cobrado (incl. recargo)"
                trend="neutral"
                richTooltip={<StatsHoverTable
                  {...cardsIngresos}
                  type="ingresos"
                  showBases={false}
                  showTotal={false}
                  retencion={0}
                  totalIvaOverride={ivaRepCard}
                />}
              />

              {/* 6️⃣ IVA SOPORTADO - ✅ MODIFICADO CON BREAKDOWN */}
              <TrimestreStatsCard
                title="IVA Soportado"
                value={formatCurrency(ivaSopCard)}
                icon={ArrowDownCircle}
                description="IVA pagado (incl. recargo)"
                trend="neutral"
                richTooltip={<StatsHoverTable
                  {...cardsGastos}
                  type="gastos"
                  showBases={false}
                  showTotal={false}
                  retencion={0}
                  totalIvaOverride={ivaSopCard}
                />}
              />

              {/* 7️⃣ IVA NETO - ✅ MODIFICADO CON BREAKDOWN COMPLETO */}
              <TrimestreStatsCard
                title="IVA Neto"
                value={formatCurrency(ivaNetoCard)}
                icon={Receipt}
                description={
                  ivaNetoCard > 0
                    ? "A pagar a Hacienda"
                    : ivaNetoCard < 0
                      ? "A devolver por Hacienda"
                      : "Sin diferencia"
                }
                trend={
                  ivaNetoCard > 0
                    ? 'down'
                    : ivaNetoCard < 0
                      ? 'up'
                      : 'neutral'
                }
                breakdown={[
                  {
                    label: "IVA Rep. + Recargo",
                    value: formatCurrency(ivaRepCard),
                    className: "text-green-600 dark:text-green-500"
                  },
                  {
                    label: "IVA Sop. + Recargo",
                    value: formatCurrency(ivaSopCard),
                    className: "text-red-600 dark:text-red-500"
                  },
                  {
                    label: "Resultado IVA",
                    value: formatCurrency(ivaNetoCard),
                    className: ivaNetoCard >= 0
                      ? 'text-red-600 dark:text-red-500 font-bold'
                      : 'text-green-600 dark:text-green-500 font-bold'
                  }
                ]}
              />

            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 sm:p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">
                No hay datos disponibles
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                Selecciona un trimestre para ver las estadísticas o activa "Mostrar vacíos" para ver todos los trimestres del año.
              </p>
            </div>
          )}

          {isLoadingDocs ? (
            <Skeleton className="h-64 sm:h-80 lg:h-96 w-full rounded-lg" />
          ) : selectedCompanyIds.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 sm:p-12 text-center bg-muted/20">
              <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">
                Selecciona una empresa
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Para visualizar los documentos del trimestre, primero debes seleccionar al menos una empresa.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const selector = document.querySelector('[data-tutorial="trimestres-company-selector"]');
                  selector?.scrollIntoView({ behavior: 'smooth', block: 'center' });

                  selector?.classList.add('ring-2', 'ring-violet-500', 'ring-offset-2');
                  setTimeout(() => {
                    selector?.classList.remove('ring-2', 'ring-violet-500', 'ring-offset-2');
                  }, 2000);
                }}
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                Ir al selector de empresas
              </Button>
            </div>
          ) : (
            <>
              {/* 📊 VISTA EXCEL INTERACTIVA (ANUAL) */}
              <TrimestreExcelView
                documents={annualDocumentos}
                isLoading={isLoadingAnnualDocs}
                año={selectedAño}
              />

              <div className="rounded-lg border bg-card" data-tutorial="trimestres-table">
                {/* Barra de filtros — filtra qué filas se ven, NO los totales del footer */}
                <div className="px-4 pt-3 border-b">
                  <TrimestresFilterBar
                    documentos={documentos}
                    filters={filters}
                    onFiltersChange={setFilters}
                    empresaIds={selectedCompanyIds}
                    año={selectedAño}
                    trimestre={selectedTrimestre}
                    mostrarVacios={mostrarVacios}
                  />
                </div>
                <TrimestreTable
                  documentos={documentosFiltrados.map(doc => {
                    let rec = 0;
                    let ret = 0;
                    doc.iva_details?.forEach(det => {
                      const t = (det.tipo_impuesto || '').toLowerCase();
                      const val = Math.round(Math.abs(Number(det.cuota) || 0) * 100) / 100;
                      if (t.includes('recargo') || t.includes('equivalencia')) rec += val;
                      if (t.includes('retencion') || t.includes('irpf')) ret += val;
                    });
                    const esAbono = (doc.tipo_documento || '').toLowerCase().includes('abono') || (doc.total || 0) < 0;
                    const sign = esAbono ? -1 : 1;
                    return { ...doc, recargo: rec * sign, retencion: ret * sign };
                  })}
                  footerValues={{
                    base: totIngresosBaseCard - totGastosBaseCard,
                    iva: ivaRepCard - ivaSopCard,
                    total: totIngresosCard - totGastosCard,
                    label: "Resultado Neto del Periodo:",
                    breakdown: {
                      ingresos: {
                        base: totIngresosBaseCard,
                        iva: ivaRepCard,
                        total: totIngresosCard,
                        retencion: cardsIngresos.retencion || 0,
                        recargo: (cardsIngresos as any).recargo || 0
                      },
                      gastos: {
                        base: totGastosBaseCard,
                        iva: ivaSopCard,
                        total: totGastosCard,
                        retencion: cardsGastos.retencion || 0,
                        recargo: (cardsGastos as any).recargo || 0
                      }
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>

        <CloseQuarterDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trimestre={trimestreToClose}
          onConfirm={handleCerrarTrimestre}
        />
      </MainLayout>
    </>
  );
}

export default function TrimestresPage() {
  return (
    <TrimestresProvider>
      <TrimestresPageContent />
    </TrimestresProvider>
  );
}