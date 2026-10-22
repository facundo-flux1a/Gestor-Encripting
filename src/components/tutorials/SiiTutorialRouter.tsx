'use client';

import { useDevice } from '@/hooks/use-device';
import { SiiTutorial } from './SiiTutorial';
import { SiiTutorialMobile } from './SiiTutorialMobile';

interface SiiTutorialRouterProps {
  isDataLoading?: boolean;
}

export function SiiTutorialRouter({ isDataLoading = false }: SiiTutorialRouterProps) {
  const { isMobile, isMounted } = useDevice();
  if (!isMounted) return null;
  if (isMobile) return <SiiTutorialMobile isDataLoading={isDataLoading} />;
  return <SiiTutorial isDataLoading={isDataLoading} />;
}
