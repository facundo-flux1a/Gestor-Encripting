import {
  azureDiLooksLikeInvoice,
  cleanCif,
  detectMultipleInvoicesInText,
  enrichPartyCifs,
  extractCifsFromText,
  mapAzureDiInvoiceToGeminiShape,
  matchesEmpresaCifLookalike,
  normalizeTaxRate,
  parseFlexibleDate,
  reconcileImportes,
  resolveFechaVencimiento,
  resolveTipoDocumento,
} from '@/services/ingestion/azure-di-map';
import type { AzureDiAnalyzeResult } from '@/services/ingestion/azure-di';
import { runFiscalGuards } from '@/services/ingestion/fiscal-guards';

describe('parseFlexibleDate', () => {
  it('acepta fechas reales y rechaza 30/02 y 29/02 no bisiesto', () => {
    expect(parseFlexibleDate('21/10/2026')).toBe('2026-10-21');
    expect(parseFlexibleDate('29/02/2024')).toBe('2024-02-29');
    expect(parseFlexibleDate('30/02/2026')).toBeNull();
    expect(parseFlexibleDate('29/02/2026')).toBeNull();
    expect(parseFlexibleDate('2026-02-30')).toBeNull();
  });
});

describe('azure-di-map', () => {
  const sample: AzureDiAnalyzeResult = {
    documents: [
      {
        docType: 'invoice',
        confidence: 0.92,
        fields: {
          VendorName: { valueString: 'Proveedor Demo SA', confidence: 0.9 },
          VendorTaxId: { valueString: 'A12345674', confidence: 0.9 },
          CustomerName: { valueString: 'ESPAI DE DUES S.L.', confidence: 0.9 },
          CustomerTaxId: { valueString: 'B97376321', confidence: 0.9 },
          InvoiceId: { valueString: 'F-2026-001', confidence: 0.95 },
          InvoiceDate: { valueDate: '2026-01-15', confidence: 0.9 },
          SubTotal: { valueCurrency: { amount: 100, currencyCode: 'EUR' }, confidence: 0.9 },
          TotalTax: { valueCurrency: { amount: 21, currencyCode: 'EUR' }, confidence: 0.9 },
          InvoiceTotal: { valueCurrency: { amount: 121, currencyCode: 'EUR' }, confidence: 0.9 },
          TaxDetails: {
            valueArray: [
              {
                valueObject: {
                  Rate: { valueNumber: 21 },
                  Amount: { valueCurrency: { amount: 21 } },
                  NetAmount: { valueCurrency: { amount: 100 } },
                },
              },
            ],
          },
        },
      },
    ],
  };

  it('maps invoice fields to DocumentoGemini shape', () => {
    const mapped = mapAzureDiInvoiceToGeminiShape(sample, { empresaCif: 'B97376321' });
    expect(mapped.es_facturable).toBe(true);
    expect(mapped.tipo_documento).toBe('FACTURA RECIBIDA');
    expect(mapped.documento).toMatchObject({
      numero_documento: 'F-2026-001',
      fecha_emision: '2026-01-15',
      importe_total: 121,
      importe_sin_iva: 100,
    });
    expect(mapped.empresa_emisora?.cif).toBe('A12345674');
    expect(mapped.cliente?.cif).toBe('B97376321');
    expect(mapped.totales_por_impuesto?.[0]).toMatchObject({
      tipo_iva: 'IVA',
      porcentaje: 21,
      base_imponible: 100,
      cuota_iva: 21,
    });
    expect(mapped._extractor).toBe('azure-di');
  });

  it('resolveTipoDocumento emitida when vendor is us', () => {
    expect(resolveTipoDocumento('B97376321', 'A12345674', 'B97376321')).toBe('FACTURA EMITIDA');
  });

  it('azureDiLooksLikeInvoice false on empty', () => {
    expect(azureDiLooksLikeInvoice({ documents: [{ fields: {} }] })).toBe(false);
    expect(azureDiLooksLikeInvoice(sample)).toBe(true);
  });

  it('cleanCif strips ES prefix and separators', () => {
    expect(cleanCif('ES-B 97.376.321')).toBe('B97376321');
    expect(cleanCif('A-12012423')).toBe('A12012423');
    expect(cleanCif('ESA58695032')).toBe('A58695032');
  });

  it('extractCifsFromText prefers labeled CIF/NIF in footer', () => {
    const text = `
      CLIENTE ESPAIS DE DUNES  CIF/NIF B97376321
      PRODUCTOS FLORIDA, S.A. - NIF: A12012423
      Inscrita ... CIF: B-97134852
      EUROPASTRY N.I.F. A-58695032 - EORI/VIES: ESA58695032
    `;
    const { labeled, all } = extractCifsFromText(text);
    expect(labeled).toEqual(expect.arrayContaining(['B97376321', 'A12012423', 'B97134852', 'A58695032']));
    expect(all).toEqual(expect.arrayContaining(labeled));
  });

  it('enrichPartyCifs recovers vendor CIF when VendorTaxId empty (Florida)', () => {
    const { emisor, cliente } = enrichPartyCifs(
      { nombre: 'Productos Florida, S.A.', cif: '', direccion: '' },
      { nombre: 'ESPAIS DE DUNES SL', cif: 'B97376321', direccion: '' },
      'PRODUCTOS FLORIDA, S.A. ... NIF: A12012423 ... CLIENTE B97376321',
      'B97376321'
    );
    expect(emisor.cif).toBe('A12012423');
    expect(cliente.cif).toBe('B97376321');
  });

  it('enrichPartyCifs recovers Bollfrost CIF from footer label', () => {
    const { emisor, cliente } = enrichPartyCifs(
      { nombre: 'DISTRIBUCIONES BOLLFROST, S.L.', cif: '', direccion: '' },
      { nombre: 'ESPAIS DE DUNES S.L.', cif: '', direccion: '' },
      'CIF/NIF B97376321 ... Inscrita ... CIF: B-97134852',
      'B97376321'
    );
    expect(cliente.cif).toBe('B97376321');
    expect(emisor.cif).toBe('B97134852');
  });

  it('normalizeTaxRate converts fraction 0.21 → 21', () => {
    expect(normalizeTaxRate(0.21)).toBe(21);
    expect(normalizeTaxRate(0.1)).toBe(10);
    expect(normalizeTaxRate(21)).toBe(21);
  });

  it('reconcileImportes synthesizes IVA when TaxDetails missing (FAV pattern)', () => {
    const { base, impuestos } = reconcileImportes(125.18, 113.8, [], {
      InvoiceTotal: { valueCurrency: { amount: 125.18 } },
      SubTotal: { valueCurrency: { amount: 113.8 } },
    });
    expect(base).toBe(113.8);
    expect(impuestos).toHaveLength(1);
    expect(impuestos[0].cuota_iva).toBe(11.38);
    expect(impuestos[0].porcentaje).toBe(10);
  });

  it('reconcileImportes recovers base when SubTotal=0 (Europastry pattern)', () => {
    const { base, impuestos } = reconcileImportes(
      293.96,
      0,
      [{ tipo_iva: 'IVA', porcentaje: 10, base_imponible: 0, cuota_iva: 20.56 }],
      {
        InvoiceTotal: { valueCurrency: { amount: 293.96 } },
        TotalTax: { valueCurrency: { amount: 20.56 } },
      }
    );
    // Doc base = total − IVA; línea base = cuota/tipo (no forzar toda la base al 10%)
    expect(base).toBe(273.4);
    expect(impuestos[0].base_imponible).toBe(205.6);
  });

  it('maps incomplete Azure result + OCR content through guards (Bollfrost)', () => {
    const result: AzureDiAnalyzeResult = {
      content:
        'FACTURA 0A 250202 CLIENTE ESPAIS DE DUNES S.L. CIF/NIF B97376321 ' +
        'Inscrita en el Registro Mercantil ... CIF: B-97134852',
      documents: [
        {
          confidence: 1,
          fields: {
            VendorName: { valueString: 'DISTRIBUCIONES BOLLFROST, S.L.' },
            CustomerName: { valueString: 'ESPAIS DE DUNES S.L.' },
            InvoiceId: { valueString: '0A 250202' },
            InvoiceDate: { valueDate: '2025-08-11' },
            SubTotal: { valueCurrency: { amount: 12.54 } },
            InvoiceTotal: { valueCurrency: { amount: 15.17 } },
            // sin VendorTaxId ni TaxDetails — como falló en prod
          },
        },
      ],
    };
    const mapped = mapAzureDiInvoiceToGeminiShape(result, { empresaCif: 'B97376321' });
    expect(mapped.empresa_emisora?.cif).toBe('B97134852');
    expect(mapped.cliente?.cif).toBe('B97376321');
    expect(mapped.importe_sin_iva).toBe(12.54);
    expect(mapped.totales_por_impuesto?.[0]?.cuota_iva).toBe(2.63);
    const guards = runFiscalGuards(mapped, { empresaCif: 'B97376321' });
    expect(guards.ok).toBe(true);
  });

  it('maps Florida-like OCR without VendorTaxId', () => {
    const result: AzureDiAnalyzeResult = {
      content:
        'Productos Florida, S.A. CLIENTE B97376321 ' +
        'PRODUCTOS FLORIDA, S.A. ... NIF: A12012423 IVA 34,17 € 10,00% 3,42 €',
      documents: [
        {
          confidence: 1,
          fields: {
            VendorName: { valueString: 'Productos Florida, S.A.' },
            CustomerTaxId: { valueString: 'B97376321' },
            InvoiceId: { valueString: 'D/20689' },
            SubTotal: { valueCurrency: { amount: 34.17 } },
            InvoiceTotal: { valueCurrency: { amount: 37.59 } },
          },
        },
      ],
    };
    const mapped = mapAzureDiInvoiceToGeminiShape(result, { empresaCif: 'B97376321' });
    expect(mapped.empresa_emisora?.cif).toBe('A12012423');
    const guards = runFiscalGuards(mapped, { empresaCif: 'B97376321' });
    expect(guards.ok).toBe(true);
  });

  it('resolveFechaVencimiento from Fecha pago and from N DIAS', () => {
    expect(
      resolveFechaVencimiento(
        { PaymentTerm: { valueString: 'Domiciliación' } },
        'Fecha emisión 09.07.2025  Domiciliación  Fecha pago 23.07.2025',
        '2025-07-09',
        'Domiciliación'
      )
    ).toBe('2025-07-23');

    expect(
      resolveFechaVencimiento(
        { PaymentTerm: { valueString: '30 DIAS COBRO DIA/S12' } },
        '',
        '2025-07-31',
        '30 DIAS COBRO'
      )
    ).toBe('2025-08-30');

    expect(resolveFechaVencimiento({}, '', '2025-07-01', '')).toBe('');
  });

  it('detectMultipleInvoicesInText for Cash/Musgrave pack', () => {
    const text = `
      DUPLICADO DE FACTURA
      CIF/DNl: 897376321 Factura número: 991 1360-0001707
      DUPLICADO DE FACTURA
      Factura número: 9911360-0002396
      MUSGRAVE ESPAÑA S.A.U.
    `;
    expect(detectMultipleInvoicesInText(text)).toBe(true);
    expect(matchesEmpresaCifLookalike('897376321', 'B97376321')).toBe(true);
    expect(detectMultipleInvoicesInText('Factura número: F-1 única')).toBe(false);
    // Un solo nº repetido como DUPLICADO no cuenta como multi
    expect(
      detectMultipleInvoicesInText(`
        DUPLICADO DE FACTURA Factura número: 9911360-0001707
        DUPLICADO DE FACTURA Factura número: 991 1360-0001707
      `)
    ).toBe(false);
  });

  it('maps Musgrave/Cash with known vendor CIF', () => {
    const result: AzureDiAnalyzeResult = {
      content: 'CASH MASSANASSA cmassanassa@cash.musgrave.es MUSGRAVE ESPAÑA S.A.U. Factura número: 9911360-0001707',
      documents: [
        {
          confidence: 1,
          fields: {
            VendorName: { valueString: 'CASH MASSANASSA' },
            InvoiceId: { valueString: '9911360-0001707' },
            InvoiceTotal: { valueCurrency: { amount: 733.09 } },
            SubTotal: { valueCurrency: { amount: 652.94 } },
          },
        },
      ],
    };
    const mapped = mapAzureDiInvoiceToGeminiShape(result, { empresaCif: 'B97376321' });
    expect(mapped.empresa_emisora?.cif).toBe('A80837941');
    expect(mapped.empresa_emisora?.nombre).toMatch(/MUSGRAVE|CASH/i);
    expect(mapped.es_multiple).toBe(false);
    const guards = runFiscalGuards(mapped, { empresaCif: 'B97376321' });
    expect(guards.ok).toBe(true);
  });

  it('corrige VendorName confundo con cliente en tickets Musgrave', () => {
    const result: AzureDiAnalyzeResult = {
      content: 'MUSGRAVE ESPAÑA cash.musgrave.es Factura número: 9911360-0001707 CIF/DNI: B97376321',
      documents: [
        {
          confidence: 1,
          fields: {
            VendorName: { valueString: 'DE DUNES ESPAIS\nESPAIS DE DUNES S.L.' },
            CustomerName: { valueString: 'ESPAIS DE DUNES SL' },
            CustomerTaxId: { valueString: 'B97376321' },
            InvoiceId: { valueString: '9911360-0001707' },
            InvoiceTotal: { valueCurrency: { amount: 733.09 } },
          },
        },
      ],
    };
    const mapped = mapAzureDiInvoiceToGeminiShape(result, { empresaCif: 'B97376321' });
    expect(mapped.empresa_emisora?.cif).toBe('A80837941');
    expect(mapped.empresa_emisora?.nombre).toBe('MUSGRAVE ESPAÑA S.A.U.');
    expect(mapped.cliente?.cif).toBe('B97376321');
  });
});
