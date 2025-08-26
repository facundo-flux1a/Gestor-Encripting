it pu# Firebase Studio
 
This is a NextJS starter in Firebase Studio.
 aa
To get started, take a look at src/app/page.tsx.
  src/components/dashboard/upload-dialog.tsx: Este es el componente de la interfaz de usuario (frontend).

Función: Muestra el diálogo donde arrastras o seleccionas los archivos PDF.
Proceso: Una vez seleccionados los archivos, este componente itera sobre cada uno, extrae el texto del PDF directamente en el navegador y luego llama al servicio de backend (upload-service.ts) para cada archivo, enviándole tanto el archivo original como el texto extraído.
src/services/upload-service.ts: Este es el servicio de backend 