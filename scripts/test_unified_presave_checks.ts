import assert from 'node:assert/strict';
import { DocumentUpdateSchema, PreSaveIssue } from '../src/lib/types';
import { normalizeCIF } from '../src/lib/utils';
import { checkTipoMismatch, checkMathBalance } from '../src/lib/presave-validations';

console.log('🧪 Running Unified Pre-Save Validation Unit Tests...\n');

// ── Test 1: V4 Fecha Vencimiento < Fecha Emisión (Zod level) ──────────────
{
  console.log('▶ Test 1: V4 Fecha Vencimiento < Fecha Emisión (Zod schema)');
  const invalidPayload = {
    numero_documento: 'INV-101',
    tipo_documento: 'FACTURA RECIBIDA',
    fecha_emision: '2026-08-10',
    fecha_vencimiento: '2026-08-01', // Invalid: Vencimiento before Emisión
    moneda: 'EUR',
    observaciones: null,
    base_imponible: 100,
    total: 121,
    entidades: [
      { rol: 'emisor', nombre: 'Proveedor SA', identificador_fiscal: 'B11111111', direccion: null, telefono: null, email: null },
      { rol: 'receptor', nombre: 'Cliente SL', identificador_fiscal: 'B22222222', direccion: null, telefono: null, email: null }
    ],
    lineas: [],
    iva_details: [],
  };


  const result = DocumentUpdateSchema.safeParse(invalidPayload);
  assert.equal(result.success, false, 'Expected Zod validation to fail for vencimiento < emision');

  if (!result.success) {
    const vencError = result.error.issues.find(i => i.path.includes('fecha_vencimiento'));

    assert.ok(vencError, 'Expected issue on path fecha_vencimiento');
    assert.equal(vencError?.message, 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
    console.log('  ✅ Correctly blocked invalid fecha_vencimiento in Zod schema');
  }

}

// ── Test 2: V1 Real Call to checkTipoMismatch ─────────────────────────────
{
  console.log('▶ Test 2: V1 Real function call to checkTipoMismatch');
  const issue = checkTipoMismatch({
    tipoDocumento: 'FACTURA RECIBIDA', // Wrong! Company is emisor, so must be FACTURA EMITIDA
    total: 250.00,
    empresaCIF: 'B87654321',
    empresaNombre: 'Empresa Test SL',
    entidades: [
      { rol: 'emisor', identificador_fiscal: 'B87654321' },
      { rol: 'receptor', identificador_fiscal: 'B12345678' }
    ]
  });

  assert.ok(issue, 'Expected an issue to be returned for type mismatch');
  assert.equal(issue?.type, 'TIPO_MISMATCH');
  assert.equal(issue?.blocking, true);
  assert.equal(issue?.suggestedValue, 'FACTURA EMITIDA');
  console.log(`  ✅ Real checkTipoMismatch returned: suggestedValue="${issue?.suggestedValue}" (blocking=${issue?.blocking})`);
}

// ── Test 3: V2 Real Call to checkMathBalance ──────────────────────────────
{
  console.log('▶ Test 3: V2 Real function call to checkMathBalance');
  const issue = checkMathBalance({
    total: 150.00,
    baseImponible: 100.00,
    ivaDetails: [
      { tipo_impuesto: 'IVA 21%', cuota: 21.00 }
    ] // 100 + 21 = 121 != 150 (diff: 29.00)
  });

  assert.ok(issue, 'Expected an issue to be returned for math mismatch');
  assert.equal(issue?.type, 'MATH_MISMATCH');
  assert.equal(issue?.blocking, false);
  assert.match(issue?.description || '', /29\.00/);
  console.log(`  ✅ Real checkMathBalance returned: description="${issue?.description}"`);
}

// ── Test 4: CIF Normalization correctness ─────────────────────────────────
{
  console.log('▶ Test 4: CIF Normalization correctness');
  assert.equal(normalizeCIF('ES-B12345678'), 'B12345678');
  assert.equal(normalizeCIF('b-12345678 '), 'B12345678');
  assert.equal(normalizeCIF(''), null);
  console.log('  ✅ CIF Normalization works as expected');
}

console.log('\n🎉 ALL GENUINE UNIFIED PRE-SAVE UNIT TESTS PASSED SUCCESSFULLY!');
