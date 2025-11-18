import { useEffect } from 'react';

const CHANNEL_NAME = 'document-updates';

export type DocumentEventType = 
  | 'DOCUMENTS_UPDATED' 
  | 'ACTIVITY_DELETED' 
  | 'DOCUMENT_MOVED'
  | 'COMPANY_DELETED';

/**
 * Hook para escuchar eventos de actualización de documentos
 * Se sincroniza entre pestañas usando BroadcastChannel
 */
export function useDocumentEvents(onUpdate: () => void) {
  useEffect(() => {
    // Solo funciona en el navegador
    if (typeof window === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    
    channel.onmessage = (event) => {
      console.log('🔔 [DocumentEvents] Evento recibido:', event.data.type);
      
      if (event.data.type) {
        onUpdate();
      }
    };

    return () => channel.close();
  }, [onUpdate]);
}

/**
 * Notifica que los documentos fueron actualizados
 */
export function notifyDocumentsUpdated(eventType: DocumentEventType = 'DOCUMENTS_UPDATED') {
  if (typeof window === 'undefined') return;
  
  console.log('📢 [DocumentEvents] Notificando:', eventType);
  
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: eventType, timestamp: Date.now() });
  channel.close();
}