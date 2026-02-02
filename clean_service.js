const fs = require('fs');
const path = "/home/flux1a/Descargas/gestor-antigravity/FluxDocsERPProd/src/services/document-service.ts";
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
console.log('Original lines:', lines.length);

// We want to remove the garbage block from line 3105 to 3830 (inclusive).
// Arrays are 0-indexed, so:
// Line 1 corresponds to index 0.
// Line 3105 corresponds to index 3104.
// Line 3830 corresponds to index 3829.

// Check boundaries
console.log('Check Start (Index 3104, Line 3105):', lines[3104]?.trim()); // Should be SELECT...
console.log('Check End (Index 3829, Line 3830):', lines[3829]?.trim()); // Should be '}'

if (lines[3104]?.trim().startsWith('SELECT') && lines[3829]?.trim() === '}') {
    console.log('Boundaries match expectations. slicing...');
    const part1 = lines.slice(0, 3104);
    const part2 = lines.slice(3830);
    const newContent = part1.join('\n') + '\n' + part2.join('\n');
    fs.writeFileSync(path, newContent);
    console.log('File updated. New lines:', newContent.split('\n').length);
} else {
    console.error('Boundaries did NOT match. Aborting.');
    console.log('Line 3105 IS:', lines[3104]);
    console.log('Line 3830 IS:', lines[3829]);
}
