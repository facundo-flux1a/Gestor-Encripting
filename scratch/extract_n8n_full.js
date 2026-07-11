const fs = require('fs');
const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';

try {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const nodes = data.nodes || [];
  
  let summary = "# N8N Flow Summary\n\n";
  summary += `Total Nodes: ${nodes.length}\n\n`;
  
  for (const n of nodes) {
    summary += `## Node: ${n.name} (Type: ${n.type})\n`;
    
    if (n.parameters) {
      if (n.parameters.jsCode) {
        summary += "### JavaScript Code:\n```javascript\n" + n.parameters.jsCode + "\n```\n";
      } else if (n.parameters.query) {
        summary += "### SQL Query:\n```sql\n" + n.parameters.query + "\n```\n";
      } else if (n.parameters.url) {
        summary += `### HTTP Request:\nURL: ${n.parameters.url}\nMethod: ${n.parameters.method}\n`;
      } else if (n.parameters.amount) {
        summary += `### Wait:\nAmount: ${n.parameters.amount} ${n.parameters.unit}\n`;
      } else {
        const params = { ...n.parameters };
        delete params.options;
        summary += "### Parameters:\n```json\n" + JSON.stringify(params, null, 2) + "\n```\n";
      }
    }
    summary += "\n";
  }
  
  fs.writeFileSync('./n8n_summary_full.md', summary);
  console.log("Summary saved to ./n8n_summary_full.md");
} catch(e) {
  console.error("Error reading n8n json:", e);
}
