/**
 * scratch/test_muvail.ts
 *
 * Script de prueba manual para interactuar con la API de Muvail (Staging o Prod).
 * Uso:
 *   npx tsx --env-file=.env scratch/test_muvail.ts [CIF_SOCIEDAD] [NIF_PROVEEDOR]
 *
 * Ejemplo:
 *   npx tsx --env-file=.env scratch/test_muvail.ts B12345678 A87654321
 */

import { MuvailService } from '../src/services/muvail-service';

async function main() {
  console.log('🚀 [TEST MUVAIL] Iniciando verificación de cliente Muvail...');

  const cifSociedad = process.argv[2] || 'B12345678';
  const nifABuscar = process.argv[3] || 'A87654321';

  const service = new MuvailService();

  console.log('📌 Configuración:');
  console.log(`   - Base URL: ${process.env.MUVAIL_API_URL || 'Default Staging'}`);
  console.log(`   - API Key configurada: ${process.env.MUVAIL_API_KEY ? '✅ Sí' : '❌ No (Pendiente de recibir)'}`);
  console.log(`   - Sociedad (X-Sociedad): ${cifSociedad}`);
  console.log(`   - NIF a buscar: ${nifABuscar}\n`);

  console.log(`🔍 [Paso 1] Buscando NIF ${nifABuscar} en Muvail...`);
  try {
    const tercero = await service.buscarPorNif(cifSociedad, nifABuscar);
    if (tercero) {
      console.log('✅ Tercero encontrado en Muvail:', tercero);
      console.log(`   - Código: ${tercero.codigo}`);
      console.log(`   - Código Visible: ${tercero.codigo_visible}`);
    } else {
      console.log(`ℹ️ No se encontró ningún tercero con NIF ${nifABuscar} (o la API devolvió 404/401).`);
    }
  } catch (err: any) {
    console.error('❌ Error al buscar por NIF:', err.message);
  }

  console.log('\n📝 [Paso 2] Probando helper de adaptación desde Factura:');
  const dummyFactura = {
    nombre: 'Iberdrola Clientes S.A.U.',
    cif: 'A95748375',
    direccion: 'Plaza Euskadi 5, 48009 Bilbao, Vizcaya',
    telefono: '900225235',
    email: 'contacto@iberdrola.es',
  };
  const payload = MuvailService.adaptarDesdeFactura(dummyFactura, 'proveedor');
  console.log('   Payload adaptado:', JSON.stringify(payload, null, 2));

  console.log('\n🏁 [TEST MUVAIL] Finalizado.');
}

main().catch(console.error);
