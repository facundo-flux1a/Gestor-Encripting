'use server';

import { createWebhook, deleteWebhook } from '@/services/webhook-service';
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

  if (empresaId === 'ALL') {
    const [empRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [user.id]
    );
    for (const row of empRows) {
      await createWebhook(row.id, urlDestino, eventos);
    }
  } else {
    await createWebhook(empresaId as number, urlDestino, eventos);
  }

  revalidatePath('/dashboard/webhooks');
}

export async function deleteWebhookAction(empresaId: number, webhookId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No autorizado');

  await deleteWebhook(webhookId, empresaId);
  revalidatePath('/dashboard/webhooks');
}
