# Plan y Checklist: Migración a Bucket MinIO Privado

Este documento detalla todos los puntos de código a modificar para operar con un bucket MinIO privado (`gestor-documental`), eliminando la dependencia de URLs públicas directas y accesos anónimos.

---

## 💡 Pregunta Clave: ¿Todo sigue funcionando con el bucket público como está hoy?

**SÍ, 100% compatible.**

Si aplicamos todos los cambios descritos en esta guía mientras el bucket sigue en modo público:
1. **El SDK de S3 siempre autentica**: Toda llamada que hace `s3.send(new GetObjectCommand(...))` o `PutObjectCommand` envía credenciales (`MINIO_ACCESS_KEY` y `MINIO_SECRET_KEY`). Que un bucket sea público solo significa que *también* admite lecturas anónimas; jamás rechaza lecturas o escrituras autenticadas.
2. **Omitir `ACL: 'public-read'`**: En MinIO, no especificar ACL al subir un archivo simplemente adopta la política general del bucket. En bucket público sigue siendo accesible; en bucket privado se guarda privado.
3. **Presigned URLs**: Las URLs firmadas contienen firma criptográfica temporal en los query params; funcionan de forma idéntica en buckets públicos y privados.
4. **Proxy interno (`/api/files/[filename]`)**: El backend de Next.js descarga los bytes con el SDK autenticado y los sirve al frontend por streaming o buffer. Funciona sin importar la visibilidad del bucket.

> **Estrategia recomendada (Zero Downtime / Cero Riesgo)**:
> 1. Aplicar todos los cambios de código en este checklist.
> 2. Desplegar y validar en desarrollo y producción **mientras el bucket sigue público**.
> 3. Cuando todo esté verificado, cambiar la política del bucket a `private` en la consola de MinIO con un solo clic. Si hiciera falta revertir, se vuelve a poner `public` al instante.

---

## 🗄️ Estado de la Base de Datos: `archivos_documento.ruta_archivo`

En la tabla `archivos_documento`, las rutas están guardadas como URLs absolutas completas:
```
https://minio.allbase.com.ar/gestor-documental/archivos/FR-2026-0083.pdf
```
**Solución arquitectónica**: La función [`extractS3Key()`](file:///home/flux1a/Escritorio/gestorsept/Gestor-Encripting/src/lib/s3-client.ts) parsea cualquier URL (vieja, nueva, relativa o absoluta) y extrae únicamente la clave del objeto:
```
archivos/FR-2026-0083.pdf
```
Esto evita tener que hacer migraciones destructivas de URLs en la base de datos.

---

## 📋 Checklist Detallado de Archivos a Modificar

### Fase 0: Componente Base Centralizado
- [x] **`src/lib/s3-client.ts`** *(Ya creado en el proyecto)*
  - Instancia singleton `s3` de `S3Client`.
  - Helper `extractS3Key(rawPath)`: Normaliza cualquier URL o path a S3 Key.
  - Helper `getFileBuffer(key)`: Descarga autenticada devolviendo un `Buffer`.
  - Helper `getPresignedUrl(key, expiresIn)`: Genera URL temporal firmada (default 15 min).
  - Helper `buildProxyUrl(rawPath)`: Genera ruta relativa `/api/files/[filename]`.

---

### Fase 1: Escritura — Eliminar `ACL: 'public-read'`
*MinIO en buckets privados rechaza o ignora ACLs públicas explícitas. Se debe quitar el parámetro `ACL: 'public-read'` de los comandos `PutObjectCommand`.*

- [ ] **`src/services/upload-service.ts`**
  - Líneas ~150, 221, 557, 752: Quitar `ACL: 'public-read'` en los uploads de facturas, archivos temporales y adjuntos.
- [ ] **`src/services/suggestion-service.ts`**
  - Línea ~39: Quitar `ACL: 'public-read'` al guardar sugerencias/documentos.
- [ ] **`src/app/api/v1/webhook/mailparser/route.ts`**
  - Línea ~177: Quitar `ACL: 'public-read'` al subir adjuntos recibidos por correo.
- [ ] **`src/app/api/v1/documents/route.ts`**
  - Línea ~583: Quitar `ACL: 'public-read'` en el endpoint POST de subida de documentos.
- [ ] **`src/app/api/documents/[id]/thumbnail/route.ts`**
  - Línea ~150: Quitar `ACL: 'public-read'` al guardar thumbnail generado en MinIO.
- [ ] **`src/app/api/v1/documents/[id]/thumbnail/route.ts`**
  - Línea ~150: Quitar `ACL: 'public-read'` al guardar thumbnail en API v1.

---

### Fase 2: Lectura en Proxies y Rutas API — Reemplazar `fetch()` por SDK
*Actualmente hacen `fetch(minioUrl)` HTTP público, el cual devolverá 403 Forbidden cuando el bucket sea privado.*

- [ ] **`src/app/api/files/[filename]/route.ts`** *(Proxy principal de archivos)*
  - Reemplazar toda la lógica de `fetch(minioUrl)` y fallbacks por:
    ```typescript
    const key = filename.startsWith('archivos/') ? filename : `archivos/${filename}`;
    const buffer = await getFileBuffer(key);
    // Retornar NextResponse con buffer y cabeceras Content-Type / Content-Disposition
    ```
- [ ] **`src/app/api/images/[...path]/route.ts`** *(Proxy de imágenes)*
  - Reemplazar llamadas `fetch` por `getFileBuffer(imageKey)` del SDK.
- [ ] **`src/app/api/documents/[id]/thumbnail/route.ts`**
  - Línea ~125: Al generar un thumbnail, descarga el PDF original con `fetch(originalFileUrl)`. Cambiar por `getFileBuffer(extractS3Key(rutaArchivo))`.
- [ ] **`src/app/api/v1/documents/[id]/thumbnail/route.ts`**
  - Mismo reemplazo de descarga previa con `getFileBuffer()`.
- [ ] **`src/workers/ingestion.worker.ts`**
  - Línea ~53: La descarga de archivos ZIP masivos usa `fetch(data.publicUrl)`. Reemplazar por `getFileBuffer(extractS3Key(data.publicUrl))`.

---

### Fase 3: Integraciones Externas — Presigned URLs para `pdftools`
*El microservicio externo `pdftools` no tiene credenciales de MinIO. Necesita una URL que pueda descargar de forma temporal.*

- [ ] **`src/workers/extraction.worker.ts`**
  - Función `splitPdfWithTools` (Línea ~402):
    ```typescript
    const key = extractS3Key(pdfUrl);
    const signedPdfUrl = await getPresignedUrl(key, 900); // Válida por 15 minutos
    // Enviar signedPdfUrl en el payload hacia pdftools
    ```
  - Función `convertPdfToImagesWithPdfTools` (Línea ~440):
    - Mismo patrón: generar Presigned URL antes de enviar a `pdftools`.
  - Limpieza de fallbacks hardcodeados (L431: eliminar `|| 'gestor-documental'`).

---

### Fase 4: Helpers de URL y Respuestas al Frontend
*Asegurar que las APIs y utilidades entreguen la URL del proxy interno (`/api/files/...`) y no la URL cruda de MinIO.*

- [x] **`src/lib/api-v1-helpers.ts`** *(Ya modificado)*
  - `buildFileUrl()` devuelve `/api/files/[filename]`.
- [ ] **`src/lib/utils.ts`**
  - Función `fixMinioUrl()`: En vez de solo reemplazar el dominio traefik por `minio.allbase.com.ar`, transformar a URL de proxy `/api/files/[filename]`.
- [ ] **`src/app/api/upload-progress/route.ts`**
  - Líneas ~292 y 362: Envolver `ruta_archivo` con `buildProxyUrl(ruta_archivo)` antes de retornarla en la respuesta JSON de progreso.

---

### Fase 5: Componentes Visuales Frontend
*Asegurar que los visores de facturas no intenten cargar URLs directas o visores de terceros incompatibles.*

- [ ] **`src/components/dashboard/document-preview-dialog.tsx`**
  - Reemplazar visor Google Docs (`docs.google.com/gview?url=...` requiere URL pública) por el visor embebido nativo del navegador apuntando a `/api/files/...`.
  - El botón "Abrir en nueva pestaña" debe usar la URL del proxy.
- [ ] **`src/components/dashboard/review-invoice-layout.tsx`**
  - Líneas ~643, 658, 663: Asegurar que `documentUrl` sea la URL del proxy para `window.open`, `<img>` y `<iframe>`.
- [ ] **`src/components/dashboard/audit-split-view.tsx`**
  - Se adapta automáticamente con la corrección de `fixMinioUrl`.

---

## 🧪 Plan de Pruebas Post-Implementación

1. **Compilación**: `npm run build` o `npx tsc --noEmit` sin errores de tipos.
2. **Subida de Factura**: Subir un PDF desde la UI web y confirmar que sube sin errores de ACL.
3. **Webhook Correo**: Enviar un email de prueba con factura adjunta al mailparser y validar que se guarde en MinIO.
4. **Visor de Documentos**: Abrir la vista individual y el modal de preview; verificar que el PDF cargue en el iframe vía `/api/files/...`.
5. **División de Páginas (`pdftools`)**: Procesar un PDF multipágina y corroborar que el worker de extracción lo recorte correctamente usando la Presigned URL.
6. **Subida de ZIP**: Subir un lote comprimido y confirmar que el worker de ingestión descargue y descomprima los archivos.
7. **Switch a Privado**: Cambiar la política del bucket a `private` en MinIO y verificar que los pasos 2 a 6 sigan funcionando al 100%.
