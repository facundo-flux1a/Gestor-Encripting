import { getDocsProviderNames } from './src/services/document-service';
import { getCurrentUser } from './src/services/user-service';
import db from './src/lib/db';

async function run() {
  // Mock getCurrentUser by overwriting it if needed, or just run query directly
  const query = `
      SELECT DISTINCT e.nombre
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
      WHERE (e.rol = 'proveedor' OR e.rol = 'emisor')
        AND e.nombre IS NOT NULL AND e.nombre != ''
        AND d.confirmado = 1
        AND (d.estado IS NULL OR d.estado NOT IN ('eliminado', 'borrador'))
        AND JSON_CONTAINS(emp.id_de_usuario, CAST(? AS JSON))
    `;
  const [rows] = await db.query(query, [6]);
  console.log("Proveedores:", rows);
  process.exit(0);
}
run();
