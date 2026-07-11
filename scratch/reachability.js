const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json', 'utf8'));
const nodes = data.nodes || [];
const connections = data.connections || {};

// Build adjacency map
const nodeMap = {};
nodes.forEach(n => { nodeMap[n.name] = n; });

const outgoing = {};
nodes.forEach(n => { outgoing[n.name] = []; });

Object.entries(connections).forEach(([src, outputs]) => {
  if (outputs.main) {
    outputs.main.forEach(branch => {
      if (branch) branch.forEach(conn => {
        if (conn && conn.node) {
          outgoing[src] = outgoing[src] || [];
          outgoing[src].push(conn.node);
        }
      });
    });
  }
});

// BFS from Webhook1 to find all reachable nodes
const webhook = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
const reachable = new Set();

function bfs(start) {
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    (outgoing[current] || []).forEach(next => {
      if (!reachable.has(next)) queue.push(next);
    });
  }
}

bfs(webhook.name);

// Categorize all nodes
const activeReachable = [];
const orphanedActive = [];   // Not disabled, not reachable = dead nodes or backups
const disabled = [];
const stickyNotes = [];

nodes.forEach(n => {
  if (n.type === 'n8n-nodes-base.stickyNote') {
    stickyNotes.push(n.name);
    return;
  }
  if (n.disabled) {
    disabled.push(n.name);
    return;
  }
  if (reachable.has(n.name)) {
    activeReachable.push(n);
  } else {
    orphanedActive.push(n);
  }
});

console.log('=== REACHABILITY ANALYSIS ===\n');
console.log(`Total nodes: ${nodes.length}`);
console.log(`  → Sticky notes (ignored): ${stickyNotes.length}`);
console.log(`  → Disabled: ${disabled.length}`);
console.log(`  → Active + Reachable from Webhook: ${activeReachable.length}`);
console.log(`  → Active but UNREACHABLE (zombies/backups): ${orphanedActive.length}`);

console.log('\n=== ZOMBIE/BACKUP NODES (active but unreachable) ===');
orphanedActive.forEach(n => {
  const type = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'AI:');
  console.log(`  [${type}] ${n.name}`);
});

console.log('\n=== ACTIVE REACHABLE: breakdown by type ===');
const typeCounts = {};
activeReachable.forEach(n => {
  const type = n.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'AI:');
  typeCounts[type] = (typeCounts[type] || 0) + 1;
});
Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).forEach(([t,c]) => {
  console.log(`  ${t}: ${c}`);
});

// Export only the reachable nodes for further analysis
const reachableNames = [...reachable];
fs.writeFileSync('/home/flux1a/Escritorio/Gestor/FluxDocsERPProd/scratch/reachable_nodes.json',
  JSON.stringify({ reachable: reachableNames, zombies: orphanedActive.map(n=>n.name), disabled }, null, 2)
);
console.log('\n✅ Saved reachable_nodes.json');
