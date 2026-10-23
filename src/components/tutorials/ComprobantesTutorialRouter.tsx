'use client';

import { useDevice } from '@/hooks/use-device';
import { ComprobantesTutorial } from './ComprobantesTutorial';
import { ComprobantesTutorialMobile } from './ComprobantesTutorialMobile';

interface ComprobantesTutorialRouterProps {
  isDataLoading?: boolean;
}

export function ComprobantesTutorialRouter({ isDataLoading = false }: ComprobantesTutorialRouterProps) {
  const { isMobile, isMounted } = useDevice();
  if (!isMounted) return null;
  if (isMobile) return <ComprobantesTutorialMobile isDataLoading={isDataLoading} />;
  return <ComprobantesTutorial isDataLoading={isDataLoading} />;
}
