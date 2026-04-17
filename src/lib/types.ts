import { z } from 'zod';

// =====================================
// USUARIO Y SESIÓN
// =====================================

export const UserSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  email: z.string(),
  password: z.string().nullable().optional(),
  tutorial: z.number().optional(),
  tutorial_documentos: z.number().optional(),
  tutorial_trimestres: z.number().optional(),
  tutorial_actividad: z.number().optional(),
  tutorial_individual: z.number().optional(),
  tutorial_incidencias: z.number().optional(),
  tutorial_proveedores: z.number().optional(),
  config_otros_tipos: z.string().nullable().optional(),
  organization_rol: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionPayloadSchema = z.object({
  userId: z.number(),
  email: z.string(),
  nombre: z.string(),
  expires: z.string(),
  tutorial: z.number().optional(),
  tutorialDocumentos: z.number().optional(),
  tutorialTrimestres: z.number().optional(),
  tutorialActividad: z.number().optional(),
  tutorialIndividual: z.number().optional(),
  tutorialIncidencias: z.number().optional(),
  tutorialProveedores: z.number().optional(),
  organization_rol: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional(),
});
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

// =====================================
// IVA Y DETALLES FISCALES
// =====================================

export const IvaDetailSchema = z.object({
  id: z.number().optional(),
  tipo_impuesto: z.string().optional().nullable(),
  porcentaje: z.coerce.number(),
  base_imponible: z.coerce.number(),
  cuota: z.coerce.number(),
});
export type IvaDetail = z.infer<typeof IvaDetailSchema>;

// =====================================
// ENTIDADES (PROVEEDORES/CLIENTES)
// =====================================

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
  empresaNombre: z.string().optional(),
  cuenta_compra: z.string().nullable().optional(),
  cuenta_venta: z.string().nullable().optional(),
});
export type ProviderWithStats = z.infer<typeof ProviderWithStatsSchema>;

// =====================================
// LÍNEAS DE DOCUMENTO
// =====================================

export const DocumentLineSchema = z.object({
  id: z.number().optional(),
  documento_id: z.number().optional(),
  id_de_empresa: z.number().optional(),
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
  fecha_emision: z.string().optional(),
  numero_documento: z.string().optional(),
  total_cantidad_comprada: z.coerce.number().optional(),
  veces_comprado: z.coerce.number().optional(),
  cuenta_contable: z.string().nullable().optional(),
});
export type DocumentLine = z.infer<typeof DocumentLineSchema>;

// =====================================
// ARCHIVOS
// =====================================

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

// =====================================
// INCIDENCIAS
// =====================================

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

// =====================================
// DOCUMENTOS
// =====================================

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
  is_new: number;
  entidades: DocumentEntity[];
  lineas: DocumentLine[];
  iva_details: IvaDetail[];
  archivos: DocumentFile[];
  incidencias: Incident[];

  proveedor: string;
  cif: string;
  incidencia: boolean;
  verificado: boolean;
  incidencia_razon?: string | null;

  empresa_id: number | null;
  empresa_nombre?: string;
  empresa_cif?: string;
  año_trimestre?: number;
  num_trimestre?: number;
  trimestre_cerrado?: number;
  is_issued?: number;  // ✅ 1 = emitida (ingreso), 0 = recibida (gasto) — calculado por backend
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
  año_trimestre: z.number().optional(),
  num_trimestre: z.number().min(1).max(4).optional(),
  cif: z.string().optional(), // ⬅️ Campo CIF para guardar en datos_extra
});

export type DocumentUpdatePayload = z.infer<typeof DocumentUpdateSchema>;

export const IncidentAnalysisResultSchema = z.object({
  newIncidentsFound: z.number().describe('The number of new incidents created.'),
  duplicates: z.number().describe('Number of duplicate documents found.'),
  calculationErrors: z.number().describe('Number of documents with calculation errors.'),
  message: z.string().describe('A summary message of the operation.'),
});
export type IncidentAnalysisResult = z.infer<typeof IncidentAnalysisResultSchema>;// =====================================
// VALIDACIÓN DE IMPUESTOS
// =====================================

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

// =====================================
// EMPRESAS
// =====================================

export type Company = {
  id: number;
  name: string;
  nombreFiscal?: string | null;
  cif?: string;
  mail_de_carga?: string | null;
  recargo?: boolean | number | null;
  id_de_usuario?: number[] | string | null;
  config_roles?: any;
  members?: any[];
  invitations?: any[];
};

export const InvitationSchema = z.object({
  id: z.number().optional(),
  empresa_id: z.number(),
  email: z.string().email(),
  rol: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']).default('PENDING'),
  token: z.string(),
  metadata: z.any().nullable().optional(),
  fecha_expiracion: z.string(),
  fecha_creacion: z.string().optional(),
});

export type Invitation = z.infer<typeof InvitationSchema>;

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

// =====================================
// ✅ DASHBOARD ANALYTICS - ACTUALIZADO
// =====================================

export type DashboardAnalytics = {
  kpis: {
    totalIngresos: number;              // ✅ CON IVA
    totalGastos: number;                // ✅ CON IVA
    totalIngresosSinIva: number;        // ✅ NUEVO - SIN IVA
    totalGastosSinIva: number;          // ✅ NUEVO - SIN IVA
    totalFacturasIngreso: number;
    totalFacturasGasto: number;
    beneficio: number;                  // ✅ CON IVA
    beneficioSinIva: number;            // ✅ NUEVO - SIN IVA
    ivaRepercutido: number;
    ivaSoportado: number;
    recargoRepercutido: number;
    recargoSoportado: number;
    retencionRepercutido: number; // ✅ NUEVO
    retencionSoportado: number;   // ✅ NUEVO
    resultadoIva: number;
    incidenciasAbiertas: number;
    totalProveedores: number;
    totalProductos: number;
    incidentRate: number;
    totalDocs: number;
    hasMismatches: boolean; // 🆕 NUEVO: Indica si hay descuadres para mostrar el icono ⚠️
  };
  quarterlySummary: {
    [key: string]: { ingresos: number; gastos: number };
  };
  yearlySummary: {
    [key: string]: { ingresos: number; gastos: number };
  };
  multiYearQuarterlySummary: {
    [year: string]: {
      [quarter: string]: { ingresos: number; gastos: number };
    };
  };
  documentDistribution: { name: string; value: number }[];
  ivaSummary: {
    [key: string]: { repercutido: number; soportado: number };
  };
  ivaYearlySummary: {
    [key: string]: { repercutido: number; soportado: number };
  };
  multiYearIvaSummary: {
    [year: string]: {
      [quarter: string]: { repercutido: number; soportado: number };
    };
  };
  topProviders: { name: string; total: number; fiscalId: string }[];
  yearUsed?: number;
}

// =====================================
// UTILIDADES
// =====================================

export function calcularTrimestre(fecha: Date | string): number {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  const mes = date.getMonth() + 1;

  if (mes >= 1 && mes <= 3) return 1;
  if (mes >= 4 && mes <= 6) return 2;
  if (mes >= 7 && mes <= 9) return 3;
  return 4;
}

// =====================================
// TRIMESTRES
// =====================================

export const TrimestreSchema = z.object({
  año: z.number(),
  trimestre: z.number().min(1).max(4),
  empresa_id: z.number().nullable(),
  empresa_nombre: z.string().nullable(),
  total_documentos: z.number(),
  total_ingresos: z.number(),
  total_gastos: z.number(),
  total_ingresos_sin_iva: z.number(),
  total_gastos_sin_iva: z.number(),
  iva_repercutido: z.number(),
  iva_soportado: z.number(),
  recargo_repercutido: z.number().optional().default(0), // ✅ NUEVO
  recargo_soportado: z.number().optional().default(0),   // ✅ NUEVO
  cerrado: z.boolean(),
  fecha_cierre: z.string().nullable().optional(),
});
export type Trimestre = z.infer<typeof TrimestreSchema>;

export const CerrarTrimestrePayloadSchema = z.object({
  año: z.number(),
  trimestre: z.number().min(1).max(4),
  empresa_id: z.number().nullable(),
});
export type CerrarTrimestrePayload = z.infer<typeof CerrarTrimestrePayloadSchema>;

export const TrimestreFiltersSchema = z.object({
  empresa_id: z.union([z.number(), z.array(z.number())]).nullable().optional(),
  año: z.number().optional(),
  mostrar_vacios: z.boolean().optional().default(false),
});
export type TrimestreFilters = z.infer<typeof TrimestreFiltersSchema>;// =====================================
// ACTIVIDAD
// =====================================

export interface Activity {
  id: number;
  upload_id: string;
  parent_upload_id: string | null;
  id_de_empresa: number;
  documento_id: number | null;
  documento_nombre: string;
  documento_tipo: string;
  status: string;
  step: string;
  progress: number;
  mensaje: string;
  error_detalle: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  nombre_de_empresa: string;
  CIF: string;
  tipo_documento?: string;
  numero_documento?: string;
  empresa_emisora?: string;
  cliente?: string;
  is_new?: number;
  'dashboard-correo'?: 'dashboard' | 'correo' | null;
}