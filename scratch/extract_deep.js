const fs = require('fs');

const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const nodes = data.nodes || [];

let output = '# N8N Deep Analysis\n\n';

// 1. SPLIT IN BATCHES
const splitNodes = nodes.filter(n => n.type === 'n8n-nodes-base.splitInBatches');
output += '## Split In Batches Nodes\n';
splitNodes.forEach(n => {
    output += `- **${n.name}**: Batch Size = ${n.parameters?.batchSize || 'Default (1)'}\n`;
});

// 2. CODE NODES WITH BINARY OPERATIONS
const codeNodes = nodes.filter(n => n.type === 'n8n-nodes-base.code');
output += '\n## Code Nodes\n';

codeNodes.forEach(n => {
    const code = n.parameters?.jsCode || '';
    const hasBinary = code.includes('$binary') || code.includes('binary') || code.includes('Buffer');
    
    if (hasBinary || code.length > 500) {
        output += `### ${n.name} (Has Binary/Large Code)\n`;
        output += '```javascript\n' + code + '\n```\n\n';
    }
});

fs.writeFileSync('/home/flux1a/Escritorio/Gestor/FluxDocsERPProd/scratch/n8n_deep_analysis.md', output);
console.log('Analysis written to scratch/n8n_deep_analysis.md');
