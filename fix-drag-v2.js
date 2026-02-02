const fs = require('fs');

const filePath = './src/components/ui/data-table.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Split into lines preserving line endings
const lines = content.split('\n');

// Find the line with the condition we need to change (should be around line 250)
let modified = false;
for (let i = 0; i < lines.length; i++) {
    // Look for the exact condition
    if (lines[i].includes('if (onDragStartCallback && rowSelection && data)')) {
        console.log(`✅ Found target line at ${i + 1}: ${lines[i].trim()}`);
        // Replace just this condition
        lines[i] = lines[i].replace(
            'if (onDragStartCallback && rowSelection && data)',
            'if (onDragStartCallback)'
        );

        // Now we need to modify the logic inside
        // Find the closing brace of this if block
        let braceCount = 0;
        let startIdx = i + 1;
        let endIdx = i + 1;

        for (let j = i; j < lines.length; j++) {
            const line = lines[j];
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;

            if (braceCount === 0 && j > i) {
                endIdx = j;
                break;
            }
        }

        console.log(`Block spans from line ${startIdx + 1} to ${endIdx + 1}`);

        // Replace the block content
        const newBlock = [
            '      let selectedIds = [];',
            '      ',
            '      // Si hay selección múltiple, usar esos IDs',
            '      if (rowSelection && data && Object.keys(rowSelection).length > 0) {',
            '        selectedIds = Object.keys(rowSelection)',
            '          .map(key => data[parseInt(key)]?.id_documento)',
            '          .filter(id => id !== undefined);',
            '        console.log(\'📤 [DraggableTableRow] Arrastrando selección múltiple:\', selectedIds);',
            '      } ',
            '      // Si no hay selección, usar solo el documento actual',
            '      else {',
            '        selectedIds = [doc.id_documento];',
            '        console.log(\'📤 [DraggableTableRow] Arrastrando documento individual:\', doc.id_documento);',
            '      }',
            '      ',
            '      if (selectedIds.length > 0) {',
            '        onDragStartCallback(selectedIds);',
            '      }',
        ];

        // Replace lines from startIdx to endIdx-1 with newBlock
        lines.splice(startIdx, endIdx - startIdx, ...newBlock);
        modified = true;
        break;
    }
}

if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('✅ Archivo actualizado correctamente');
} else {
    console.log('❌ No se encontró la línea objetivo');
    // Try to find similar lines
    for (let i = 245; i < 255; i++) {
        if (lines[i]) {
            console.log(`Line ${i + 1}: ${lines[i].substring(0, 80)}`);
        }
    }
}
