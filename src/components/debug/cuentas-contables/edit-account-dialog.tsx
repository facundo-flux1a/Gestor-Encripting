'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';
import type { AccountingAccountItem, DocumentAccountingDebug } from '@/services/cuentas-contables-debug-service';

interface EditAccountDialogProps {
  document: DocumentAccountingDebug | null;
  accountItem: AccountingAccountItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: {
    documentoId: number;
    tipo: 'tercero' | 'gasto' | 'impuesto';
    referenciaId?: number;
    cuentaContable: string;
    rememberRule: boolean;
    empresaId?: number;
    identificadorFiscal?: string;
    descripcionPatron?: string;
  }) => Promise<void>;
}

export function EditAccountDialog({
  document,
  accountItem,
  isOpen,
  onClose,
  onSave,
}: EditAccountDialogProps) {
  const [cuentaCode, setCuentaCode] = React.useState('');
  const [rememberRule, setRememberRule] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (accountItem) {
      setCuentaCode(accountItem.codigo || '');
    }
  }, [accountItem]);

  if (!document || !accountItem) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuentaCode.trim()) return;

    try {
      setSaving(true);
      await onSave({
        documentoId: document.id_documento,
        tipo: accountItem.tipo,
        referenciaId: accountItem.referencia_id,
        cuentaContable: cuentaCode.trim(),
        rememberRule: rememberRule,
        empresaId: document.empresa_id || undefined,
        identificadorFiscal: document.cif,
        descripcionPatron: accountItem.tipo === 'gasto' ? accountItem.nombre : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const getTipoLabel = () => {
    switch (accountItem.tipo) {
      case 'tercero':
        return document.is_issued ? 'Cliente (Grupo 43)' : 'Proveedor / Acreedor (Grupo 40/41)';
      case 'gasto':
        return document.is_issued ? 'Ventas / Ingresos (Grupo 70)' : 'Gastos / Compras (Grupo 60/62)';
      case 'impuesto':
        return 'Impuesto / IVA / Retención (Grupo 47)';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md bg-card text-card-foreground border-border shadow-lg">
        <form onSubmit={handleSave}>
          <DialogHeader className="border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-semibold">
                Asignar Cuenta Contable
              </DialogTitle>
              {accountItem.is_suggested ? (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                  Sugerida
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                  Confirmada
                </Badge>
              )}
            </div>
            <DialogDescription className="text-muted-foreground text-xs mt-1">
              {document.numero_documento} • {document.proveedor}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-4 text-xs">
            <div>
              <div className="text-muted-foreground font-medium mb-1">Clasificación:</div>
              <div className="text-foreground font-medium bg-muted/50 px-3 py-1.5 rounded-md border border-border">
                {getTipoLabel()}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground font-medium mb-1">Concepto / Subcuenta:</div>
              <div className="text-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border">
                {accountItem.nombre}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cuenta-input" className="text-xs text-foreground font-medium">
                Subcuenta PGC:
              </Label>
              <Input
                id="cuenta-input"
                value={cuentaCode}
                onChange={e => setCuentaCode(e.target.value)}
                placeholder="Ej. 6290000"
                className="bg-background border-border text-foreground font-mono text-sm h-9 tracking-wider focus-visible:ring-primary"
                autoFocus
              />
            </div>

            {(accountItem.tipo === 'tercero' || accountItem.tipo === 'gasto') && (
              <div className="flex items-start space-x-2 pt-2 border-t border-border">
                <Checkbox
                  id="remember-rule"
                  checked={rememberRule}
                  onCheckedChange={checked => setRememberRule(!!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="remember-rule" className="text-xs text-foreground cursor-pointer leading-snug">
                  <span className="font-medium">Recordar para futuras facturas</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {accountItem.tipo === 'tercero'
                      ? `Asociar esta subcuenta a ${document.cif}`
                      : 'Asociar esta subcuenta a este concepto'}
                  </span>
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-3 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !cuentaCode.trim()}
              className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? 'Guardando...' : 'Guardar cuenta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
