'use client';

import { useDevice } from '@/hooks/use-device';
import { CuentasContablesTutorial } from './CuentasContablesTutorial';
import { CuentasContablesTutorialMobile } from './CuentasContablesTutorialMobile';

interface CuentasContablesTutorialRouterProps {
  isDataLoading?: boolean;
}

export function CuentasContablesTutorialRouter({ isDataLoading = false }: CuentasContablesTutorialRouterProps) {
  const { isMobile, isMounted } = useDevice();
  if (!isMounted) return null;
  if (isMobile) return <CuentasContablesTutorialMobile isDataLoading={isDataLoading} />;
  return <CuentasContablesTutorial isDataLoading={isDataLoading} />;
}
