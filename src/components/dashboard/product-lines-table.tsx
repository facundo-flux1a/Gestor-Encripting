import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Folder, TrendingUp, TrendingDown, Eye, Brain, Trash2, CheckCircle2, Loader2, Sparkles, X, Edit2, Check, Ban } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { DocumentLine } from "@/lib/types";
import { normalizeProductDescription, cn } from '@/lib/utils';
import { AIPredictionModal } from './ai-prediction-modal';

const PGC_GLOSSARY: Record<string, string> = {
    '600': 'Compras de mercaderías (Bienes para revender)',
    '601': 'Materia prima y otros aprovisionamientos',
    '602': 'Otros aprovisionamientos (Consumibles)',
    '607': 'Trabajos realizados por otras empresas',
    '621': 'Arrendamientos y cánones',
    '622': 'Reparaciones y conservación',
    '623': 'Servicios de profesionales (Gestores, etc.)',
    '624': 'Transportes y fletes',
    '625': 'Primas de seguros',
    '626': 'Servicios bancarios y similares',
    '627': 'Publicidad, propaganda y RR.PP.',
    '628': 'Suministros (Agua, Gas, Luz, Teléfono)',
    '629': 'Otros servicios (Gastos menores diversos)',
    '700': 'Ventas de mercaderías',
    '705': 'Prestación de servicios'
};

interface ProductLinesTableProps {
    lines: DocumentLine[];
    providerFiscalId: string;
    onClassificationUpdate?: () => void;
    onAccountUpdate?: (data: { description: string, normalizedDescription: string, code?: string, account: string }) => Promise<void>;
    selectedGroupKeys?: string[];
    onSelectionChange?: (keys: string[]) => void;
    aiSuggestions?: Record<string, { account: string; justification: string }>;
    currentEmpresaId?: number;
    isClient?: boolean;
    highlightKey?: string;
}

interface ProductLineGroupProps {
    group: DocumentLine[];
    providerFiscalId: string;
    isSelected: boolean;
    onToggleSelect: () => void;
    aiSuggestion?: { account: string; justification: string };
    onClassificationUpdate?: () => void;
    onAccountUpdate?: (data: { description: string, normalizedDescription: string, code?: string, account: string }) => Promise<void>;
    currentEmpresaId?: number;
    isClient?: boolean;
    isHighlighted?: boolean;
}

function ProductLineGroup({
    group,
    providerFiscalId,
    isSelected,
    onToggleSelect,
    aiSuggestion,
    onClassificationUpdate,
    onAccountUpdate,
    currentEmpresaId,
    isClient = false,
    isHighlighted = false,
}: ProductLineGroupProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(isHighlighted);
    const rowRef = React.useRef<HTMLTableRowElement>(null);

    React.useEffect(() => {
        if (isHighlighted && rowRef.current) {
            rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isHighlighted]);
    const [isClearing, setIsClearing] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [manualAccount, setManualAccount] = useState('');
    const [isSavingManual, setIsSavingManual] = useState(false);

    const isAbonoLine = (item: DocumentLine) => {
        const imp = Number(item.importe_linea) || 0;
        const qty = Number(item.cantidad) || 0;
        return imp < 0 || qty < 0;
    };

    const sortedGroup = [...group].sort((a, b) => {
        // Usar getTime() en vez de localeCompare para manejar correctamente
        // tanto Date objects (devueltos por MySQL) como strings ISO
        const da = a.fecha_emision ? new Date(a.fecha_emision).getTime() : 0;
        const db = b.fecha_emision ? new Date(b.fecha_emision).getTime() : 0;
        return db - da; // descendente: el más reciente primero
    });

    const comprasGroup = sortedGroup.filter(item => !isAbonoLine(item));
    const devolucionesGroup = sortedGroup.filter(item => isAbonoLine(item));

    const line = comprasGroup.length > 0 ? comprasGroup[0] : sortedGroup[0];
    const totalQty = group.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    const totalLineAmount = group.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);
    const numberOfPurchases = comprasGroup.length;
    const numberOfDevoluciones = devolucionesGroup.length;
    const devolucionesTotalAmount = devolucionesGroup.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);

    const comprasQty = comprasGroup.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    const comprasAmount = comprasGroup.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);
    const avgUnitPrice = comprasQty > 0 ? comprasAmount / comprasQty : (totalQty !== 0 ? totalLineAmount / totalQty : 0);

    let priceVariationVsAvg = 0;
    let priceVariationVsPrev: number | null = null;
    const isPriceVariation = comprasGroup.length > 1;

    if (isPriceVariation) {
        const newestPrice = Number(comprasGroup[0].precio_unitario) || 0;
        const prevPrice = Number(comprasGroup[1].precio_unitario) || 0;

        // Variación vs el precio inmediatamente anterior (solo entre facturas ordinarias de compra)
        if (prevPrice > 0) {
            priceVariationVsPrev = ((newestPrice - prevPrice) / prevPrice) * 100;
        }

        // Variación vs el promedio histórico (excluyendo la última compra)
        const historicalPrices = comprasGroup
            .slice(1)
            .map(item => Number(item.precio_unitario))
            .filter(price => !isNaN(price) && price > 0);

        const avgPrice = historicalPrices.length > 0
            ? historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length
            : 0;

        if (avgPrice > 0) {
            priceVariationVsAvg = ((newestPrice - avgPrice) / avgPrice) * 100;
        }
    }

    const normDesc = normalizeProductDescription(line.descripcion || '');
    const identifier = line.codigo
        ? `${encodeURIComponent(line.codigo)}?desc=${encodeURIComponent(normDesc)}`
        : `DESC_${encodeURIComponent(normDesc)}`;
    const productUrl = `/proveedores/${encodeURIComponent(providerFiscalId)}/${identifier}${identifier.includes('?') ? '&' : '?'}view=list${isClient ? '&type=cliente' : ''}`;

    const ViewDetailButton = () => (
        <Link href={productUrl} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                <Eye className="h-4 w-4" />
            </Button>
        </Link>
    );

    const handleClearAccount = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isClearing) return;

        setIsClearing(true);
        try {
            const empresaId = line.id_de_empresa || group?.[0]?.id_de_empresa || currentEmpresaId;
            if (!empresaId) {
                console.warn('⚠️ No empresaId found for clearing, aborting with error to UI', {
                    lineEmpresaId: line.id_de_empresa,
                    groupEmpresaId: group?.[0]?.id_de_empresa,
                    currentEmpresaId
                });
                throw new Error('No se pudo identificar la empresa asociada a este producto. Por favor, selecciona una empresa en el filtro superior.');
            }

            const response = await fetch('/api/productos-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'clear_accounts',
                    empresaId,
                    items: [{
                        description: line.descripcion,
                        normalizedDescription: normDesc,
                        code: line.codigo,
                        proveedor_cif: providerFiscalId
                    }]
                }),
            });

            if (response.ok) {
                toast({
                    title: "Cuenta eliminada",
                    description: "Se ha reseteado la clasificación para este producto.",
                });
                if (onClassificationUpdate) onClassificationUpdate();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al limpiar cuenta');
            }
        } catch (error: any) {
            console.error('Error al limpiar cuenta:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "No se pudo eliminar la clasificación.",
            });
        } finally {
            setIsClearing(false);
        }
    };

    const handleStartEditing = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setManualAccount(cuentaActual || '');
        setIsEditing(true);
    };

    const handleCancelEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(false);
    };

    const handleSaveManual = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!manualAccount || manualAccount.length < 3) return;
        setIsSavingManual(true);
        try {
            if (onAccountUpdate) {
                await onAccountUpdate({
                    description: line.descripcion || '',
                    normalizedDescription: normDesc,
                    code: line.codigo || undefined,
                    account: manualAccount
                });
            }
            setIsEditing(false);
            if (onClassificationUpdate) onClassificationUpdate();
        } catch (error) {
            console.error('Error saving manual account:', error);
        } finally {
            setIsSavingManual(false);
        }
    };

    const handleAcceptSuggestion = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!aiSuggestion?.account) return;
        setIsSavingManual(true);
        try {
            if (onAccountUpdate) {
                await onAccountUpdate({
                    description: line.descripcion || '',
                    normalizedDescription: normDesc,
                    code: line.codigo || undefined,
                    account: aiSuggestion.account
                });
            }
            if (onClassificationUpdate) onClassificationUpdate();
        } catch (error) {
            console.error('Error accepting suggestion:', error);
        } finally {
            setIsSavingManual(false);
        }
    };

    const cuentaActual = aiSuggestion?.account || line.cuenta_contable;
    const isAi = !!aiSuggestion;

    const COMMON_ACCOUNTS = [
        { code: '600', label: 'Mercaderías' },
        { code: '629', label: 'Gtos. Grales' },
        { code: '623', label: 'Prof. Indep.' },
        { code: '700', label: 'Ventas' },
    ];

    const AccountCell = () => (
        <div className="flex flex-col items-center justify-center gap-1">
            {isEditing ? (
                <div className="flex flex-col gap-2 p-2 bg-muted/30 rounded-lg border border-primary/20" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                        <Input
                            className="h-8 w-24 font-mono text-sm bg-background"
                            value={manualAccount}
                            onChange={(e) => setManualAccount(e.target.value)}
                            autoFocus
                            placeholder="600..."
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={handleSaveManual} disabled={isSavingManual}>
                            {isSavingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-50" onClick={handleCancelEditing}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-center max-w-[140px]">
                        {COMMON_ACCOUNTS.map(acc => (
                            <TooltipProvider key={acc.code}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-colors border border-primary/10"
                                            onClick={() => setManualAccount(acc.code)}
                                        >
                                            {acc.code}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>{PGC_GLOSSARY[acc.code] || acc.label}</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {cuentaActual ? (
                        <div className="flex items-center justify-center gap-1">
                            {isAi && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900 hover:bg-amber-500/20 px-2 rounded-lg"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsReviewModalOpen(true);
                                                }}
                                            >
                                                <Brain className="h-3.5 w-3.5" />
                                                <span className="font-mono text-xs font-bold">{cuentaActual}</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Revisar sugerencia I.A.</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}

                            {!isAi && (
                                <span className="font-mono text-sm text-foreground">
                                    {cuentaActual}
                                </span>
                            )}

                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={handleStartEditing}>
                                <Edit2 className="h-3 w-3" />
                            </Button>

                            {!isAi && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                        disabled={isClearing}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar clasificación contable?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción borrará la cuenta contable de este grupo de productos y eliminará la regla automática asociada.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleClearAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            Confirmar eliminación
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Limpiar clasificación contable</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                    ) : (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground italic h-8" onClick={handleStartEditing}>
                            No asignada
                        </Button>
                    )}
                </>
            )}
        </div>
    );

    const ModalSection = () => (
        <AIPredictionModal
            isOpen={isReviewModalOpen}
            onClose={() => setIsReviewModalOpen(false)}
            onConfirm={() => handleAcceptSuggestion()}
            onEdit={() => {
                setIsReviewModalOpen(false);
                handleStartEditing({ stopPropagation: () => { } } as any);
            }}
            isSaving={isSavingManual}
            prediction={{
                description: line.descripcion || '',
                account: aiSuggestion?.account || '',
                justification: aiSuggestion?.justification || '',
                code: line.codigo || undefined
            }}
        />
    );

    if (group.length === 1) {
        const isSingleAbono = isAbonoLine(line);
        return (
            <TableRow className="hover:bg-muted/50 transition-colors group/row">
                <ModalSection />
                <TableCell className="w-[40px]">
                    <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect()} onClick={(e) => e.stopPropagation()} className="h-5 w-5 border-2 transition-transform duration-200 hover:scale-125 data-[state=checked]:bg-primary" />
                </TableCell>
                <TableCell className="max-w-[400px]" title={line.descripcion || ''}>
                    {line.fecha_emision && <span className="text-[10px] text-muted-foreground block mb-0.5">({formatDate(line.fecha_emision)})</span>}
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">{line.descripcion || '-'}</span>
                        {isSingleAbono && (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                Devolución / Abono
                            </span>
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-center w-[120px]"><AccountCell /></TableCell>
                <TableCell className="text-right tabular-nums">{Number(line.cantidad) || 0}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(line.precio_unitario)}</TableCell>
                <TableCell className={cn("text-right tabular-nums font-bold", isSingleAbono ? "text-amber-600 dark:text-amber-400" : "text-primary")}>{formatCurrency(line.importe_linea)}</TableCell>
                <TableCell className="text-center"><ViewDetailButton /></TableCell>
            </TableRow>
        );
    }

    const handleConfirmAI = async () => {
        if (!aiSuggestion || !onAccountUpdate) return;
        setIsSavingManual(true);
        try {
            await onAccountUpdate({
                description: line.descripcion || '',
                normalizedDescription: normalizeProductDescription(line.descripcion || ''),
                code: line.codigo || undefined,
                account: aiSuggestion.account
            });
            setIsReviewModalOpen(false);
        } catch (error) {
            console.error('Error confirming AI:', error);
        } finally {
            setIsSavingManual(false);
        }
    };

    return (
        <>
            <TableRow
                ref={rowRef}
                className={cn(
                    "bg-muted/5 group/row hover:bg-muted/20 cursor-pointer transition-all border-l-2 border-transparent data-[state=open]:border-primary",
                    isHighlighted && "bg-primary/5 ring-1 ring-primary/20 ring-inset"
                )}
                onClick={() => setIsOpen(!isOpen)}
                data-state={isOpen ? 'open' : 'closed'}
            >
                <TableCell className="w-[40px]">
                    <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect()} onClick={(e) => e.stopPropagation()} className="h-5 w-5 border-2 transition-transform duration-200 hover:scale-125 data-[state=checked]:bg-primary" />
                </TableCell>
                <TableCell className="max-w-[400px] font-semibold py-4" title={line.descripcion || ''}>
                    <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                            <Folder className={`w-10 h-10 ${isOpen ? 'text-primary' : 'text-muted-foreground'} fill-current opacity-40 transition-colors`} />
                            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-sm font-black px-1.5 rounded-sm min-w-[26px] h-[26px] flex items-center justify-center shadow-xl border-2 border-background">
                                {numberOfPurchases}
                            </div>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="truncate group-hover/row:text-primary transition-colors">{line.descripcion || '-'}</span>
                                {numberOfDevoluciones > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                                                    {numberOfDevoluciones} {numberOfDevoluciones === 1 ? 'devolución' : 'devoluciones'} ({formatCurrency(devolucionesTotalAmount)})
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="text-xs">Incluye {numberOfDevoluciones} abono(s) por un total de {formatCurrency(devolucionesTotalAmount)}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                            </div>
                            {line.codigo && <span className="text-[10px] text-muted-foreground font-mono opacity-60">{line.codigo}</span>}
                        </div>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" /> : <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50" />}
                    </div>
                </TableCell>
                <TableCell className="text-center w-[120px]"><AccountCell /></TableCell>
                <TableCell className="text-right tabular-nums font-bold text-base">{totalQty.toLocaleString('es-ES')}</TableCell>
                <TableCell className="text-right">
                    <div className="flex flex-col items-end justify-center gap-1">
                        <span className="tabular-nums font-semibold">{formatCurrency(avgUnitPrice)}</span>
                        {isPriceVariation && (
                            <div className="flex flex-col items-end gap-1 mt-0.5">
                                {/* Badge vs precio inmediatamente anterior */}
                                {priceVariationVsPrev !== null && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-bold cursor-help ${priceVariationVsPrev > 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : priceVariationVsPrev < 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                                    {priceVariationVsPrev > 0 ? <TrendingUp className="w-3 h-3" /> : priceVariationVsPrev < 0 ? <TrendingDown className="w-3 h-3" /> : <div className="w-3 h-0.5 bg-current rounded-full" />}
                                                    <span>{priceVariationVsPrev > 0 ? '+' : ''}{priceVariationVsPrev.toFixed(1)}%</span>
                                                    <span className="text-[9px] font-normal opacity-60">vs ant.</span>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent><p className="max-w-[200px] text-center">Variación respecto a la compra inmediatamente anterior.</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {/* Badge vs promedio histórico */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-bold cursor-help opacity-70 ${priceVariationVsAvg > 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : priceVariationVsAvg < 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                                {priceVariationVsAvg > 0 ? <TrendingUp className="w-3 h-3" /> : priceVariationVsAvg < 0 ? <TrendingDown className="w-3 h-3" /> : <div className="w-3 h-0.5 bg-current rounded-full" />}
                                                <span>{priceVariationVsAvg > 0 ? '+' : ''}{priceVariationVsAvg.toFixed(1)}%</span>
                                                <span className="text-[9px] font-normal opacity-60">vs prom.</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent><p className="max-w-[200px] text-center">Variación respecto al precio promedio histórico (excluyendo la última compra).</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-black text-primary text-lg">{formatCurrency(totalLineAmount)}</TableCell>
                <TableCell className="text-center"><ViewDetailButton /></TableCell>
            </TableRow>
            {isOpen && sortedGroup.map((child, idx) => {
                const isAbono = isAbonoLine(child);
                return (
                    <TableRow key={child.id || idx} className={cn("bg-muted/5 hover:bg-muted/10 border-l-2", isAbono ? "border-amber-500/50 bg-amber-500/5" : "border-primary/30")}>
                        <TableCell className="pl-12 text-xs py-3" colSpan={3}>
                            <div className="flex items-center gap-3">
                                <span className="text-foreground font-medium">{formatDate(child.fecha_emision)}</span>
                                <span className="text-muted-foreground opacity-30">|</span>
                                <span className="text-muted-foreground font-mono text-[10px]">{child.numero_documento || '-'}</span>
                                <span className="text-muted-foreground truncate opacity-70 italic max-w-[250px]">- {child.descripcion}</span>
                                {isAbono && (
                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-sm">
                                        Devolución / Abono
                                    </span>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-bold text-xs", isAbono ? "text-amber-600 dark:text-amber-400" : "text-foreground/80")}>{Number(child.cantidad).toLocaleString('es-ES')}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-xs text-muted-foreground">{formatCurrency(child.precio_unitario)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold text-xs", isAbono ? "text-amber-600 dark:text-amber-400" : "text-foreground/80")}>{formatCurrency(child.importe_linea)}</TableCell>
                        <TableCell />
                    </TableRow>
                );
            })}

            {isAi && aiSuggestion && (
                <AIPredictionModal
                    isOpen={isReviewModalOpen}
                    onClose={() => setIsReviewModalOpen(false)}
                    onConfirm={handleConfirmAI}
                    onEdit={() => {
                        handleStartEditing();
                        setIsReviewModalOpen(false);
                    }}
                    isSaving={isSavingManual}
                    prediction={{
                        description: line.descripcion || '',
                        account: aiSuggestion.account,
                        justification: aiSuggestion.justification,
                        code: line.codigo || undefined
                    }}
                />
            )}
        </>
    );
}

export function ProductLinesTable({
    lines,
    providerFiscalId,
    onClassificationUpdate,
    onAccountUpdate,
    selectedGroupKeys = [],
    onSelectionChange,
    aiSuggestions,
    currentEmpresaId,
    isClient = false,
    highlightKey
}: ProductLinesTableProps) {
    const totalCantidad = lines.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    const totalImporte = lines.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);

    const groupedLines = useMemo(() => {
        const map = new Map<string, DocumentLine[]>();
        lines.forEach(line => {
            const normDesc = normalizeProductDescription(line.descripcion || '');
            const key = line.codigo ? `${line.codigo}::${normDesc}` : (normDesc || 'unknown');
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(line);
        });

        return Array.from(map.values()).sort((a, b) => {
            const dateA = a.reduce((max, l) => l.fecha_emision && l.fecha_emision > max ? l.fecha_emision : max, '');
            const dateB = b.reduce((max, l) => l.fecha_emision && l.fecha_emision > max ? l.fecha_emision : max, '');
            return dateB.localeCompare(dateA);
        });
    }, [lines]);

    const handleToggleSelectAll = () => {
        if (!onSelectionChange) return;
        if (selectedGroupKeys.length === groupedLines.length) {
            onSelectionChange([]);
        } else {
            const allKeys = groupedLines.map(g => {
                const normDesc = normalizeProductDescription(g[0].descripcion || '');
                return g[0].codigo ? `${g[0].codigo}::${normDesc}` : normDesc;
            });
            onSelectionChange(allKeys);
        }
    };

    return (
        <div className="space-y-4 relative w-full">
            {lines.length > 0 && (
                <div className="flex justify-end pt-2 pb-4">
                    <div className="flex gap-6 items-end bg-primary/10 px-6 py-4 rounded-xl border-2 border-primary shadow-lg min-w-[350px] relative overflow-hidden group transition-all">
                        <div className="absolute -left-4 -bottom-4 text-primary/5 group-hover:text-primary/10 transition-colors">
                            <TrendingUp className="w-24 h-24" />
                        </div>
                        <div className="flex flex-col items-end z-10 font-bold">
                            <span className="text-[10px] uppercase tracking-wider text-primary mb-1">Total Unidades</span>
                            <span className="text-2xl font-black text-foreground">{totalCantidad.toLocaleString('es-ES')}</span>
                        </div>
                        <div className="h-10 w-px bg-primary/30 z-10"></div>
                        <div className="flex flex-col items-end z-10 w-[140px]">
                            <span className="text-[10px] uppercase tracking-wider text-primary mb-1">Importe Neto</span>
                            <span className="text-2xl font-black text-primary truncate max-w-full" title={formatCurrency(totalImporte)}>{formatCurrency(totalImporte)}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-b">
                            <TableHead className="w-[40px] py-4">
                                <Checkbox
                                    checked={selectedGroupKeys.length === groupedLines.length && groupedLines.length > 0}
                                    onCheckedChange={handleToggleSelectAll}
                                    className="h-5 w-5 border-2 transition-transform duration-200 hover:scale-125 data-[state=checked]:bg-primary"
                                />
                            </TableHead>
                            <TableHead className="py-4">Descripción / Producto</TableHead>
                            <TableHead className="text-center w-[120px]">Cuenta Contable</TableHead>
                            <TableHead className="text-right">Cantidad Total</TableHead>
                            <TableHead className="text-right">
                                Precio Unitario
                                <span className="block text-[10px] text-muted-foreground font-normal">(Promedio)</span>
                            </TableHead>
                            <TableHead className="text-right font-bold">Importe Total</TableHead>
                            <TableHead className="text-center w-[80px]">Ver</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groupedLines.map((group, idx) => {
                            const normDesc = normalizeProductDescription(group[0].descripcion || '');
                            const groupKey = group[0].codigo ? `${group[0].codigo}::${normDesc}` : (normDesc || 'unknown');
                            return (
                                <ProductLineGroup
                                    key={groupKey}
                                    group={group}
                                    providerFiscalId={providerFiscalId}
                                    isSelected={selectedGroupKeys.includes(groupKey)}
                                    onToggleSelect={() => {
                                        const newKeys = selectedGroupKeys.includes(groupKey)
                                            ? selectedGroupKeys.filter(k => k !== groupKey)
                                            : [...selectedGroupKeys, groupKey];
                                        if (onSelectionChange) onSelectionChange(newKeys);
                                    }}
                                    aiSuggestion={aiSuggestions?.[group[0].codigo || normDesc]}
                                    onClassificationUpdate={onClassificationUpdate}
                                    onAccountUpdate={onAccountUpdate}
                                    currentEmpresaId={currentEmpresaId}
                                    isClient={isClient}
                                    isHighlighted={highlightKey === groupKey}
                                />
                            );
                        })}
                        {lines.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                                    No hay artículos que coincidan con los filtros.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}