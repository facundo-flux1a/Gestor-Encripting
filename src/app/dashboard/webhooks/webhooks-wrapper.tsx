'use client';

import { ReactNode } from 'react';
import { WebhooksProvider } from '@/context/WebhooksProvider';
import { WebhooksTutorial } from '@/components/tutorials/WebhooksTutorial';
import { WebhooksTutorialMobile } from '@/components/tutorials/WebhooksTutorialMobile';

export default function WebhooksWrapper({ children }: { children: ReactNode }) {
  return (
    <WebhooksProvider>
      {/* Desktop tutorial */}
      <div className="hidden md:block">
        <WebhooksTutorial />
      </div>
      {/* Mobile tutorial */}
      <div className="block md:hidden">
        <WebhooksTutorialMobile />
      </div>
      {children}
    </WebhooksProvider>
  );
}
