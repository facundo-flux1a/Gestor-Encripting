'use client';
import { useDevice } from '@/hooks/use-device';
import { DashboardTutorial } from './dashboard-tutorial';
import { DashboardTutorialMobile } from './DashboardTutorialMobile';

export function DashboardTutorialRouter() {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <DashboardTutorialMobile />;
    return <DashboardTutorial />;
}
