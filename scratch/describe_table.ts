import dotenv from 'dotenv';
dotenv.config();
import connection from '../src/lib/db';

async function describeTable() {
  try {
    const [rows] = await connection.query('DESCRIBE erp49.actividad');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

describeTable();
