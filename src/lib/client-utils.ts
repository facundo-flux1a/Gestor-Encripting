/**
 * Utilidades para componentes cliente
 * NO debe importar nada relacionado con la base de datos
 */

/**
 * Parsea una fecha evitando desfases UTC en strings ISO (YYYY-MM-DD).
 */
export function parseFechaLocal(fecha: Date | string): Date {
  if (fecha instanceof Date) return fecha;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha.trim());
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const esMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(fecha.trim());
  if (esMatch) {
    return new Date(Number(esMatch[3]), Number(esMatch[2]) - 1, Number(esMatch[1]));
  }
  return new Date(fecha);
}

/**
 * Calcula el trimestre natural correspondiente a una fecha:
 * - T1: Enero - Marzo (meses 1-3)
 * - T2: Abril - Junio (meses 4-6)
 * - T3: Julio - Septiembre (meses 7-9)
 * - T4: Octubre - Diciembre (meses 10-12)
 */
export function calcularTrimestreExtendido(fecha: Date | string): { año: number; trimestre: number } {
  const date = parseFechaLocal(fecha);
  const mes = date.getMonth() + 1; // 1-12
  const año = date.getFullYear();

  if (mes >= 1 && mes <= 3) return { año, trimestre: 1 };
  if (mes >= 4 && mes <= 6) return { año, trimestre: 2 };
  if (mes >= 7 && mes <= 9) return { año, trimestre: 3 };
  return { año, trimestre: 4 };
}

/**
 * Verifica si un documento es una factura/abono emitida/o ingresada/o vía API.
 * Las facturas emitidas por API (Verifactu) no pueden ser editadas ni eliminadas.
 */
export function isApiIssuedDocument(doc: any): boolean {
  if (!doc) return false;

  let isApi = doc.dashboard_correo === 'api' || doc['dashboard-correo'] === 'api';
  if (!isApi && doc.datos_extra) {
    try {
      const extra = typeof doc.datos_extra === 'string' ? JSON.parse(doc.datos_extra) : doc.datos_extra;
      if (extra?.canal_origen === 'api') {
        isApi = true;
      }
    } catch (e) {}
  }
  if (!isApi) return false;

  const tipo = String(doc.tipo_documento || '').toUpperCase();
  return tipo.includes('EMITID') || tipo.includes('EMITIDA') || tipo.includes('EMITIDO');
}