import mysql from 'mysql2/promise';

async function auditEncryption() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL as string);

  console.log('\n🔍 ============================================================== 🔍');
  console.log('            AUDITORÍA EXHAUSTIVA DE ENCRIPTACIÓN PII');
  console.log('🔍 ============================================================== 🔍\n');

  try {
    // Definimos las tablas y sus columnas a auditar
    const targets = [
      {
        table: 'entidades_documento',
        fields: [
          { name: 'identificador_fiscal', hash: 'identificador_fiscal_hash' },
          { name: 'nombre', hash: 'nombre_hash' }
        ]
      },
      {
        table: 'empresas',
        fields: [
          { name: 'CIF', hash: 'cif_hash' },
          { name: 'mail_de_carga', hash: 'mail_de_carga_hash' }
        ]
      },
      {
        table: 'productos_config',
        fields: [
          { name: 'proveedor_cif', hash: 'proveedor_cif_hash' }
        ]
      },
      {
        table: 'entidades_config',
        fields: [
          { name: 'identificador_fiscal', hash: 'identificador_fiscal_hash' }
        ]
      },
      {
        table: 'usuarios',
        fields: [
          { name: 'email', hash: 'email_hash' }
        ]
      },
      {
        table: 'invitaciones_empresa',
        fields: [
          { name: 'email', hash: 'email_hash' }
        ]
      }
    ];

    for (const target of targets) {
      console.log(`\n📊 Tabla: \x1b[36m${target.table}\x1b[0m`);
      
      const [totalRows] = await connection.query<any[]>(`SELECT COUNT(*) as total FROM ${target.table}`);
      const total = totalRows[0].total;
      console.log(`   - Total registros: ${total}`);

      for (const field of target.fields) {
        console.log(`\n   🔹 Campo: \x1b[33m${field.name}\x1b[0m (Hash: ${field.hash})`);
        
        // 1. Registros sin cifrar (texto plano)
        const [unencrypted] = await connection.query<any[]>(`
          SELECT COUNT(*) as count FROM ${target.table} 
          WHERE ${field.name} IS NOT NULL 
          AND ${field.name} != '' 
          AND ${field.name} NOT LIKE 'v1.%'
        `);
        const textCount = unencrypted[0].count;
        if (textCount > 0) {
          console.log(`      ❌ \x1b[31mRegistros sin cifrar (Texto plano):\x1b[0m ${textCount}`);
        } else {
          console.log(`      ✅ \x1b[32mRegistros sin cifrar:\x1b[0m 0`);
        }

        // 2. Registros cifrados
        const [encrypted] = await connection.query<any[]>(`
          SELECT COUNT(*) as count FROM ${target.table} 
          WHERE ${field.name} LIKE 'v1.%'
        `);
        const cipherCount = encrypted[0].count;
        console.log(`      🔒 Registros cifrados (v1:aes-gcm): ${cipherCount}`);

        // 3. Registros cifrados SIN hash
        const [encryptedNoHash] = await connection.query<any[]>(`
          SELECT COUNT(*) as count FROM ${target.table} 
          WHERE ${field.name} LIKE 'v1.%' 
          AND (${field.hash} IS NULL OR ${field.hash} = '')
        `);
        const noHashCount = encryptedNoHash[0].count;
        if (noHashCount > 0) {
          console.log(`      ❌ \x1b[31mCifrados pero SIN hash (Peligro de blind index roto):\x1b[0m ${noHashCount}`);
        } else {
          console.log(`      ✅ \x1b[32mCifrados pero SIN hash:\x1b[0m 0`);
        }

        // 4. Hashes vacíos o nulos en total
        const [nullHashes] = await connection.query<any[]>(`
          SELECT COUNT(*) as count FROM ${target.table} 
          WHERE ${field.name} IS NOT NULL 
          AND ${field.name} != '' 
          AND (${field.hash} IS NULL OR ${field.hash} = '')
        `);
        const emptyHashes = nullHashes[0].count;
        if (emptyHashes > 0) {
          console.log(`      ⚠️  Hashes vacíos/nulos en total (necesitan cron): ${emptyHashes}`);
        }
      }
    }

    console.log('\n====================================================================\n');
  } catch (err) {
    console.error('Error durante auditoría:', err);
  } finally {
    await connection.end();
  }
}

auditEncryption();
