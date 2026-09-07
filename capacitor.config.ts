import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.muvail.app',
  appName: 'Gestor Muvail',
  webDir: 'public',
  server: {
    // La APK arranca directamente en la vista móvil (sin dashboard completo).
    // En desarrollo local se puede comentar esta línea para probar en el navegador.
    url: 'https://gestor.muvail.com/mobile',
    cleartext: true,
  },
  android: {
    // Identificador que se añade al User-Agent del WebView.
    // Permite detectar desde el código JS/TS si se está ejecutando dentro de la APK
    // usando: navigator.userAgent.includes('MuvailApp')
    appendUserAgent: 'MuvailApp/1.0',
  },
};

export default config;
