import {
  validateTicketLimits,
  TICKET_CATEGORIAS,
  TICKET_SECTORES_HABILITADOS_3000,
  SECTORES_ART_96_EXCLUIDOS_IVA,
} from '@/services/ingestion/ticket-validator';

describe('ticket-validator (RD 1619/2012 y Art. 96/97 LIVA)', () => {
  it('tiene definidos los 21 sectores del enum fijo', () => {
    expect(TICKET_CATEGORIAS.length).toBe(21);
    expect(TICKET_SECTORES_HABILITADOS_3000.size).toBe(14);
    expect(SECTORES_ART_96_EXCLUIDOS_IVA.has('hosteleria_restauracion')).toBe(true);
    expect(SECTORES_ART_96_EXCLUIDOS_IVA.has('sala_baile_discoteca')).toBe(true);
  });

  // Caso 1: Ticket restaurante 45 € -> Válido, 100% gasto
  it('Caso 1: Ticket restaurante 45 € -> Válido, IVA no deducible (100% gasto)', () => {
    const res = validateTicketLimits({
      importeTotal: 45,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 2: Ticket restaurante 250 € -> Válido, 100% gasto
  it('Caso 2: Ticket restaurante 250 € -> Válido, IVA no deducible', () => {
    const res = validateTicketLimits({
      importeTotal: 250,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 3: Ticket restaurante 2.800 € -> Válido (sector habilitado hasta 3.000 €), 100% gasto por Art. 96
  it('Caso 3: Ticket restaurante 2.800 € -> Válido (Art. 4.2), 100% gasto', () => {
    const res = validateTicketLimits({
      importeTotal: 2800,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 4: Ticket restaurante 3.200 € -> INCIDENCIA DURA (> 3.000 € ilegal)
  it('Caso 4: Ticket restaurante 3.200 € -> Incidencia dura (> 3.000 €)', () => {
    const res = validateTicketLimits({
      importeTotal: 3200,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
    });
    expect(res.status).toBe('incidencia');
    expect(res.nivel).toBe('dura');
    expect(res.guardCode).toBe('TICKET_SUPERA_LIMITE_ABSOLUTO');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 5: Ticket parking 25 € sin NIF -> Válido, 100% gasto (sin NIF no deduce)
  it('Caso 5: Ticket parking 25 € sin NIF -> Válido, no deducible', () => {
    const res = validateTicketLimits({
      importeTotal: 25,
      categoriaOperacion: 'aparcamiento',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
      tieneNifReceptor: false,
      tieneCuotaDesglosada: true,
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 6: Ticket parking 80 € con NIF + cuota -> Válido, DEDUCIBLE (cuenta 472)
  it('Caso 6: Ticket parking con NIF y cuota -> Factura simplificada cualificada, DEDUCIBLE', () => {
    const res = validateTicketLimits({
      importeTotal: 80,
      categoriaOperacion: 'aparcamiento',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
      tieneNifReceptor: true,
      tieneCuotaDesglosada: true,
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(true);
  });

  // Caso 7: Ticket peaje 15 € sin NIF -> Válido, 100% gasto
  it('Caso 7: Ticket autopista peaje 15 € sin NIF -> Válido, no deducible', () => {
    const res = validateTicketLimits({
      importeTotal: 15,
      categoriaOperacion: 'autopista_peaje',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
      tieneNifReceptor: false,
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 8 y 9: Ticket farmacia / supermercado (venta al por menor) <= 3000 €
  it('Caso 8/9: Venta al por menor 40 € y 600 € -> Válido hasta 3000 € (Art. 4.2.a)', () => {
    const res40 = validateTicketLimits({
      importeTotal: 40,
      categoriaOperacion: 'venta_al_por_menor',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
      tieneNifReceptor: false,
    });
    expect(res40.status).toBe('valido');

    const res600 = validateTicketLimits({
      importeTotal: 600,
      categoriaOperacion: 'venta_al_por_menor',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
      tieneNifReceptor: false,
    });
    expect(res600.status).toBe('valido');
  });

  // Caso 11: Ticket abogado 1.500 € (servicios profesionales no está en Art. 4.2 y supera 400 €)
  it('Caso 11: Ticket abogado 1.500 € -> Incidencia media (sector no habilitado para > 400 €)', () => {
    const res = validateTicketLimits({
      importeTotal: 1500,
      categoriaOperacion: 'servicios_profesionales',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
    });
    expect(res.status).toBe('incidencia');
    expect(res.nivel).toBe('media');
    expect(res.guardCode).toBe('TICKET_SECTOR_NO_HABILITADO');
    expect(res.iva_deducible).toBe(false);
  });

  // Caso 12: Ticket abogado 3.500 € -> Incidencia dura (> 3000 € límite absoluto)
  it('Caso 12: Ticket abogado 3.500 € -> Incidencia dura (> 3000 €)', () => {
    const res = validateTicketLimits({
      importeTotal: 3500,
      categoriaOperacion: 'servicios_profesionales',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
    });
    expect(res.status).toBe('incidencia');
    expect(res.nivel).toBe('dura');
    expect(res.guardCode).toBe('TICKET_SUPERA_LIMITE_ABSOLUTO');
  });

  // Caso 13 y 14: Taxi (transporte personas)
  it('Caso 13: Taxi 30 € sin NIF -> Válido, no deducible', () => {
    const res = validateTicketLimits({
      importeTotal: 30,
      categoriaOperacion: 'transporte_personas',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
      tieneNifReceptor: false,
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(false);
  });

  it('Caso 14: Taxi 120 € con NIF y cuota -> Válido, DEDUCIBLE (cuenta 472)', () => {
    const res = validateTicketLimits({
      importeTotal: 120,
      categoriaOperacion: 'transporte_personas',
      categoriaConfianza: 0.95,
      moneda: 'EUR',
      tieneNifReceptor: true,
      tieneCuotaDesglosada: true,
    });
    expect(res.status).toBe('valido');
    expect(res.iva_deducible).toBe(true);
  });

  // Caso 16: Supermercado 5.000 € -> Incidencia dura (> 3000 €)
  it('Caso 16: Supermercado 5.000 € -> Incidencia dura', () => {
    const res = validateTicketLimits({
      importeTotal: 5000,
      categoriaOperacion: 'venta_al_por_menor',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
    });
    expect(res.status).toBe('incidencia');
    expect(res.nivel).toBe('dura');
    expect(res.guardCode).toBe('TICKET_SUPERA_LIMITE_ABSOLUTO');
  });

  // Caso 19: Ticket en USD -> Revisar (moneda no EUR)
  it('Caso 19: Moneda no EUR -> status revisar', () => {
    const res = validateTicketLimits({
      importeTotal: 250,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.9,
      moneda: 'USD',
    });
    expect(res.status).toBe('revisar');
    expect(res.guardCode).toBe('TICKET_MONEDA_NO_EUR');
  });

  // Caso 20: Factura rectificativa sin límite monetario (Art. 4.1)
  it('Caso 20: Ticket rectificativo 4.500 € -> exento de límite monetario', () => {
    const res = validateTicketLimits({
      importeTotal: 4500,
      categoriaOperacion: 'venta_al_por_menor',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
      esFacturaRectificativa: true,
    });
    expect(res.status).toBe('valido');
  });

  // Control de confianza
  it('Confianza baja (< 0.50) -> status revisar', () => {
    const res = validateTicketLimits({
      importeTotal: 50,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.4,
      moneda: 'EUR',
    });
    expect(res.status).toBe('revisar');
    expect(res.guardCode).toBe('TICKET_CATEGORIA_REVISAR');
  });

  it('Confianza moderada (0.50-0.74) -> status revisar con advertencia', () => {
    const res = validateTicketLimits({
      importeTotal: 50,
      categoriaOperacion: 'hosteleria_restauracion',
      categoriaConfianza: 0.65,
      moneda: 'EUR',
    });
    expect(res.status).toBe('revisar');
    expect(res.guardCode).toBe('TICKET_CATEGORIA_REVISAR');
  });

  it('Categoría "desconocido" -> status revisar', () => {
    const res = validateTicketLimits({
      importeTotal: 50,
      categoriaOperacion: 'desconocido',
      categoriaConfianza: 0.9,
      moneda: 'EUR',
    });
    expect(res.status).toBe('revisar');
    expect(res.guardCode).toBe('TICKET_CATEGORIA_REVISAR');
  });
});
