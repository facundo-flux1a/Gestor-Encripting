import React from 'react';
import { getCurrentUser } from '@/services/user-service';
import { redirect } from 'next/navigation';
import { getWebhooks } from '@/services/webhook-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import WebhooksClient from './webhooks-client';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/login');
  }

  const [empRows] = await db.query<RowDataPacket[]>(
    `SELECT id, nombre_de_empresa FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON)) ORDER BY id ASC`,
    [user.id]
  );

  if (empRows.length === 0) {
    return <div className="p-8">No tienes empresas asociadas.</div>;
  }

  const empresaIds = empRows.map(e => e.id);
  const webhooks = await getWebhooks(empresaIds);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <WebhooksClient empresas={empRows} initialWebhooks={webhooks} />
    </div>
  );
}

