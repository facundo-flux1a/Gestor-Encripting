const fs = require('fs');
const path = require('path');

const sensitiveFields = [
  'nombre', 'email', 'phone', 'telefono', 'nombre_de_empresa', 'nombre_fiscal', 'cif',
  'mail_de_carga', 'direccion', 'identificador_fiscal', 'nombre_archivo', 'ruta_archivo'
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let matches = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Find db.query or connection.query and the following 15 lines to catch the query string
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('db.query') || lines[i].includes('connection.query')) {
      // Look ahead up to 30 lines
      const snippet = lines.slice(Math.max(0, i - 2), i + 30).join('\n').toLowerCase();
      
      const foundFields = sensitiveFields.filter(f => snippet.includes(f.toLowerCase()));
      if (foundFields.length > 0) {
         matches.push({
           file,
           line: i + 1,
           fields: foundFields,
           snippet: snippet
         });
      }
    }
  }
});

fs.writeFileSync('deep_search_results.json', JSON.stringify(matches, null, 2));
console.log(`Found ${matches.length} possible spots.`);
