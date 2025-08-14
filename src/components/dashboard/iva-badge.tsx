
'use client';

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { IvaDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
  }).format(amount);
};

const getVatColorClass = (percentage: number) => {
    switch (percentage) {
        case 21:
            return 'bg-vat-21';
        case 10:
            return 'bg-vat-10';
        case 4:
            return 'bg-vat-4';
        default:
            return 'bg-vat-other';
    }
}

export function IvaBadge({ iva }: { iva: IvaDetail }) {
  return (
      <Tooltip>
        <TooltipTrigger asChild>
           <Badge className={cn("text-white", getVatColorClass(iva.porcentaje))}>
             {iva.porcentaje}%
           </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-semibold">{`${iva.tipo_impuesto} (${iva.porcentaje}%)`}</p>
            <p>Base: {formatCurrency(iva.base_imponible)}</p>
            <p>Cuota: {formatCurrency(iva.cuota)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
  );
}
