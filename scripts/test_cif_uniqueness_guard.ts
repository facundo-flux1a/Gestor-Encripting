import assert from 'node:assert/strict';
import { normalizeCIF } from '../src/lib/utils';
import { DocumentUpdateSchema } from '../src/lib/types';

function runTests() {
  console.log('🧪 Iniciando tests de validación de unicidad de CIF (Emisor vs Receptor)...');

  // Test 1: normalizeCIF
  console.log('\n--- Test 1: normalizeCIF ---');
  assert.equal(normalizeCIF('ES B56214109'), 'B56214109', 'Failed ES prefix normalization');
  assert.equal(normalizeCIF('b-56214109'), 'B56214109', 'Failed lowercase & dash normalization');
  assert.equal(normalizeCIF(' A12345678 '), 'A12345678', 'Failed whitespace normalization');
  assert.equal(normalizeCIF(null), null, 'Failed null handling');
  assert.equal(normalizeCIF(''), null, 'Failed empty string handling');
  console.log('✅ normalizeCIF pasó todas las verificaciones');

  const basePayload = {
    numero_documento: 'FACT-2026-001',
    fecha_emision: '2026-02-10',
    base_imponible: 100,
    total: 121,
    tipo_documento: 'Factura Recibida',
    fecha_vencimiento: null,
    moneda: 'EUR',
    observaciones: null,
    entidades: [],
    lineas: [],
    iva_details: []
  };

  // Test 2: Mismo CIF en emisor y receptor vía campos cif y cliente_cif -> Debe Fallar
  console.log('\n--- Test 2: Schema rejection con CIF idéntico (campos directos) ---');
  const payloadSameCifDirect = {
    ...basePayload,
    cif: 'B56214109',
    cliente_cif: 'ES B-56214109'
  };
  const resSameDirect = DocumentUpdateSchema.safeParse(payloadSameCifDirect);
  assert.equal(resSameDirect.success, false, 'Schema debería haber fallado con CIF idéntico');
  if (!resSameDirect.success) {
    const errorMsg = resSameDirect.error.errors[0]?.message || '';
    console.log('  Mensaje de error capturado:', errorMsg);
    assert.ok(errorMsg.includes('idénticos'), 'Mensaje de error incorrecto');
  }
  console.log('✅ Rechazo de CIFs idénticos (campos directos) verificado');

  // Test 3: Mismo CIF en entidades (array) -> Debe Fallar
  console.log('\n--- Test 3: Schema rejection con CIF idéntico en array entidades ---');
  const payloadSameCifEntities = {
    ...basePayload,
    entidades: [
      { rol: 'emisor', nombre: 'Empresa A', identificador_fiscal: 'B12345678', direccion: null, telefono: null, email: null, datos_extra: null },
      { rol: 'receptor', nombre: 'Empresa B', identificador_fiscal: 'ES-B12345678', direccion: null, telefono: null, email: null, datos_extra: null }
    ]
  };
  const resSameEntities = DocumentUpdateSchema.safeParse(payloadSameCifEntities);
  assert.equal(resSameEntities.success, false, 'Schema debería haber fallado con CIF idéntico en array entidades');
  if (!resSameEntities.success) {
    console.log('  Mensaje de error capturado:', resSameEntities.error.errors[0]?.message);
  }
  console.log('✅ Rechazo de CIFs idénticos (array entidades) verificado');

  // Test 4: CIFs distintos -> Debe Pasar
  console.log('\n--- Test 4: Schema validation con CIFs distintos ---');
  const payloadDifferentCif = {
    ...basePayload,
    cif: 'B56214109',
    cliente_cif: 'A98765432'
  };
  const resDifferent = DocumentUpdateSchema.safeParse(payloadDifferentCif);
  assert.equal(resDifferent.success, true, 'Schema debería haber pasado con CIFs distintos');
  console.log('✅ Aceptación de CIFs distintos verificado');

  // Test 5: Ticket sin CIF receptor -> Debe Pasar
  console.log('\n--- Test 5: Ticket o simplificada (Receptor sin CIF) ---');
  const payloadTicket = {
    ...basePayload,
    cif: 'B56214109',
    cliente_cif: undefined,
    entidades: [
      { rol: 'emisor', nombre: 'Supermercado SL', identificador_fiscal: 'B56214109', direccion: null, telefono: null, email: null, datos_extra: null }
    ]
  };
  const resTicket = DocumentUpdateSchema.safeParse(payloadTicket);
  assert.equal(resTicket.success, true, 'Schema debería haber pasado para Ticket sin receptor CIF');
  console.log('✅ Aceptación de tickets sin receptor CIF verificado');

  console.log('\n🎉 TODOS LOS TESTS FINALIZARON CON ÉXITO Y PASARON DE FORMA ESTRICTA');
}

runTests();
