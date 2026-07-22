# Corpus de documentos (evaluación)

## MinIO (producción)

- **Permitido:** `ListObjectsV2` + `GetObject` (descarga local).
- **Prohibido:** Put, Delete, Copy, lifecycle, o cualquier escritura/borrado.

```bash
npm run corpus:pull
```

Binarios → `raw/` (gitignored). Inventario → `manifest.json`.

## Expected tipado

Copiá `_template.json` a un archivo por caso en `expected/` y completá campos críticos a mano.

```bash
npm run eval:extraction
```
