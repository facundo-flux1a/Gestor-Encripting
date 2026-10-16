'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Building2,
  Receipt,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Bot,
  User,
  ArrowRightLeft,
  FileText,
  Upload,
  X,
  Paperclip,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ManualLineItem {
  id: string;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  importeLinea: number;
  cuentaContable?: string;
}

export interface ManualTaxItem {
  id: string;
  tipo: string;
  porcentaje: number;
  base: number;
  cuota: number;
  cuentaContable?: string;
}

export interface ManualDocumentDraft {
  tipoDocumento: string;
  numeroDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string;
  formaPago: string;
  moneda: string;
  emisor: {
    nombre: string;
    cif: string;
    direccion: string;
    telefono: string;
    email: string;
    cuentaContable?: string;
  };
  receptor: {
    nombre: string;
    cif: string;
    direccion: string;
    telefono: string;
    email: string;
    cuentaContable?: string;
  };
  lineas: ManualLineItem[];
  impuestos: ManualTaxItem[];
  baseImponible: number;
  totalImpuestos: number;
  total: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ManualDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  companyCif?: string;
  onDocumentCreated?: (documentId: number) => void;
}

const INITIAL_DRAFT: ManualDocumentDraft = {
  tipoDocumento: 'FACTURA RECIBIDA',
  numeroDocumento: '',
  fechaEmision: new Date().toISOString().split('T')[0],
  fechaVencimiento: '',
  formaPago: 'Transferencia',
  moneda: 'EUR',
  emisor: {
    nombre: '',
    cif: '',
    direccion: '',
    telefono: '',
    email: '',
    cuentaContable: '400000',
  },
  receptor: {
    nombre: '',
    cif: '',
    direccion: '',
    telefono: '',
    email: '',
    cuentaContable: '',
  },
  lineas: [],
  impuestos: [
    {
      id: 'tax-1',
      tipo: 'IVA',
      porcentaje: 21,
      base: 0,
      cuota: 0,
      cuentaContable: '472000',
    },
  ],
  baseImponible: 0,
  totalImpuestos: 0,
  total: 0,
};

export function ManualDocumentModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  companyCif,
  onDocumentCreated,
}: ManualDocumentModalProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ManualDocumentDraft>(() => ({
    ...INITIAL_DRAFT,
    receptor: {
      ...INITIAL_DRAFT.receptor,
      nombre: companyName || '',
      cif: companyCif || '',
    },
  }));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        '¡Hola! Soy tu copiloto contable. Podés dictarme o escribir los datos en lenguaje natural (ej: "Factura de Repsol por 60€ de diésel con 21% de IVA") o completar directamente la plantilla de la derecha.',
      timestamp: new Date(),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Auto-scroll en el chat al recibir nuevos mensajes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isAiLoading]);

  // Actualizar receptor con la empresa activa y su CIF si están disponibles
  useEffect(() => {
    if (isOpen) {
      setDraft((prev) => ({
        ...prev,
        receptor: {
          ...prev.receptor,
          nombre: prev.receptor.nombre || companyName || '',
          cif: prev.receptor.cif || companyCif || '',
        },
      }));
    }
  }, [isOpen, companyName, companyCif]);

  // Recalcular totales e impuestos en base a las líneas
  const recalculateTotals = (
    currentLines: ManualLineItem[],
    currentTaxes: ManualTaxItem[]
  ) => {
    const base = currentLines.reduce((acc, l) => acc + (Number(l.importeLinea) || 0), 0);
    const round2 = (num: number) => Math.round(num * 100) / 100;

    // Actualizar bases de impuestos si hay un único IVA estándar
    const updatedTaxes = currentTaxes.map((tax) => {
      const cuota = round2((base * (tax.porcentaje || 0)) / 100);
      return {
        ...tax,
        base: round2(base),
        cuota,
      };
    });

    const totalTax = updatedTaxes.reduce((acc, t) => acc + (t.cuota || 0), 0);
    const total = round2(base + totalTax);

    return {
      baseImponible: round2(base),
      totalImpuestos: round2(totalTax),
      total,
      updatedTaxes,
    };
  };

  // Manejo de cambios en el chat
  const handleSendMessage = async (customPrompt?: string) => {
    const messageToSend = (customPrompt || inputMessage).trim();
    if (!messageToSend || isAiLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageToSend,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/documents/manual/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: messageToSend,
          history: chatMessages.map((m) => ({ role: m.role, content: m.content })),
          currentDraft: draft,
          company: {
            id: companyId,
            nombre: companyName,
            cif: companyCif,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con la IA');
      }

      if (data.updatedDraft) {
        const incomingDraft = data.updatedDraft;
        const esEmitida = (incomingDraft.tipoDocumento || draft.tipoDocumento || '').includes('EMITIDA');

        // Normalizar líneas con IDs estables, SKU y Cuentas Contables
        const mappedLines: ManualLineItem[] = Array.isArray(incomingDraft.lineas)
          ? incomingDraft.lineas.map((l: any, idx: number) => {
              const cant = Number(l.cantidad) || 1;
              const precio = Number(l.precioUnitario) || 0;
              const desc = Number(l.descuentoPorcentaje) || 0;
              const sub = Number(l.importeLinea) || Math.round(cant * precio * (1 - desc / 100) * 100) / 100;
              return {
                id: l.id || `line-${Date.now()}-${idx}`,
                codigo: l.codigo || '',
                descripcion: l.descripcion || 'Artículo',
                cantidad: cant,
                precioUnitario: precio,
                descuentoPorcentaje: desc,
                importeLinea: sub,
                cuentaContable: l.cuentaContable || (esEmitida ? '700000' : '600000'),
              };
            })
          : draft.lineas;

        // Normalizar impuestos
        const mappedTaxes: ManualTaxItem[] = Array.isArray(incomingDraft.impuestos) && incomingDraft.impuestos.length > 0
          ? incomingDraft.impuestos.map((t: any, idx: number) => ({
              id: t.id || `tax-${idx}`,
              tipo: t.tipo || 'IVA',
              porcentaje: Number(t.porcentaje) || 21,
              base: Number(t.base) || 0,
              cuota: Number(t.cuota) || 0,
              cuentaContable: t.cuentaContable || (esEmitida ? '477000' : '472000'),
            }))
          : draft.impuestos;

        const calcs = recalculateTotals(mappedLines, mappedTaxes);

        setDraft((prev) => ({
          ...prev,
          tipoDocumento: incomingDraft.tipoDocumento || prev.tipoDocumento,
          numeroDocumento: incomingDraft.numeroDocumento ?? prev.numeroDocumento,
          fechaEmision: incomingDraft.fechaEmision || prev.fechaEmision,
          fechaVencimiento: incomingDraft.fechaVencimiento || prev.fechaVencimiento,
          formaPago: incomingDraft.formaPago || prev.formaPago,
          emisor: {
            ...prev.emisor,
            ...(incomingDraft.emisor || {}),
            cuentaContable: incomingDraft.emisor?.cuentaContable || prev.emisor.cuentaContable || (esEmitida ? '' : '400000'),
          },
          receptor: {
            ...prev.receptor,
            ...(incomingDraft.receptor || {}),
            cif: incomingDraft.receptor?.cif || prev.receptor.cif || companyCif || '',
            cuentaContable: incomingDraft.receptor?.cuentaContable || prev.receptor.cuentaContable || (esEmitida ? '430000' : ''),
          },
          lineas: mappedLines,
          impuestos: calcs.updatedTaxes,
          baseImponible: calcs.baseImponible,
          totalImpuestos: calcs.totalImpuestos,
          total: calcs.total,
        }));
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.assistantMessage || 'He actualizado los campos del documento.',
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error('❌ [ManualModal] Error IA:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Disculpa, tuve un inconveniente temporal: ${err.message}. Podés seguir completando los campos manualmente.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Agregar línea de producto manual
  const handleAddLine = () => {
    const esEmitida = draft.tipoDocumento.includes('EMITIDA');
    const newLine: ManualLineItem = {
      id: `line-${Date.now()}`,
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuentoPorcentaje: 0,
      importeLinea: 0,
      cuentaContable: esEmitida ? '700000' : '600000',
    };
    const newLines = [...draft.lineas, newLine];
    const calcs = recalculateTotals(newLines, draft.impuestos);
    setDraft((prev) => ({
      ...prev,
      lineas: newLines,
      impuestos: calcs.updatedTaxes,
      baseImponible: calcs.baseImponible,
      totalImpuestos: calcs.totalImpuestos,
      total: calcs.total,
    }));
  };

  // Modificar línea de producto
  const handleUpdateLine = (id: string, field: keyof ManualLineItem, value: any) => {
    const updated = draft.lineas.map((line) => {
      if (line.id !== id) return line;
      const updatedLine = { ...line, [field]: value };
      const cant = Number(field === 'cantidad' ? value : updatedLine.cantidad) || 0;
      const precio = Number(field === 'precioUnitario' ? value : updatedLine.precioUnitario) || 0;
      const desc = Number(field === 'descuentoPorcentaje' ? value : updatedLine.descuentoPorcentaje) || 0;
      updatedLine.importeLinea = Math.round(cant * precio * (1 - desc / 100) * 100) / 100;
      return updatedLine;
    });

    const calcs = recalculateTotals(updated, draft.impuestos);
    setDraft((prev) => ({
      ...prev,
      lineas: updated,
      impuestos: calcs.updatedTaxes,
      baseImponible: calcs.baseImponible,
      totalImpuestos: calcs.totalImpuestos,
      total: calcs.total,
    }));
  };

  // Eliminar línea
  const handleRemoveLine = (id: string) => {
    const filtered = draft.lineas.filter((l) => l.id !== id);
    const calcs = recalculateTotals(filtered, draft.impuestos);
    setDraft((prev) => ({
      ...prev,
      lineas: filtered,
      impuestos: calcs.updatedTaxes,
      baseImponible: calcs.baseImponible,
      totalImpuestos: calcs.totalImpuestos,
      total: calcs.total,
    }));
  };

  // Cambiar porcentaje de IVA
  const handleIvaChange = (nuevoPorcentaje: number) => {
    const defaultCta = draft.tipoDocumento.includes('EMITIDA') ? '477000' : '472000';
    const updatedTaxes: ManualTaxItem[] = [
      {
        id: 'tax-1',
        tipo: 'IVA',
        porcentaje: nuevoPorcentaje,
        base: draft.baseImponible,
        cuota: Math.round(((draft.baseImponible * nuevoPorcentaje) / 100) * 100) / 100,
        cuentaContable: draft.impuestos[0]?.cuentaContable || defaultCta,
      },
    ];
    const totalTax = updatedTaxes.reduce((acc, t) => acc + t.cuota, 0);
    setDraft((prev) => ({
      ...prev,
      impuestos: updatedTaxes,
      totalImpuestos: totalTax,
      total: Math.round((prev.baseImponible + totalTax) * 100) / 100,
    }));
  };

  // Intercambiar Emisor y Receptor
  const handleSwapEntities = () => {
    setDraft((prev) => ({
      ...prev,
      emisor: prev.receptor,
      receptor: prev.emisor,
      tipoDocumento: prev.tipoDocumento.includes('RECIBIDA')
        ? 'FACTURA EMITIDA'
        : 'FACTURA RECIBIDA',
    }));
  };

  // Guardar documento final
  const handleSaveDocument = async () => {
    if (!companyId) {
      toast({
        title: 'Error',
        description: 'Debes seleccionar una empresa destino.',
        variant: 'destructive',
      });
      return;
    }

    if (!draft.emisor.nombre && !draft.receptor.nombre) {
      toast({
        title: 'Faltan datos',
        description: 'Por favor indica al menos el nombre del proveedor o emisor.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      let archivoPayload = null;
      if (attachedFile) {
        try {
          const b64 = await fileToBase64(attachedFile);
          archivoPayload = {
            nombre: attachedFile.name,
            base64: b64,
            tipo: attachedFile.name.split('.').pop()?.toLowerCase() || 'pdf',
            mimeType: attachedFile.type || 'application/pdf',
          };
        } catch (fErr) {
          console.error('Error procesando archivo adjunto:', fErr);
        }
      }

      const res = await fetch('/api/documents/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: companyId,
          tipoDocumento: draft.tipoDocumento,
          numeroDocumento: draft.numeroDocumento,
          fechaEmision: draft.fechaEmision,
          fechaVencimiento: draft.fechaVencimiento || null,
          formaPago: draft.formaPago,
          moneda: draft.moneda,
          emisor: draft.emisor,
          receptor: draft.receptor,
          lineas: draft.lineas,
          impuestos: draft.impuestos,
          totales: {
            baseImponible: draft.baseImponible,
            totalImpuestos: draft.totalImpuestos,
            total: draft.total,
          },
          archivo: archivoPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo guardar el documento');
      }

      toast({
        title: '✅ Documento Guardado',
        description: `Se creó la factura #${data.documentId} e integró en la contabilidad.`,
      });

      window.dispatchEvent(new Event('documentUploaded'));
      onDocumentCreated?.(data.documentId);
      onClose();
    } catch (err: any) {
      toast({
        title: 'Error al guardar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDraft = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDraft({
      ...INITIAL_DRAFT,
      receptor: {
        ...INITIAL_DRAFT.receptor,
        nombre: companyName || '',
        cif: companyCif || '',
      },
    });
    setChatMessages([
      {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Borrador reiniciado. ¿Qué factura o gasto querés cargar ahora?',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[96vw] xl:max-w-7xl h-[92vh] p-0 flex flex-col gap-0 overflow-hidden bg-background border-border shadow-2xl">
        {/* Header Superior */}
        <DialogHeader className="px-6 py-3.5 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                Carga Asistida de Documento
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/30 bg-primary/5">
                  Copiloto IA
                </Badge>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Completá los campos dictándole al chat o editando la plantilla interactiva
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mr-8">
            <Badge variant="secondary" className="text-xs px-2.5 py-1 flex items-center gap-1.5 bg-muted/80 border border-border/50">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium max-w-[150px] truncate">{companyName || 'Empresa'}</span>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetDraft}
              className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Limpiar
            </Button>
          </div>
        </DialogHeader>

        {/* Cuerpo Principal Dividido (Split Layout) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Panel Izquierdo: Copiloto IA (5 columnas en LG) */}
          <div className="lg:col-span-5 border-r border-border/60 flex flex-col min-h-0 bg-muted/5">
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Bot className="w-4 h-4 text-primary" />
                Asistente Conversacional
              </div>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse" />
                Sincronización en vivo
              </span>
            </div>

            {/* Mensajes del Chat */}
            <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3.5">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2.5 max-w-[90%]',
                    msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                    )}
                  >
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div
                    className={cn(
                      'px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-none font-medium'
                        : 'bg-card border border-border/70 text-foreground rounded-tl-none'
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isAiLoading && (
                <div className="flex gap-2.5 mr-auto max-w-[85%] items-center">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 border border-primary/30">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="px-3.5 py-2 rounded-2xl bg-card border border-border/70 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Analizando y actualizando el borrador...
                  </div>
                </div>
              )}
            </div>

            {/* Sugerencias Rápidas */}
            <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t border-border/40 bg-background/50">
              <button
                type="button"
                onClick={() => handleSendMessage('Es una factura de gasto común con 21% de IVA')}
                className="text-[10px] px-2.5 py-1 rounded-full bg-muted/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 border border-border/50 text-muted-foreground transition-all"
              >
                + Factura de gasto (21%)
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Es un ticket de caja simplificado de comida')}
                className="text-[10px] px-2.5 py-1 rounded-full bg-muted/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 border border-border/50 text-muted-foreground transition-all"
              >
                + Ticket simplificado
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Es una factura emitida por nosotros a un cliente')}
                className="text-[10px] px-2.5 py-1 rounded-full bg-muted/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 border border-border/50 text-muted-foreground transition-all"
              >
                + Factura emitida
              </button>
            </div>

            {/* Caja de Entrada de Chat */}
            <div className="p-3 border-t border-border/60 bg-background">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ej: Gasas 50€, proveedor Farmacia Central CIF B123..."
                  className="h-9 text-xs sm:text-sm bg-muted/30 focus-visible:ring-primary border-border/70"
                  disabled={isAiLoading}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isAiLoading || !inputMessage.trim()}
                  className="h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-sm shadow-primary/20"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </div>

          {/* Panel Derecho: Vista Individual en Vivo / Editable (7 columnas en LG) */}
          <div className="lg:col-span-7 flex flex-col min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-background">
            {/* Barra de Adjunto Físico (PDF / Foto) Opcional */}
            <div className="px-4 py-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 border border-primary/20">
                  <Paperclip className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    {attachedFile ? attachedFile.name : 'Adjuntar archivo de respaldo (opcional)'}
                    {attachedFile && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/10">
                        Listo para vincular
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {attachedFile
                      ? `${(attachedFile.size / 1024).toFixed(1)} KB — Se guardará como archivo original y se previsualizará en la plataforma`
                      : 'Podés adjuntar el PDF original o una foto para previsualizarlo junto a los datos'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setAttachedFile(f);
                  }}
                  accept="application/pdf,image/*"
                  className="hidden"
                />
                {attachedFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAttachedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Quitar archivo
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Adjuntar PDF / Foto
                  </Button>
                )}
              </div>
            </div>

            {/* Fila 1: Cabecera Documental */}
            <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  Datos del Documento
                </span>
                <Select
                  value={draft.tipoDocumento}
                  onValueChange={(val) => setDraft((p) => ({ ...p, tipoDocumento: val }))}
                >
                  <SelectTrigger className="h-7 text-xs w-48 font-medium focus:ring-primary border-border/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FACTURA RECIBIDA">Factura Recibida (Gasto)</SelectItem>
                    <SelectItem value="FACTURA EMITIDA">Factura Emitida (Venta)</SelectItem>
                    <SelectItem value="TICKET">Ticket / Simplificada</SelectItem>
                    <SelectItem value="GASTO">Gasto Directo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Número de Factura</Label>
                  <Input
                    value={draft.numeroDocumento}
                    onChange={(e) => setDraft((p) => ({ ...p, numeroDocumento: e.target.value }))}
                    placeholder="Ej: F-2026/001"
                    className="h-8 text-xs font-mono bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Fecha Emisión *</Label>
                  <Input
                    type="date"
                    value={draft.fechaEmision}
                    onChange={(e) => setDraft((p) => ({ ...p, fechaEmision: e.target.value }))}
                    className="h-8 text-xs bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Fecha Vencimiento</Label>
                  <Input
                    type="date"
                    value={draft.fechaVencimiento}
                    onChange={(e) => setDraft((p) => ({ ...p, fechaVencimiento: e.target.value }))}
                    className="h-8 text-xs bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Forma de Pago</Label>
                  <Input
                    value={draft.formaPago}
                    onChange={(e) => setDraft((p) => ({ ...p, formaPago: e.target.value }))}
                    placeholder="Transferencia, etc."
                    className="h-8 text-xs bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                </div>
              </div>
            </div>

            {/* Fila 2: Emisor & Receptor con Botón Swap y Diseño Limpio */}
            <div className="grid grid-cols-1 sm:grid-cols-11 gap-3 items-center">
              {/* Emisor / Proveedor (5 cols) */}
              <div className="sm:col-span-5 p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    {draft.tipoDocumento.includes('EMITIDA') ? 'Emisor (Nosotros)' : 'Proveedor / Emisor'}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                    Emisor
                  </Badge>
                </div>
                <Input
                  value={draft.emisor.nombre}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, emisor: { ...p.emisor, nombre: e.target.value } }))
                  }
                  placeholder="Nombre o Razón Social"
                  className="h-8 text-xs font-medium bg-background/80 focus-visible:ring-primary border-border/70"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={draft.emisor.cif}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, emisor: { ...p.emisor, cif: e.target.value } }))
                    }
                    placeholder="CIF / NIF"
                    className="h-7 text-xs font-mono uppercase bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                  <Input
                    value={draft.emisor.cuentaContable || ''}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        emisor: { ...p.emisor, cuentaContable: e.target.value },
                      }))
                    }
                    placeholder="Cta contable (400000)"
                    className="h-7 text-xs font-mono bg-background/80 focus-visible:ring-primary border-border/70"
                    title="Cuenta contable de proveedor (ej: 400000)"
                  />
                </div>
                <Input
                  value={draft.emisor.direccion}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, emisor: { ...p.emisor, direccion: e.target.value } }))
                  }
                  placeholder="Dirección fiscal / Ciudad"
                  className="h-7 text-xs bg-background/80 focus-visible:ring-primary border-border/70"
                />
              </div>

              {/* Botón Intercambiar Roles (1 col) */}
              <div className="sm:col-span-1 flex justify-center py-1 sm:py-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleSwapEntities}
                  title="Intercambiar emisor y receptor"
                  className="h-7 w-7 rounded-full border border-border/80 hover:border-primary/40 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Receptor / Cliente (5 cols) */}
              <div className="sm:col-span-5 p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                    {draft.tipoDocumento.includes('EMITIDA') ? 'Cliente (Receptor)' : 'Receptor (Nuestra Empresa)'}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                    Receptor
                  </Badge>
                </div>
                <Input
                  value={draft.receptor.nombre}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, receptor: { ...p.receptor, nombre: e.target.value } }))
                  }
                  placeholder="Nombre del Cliente / Empresa"
                  className="h-8 text-xs font-medium bg-background/80 focus-visible:ring-primary border-border/70"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={draft.receptor.cif}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, receptor: { ...p.receptor, cif: e.target.value } }))
                    }
                    placeholder="CIF / NIF"
                    className="h-7 text-xs font-mono uppercase bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                  <Input
                    value={draft.receptor.cuentaContable || ''}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        receptor: { ...p.receptor, cuentaContable: e.target.value },
                      }))
                    }
                    placeholder="Cta contable (430000)"
                    className="h-7 text-xs font-mono bg-background/80 focus-visible:ring-primary border-border/70"
                    title="Cuenta contable de cliente (ej: 430000)"
                  />
                </div>
                <Input
                  value={draft.receptor.direccion}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, receptor: { ...p.receptor, direccion: e.target.value } }))
                  }
                  placeholder="Dirección fiscal / Ciudad"
                  className="h-7 text-xs bg-background/80 focus-visible:ring-primary border-border/70"
                />
              </div>
            </div>

            {/* Fila 3: Tabla Interactiva de Líneas de Detalle */}
            <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-primary" />
                  Líneas de Detalle ({draft.lineas.length})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddLine}
                  className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir Línea
                </Button>
              </div>

              {draft.lineas.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg border-primary/20 bg-primary/5 text-xs text-muted-foreground">
                  Aún no hay líneas de producto. Podés dictárselas al copiloto o hacer clic en{' '}
                  <strong className="text-foreground">Añadir Línea</strong>.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[580px] space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wider">
                      <span className="col-span-2">Código / SKU</span>
                      <span className="col-span-4">Descripción</span>
                      <span className="col-span-2">Cta Contable</span>
                      <span className="col-span-1 text-right">Cant.</span>
                      <span className="col-span-1 text-right">P. Unit</span>
                      <span className="col-span-1 text-right">Subtotal</span>
                      <span className="col-span-1 text-center"></span>
                    </div>

                    {draft.lineas.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-12 gap-2 items-center bg-background/80 p-1.5 rounded-lg border border-border/50 hover:border-primary/30 transition-all"
                      >
                        <div className="col-span-2">
                          <Input
                            value={line.codigo || ''}
                            onChange={(e) => handleUpdateLine(line.id, 'codigo', e.target.value)}
                            placeholder="SKU / Cód"
                            className="h-7 text-xs font-mono bg-background focus-visible:ring-primary border-border/60"
                          />
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={line.descripcion}
                            onChange={(e) => handleUpdateLine(line.id, 'descripcion', e.target.value)}
                            placeholder="Descripción detallada"
                            className="h-7 text-xs font-medium bg-background focus-visible:ring-primary border-border/60"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={line.cuentaContable || ''}
                            onChange={(e) => handleUpdateLine(line.id, 'cuentaContable', e.target.value)}
                            placeholder="Cta (ej: 600000)"
                            className="h-7 text-xs font-mono bg-background focus-visible:ring-primary border-border/60"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="number"
                            step="any"
                            value={line.cantidad || ''}
                            onChange={(e) => handleUpdateLine(line.id, 'cantidad', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right font-mono px-1 bg-background focus-visible:ring-primary border-border/60"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.precioUnitario || ''}
                            onChange={(e) =>
                              handleUpdateLine(line.id, 'precioUnitario', parseFloat(e.target.value) || 0)
                            }
                            className="h-7 text-xs text-right font-mono px-1 bg-background focus-visible:ring-primary border-border/60"
                          />
                        </div>
                        <div className="col-span-1 text-right font-mono text-xs font-semibold pr-1 truncate text-foreground">
                          {line.importeLinea.toFixed(2)} €
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLine(line.id)}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fila 4: Impuestos y Totales */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
              {/* Selector de IVA y Cuenta Contable */}
              <div className="sm:col-span-6 p-4 rounded-xl border border-border/70 bg-card/40 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Tipo de Impuesto Aplicable
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[21, 10, 4, 0].map((pct) => {
                    const isSelected = draft.impuestos[0]?.porcentaje === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleIvaChange(pct)}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-semibold border transition-all',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20'
                            : 'bg-background/80 border-border/70 hover:bg-primary/5 hover:text-foreground text-muted-foreground'
                        )}
                      >
                        IVA {pct}%
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Cuenta IVA:</Label>
                  <Input
                    value={draft.impuestos[0]?.cuentaContable || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((p) => ({
                        ...p,
                        impuestos: p.impuestos.map((imp, idx) =>
                          idx === 0 ? { ...imp, cuentaContable: val } : imp
                        ),
                      }));
                    }}
                    placeholder="472000"
                    className="h-7 w-28 text-xs font-mono bg-background/80 focus-visible:ring-primary border-border/70"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {draft.tipoDocumento.includes('EMITIDA') ? '(Repercutido - 477)' : '(Soportado - 472)'}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  El sistema calcula automáticamente la cuota sobre la base imponible acumulada.
                </p>
              </div>

              {/* Resumen Financiero Consolidado */}
              <div className="sm:col-span-6 p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Base Imponible:</span>
                  <span className="font-mono font-medium text-foreground">{draft.baseImponible.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Cuota IVA ({draft.impuestos[0]?.porcentaje || 0}%):</span>
                  <span className="font-mono font-medium text-foreground">{draft.totalImpuestos.toFixed(2)} €</span>
                </div>
                <div className="pt-2 border-t border-border/60 flex justify-between items-baseline">
                  <span className="text-sm font-bold">Importe Total:</span>
                  <span className="text-xl font-mono font-bold text-primary">
                    {draft.total.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Inferior */}
        <div className="px-6 py-3 border-t border-border/70 bg-muted/20 flex flex-wrap items-center justify-between gap-3 z-10">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary inline-block animate-pulse" />
            <span>Borrador editable en tiempo real. Hacé clic en Guardar cuando esté listo.</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 mr-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving} className="h-9 hover:bg-muted">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDocument}
              disabled={isSaving}
              className="h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-md shadow-primary/20 font-semibold cursor-pointer shrink-0"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando en BD...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Guardar e Integrar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
