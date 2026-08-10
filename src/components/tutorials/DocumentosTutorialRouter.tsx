'use client';
import { useDevice } from '@/hooks/use-device';
import { DocumentosTutorial } from './DocumentosTutorial';
import { DocumentosTutorialMobile } from './DocumentosTutorialMobile';

export function DocumentosTutorialRouter() {
    const { isMobile, isMounted } = useDevice();
    if (!isMounted) return null;
    if (isMobile) return <DocumentosTutorialMobile />;
    return <DocumentosTutorial />;
}
