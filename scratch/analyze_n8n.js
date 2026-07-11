const fs = require('fs');

const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const nodes = data.nodes || [];
const connections = data.connections || {};

console.log(`Total nodes: ${nodes.length}`);

// Count by type
const typeCounts = {};
const httpUrls = new Set();
const activeNodes = [];
let disabledNodes = 0;

nodes.forEach(n => {
    if (n.disabled) {
        disabledNodes++;
        return;
    }
    activeNodes.push(n);
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;

    // For HTTP Request, let's extract URLs if easily available
    if (n.type === 'n8n-nodes-base.httpRequest') {
        const url = n.parameters?.url;
        if (url) {
            httpUrls.add(url);
        }
    }
});

console.log(`\nActive nodes: ${activeNodes.length}`);
console.log(`Disabled nodes: ${disabledNodes}`);

console.log('\nNode Types (Active):');
Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`- ${type}: ${count}`);
});

console.log('\nHTTP Request URLs (sample):');
Array.from(httpUrls).slice(0, 20).forEach(url => {
    console.log(`- ${url}`);
});

// Triggers
const triggers = activeNodes.filter(n => n.type.toLowerCase().includes('trigger') || n.type.toLowerCase().includes('webhook'));
console.log(`\nEntry points (Triggers/Webhooks): ${triggers.length}`);
triggers.forEach(t => console.log(`- ${t.name} (${t.type})`));

