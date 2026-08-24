# Contrato — Lote de subida auditable

> **Estado:** vigente (actualizado 2026-07-21 — actividad solo tras bytes)  
> **Relacionado:** [UX_UPLOAD_PROGRESS.md](./UX_UPLOAD_PROGRESS.md) (chip/panel — siguiente pasada)

## Invariante

Al subir **N** archivos desde el dashboard:

1. El servidor reserva **N** `upload_id` + un `batch_id` **sin** insertar `actividad` todavía.
2. El cliente guarda los blobs en **IndexedDB** y sube con concurrencia (`POST /api/uploads/file`).
3. **Recién cuando llegan los bytes** se crea la fila `actividad` (con `batch_id`) + MinIO + enqueue.
4. Si el usuario recarga a mitad: los bytes en IndexedDB se **reanudan**; no quedan N filas “Esperando bytes” en DB.
5. La UI registra progreso (`addUpload`) con esos `upload_id` reales (tarjeta local hasta que exista actividad).

## Flujo

```
Cliente  →  POST /api/uploads/batch  →  N upload_id + batch_id (sin INSERT actividad)
Cliente  →  IndexedDB + POST /api/uploads/file × N
Servidor →  INSERT actividad + MinIO + enqueue (misma upload_id / batch_id)
Workers  →  progreso / Completado | Fallido | Duplicado
```

Tras refresh: `resumeClientUploadQueue()` bombea IndexedDB de nuevo.

## Contenedores ZIP/RAR

El archivo comprimido es una actividad padre. El worker lo lee desde MinIO/S3
con credenciales internas — nunca descargándolo por su URL pública — y crea un
`upload_id` determinista por cada hijo. Por tanto, un retry no duplica hijos ni
deja facturas fuera del lote.

- Cada PDF, imagen o documento Office válido se guarda como objeto hijo aislado
  por `empresaId / uploadId padre / uploadId hijo` y se encola individualmente.
- Un hijo inválido, duplicado, vacío o no compatible queda como actividad hija
  `Fallido` con el motivo; no bloquea las demás facturas.
- Se ignoran únicamente metadatos de sistema (`__MACOSX`, `.DS_Store`, etc.).
- Se admiten subcarpetas y contenedores anidados hasta `MAX_ARCHIVE_DEPTH`
  (por defecto 2). Hay límites de seguridad configurables:
  `MAX_ARCHIVE_ENTRIES=1000` y `MAX_ARCHIVE_UNCOMPRESSED_BYTES=262144000`.
- El límite de subida es `MAX_UPLOAD_MB` en servidor y
  `NEXT_PUBLIC_MAX_UPLOAD_MB` en la UI (100 MB por defecto). Si se configura
  uno, se deben configurar ambos con el mismo valor.
- `MINIO_INTERNAL_ENDPOINT` es opcional y tiene prioridad para las operaciones
  S3 de los workers. `MINIO_PUBLIC_ENDPOINT` se usa exclusivamente para las
  URLs de previsualización guardadas en la base.

## Estados terminales de `actividad`

| Status | Significado |
|--------|-------------|
| `Completado` | Documento guardado (`documento_id` linkeado) |
| `Fallido` | Error de red, validación o procesamiento |
| `Duplicado` / Fallido + step duplicado | Mismo file hash ya existía en la empresa |

Estados intermedios típicos: `iniciando`, `procesando`, `processing`, **`waiting_capacity`** (rate limit OCR).  
`queued` sin `file_path` es legado / rareza — el reconcile lo cierra.

Salud de workers: heartbeat Redis `workers:heartbeat` → `GET /api/workers/health`.

### Reconciliación (anti-fantasmas)

| Condición | Acción |
|-----------|--------|
| `queued` + sin `file_path` > 2 min | → `Fallido` (subida interrumpida) |
| `procesando` / `waiting_capacity` / etc. sin `updated_at` > 25 min | → `Fallido` (proceso interrumpido) |
| Nuevo `POST /api/uploads/batch` | Invalida `queued` sin archivo de esa empresa |

Implementación: `src/services/actividad-reconcile.ts` (API cola + loop workers).  
Además: **un solo** proceso de workers (lock Redis `workers:singleton-lock`) para no pelear locks BullMQ.

## Toasts / UI

- Un **resumen de lote** al terminar el loop de subida HTTP (ok / duplicados / errores).
- Aviso `beforeunload` si hay pendientes en IndexedDB.
- No N toasts de “Documento listo” en cargas masivas (>3 activos).
- La verdad del progreso es `actividad` + poll `/api/upload-progress`, no solo el Map local.

## Duplicados por número de factura

- Detección: incidencias (check-duplicates).
- Limpieza: `pickCanonicalDuplicate` — preferir signo correcto en abonos, luego más completo, luego **más antiguo**. Nunca “solo el más reciente”.

## Abonos

Importes de abono/rectificativa se persisten con `-Math.abs(...)` (no `* -1`, que invierte valores ya negativos).
