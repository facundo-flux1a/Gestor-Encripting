import { z } from 'zod';

export type IvaDetail = {
  tipo_impuesto: string;
  porcentaje: number;
  base_imponible: number;
  cuota: number;
};

export type Document = {
  id_documento: number;
  numero_factura: string;
  nombre_archivo: string;
  tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
  fecha_subida: string; // Corresponds to fecha_emision
  incidencia: boolean;
  contenido: string; // Corresponds to observaciones
  ingreso: number;
  gasto: number;
  proveedor: string;
  cif: string;
  base_imponible: number;
  iva: number;
  iva_details: IvaDetail[];
  total: number;
};

export const DocumentUpdateSchema = z.object({
  numero_factura: z.string().min(1, "El número de factura es obligatorio."),
  fecha_subida: z.string().min(1, "La fecha es obligatoria."),
  proveedor: z.string().min(1, "El proveedor es obligatorio."),
  cif: z.string().min(1, "El CIF es obligatorio."),
  base_imponible: z.number().positive("La base imponible debe ser positiva."),
  total: z.number().positive("El total debe ser positivo."),
});

export type DocumentUpdatePayload = z.infer<typeof DocumentUpdateSchema>;
