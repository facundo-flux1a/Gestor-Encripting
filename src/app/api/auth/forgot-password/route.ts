import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { sendEmail } from '@/services/email-service';
import { prisma } from '@/lib/prisma';
import { hashField } from '@/lib/encryption';

export async function POST(request: NextRequest) {
    try {
        const { email, token, resetUrl, expiresAt } = await request.json();

        if (!email || !token || !resetUrl) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        // 1. Buscar usuario por hash del email (blind index) porque el email está encriptado en DB
        const emailHash = hashField(email);
        const user = await prisma.usuarios.findUnique({
            where: { email_hash: emailHash },
            select: { id: true, nombre: true, email: true }
        });

        if (!user) {
            // Caso: Usuario no existe (Aviso de seguridad)
            const { success, error: emailError } = await sendEmail({
                to: email,
                subject: 'Solicitud de Restablecimiento',
                html: getNotFoundTemplate(email),
            });

            if (!success) {
                return NextResponse.json({ error: 'Error al enviar el correo de aviso.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Si el correo existe, recibirás instrucciones.' });
        }

        // user is already obtained from Prisma above
        const userId = user.id;

        // 2. Insertar token en DB
        // Formatear expiresAt (si viene como ISO string) para MySQL. Default 1 hora.
        const expirationDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 60 * 60 * 1000);
        const expiresAtMySQL = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

        await db.query<ResultSetHeader>(
            `INSERT INTO password_reset_tokens (user_id, token, email, expires_at, used)
       VALUES (?, ?, ?, ?, 0)`,
            [Number(userId), token, email, expiresAtMySQL]
        );

        // 3. Enviar mail de éxito
        const { success, error: emailError } = await sendEmail({
            to: email,
            subject: 'Restablecer Contraseña',
            html: getResetTemplate(user.nombre, email, resetUrl),
        });

        if (!success) {
            return NextResponse.json({ error: 'Error al enviar el correo. Verificá la configuración SMTP.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Instrucciones enviadas con éxito' });

    } catch (error) {
        console.error('❌ [forgot-password] Error:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

function getResetTemplate(nombre: string, email: string, resetUrl: string) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Restablecer Contraseña</title>
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f7; }
        .email-container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 30px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
        .greeting { font-size: 20px; font-weight: 600; color: #7c3aed; margin-bottom: 24px; }
        .email-highlight { background-color: #f3f0ff; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #8b5cf6; font-family: 'Courier New', monospace; font-size: 15px; margin: 20px 0; word-break: break-all; }
        .button-container { text-align: center; margin: 30px 0; }
        .reset-button { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); transition: transform 0.2s; }
        .reset-button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(139, 92, 246, 0.5); }
        .info-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px; }
        .info-box p { margin: 0; font-size: 14px; color: #92400e; }
        .divider { height: 1px; background-color: #e0e0e0; margin: 30px 0; }
        .footer { padding: 30px; text-align: center; background-color: #faf5ff; color: #666666; font-size: 14px; }
        .footer p { margin: 8px 0; }
        .footer a { color: #8b5cf6; text-decoration: none; }
        .security-note { font-size: 13px; color: #666666; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header"><h1>🔐 Restablecer Contraseña</h1></div>
        <div class="content">
            <p class="greeting">Hola ${nombre},</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada al correo:</p>
            <div class="email-highlight">${email}</div>
            <p>Para restablecer tu contraseña, haz clic en el siguiente botón:</p>
            <div class="button-container">
                <a href="${resetUrl}" class="reset-button">Restablecer Contraseña</a>
            </div>
            <p style="font-size: 14px; color: #666;">O copia y pega este enlace en tu navegador:</p>
            <div class="email-highlight" style="font-size: 13px;">${resetUrl}</div>
            <div class="info-box"><p><strong>⏰ Este enlace expirará en 1 hora</strong> por motivos de seguridad.</p></div>
            <div class="divider"></div>
            <div class="security-note">
                <p><strong>¿No solicitaste este cambio?</strong></p>
                <p>Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura. Tu cuenta permanecerá protegida.</p>
                <p style="margin-top: 12px;">Si tienes alguna duda, contacta con nuestro equipo de soporte.</p>
            </div>
        </div>
        <div class="footer">
            <p><strong>Muvail</strong></p>
            <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
            <p>© 2025 Muvail-AllBase. Todos los derechos reservados.</p>
        </div>
    </div>
</body>
</html>`;
}

function getNotFoundTemplate(email: string) {
    const registerUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestor.muvail.com';
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitud de Restablecimiento</title>
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f7; }
        .email-container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 30px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; }
        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
        .email-highlight { background-color: #f3f0ff; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #8b5cf6; font-family: 'Courier New', monospace; font-size: 15px; margin: 20px 0; word-break: break-all; }
        .info-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px; }
        .info-box p { margin: 0; font-size: 14px; color: #991b1b; }
        .help-box { background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 24px 0; border-radius: 4px; }
        .help-box p { margin: 0 0 12px 0; font-size: 14px; color: #065f46; }
        .button-container { text-align: center; margin: 30px 0; }
        .register-button { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); }
        .footer { padding: 30px; text-align: center; background-color: #faf5ff; color: #666666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header"><h1>🔍 Solicitud de Restablecimiento</h1></div>
        <div class="content">
            <p>Hola,</p>
            <p>Recibimos una solicitud para restablecer la contraseña del correo:</p>
            <div class="email-highlight">${email}</div>
            <div class="info-box"><p><strong>⚠️ No encontramos una cuenta asociada a este correo electrónico.</strong></p></div>
            <div class="help-box">
                <p><strong>💡 ¿Qué puedes hacer?</strong></p>
                <p><strong>1.</strong> Verifica que hayas escrito correctamente tu correo electrónico</p>
                <p><strong>2.</strong> Si aún no tienes una cuenta, puedes crear una haciendo clic en el botón de abajo</p>
            </div>
            <div class="button-container">
                <a href="${registerUrl}" class="register-button">Crear una Cuenta</a>
            </div>
            <p style="font-size: 13px; color: #666;"><strong>Nota de seguridad:</strong> Por motivos de privacidad no confirmamos ni negamos la existencia de cuentas específicas.</p>
        </div>
        <div class="footer"><p><strong>Muvail</strong> · © 2025 Todos los derechos reservados</p></div>
    </div>
</body>
</html>`;
}
