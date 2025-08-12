export type Document = {
  id_documento: number;
  numero_factura: string;
  nombre_archivo: string;
  tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
  fecha_subida: string;
  incidencia: boolean;
  contenido: string; // Concepto
  ingreso: number;
  gasto: number;
  proveedor: string;
  cif: string;
  base_imponible: number;
  iva: number;
  total: number;
};
