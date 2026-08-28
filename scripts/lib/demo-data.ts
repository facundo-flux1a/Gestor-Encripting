/**
 * Datos de demostración para las piezas de vídeo.
 *
 * La factura de ejemplo no cuadra a propósito: base 1.180,00 + IVA 247,80, pero el
 * total dice 1.472,80. No está trucada en la base de datos: el PDF entra por la
 * interfaz, lo lee Azure DI, lo interpreta el modelo y el guard MATH_BALANCE del
 * propio pipeline lo frena. La cadena entera es real.
 */
import { prisma } from '../../src/lib/prisma';

export const COMPANY_ID = BigInt(127);
export const INVOICE_NUMBER = 'ALF-7781';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ESTILO = `@page { size: A4; margin: 0; }
body { font-family: "DejaVu Sans", Arial, sans-serif; margin: 0; padding: 48px 56px; color: #1a1a1a; font-size: 11pt; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a4f8a; padding-bottom: 18px; }
.brand { font-size: 20pt; font-weight: 700; color: #1a4f8a; letter-spacing: -0.5px; }
.brand small { display: block; font-size: 8.5pt; font-weight: 400; color: #666; letter-spacing: 0; margin-top: 4px; }
.doc { text-align: right; } .doc h1 { font-size: 15pt; margin: 0 0 6px; letter-spacing: 1px; }
.doc div { font-size: 9.5pt; color: #444; line-height: 1.7; }
.parties { display: flex; gap: 40px; margin: 32px 0 28px; } .parties section { flex: 1; }
.parties h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; color: #888; margin: 0 0 8px; font-weight: 600; }
.parties p { margin: 0; line-height: 1.65; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { background: #f2f5f9; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.8px; color: #445; padding: 9px 10px; border-bottom: 1px solid #d8dee7; }
th.r, td.r { text-align: right; } td { padding: 11px 10px; border-bottom: 1px solid #eceff3; font-size: 10pt; }
.totals { margin-top: 24px; margin-left: auto; width: 300px; }
.totals tr td { border: none; padding: 6px 10px; font-size: 10.5pt; }
.totals tr.grand td { border-top: 2px solid #1a4f8a; padding-top: 12px; font-size: 13pt; font-weight: 700; color: #1a4f8a; }
footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #eceff3; font-size: 8.5pt; color: #777; line-height: 1.7; }
`;

export const INVOICE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
${ESTILO}</style></head><body>
<div class="top"><div class="brand">Alfa Cloud Iberia<small>Servicios de infraestructura en la nube</small></div>
<div class="doc"><h1>FACTURA</h1><div>Nº <strong>ALF-7781</strong><br>Fecha: 07/08/2026<br>Vencimiento: 06/09/2026</div></div></div>
<div class="parties">
<section><h2>Emisor</h2><p><strong>Alfa Cloud Iberia S.L.</strong><br>CIF B89650412<br>Calle Sepúlveda 118, 3º<br>08015 Barcelona</p></section>
<section><h2>Cliente</h2><p><strong>Lumen Estudio S.L.</strong><br>CIF B76184293<br>Avenida del Puerto 42<br>46023 Valencia</p></section></div>
<table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>
<tr><td>Infraestructura cloud, plan Business (agosto 2026)</td><td class="r">1</td><td class="r">940,00 €</td><td class="r">940,00 €</td></tr>
<tr><td>Copias de seguridad gestionadas, 500 GB</td><td class="r">1</td><td class="r">180,00 €</td><td class="r">180,00 €</td></tr>
<tr><td>Soporte técnico prioritario</td><td class="r">1</td><td class="r">60,00 €</td><td class="r">60,00 €</td></tr>
</tbody></table>
<table class="totals"><tr><td>Base imponible</td><td class="r">1.180,00 €</td></tr>
<tr><td>IVA 21 %</td><td class="r">247,80 €</td></tr>
<tr class="grand"><td>TOTAL</td><td class="r">1.472,80 €</td></tr></table>
<footer>Forma de pago: transferencia bancaria a ES21 0182 4471 3902 0157 8834 · Vencimiento a 30 días.<br>
Alfa Cloud Iberia S.L. · Inscrita en el Registro Mercantil de Barcelona, Tomo 44.812, Folio 91, Hoja B-471.203.</footer>
</body></html>`;

/**
 * La segunda factura de la demostración SÍ cuadra: base 860,00 + IVA 180,60 = 1.040,60.
 * Existe para que el vídeo pueda enseñar el contraste, que es lo que hace el producto:
 * de la misma tanda una pasa sola y la otra queda retenida. Emisor distinto y fecha del
 * mismo ejercicio, para no disparar ENTIDAD_DUPLICADA ni FECHA_ANOMALA por accidente.
 */
export const CLEAN_INVOICE_NUMBER = 'NPS-2314';

export const CLEAN_INVOICE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
${ESTILO}</style></head><body>
<div class="top"><div class="brand">Nordic Print Studio<small>Artes gráficas y encuadernación</small></div>
<div class="doc"><h1>FACTURA</h1><div>Nº <strong>NPS-2314</strong><br>Fecha: 12/08/2026<br>Vencimiento: 11/09/2026</div></div></div>
<div class="parties">
<section><h2>Emisor</h2><p><strong>Nordic Print Studio S.L.</strong><br>CIF B65429871<br>Calle Orense 34, 2º<br>28020 Madrid</p></section>
<section><h2>Cliente</h2><p><strong>Lumen Estudio S.L.</strong><br>CIF B76184293<br>Avenida del Puerto 42<br>46023 Valencia</p></section></div>
<table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>
<tr><td>Impresión de catálogos, 500 ejemplares</td><td class="r">1</td><td class="r">620,00 €</td><td class="r">620,00 €</td></tr>
<tr><td>Encuadernación y acabado mate</td><td class="r">1</td><td class="r">180,00 €</td><td class="r">180,00 €</td></tr>
<tr><td>Transporte y entrega</td><td class="r">1</td><td class="r">60,00 €</td><td class="r">60,00 €</td></tr>
</tbody></table>
<table class="totals"><tr><td>Base imponible</td><td class="r">860,00 €</td></tr>
<tr><td>IVA 21 %</td><td class="r">180,60 €</td></tr>
<tr class="grand"><td>TOTAL</td><td class="r">1.040,60 €</td></tr></table>
<footer>Forma de pago: transferencia bancaria a ES68 2100 5731 7802 0043 6619 · Vencimiento a 30 días.<br>
Nordic Print Studio S.L. · Inscrita en el Registro Mercantil de Madrid, Tomo 38.104, Folio 22, Hoja M-679.451.</footer>
</body></html>`;

/** La subida se graba en vivo, así que el documento de la toma anterior tiene que desaparecer antes. */
export async function resetInvoice() {
  const documents = await prisma.documentos.findMany({
    where: { id_de_empresa: COMPANY_ID, numero_documento: { in: [INVOICE_NUMBER, CLEAN_INVOICE_NUMBER] } },
    select: { id: true },
  });
  for (const document of documents) {
    await prisma.$transaction([
      prisma.impuestos_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.lineas_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.entidades_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.incidencias_documento.deleteMany({ where: { documento_id: document.id } }),
      prisma.health_check_status.deleteMany({ where: { documento_id: Number(document.id) } }),
      prisma.documentos.delete({ where: { id: document.id } }),
    ]);
  }
  return documents.length;
}

export async function waitForExtraction(numero: string = INVOICE_NUMBER, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const document = await prisma.documentos.findFirst({
      where: { id_de_empresa: COMPANY_ID, numero_documento: numero },
      select: { id: true },
      orderBy: { id: 'desc' },
    });
    if (document) return Number(document.id);
    await wait(3000);
  }
  throw new Error(`La extracción de ${numero} no terminó a tiempo. ¿Están corriendo los workers?`);
}

