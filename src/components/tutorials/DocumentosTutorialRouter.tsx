'use client';
import { useDevice } from '@/hooks/use-device';
import { DocumentosTutorial } from './DocumentosTutorial';
import { DocumentosTutorialMobile } from './DocumentosTutorialMobile';

export function DocumentosTutorialRouter() {
    const { isMobile } = useDevice();
    if (isMobile) return <DocumentosTutorialMobile />;
    return <DocumentosTutorial />;
}
