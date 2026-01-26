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
        const [columns] = await connection.query("DESCRIBE lineas_documento");
        console.log('Columns in lineas_documento:');
        columns.forEach(c => console.log(c.Field));
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
