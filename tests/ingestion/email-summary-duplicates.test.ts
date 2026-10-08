import { getIngestionSummaryEmailHtml } from '@/services/ingestion/email-templates';

describe('getIngestionSummaryEmailHtml with duplicates', () => {
  it('genera correctamente la sección de duplicados y ajusta contadores e icono', () => {
    const accepted = [{ filename: 'factura_nueva.pdf', status: 'Validado e integrado con éxito' }];
    const duplicates = [{ filename: 'factura_repetida.pdf', reason: 'Documento ya registrado anteriormente en la empresa.' }];
    const rejected = [{ filename: 'corrupto.pdf', reason: 'Formato no soportado' }];

    const html = getIngestionSummaryEmailHtml(
      'cliente@empresa.com',
      'Mi Empresa SL',
      '08/10/2026',
      accepted,
      rejected,
      duplicates
    );

    expect(html).toContain('PROCESADOS CON ÉXITO (1)');
    expect(html).toContain('factura_nueva.pdf');
    expect(html).toContain('DUPLICADOS OMITIDOS (1)');
    expect(html).toContain('factura_repetida.pdf');
    expect(html).toContain('Documento ya registrado anteriormente en la empresa.');
    expect(html).toContain('RECHAZADOS / ERRORES (1)');
    expect(html).toContain('corrupto.pdf');
    expect(html).toContain('3 archivos');
  });

  it('muestra badge informativo cuando solo hay duplicados y ningún error', () => {
    const accepted = [{ filename: 'factura1.pdf', status: 'Validado e integrado con éxito' }];
    const duplicates = [{ filename: 'factura_repetida.pdf', reason: 'El archivo ya fue subido anteriormente' }];
    const rejected: any[] = [];

    const html = getIngestionSummaryEmailHtml(
      'cliente@empresa.com',
      'Mi Empresa SL',
      '08/10/2026',
      accepted,
      rejected,
      duplicates
    );

    expect(html).toContain('DUPLICADOS OMITIDOS (1)');
    expect(html).toContain('ℹ️');
    expect(html).toContain('Se detectaron <strong>1 documento(s) ya existente(s)</strong> que fueron omitidos');
    expect(html).not.toContain('RECHAZADOS / ERRORES');
  });

  it('mantiene retrocompatibilidad cuando duplicateFiles no se pasa', () => {
    const accepted = [{ filename: 'factura1.pdf', status: 'Validado e integrado con éxito' }];
    const rejected: any[] = [];

    const html = getIngestionSummaryEmailHtml(
      'cliente@empresa.com',
      'Mi Empresa SL',
      '08/10/2026',
      accepted,
      rejected
    );

    expect(html).toContain('PROCESADOS CON ÉXITO (1)');
    expect(html).toContain('✅');
    expect(html).not.toContain('DUPLICADOS OMITIDOS');
    expect(html).not.toContain('RECHAZADOS / ERRORES');
  });
});
