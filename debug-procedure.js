const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);

    try {
        const [rows] = await connection.query("SHOW CREATE PROCEDURE recalc_documento_impuestos");
        console.log('Procedure Definition:');
        console.log(rows[0]['Create Procedure']);
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
