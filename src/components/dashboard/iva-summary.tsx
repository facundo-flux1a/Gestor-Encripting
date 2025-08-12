'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type QuarterlyData = {
  [key: number]: {
    sales: number;
    expenses: number;
    ivaRepercutido: number;
    ivaSoportado: number;
  };
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export function IvaSummary({ data }: { data: QuarterlyData }) {
  const quarters = [1, 2, 3, 4];

  const totals = {
    repercutido: quarters.reduce((acc, q) => acc + data[q].ivaRepercutido, 0),
    soportado: quarters.reduce((acc, q) => acc + data[q].ivaSoportado, 0),
    totalIva: quarters.reduce((acc, q) => acc + (data[q].ivaRepercutido - data[q].ivaSoportado), 0),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de IVA</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              {quarters.map(q => (
                <TableHead key={q} className="text-right">
                  T{q}
                </TableHead>
              ))}
              <TableHead className="text-right font-bold">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">IVA Repercutido</TableCell>
              {quarters.map(q => (
                <TableCell key={q} className="text-right">
                  {formatCurrency(data[q].ivaRepercutido)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold">{formatCurrency(totals.repercutido)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">IVA Soportado</TableCell>
              {quarters.map(q => (
                <TableCell key={q} className="text-right">
                  {formatCurrency(data[q].ivaSoportado)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold">{formatCurrency(totals.soportado)}</TableCell>
            </TableRow>
             <TableRow className="bg-muted/50">
              <TableCell className="font-bold">Total IVA</TableCell>
               {quarters.map(q => (
                <TableCell key={q} className="text-right font-bold">
                  {formatCurrency(data[q].ivaRepercutido - data[q].ivaSoportado)}
                </TableCell>
              ))}
              <TableCell className="text-right font-extrabold">{formatCurrency(totals.totalIva)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
