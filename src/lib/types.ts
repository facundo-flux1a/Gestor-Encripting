export type Document = {
  id_documento: number;
  nombre_archivo: string;
  tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
  fecha_subida: string;
  incidencia: boolean;
  contenido: string;
  ingreso: number;
  gasto: number;
};
