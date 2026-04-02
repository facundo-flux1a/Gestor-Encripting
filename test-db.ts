
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    console.log('📡 Connected to DB');

    const [invites]: any = await connection.query('SELECT * FROM invitaciones_empresa ORDER BY id DESC LIMIT 5');
    console.log('✉️ Recent Invitations:', JSON.stringify(invites, null, 2));

    const [users]: any = await connection.query('SELECT id, email, nombre, tutorial FROM usuarios ORDER BY id DESC LIMIT 5');
    console.log('👤 Recent Users:', JSON.stringify(users, null, 2));

    const [empresas]: any = await connection.query('SELECT id, nombre_de_empresa as name, id_de_usuario FROM empresas WHERE id IN (SELECT empresa_id FROM invitaciones_empresa)');
    console.log('🏢 Concerned Companies:', JSON.stringify(empresas, null, 2));

    await connection.end();
}

test().catch(console.error);
