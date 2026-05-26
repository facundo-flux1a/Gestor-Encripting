const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
const userApiKey = 'muvail_3I-dMJjcsriTw_RpziBF1PgCpmMXReClRunmAXlNedc';

async function run() {
  console.log(`Probando endpoint con la clave API del usuario.`);
  console.log(`URL base del servidor: ${appUrl}`);

  // Casos de prueba
  const testCases = [
    {
      name: 'Consulta básica de documentos completos',
      url: `${appUrl}/api/v1/documents/full`,
    },
    {
      name: 'Consulta con filtros (tipo recibidas)',
      url: `${appUrl}/api/v1/documents/full?tipo=recibidas`,
    },
    {
      name: 'Consulta con filtros (tipo emitidas)',
      url: `${appUrl}/api/v1/documents/full?tipo=emitidas`,
    },
    {
      name: 'Consulta con flags (incluir_incidencias, incluir_sin_verificar, incluir_sin_confirmar)',
      url: `${appUrl}/api/v1/documents/full?incluir_incidencias=true&incluir_sin_verificar=true&incluir_sin_confirmar=true`,
    }
  ];

  for (const test of testCases) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Prueba: ${test.name}`);
    console.log(`URL: ${test.url}`);
    
    try {
      const response = await fetch(test.url, {
        method: 'GET',
        headers: {
          'x-api-key': userApiKey,
          'Accept': 'application/json'
        }
      });
      
      console.log(`Status Code: ${response.status}`);
      const json = await response.json();
      
      if (!response.ok) {
        console.error('Error de respuesta:', json);
        continue;
      }
      
      console.log(`Total documentos devueltos: ${json.total}`);
      if (json.data && json.data.length > 0) {
        const firstDoc = json.data[0];
        console.log('Estructura del primer documento obtenido:');
        console.log(`  - ID: ${firstDoc.id}`);
        console.log(`  - Número: ${firstDoc.numero_documento}`);
        console.log(`  - Tipo: ${firstDoc.tipo_documento}`);
        console.log(`  - Moneda: ${firstDoc.moneda}`);
        console.log(`  - Emisor: ${firstDoc.entidades?.emisor?.nombre || firstDoc.entidades?.proveedor?.nombre || 'N/A'}`);
        console.log(`  - Cuenta Contable Emisor: ${firstDoc.entidades?.emisor?.cuenta_contable || firstDoc.entidades?.proveedor?.cuenta_contable || 'N/A'}`);
        console.log(`  - Cantidad de Líneas: ${firstDoc.lineas_detalle?.length || 0}`);
        if (firstDoc.lineas_detalle && firstDoc.lineas_detalle.length > 0) {
          console.log(`    - Primera línea: ${firstDoc.lineas_detalle[0].descripcion} (Cuenta: ${firstDoc.lineas_detalle[0].cuenta_contable}, Desc: ${firstDoc.lineas_detalle[0].descuento_porcentaje}%)`);
        }
        console.log(`  - Cantidad de Impuestos: ${firstDoc.impuestos?.length || 0}`);
        if (firstDoc.impuestos && firstDoc.impuestos.length > 0) {
          console.log(`    - Primer impuesto: ${firstDoc.impuestos[0].tipo_impuesto} ${firstDoc.impuestos[0].porcentaje}% (Total c/ Impuesto: ${firstDoc.impuestos[0].total_con_impuesto})`);
        }
        console.log(`  - Incidencias: ${firstDoc.incidencias?.length || 0}`);
        console.log(`  - Health Check: ${JSON.stringify(firstDoc.health_check)}`);
        console.log(`  - Archivo URL: ${firstDoc.url_archivo}`);
      } else {
        console.log('No se devolvieron documentos para esta consulta.');
      }
    } catch (e) {
      console.error('Error al realizar la petición:', e.message);
    }
  }
}

run();
