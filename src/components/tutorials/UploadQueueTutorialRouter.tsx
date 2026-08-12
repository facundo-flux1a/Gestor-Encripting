'use client';
import { useDevice } from '@/hooks/use-device';
import { UploadQueueTutorial } from './UploadQueueTutorial';
import { UploadQueueTutorialMobile } from './UploadQueueTutorialMobile';

export function UploadQueueTutorialRouter() {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <UploadQueueTutorialMobile />;
    return <UploadQueueTutorial />;
}
