const fs = require('fs');

const filePath = './src/app/documents/page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the section where we process each document (around line 382)
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Actualizar cada documento')) {
        startIdx = i;
        console.log(`✅ Found update section at line ${i + 1}`);
        break;
    }
}

if (startIdx === -1) {
    console.log('❌ No se encontró la sección de actualización');
    process.exit(1);
}

// Find the line where we search for the document
let docFindIdx = -1;
for (let i = startIdx; i < startIdx + 20; i++) {
    if (lines[i] && lines[i].includes('const doc = documents.find')) {
        docFindIdx = i;
        break;
    }
}

if (docFindIdx === -1) {
    console.log('❌ No se encontró la línea de búsqueda del documento');
    process.exit(1);
}

console.log(`Found doc search at line ${docFindIdx + 1}`);

// Add logic to detect source tab AFTER finding the document
// Find the line after the "if (!doc)" block ends
let insertIdx = -1;
for (let i = docFindIdx; i < docFindIdx + 10; i++) {
    if (lines[i] && lines[i].includes('// Extraer tipo base')) {
        insertIdx = i;
        break;
    }
}

if (insertIdx === -1) {
    console.log('❌ No se encontró el lugar para insertar la detección de tab');
    process.exit(1);
}

console.log(`Will insert source tab detection before line ${insertIdx + 1}`);

// Insert the source tab detection logic
const newLines = [
    '',
    '        // 🆕 Determinar de qué tab viene el documento',
    '        const enEmitidas = facturasEmitidas.some(d => d.id_documento === docId);',
    '        const enRecibidas = facturasRecibidas.some(d => d.id_documento === docId);',
    '        ',
    '        let direccionActual: string | null = null;',
    '        if (enEmitidas) {',
    '          direccionActual = \'Emitida\';',
    '        } else if (enRecibidas) {',
    '          direccionActual = \'Recibida\';',
    '        } else {',
    '          console.warn(`⚠️ [Drag] Documento #${docId} no está en ninguna tab conocida`);',
    '          skipped++;',
    '          continue;',
    '        }',
    '        ',
    '        // Si el documento ya está en el tab de destino, skip',
    '        if ((targetTab === \'emitidas\' && direccionActual === \'Emitida\') ||',
    '            (targetTab === \'recibidas\' && direccionActual === \'Recibida\')) {',
    '          console.log(`⏭️ [Drag] Doc #${docId} ya está en tab "${targetTab}", skip`);',
    '          skipped++;',
    '          continue;',
    '        }',
    '',
];

lines.splice(insertIdx, 0, ...newLines);

// Now we need to update the tipoBase extraction to use direccionActual
// Find and update the line that creates nuevoTipo
let nuevoTipoIdx = -1;
for (let i = insertIdx + 25; i < insertIdx + 40; i++) {
    if (lines[i] && lines[i].includes('const nuevoTipo =')) {
        nuevoTipoIdx = i;
        break;
    }
}

if (nuevoTipoIdx !== -1) {
    console.log(`Found nuevoTipo construction at line ${nuevoTipoIdx + 1}`);
    // The nuevoTipo line should already be correct, so we don't need to change it
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('✅ Lógica de detección de tab de origen agregada');
console.log('📝 Ahora detecta automáticamente si viene de Emitidas o Recibidas');
