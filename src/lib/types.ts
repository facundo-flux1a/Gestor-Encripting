import { z } from 'zod';

export type IvaDetail = {
  tipo_impuesto: string;
  porcentaje: number;
  base_imponible: number;
  cuota: number;
};

export type DocumentEntity = {
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string | null;
    telefono: string | null;
    email: string | null;
    datos_extra: any | null;
};

export type DocumentLine = {
    codigo: string | null;
    descripcion: string | null;
    cantidad: number;
    unidad: string | null;
    precio_unitario: number;
    descuento_porcentaje: number;
    precio_neto: number;
    importe_linea: number;
    datos_extra: any | null;
};

export type DocumentFile = {
    tipo_archivo: string | null;
    nombre_archivo: string | null;
    ruta_archivo: string | null;
    hash_archivo: string | null;
    fecha_subida: string;
};

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
  base_imponible: z.coerce.number().positive("La base imponible debe ser positiva."),
  total: z.coerce.number().positive("El total debe ser positivo."),
});

export type DocumentUpdatePayload = z.infer<typeof DocumentUpdateSchema>;
