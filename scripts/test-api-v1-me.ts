import 'dotenv/config';
import { NextRequest } from 'next/server';
import { GET as getMe } from '../src/app/api/v1/me/route';
import db from '../src/lib/db';
import type { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

async function runTest() {
  console.log('🚀 Iniciando test de GET /api/v1/me...\n');

  // Test 1: Sin header X-Api-Key -> 401
  console.log('Test 1: Llamada sin header X-Api-Key');
  const req1 = new NextRequest('http://localhost:3000/api/v1/me');
  const res1 = await getMe(req1);
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}, Response:`, data1);
  if (res1.status !== 401 || !data1.error) {
    throw new Error('❌ Falló Test 1: se esperaba 401 con mensaje de error.');
  }
  console.log('✅ Test 1 superado.\n');

  // Test 2: Con clave falsa/inválida -> 401
  console.log('Test 2: Llamada con clave falsa');
  const req2 = new NextRequest('http://localhost:3000/api/v1/me', {
    headers: { 'x-api-key': 'muvail_invalidkey1234567890' }
  });
  const res2 = await getMe(req2);
  const data2 = await res2.json();
  console.log(`Status: ${res2.status}, Response:`, data2);
  if (res2.status !== 401 || !data2.error) {
    throw new Error('❌ Falló Test 2: se esperaba 401.');
  }
  console.log('✅ Test 2 superado.\n');

  // Test 3: Con una clave real existente o generada
  console.log('Test 3: Generando clave temporal para Empresa 117');
  const { generateApiKey, revokeApiKey } = await import('../src/services/api-key-service');

  // Buscar un usuario existente con acceso a empresa 117
  const [userRows] = await db.query<RowDataPacket[]>(
    `SELECT id_de_usuario FROM empresas WHERE id = 117`
  );
  let userId = 1;
  if (userRows.length > 0 && userRows[0].id_de_usuario) {
    const rawUsers = userRows[0].id_de_usuario;
    const userList = Array.isArray(rawUsers) ? rawUsers : (typeof rawUsers === 'string' ? JSON.parse(rawUsers) : [rawUsers]);
    if (userList.length > 0) userId = Number(userList[0]);
  }

  const keyResult = await generateApiKey({
    nombre: 'Test Me Endpoint Key',
    empresa_id: 117,
    usuario_id: userId
  });

  if (!keyResult.success || !keyResult.raw_key || !keyResult.key) {
    throw new Error('❌ No se pudo generar la API key de prueba: ' + keyResult.error);
  }

  const testKey = keyResult.raw_key;
  const keyId = keyResult.key.id;
  console.log(`API Key de prueba generada (id: ${keyId}, prefix: ${keyResult.key.key_prefix})`);

  try {
    const req3 = new NextRequest('http://localhost:3000/api/v1/me', {
      headers: { 'x-api-key': testKey }
    });
    const res3 = await getMe(req3);
    const data3 = await res3.json();
    console.log(`Status: ${res3.status}, Response:`, JSON.stringify(data3, null, 2));

    if (res3.status !== 200) {
      throw new Error(`❌ Falló Test 3: se esperaba 200 pero dio ${res3.status}`);
    }
    if (data3.status !== 'ok' || !data3.autenticado || !data3.empresa || !data3.empresa.cif) {
      throw new Error('❌ Falló Test 3: estructura de respuesta incompleta.');
    }
    console.log(`✅ Test 3 superado: Empresa id=${data3.empresa.id}, CIF=${data3.empresa.cif}, Nombre="${data3.empresa.nombre}"`);
  } finally {
    // Limpiar clave de prueba
    await revokeApiKey(keyId, userId);
    console.log(`🧹 Clave de prueba (id: ${keyId}) revocada con éxito.`);
  }

  console.log('\n🎉 TODOS LOS TESTS COMPLETADOS SATISFACTORIAMENTE.');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('💥 Error en los tests:', err);
  process.exit(1);
});
