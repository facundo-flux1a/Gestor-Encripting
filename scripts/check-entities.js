const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
        const [rows] = await connection.query(`
            SELECT rol, nombre 
            FROM erp49.entidades_documento
            WHERE documento_id = 2564
        `);
        console.log('Entities for Doc #2564:');
        console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

main();
