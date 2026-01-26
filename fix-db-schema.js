const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

async function main() {
    console.log('🔌 Connecting to DB to fix schema...');
    const connection = await mysql.createConnection(process.env.DATABASE_URL);

    try {
        console.log('🛠️ Adding missing columns to lineas_documento...');

        // Add base_imponible_linea if missing
        try {
            await connection.query("ALTER TABLE lineas_documento ADD COLUMN base_imponible_linea DECIMAL(15,2) DEFAULT 0.00 AFTER precio_neto");
            console.log('✅ Added base_imponible_linea');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ base_imponible_linea already exists');
            else console.error('❌ Error adding base_imponible_linea:', e.message);
        }

        // Add impuesto_porcentaje if missing
        try {
            await connection.query("ALTER TABLE lineas_documento ADD COLUMN impuesto_porcentaje DECIMAL(5,2) DEFAULT 0.00 AFTER base_imponible_linea");
            console.log('✅ Added impuesto_porcentaje');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ impuesto_porcentaje already exists');
            else console.error('❌ Error adding impuesto_porcentaje:', e.message);
        }

        // Add cuota_iva_linea if missing
        try {
            await connection.query("ALTER TABLE lineas_documento ADD COLUMN cuota_iva_linea DECIMAL(15,2) DEFAULT 0.00 AFTER impuesto_porcentaje");
            console.log('✅ Added cuota_iva_linea');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ cuota_iva_linea already exists');
            else console.error('❌ Error adding cuota_iva_linea:', e.message);
        }

        console.log('✨ Schema update completed.');

    } catch (err) {
        console.error('🚨 Fatal Error:', err);
    } finally {
        await connection.end();
    }
}

main();
