const fs = require('fs');
const raw = fs.readFileSync('/home/flux1a/Escritorio/genc/Error flow 49 (en prod).json', 'utf8');
const data = JSON.parse(raw);

const keyAnalistas = ['Analista33', 'Analista28', 'Analista37', 'Analista6', 'Analista38', 'Analista40'];
let out = '';

for (const name of keyAnalistas) {
  const node = data.nodes.find(n => n.name === name);
  if (!node) { out += name + ': NOT FOUND\n\n'; continue; }
  const jsonBody = node.parameters.jsonBody || '';
  // Match the text field - it's the first "text" key in the parts array
  const match = jsonBody.match(/"text":\s*"([\s\S]+?)(?:",\s*"inlineData|",\s*"fileData|"\s*\}\s*\])/);
  if (match) {
    out += '=== ' + name + ' ===\n';
    // Decode double-escaped sequences from n8n JSON string
    const decoded = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    out += decoded + '\n\n---\n\n';
  } else {
    out += '=== ' + name + ' === (regex no match)\n';
    out += jsonBody.substring(0, 300) + '\n\n---\n\n';
  }
}

fs.writeFileSync('/home/flux1a/Escritorio/genc/Gestor-Encripting/n8n_active_prompts.txt', out);
console.log('Done. File length:', out.length);
