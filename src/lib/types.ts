import { z } from 'zod';

export const UserSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  email: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionPayloadSchema = z.object({
  userId: z.number(),
  email: z.string(),
  nombre: z.string(),
  expires: z.string(),
});
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export const IvaDetailSchema = z.object({
  id: z.number().optional(),
  tipo_impuesto: z.string().optional().nullable(),
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
    fecha_creacion: z.string().optional().nullable(),
});
export type DocumentEntity = z.infer<typeof DocumentEntitySchema>;

export const ProviderWithStatsSchema = DocumentEntitySchema.extend({
    totalSpent: z.coerce.number(),
    totalDocuments: z.coerce.number(),
    uniqueProducts: z.coerce.number(),
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
    fecha_creacion: z.string().optional().nullable(),
    fecha_emision: z.string().optional(), // for product listings
    numero_documento: z.string().optional(), // for product history
});
export type DocumentLine = z.infer<typeof DocumentLineSchema>;

export const DocumentFileSchema = z.object({
    id: z.number().optional(),
    documento_id: z.number().optional(),
    tipo_archivo: z.string().nullable(),
    nombre_archivo: z.string().nullable(),
    ruta_archivo: z.string().nullable(),
    hash_archivo: z.string().nullable(),
    fecha_subida: z.string().nullable(),
});
export type DocumentFile = z.infer<typeof DocumentFileSchema>;

export const IncidentSchema = z.object({
    id: z.number(),
    documento_id: z.number(),
    incidencia: z.boolean(),
    fecha_incidencia: z.string(),
    descripcion: z.string().nullable(),
    validado: z.boolean(),
    fecha_validacion: z.string().nullable(),
    validado_por: z.string().nullable(),
});
export type Incident = z.infer<typeof IncidentSchema>;


export type Document = {
  id_documento: number;
  numero_documento: string | null;
  tipo_documento: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_creacion: string;
  moneda: string;
  observaciones: string | null;
  datos_extra: any | null;
  base_imponible: number;
  iva: number;
  total: number;
  
  entidades: DocumentEntity[];
  lineas: DocumentLine[];
  iva_details: IvaDetail[];
  archivos: DocumentFile[];
  incidencias: Incident[];
  
  // Flattened for table display
  proveedor: string;
  cif: string;
  incidencia: boolean;
  verificado: boolean;
  incidencia_razon?: string | null;
  
  // Campos de empresa
  empresa_id: number | null;
  empresa_nombre?: string;
  empresa_cif?: string;
};

export const DocumentUpdateSchema = z.object({
  numero_documento: z.string().min(1, "El número de documento es obligatorio.").nullable(),
  fecha_emision: z.string().min(1, "La fecha es obligatoria.").nullable(),
  base_imponible: z.coerce.number(),
  total: z.coerce.number(),
  tipo_documento: z.string().min(1, "El tipo de documento es obligatorio."),
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

export const TaxValidationRuleSchema = z.object({
    id: z.number(),
    vigente: z.boolean(),
    date_init: z.string(),
    date_finish: z.string(),
    tipo_impuesto: z.string(),
    porcentaje: z.number(),
});
export type TaxValidationRule = z.infer<typeof TaxValidationRuleSchema>;

export const CreateTaxValidationRuleSchema = z.object({
  date_init: z.string().min(1, "La fecha de inicio es obligatoria."),
  date_finish: z.string().min(1, "La fecha de fin es obligatoria."),
  tipo_impuesto: z.string().min(1, "El tipo de impuesto es obligatorio."),
  porcentaje: z.coerce.number().min(0, "El porcentaje no puede ser negativo."),
});
export type CreateTaxValidationRulePayload = z.infer<typeof CreateTaxValidationRuleSchema>;

export type Company = {
  id: number;
  name: string;
  nombreFiscal?: string | null;
  cif?: string;
};

export type CreateDocumentPayload = {
  tipo_documento: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  importe_total: number;
  importe_sin_impuestos: number;
  moneda: string;
  observaciones?: string | null;
  empresa_id: number;
};