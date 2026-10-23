'use client';

import { useState } from 'react';
import {
  getUnauthorizedSenderEmailHtml,
  getRejectedFilesEmailHtml,
  getIngestionSummaryEmailHtml,
} from '@/services/ingestion/email-templates';

// ─── Mock data ────────────────────────────────────────────────────────────────
const now = new Date();
const dateStr = now.toLocaleDateString('es-ES');
const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fullDateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const year = now.getFullYear();

const TEMPLATES = [
  // ── Ingesta ──────────────────────────────────────────────────────────────
  {
    id: 'unauthorized-sender',
    group: 'Ingesta Email',
    label: '🚫 Remitente No Autorizado',
    trigger: 'Llega un email de ingesta desde un correo que NO está asociado a ninguna empresa.',
    service: 'ingestion/email-templates.ts → getUnauthorizedSenderEmailHtml()',
    calledFrom: 'api/v1/webhook/mailparser/route.ts',
    html: getUnauthorizedSenderEmailHtml(
      'pedro.garcia@externo.com',
      'Facturas Diciembre 2024',
      3,
      dateStr,
      timeStr,
      fullDateStr,
    ),
  },
  {
    id: 'rejected-files',
    group: 'Ingesta Email',
    label: '⚠️ Archivos Rechazados',
    trigger: 'Uno o más adjuntos no pueden procesarse (formato inválido, corrupto, protegido con contraseña, etc.).',
    service: 'ingestion/email-templates.ts → getRejectedFilesEmailHtml()',
    calledFrom: 'api/v1/webhook/mailparser/route.ts',
    html: getRejectedFilesEmailHtml(
      'contabilidad@miempresa.com',
      dateStr,
      [
        { filename: 'factura_001.xlsx', reason: 'Formato no soportado. Solo se aceptan PDFs.', time: '14:32' },
        { filename: 'resumen_mes.docx', reason: 'El archivo está protegido con contraseña.', time: '14:32' },
        { filename: 'imagen_escaneada.png', reason: 'Imagen sin contenido fiscal reconocible.', time: '14:33' },
      ],
    ),
  },
  {
    id: 'ingestion-success',
    group: 'Ingesta Email',
    label: '✅ Resumen Ingesta — Éxito',
    trigger: 'Todos los documentos del email se procesaron correctamente.',
    service: 'ingestion/email-templates.ts → getIngestionSummaryEmailHtml()',
    calledFrom: 'api/v1/webhook/mailparser/route.ts',
    html: getIngestionSummaryEmailHtml(
      'contabilidad@miempresa.com',
      'Servicios Muvail SL',
      dateStr,
      [
        { filename: 'factura_proveedor_001.pdf', status: 'Procesado y registrado' },
        { filename: 'factura_cliente_002.pdf', status: 'Procesado y registrado' },
      ],
      [],
      [],
    ),
  },
  {
    id: 'ingestion-mixed',
    group: 'Ingesta Email',
    label: '⚠️ Resumen Ingesta — Con Errores',
    trigger: 'Email de ingesta con mezcla de archivos aceptados, rechazados y/o duplicados.',
    service: 'ingestion/email-templates.ts → getIngestionSummaryEmailHtml()',
    calledFrom: 'api/v1/webhook/mailparser/route.ts',
    html: getIngestionSummaryEmailHtml(
      'contabilidad@miempresa.com',
      'Servicios Muvail SL',
      dateStr,
      [{ filename: 'factura_ok.pdf', status: 'Procesado y registrado' }],
      [{ filename: 'factura_corrupta.pdf', reason: 'No se pudo extraer texto del PDF.' }],
      [{ filename: 'factura_duplicada.pdf', reason: 'Mismo número de serie ya existente.' }],
    ),
  },
  // ── Auth ─────────────────────────────────────────────────────────────────
  {
    id: 'auth-2fa',
    group: 'Auth',
    label: '🔐 Verificación / 2FA',
    trigger: '(1) Registro de nuevo usuario → verificar email. (2) Login como segundo factor de autenticación.',
    service: 'auth-service.ts → send2FAEmail()',
    calledFrom: 'auth-service.ts → registerUser(), resendCode()  /  api/auth/magic-login',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eaeaea;border-radius:10px;">
      <h2 style="color:#4F46E5;text-align:center;">Gestor Documental Muvail</h2>
      <p>Hola Ana García,</p>
      <p>Para activar tu cuenta y empezar a usar el Gestor Documental, por favor haz clic en el siguiente botón:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="#" style="background-color:#4F46E5;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Verificar mi cuenta</a>
      </div>
      <p style="color:#666;font-size:14px;text-align:center;">Si estás intentando iniciar sesión desde otro dispositivo, ingresa este código manualmente:</p>
      <div style="text-align:center;margin:20px 0;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#111;">847291</span>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:40px;">Este código expira en 15 minutos.<br>Si no solicitaste este acceso, puedes ignorar este correo.</p>
    </div>`,
  },
  {
    id: 'invitation',
    group: 'Auth',
    label: '✉️ Invitación a Empresa',
    trigger: 'Un ADMIN invita a un nuevo usuario desde Configuración → Equipo.',
    service: 'invitation-service.ts → createInvitation()',
    calledFrom: 'components/settings/TeamManagement.tsx  /  api/auth/...',
    html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
  <tr><td style="background:linear-gradient(135deg,#0070f3 0%,#0050c8 100%);padding:36px 40px;text-align:center;">
    <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase;">Gestor Documental</p>
    <h1 style="margin:12px 0 0;font-size:26px;font-weight:700;color:#ffffff;">Tenés una invitación</h1>
  </td></tr>
  <tr><td style="padding:40px;">
    <p style="margin:0 0 24px;font-size:16px;color:#374151;"><strong>Carlos Administrador</strong> te invitó a colaborar en:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:32px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Empresa</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:#1d4ed8;">Servicios Muvail SL</p>
        <p style="margin:8px 0 0;font-size:13px;color:#4b5563;">Rol: <strong style="color:#1e40af;">EDITOR</strong></p>
      </td></tr>
    </table>
    <div style="text-align:center;margin:0 0 32px;">
      <a href="#" style="display:inline-block;background:linear-gradient(135deg,#0070f3,#0050c8);color:#fff;font-size:16px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;">Aceptar Invitación →</a>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:13px;color:#6b7280;">🕐 Este enlace expirará en <strong>7 días</strong>.</p>
        <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">🔒 Si no esperabas esta invitación, ignorá este mensaje.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">© ${year} Gestor Documental · Todos los derechos reservados</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  },
  {
    id: 'invitation-resend',
    group: 'Auth',
    label: '🔁 Re-envío de Invitación',
    trigger: 'El ADMIN re-envía manualmente una invitación PENDING desde el panel de equipo.',
    service: 'invitation-service.ts → resendInvitation()',
    calledFrom: 'api/auth/resend-invitation/route.ts',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:10px;">
      <h2 style="color:#333;text-align:center;">Invitación Pendiente - Gestor Documental</h2>
      <p style="font-size:16px;color:#555;">Te recordamos que tienes una invitación pendiente para unirte a <strong>Servicios Muvail SL</strong>.</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="#" style="background-color:#0070f3;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">Aceptar Invitación</a>
      </div>
      <p style="font-size:14px;color:#888;">Este enlace expirará el ${new Date(Date.now() + 7 * 86400000).toLocaleDateString('es-ES')}.</p>
      <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
      <p style="font-size:12px;color:#aaa;text-align:center;">Enviado por Gestor Documental</p>
    </div>`,
  },
  {
    id: 'forgot-password',
    group: 'Auth',
    label: '🔑 Recuperar Contraseña',
    trigger: 'Usuario solicita cambio de contraseña desde la pantalla de login.',
    service: 'api/auth/forgot-password/route.ts (HTML inline en la ruta)',
    calledFrom: 'src/app/auth/login/page.tsx → formulario "¿Olvidaste tu contraseña?"',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eaeaea;border-radius:10px;">
      <h2 style="color:#4F46E5;text-align:center;">Gestor Documental Muvail</h2>
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="#" style="background-color:#4F46E5;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Restablecer contraseña</a>
      </div>
      <p style="color:#666;font-size:14px;">O ingresa este código manualmente:</p>
      <div style="text-align:center;margin:20px 0;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#111;">391847</span>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:40px;">Este enlace expira en 15 minutos. Si no solicitaste este cambio, ignorá este correo.</p>
    </div>`,
  },
  // ── Exportación ──────────────────────────────────────────────────────────
  {
    id: 'zip-ui',
    group: 'Exportación',
    label: '📦 ZIP — Exportación UI',
    trigger: 'Usuario exporta documentos desde la interfaz (Export / Exportar Trimestres) y la empresa tiene email de notificación configurado.',
    service: 'zip-export-service.ts → triggerZipGeneration() [isApi=false]',
    calledFrom: 'components/dashboard/export-button.tsx  /  components/trimestres/export-quarters-dialog.tsx',
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#fff">
      <h2 style="color:#7c3aed;margin-bottom:8px">📦 Tu exportación ZIP está lista</h2>
      <p style="color:#334155">Hola (Servicios Muvail SL),</p>
      <p style="color:#334155">Tu paquete de <strong>47 documentos</strong> ha sido generado correctamente.</p>
      <p style="margin:20px 0">
        <a href="#" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">⬇ Descargar ZIP</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">Enlace válido por <strong>7 días</strong>.</p>
    </div>`,
  },
  {
    id: 'zip-api',
    group: 'Exportación',
    label: '📊 ZIP — Exportación API',
    trigger: 'Se genera un export a través de la API REST (POST /api/v1/export/excel) y la empresa tiene email de notificación configurado.',
    service: 'zip-export-service.ts → triggerZipGeneration() [isApi=true]',
    calledFrom: 'api/v1/export/excel/route.ts',
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#1e293b;padding:22px 28px">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase">Gestor Documental · Notificación automática</p>
        <h2 style="margin:8px 0 0;color:#f1f5f9;font-size:18px;font-weight:700">📊 Exportación de documentos vía API</h2>
      </div>
      <div style="padding:24px 28px;background:#fff">
        <p style="margin:0 0 18px;color:#475569;font-size:13px">Se ha generado un archivo de documentos a través de la integración API.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1e293b;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500;width:150px">Empresa</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600">Servicios Muvail SL</td></tr>
          <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500">Documentos</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><strong>128</strong></td></tr>
          <tr style="background:#f8fafc"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500">Origen</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">POST /api/v1/export/excel</td></tr>
          <tr><td style="padding:10px 14px;color:#64748b;font-weight:500">Válido hasta</td><td style="padding:10px 14px">7 días desde la generación</td></tr>
        </table>
        <div style="margin:24px 0 8px"><a href="#" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">⬇ Descargar paquete ZIP</a></div>
        <p style="color:#94a3b8;font-size:11px;margin:16px 0 0">Esta notificación se envió automáticamente porque la empresa tiene un correo de carga configurado.</p>
      </div>
      <div style="background:#f1f5f9;padding:10px 28px"><p style="margin:0;font-size:10px;color:#94a3b8">Gestor Documental · ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p></div>
    </div>`,
  },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];
const GROUPS = [...new Set(TEMPLATES.map(t => t.group))];

export default function EmailPreviewPage() {
  const [active, setActive] = useState<TemplateId>(TEMPLATES[0].id);
  const current = TEMPLATES.find(t => t.id === active) ?? TEMPLATES[0];

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 260, borderRight: '1px solid #1e293b', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #1e293b' }}>
          <p style={{ margin: 0, fontSize: 9, color: '#475569', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Dev Tools · Muvail</p>
          <h1 style={{ margin: '5px 0 0', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Email Templates</h1>
          <p style={{ margin: '3px 0 0', fontSize: 10, color: '#475569' }}>{TEMPLATES.length} templates · read-only preview</p>
        </div>
        <nav style={{ padding: '8px 8px', flex: 1 }}>
          {GROUPS.map(group => (
            <div key={group}>
              <p style={{ margin: '12px 0 4px 4px', fontSize: 9, color: '#475569', letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 600 }}>{group}</p>
              {TEMPLATES.filter(t => t.group === group).map(t => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id as TemplateId)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 10px', marginBottom: 2, borderRadius: 6,
                    border: 'none', cursor: 'pointer', fontSize: 11.5,
                    fontWeight: active === t.id ? 600 : 400,
                    background: active === t.id ? 'rgba(99,102,241,0.18)' : 'transparent',
                    color: active === t.id ? '#a5b4fc' : '#94a3b8',
                    borderLeft: `3px solid ${active === t.id ? '#6366f1' : 'transparent'}`,
                    transition: 'all 0.12s',
                  }}
                >{t.label}</button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ background: '#1e293b', color: '#64748b', fontSize: 9, padding: '2px 8px', borderRadius: 4, letterSpacing: 1, textTransform: 'uppercase' }}>{current.group}</span>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{current.label}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <MetaRow icon="⚡" label="Trigger" value={current.trigger} />
            <MetaRow icon="📂" label="Función" value={current.service} mono />
            <MetaRow icon="📍" label="Llamado desde" value={current.calledFrom} mono />
          </div>
        </div>

        {/* iframe Preview */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#94a3b8' }}>
          <iframe
            key={active}
            srcDoc={current.html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={`Preview: ${current.label}`}
            sandbox="allow-same-origin"
          />
        </div>

      </main>
    </div>
  );
}

function MetaRow({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 10.5 }}>
      <span style={{ color: '#475569', flexShrink: 0 }}>{icon} <strong style={{ color: '#64748b' }}>{label}:</strong></span>
      <span style={{ color: '#94a3b8', fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit', fontSize: mono ? 10 : 10.5, lineHeight: 1.5, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
