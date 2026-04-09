import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { userId } = params;
        const { rol, companyId } = await req.json();

        if (!companyId) {
            return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
        }

        if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(rol)) {
            return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
        }

        // 🛡️ Seguridad: Verificar si el usuario que hace la petición es ADMIN en ESA empresa
        const [companyRows] = await db.query<RowDataPacket[]>(
            'SELECT config_roles FROM erp49.empresas WHERE id = ?',
            [companyId]
        );

        if (companyRows.length === 0) {
            return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
        }

        const rolesMap = typeof companyRows[0].config_roles === 'string'
            ? JSON.parse(companyRows[0].config_roles)
            : companyRows[0].config_roles || {};

        if (rolesMap[session.userId.toString()] !== 'ADMIN') {
            return NextResponse.json({ error: 'Permisos insuficientes. Solo los administradores de esta empresa pueden cambiar roles.' }, { status: 403 });
        }

        // 🛡️ Seguridad: No permitir que un ADMIN se quite el rango a sí mismo para evitar el bloqueo total de la empresa
        if (Number(userId) === session.userId && rol !== 'ADMIN') {
            return NextResponse.json({ error: 'No podés cambiarte el rol a vos mismo para evitar bloqueos.' }, { status: 400 });
        }

        // Actualizar en el JSON de la empresa usando JSON_SET
        await db.query(
            'UPDATE erp49.empresas SET config_roles = JSON_SET(config_roles, ?, ?) WHERE id = ?',
            [`$."${userId}"`, rol, companyId]
        );

        // Opcional: Actualizar también el log global (solo para retrocompatibilidad parcial si se desea)
        // await db.query('UPDATE usuarios SET organization_rol = ? WHERE id = ?', [rol, userId]);

        console.log(`✅ [API/Role] Usuario ${userId} actualizado a rol ${rol} en empresa ${companyId} por admin ${session.userId}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ [API/Role] Error:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
