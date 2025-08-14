

import { z } from 'zod';

export const IvaDetailSchema = z.object({
  id: z.number().optional(),
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

export const ProviderWithStatsSchema = DocumentEntitySchema.extend({
    totalSpent: z.number(),
    totalDocuments: z.number(),
    uniqueProducts: z.number(),
});
export type ProviderWithStats = z.infer<typeof ProviderWithStatsSchema>;


export const DocumentLineSchema = z.object({
    id: z.number().optional(),
    documento_id: z.number().optional(),
    codigo: z.string().nullable(),
    descripcion: z.string().nullable(),
    cantidad: z.coerce.number(),
    unidad: z.string().nullable(),
    precio_unitario: z.coerce.number(),
    descuento_porcentaje: z.coerce.number(),
    precio_neto: z.coerce.number(),
    importe_linea: z.coerce.number(),
    datos_extra: z.any().nullable(),
    fecha_emision: z.string().optional(), // for product listings
    numero_documento: z.string().optional(), // for product history
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
  tipo_documento: 'Factura' | 'Nomina' | 'Contrato' | 'Alquiler' | 'Otro';
  verificado: boolean;
  incidencia: boolean; // Retained for logic but `verificado` is primary
  incidencia_razon?: string | null;
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
  

  fecha_subida: string; 
  proveedor: string;
  cif: string;
  nombre_archivo: string;
  contenido: string;
};

export const DocumentUpdateSchema = z.object({
  numero_factura: z.string().min(1, "El número de factura es obligatorio."),
  fecha_emision: z.string().min(1, "La fecha es obligatoria."),
  proveedor: z.string().min(1, "El proveedor es obligatorio.").optional(),
  cif: z.string().min(1, "El CIF es obligatorio.").optional(),
  base_imponible: z.coerce.number(),
  iva: z.coerce.number(),
  total: z.coerce.number(),
  tipo_documento: z.enum(['Factura', 'Nomina', 'Contrato', 'Alquiler', 'Otro']),
  fecha_vencimiento: z.string().nullable(),
  moneda: z.string().length(3, "La moneda debe tener 3 caracteres."),
  observaciones: z.string().nullable(),
  entidades: z.array(DocumentEntitySchema),
  lineas: z.array(DocumentLineSchema),
  iva_details: z.array(IvaDetailSchema),
});

export type DocumentUpdatePayload = z.infer<typeof DocumentUpdateSchema>;


export const IncidentAnalysisResultSchema = z.object({
  newIncidentsFound: z.number().describe('The number of new incidents created.'),
  duplicates: z.number().describe('Number of duplicate documents found.'),
  calculationErrors: z.number().describe('Number of documents with calculation errors.'),
  message: z.string().describe('A summary message of the operation.'),
});
export type IncidentAnalysisResult = z.infer<typeof IncidentAnalysisResultSchema>;

export const SessionPayloadSchema = z.object({
    userId: z.string(),
    username: z.string(),
    role: z.string(),
});
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export const UserSchema = z.object({
    id: z.number(),
    nombre: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    password: z.string(), // In a real app, this would not be here.
    activo: z.boolean(),
    fecha_creacion: z.string(),
    fecha_actualizacion: z.string(),
});
export type User = z.infer<typeof UserSchema>;
