// utils/pdf-worker-setup.ts
import * as pdfjsLib from 'pdfjs-dist';

// Función para configurar el worker de PDF.js de manera robusta
export const setupPdfWorker = async () => {
  // Intentar diferentes URLs de worker en orden de preferencia
  const workerUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js',
    'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.js',
    'https://mozilla.github.io/pdf.js/build/pdf.worker.js'
  ];

  for (const workerUrl of workerUrls) {
    try {
      // Verificar si el worker está disponible
      const response = await fetch(workerUrl, { method: 'HEAD' });
      if (response.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        console.log('✅ PDF.js worker configurado:', workerUrl);
        return;
      }
    } catch (error) {
      console.warn('⚠️ Worker no disponible:', workerUrl);
      continue;
    }
  }

  // Si ningún worker externo funciona, intentar usar uno local
  console.warn('⚠️ Usando configuración de worker por defecto');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.js';
};

// Función mejorada para extraer texto de PDF con mejor manejo de errores
export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
    // Asegurar que el worker esté configurado
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      await setupPdfWorker();
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Configurar opciones para el documento
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
      disableFontFace: false,
      verbosity: 0, // Reducir logs de PDF.js
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    console.log(`📖 Procesando PDF: ${file.name} (${pdf.numPages} páginas)`);
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        console.log(`🔄 Procesando página ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extraer todo el texto de cada página
        const pageItems = textContent.items.map((item: any) => {
          if ('str' in item && item.str) {
            return item.str;
          }
          return '';
        }).filter(text => text.trim().length > 0);
        
        const pageText = pageItems.join(' ');
        
        if (pageText.trim()) {
          fullText += `--- Página ${i} ---\n${pageText.trim()}\n\n`;
        }
        
        // Liberar recursos de la página
        page.cleanup();
        
      } catch (pageError) {
        console.warn(`⚠️ Error en página ${i}:`, pageError);
        fullText += `--- Página ${i} ---\n[Error al procesar esta página]\n\n`;
      }
    }
    
    // Liberar recursos del documento
    pdf.destroy();
    
    const result = fullText.trim();
    
    if (!result) {
      throw new Error('No se pudo extraer texto del PDF. El archivo puede estar vacío o ser una imagen.');
    }
    
    console.log(`✅ Texto extraído exitosamente: ${result.length} caracteres`);
    return result;
    
  } catch (error) {
    console.error('❌ Error al extraer texto del PDF:', error);
    
    // Errores específicos más informativos
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF')) {
        throw new Error('El archivo no es un PDF válido');
      }
      if (error.message.includes('password')) {
        throw new Error('El PDF está protegido con contraseña');
      }
      if (error.message.includes('corrupt')) {
        throw new Error('El archivo PDF está corrupto');
      }
    }
    
    throw new Error(`No se pudo procesar el PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
};