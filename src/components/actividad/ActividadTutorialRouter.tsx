'use client';
import { useDevice } from '@/hooks/use-device';
import { ActividadTutorial } from './ActividadTutorial';
import { ActividadTutorialMobile } from './ActividadTutorialMobile';

export function ActividadTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <ActividadTutorialMobile />;
    return <ActividadTutorial />;
}
