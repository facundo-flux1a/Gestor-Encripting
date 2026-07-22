# ADR — Estados fiscales del documento

## Contexto

El gestor sube archivos automáticamente (OCR) y muestra control de gastos/facturas/trimestres.
El archivo siempre debe quedar almacenado. Los importes incorrectos no deben entrar en agregados
de control (dashboard/trimestres/export), porque el usuario se basa en ellos para su contabilidad.

## Decisión

Tres estados lógicos (persistidos en `documentos.datos_extra.fiscal_status`, sin migración):

| Estado | Significado |
|--------|-------------|
| `RECIBIDO` | Archivo en MinIO / en cola (solo actividad) |
| `VALIDADO` | Extracción pasó guards duros → entra a agregados |
| `REVISION` | Guards fallaron tras reintentos → visible, con incidencia, **excluido** de agregados |

Incidencias del extractor (`incidencia: true`) pueden coexistir con `VALIDADO` si los guards duros pasan
(son avisos reales: CIF dudoso no crítico, etc.). Fallo de guard duro → siempre `REVISION`.

## Consecuencias

- `calculateFinancials` ignora `REVISION`.
- Reintento `extract-repair` antes de persistir `REVISION`.
- MinIO de producción: solo lectura para corpus; nunca escritura/borrado desde herramientas de eval.
