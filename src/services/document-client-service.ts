export async function confirmDocument(documentId: number): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  tipo_anterior?: string;
  tipo_nuevo?: string;
}> {
  try {
    console.log('🔄 [confirmDocument] Iniciando confirmación para documento:', documentId);
    
    const response = await fetch('/api/documents-confirm', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentId }),
    });

    console.log('📡 [confirmDocument] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ [confirmDocument] Error data:', errorData);
      throw new Error(errorData.error || 'Error al confirmar el documento');
    }

    const data = await response.json();
    console.log('✅ [confirmDocument] Success data:', data);
    return data;

  } catch (error) {
    console.error('❌ Error en confirmDocument:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}