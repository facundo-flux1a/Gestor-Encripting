import { z } from 'zod';

export const IvaDetailSchema = z.object({
  tipo_impuesto: z.string(),
  porcentaje: z.coerce.number(),
  base_imponible: z.coerce.number(),
  cuota: z.coerce.number(),
});
export type IvaDetail = z.infer<typeof IvaDetailSchema>;


export const DocumentEntitySchema = z.object({
    id: z.number().optional(),
    rol: z.string(),
    nombre: z.string().nullable(),
    direccion: z.string().nullable(),
    identificador_fiscal: z.string().nullable(),
    telefono: z.string().nullable(),
    email: z.string().nullable(),
    datos_extra: z.any().nullable(),
});
export type DocumentEntity = z.infer<typeof DocumentEntitySchema>;

export const DocumentLineSchema = z.object({
    id: z.number().optional(),
    codigo: z.string().nullable(),
    descripcion: z.string().nullable(),
    cantidad: z.coerce.number(),
    unidad: z.string().nullable(),
    precio_unitario: z.coerce.number(),
    descuento_porcentaje: z.coerce.number(),
    precio_neto: z.coerce.number(),
    importe_linea: z.coerce.number(),
    datos_extra: z.any().nullable(),
});
export type DocumentLine = z.infer<typeof DocumentLineSchema>;

export const DocumentFileSchema = z.object({
    id: z.number().optional(),
    tipo_archivo: z.string().nullable(),
    nombre_archivo: z.string().nullable(),
    ruta_archivo: z.string().nullable(),
    hash_archivo: z.string().nullable(),
    fecha_subida: z.string(),
});
export type DocumentFile = z.infer<typeof DocumentFileSchema>;

export type Document = {
  id_documento: number;
  numero_factura: string;
  tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
  incidencia: boolean;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  fecha_creacion: string;
  moneda: string;
  observaciones: string | null;
  datos_extra: any | null;
  ingreso: number;
  gasto: number;
  base_imponible: number;
  iva: number;
  total: number;
  
  entidades: DocumentEntity[];
  lineas: DocumentLine[];
  iva_details: IvaDetail[];
  archivos: DocumentFile[];
  
  // Legacy fields for compatibility - will be removed later
  fecha_subida: string; 
  proveedor: string;
  cif: string;
  nombre_archivo: string;
  contenido: string;
};

export const DocumentUpdateSchema = z.object({
  numero_factura: z.string().min(1, "El número de factura es obligatorio."),
  fecha_emision: z.string().min(1, "La fecha es obligatoria."),
  proveedor: z.string().min(1, "El proveedor es obligatorio."),
  cif: z.string().min(1, "El CIF es obligatorio."),
  base_imponible: z.coerce.number(),
  iva: z.coerce.number(),
  total: z.coerce.number(),
  tipo_documento: z.enum(['Factura', 'Informe', 'Contrato', 'Otro']),
  incidencia: z.boolean(),
  fecha_vencimiento: z.string().nullable(),
  moneda: z.string().length(3, "La moneda debe tener 3 caracteres."),
  observaciones: z.string().nullable(),
  entidades: z.array(DocumentEntitySchema),
  lineas: z.array(DocumentLineSchema),
  iva_details: z.array(IvaDetailSchema),
});

export type DocumentUpdatePayload = z.infer<typeof DocumentUpdateSchema>;
