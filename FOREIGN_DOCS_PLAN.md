# Plan: Soporte Nativo de Facturas de Proveedores Extranjeros (Refinado v3 - Hallazgo Crítico en datos_extra)

## Hallazgo Crítico en `datos_extra` (Identificado por el Usuario)

¡Excelente ojo! Se confirmó en el código que `datos_extra` **SÍ tiene claves que son leídas y computadas activamente** en múltiples servicios y queries SQL:
1. `datos_extra.base_no_sujeta`: Leído por `trimestres/page.tsx`, `export/excel`, `document-service.ts` y `health-check-service.ts`.
2. `datos_extra.retencion_irpf`: Leído por `document-service.ts`, `health-check-service.ts`, `documents-table.tsx` y exports.
3. `datos_extra.descuento_global`: Leído por `health-check-service.ts` y `document-service.ts`.

### ⚠️ El peligro de falsos positivos que evitamos:
Si un documento extranjero tiene `importe_sin_impuestos = importe_total` pero en `datos_extra` quedan valores en `base_no_sujeta`, `retencion_irpf` o `descuento_global`:
* `trimestres` y `excel` sumarían `base_no_sujeta` sobre la base ya completa, inflando erróneamente el gasto.
* `health-check` detectaría un descuadre matemático falso porque sumaría/restaría esos campos del total.

### ✅ La Solución Definitiva (Encapsulamiento Aislado):
Para cualquier factura de proveedor extranjero:
1. **Campos activos en `datos_extra`**:
   * `base_no_sujeta = 0` (o null)
   * `retencion_irpf = 0` (o null)
   * `descuento_global = 0` (o null)
2. **Respaldo aislado en un namespace dedicado (`backup_fiscal_origen`)**:
   Guardamos los datos originales dentro de un sub-objeto que **ninguna query SQL ni servicio lee**:
   ```json
   {
     "es_proveedor_extranjero_ue": true,
     "zona_emisor": "UE",
     "pais_emisor": "DE",
     "pais_emisor_nombre": "Alemania",
     "cuenta_proveedor_sugerida": "4100000",
     "base_no_sujeta": 0,
     "retencion_irpf": 0,
     "descuento_global": 0,
     "backup_fiscal_origen": {
       "importe_sin_impuestos_original": 158.82,
       "base_no_sujeta_original": 0,
       "retencion_irpf_original": 0,
       "descuento_global_original": 0,
       "impuestos_originales": [
         { "tipo": "IVA", "porcentaje": 19, "base": 158.82, "cuota": 30.18 }
       ]
     }
   }
   ```
   De esta manera, `JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')` devuelve `0`, evitando al 100% cualquier falso positivo en trimestres, balances, exports y health checks.

---

## Criterio Contable y Flujo de Datos

### 1. Ingesta / Marca como Extranjero:
* `documentos.importe_sin_impuestos = documentos.importe_total`.
* **`impuestos_documento`**: Se eliminan/omiten **TODAS** las filas (0 filas).
* **`datos_extra`**: `base_no_sujeta = 0`, `retencion_irpf = 0`, `descuento_global = 0`. Todo valor previo se mueve a `backup_fiscal_origen`.

---

### 2. Flujo de Transición y Advertencias en la UI:

#### Caso A: Marcar como Extranjero (Local ➔ Extranjero)
* **Modal de Advertencia (`AlertDialog`)**:
  > 🌍 **¿Marcar como Proveedor Extranjero?**
  >
  > El IVA de origen no es deducible en España (Modelo 303).
  > El importe total de la factura pasará a computarse íntegramente como base del gasto contable.
  > Se eliminarán todas las líneas de impuestos de este documento en la base de datos (se conservará un respaldo en metadatos para auditoría).
* **Acción al confirmar**:
  1. Mueve impuestos actuales, base y retenciones a `datos_extra.backup_fiscal_origen`.
  2. Resetea `base_no_sujeta = 0`, `retencion_irpf = 0`, `descuento_global = 0` en `datos_extra`.
  3. Ejecuta `DELETE FROM impuestos_documento WHERE documento_id = docId` (0 filas).
  4. Actualiza `documentos.importe_sin_impuestos = documentos.importe_total`.
  5. Setea `datos_extra.es_proveedor_extranjero_ue = true`.

#### Caso B: Desmarcar como Extranjero (Extranjero ➔ Local)
* **Modal de Advertencia (`AlertDialog`)**:
  > 🏢 **¿Desmarcar Proveedor Extranjero (Convertir a Local)?**
  >
  > Este documento fue ingresado o configurado como extranjero, por lo que **no cuenta con cuotas o tasas de impuestos registradas**.
  > Al convertirlo a documento local, **deberás definir manualmente el IVA y las cuotas correspondientes** en la sección de desglose de impuestos para que compute correctamente en tus modelos fiscales.
* **Acción al confirmar**:
  1. Quita la marca `es_proveedor_extranjero_ue`.
  2. Si existe `backup_fiscal_origen.importe_sin_impuestos_original`, lo restaura como sugerencia; si no, mantiene el actual.
  3. Restaura `base_no_sujeta`, `retencion_irpf` desde el backup si existían.
  4. Deja `impuestos_documento` limpio para que el usuario ingrese sus cuotas en el editor.
  5. Muestra toast recordatorio.

---

### 3. Sugerencia de Cuenta Contable `4100000` a 1-Clic:
* Banner visible cuando es extranjero y la cuenta no es `4100000`.
* Botón *"Asignar cuenta 4100000"* que llama a `POST /api/entidades-config` en 1 clic.

---

### 4. Seguridad e Ingesta:
* **Detección Automática**: `detectCountryFromCIF` en `normalize.ts`.
* **Guardas Fiscales**: Warning no bloqueante `CIF_PROVEEDOR_EXTRANJERO_UE` en `fiscal-guards.ts`.
* **Worker Ingesta**: `db-writer.worker.ts` y API v1 POST aplican la lógica limpia con `backup_fiscal_origen`.
* **Bloqueo SII**: Filtros en `sii/documentos-locales`, `sii/enviar-factura` (HTTP 422), y `trimestres/documentos-sii`.

---

## Archivos a Modificar / Crear

1. `src/services/ingestion/normalize.ts` (Añadir `detectCountryFromCIF`)
2. `src/services/ingestion/fiscal-guards.ts` (Warning no bloqueante para CIF extranjero)
3. `src/workers/db-writer.worker.ts` (Ingesta limpia: base = total, 0 impuestos en tabla, respaldo en `backup_fiscal_origen`, `base_no_sujeta = 0`)
4. `src/app/api/v1/documents/route.ts` (POST) (Ingesta vía API consistente)
5. `src/app/api/sii/documentos-locales/route.ts` (Excluir extranjeros)
6. `src/app/api/sii/enviar-factura/route.ts` (Guard de bloqueo HTTP 422)
7. `src/app/api/trimestres/documentos-sii/route.ts` (Excluir extranjeros)
8. `src/app/api/documents/[id]/extranjero/route.ts` [NUEVO] (Endpoint PATCH con encapsulamiento en `backup_fiscal_origen`)
9. `src/components/dashboard/review-invoice-layout.tsx` (Toggle + Modales de advertencia A y B + Banner 4100000 a 1-clic)
10. `src/components/dashboard/document-view.tsx` (Banner de cuenta 4100000)
11. `scripts/migrar_extranjeros_limpio.ts` [NUEVO] (Normalizar los 7 documentos de prueba del Q1 2027)

---

## Verificación

* `npx tsc --noEmit` para garantizar cero errores de tipado.
* Validación del health-check y de que `base_no_sujeta` no se sume dos veces en trimestres ni excel.
* Validación del flujo de toggles y asignación de cuenta 4100000.
