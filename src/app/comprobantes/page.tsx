'use client';

import { MainLayout } from '@/components/layout/main-layout';
import { ComprobantesView } from '@/components/comprobantes/comprobantes-view';

export default function ComprobantesPage() {
  return (
    <MainLayout>
      <ComprobantesView />
    </MainLayout>
  );
}
