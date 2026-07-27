import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import connection, { dbName } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.userId) {
      console.warn('[CLEAN DB] ❌ Intento sin autenticación');
      return NextResponse.json(
        { error: 'No tienes permisos para realizar esta acción' },
        { status: 401 }
      );
    }

    const userId = session.userId;
    const userEmail = session.email;

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, email, has_permits FROM ${dbName}.usuarios WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      console.warn(`[CLEAN DB] ❌ Usuario ${userId} no encontrado en la BD`);
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = rows[0];

    // Administradores autorizados a ejecutar esta acción destructiva
    const allowedAdmins = [5, 6];

    if (!allowedAdmins.includes(user.id) || !user.has_permits) {
      console.warn(
        `[CLEAN DB] ❌ Usuario ${userId} (${userEmail}) intentó limpiar la BD sin permisos\n` +
        `   - ID del usuario: ${user.id} (autorizados: ${allowedAdmins.join(', ')})\n` +
        `   - has_permits: ${user.has_permits} (requiere: 1)`
      );
      return NextResponse.json(
        { error: 'No tienes permisos para realizar esta acción' },
        { status: 403 }
      );
    }

    // Extraer empresaIds del body
    const body = await request.json();
    const { empresaIds } = body;

    if (!Array.isArray(empresaIds) || empresaIds.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un array de empresaIds válido' },
        { status: 400 }
      );
    }

    // Filtrar para asegurarnos que sean números válidos
    const validEmpresaIds = empresaIds.map(Number).filter(id => !isNaN(id) && id > 0);
    if (validEmpresaIds.length === 0) {
      return NextResponse.json(
        { error: 'Ningún ID de empresa válido proporcionado' },
        { status: 400 }
      );
    }

    console.log(`[CLEAN DB] ✅ Usuario ${userId} (${userEmail}) ejecutando limpieza de BD para empresas: [${validEmpresaIds.join(', ')}]...`);

    // Desactivar foreign keys temporalmente para evitar dependencias
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    try {
      // Usamos IN (?) para borrar de forma masiva pasándole el array de IDs en un solo query

      // 1. Borrados directos por id_de_empresa / empresa_id
      await connection.query('DELETE FROM actividad WHERE id_de_empresa IN (?)', [validEmpresaIds]);
      await connection.query('DELETE FROM ai_suggestions WHERE empresa_id IN (?)', [validEmpresaIds]);
      await connection.query('DELETE FROM entidades_config WHERE empresa_id IN (?)', [validEmpresaIds]);
      await connection.query('DELETE FROM productos_config WHERE id_de_empresa IN (?)', [validEmpresaIds]);
      await connection.query('DELETE FROM health_check_status WHERE empresa_id IN (?)', [validEmpresaIds]);

      // 2. Borrados via subquery a documentos
      await connection.query('DELETE FROM ai_incidencias_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      await connection.query('DELETE FROM archivos_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      await connection.query('DELETE FROM documentos_auditoria WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      await connection.query('DELETE FROM entidades_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      await connection.query('DELETE FROM impuestos_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      await connection.query('DELETE FROM incidencias_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);

      // 3. Optimización para lineas_documento
      await connection.query('DROP TRIGGER IF EXISTS trg_lineas_after_delete;');
      await connection.query('DELETE FROM lineas_documento WHERE documento_id IN (SELECT id FROM documentos WHERE id_de_empresa IN (?))', [validEmpresaIds]);
      
      // Recrear trigger
      await connection.query(`
        CREATE TRIGGER trg_lineas_after_delete
        AFTER DELETE ON lineas_documento
        FOR EACH ROW
        BEGIN
          CALL recalc_documento_impuestos(OLD.documento_id);
        END;
      `);

      // 4. Finalmente, borrar los documentos de las empresas
      await connection.query('DELETE FROM documentos WHERE id_de_empresa IN (?)', [validEmpresaIds]);
    } finally {
      // Siempre reactivamos las llaves foráneas aunque haya error
      await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    }

    console.log(`[CLEAN DB] ✅ Base de datos limpiada exitosamente por usuario ${userId} (${userEmail}) para empresas: ${validEmpresaIds.join(', ')}`);

    return NextResponse.json({
      success: true,
      message: `Base de datos de las empresas ${validEmpresaIds.join(', ')} limpiada correctamente`,
    });

  } catch (error) {
    console.error('[CLEAN DB] ❌ Error:', error);
    return NextResponse.json(
      {
        error: 'Error al limpiar la base de datos',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}