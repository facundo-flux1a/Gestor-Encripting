import React from 'react';
import { getCurrentUser } from '@/services/user-service';
import { redirect } from 'next/navigation';
import { getWebhooks } from '@/services/webhook-service';
import { prisma } from '@/lib/prisma';
import WebhooksClient from './webhooks-client';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/login');
  }

  const empRowsPrisma = await prisma.empresas.findMany({
    where: { id_de_usuario: { array_contains: user.id } },
    select: { id: true, nombre_de_empresa: true },
    orderBy: { id: 'asc' }
  });

  const empRows = empRowsPrisma.map(e => ({
    id: Number(e.id),
    nombre_de_empresa: e.nombre_de_empresa || ''
  }));

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

