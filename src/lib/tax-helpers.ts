/** Extrae el importe de retención/IRPF de un array de impuestos (valor positivo). */
export function extractRetencionFromImpuestos(impuestos: Array<{ tipo_impuesto?: string; cuota?: number | string }> = []): number {
  const detail = impuestos.find((i) => {
    const t = (i.tipo_impuesto || '').toUpperCase();
    return t.includes('RETENCION') || t.includes('IRPF');
  });
  return detail ? Math.abs(Number(detail.cuota) || 0) : 0;
}
