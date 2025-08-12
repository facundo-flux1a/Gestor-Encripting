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
  fecha_subida: string; // Should be a date string like 'YYYY-MM-DD'
  incidencia: boolean;
  contenido: string; // Concepto
  ingreso: number;
  gasto: number;
  proveedor: string;
  cif: string;
  base_imponible: number;
  iva: number;
  iva_details: IvaDetail[];
  total: number;
};
