/**
 * src/services/ingestion/ticket-validator.ts
 *
 * Validador determinista puro para tickets y facturas simplificadas.
 * Basado en:
 * - RD 1619/2012, Art. 4 (Límites para factura simplificada: 400 € general / 3.000 € sectores habilitados)
 * - RD 1619/2012, Art. 7.2 (Factura simplificada cualificada con NIF y cuota)
 * - Ley 37/1992 (LIVA), Art. 96 (Exclusiones de deducción de IVA: hostelería, etc.) y Art. 97 (Requisitos formales)
 */

// ─── Enum de Categorías de Operación ─────────────────────────────────────────

export const TICKET_CATEGORIAS = [
  // Sectores habilitados hasta 3.000 € (Art. 4.2 RD 1619/2012)
  'venta_al_por_menor',         // a) Ventas al por menor a consumidor final
  'venta_ambulancia',           // b) Ventas en ambulancia
  'servicio_domicilio',         // c) Ventas/servicios a domicilio del consumidor
  'transporte_personas',        // d) Transportes de personas y equipajes (taxi, bus, tren, avión)
  'hosteleria_restauracion',    // e) Restaurantes, bares, cafeterías, etc.
  'sala_baile_discoteca',       // f) Salas de baile y discotecas
  'telefonia_cabina',           // g) Servicios telefónicos con cabinas/tarjetas anónimas
  'peluqueria_belleza',         // h) Peluquería e institutos de belleza
  'instalacion_deportiva',      // i) Instalaciones deportivas (gimnasio, piscina, pistas)
  'revelado_fotografia',        // j) Revelado de fotografías / estudios fotográficos
  'aparcamiento',               // k) Aparcamiento y estacionamiento de vehículos
  'alquiler_peliculas',         // l) Alquiler de películas
  'tintoreria_lavanderia',      // m) Tintorería y lavandería
  'autopista_peaje',            // n) Autopistas de peaje

  // Fuera de la lista de Art. 4.2 (no habilitados para simplificada > 400 €)
  'servicios_profesionales',    // Abogado, gestor, asesor, arquitecto, médico...
  'suministro_energia',         // Electricidad, gas, agua
  'farmacia_parafarmacia',      // Farmacia/parafarmacia
  'combustible',                // Gasolinera / carburante
  'alojamiento_hotel',          // Hotel / alojamiento (separado de hostelería)
  'otro_no_listado',            // Cualquier sector que no encaje en los anteriores
  'desconocido',                // No es posible determinar el sector con certeza
] as const;

export type TicketCategoria = typeof TICKET_CATEGORIAS[number];

/** Sectores taxativamente autorizados a emitir simplificada hasta 3.000 € (Art. 4.2 RD 1619/2012) */
export const TICKET_SECTORES_HABILITADOS_3000: ReadonlySet<TicketCategoria> = new Set([
  'venta_al_por_menor',
  'venta_ambulancia',
  'servicio_domicilio',
  'transporte_personas',
  'hosteleria_restauracion',
  'sala_baile_discoteca',
  'telefonia_cabina',
  'peluqueria_belleza',
  'instalacion_deportiva',
  'revelado_fotografia',
  'aparcamiento',
  'alquiler_peliculas',
  'tintoreria_lavanderia',
  'autopista_peaje',
]);

/** Sectores con exclusión taxativa del derecho a deducir IVA (Art. 96 LIVA), con o sin NIF */
export const SECTORES_ART_96_EXCLUIDOS_IVA: ReadonlySet<TicketCategoria> = new Set([
  'hosteleria_restauracion',
  'sala_baile_discoteca',
]);

// ─── Constantes de Control ───────────────────────────────────────────────────

export const LIMITE_TICKET_GENERAL_EUR = 400;
export const LIMITE_TICKET_ABSOLUTO_EUR = 3000;

export const CONFIDENCIA_ALTA = 0.75;
export const CONFIDENCIA_MINIMA = 0.50;

export type TicketValidationStatus = 'valido' | 'incidencia' | 'revisar';

export interface TicketValidationOpts {
  importeTotal: number;
  categoriaOperacion?: TicketCategoria | string | null;
  categoriaConfianza?: number | null;
  moneda?: string | null;
  tieneNifReceptor?: boolean;
  tieneCuotaDesglosada?: boolean;
  esFacturaRectificativa?: boolean;
}

export interface TicketValidationResult {
  status: TicketValidationStatus;
  motivo: string;
  nivel?: 'dura' | 'media';
  iva_deducible: boolean;
  guardCode?:
    | 'TICKET_SUPERA_LIMITE_ABSOLUTO'
    | 'TICKET_SECTOR_NO_HABILITADO'
    | 'TICKET_MONEDA_NO_EUR'
    | 'TICKET_CATEGORIA_REVISAR';
}

/**
 * Validador puro de tickets y facturas simplificadas.
 * Determina:
 * 1. Cumplimiento legal de límites según RD 1619/2012
 * 2. Si el IVA es deducible (Art. 96 y 97 LIVA: factura simplificada cualificada)
 * 3. Si requiere revisión humana por confianza baja o moneda
 */
export function validateTicketLimits(opts: TicketValidationOpts): TicketValidationResult {
  const importeTotal = Math.abs(Number(opts.importeTotal) || 0);
  const moneda = opts.moneda ? opts.moneda.trim().toUpperCase() : 'EUR';
  const esRectificativa = Boolean(opts.esFacturaRectificativa);
  const tieneNif = Boolean(opts.tieneNifReceptor);
  const tieneCuota = Boolean(opts.tieneCuotaDesglosada);

  // Normalizar categoría
  const rawCat = (opts.categoriaOperacion || '').trim().toLowerCase();
  const categoria: TicketCategoria = (TICKET_CATEGORIAS as readonly string[]).includes(rawCat)
    ? (rawCat as TicketCategoria)
    : 'desconocido';

  const confianza = typeof opts.categoriaConfianza === 'number' && Number.isFinite(opts.categoriaConfianza)
    ? Math.max(0, Math.min(1, opts.categoriaConfianza))
    : (categoria === 'desconocido' ? 0 : 1);

  // 1. Moneda no EUR: los límites de RD 1619/2012 están fijados en euros
  if (moneda && moneda !== 'EUR') {
    return {
      status: 'revisar',
      motivo: `Moneda del ticket no es EUR (${moneda}). No se pueden aplicar automáticamente los límites en euros del RD 1619/2012.`,
      iva_deducible: false,
      guardCode: 'TICKET_MONEDA_NO_EUR',
    };
  }

  // 2. Confianza baja o categoría desconocida
  const esCategoriaIncierta = categoria === 'desconocido' || confianza < CONFIDENCIA_MINIMA;

  // 3. Límite absoluto (> 3.000 € IVA incluido)
  // Las facturas rectificativas están exentas de límites monetarios (Art. 4.1 RD 1619/2012)
  if (!esRectificativa && importeTotal > LIMITE_TICKET_ABSOLUTO_EUR) {
    return {
      status: 'incidencia',
      nivel: 'dura',
      motivo: `Factura simplificada no válida legalmente: el importe total (${importeTotal.toFixed(2)} €) supera el límite máximo de 3.000 € permitido por el Art. 4 RD 1619/2012. El emisor estaba obligado a emitir factura ordinaria. Solicitar canje por factura completa.`,
      iva_deducible: false,
      guardCode: 'TICKET_SUPERA_LIMITE_ABSOLUTO',
    };
  }

  // 4. Límite de sector (400 € < importe <= 3.000 €)
  if (!esRectificativa && importeTotal > LIMITE_TICKET_GENERAL_EUR) {
    // Si la categoría es incierta y supera 400€, no podemos asegurar que esté en el Art. 4.2
    if (esCategoriaIncierta) {
      return {
        status: 'revisar',
        motivo: `Ticket de ${importeTotal.toFixed(2)} € supera 400 € y no se pudo determinar el sector con certeza (${categoria}, confianza: ${(confianza * 100).toFixed(0)}%). Revisar si el sector permite simplificada hasta 3.000 € (Art. 4.2 RD 1619/2012).`,
        iva_deducible: false,
        guardCode: 'TICKET_CATEGORIA_REVISAR',
      };
    }

    // Verificar si el sector está en la lista taxativa del Art. 4.2
    const habilitadoHasta3000 = TICKET_SECTORES_HABILITADOS_3000.has(categoria);
    if (!habilitadoHasta3000) {
      return {
        status: 'incidencia',
        nivel: 'media',
        motivo: `Factura simplificada en sector no habilitado (${categoria}) superando 400 € (${importeTotal.toFixed(2)} €). El Art. 4.2 RD 1619/2012 exige factura ordinaria completa para este sector al exceder 400 €. Solicitar factura ordinaria.`,
        iva_deducible: false,
        guardCode: 'TICKET_SECTOR_NO_HABILITADO',
      };
    }
  }

  // 5. Categoría incierta cuando importe <= 400 €
  if (esCategoriaIncierta) {
    return {
      status: 'revisar',
      motivo: `Sector de actividad del ticket no determinado con certeza (${categoria}, confianza: ${(confianza * 100).toFixed(0)}%). Revisar clasificación.`,
      iva_deducible: false,
      guardCode: 'TICKET_CATEGORIA_REVISAR',
    };
  }

  // 6. Confianza moderada (0.50 <= confianza < 0.75)
  const esConfianzaModerada = confianza < CONFIDENCIA_ALTA;

  // 7. Determinación de deducibilidad del IVA
  // Condición B: ¿El sector está excluido por Art. 96 LIVA (ej. hostelería)?
  const excluidoPorArt96 = SECTORES_ART_96_EXCLUIDOS_IVA.has(categoria);

  let ivaDeducible = false;
  let motivoExplicacion = '';

  if (excluidoPorArt96) {
    // Hostelería, restauración, espectáculos: Art. 96 excluye deducibilidad siempre
    ivaDeducible = false;
    motivoExplicacion = `Gasto en ${categoria}: IVA no deducible por Art. 96 LIVA (100% gasto).`;
  } else if (tieneNif && tieneCuota) {
    // Factura simplificada cualificada (Art. 7.2 RD 1619/2012 + Art. 97 LIVA)
    ivaDeducible = true;
    motivoExplicacion = `Factura simplificada cualificada (con NIF receptor y cuota desglosada): IVA deducible en cuenta 472.`;
  } else {
    // Ticket sin NIF receptor o sin cuota desglosada
    ivaDeducible = false;
    motivoExplicacion = `Ticket sin NIF del receptor o sin cuota desglosada: IVA no deducible por Art. 97 LIVA (100% gasto).`;
  }

  if (esConfianzaModerada) {
    return {
      status: 'revisar',
      motivo: `Ticket válido pero categoría "${categoria}" con confianza moderada (${(confianza * 100).toFixed(0)}%). ${motivoExplicacion}`,
      iva_deducible: ivaDeducible,
      guardCode: 'TICKET_CATEGORIA_REVISAR',
    };
  }

  return {
    status: 'valido',
    motivo: `Ticket válido (RD 1619/2012). ${motivoExplicacion}`,
    iva_deducible: ivaDeducible,
  };
}
