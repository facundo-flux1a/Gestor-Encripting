
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkIvaRates() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const [rows] = await connection.execute(
        "SELECT id, numero_documento, datos_extra FROM documentos WHERE id_de_empresa = 82"
    );

    const foundRates = new Set();
    const validRates = [21, 15, 10, 4, 0];

    rows.forEach(row => {
        let data;
        try {
            data = typeof row.datos_extra === 'string' ? JSON.parse(row.datos_extra) : row.datos_extra;
        } catch (e) {
            return;
        }

        if (data && data.iva_details) {
            data.iva_details.forEach(detail => {
                const rate = Math.round(Number(detail.porcentaje));
                foundRates.add(rate);
                if (!validRates.includes(rate)) {
                    console.log(`Document ${row.id} (${row.numero_documento}) has rate: ${rate}`);
                }
            });
        }
    });

    console.log("All found rates:", Array.from(foundRates));
    await connection.end();
}

checkIvaRates().catch(console.error);
