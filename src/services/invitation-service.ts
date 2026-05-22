import db, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { sendEmail } from './email-service';
import crypto from 'crypto';

export async function createInvitation(empresaId: string, email: string, rol: string, senderName?: string) {
  try {
    const token = crypto.randomUUID();
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + 7);

    const [emp] = await db.query<RowDataPacket[]>('SELECT nombre_de_empresa as nombre FROM empresas WHERE id = ?', [empresaId]);
    const empresaNombre = emp[0]?.nombre || 'la empresa';

    const [result]: any = await db.query(
      'INSERT INTO invitaciones_empresa (empresa_id, email, rol, token, fecha_expiracion, metadata, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [empresaId, email, rol, token, fechaExpiracion.toISOString().slice(0, 19).replace('T', ' '), JSON.stringify({ senderName, empresaNombre }), 'PENDING']
    );

    const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invitation?token=${token}`;

    const { success, error: emailError } = await sendEmail({
      to: email,
      subject: `${senderName || 'Un compañero'} te invita a ${empresaNombre} — Gestor Documental`,
      html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr><td style="background:linear-gradient(135deg,#0070f3 0%,#0050c8 100%);padding:36px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase;">Gestor Documental</p>
          <h1 style="margin:12px 0 0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">Tenés una invitación</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.7;">
            <strong>${senderName || 'Un administrador'}</strong> te invitó a colaborar en:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:32px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Empresa</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#1d4ed8;">${empresaNombre}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#4b5563;">Rol asignado: <strong style="color:#1e40af;">${rol}</strong></p>
            </td></tr>
          </table>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${magicLink}" style="display:inline-block;background:linear-gradient(135deg,#0070f3,#0050c8);color:#ffffff;font-size:16px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(0,112,243,0.4);">
              Aceptar Invitación →
            </a>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:13px;color:#6b7280;">🕐 Este enlace expirará en <strong>7 días</strong>.</p>
              <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">🔒 Si no esperabas esta invitación, ignorá este mensaje.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Gestor Documental · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    if (!success) {
      throw new Error('No se pudo enviar el mail de invitación. Revisá la configuración SMTP.');
    }

    return { success: true, id: result.insertId, token };
  } catch (error) {
    console.error('❌ [createInvitation] Error:', error);
    return { success: false, error: 'No se pudo enviar la invitación' };
  }
}

export async function acceptInvitation(token: string, userId: string | number) {
  try {
    console.log('🎁 [invitation-service] Intentando aceptar invitación:', { token, userId });
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM invitaciones_empresa WHERE token = ? AND status = ? AND fecha_expiracion > NOW()',
      [token, 'PENDING']
    );

    if (rows.length === 0) {
      console.warn('⚠️ [invitation-service] Invitación no encontrada o inválida. Token:', token);
      return { success: false, error: 'Invitación no encontrada, expirada o ya utilizada' };
    }

    const inv = rows[0];
    console.log('✅ [invitation-service] Invitación válida para empresa:', inv.id_empresa || inv.empresa_id);

    const empresaId = inv.id_empresa || inv.empresa_id;

    const [empresaRows] = await db.query<RowDataPacket[]>(`SELECT id_de_usuario FROM ${dbName}.empresas WHERE id = ?`, [empresaId]);
    if (empresaRows.length > 0) {
      let userIds = [];
      try {
        userIds = typeof empresaRows[0].id_de_usuario === 'string' ? JSON.parse(empresaRows[0].id_de_usuario || '[]') : (empresaRows[0].id_de_usuario || []);
      } catch (e) {
        userIds = [];
      }
      if (!Array.isArray(userIds)) userIds = [];

      if (!userIds.includes(parseInt(String(userId)))) {
        userIds.push(parseInt(String(userId)));
      }

      console.log('🏢 [invitation-service] Actualizando miembros y roles:', { userIds, userId, rol: inv.rol });

      // Actualizamos el array de IDs Y el objeto de roles
      await db.query(
        `UPDATE ${dbName}.empresas SET 
                 id_de_usuario = ?, 
                 config_roles = JSON_SET(COALESCE(config_roles, JSON_OBJECT()), ?, ?) 
                 WHERE id = ?`,
        [JSON.stringify(userIds), `$."${userId}"`, inv.rol, empresaId]
      );
    }

    console.log('🏁 [invitation-service] Finalizando con UPDATE ACCEPTED para el token:', token);
    const [updateResult]: any = await db.query(
      'UPDATE invitaciones_empresa SET status = ? WHERE token = ?',
      ['ACCEPTED', token]
    );
    console.log('🏁 [invitation-service] Filas actualizadas a ACCEPTED:', updateResult?.affectedRows);

    return { success: true };
  } catch (error: any) {
    console.error('❌ [acceptInvitation] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function revokeInvitation(invitationId: string) {
  try {
    await db.query('UPDATE invitaciones_empresa SET status = ? WHERE id = ?', ['REVOKED', invitationId]);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteInvitation(invitationId: string) {
  try {
    await db.query('DELETE FROM invitaciones_empresa WHERE id = ?', [invitationId]);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function resendInvitation(invitationId: string) {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM invitaciones_empresa WHERE id = ? AND status = ?',
      [invitationId, 'PENDING']
    );
    if (rows.length === 0) {
      return { success: false, error: 'Invitación no encontrada o no pendiente' };
    }
    const inv = rows[0];
    const metadata = typeof inv.metadata === 'string' ? JSON.parse(inv.metadata || '{}') : inv.metadata;
    const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invitation?token=${inv.token}`;

    const { success, error: emailError } = await sendEmail({
      to: inv.email,
      subject: `[Re-enviado] Invitación para unirte a ${metadata.empresaNombre || 'la empresa'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Invitación Pendiente - Gestor Documental</h2>
          <p style="font-size: 16px; color: #555;">
            Te recordamos que tienes una invitación pendiente para unirte a <strong>${metadata.empresaNombre || 'la empresa'}</strong>.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Aceptar Invitación
            </a>
          </div>
          <p style="font-size: 14px; color: #888;">
            Este enlace expirará el ${new Date(inv.fecha_expiracion).toLocaleDateString()}.
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #aaa; text-align: center;">
            Enviado por Gestor Documental
          </p>
        </div>`
    });

    if (!success) {
      throw new Error('Error al re-enviar el mail. Revisá la configuración SMTP.');
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getInvitationByToken(token: string) {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT i.*, e.nombre_de_empresa FROM invitaciones_empresa i JOIN empresas e ON i.empresa_id = e.id WHERE i.token = ? AND i.status = "PENDING" AND i.fecha_expiracion > NOW()',
      [token]
    );
    return rows[0] || null;
  } catch (e: any) {
    console.error('❌ [getInvitationByToken] Error:', e);
    return null;
  }
}

export async function getInvitationsByEmpresa(empresaId: string | number) {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM invitaciones_empresa WHERE empresa_id = ? ORDER BY id DESC',
      [empresaId]
    );
    return rows as any[];
  } catch (e: any) {
    console.error('❌ [getInvitationsByEmpresa] Error:', e);
    return [];
  }
}
