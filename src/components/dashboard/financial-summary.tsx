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

export function FinancialSummary({ data }: { data: QuarterlyData }) {
  const quarters = [1, 2, 3, 4];

  const totals = {
    sales: quarters.reduce((acc, q) => acc + data[q].sales, 0),
    expenses: quarters.reduce((acc, q) => acc + data[q].expenses, 0),
    benefit: quarters.reduce((acc, q) => acc + (data[q].sales - data[q].expenses), 0),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen Financiero</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              {quarters.map(q => (
                <TableHead key={q} className="text-right">
                  Trimestre {q}
                </TableHead>
              ))}
              <TableHead className="text-right font-bold">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Ventas / Ingresos</TableCell>
              {quarters.map(q => (
                <TableCell key={q} className="text-right">
                  {formatCurrency(data[q].sales)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold">{formatCurrency(totals.sales)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Gastos</TableCell>
              {quarters.map(q => (
                <TableCell key={q} className="text-right">
                  {formatCurrency(data[q].expenses)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold">{formatCurrency(totals.expenses)}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/50">
              <TableCell className="font-bold">Beneficio antes de IRPF</TableCell>
              {quarters.map(q => (
                <TableCell key={q} className="text-right font-bold">
                  {formatCurrency(data[q].sales - data[q].expenses)}
                </TableCell>
              ))}
              <TableCell className="text-right font-extrabold">{formatCurrency(totals.benefit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
