# Documentación: Endpoint de Gestión de Incidencias (/incidents)

Este documento detalla el uso del endpoint `/api/v1/incidents`, diseñado para que un ERP externo pueda **consultar alertas de calidad** detectadas en los documentos y **resolverlas programáticamente** una vez que hayan sido revisadas.

---

## Información General

* **URL Base:** `/api/v1/incidents`
* **Métodos HTTP disponibles:** `GET` (consultar) / `POST` (resolver)
* **Content-Type:** `application/json`
* **Autenticación:** Requiere la cabecera `X-Api-Key` con el token SHA-256 provisto por el sistema (Ej: `muvail_abcdef1234567890`).

### ¿Qué es una Incidencia?

Una incidencia es una alerta que el sistema registra automáticamente cuando detecta que un documento **requiere atención humana antes de poder ser contabilizado**. Los motivos típicos incluyen:

* Descuadre matemático detectado por el Health Check (Base + IVA ≠ Total).
* Campos críticos ilegibles o ausentes (número de factura, fecha, CIF).
* Documentos cuya tipología no pudo determinarse con certeza.
* Anomalías de formato identificadas por el motor OCR.

Mientras una incidencia permanezca **pendiente**, el documento no se incluye en las respuestas estándar de `/documents` ni `/documents/full` (a menos que se pase el parámetro `incluir_incidencias=true`). Una vez resuelta desde el ERP (vía `POST`), el sistema la marca como `validada` y el documento queda disponible normalmente.

---

## MÉTODO GET — Listar Incidencias

```
GET /api/v1/incidents
```

Devuelve las incidencias de todos los documentos de la empresa vinculada al token. Por defecto retorna solo las pendientes de resolución.

### Parámetros de Consulta (Filtros)

| Parámetro | Tipo | Default | Descripción |
| :--- | :--- | :--- | :--- |
| `estado` | `string` | `"pendientes"` | Filtra por estado de la incidencia. Valores posibles: `"pendientes"` (sin resolver), `"validadas"` (ya resueltas), `"todas"` (sin filtro). |
| `documento_id` | `number` | — | Filtra las incidencias de un documento específico por su ID interno. Útil para sincronizar el detalle de una factura en particular. |

### Ejemplos de Invocación (cURL)

#### Obtener todas las incidencias pendientes de la empresa
```bash
curl -X GET "https://[tu-dominio.com]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"
```

#### Obtener todas las incidencias (pendientes + resueltas)
```bash
curl -X GET "https://[tu-dominio.com]/api/v1/incidents?estado=todas" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"
```

#### Obtener incidencias de un documento específico
```bash
curl -X GET "https://[tu-dominio.com]/api/v1/incidents?documento_id=2564" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"
```

### Estructura de la Respuesta (GET)

```json
{
  "total": 2,
  "filtros": {
    "estado": "pendientes",
    "documento_id": "todos"
  },
  "data": [
    {
      "incidencia_id": 38,
      "documento_id": 2564,
      "estado": "pendiente",
      "descripcion_incidencia": "Descuadre matemático: la suma de líneas de detalle no coincide con el importe total declarado.",
      "validado_por": null,
      "fecha_validacion": null,
      "observaciones_validacion": null,
      "documento": {
        "tipo_documento": "FACTURA RECIBIDA",
        "numero_documento": "F-2026/0831",
        "fecha_emision": "2026-03-15",
        "importe_total": 14520.00,
        "importe_sin_impuestos": 12000.00,
        "moneda": "EUR",
        "entidad_nombre": "PROVEEDOR EJEMPLO S.L.",
        "entidad_cif": "B87654321",
        "verificado_matematicamente": false,
        "razon_descuadre": "MISMATCH_MATEMATICO"
      }
    },
    {
      "incidencia_id": 41,
      "documento_id": 2571,
      "estado": "pendiente",
      "descripcion_incidencia": "Número de documento no detectado por el OCR. Requiere revisión manual.",
      "validado_por": null,
      "fecha_validacion": null,
      "observaciones_validacion": null,
      "documento": {
        "tipo_documento": "FACTURA RECIBIDA",
        "numero_documento": "(sin confirmar)",
        "fecha_emision": "2026-03-22",
        "importe_total": 3025.50,
        "importe_sin_impuestos": 2500.00,
        "moneda": "EUR",
        "entidad_nombre": "OTRO PROVEEDOR S.A.",
        "entidad_cif": "A12312312",
        "verificado_matematicamente": true,
        "razon_descuadre": null
      }
    }
  ]
}
```

---

## MÉTODO POST — Resolver una Incidencia

```
POST /api/v1/incidents
```

Marca una incidencia como **validada** (resuelta manualmente). Esto indica al sistema que un operador del ERP revisó la situación y la aprobó conscientemente.

> **Importante:** el `incidencia_id` requerido en el body **debe obtenerse previamente** haciendo un `GET /api/v1/incidents`. Esto no es solo una restricción técnica; es un mecanismo de seguridad y auditoría. Si una incidencia se aprueba por API, se da por hecho que el usuario ha revisado realmente la incidencia antes de forzar su aprobación. No existe forma de resolver una incidencia a ciegas solo con el ID del documento.

### Body de la Petición

```json
{
  "incidencia_id": 38,
  "observaciones": "Diferencia de €0.50 aceptada. Corresponde a redondeo del proveedor.",
  "validado_por": "erp_sync@empresa.com"
}
```

| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `incidencia_id` | `number` | ✅ Sí | ID numérico de la incidencia a resolver. Se obtiene del campo `incidencia_id` devuelto por el `GET`. |
| `observaciones` | `string` | ❌ No | Texto libre que explica el motivo de la validación manual. Queda registrado en el historial. |
| `validado_por` | `string` | ❌ No | Identificador del sistema o usuario que resuelve la incidencia (ej: un email, un ID de operador). Si no se envía, se registra como `"API_EXTERNA"`. |

### Ejemplos de Invocación (cURL)

#### Resolución básica (sin comentarios adicionales)
```bash
curl -X POST "https://[tu-dominio.com]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{"incidencia_id": 38}'
```

#### Resolución con trazabilidad completa
```bash
curl -X POST "https://[tu-dominio.com]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{
           "incidencia_id": 38,
           "observaciones": "Diferencia de €0.50 aceptada. Corresponde a redondeo del proveedor.",
           "validado_por": "erp_sync@miempresa.com"
         }'
```

### Estructura de la Respuesta (POST)

```json
{
  "success": true,
  "incidencia_id": 38,
  "documento_id": 2564,
  "estado": "validada",
  "validado_por": "erp_sync@miempresa.com",
  "fecha_validacion": "2026-03-27T14:32:10.000Z",
  "observaciones": "Diferencia de €0.50 aceptada. Corresponde a redondeo del proveedor."
}
```

---

## Códigos de Estado HTTP

| Código | Situación |
| :--- | :--- |
| `200 OK` | Operación exitosa (GET devuelve lista / POST resuelve incidencia). |
| `400 Bad Request` | El body del POST es inválido o falta el campo `incidencia_id`. |
| `401 Unauthorized` | Header `X-Api-Key` ausente o token inválido / revocado. |
| `404 Not Found` | La `incidencia_id` no existe o pertenece a otra empresa. |
| `409 Conflict` | La incidencia ya fue validada anteriormente (no se puede resolver dos veces). |
| `500 Internal Server Error` | Error inesperado en el servidor. |

---

## Diccionario de Datos

| Campo | Descripción |
| :--- | :--- |
| `incidencia_id` | ID numérico único de la incidencia. Es el identificador a usar en el `POST` para resolverla. |
| `documento_id` | ID numérico del documento al que pertenece la incidencia. Puede usarse para cruzar con `/documents/full`. |
| `estado` | Estado actual: `"pendiente"` (sin resolver) o `"validada"` (aprobada manualmente). |
| `descripcion_incidencia` | Descripción en lenguaje natural del problema detectado por el sistema. |
| `validado_por` | Identificador del operador o sistema que resolvió la incidencia. `null` si aún está pendiente. |
| `fecha_validacion` | Timestamp ISO 8601 de cuándo fue resuelta. `null` si aún está pendiente. |
| `observaciones_validacion` | Comentario libre dejado al momento de la resolución. |
| `documento.verificado_matematicamente` | Resultado del Health Check. `false` indica que las sumas de líneas no cuadran con el total. |
| `documento.razon_descuadre` | Código de error del Health Check si `verificado_matematicamente` es `false`. Ej: `"MISMATCH_MATEMATICO"`. |

---

## Flujo de Integración Recomendado

El ciclo de resolución de incidencias **siempre empieza con un GET**. Como medida de seguridad para evitar "aprobaciones a ciegas", el `incidencia_id` que necesitás para el POST solo existe en la respuesta del listado; no hay forma de conocerlo de antemano.

### Paso 1 — Listar las incidencias pendientes

Hacé un `GET /api/v1/incidents` (sin parámetros, o con `estado=pendientes`) para obtener todas las alertas sin resolver. La respuesta te devuelve un array `data[]` donde cada elemento tiene un `incidencia_id` y el contexto del documento asociado (proveedor, importe, descripción del problema).

```bash
curl -X GET "https://[tu-dominio.com]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"
# → Guardá el campo "incidencia_id" de cada elemento que querés resolver
```

### Paso 2 — Revisar el documento (opcional pero recomendado)

Si necesitás ver el detalle completo del documento antes de aprobarlo, usá el `documento_id` que viene en la respuesta del GET para cruzarlo con `/api/v1/documents/full`.

### Paso 3 — Resolver la incidencia con el ID obtenido

Una vez identificada la incidencia a aprobar, hacé el `POST` usando el `incidencia_id` del paso 1:

```bash
curl -X POST "https://[tu-dominio.com]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{"incidencia_id": 38, "observaciones": "Revisado y aceptado.", "validado_por": "erp_sync@empresa.com"}'
# → La incidencia pasa a estado "validada"
# → Una vez que no queden incidencias pendientes en ese documento,
#    el documento vuelve a aparecer en las consultas estándar de /documents
```

### Paso 4 — Confirmar el resultado

Podés volver a llamar al `GET` con `estado=validadas` o `estado=todas` para confirmar que el cambio fue registrado correctamente.

---

> **Nota sobre aislamiento de datos:**
> El endpoint valida que la `incidencia_id` solicitada pertenezca **estrictamente** a la empresa del token activo. No es posible ver ni resolver incidencias de otras empresas, aunque se conozca el ID numérico.
