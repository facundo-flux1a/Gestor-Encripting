'use client';
import { useDevice } from '@/hooks/use-device';
import { IndividualTutorial } from './IndividualTutorial';
import { IndividualTutorialMobile } from './IndividualTutorialMobile';

export function IndividualTutorialRouter() {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <IndividualTutorialMobile />;
    return <IndividualTutorial />;
}
