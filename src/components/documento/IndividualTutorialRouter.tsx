'use client';
import { useDevice } from '@/hooks/use-device';
import { IndividualTutorial } from './IndividualTutorial';
import { IndividualTutorialMobile } from './IndividualTutorialMobile';

export function IndividualTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <IndividualTutorialMobile />;
    return <IndividualTutorial />;
}
