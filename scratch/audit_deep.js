const fs = require('fs');

const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const nodes = data.nodes || [];
const connections = data.connections || {};

// Build a proper connection map to understand execution order
const nodeMap = {};
nodes.forEach(n => { nodeMap[n.name] = n; });

// Find all nodes that connect to each node (incoming)
const incomingMap = {};
const outgoingMap = {};
nodes.forEach(n => {
  incomingMap[n.name] = [];
  outgoingMap[n.name] = [];
});

Object.entries(connections).forEach(([sourceName, outputs]) => {
  if (outputs.main) {
    outputs.main.forEach((outputBranch, branchIdx) => {
      if (outputBranch) {
        outputBranch.forEach(conn => {
          if (conn && conn.node) {
            outgoingMap[sourceName] = outgoingMap[sourceName] || [];
            outgoingMap[sourceName].push({ to: conn.node, branch: branchIdx });
            incomingMap[conn.node] = incomingMap[conn.node] || [];
            incomingMap[conn.node].push({ from: sourceName, branch: branchIdx });
          }
        });
      }
    });
  }
});

// ---- 1. Map the main execution path from Webhook ----
console.log('===== MAIN EXECUTION PATH FROM WEBHOOK =====');
const webhook = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
function traceFlow(nodeName, depth = 0, visited = new Set()) {
  if (visited.has(nodeName) || depth > 30) return;
  visited.add(nodeName);
  const node = nodeMap[nodeName];
  if (!node) return;
  const type = node.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'AI:');
  const disabled = node.disabled ? ' [DISABLED]' : '';
  const out = outgoingMap[nodeName] || [];
  console.log(`${'  '.repeat(depth)}→ [${type}] ${nodeName}${disabled} (${out.length} outputs)`);
  out.forEach(o => traceFlow(o.to, depth + 1, visited));
}
traceFlow(webhook.name);

// ---- 2. All DB Update nodes with their queries ----
console.log('\n\n===== MYSQL NODES: STATUS UPDATES =====');
const mysqlNodes = nodes.filter(n => n.type === 'n8n-nodes-base.mySql' && !n.disabled);
const statusUpdateNodes = mysqlNodes.filter(n => {
  const q = (n.parameters?.query || '').toLowerCase();
  return q.includes('status') || q.includes('estado') || q.includes('progreso') || q.includes('upload_progress') || q.includes('procesando');
});
statusUpdateNodes.forEach(n => {
  console.log(`\n[${n.name}]:`);
  console.log(n.parameters?.query?.substring(0, 300));
});

// ---- 3. HTTP calls to upload-progress ----
console.log('\n\n===== HTTP CALLS TO UPLOAD-PROGRESS =====');
const httpNodes = nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest' && !n.disabled);
const progressNodes = httpNodes.filter(n => (n.parameters?.url || '').includes('upload-progress'));
progressNodes.forEach(n => {
  console.log(`\n[${n.name}]: ${n.parameters?.url}`);
  console.log('Body:', JSON.stringify(n.parameters?.body || n.parameters?.bodyParameters || {}).substring(0, 300));
});

// ---- 4. HTTP calls to Gemini ----
console.log('\n\n===== GEMINI CALLS (count and distinct prompts) =====');
const geminiNodes = httpNodes.filter(n => (n.parameters?.url || '').includes('gemini') || (n.parameters?.url || '').includes('aiplatform'));
console.log(`Total Gemini HTTP nodes: ${geminiNodes.length}`);
geminiNodes.forEach(n => {
  const bodyContent = JSON.stringify(n.parameters?.body || {});
  // Extract system instruction if present
  const sysMatch = bodyContent.match(/"systemInstruction.*?text":"([^"]{0,200})/);
  console.log(`\n[${n.name}]`);
  if (sysMatch) console.log('System hint:', sysMatch[1]);
});

// ---- 5. AI / Classifier nodes ----
console.log('\n\n===== AI CLASSIFIER NODES =====');
const aiNodes = nodes.filter(n => n.type.includes('textClassifier') || n.type.includes('langchain'));
aiNodes.forEach(n => {
  console.log(`\n[${n.name}] (${n.type})`);
  console.log(JSON.stringify(n.parameters || {}).substring(0, 400));
});

// ---- 6. S3/MinIO nodes ----
console.log('\n\n===== S3/MINIO NODES =====');
const s3Nodes = nodes.filter(n => n.type === 'n8n-nodes-base.s3' && !n.disabled);
s3Nodes.forEach(n => {
  console.log(`[${n.name}]: action=${n.parameters?.operation}, bucket=${n.parameters?.bucketName}, fileName=${n.parameters?.fileName?.value || n.parameters?.fileName}`);
});

// ---- 7. Wait nodes ----
console.log('\n\n===== WAIT NODES =====');
const waitNodes = nodes.filter(n => n.type === 'n8n-nodes-base.wait' && !n.disabled);
waitNodes.forEach(n => {
  console.log(`[${n.name}]: unit=${n.parameters?.unit}, amount=${n.parameters?.amount}`);
});

// ---- 8. Switch/IF logic (branch analysis) ----
console.log('\n\n===== DECISION NODES (IF/Switch) =====');
const decisionNodes = nodes.filter(n => (n.type === 'n8n-nodes-base.if' || n.type === 'n8n-nodes-base.switch') && !n.disabled);
decisionNodes.slice(0, 15).forEach(n => {
  const cond = n.parameters?.conditions || n.parameters?.rules || {};
  console.log(`\n[${n.name}] (${n.type.replace('n8n-nodes-base.', '')})`);
  console.log(JSON.stringify(cond).substring(0, 300));
});

