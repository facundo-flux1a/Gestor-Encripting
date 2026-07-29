export function getUnauthorizedSenderEmailHtml(emailFrom: string, emailSubject: string, numAttachments: number, dateStr: string, timeStr: string, fullDateStr: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notificación - Remitente No Autorizado</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%);">
    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%); padding: 50px 20px;">
        <tr>
            <td align="center">
                <!-- Container principal -->
                <table width="650" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 24px; box-shadow: 0 25px 70px rgba(249, 115, 22, 0.4); overflow: hidden;">
                    
                    <!-- Header naranja/rojo -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%); padding: 50px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <h1 style="color: #ffffff; font-size: 34px; font-weight: 700; margin: 0 0 10px; letter-spacing: -0.5px;">
                                            Sistema Documental
                                        </h1>
                                        <p style="color: rgba(255,255,255,0.95); font-size: 16px; margin: 0; font-weight: 500; letter-spacing: 0.3px;">
                                            Muvail | Gestión Empresarial
                                        </p>
                                    </td>
                                    <td style="text-align: right; vertical-align: middle;">
                                        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); width: 85px; height: 85px; border-radius: 22px; display: inline-block; text-align: center; line-height: 85px; box-shadow: 0 12px 30px rgba(220, 38, 38, 0.5);">
                                            <span style="font-size: 44px;">🚫</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Barra de estado naranja/rojo -->
                    <tr>
                        <td style="background: linear-gradient(90deg, #dc2626 0%, #f97316 100%); padding: 22px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="color: #ffffff; font-size: 16px; font-weight: 700; letter-spacing: 0.8px;">
                                        REMITENTE NO AUTORIZADO
                                    </td>
                                    <td style="text-align: right; color: rgba(255,255,255,0.95); font-size: 14px; font-weight: 600;">
                                        ${dateStr}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Contenido -->
                    <tr>
                        <td style="padding: 48px 40px;">
                            
                            <!-- Remitente -->
                            <div style="margin-bottom: 38px;">
                                <p style="color: #f97316; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px; font-weight: 700;">
                                    REMITENTE DEL EMAIL
                                </p>
                                <p style="color: #1f2937; font-size: 19px; margin: 0; font-weight: 700;">
                                    Usuario de Correo
                                </p>
                                <p style="color: #6b7280; font-size: 15px; margin: 8px 0 0; font-weight: 500;">
                                    ${emailFrom}
                                </p>
                            </div>
                            
                            <!-- Mensaje principal -->
                            <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 38px; font-weight: 500;">
                                Le informamos que su email enviado el 
                                <strong>${dateStr}</strong> 
                                aproximadamente a las <strong>${timeStr} (hora de España)</strong>, 
                                no pudo ser procesado porque <strong style="color: #dc2626;">su dirección de correo no está asociada a ninguna empresa registrada</strong> en el sistema.
                            </p>
                            
                            <!-- Alerta -->
                            <div style="background: linear-gradient(135deg, #fee2e2 0%, #fef3c7 100%); border-left: 5px solid #dc2626; border-radius: 14px; padding: 26px; margin-bottom: 38px;">
                                <p style="color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 14px; font-weight: 800;">
                                    🚫 ACCESO NO AUTORIZADO
                                </p>
                                <p style="color: #1f2937; font-size: 18px; line-height: 1.5; margin: 0; font-weight: 700;">
                                    Su dirección de correo <strong style="color: #dc2626;">${emailFrom}</strong> no está autorizada para cargar documentos al sistema.
                                </p>
                            </div>
                            
                            <!-- Detalles del email -->
                            <p style="color: #f97316; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 16px; font-weight: 700;">
                                DETALLE DEL EMAIL
                            </p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #fed7aa; border-radius: 14px; overflow: hidden; margin-bottom: 38px;">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%); padding: 16px 22px; color: #ffffff; font-size: 13px; font-weight: 700; text-transform: uppercase; width: 40%; letter-spacing: 0.8px;">
                                        Campo
                                    </td>
                                    <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%); padding: 16px 22px; color: #ffffff; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">
                                        Valor
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #fff7ed; color: #ea580c; font-size: 14px; font-weight: 600;">
                                        Remitente
                                    </td>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #ffffff; color: #1f2937; font-size: 14px; font-weight: 700;">
                                        ${emailFrom}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #fff7ed; color: #ea580c; font-size: 14px; font-weight: 600;">
                                        Asunto
                                    </td>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #ffffff; color: #1f2937; font-size: 14px; font-weight: 700;">
                                        ${emailSubject}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #fff7ed; color: #ea580c; font-size: 14px; font-weight: 600;">
                                        Archivos Adjuntos
                                    </td>
                                    <td style="padding: 18px 22px; border-bottom: 1px solid #f3f4f6; background-color: #ffffff; color: #1f2937; font-size: 14px; font-weight: 700;">
                                        ${numAttachments} archivo(s)
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 18px 22px; background-color: #fff7ed; color: #ea580c; font-size: 14px; font-weight: 600;">
                                        Fecha de Envío
                                    </td>
                                    <td style="padding: 18px 22px; background-color: #ffffff; color: #1f2937; font-size: 14px; font-weight: 700;">
                                        ${fullDateStr} (España)
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Soluciones -->
                            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%); border-radius: 18px; padding: 34px; margin-bottom: 38px; box-shadow: 0 12px 35px rgba(249, 115, 22, 0.4);">
                                <p style="color: #ffffff; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 24px; font-weight: 800;">
                                    🔧 ¿CÓMO RESOLVER ESTO?
                                </p>
                                
                                <div style="background: rgba(255,255,255,0.18); border-radius: 14px; padding: 20px; margin-bottom: 16px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.25);">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding-right: 16px; vertical-align: top;">
                                                <div style="background: rgba(255,255,255,0.3); width: 36px; height: 36px; border-radius: 10px; text-align: center; line-height: 36px; color: #ffffff; font-weight: 800; font-size: 17px;">1</div>
                                            </td>
                                            <td style="color: #ffffff; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                                <strong style="font-weight: 700; font-size: 16px;">Verificar su correo en el Dashboard</strong><br>
                                                Acceda al Dashboard de Muvail y verifique que su email esté correctamente asociado a su empresa.
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #18181b 0%, #09090b 100%); padding: 38px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding-bottom: 20px; border-bottom: 1px solid rgba(249, 115, 22, 0.2);">
                                        <p style="color: #f3f4f6; font-size: 17px; font-weight: 700; margin: 0;">
                                            Sistema de Gestión Documental
                                        </p>
                                        <p style="color: #f97316; font-size: 14px; margin: 8px 0 0; font-weight: 600;">
                                            Muvail | Plataforma de Gestión Empresarial
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export function getRejectedFilesEmailHtml(emailFrom: string, dateStr: string, rejectedFiles: { filename: string, reason: string, time: string }[]): string {
    const total = rejectedFiles.length;
    
    const fileListHtml = rejectedFiles.map((file, index) => `
    <!-- Documento ${index + 1} -->
    <div style="background: #ffffff; border: 2px solid #e9d5ff; border-radius: 14px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.08);">
        <div style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); padding: 18px 22px; border-bottom: 2px solid #e9d5ff;">
            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td>
                        <span style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: #ffffff; font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.8px;">
                            Archivo ${index + 1}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <span style="color: #6b7280; font-size: 13px; font-weight: 600;">
                            ${file.time}
                        </span>
                    </td>
                </tr>
            </table>
        </div>
        <div style="padding: 22px;">
            <div style="margin-bottom: 18px;">
                <p style="color: #7c3aed; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; font-weight: 700;">
                    📄 NOMBRE DEL ARCHIVO
                </p>
                <p style="color: #1f2937; font-size: 16px; margin: 0; font-weight: 700; word-break: break-all;">
                    ${file.filename}
                </p>
            </div>
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fce7f3 100%); border-left: 4px solid #ef4444; border-radius: 10px; padding: 16px; margin-bottom: 18px;">
                <p style="color: #991b1b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; font-weight: 700;">
                    ⚠️ MOTIVO DEL RECHAZO
                </p>
                <p style="color: #1f2937; font-size: 15px; line-height: 1.5; margin: 0; font-weight: 600;">
                    ${file.reason || 'El archivo no pudo ser procesado correctamente'}
                </p>
            </div>
        </div>
    </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notificación - Archivos Rechazados</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c026d3 100%);">
    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c026d3 100%); padding: 50px 20px;">
        <tr>
            <td align="center">
                <table width="650" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 24px; box-shadow: 0 25px 70px rgba(124, 58, 237, 0.4); overflow: hidden;">
                    
                    <tr>
                        <td style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c026d3 100%); padding: 50px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <h1 style="color: #ffffff; font-size: 34px; font-weight: 700; margin: 0 0 10px; letter-spacing: -0.5px;">
                                            Sistema Documental
                                        </h1>
                                        <p style="color: rgba(255,255,255,0.95); font-size: 16px; margin: 0; font-weight: 500; letter-spacing: 0.3px;">
                                            Muvail | Gestión Empresarial
                                        </p>
                                    </td>
                                    <td style="text-align: right; vertical-align: middle;">
                                        <div style="background: linear-gradient(135deg, #ec4899 0%, #ef4444 100%); width: 85px; height: 85px; border-radius: 22px; display: inline-block; text-align: center; line-height: 85px; box-shadow: 0 12px 30px rgba(236, 72, 153, 0.5);">
                                            <span style="font-size: 44px;">⚠️</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="background: linear-gradient(90deg, #c026d3 0%, #ec4899 100%); padding: 22px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="color: #ffffff; font-size: 16px; font-weight: 700; letter-spacing: 0.8px;">
                                        DOCUMENTOS NO PROCESADOS
                                    </td>
                                    <td style="text-align: right; color: rgba(255,255,255,0.95); font-size: 14px; font-weight: 600;">
                                        ${total} archivo${total > 1 ? 's' : ''} rechazado${total > 1 ? 's' : ''}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 48px 40px;">
                            <div style="margin-bottom: 38px;">
                                <p style="color: #a855f7; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px; font-weight: 700;">
                                    DESTINATARIO
                                </p>
                                <p style="color: #1f2937; font-size: 19px; margin: 0; font-weight: 700;">
                                    Usuario de Muvail
                                </p>
                                <p style="color: #6b7280; font-size: 15px; margin: 8px 0 0; font-weight: 500;">
                                    ${emailFrom}
                                </p>
                            </div>
                            
                            <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 38px; font-weight: 500;">
                                Le informamos que <strong style="color: #7c3aed;">${total} documento${total > 1 ? 's' : ''}</strong> 
                                no ${total > 1 ? 'han' : 'ha'} podido ser procesado${total > 1 ? 's' : ''}. 
                                A continuación, encontrará el detalle de cada archivo rechazado.
                            </p>
                            
                            <div style="background: linear-gradient(135deg, #fce7f3 0%, #f3e8ff 100%); border-left: 5px solid #c026d3; border-radius: 14px; padding: 26px; margin-bottom: 38px;">
                                <p style="color: #a21caf; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 14px; font-weight: 800;">
                                    📊 RESUMEN DE RECHAZOS
                                </p>
                                <p style="color: #1f2937; font-size: 16px; line-height: 1.6; margin: 0; font-weight: 600;">
                                    Total de archivos rechazados: <strong style="color: #7c3aed; font-size: 18px;">${total}</strong><br>
                                    Fecha del proceso: <strong style="color: #7c3aed;">${dateStr}</strong>
                                </p>
                            </div>
                            
                            <p style="color: #a855f7; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 16px; font-weight: 700;">
                                DETALLE DE DOCUMENTOS RECHAZADOS
                            </p>
                            
                            ${fileListHtml}
                            
                            <!-- Soluciones -->
                            <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c026d3 100%); border-radius: 18px; padding: 34px; margin-bottom: 38px; box-shadow: 0 12px 35px rgba(124, 58, 237, 0.4);">
                                <p style="color: #ffffff; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 24px; font-weight: 800;">
                                    💡 SOLUCIONES RECOMENDADAS
                                </p>
                                <div style="background: rgba(255,255,255,0.18); border-radius: 14px; padding: 20px; margin-bottom: 16px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.25);">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding-right: 16px; vertical-align: top;">
                                                <div style="background: rgba(255,255,255,0.3); width: 36px; height: 36px; border-radius: 10px; text-align: center; line-height: 36px; color: #ffffff; font-weight: 800; font-size: 17px;">
                                                    1
                                                </div>
                                            </td>
                                            <td style="color: #ffffff; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                                <strong style="font-weight: 700; font-size: 16px;">Usar el Dashboard de Muvail</strong><br>
                                                Suba los archivos directamente desde el panel de gestión.
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export function getIngestionSummaryEmailHtml(emailFrom: string, nombreEmpresa: string, dateStr: string, acceptedFiles: { filename: string, status: string }[], rejectedFiles: { filename: string, reason: string }[]): string {
    const totalFiles = acceptedFiles.length + rejectedFiles.length;
    const allSuccess = rejectedFiles.length === 0;

    let acceptedHtml = '';
    if (acceptedFiles.length > 0) {
        acceptedHtml = `
        <div style="margin-bottom: 24px;">
            <p style="color: #16a34a; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 14px; font-weight: 800;">
                ✅ PROCESADOS CON ÉXITO (${acceptedFiles.length})
            </p>
            ${acceptedFiles.map(file => `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px;">
                <p style="color: #1f2937; font-size: 14px; margin: 0; font-weight: 600;">
                    ${file.filename}
                </p>
                <p style="color: #15803d; font-size: 12px; margin: 4px 0 0; font-weight: 500;">
                    Estado final: ${file.status}
                </p>
            </div>
            `).join('')}
        </div>`;
    }

    let rejectedHtml = '';
    if (rejectedFiles.length > 0) {
        rejectedHtml = `
        <div style="margin-bottom: 24px;">
            <p style="color: #dc2626; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 14px; font-weight: 800;">
                ❌ RECHAZADOS / ERRORES (${rejectedFiles.length})
            </p>
            ${rejectedFiles.map(file => `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px;">
                <p style="color: #1f2937; font-size: 14px; margin: 0; font-weight: 600;">
                    ${file.filename}
                </p>
                <p style="color: #b91c1c; font-size: 12px; margin: 4px 0 0; font-weight: 500;">
                    Motivo: ${file.reason}
                </p>
            </div>
            `).join('')}
        </div>`;
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notificación - Resumen de Ingesta</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);">
    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%); padding: 50px 20px;">
        <tr>
            <td align="center">
                <table width="650" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 24px; box-shadow: 0 25px 70px rgba(37, 99, 235, 0.4); overflow: hidden;">
                    
                    <tr>
                        <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%); padding: 50px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <h1 style="color: #ffffff; font-size: 34px; font-weight: 700; margin: 0 0 10px; letter-spacing: -0.5px;">
                                            Sistema Documental
                                        </h1>
                                        <p style="color: rgba(255,255,255,0.95); font-size: 16px; margin: 0; font-weight: 500; letter-spacing: 0.3px;">
                                            Muvail | Gestión Empresarial
                                        </p>
                                    </td>
                                    <td style="text-align: right; vertical-align: middle;">
                                        <div style="background: linear-gradient(135deg, ${allSuccess ? '#22c55e 0%, #16a34a' : '#f59e0b 0%, #d97706'} 100%); width: 85px; height: 85px; border-radius: 22px; display: inline-block; text-align: center; line-height: 85px; box-shadow: 0 12px 30px rgba(0,0,0, 0.2);">
                                            <span style="font-size: 44px;">${allSuccess ? '✅' : '⚠️'}</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%); padding: 22px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="color: #ffffff; font-size: 16px; font-weight: 700; letter-spacing: 0.8px;">
                                        RESUMEN DE INGESTA
                                    </td>
                                    <td style="text-align: right; color: rgba(255,255,255,0.95); font-size: 14px; font-weight: 600;">
                                        ${dateStr}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 48px 40px;">
                            <div style="margin-bottom: 38px;">
                                <p style="color: #2563eb; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px; font-weight: 700;">
                                    EMPRESA DESTINO
                                </p>
                                <p style="color: #1f2937; font-size: 19px; margin: 0; font-weight: 700;">
                                    ${nombreEmpresa}
                                </p>
                                <p style="color: #6b7280; font-size: 15px; margin: 8px 0 0; font-weight: 500;">
                                    Remitente: ${emailFrom}
                                </p>
                            </div>
                            
                            <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 38px; font-weight: 500;">
                                Hemos concluido el procesamiento de los <strong>${totalFiles} archivos</strong> que enviaste recientemente. A continuación, el reporte detallado:
                            </p>
                            
                            ${acceptedHtml}
                            ${rejectedHtml}
                            
                            <!-- Boton al Dashboard -->
                            <div style="text-align: center; margin-top: 40px;">
                                <a href="https://gestor.muvail.com" style="background: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block;">
                                    Ir al Dashboard
                                </a>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}
