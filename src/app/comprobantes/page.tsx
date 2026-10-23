'use client';

import { MainLayout } from '@/components/layout/main-layout';
import { ComprobantesView } from '@/components/comprobantes/comprobantes-view';
import { ComprobantesTutorialProvider } from '@/context/ComprobantesTutorialProvider';

export default function ComprobantesPage() {
  return (
    <ComprobantesTutorialProvider>
      <MainLayout>
        <ComprobantesView />
      </MainLayout>
    </ComprobantesTutorialProvider>
  );
}
