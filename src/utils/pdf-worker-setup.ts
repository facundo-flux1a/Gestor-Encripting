// src/utils/pdf-worker-setup.ts
import * as pdfjsLib from 'pdfjs-dist';

// This function should be called once, for example, in a top-level component or layout.
// We are now pointing to a more reliable CDN (unpkg) and using a specific version
// that matches the one in package.json to avoid version conflicts.
const setupPdfWorker = () => {
    const pdfjsVersion = '4.4.168'; // Matching the version in package.json
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.js`;
    console.log(`PDF.js worker configured to use unpkg for version ${pdfjsVersion}`);
};

// Call the setup function immediately when this module is loaded.
setupPdfWorker();


// This function extracts text from a PDF file. It's now centralized here.
export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Configuration for loading the PDF document.
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true, // Use system fonts as a fallback
      cMapUrl: `https://unpkg.com/pdfjs-dist@4.4.168/cmaps/`, // Provide cmaps url
      cMapPacked: true,
      verbosity: 0, // Reduce console noise from pdf.js
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract text items and join them.
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ');
        
        if (pageText.trim()) {
          fullText += `${pageText.trim()}\n\n`;
        }
        
        // Clean up page resources to free memory
        page.cleanup();
        
      } catch (pageError) {
        console.warn(`⚠️ Error processing page ${i} of ${file.name}:`, pageError);
        fullText += `[Error al procesar la página ${i}]\n\n`;
      }
    }
    
    // Clean up document resources
    if (pdf.destroy) {
       await pdf.destroy();
    }
    
    const result = fullText.trim();
    
    if (!result) {
      // Return a standard message for empty or image-only PDFs
      return `El archivo "${file.name}" no contiene texto extraíble. Puede ser una imagen o estar vacío.`;
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error general al extraer texto del PDF "${file.name}":`, error);
    
    // Provide more specific error messages based on the error type
    if (error instanceof Error) {
      if (error.name === 'InvalidPDFException') {
        throw new Error('El archivo no parece ser un PDF válido.');
      }
      if (error.name === 'PasswordException') {
        throw new Error('El PDF está protegido con contraseña y no se puede procesar.');
      }
    }
    
    throw new Error(`No se pudo procesar el PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
};
