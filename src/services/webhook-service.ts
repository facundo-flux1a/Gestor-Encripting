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
  // Ejecutar asincrónicamente para no frenar al que llama
  setTimeout(async () => {
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
        payload.webhook_id = wh.id;
        const payloadString = JSON.stringify(payload);
        
        // Calcular firma HMAC SHA-256
        const hmac = crypto.createHmac('sha256', wh.secreto_firma);
        hmac.update(payloadString);
        const signature = hmac.digest('hex');

        let httpStatus: number | null = null;
        let responseBody: string | null = null;

        try {
          // fetch con timeout (ej: 10 segundos max)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          console.log(`[Webhooks] Enviando POST a ${wh.url_destino}`);
          const response = await fetch(wh.url_destino, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Flux-Signature': signature,
              'User-Agent': 'FluxDocs-Webhook-System/1.0'
            },
            body: payloadString,
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          httpStatus = response.status;
          
          try {
            responseBody = await response.text();
            // Truncar para no llenar la BD de basura si devuelven un HTML gigante
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

        // 3. Registrar el log en BD
        try {
          await connection.query(
            `INSERT INTO ${dbName}.webhook_logs (webhook_id, evento, payload, http_status, response_body)
             VALUES (?, ?, ?, ?, ?)`,
            [wh.id, evento, payloadString, httpStatus, responseBody]
          );
        } catch (dbLogErr) {
          console.error('[Webhooks] Error guardando log en BD:', dbLogErr);
        }
      }

    } catch (error) {
      console.error(`[Webhooks] Error crítico en fireWebhook:`, error);
    }
  }, 0);
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
    activo: !!r.activo
  })) as Webhook[];
}

export async function createWebhook(empresaId: number, urlDestino: string, eventos: string[]): Promise<number> {
  const secreto = crypto.randomBytes(32).toString('hex');
  const [result] = await connection.query<OkPacket>(
    `INSERT INTO ${dbName}.webhooks_empresa (id_de_empresa, url_destino, secreto_firma, eventos_suscritos, activo)
     VALUES (?, ?, ?, ?, 1)`,
    [empresaId, urlDestino, secreto, JSON.stringify(eventos)]
  );
  return result.insertId;
}

export async function updateWebhook(id: number, empresaId: number, data: { url_destino?: string; eventos_suscritos?: string[]; activo?: boolean }): Promise<void> {
  const fields = [];
  const params = [];

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

  if (fields.length === 0) return;

  params.push(id, empresaId);

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
