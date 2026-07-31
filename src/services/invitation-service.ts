import { sendEmail } from './email-service';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createNotification } from './notification-service';

export async function createInvitation(empresaId: string, email: string, rol: string, senderName?: string, senderId?: string | number) {
  try {
    const token = crypto.randomUUID();
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + 7);

    const emp = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: { nombre_de_empresa: true }
    });
    const empresaNombre = emp?.nombre_de_empresa || 'la empresa';

    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

    const inv = await prisma.invitaciones_empresa.create({
      data: {
        empresa_id: BigInt(empresaId),
        email,
        email_hash: emailHash,
        rol: rol as any,
        token,
        fecha_expiracion: fechaExpiracion,
        metadata: { senderName, empresaNombre, senderId },
        status: 'PENDING'
      }
    });

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

    return { success: true, id: Number(inv.id), token };
  } catch (error) {
    console.error('❌ [createInvitation] Error:', error);
    return { success: false, error: 'No se pudo enviar la invitación' };
  }
}

export async function acceptInvitation(token: string, userId: string | number) {
  try {
    console.log('🎁 [invitation-service] Intentando aceptar invitación:', { token, userId });
    const inv = await prisma.invitaciones_empresa.findFirst({
      where: {
        token: token,
        status: 'PENDING',
        fecha_expiracion: { gt: new Date() }
      }
    });

    if (!inv) {
      console.warn('⚠️ [invitation-service] Invitación no encontrada o inválida. Token:', token);
      return { success: false, error: 'Invitación no encontrada, expirada o ya utilizada' };
    }

    console.log('✅ [invitation-service] Invitación válida para empresa:', inv.empresa_id);

    const empresaId = Number(inv.empresa_id);

    const empresa = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: { id_de_usuario: true, config_roles: true }
    });

    let adminIdsToNotify: number[] = [];

    if (empresa) {
      let userIds: number[] = [];
      try {
        userIds = typeof empresa.id_de_usuario === 'string' ? JSON.parse(empresa.id_de_usuario) : (empresa.id_de_usuario || []);
      } catch (e) {
        userIds = [];
      }
      if (!Array.isArray(userIds)) userIds = [];

      const parsedUserId = parseInt(String(userId));
      if (!userIds.includes(parsedUserId)) {
        userIds.push(parsedUserId);
      }

      let configRoles: Record<string, string> = {};
      try {
        configRoles = typeof empresa.config_roles === 'string' ? JSON.parse(empresa.config_roles) : (empresa.config_roles || {});
      } catch (e) {
        configRoles = {};
      }
      configRoles[parsedUserId.toString()] = inv.rol as string;

      // Determinar a quién notificar (los ADMINS actuales)
      for (const [uid, rol] of Object.entries(configRoles)) {
        if (rol === 'ADMIN' && uid !== parsedUserId.toString()) {
          adminIdsToNotify.push(Number(uid));
        }
      }

      if (adminIdsToNotify.length === 0) {
        // Fallback al usuario que envió la invitación, o a todos si no hay
        const metadata = typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : (inv.metadata || {});
        if (metadata.senderId && Number(metadata.senderId) !== parsedUserId) {
          adminIdsToNotify.push(Number(metadata.senderId));
          console.log(`[invitation-service] Fallback: Notificando al remitente (ID: ${metadata.senderId})`);
        } else {
          adminIdsToNotify = userIds.filter(id => id !== parsedUserId);
          console.log(`[invitation-service] Fallback: Notificando a todos los miembros (IDs: ${adminIdsToNotify.join(',')})`);
        }
      }

      console.log('🏢 [invitation-service] Actualizando miembros y roles:', { userIds, userId, rol: inv.rol });

      await prisma.empresas.update({
        where: { id: BigInt(empresaId) },
        data: {
          id_de_usuario: userIds,
          config_roles: configRoles
        } as any
      });
    }

    console.log('🏁 [invitation-service] Finalizando con UPDATE ACCEPTED para el token:', token);
    const updated = await prisma.invitaciones_empresa.updateMany({
      where: { token },
      data: { status: 'ACCEPTED' }
    });
    console.log('🏁 [invitation-service] Filas actualizadas a ACCEPTED:', updated.count);

    // --- Notificar a los administradores ---
    try {
      if (adminIdsToNotify.length > 0) {
        await createNotification({
          userIds: adminIdsToNotify,
          empresaId: empresaId,
          tipo: 'usuario_unido',
          titulo: 'Nuevo Usuario',
          mensaje: `El usuario ${inv.email || 'invitado'} ha aceptado la invitación y se unió al equipo.`,
          metadata: {}
        });
        console.log(`[invitation-service] Notificación enviada a admins: ${adminIdsToNotify.join(',')}`);
      } else {
        console.log('[invitation-service] No se encontraron admins a notificar (o no hay empresa).');
      }
    } catch (notifErr) {
      console.error('Error enviando notificacion de usuario_unido:', notifErr);
    }
    // ----------------------------------------

    return { success: true, empresaId };
  } catch (error: any) {
    console.error('❌ [acceptInvitation] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function revokeInvitation(invitationId: string) {
  try {
    await prisma.invitaciones_empresa.update({
      where: { id: parseInt(invitationId) },
      data: { status: 'REVOKED' }
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteInvitation(invitationId: string) {
  try {
    await prisma.invitaciones_empresa.delete({
      where: { id: parseInt(invitationId) }
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function resendInvitation(invitationId: string) {
  try {
    const inv = await prisma.invitaciones_empresa.findFirst({
      where: { id: parseInt(invitationId), status: 'PENDING' }
    });
    if (!inv) {
      return { success: false, error: 'Invitación no encontrada o no pendiente' };
    }
    const metadata: any = typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : (inv.metadata || {});
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
    const inv = await prisma.invitaciones_empresa.findFirst({
      where: { token, status: 'PENDING', fecha_expiracion: { gt: new Date() } }
    });
    if (!inv) return null;

    const emp = await prisma.empresas.findUnique({
      where: { id: inv.empresa_id },
      select: { nombre_de_empresa: true }
    });

    return {
      ...inv,
      nombre_de_empresa: emp?.nombre_de_empresa
    };
  } catch (e: any) {
    console.error('❌ [getInvitationByToken] Error:', e);
    return null;
  }
}

export async function getInvitationsByEmpresa(empresaId: string | number) {
  try {
    const invitations = await prisma.invitaciones_empresa.findMany({
      where: { empresa_id: BigInt(empresaId) },
      orderBy: { id: 'desc' }
    });
    return invitations.map(inv => ({
      ...inv,
      empresa_id: Number(inv.empresa_id),
      metadata: typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata
    })) as any[];
  } catch (e: any) {
    console.error('❌ [getInvitationsByEmpresa] Error:', e);
    return [];
  }
}
