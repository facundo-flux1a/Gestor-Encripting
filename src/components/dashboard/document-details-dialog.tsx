'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { type Document } from '@/lib/types';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
  } from '@/components/ui/table';

export function DocumentDetailsDialog({ doc, isOpen, setIsOpen }: { doc: Document | null; isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  }

  if (!doc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Detalles del Documento</DialogTitle>
          <DialogDescription>
            Vista detallada del documento: {doc.numero_factura}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell className="font-semibold">Nº Factura</TableCell>
                        <TableCell>{doc.numero_factura}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">Fecha</TableCell>
                        <TableCell>{new Date(doc.fecha_subida).toLocaleDateString('es-ES')}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">Proveedor</TableCell>
                        <TableCell>{doc.proveedor}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">CIF</TableCell>
                        <TableCell>{doc.cif}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">Tipo Documento</TableCell>
                        <TableCell>{doc.tipo_documento}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">Concepto</TableCell>
                        <TableCell>{doc.contenido}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell className="font-semibold">Base Imponible</TableCell>
                        <TableCell className="text-right">{formatCurrency(doc.base_imponible)}</TableCell>
                    </TableRow>
                    {doc.iva_details.map((iva, index) => (
                         <TableRow key={index}>
                            <TableCell className="font-semibold pl-8">{`IVA (${iva.porcentaje}%)`}</TableCell>
                            <TableCell className="text-right">{formatCurrency(iva.cuota)}</TableCell>
                        </TableRow>
                    ))}
                     <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(doc.total)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
