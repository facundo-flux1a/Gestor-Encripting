'use server';

import { createWebhook, deleteWebhook, updateWebhook } from '@/services/webhook-service';
import { getCurrentUser } from '@/services/user-service';
import { revalidatePath } from 'next/cache';

import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function createWebhookAction(empresaId: number | 'ALL', formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  const urlDestino = formData.get('urlDestino') as string;
  const eventos = formData.getAll('eventos') as string[];

  if (!urlDestino) throw new Error('URL es requerida');
  if (eventos.length === 0) throw new Error('Debe seleccionar al menos un evento');

  const agruparEventos = formData.get('agruparEventos') === 'on';

  if (empresaId === 'ALL') {
    const [empRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [user.id]
    );
    for (const row of empRows) {
      await createWebhook(row.id, urlDestino, eventos, agruparEventos);
    }
  } else {
    await createWebhook(empresaId as number, urlDestino, eventos, agruparEventos);
  }

  revalidatePath('/dashboard/webhooks');
}

export async function deleteWebhookAction(empresaId: number, webhookId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await deleteWebhook(webhookId, empresaId);
  revalidatePath('/dashboard/webhooks');
}

export async function toggleWebhookStatusAction(empresaId: number, webhookId: number, newStatus: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await updateWebhook(webhookId, empresaId, { activo: newStatus });
  revalidatePath('/dashboard/webhooks');
}

export async function toggleWebhookEventAction(empresaId: number, webhookId: number, eventos: string[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await updateWebhook(webhookId, empresaId, { eventos_suscritos: eventos });
  revalidatePath('/dashboard/webhooks');
}

export async function toggleWebhookConfigAction(empresaId: number, webhookId: number, agrupar: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await updateWebhook(webhookId, empresaId, { agrupar_eventos: agrupar });
  revalidatePath('/dashboard/webhooks');
}

export async function inlineUpdateWebhookAction(currentEmpresaId: number, webhookId: number, updates: { id_de_empresa?: number, url_destino?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await updateWebhook(webhookId, currentEmpresaId, updates);
  revalidatePath('/dashboard/webhooks');
}

export async function editWebhookDetailsAction(currentEmpresaId: number, webhookId: number, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  const urlDestino = formData.get('urlDestino') as string;
  const newEmpresaIdStr = formData.get('empresaId') as string;
  const newEmpresaId = parseInt(newEmpresaIdStr, 10);

  if (!urlDestino) throw new Error('URL es requerida');
  if (!newEmpresaId || isNaN(newEmpresaId)) throw new Error('Empresa es requerida');

  await updateWebhook(webhookId, currentEmpresaId, { 
    url_destino: urlDestino,
    id_de_empresa: newEmpresaId
  });

  revalidatePath('/dashboard/webhooks');
}
