const fs = require('fs');

const filePath = './src/app/documents/page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find and replace the validation logic (around line 395)
let modified = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (!tipoBase || tipoBase.toLowerCase() === tipoActual.toLowerCase())')) {
        console.log(`✅ Found target validation at line ${i + 1}`);

        // Replace the condition
        lines[i] = lines[i].replace(
            'if (!tipoBase || tipoBase.toLowerCase() === tipoActual.toLowerCase())',
            'if (!tipoBase || tipoBase.length < 3)'
        );

        // Update the warning message on the next line
        if (lines[i + 1] && lines[i + 1].includes('no tiene tipo clasificable')) {
            lines[i + 1] = lines[i + 1].replace(
                'no tiene tipo clasificable',
                'no tiene tipo válido'
            );
        }

        modified = true;
        break;
    }
}

if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('✅ Validación actualizada correctamente');
    console.log('📝 Ahora los documentos tipo "Factura" o "Abono" (sin Emitida/Recibida) se pueden clasificar');
} else {
    console.log('❌ No se encontró la validación objetivo');
    // Show nearby lines for debugging
    for (let i = 390; i < 400; i++) {
        if (lines[i]) {
            console.log(`Line ${i + 1}: ${lines[i].substring(0, 100)}`);
        }
    }
}
