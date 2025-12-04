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
};

export function IvaBadge({ iva }: { iva: IvaDetail }) {
  return (
      <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
               <Badge 
                 className={cn(
                     "text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5", 
                     getVatColorClass(iva.porcentaje)
                 )}
               >
                 {iva.porcentaje}%
               </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px]">
              <div className="text-xs sm:text-sm space-y-0.5">
                <p className="font-semibold">
                    {`${iva.tipo_impuesto} (${iva.porcentaje}%)`}
                </p>
                <p className="tabular-nums">Base: {formatCurrency(iva.base_imponible)}</p>
                <p className="tabular-nums">Cuota: {formatCurrency(iva.cuota)}</p>
              </div>
            </TooltipContent>
          </Tooltip>
      </TooltipProvider>
  );
}