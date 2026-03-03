'use client';
import { useDevice } from '@/hooks/use-device';
import { TrimestresTutorial } from './TrimestresTutorial';
import { TrimestresTutorialMobile } from './TrimestresTutorialMobile';

export function TrimestresTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <TrimestresTutorialMobile />;
    return <TrimestresTutorial />;
}
