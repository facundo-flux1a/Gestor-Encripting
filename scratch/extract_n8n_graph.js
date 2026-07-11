const fs = require('fs');
const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';

try {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const nodes = data.nodes || [];
  const connections = data.connections || {};
  
  let out = "# N8N Flow Graph\n\n";
  
  // Create a map of node id/name to node
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.name] = n);
  
  out += "## Connections\n";
  for (const [sourceNode, outPuts] of Object.entries(connections)) {
    if (outPuts.main) {
      outPuts.main.forEach((outputConnections, outputIndex) => {
        if (outputConnections) {
          outputConnections.forEach(conn => {
            out += `- ${sourceNode} [Output ${outputIndex}] -> ${conn.node}\n`;
          });
        }
      });
    }
  }
  
  fs.writeFileSync('./n8n_graph.md', out);
  console.log("Graph saved to n8n_graph.md");
} catch(e) {
  console.error("Error reading n8n json:", e);
}
