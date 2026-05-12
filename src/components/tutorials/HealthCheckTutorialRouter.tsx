'use client';

import { useDevice } from '@/hooks/use-device';
import { HealthCheckTutorial } from './HealthCheckTutorial';
import { HealthCheckTutorialMobile } from './HealthCheckTutorialMobile';

export function HealthCheckTutorialRouter() {
    const { isMobile } = useDevice();

    if (isMobile) {
        return <HealthCheckTutorialMobile />;
    }

    return <HealthCheckTutorial />;
}
