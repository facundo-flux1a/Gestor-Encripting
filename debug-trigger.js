const mysql = require('mysql2/promise');
// Load environment variables from .env
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

async function main() {
    console.log('Connecting to DB...');
    try {
        const connection = await mysql.createConnection(process.env.DATABASE_URL);
        console.log('Connected.');

        const [triggers] = await connection.query("SHOW TRIGGERS");
        console.log("Triggers found:", triggers.length);

        let found = false;
        for (const t of triggers) {
            const body = t.Statement.toString();
            if (t.Table === 'lineas_documento' || body.includes('base_imponible_linea')) {
                console.log('--------------------------------------------------');
                console.log('📍 TRIGGER FOUND:', t.Trigger);
                console.log('Table:', t.Table);
                console.log('Event:', t.Event);
                console.log('Statement:', body);
                found = true;
            }
        }

        if (!found) {
            console.log('No suspicious triggers found on lineas_documento or referencing base_imponible_linea.');
        }

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
