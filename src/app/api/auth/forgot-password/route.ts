import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { sendEmail } from '@/services/email-service';

export async function POST(request: NextRequest) {
    try {
        const { email, token, resetUrl, expiresAt } = await request.json();

        if (!email || !token || !resetUrl) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        // 1. Buscar usuario
        const [users] = await db.query<RowDataPacket[]>(
            'SELECT id, nombre, email FROM usuarios WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
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

        const user = users[0];

        // 2. Insertar token en DB
        // Formatear expiresAt (si viene como ISO string) para MySQL. Default 1 hora.
        const expirationDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 60 * 60 * 1000);
        const expiresAtMySQL = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

        await db.query<ResultSetHeader>(
            `INSERT INTO password_reset_tokens (user_id, token, email, expires_at, used)
       VALUES (?, ?, ?, ?, 0)`,
            [user.id, token, email, expiresAtMySQL]
        );

        // 3. Enviar mail de éxito
        const { success, error: emailError } = await sendEmail({
            to: email,
            subject: 'Restablecer Contraseña',
            html: getResetTemplate(user.nombre, resetUrl),
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

function getResetTemplate(nombre: string, resetUrl: string) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; font-family: sans-serif; background-color: #f4f4f7; }
        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px; text-align: center; color: #ffffff; }
        .content { padding: 40px; color: #333; line-height: 1.6; }
        .button-container { text-align: center; margin: 30px 0; }
        .button { display: inline-block; padding: 14px 40px; background: #8b5cf6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .footer { padding: 30px; text-align: center; background: #faf5ff; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>🔐 Restablecer Contraseña</h1></div>
        <div class="content">
            <p>Hola <strong>${nombre}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para continuar:</p>
            <div class="button-container">
                <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
            </div>
            <p>Este enlace expirará en 1 hora por motivos de seguridad.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 13px; color: #888;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
        </div>
        <div class="footer"><p>© 2025 Muvail-AllBase. Todos los derechos reservados.</p></div>
    </div>
</body>
</html>`;
}

function getNotFoundTemplate(email: string) {
    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; background: #f4f4f7; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <h2 style="color: #ef4444;">Solicitud de Restablecimiento</h2>
        <p>Recibimos una solicitud para el correo: <strong>${email}</strong></p>
        <p style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; color: #991b1b;">
            ⚠️ <strong>No encontramos una cuenta asociada a este correo.</strong>
        </p>
        <p>Si aún no tienes cuenta, puedes registrarte en nuestra plataforma.</p>
    </div>
</body>
</html>`;
}
