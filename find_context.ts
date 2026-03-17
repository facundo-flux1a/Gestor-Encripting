
import db from './src/lib/db';

async function findContext() {
    const [rows]: any = await db.query(`
        SELECT 
            d.id_de_empresa, 
            e.nombre_de_empresa, 
            e.cif,
            COUNT(*) as count
        FROM documentos d
        JOIN empresas e ON d.id_de_empresa = e.id
        WHERE d.año_trimestre = 2026 AND d.num_trimestre = 1
        GROUP BY d.id_de_empresa
    `);
    console.log('Empresas con documentos en T1 2026:');
    console.table(rows);
}

findContext().catch(console.error).finally(() => process.exit());
