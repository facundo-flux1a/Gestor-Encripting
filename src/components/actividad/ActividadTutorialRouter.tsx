'use client';
import { useDevice } from '@/hooks/use-device';
import { ActividadTutorial } from './ActividadTutorial';
import { ActividadTutorialMobile } from './ActividadTutorialMobile';

export function ActividadTutorialRouter() {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <ActividadTutorialMobile />;
    return <ActividadTutorial />;
}
