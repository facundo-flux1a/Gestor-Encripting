const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

async function run() {
  if (!dbUrl) {
    console.error('DATABASE_URL is not set in .env');
    return;
  }
  
  const connection = await mysql.createConnection(dbUrl);
  try {
    const tables = [
      'documentos',
      'entidades_documento',
      'lineas_documento',
      'impuestos_documento',
      'archivos_documento',
      'incidencias_documento',
      'health_check_status'
    ];
    
    let output = '';
    for (const table of tables) {
      output += `\n========================================\nTABLE: ${table}\n========================================\n`;
      const [columns] = await connection.query(`DESCRIBE \`${table}\``);
      columns.forEach(col => {
        output += `Field: ${col.Field.padEnd(25)} | Type: ${col.Type.padEnd(15)} | Null: ${col.Null.padEnd(5)} | Key: ${col.Key.padEnd(5)} | Default: ${String(col.Default).padEnd(10)} | Extra: ${col.Extra}\n`;
      });
    }
    
    fs.writeFileSync(path.join(__dirname, 'table_structures.txt'), output);
    console.log('Done! Wrote schema to scratch/table_structures.txt');
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

run();
