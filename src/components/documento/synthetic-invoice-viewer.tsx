'use client';

import React, { useState } from 'react';
import { type Document } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Printer, Sparkles, AlertTriangle, Building2, User, Receipt, ShieldCheck, FileSpreadsheet } from 'lucide-react';

interface SyntheticInvoiceViewerProps {
  doc: Document;
}

type TemplateType = 'dark' | 'paper' | 'compact';

const fmtNum = (v: number | string | null | undefined) => {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return '0,00';
  const [i, d] = n.toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
};

const fmtEur = (v: number | string | null | undefined) => `${fmtNum(v)} €`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
  } catch {
    return String(d);
  }
};

export function SyntheticInvoiceViewer({ doc }: SyntheticInvoiceViewerProps) {
  const [template, setTemplate] = useState<TemplateType>('dark');

  // Separar entidades
  const emisor = doc.entidades?.find(e => e.rol === 'emisor' || e.rol === 'proveedor');
  const cliente = doc.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');

  // Nombres y CIFs de respaldo
  const emisorNombre = emisor?.nombre || doc.proveedor || 'Sin Emisor';
  const emisorCIF = emisor?.identificador_fiscal || doc.cif || '—';
  const emisorDir = emisor?.direccion || '—';

  const clienteNombre = cliente?.nombre || doc.empresa_nombre || 'Sin Cliente';
  const clienteCIF = cliente?.identificador_fiscal || doc.empresa_cif || '—';
  const clienteDir = cliente?.direccion || '—';

  const isIssued = doc.is_issued === 1 || String(doc.tipo_documento || '').toUpperCase().includes('EMITIDA');

  const baseImponible = Number(doc.base_imponible ?? 0);
  const totalAmount = Number(doc.total ?? 0);
  const retencion = Number(doc.retencion_irpf ?? (doc as any).retencion_irpf ?? 0);
  const baseNoSujeta = Number((doc as any).base_no_sujeta ?? 0);
  const descuentoGlobal = Number((doc as any).descuento_global ?? 0);

  const ivaDetails = doc.iva_details && doc.iva_details.length > 0 ? doc.iva_details : [];
  const lineas = doc.lineas && doc.lineas.length > 0 ? doc.lineas : [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* ═══ BARRA SUPERIOR DE HERRAMIENTAS (No imprimible) ═══ */}
      <div className="no-print flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-white shrink-0 gap-3 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span className="hidden sm:inline">Factura Sintética (API)</span>
        </div>

        {/* Selector de Plantilla */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setTemplate('dark')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
              template === 'dark'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            Gestor Dark
          </button>
          <button
            type="button"
            onClick={() => setTemplate('paper')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
              template === 'paper'
                ? 'bg-slate-100 text-slate-900 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            Papel Claro
          </button>
          <button
            type="button"
            onClick={() => setTemplate('compact')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
              template === 'compact'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            Pizarra Compacta
          </button>
        </div>

        {/* Botón Imprimir */}
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
          title="Imprimir o guardar como PDF"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Imprimir / PDF</span>
        </button>
      </div>

      {/* ═══ CONTENIDO DEL DOCUMENTO SINTÉTICO (Scrollable / Printable) ═══ */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 print-container select-text">
        <div
          className={cn(
            'max-w-3xl mx-auto rounded-xl p-6 sm:p-8 transition-all duration-300 shadow-2xl relative',
            template === 'dark' && 'bg-slate-950 text-slate-100 border border-emerald-500/20 shadow-emerald-950/20',
            template === 'paper' && 'bg-white text-slate-900 border border-slate-200 shadow-slate-300 font-sans',
            template === 'compact' && 'bg-slate-900 text-slate-100 border border-slate-800'
          )}
        >
          {/* BANNER DE RECONSTRUCCIÓN FISCAL API */}
          <div
            className={cn(
              'mb-6 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between border gap-2',
              template === 'dark' && 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300',
              template === 'paper' && 'bg-amber-50 border-amber-300 text-amber-900',
              template === 'compact' && 'bg-indigo-950/50 border-indigo-500/30 text-indigo-300'
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Reconstrucción gráfica de datos API (Verifactu/SII):</strong> Sin archivo original adjunto.
              </span>
            </div>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono tracking-wider shrink-0',
                template === 'paper' ? 'bg-amber-200 text-amber-900' : 'bg-white/10 text-white'
              )}
            >
              CANAL: API
            </span>
          </div>

          {/* CABECERA: TÍTULO DOCUMENTO + METADATOS */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b pb-6 gap-4 border-current/15">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className={cn('h-6 w-6', template === 'dark' ? 'text-emerald-400' : template === 'compact' ? 'text-indigo-400' : 'text-slate-700')} />
                <h1 className="text-xl font-bold tracking-tight uppercase">
                  {doc.tipo_documento || (isIssued ? 'Factura Emitida' : 'Factura Recibida')}
                </h1>
              </div>
              <p className={cn('text-xs mt-1 font-mono', template === 'paper' ? 'text-slate-500' : 'text-slate-400')}>
                Nº de Registro: ID #{doc.id_documento}
              </p>
            </div>

            <div className={cn('text-left sm:text-right text-xs space-y-1', template === 'paper' ? 'text-slate-600' : 'text-slate-300')}>
              <div>
                <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70 block sm:inline sm:mr-2">Nº Factura / Serie:</span>
                <span className="font-mono font-bold text-sm text-current">{doc.numero_documento || '—'}</span>
              </div>
              <div>
                <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70 block sm:inline sm:mr-2">Fecha Emisión:</span>
                <span className="font-medium">{fmtDate(doc.fecha_emision)}</span>
              </div>
              {doc.fecha_vencimiento && (
                <div>
                  <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70 block sm:inline sm:mr-2">Vencimiento:</span>
                  <span className="font-medium">{fmtDate(doc.fecha_vencimiento)}</span>
                </div>
              )}
              {doc.año_trimestre && doc.num_trimestre && (
                <div>
                  <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70 block sm:inline sm:mr-2">Trimestre Fiscal:</span>
                  <span className="font-mono font-bold text-emerald-400">{doc.año_trimestre} – T{doc.num_trimestre}</span>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN EMISOR Y RECEPTOR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 text-xs">
            {/* EMISOR */}
            <div
              className={cn(
                'p-4 rounded-lg border space-y-1.5',
                template === 'dark' && 'bg-slate-900/60 border-slate-800',
                template === 'paper' && 'bg-slate-50 border-slate-200',
                template === 'compact' && 'bg-slate-800/50 border-slate-700'
              )}
            >
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground mb-2">
                <Building2 className="h-3.5 w-3.5" />
                <span>Emisor / Proveedor</span>
              </div>
              <p className="font-bold text-sm text-current leading-tight">{emisorNombre}</p>
              <p className="font-mono">
                <span className="opacity-70">CIF/NIF:</span> <strong>{emisorCIF}</strong>
              </p>
              {emisorDir !== '—' && <p className="opacity-80">{emisorDir}</p>}
            </div>

            {/* RECEPTOR / CLIENTE */}
            <div
              className={cn(
                'p-4 rounded-lg border space-y-1.5',
                template === 'dark' && 'bg-slate-900/60 border-slate-800',
                template === 'paper' && 'bg-slate-50 border-slate-200',
                template === 'compact' && 'bg-slate-800/50 border-slate-700'
              )}
            >
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground mb-2">
                <User className="h-3.5 w-3.5" />
                <span>Cliente / Receptor</span>
              </div>
              <p className="font-bold text-sm text-current leading-tight">{clienteNombre}</p>
              <p className="font-mono">
                <span className="opacity-70">CIF/NIF:</span> <strong>{clienteCIF}</strong>
              </p>
              {clienteDir !== '—' && <p className="opacity-80">{clienteDir}</p>}
            </div>
          </div>

          {/* TABLA DE LÍNEAS DE DETALLE (SI EXISTEN) */}
          {lineas.length > 0 && (
            <div className="my-6">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70 flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Conceptos y Líneas de Detalle
              </h3>
              <div className="overflow-x-auto rounded-lg border border-current/15">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className={cn('border-b border-current/15 uppercase font-bold text-[10px]', template === 'paper' ? 'bg-slate-100' : 'bg-slate-900/80')}>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2 text-center">Cant.</th>
                      <th className="px-3 py-2 text-right">Precio Unit.</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-current/10">
                    {lineas.map((linea, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">{linea.descripcion || `Concepto #${i + 1}`}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{linea.cantidad || 1}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtEur(linea.precio_unitario || linea.importe_linea)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEur(linea.importe_linea)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DESGLOSE FISCAL DE IVA / IMPUESTOS */}
          <div className="my-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70">Desglose de Impuestos (IVA / Retenciones)</h3>
            <div className="overflow-x-auto rounded-lg border border-current/15">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className={cn('border-b border-current/15 uppercase font-bold text-[10px]', template === 'paper' ? 'bg-slate-100' : 'bg-slate-900/80')}>
                    <th className="px-3 py-2">Tipo Impuesto</th>
                    <th className="px-3 py-2 text-center">% IVA</th>
                    <th className="px-3 py-2 text-right">Base Imponible</th>
                    <th className="px-3 py-2 text-right">Cuota IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-current/10">
                  {ivaDetails.length > 0 ? (
                    ivaDetails.map((iva, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">{iva.tipo_impuesto || 'IVA'}</td>
                        <td className="px-3 py-2 text-center font-bold">{iva.porcentaje}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtEur(iva.base_imponible)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEur(iva.cuota)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-2 font-medium">IVA General</td>
                      <td className="px-3 py-2 text-center font-bold">—</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtEur(baseImponible)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEur(totalAmount - baseImponible)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECCIÓN DE TOTALES */}
          <div className="flex flex-col sm:flex-row justify-end items-end my-6">
            <div
              className={cn(
                'w-full sm:w-80 p-4 rounded-xl border space-y-2 text-xs',
                template === 'dark' && 'bg-slate-900/90 border-slate-800',
                template === 'paper' && 'bg-slate-50 border-slate-300',
                template === 'compact' && 'bg-slate-800 border-slate-700'
              )}
            >
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Base Imponible:</span>
                <span className="font-mono tabular-nums font-medium text-current">{fmtEur(baseImponible)}</span>
              </div>

              {baseNoSujeta > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Base exenta / no sujeta:</span>
                  <span className="font-mono tabular-nums font-medium text-current">{fmtEur(baseNoSujeta)}</span>
                </div>
              )}

              {descuentoGlobal > 0 && (
                <div className="flex justify-between items-center text-rose-500">
                  <span>Descuento Global:</span>
                  <span className="font-mono tabular-nums font-medium">-{fmtEur(descuentoGlobal)}</span>
                </div>
              )}

              {retencion > 0 && (
                <div className="flex justify-between items-center text-amber-500">
                  <span>Retención IRPF:</span>
                  <span className="font-mono tabular-nums font-medium">-{fmtEur(retencion)}</span>
                </div>
              )}

              <div className="border-t border-current/20 pt-2 flex justify-between items-center font-bold text-sm">
                <span className="uppercase tracking-wider">Total Factura:</span>
                <span
                  className={cn(
                    'text-lg font-mono tabular-nums',
                    template === 'dark' ? 'text-emerald-400' : template === 'compact' ? 'text-indigo-400' : 'text-slate-900'
                  )}
                >
                  {fmtEur(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* OBSERVACIONES SI EXISTEN */}
          {doc.observaciones && (
            <div className="mt-6 pt-4 border-t border-current/15 text-xs">
              <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground mb-1">Observaciones / Notas:</p>
              <p className="italic opacity-80 whitespace-pre-wrap">{doc.observaciones}</p>
            </div>
          )}

          {/* PIE DE PÁGINA CON SELLO Y FIRMA DE SISTEMA */}
          <div className="mt-8 pt-4 border-t border-current/15 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Registro ingestado síncronamente vía API Gestor Encripting</span>
            </div>
            <span className="font-mono opacity-60">Moneda: {doc.moneda || 'EUR'} · Estado: {doc.verificado ? 'Validado' : 'Registrado'}</span>
          </div>
        </div>
      </div>

      {/* ═══ REGLAS CSS PARA IMPRESIÓN (PRINT) ═══ */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .no-print {
            display: none !important;
          }
          .print-container, .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
