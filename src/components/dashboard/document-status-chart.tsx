
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { FileText } from 'lucide-react';

type ChartData = {
  name: string;
  value: number;
};

export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  const totalDocuments = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Documentos</CardTitle>
        <CardDescription>
          Cantidad de cada tipo de documento. Tienes un total de {totalDocuments} documentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.length > 0 ? (
            data
              .sort((a, b) => b.value - a.value)
              .map(({ name, value }) => (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <div className="flex items-center gap-2">
                       <FileText className="h-4 w-4 text-muted-foreground" />
                       <span>{name}</span>
                    </div>
                    <span className="font-bold">{value}</span>
                  </div>
                  <Progress value={(value / totalDocuments) * 100} />
                </div>
              ))
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No hay datos de documentos para mostrar.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
