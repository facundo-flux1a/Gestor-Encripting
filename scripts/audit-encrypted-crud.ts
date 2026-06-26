import * as fs from 'fs';
import * as path from 'path';

// Mapa de tablas y sus columnas encriptadas
const ENCRYPTED_SCHEMA = {
  usuarios: ['nombre', 'email', 'phone'],
  empresas: ['nombre_de_empresa', 'nombre_fiscal', 'mail_de_carga'],
  entidades_documento: ['nombre', 'direccion', 'identificador_fiscal', 'telefono', 'email'],
  invitaciones_empresa: ['email'],
  archivos_documento: ['nombre_archivo', 'ruta_archivo'],
  documentos_auditoria: ['detalle', 'usuario'],
  eventos_sistema: ['metadata', 'usuario']
};

const SRC_DIR = path.join(__dirname, '../src');

// Clasificar el tipo de operación CRUD basada en el inicio de la query (heurística básica)
function detectCrudOperation(snippet: string): string {
  const upper = snippet.toUpperCase();
  if (upper.includes('SELECT') || upper.includes('JOIN')) return 'READ (SELECT/JOIN)';
  if (upper.includes('UPDATE')) return 'UPDATE';
  if (upper.includes('INSERT')) return 'CREATE (INSERT)';
  if (upper.includes('DELETE')) return 'DELETE';
  return 'UNKNOWN';
}

function walkDir(dir: string, callback: (filePath: string) => void) {
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

console.log(`\n🕵️‍♂️ INICIANDO AUDITORÍA CRUD DE CAMPOS ENCRIPTADOS...`);
console.log(`Escaneando directorio: ${SRC_DIR}\n`);

let findings: any[] = [];
let affectedFiles = new Set<string>();

walkDir(SRC_DIR, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Buscar cualquier ejecución de SQL crudo
  if (
    content.includes('.query(') || 
    content.includes('.query<') || 
    content.includes('$queryRaw') || 
    content.includes('$executeRaw')
  ) {
    
    // Validar contra cada tabla encriptada
    for (const [table, fields] of Object.entries(ENCRYPTED_SCHEMA)) {
      if (content.includes(table)) {
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.includes(table)) {
            let touchesEncryptedField = false;
            let touchedFields: string[] = [];
            
            // Caso 1: Hace un SELECT * (trae toda la basura encriptada)
            if (line.includes('SELECT *') || line.includes('SELECT  *')) {
                touchesEncryptedField = true;
                touchedFields.push('* (TODOS LOS CAMPOS ENCRIPTADOS)');
            } else {
                // Caso 2: Busca campos específicos en una ventana de contexto de la query
                for (const field of fields) {
                  // Tomamos 10 líneas arriba y abajo para agarrar queries multilinea
                  const contextWindow = lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 15)).join('\n');
                  if (contextWindow.includes(field)) {
                    touchesEncryptedField = true;
                    touchedFields.push(field);
                  }
                }
            }

            if (touchesEncryptedField) {
              const relPath = path.relative(path.join(__dirname, '..'), filePath);
              const contextSnippet = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n').trim();
              const operation = detectCrudOperation(contextSnippet);

              findings.push({
                file: relPath,
                line: i + 1,
                table,
                operation,
                fields: touchedFields.filter((v, idx, a) => a.indexOf(v) === idx), // unique
                snippet: contextSnippet
              });
              affectedFiles.add(relPath);
            }
          }
        }
      }
    }
  }
});

console.log(`=== 📊 RESULTADOS DE LA AUDITORÍA CRUD ===\n`);

if (findings.length === 0) {
    console.log(`✅ ¡Felicidades! No se encontraron operaciones CRUD vulnerables sobre campos encriptados.\n`);
} else {
    // Agrupar por tipo de operación
    const byOperation = findings.reduce((acc, f) => {
        if (!acc[f.operation]) acc[f.operation] = [];
        acc[f.operation].push(f);
        return acc;
    }, {});

    for (const [op, items] of Object.entries(byOperation)) {
        console.log(`\n🔴 OPERACIÓN: ${op} (${(items as any[]).length} encontrados)`);
        console.log(`=======================================================`);
        
        (items as any[]).forEach(f => {
            console.log(`📄 Archivo : ${f.file} (Línea ${f.line})`);
            console.log(`📦 Tabla   : ${f.table}`);
            console.log(`🔑 Campos  : ${f.fields.join(', ')}`);
            console.log(`-------------------------------------------------------`);
        });
    }

    console.log(`\n⚠️  ADVERTENCIA: Se encontraron ${findings.length} violaciones en ${affectedFiles.size} archivos.`);
    console.log(`Por favor, refactoriza estos archivos para usar Prisma ORM o filtrar/actualizar usando los sufijos '_hash'.\n`);
}
