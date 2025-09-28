import mysql from 'mysql2/promise';

const connection = mysql.createPool(process.env.DATABASE_URL!);

export default connection;
