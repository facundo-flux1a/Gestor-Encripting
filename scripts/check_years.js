
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkYears() {
    const connection = await mysql.createConnection({
        uri: process.env.DATABASE_URL
    });

    try {
        const [rows] = await connection.query(`
      SELECT YEAR(fecha_emision) as year, COUNT(*) as count 
      FROM documentos 
      WHERE id_de_empresa = 66 
      GROUP BY year
    `);
        console.log('Years distribution:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

checkYears();
