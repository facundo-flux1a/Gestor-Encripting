import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
}

export async function sendEmail({ to, subject, html, fromName }: SendEmailOptions) {
    try {
        const info = await transporter.sendMail({
            from: `"${fromName || process.env.SMTP_FROM_NAME || 'Gestor Documental'}" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });
        console.log('✅ [email-service] Email enviado:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ [email-service] Error enviando email:', error);
        return { success: false, error };
    }
}
