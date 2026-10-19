'use client';

/**
 * ExportMaestroDialog
 *
 * Dialog para exportar documentos vía la API server-side (/api/v1/export/excel).
 * Genera el Excel con Link Maestro incluido + dispara el ZIP en background.
 * Si la empresa tiene mail_de_carga configurado, el ZIP se enviará por mail al terminar.
 */
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, Download, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface ExportMaestroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-rellenar filtros desde el contexto de la página */
  defaultTrimestre?: number | null;
  defaultAño?: number | null;
  defaultTipo?: 'emitidas' | 'recibidas' | 'todas';
  /** Email de notificación (se puede editar en el dialog) */
  mailDeCarga?: string | null;
  empresaNombre?: string;
}

type ExportState = 'idle' | 'generating' | 'done' | 'error';

const TTL_OPTIONS = [
  { label: '1 día', value: 86400 },
  { label: '3 días', value: 259200 },
  { label: '7 días', value: 604800 },
];

export function ExportMaestroDialog({
  open,
  onOpenChange,
  defaultTrimestre,
  defaultAño,
  defaultTipo = 'todas',
  mailDeCarga,
  empresaNombre,
}: ExportMaestroDialogProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  const [trimestre, setTrimestre] = React.useState<string>(defaultTrimestre ? String(defaultTrimestre) : 'todos');
  const [año, setAño] = React.useState<string>(defaultAño ? String(defaultAño) : String(currentYear));
  const [tipo, setTipo] = React.useState<string>(defaultTipo);
  const [ttl, setTtl] = React.useState<number>(604800);
  const [notifyEmail, setNotifyEmail] = React.useState<string>(mailDeCarga || '');
  const [state, setState] = React.useState<ExportState>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  // Reset al abrir
  React.useEffect(() => {
    if (open) {
      setTrimestre(defaultTrimestre ? String(defaultTrimestre) : 'todos');
      setAño(defaultAño ? String(defaultAño) : String(currentYear));
      setTipo(defaultTipo);
      setNotifyEmail(mailDeCarga || '');
      setState('idle');
      setErrorMsg('');
    }
  }, [open, defaultTrimestre, defaultAño, defaultTipo, mailDeCarga, currentYear]);

  const handleGenerate = async () => {
    setState('generating');
    setErrorMsg('');

    try {
      const body: Record<string, any> = {
        tipo,
        url_expires_in: ttl,
      };
      if (trimestre !== 'todos') body.trimestre = Number(trimestre);
      if (año) body.año = Number(año);

      const resp = await fetch('/api/v1/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      // Descargar el Excel
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const contentDisp = resp.headers.get('content-disposition') || '';
      const filenameMatch = contentDisp.match(/filename="([^"]+)"/);
      a.download = filenameMatch?.[1] || `Export_${año || ''}_${trimestre !== 'todos' ? `T${trimestre}` : 'Anual'}.xlsx`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);

      setState('done');

      const mailMsg = notifyEmail
        ? `ZIP en generación — te avisamos a ${notifyEmail} cuando esté listo.`
        : 'ZIP en generación — el link maestro está incluido en el Excel.';
      toast({ title: 'Excel descargado', description: mailMsg });

    } catch (e: any) {
      setState('error');
      setErrorMsg(e.message || 'Error al generar el export');
      toast({ title: 'Error al generar export', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0f1117] border border-[#1e293b] text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Package className="h-5 w-5 text-violet-400" />
            Export Maestro
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Genera un Excel con todas las URLs de documentos + un ZIP descargable con los archivos originales.
            {notifyEmail && (
              <span className="block mt-1 text-violet-400">
                📬 ZIP enviado por mail a <strong>{notifyEmail}</strong> al terminar.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">

          {/* Trimestre */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs uppercase tracking-wide">Trimestre</Label>
              <Select value={trimestre} onValueChange={setTrimestre}>
                <SelectTrigger className="bg-[#111827] border-[#1e293b] text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111827] border-[#1e293b]">
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="1">1T</SelectItem>
                  <SelectItem value="2">2T</SelectItem>
                  <SelectItem value="3">3T</SelectItem>
                  <SelectItem value="4">4T</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs uppercase tracking-wide">Año</Label>
              <Input
                type="number"
                value={año}
                onChange={e => setAño(e.target.value)}
                min={2020}
                max={2099}
                className="bg-[#111827] border-[#1e293b] text-slate-200"
              />
            </div>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Tipo de documentos</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="bg-[#111827] border-[#1e293b] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1e293b]">
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="recibidas">Recibidas (gastos)</SelectItem>
                <SelectItem value="emitidas">Emitidas (ingresos)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* TTL */}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Validez del link ZIP</Label>
            <Select value={String(ttl)} onValueChange={v => setTtl(Number(v))}>
              <SelectTrigger className="bg-[#111827] border-[#1e293b] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#111827] border-[#1e293b]">
                {TTL_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email notificación */}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Notificación ZIP por mail (opcional)
            </Label>
            <Input
              type="email"
              placeholder="email@empresa.com"
              value={notifyEmail}
              onChange={e => setNotifyEmail(e.target.value)}
              className="bg-[#111827] border-[#1e293b] text-slate-200 placeholder:text-slate-600"
            />
            <p className="text-xs text-slate-600">
              Recibirás un mail con el link de descarga del ZIP cuando esté listo.
            </p>
          </div>

          {/* Estado error */}
          {state === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Estado done */}
          {state === 'done' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950/30 border border-emerald-900/40 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Excel descargado. ZIP generándose en background.
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-200"
            disabled={state === 'generating'}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={state === 'generating' || state === 'done'}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {state === 'generating' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
            ) : state === 'done' ? (
              <><CheckCircle2 className="h-4 w-4" /> Generado</>
            ) : (
              <><Download className="h-4 w-4" /> Generar Excel + ZIP</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
