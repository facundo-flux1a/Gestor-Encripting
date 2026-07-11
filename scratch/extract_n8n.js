const fs = require('fs');
const path = '/home/flux1a/Escritorio/examplespablo/Error flow 49 (en prod).json';

try {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const nodes = data.nodes || [];
  
  let summary = "# N8N Flow Summary\n\n";
  summary += `Total Nodes: ${nodes.length}\n\n`;
  
  const relevantNodes = nodes.filter(n => 
    n.type.includes('Code') || 
    n.type.includes('HttpRequest') || 
    n.type.includes('Switch') || 
    n.type.includes('MySql') ||
    n.type.includes('Postgres') ||
    n.type.includes('Gemini') ||
    n.type.includes('Wait')
  );
  
  for (const n of relevantNodes) {
    summary += `## Node: ${n.name} (${n.type})\n`;
    
    if (n.type.includes('Code') && n.parameters && n.parameters.jsCode) {
      summary += "### JavaScript Code:\n```javascript\n" + n.parameters.jsCode + "\n```\n";
    }
    if (n.type.includes('HttpRequest') && n.parameters) {
      summary += `### HTTP Request:\nURL: ${n.parameters.url}\nMethod: ${n.parameters.method}\n`;
    }
    if (n.type.includes('Wait') && n.parameters) {
      summary += `### Wait:\nAmount: ${n.parameters.amount} ${n.parameters.unit}\n`;
    }
    if ((n.type.includes('MySql') || n.type.includes('Postgres')) && n.parameters && n.parameters.query) {
      summary += "### SQL Query:\n```sql\n" + n.parameters.query + "\n```\n";
    }
    summary += "\n";
  }
  
  fs.writeFileSync('./n8n_summary.md', summary);
  console.log("Summary saved to ./n8n_summary.md");
} catch(e) {
  console.error("Error reading n8n json:", e);
}
