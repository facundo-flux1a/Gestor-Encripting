import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db, { dbName } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string; userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { id: companyId, userId: targetUserId } = params;

        // 🛡️ Seguridad: Verificar si el usuario que hace la petición es ADMIN en ESA empresa
        const [companyRows] = await db.query<RowDataPacket[]>(
            `SELECT id_de_usuario, config_roles FROM ${dbName}.empresas WHERE id = ?`,
            [companyId]
        );

        if (companyRows.length === 0) {
            return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
        }

        const rolesMap = typeof companyRows[0].config_roles === 'string'
            ? JSON.parse(companyRows[0].config_roles)
            : companyRows[0].config_roles || {};

        if (rolesMap[session.userId.toString()] !== 'ADMIN') {
            return NextResponse.json({ error: 'Permisos insuficientes. Solo los administradores de esta empresa pueden eliminar miembros.' }, { status: 403 });
        }

        // 🛡️ Seguridad: No permitir que un usuario se elimine a sí mismo (evitar lockouts)
        if (Number(targetUserId) === session.userId) {
            return NextResponse.json({ error: 'No puedes eliminarte a ti mismo de la empresa.' }, { status: 400 });
        }

        let userIds: any[] = [];
        try {
            const rawIds = companyRows[0].id_de_usuario;
            userIds = typeof rawIds === 'string' ? JSON.parse(rawIds || '[]') : (rawIds || []);
        } catch (e) {
            userIds = [];
        }

        if (!Array.isArray(userIds)) userIds = [];

        // Filtrar al usuario
        const initialLength = userIds.length;
        const finalUserIds = userIds.filter(id => Number(id) !== Number(targetUserId));

        if (initialLength === finalUserIds.length) {
            return NextResponse.json({ error: 'El usuario no pertenece a esta empresa.' }, { status: 404 });
        }

        // Actualizar la base de datos: Remover del array Y del objeto JSON
        await db.query(
            `UPDATE ${dbName}.empresas SET id_de_usuario = ?, config_roles = JSON_REMOVE(config_roles, ?) WHERE id = ?`,
            [JSON.stringify(finalUserIds), `$."${targetUserId}"`, companyId]
        );

        // 🛡️ Limpieza Inmediata: Remover de Redis para que el usuario pierda la empresa de su sesión seleccionada
        try {
            const { getSelectedCompanies, saveSelectedCompanies } = await import('@/lib/upstash');
            const selected = await getSelectedCompanies(Number(targetUserId));
            if (selected && selected.includes(Number(companyId))) {
                const updated = selected.filter(id => id !== Number(companyId));
                await saveSelectedCompanies(Number(targetUserId), updated);
                console.log(`🧹 [API/Members] Empresa ${companyId} limpiada del Redis de ${targetUserId}`);
            }
        } catch (redisError) {
            console.error('❌ [API/Members] Error al actualizar Redis del usuario expulsado:', redisError);
            // Non-fatal, we still removed them from the DB
        }

        console.log(`✅ [API/Members] Usuario ${targetUserId} removido de empresa ${companyId} por admin ${session.userId}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ [API/Members] Error:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
