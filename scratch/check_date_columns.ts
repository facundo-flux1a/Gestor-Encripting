import mysql from 'mysql2/promise';

async function checkDateColumns() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL as string);
  const tables = [
    'entidades_documento',
    'empresas',
    'usuarios',
    'archivos_documento',
    'productos_config',
    'entidades_config',
    'invitaciones_empresa'
  ];

  console.log('\n📋 COLUMNAS DE FECHA DISPONIBLES POR TABLA\n');
  console.log('(Mostrá cuáles usar para el filtro de 15 minutos)\n');

  for (const table of tables) {
    const [cols] = await connection.query<any[]>(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND DATA_TYPE IN ('datetime', 'timestamp', 'date')
      ORDER BY ORDINAL_POSITION
    `, [table]);

    console.log(`📊 \x1b[36m${table}\x1b[0m`);

    if (cols.length === 0) {
      console.log(`   ⚠️  Sin columnas de fecha → necesita estrategia alternativa`);
    } else if (cols.length === 1) {
      console.log(`   ✅ Una sola opción: \x1b[33m${cols[0].COLUMN_NAME}\x1b[0m (${cols[0].DATA_TYPE})`);
    } else {
      console.log(`   ❓ Múltiples opciones (indicame cuál usar):`);
      cols.forEach((c, i) => {
        console.log(`      ${i + 1}. \x1b[33m${c.COLUMN_NAME}\x1b[0m (${c.DATA_TYPE}, nullable: ${c.IS_NULLABLE}, default: ${c.COLUMN_DEFAULT || 'none'})`);
      });
    }
    console.log('');
  }

  await connection.end();
}

checkDateColumns();
