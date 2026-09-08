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
 * Formatea una fecha de calendario (YYYY-MM-DD o ISO) a formato legible en español (DD/MM/YYYY)
 * SIN desfases de huso horario (independiente de la zona horaria del navegador o servidor).
 */
export function formatFechaLocal(fecha: Date | string | null | undefined): string {
  if (!fecha) return 'N/A';
  if (typeof fecha === 'string') {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha.trim());
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
  }
  const date = parseFechaLocal(fecha);
  if (isNaN(date.getTime())) return 'N/A';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea la fecha de subida / creación (timestamp con hora) en formato español.
 */
export function formatFechaHoraSubida(fecha: Date | string | null | undefined): { fecha: string; hora: string } {
  if (!fecha) return { fecha: 'N/A', hora: '' };
  try {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return { fecha: 'N/A', hora: '' };
    const fechaStr = d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Madrid'
    });
    const horaStr = d.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid'
    });
    return { fecha: fechaStr, hora: horaStr };
  } catch {
    return { fecha: 'N/A', hora: '' };
  }
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