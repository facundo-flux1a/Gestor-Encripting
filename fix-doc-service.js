const fs = require('fs');
const path = '/home/flux1a/Descargas/gestor-antigravity/FluxDocsERPProd/src/services/document-service.ts';

console.log('Reading file...');
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

console.log(`Total lines: ${lines.length}`);

// Remove lines from 3117 to 38 46 (inclusive, 0-indexed = 3116 to 3845)
const startRemove = 3116; // Line 3117 in 1-indexed
const endRemove = 3845;   // Line 3846 in 1-indexed

console.log(`Removing lines ${startRemove + 1} to ${endRemove + 1}...`);

const before = lines.slice(0, startRemove);
const after = lines.slice(endRemove + 1);

const newContent = [...before, ...after].join('\n');

fs.writeFileSync(path, newContent, 'utf8');

console.log(`✅ File cleaned! New line count: ${before.length + after.length}`);
