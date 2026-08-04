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
 * Calcula el trimestre considerando las extensiones:
 * - T1 (Ene-Mar): hasta 20 Abril
 * - T2 (Abr-Jun): hasta 20 Julio
 * - T3 (Jul-Sep): hasta 20 Octubre
 * - T4 (Oct-Dic): hasta 30 Enero (año siguiente)
 */
export function calcularTrimestreExtendido(fecha: Date | string): { año: number; trimestre: number } {
  const date = parseFechaLocal(fecha);
  const mes = date.getMonth() + 1; // 1-12
  const dia = date.getDate();
  const año = date.getFullYear();

  // T1: Enero-Marzo + extensión hasta 20 Abril
  if (mes >= 1 && mes <= 3) {
    return { año, trimestre: 1 };
  }
  if (mes === 4 && dia <= 20) {
    return { año, trimestre: 1 };
  }

  // T2: Abril-Junio + extensión hasta 20 Julio
  if (mes >= 4 && mes <= 6) {
    return { año, trimestre: 2 };
  }
  if (mes === 7 && dia <= 20) {
    return { año, trimestre: 2 };
  }

  // T3: Julio-Septiembre + extensión hasta 20 Octubre
  if (mes >= 7 && mes <= 9) {
    return { año, trimestre: 3 };
  }
  if (mes === 10 && dia <= 20) {
    return { año, trimestre: 3 };
  }

  // T4: Octubre-Diciembre
  if (mes >= 10 && mes <= 12) {
    return { año, trimestre: 4 };
  }

  // Enero días 1-30 del año siguiente → T4 del año anterior
  if (mes === 1 && dia <= 30) {
    return { año: año - 1, trimestre: 4 };
  }

  // Fallback (no debería llegar aquí)
  return { año, trimestre: 4 };
}