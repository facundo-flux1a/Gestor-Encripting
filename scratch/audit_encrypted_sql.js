import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const encryptedTables = {
  usuarios: ['nombre', 'email', 'phone'],
  empresas: ['nombre_de_empresa', 'nombre_fiscal', 'mail_de_carga'],
  entidades_documento: ['nombre', 'direccion', 'identificador_fiscal', 'telefono', 'email'],
  invitaciones_empresa: ['email'],
  archivos_documento: ['nombre_archivo', 'ruta_archivo'],
  documentos_auditoria: ['detalle', 'usuario'],
  eventos_sistema: ['metadata', 'usuario']
};

const srcDir = path.join(__dirname, '../src');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, callback);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      callback(fullPath);
    }
  }
}

let affectedFiles = new Set();
let findings = [];

walkDir(srcDir, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('.query(') || content.includes('.query<')) {
    
    for (const [table, fields] of Object.entries(encryptedTables)) {
      if (content.includes(table)) {
        
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(table)) {
            let touchesField = false;
            let touchedFields = [];
            
            if (line.includes('SELECT *') || line.includes('SELECT  *')) {
                touchesField = true;
                touchedFields.push('* (ALL FIELDS)');
            } else {
                for (const field of fields) {
                  const contextWindow = lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 10)).join('\n');
                  if (contextWindow.includes(field)) {
                    touchesField = true;
                    touchedFields.push(field);
                  }
                }
            }

            if (touchesField) {
              const relPath = path.relative(path.join(__dirname, '..'), filePath);
              findings.push({
                file: relPath,
                line: i + 1,
                table,
                fields: touchedFields.filter((v, i, a) => a.indexOf(v) === i),
                snippet: line.trim()
              });
              affectedFiles.add(relPath);
            }
          }
        }
      }
    }
  }
});

console.log(`\n\n=== 🔎 DEEP AUDIT RESULTS ===`);
console.log(`Found ${findings.length} occurrences in ${affectedFiles.size} files.\n`);

findings.forEach(f => {
  console.log(`📄 ${f.file}:${f.line}`);
  console.log(`   Table: ${f.table} | Encrypted Fields: ${f.fields.join(', ')}`);
  console.log(`   Snippet: ${f.snippet}`);
  console.log(`---------------------------------------------------`);
});

console.log(`\nDone.`);
