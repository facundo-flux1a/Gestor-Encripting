'use client';
import { useDevice } from '@/hooks/use-device';
import { TrazabilidadTutorial } from './TrazabilidadTutorial';
import { TrazabilidadTutorialMobile } from './TrazabilidadTutorialMobile';

interface TrazabilidadTutorialRouterProps {
  isDataLoading?: boolean;
}

export function TrazabilidadTutorialRouter({ isDataLoading = false }: TrazabilidadTutorialRouterProps) {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <TrazabilidadTutorialMobile isDataLoading={isDataLoading} />;
    return <TrazabilidadTutorial isDataLoading={isDataLoading} />;
}
