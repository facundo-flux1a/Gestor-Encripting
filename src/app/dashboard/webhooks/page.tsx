import React from 'react';
import { getCurrentUser } from '@/services/user-service';
import { redirect } from 'next/navigation';
import { getWebhooks } from '@/services/webhook-service';
import { prisma } from '@/lib/prisma';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { Webhook } from 'lucide-react';
import WebhooksClient from './webhooks-client';
import WebhooksWrapper from './webhooks-wrapper';

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

  const empRows = empRowsPrisma.map((e: { id: bigint | number; nombre_de_empresa: string | null }) => ({
    id: Number(e.id),
    nombre_de_empresa: e.nombre_de_empresa || ''
  }));

  if (empRows.length === 0) {
    return (
      <MainLayout>
        <div className="p-8">No tienes empresas asociadas.</div>
      </MainLayout>
    );
  }

  const empresaIds = empRows.map((e: { id: number }) => e.id);
  const webhooks = await getWebhooks(empresaIds);

  return (
    <MainLayout>
      <PageHeader
        title="Webhooks"
        icon={Webhook}
        data-tutorial="webhooks-header"
      >
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          HMAC-SHA256 Active
        </span>
      </PageHeader>
      <WebhooksWrapper>
        <div className="flex-1 overflow-auto px-4 pb-24 space-y-6 pt-4 max-w-6xl mx-auto w-full">
          <WebhooksClient empresas={empRows} initialWebhooks={webhooks} />
        </div>
      </WebhooksWrapper>
    </MainLayout>
  );
}
