const fs = require('fs');

const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const nodes = data.nodes || [];

const webhook = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
console.log("=== WEBHOOK CONFIG ===");
console.log(JSON.stringify(webhook, null, 2));

const mysqlNodes = nodes.filter(n => n.type === 'n8n-nodes-base.mySql');
console.log("\n=== SAMPLE MYSQL QUERIES ===");
mysqlNodes.slice(0, 5).forEach(n => console.log(n.parameters?.query || n.parameters?.operation));

const codeNodes = nodes.filter(n => n.type === 'n8n-nodes-base.code');
console.log("\n=== SAMPLE CODE NODES ===");
codeNodes.slice(0, 2).forEach(n => console.log(n.name));
