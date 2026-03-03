'use client';
import { useDevice } from '@/hooks/use-device';
import { ProveedoresTutorial } from './ProveedoresTutorial';
import { ProveedoresTutorialMobile } from './ProveedoresTutorialMobile';

export function ProveedoresTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <ProveedoresTutorialMobile />;
    return <ProveedoresTutorial />;
}
