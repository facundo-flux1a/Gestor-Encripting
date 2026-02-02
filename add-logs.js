const fs = require('fs');

const filePath = './src/app/documents/page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the line with the error log (around line 440)
let errorIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('console.error(`❌ [Drag] Error actualizando doc')) {
        errorIdx = i;
        break;
    }
}

if (errorIdx === -1) {
    console.log('❌ No se encontró la línea de error');
    process.exit(1);
}

console.log(`Found error log at line ${errorIdx + 1}`);

// Replace the error log to include response details
lines[errorIdx] = lines[errorIdx].replace(
    'console.error(`❌ [Drag] Error actualizando doc #${docId}`);',
    'const errorText = await response.text();\n          console.error(`❌ [Drag] Error actualizando doc #${docId}: ${response.status} ${response.statusText}`, errorText);'
);

// Also log the nuevo tipo before the API call for debugging
let logIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('console.log(`🔄 [Drag] Doc #${docId}:')) {
        logIdx = i;
        break;
    }
}

if (logIdx !== -1) {
    console.log(`Found log line at ${logIdx + 1}`);
    // Add a log just before the API call
    const apiCallIdx = logIdx + 2; // Should be right after the log
    lines.splice(apiCallIdx, 0, '        console.log(`📤 [API] Enviando PATCH /api/documents/${docId} con:`, { tipo_documento: nuevoTipo });');
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('✅ Logs mejorados agregados');
