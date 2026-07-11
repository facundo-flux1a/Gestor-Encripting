/**
 * Extrae los casos de test reales del pinData de n8n y los vuelca como fixtures.
 * Correr una sola vez: node scratch/extract_golden.js
 */
const fs = require('fs');
const path = require('path');

const N8N_FLOW = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';
const OUT_DIR = path.join(__dirname, '../tests/golden');

fs.mkdirSync(OUT_DIR, { recursive: true });

const data = JSON.parse(fs.readFileSync(N8N_FLOW, 'utf8'));
const pinData = data.pinData || {};

function getItem(pin) {
  return Array.isArray(pin) ? pin[0].json : pin.json;
}
function getText(pin) {
  const item = Array.isArray(pin) ? pin[0] : pin;
  return item?.json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ─── 1. Webhook input ───────────────────────────────────────────
const webhookBody = getItem(pinData['Webhook1'])?.body;
fs.writeFileSync(path.join(OUT_DIR, 'webhook_input.json'),
  JSON.stringify(webhookBody, null, 2));

// ─── 2. Gemini responses (raw text) ─────────────────────────────
const geminiNodes = {
  'simple_facturable_single':    'Analista',      // Abono emitido — único
  'classifier_facturable':       'Analista4',     // Clasificador facturable/no-facturable
  'classifier_paginator':        'Analista25',    // Paginador de múltiples
  'non_facturable_extractor':    'Analista32',    // Extractor no facturable
  'multiple_extractor_page':     'Analista37',    // Extractor en loop de múltiples
};

const geminiFixtures = {};
for (const [alias, nodeName] of Object.entries(geminiNodes)) {
  if (pinData[nodeName]) {
    const text = getText(pinData[nodeName]);
    if (text) {
      geminiFixtures[alias] = text;
      // Try to parse as JSON for cleaner fixture
      try {
        // n8n responses often have ```json ... ``` wrapping
        const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        geminiFixtures[alias + '_parsed'] = JSON.parse(clean);
      } catch (_) { /* raw text only */ }
    }
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'gemini_responses.json'),
  JSON.stringify(geminiFixtures, null, 2));

// ─── 3. DB insertion results (expected outputs) ─────────────────
const dbResults = {
  'insert_success_indeterminate': getItem(pinData['Insertar documento3']),
  'insert_success_non_facturable': getItem(pinData['Insertar documento24']),
  'insert_duplicate_hash': getItem(pinData['Insertar documento27']),
};
fs.writeFileSync(path.join(OUT_DIR, 'db_expected_results.json'),
  JSON.stringify(dbResults, null, 2));

// ─── 4. Non-facturable code node output (Code23) ─────────────────
if (pinData['Code23']) {
  fs.writeFileSync(path.join(OUT_DIR, 'non_facturable_normalized.json'),
    JSON.stringify(getItem(pinData['Code23']), null, 2));
}

// ─── 5. Summary ──────────────────────────────────────────────────
console.log('✅ Golden dataset extracted to tests/golden/');
console.log('   webhook_input.json          →', webhookBody ? 'OK' : 'MISSING');
console.log('   gemini_responses.json       →', Object.keys(geminiFixtures).length, 'responses');
console.log('   db_expected_results.json    →', Object.keys(dbResults).filter(k => dbResults[k]).length, '/3 results');
console.log('   non_facturable_normalized.json →', pinData['Code23'] ? 'OK' : 'MISSING');

console.log('\n📋 Webhook input summary:');
if (webhookBody) {
  console.log('   empresaId:', webhookBody.empresaId);
  console.log('   uploadId:', webhookBody.uploadId);
  console.log('   fileName:', webhookBody.fileName);
  console.log('   isCompressed:', webhookBody.isCompressedFile);
}
