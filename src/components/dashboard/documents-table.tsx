'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, CheckCircle, AlertCircle, Sparkles, FileWarning } from 'lucide-react';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { useToast } from "@/hooks/use-toast"
import { format } from 'date-fns';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const typeIcons: { [key in Document['tipo_documento']]: React.ReactNode } = {
  Factura: <FileText className="h-4 w-4 text-blue-400" />,
  Informe: <FileText className="h-4 w-4 text-green-400" />,
  Contrato: <FileText className="h-4 w-4 text-purple-400" />,
  Otro: <FileText className="h-4 w-4 text-gray-400" />,
};

const typeColors: { [key in Document['tipo_documento']]: string } = {
    Factura: "border-transparent bg-blue-900/50 text-blue-300 hover:bg-blue-900/80",
    Informe: "border-transparent bg-green-900/50 text-green-300 hover:bg-green-900/80",
    Contrato: "border-transparent bg-purple-900/50 text-purple-300 hover:bg-purple-900/80",
    Otro: "border-transparent bg-gray-700/50 text-gray-300 hover:bg-gray-700/80",
};


export function DocumentsTable({ documents }: { documents: Document[] }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const { toast } = useToast();

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };

  const handleValidateClick = (doc: Document) => {
    toast({
        title: "Document Validated",
        description: `Document "${doc.nombre_archivo}" has been marked as validated.`,
    });
    // In a real app, you would also update the document's state here.
  };

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id_documento}>
                  <TableCell className="font-medium">{doc.nombre_archivo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("gap-1", typeColors[doc.tipo_documento])}>
                        {typeIcons[doc.tipo_documento]}
                        {doc.tipo_documento}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(doc.fecha_subida), 'PPP')}</TableCell>
                  <TableCell>
                    {doc.incidencia ? (
                      <Badge variant="destructive" className="gap-1.5 pl-1.5">
                        <FileWarning className="h-3.5 w-3.5" />
                        Incidence
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="border-transparent gap-1.5 pl-1.5 text-green-400 bg-green-900/50 hover:bg-green-900/80">
                        <CheckCircle className="h-3.5 w-3.5" />
                        OK
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">More actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleSummarizeClick(doc)}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Summarize
                        </DropdownMenuItem>
                        {doc.incidencia && (
                          <DropdownMenuItem onSelect={() => handleValidateClick(doc)}>
                            <AlertCircle className="mr-2 h-4 w-4" />
                            Validate Incidence
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </>
  );
}
