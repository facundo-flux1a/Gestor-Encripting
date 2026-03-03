'use client';
import { useDevice } from '@/hooks/use-device';
import { IncidenciasTutorial } from './IncidenciasTutorial';
import { IncidenciasTutorialMobile } from './IncidenciasTutorialMobile';

export function IncidenciasTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <IncidenciasTutorialMobile />;
    return <IncidenciasTutorial />;
}
