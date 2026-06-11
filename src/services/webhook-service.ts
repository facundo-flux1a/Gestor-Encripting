import connection, { dbName } from '@/lib/db';
import crypto from 'crypto';
import type { RowDataPacket, OkPacket } from 'mysql2';

export interface Webhook {
  id: number;
  id_de_empresa: number;
  url_destino: string;
  secreto_firma: string;
  eventos_suscritos: string[];
  activo: boolean;
  config: { agrupar_eventos: boolean };
  created_at: string;
}

export interface WebhookLog {
  id: number;
  webhook_id: number;
  evento: string;
  payload: any;
  http_status: number | null;
  response_body: string | null;
  created_at: string;
}

/**
 * Función central para disparar un webhook de forma asíncrona ("fire-and-forget").
 * No bloquea la ejecución principal.
 */
export async function fireWebhook(empresaId: number, evento: string, payloadData: any) {
  try {
      console.log(`[Webhooks] Evaluando evento '${evento}' para empresa ${empresaId}...`);
      
      // 1. Buscar webhooks activos suscritos a este evento
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id, url_destino, secreto_firma, eventos_suscritos 
         FROM ${dbName}.webhooks_empresa 
         WHERE id_de_empresa = ? AND activo = 1`,
        [empresaId]
      );

      const webhooks = rows.filter(row => {
        try {
          const eventos = typeof row.eventos_suscritos === 'string' 
            ? JSON.parse(row.eventos_suscritos) 
            : row.eventos_suscritos;
          return Array.isArray(eventos) && eventos.includes(evento);
        } catch (e) {
          return false;
        }
      });

      if (webhooks.length === 0) {
        return; // Nadie escucha este evento
      }

      console.log(`[Webhooks] Encontrados ${webhooks.length} webhooks para evento '${evento}'`);

      const payload = {
        webhook_id: null, // Se pisa por cada webhook
        evento,
        fecha_evento: new Date().toISOString(),
        empresa_id: empresaId,
        data: payloadData
      };

      // 2. Disparar cada webhook
      for (const wh of webhooks) {
        await sendWebhookToTarget(wh, evento, payloadData, empresaId);
      }

    } catch (error) {
      console.error(`[Webhooks] Error crítico en fireWebhook:`, error);
    }
}

async function sendWebhookToTarget(wh: any, evento: string, data: any, empresaId: number) {
  const payload = {
    webhook_id: wh.id,
    evento,
    fecha_evento: new Date().toISOString(),
    empresa_id: empresaId,
    data
  };

  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', wh.secreto_firma);
  hmac.update(payloadString);
  const signature = hmac.digest('hex');

  let httpStatus: number | null = null;
  let responseBody: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    console.log(`[Webhooks] Enviando POST a ${wh.url_destino} (Evento: ${evento})`);
    const response = await fetch(wh.url_destino, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Muvail-Signature': signature,
        'User-Agent': 'Muvail-Webhook-System/1.0'
      },
      body: payloadString,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    httpStatus = response.status;
    
    try {
      responseBody = await response.text();
      if (responseBody && responseBody.length > 2000) {
        responseBody = responseBody.substring(0, 2000) + '... (truncado)';
      }
    } catch (e) {
      responseBody = 'No se pudo leer la respuesta';
    }
    
    if (!response.ok) {
      console.warn(`[Webhooks] ⚠️ Fallo al enviar a ${wh.url_destino} (HTTP ${httpStatus})`);
    } else {
      console.log(`[Webhooks] ✅ Enviado a ${wh.url_destino} (HTTP ${httpStatus})`);
    }

  } catch (fetchError: any) {
    console.error(`[Webhooks] ❌ Error de red enviando a ${wh.url_destino}:`, fetchError.message);
    responseBody = fetchError.name === 'AbortError' ? 'Timeout (10s)' : fetchError.message;
  }

  try {
    let originalId = data?.upload_id_original;
    if (!originalId && data?.lote && Array.isArray(data.lote) && data.lote.length > 0) {
      originalId = data.lote[0]?.upload_id_original;
    }

    const redactedPayload = {
      evento,
      data: {
        upload_id_original: originalId
      },
      _redacted_for_privacy: true
    };
    const redactedPayloadString = JSON.stringify(redactedPayload);

    await connection.query(
      `INSERT INTO ${dbName}.webhook_logs (webhook_id, evento, payload, http_status, response_body)
       VALUES (?, ?, ?, ?, ?)`,
      [wh.id, evento, redactedPayloadString, httpStatus, responseBody]
    );
  } catch (dbLogErr) {
    console.error('[Webhooks] Error guardando log en BD:', dbLogErr);
  }
}

/**
 * Smart Dispatcher para eventos masivos (lotes).
 * Lee la config de cada webhook para decidir si enviar N peticiones separadas o 1 sola empaquetada.
 */
export async function fireBatchWebhook(empresaId: number, eventoSingular: string, eventoPlural: string, payloadDataArray: any[]) {
  if (!payloadDataArray || payloadDataArray.length === 0) return;

  try {
    console.log(`[Webhooks] Evaluando batch (${payloadDataArray.length} items) para evento '${eventoSingular}' en empresa ${empresaId}...`);
    
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, url_destino, secreto_firma, eventos_suscritos, config 
       FROM ${dbName}.webhooks_empresa 
       WHERE id_de_empresa = ? AND activo = 1`,
      [empresaId]
    );

    const webhooks = rows.filter(row => {
      try {
        const eventos = typeof row.eventos_suscritos === 'string' 
          ? JSON.parse(row.eventos_suscritos) 
          : row.eventos_suscritos;
        return Array.isArray(eventos) && eventos.includes(eventoSingular);
      } catch (e) {
        return false;
      }
    });

    if (webhooks.length === 0) return;

    for (const wh of webhooks) {
      // Parsear la config JSON
      let configObj = { agrupar_eventos: false };
      try {
        configObj = typeof wh.config === 'string' ? JSON.parse(wh.config) : (wh.config || configObj);
      } catch (e) {}

      if (configObj.agrupar_eventos) {
        // Modo Agrupado: 1 envío con evento plural y data en array
        const batchPayload = {
          total_eventos: payloadDataArray.length,
          lote: payloadDataArray
        };
        await sendWebhookToTarget(wh, eventoPlural, batchPayload, empresaId);
      } else {
        // Modo Individual: N envíos
        // Implementamos envío en "mini-batches" (chunks) de a 10 para no sobrecargar el ERP
        // del cliente ni bloquear el hilo del Gestor por demasiado tiempo.
        const CHUNK_SIZE = 10;
        for (let i = 0; i < payloadDataArray.length; i += CHUNK_SIZE) {
          const chunk = payloadDataArray.slice(i, i + CHUNK_SIZE);
          
          // Enviar el chunk actual (hasta 10 peticiones) en paralelo
          await Promise.allSettled(
            chunk.map(data => sendWebhookToTarget(wh, eventoSingular, data, empresaId))
          );

          // Si aún quedan más elementos por procesar, damos un respiro (delay) de 500ms al servidor de destino
          if (i + CHUNK_SIZE < payloadDataArray.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Webhooks] Error crítico en fireBatchWebhook:`, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD de Webhooks
// ─────────────────────────────────────────────────────────────────────────────

export async function getWebhooks(empresaIds: number[]): Promise<Webhook[]> {
  if (empresaIds.length === 0) return [];
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT * FROM ${dbName}.webhooks_empresa WHERE id_de_empresa IN (?) ORDER BY created_at DESC`,
    [empresaIds]
  );
  return rows.map(r => ({
    ...r,
    eventos_suscritos: typeof r.eventos_suscritos === 'string' ? JSON.parse(r.eventos_suscritos) : r.eventos_suscritos,
    config: typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || { agrupar_eventos: false }),
    activo: !!r.activo
  })) as Webhook[];
}

export async function createWebhook(empresaId: number, urlDestino: string, eventos: string[], agruparEventos: boolean = false): Promise<number> {
  const secreto = crypto.randomBytes(32).toString('hex');
  const config = JSON.stringify({ agrupar_eventos: agruparEventos });
  const [result] = await connection.query<OkPacket>(
    `INSERT INTO ${dbName}.webhooks_empresa (id_de_empresa, url_destino, secreto_firma, eventos_suscritos, config, activo)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [empresaId, urlDestino, secreto, JSON.stringify(eventos), config]
  );
  return result.insertId;
}

export async function updateWebhook(id: number, currentEmpresaId: number, data: { id_de_empresa?: number; url_destino?: string; eventos_suscritos?: string[]; activo?: boolean; agrupar_eventos?: boolean }): Promise<void> {
  const fields = [];
  const params = [];

  if (data.id_de_empresa !== undefined) {
    fields.push('id_de_empresa = ?');
    params.push(data.id_de_empresa);
  }
  if (data.url_destino !== undefined) {
    fields.push('url_destino = ?');
    params.push(data.url_destino);
  }
  if (data.eventos_suscritos !== undefined) {
    fields.push('eventos_suscritos = ?');
    params.push(JSON.stringify(data.eventos_suscritos));
  }
  if (data.activo !== undefined) {
    fields.push('activo = ?');
    params.push(data.activo ? 1 : 0);
  }
  if (data.agrupar_eventos !== undefined) {
    fields.push('config = ?');
    params.push(JSON.stringify({ agrupar_eventos: data.agrupar_eventos }));
  }

  if (fields.length === 0) return;

  params.push(id, currentEmpresaId);

  await connection.query<OkPacket>(
    `UPDATE ${dbName}.webhooks_empresa SET ${fields.join(', ')} WHERE id = ? AND id_de_empresa = ?`,
    params
  );
}

export async function deleteWebhook(id: number, empresaId: number): Promise<void> {
  await connection.query<OkPacket>(
    `DELETE FROM ${dbName}.webhooks_empresa WHERE id = ? AND id_de_empresa = ?`,
    [id, empresaId]
  );
}

export async function getWebhookLogs(webhookId: number, empresaId: number): Promise<WebhookLog[]> {
  // Primero validar que el webhook pertenece a la empresa
  const [whRows] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM ${dbName}.webhooks_empresa WHERE id = ? AND id_de_empresa = ?`,
    [webhookId, empresaId]
  );
  if (whRows.length === 0) return [];

  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT * FROM ${dbName}.webhook_logs WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 50`,
    [webhookId]
  );
  return rows.map(r => ({
    ...r,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
  })) as WebhookLog[];
}
