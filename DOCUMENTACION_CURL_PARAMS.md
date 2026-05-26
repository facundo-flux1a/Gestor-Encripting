# Documentación de API con Ejemplos cURL (Parámetros en URL y Estructurados)

Esta guía detalla los endpoints de integración del Gestor Documental utilizando comandos `curl` con dos estilos de llamada para cada endpoint GET:
1. **Estilo A:** Parámetros concatenados directamente en la URL.
2. **Estilo B:** Parámetros estructurados utilizando las opciones nativas de `curl` (`-G` y `--data-urlencode`).

---

## 1. Cabecera de Autenticación
Todas las solicitudes requieren la cabecera `X-Api-Key`:
```http
X-Api-Key: muvail_tu_clave_secreta_aqui
```

---

## 2. Consulta Unificada de Documentos Completos (Recomendado)
Recupera toda la información estructurada de los documentos procesados junto con todas sus tablas relacionadas (líneas, impuestos, archivos, incidencias y salud matemática).

* **URL:** `/api/v1/documents/full`
* **Método:** `GET`

### Parámetros de Consulta (Query Parameters)

| Parámetro | Tipo | Default | Descripción |
| :--- | :--- | :--- | :--- |
| `trimestre` | `number` | — | Filtra por trimestre fiscal. Valores: `1`, `2`, `3`, `4`. |
| `año` | `number` | — | Filtra por año. Ej: `2026`. |
| `tipo` | `string` | `"todas"` | Tipo de flujo. Opciones: `"emitidas"` (facturas donde la empresa es emisora), `"recibidas"` (facturas donde la empresa es receptora), `"todas"`. |
| `proveedor` | `string` | — | Busca coincidencias parciales en nombre o CIF del **emisor / proveedor** del documento. |
| `cliente` | `string` | — | Busca coincidencias parciales en nombre o CIF del **receptor / cliente** del documento. |
| `incluir_incidencias` | `boolean` | `false` | Por defecto se **excluyen** los documentos con incidencias pendientes de validación. Pasar `true` para incluirlos. |
| `incluir_sin_verificar` | `boolean` | `false` | Por defecto se **excluyen** los documentos que fallaron el health check matemático (descuadre entre base+IVA y total). Pasar `true` para incluirlos. |
| `incluir_sin_confirmar` | `boolean` | `false` | Por defecto se **excluyen** los borradores y documentos marcados como `(sin confirmar)`. Pasar `true` para incluirlos. |

### Ejemplos de Petición cURL

#### Estilo A: Parámetros en la URL (Query String)
```bash
# Todo el año 2026 trimestre 1, incluyendo incidencias y descuadres
curl -X GET "https://[tu-dominio]/api/v1/documents/full?año=2026&trimestre=1&incluir_incidencias=true&incluir_sin_verificar=true" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"

# Solo facturas recibidas de un proveedor específico
curl -X GET "https://[tu-dominio]/api/v1/documents/full?tipo=recibidas&proveedor=García" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"

# Todo el historial sin ningún filtro (volcado completo limpio)
curl -X GET "https://[tu-dominio]/api/v1/documents/full" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"
```

#### Estilo B: Parámetros Estructurados (Opciones cURL)
```bash
curl -G "https://[tu-dominio]/api/v1/documents/full" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "año=2026" \
     --data-urlencode "trimestre=1" \
     --data-urlencode "tipo=recibidas" \
     --data-urlencode "proveedor=García" \
     --data-urlencode "incluir_incidencias=true" \
     --data-urlencode "incluir_sin_verificar=true" \
     --data-urlencode "incluir_sin_confirmar=true"
```

### Campos en la respuesta

Cada objeto del array `data[]` incluye:

| Campo | Descripción |
| :--- | :--- |
| `id` | ID interno del documento. |
| `file_hash` | Hash SHA-256 del archivo original procesado. |
| `tipo_documento` | Tipo literal del documento (ej: `"FACTURA RECIBIDA"`, `"ABONO EMITIDO"`). |
| `numero_documento` | Número de serie de la factura. |
| `fecha_emision` | Fecha de emisión (`YYYY-MM-DD`). |
| `fecha_vencimiento` | Fecha de vencimiento de pago (puede ser `null`). |
| `importe_total` | Total del documento incluyendo todos los impuestos. |
| `importe_sin_impuestos` | Base imponible total (sin IVA, sin recargos, sin retenciones). |
| `moneda` | Código ISO de la moneda (ej: `"EUR"`). |
| `observaciones` | Notas del documento (puede ser `null`). |
| `datos_extra` | JSON libre con campos adicionales extraídos por el OCR (puede ser `null`). |
| `año` | Año fiscal del documento. |
| `trimestre` | Trimestre fiscal del documento (1–4). |
| `is_issued` | `true` si la empresa es **emisora** (factura emitida), `false` si es **receptora** (factura recibida). |
| `trimestre_cerrado` | `true` si el trimestre ya fue cerrado y no admite modificaciones. |
| `enviado_sii` | `true` si el documento fue marcado como enviado al SII. |
| `canal_carga` | Canal por el que entró el documento (ej: `"correo"`, `"manual"`, `"webhook"`). |
| `url_archivo` | URL pública directa al archivo original (PDF/imagen) almacenado en MinIO. |
| `entidades` | Objeto con las entidades del documento, indexadas por `rol` (`emisor`, `receptor`, `proveedor`, etc.). Cada entidad tiene: `nombre`, `identificador_fiscal`, `direccion`, `telefono`, `email`, `cuenta_contable`. |
| `lineas_detalle` | Array de líneas del documento. Cada línea tiene: `codigo`, `descripcion`, `cantidad`, `unidad`, `precio_unitario`, `descuento_porcentaje`, `precio_neto`, `importe_linea`, `cuenta_contable`. |
| `impuestos` | Array de impuestos **sin filtrar** (ver nota abajo). Cada fila tiene: `tipo_impuesto`, `porcentaje`, `base_imponible`, `cuota`, `total_con_impuesto`. |
| `archivos` | Array de archivos asociados al documento con `nombre_archivo`, `hash_archivo`, `tipo_archivo`, `url_archivo`. |
| `incidencias` | Array de incidencias del documento con estado de validación. Vacío si el documento no tiene incidencias. |
| `health_check` | Estado del chequeo matemático: `{ verified: bool, check_type, motivo }`. `null` si nunca fue verificado. |

> **⚠️ Importante — Array `impuestos[]`:**
> Es un volcado sin filtrar de la tabla `impuestos_documento`. Contiene **todos los tipos de impuesto mezclados**: IVA puro, Recargos de Equivalencia y Retenciones/IRPF.
>
> Para procesar correctamente en tu ERP, discriminá por `tipo_impuesto`:
> - **IVA puro** → filas donde `tipo_impuesto` **NO** contiene `"RECARGO"`, `"RETENCION"` ni `"IRPF"`.
> - **Recargo de Equivalencia** → `tipo_impuesto` contiene `"RECARGO"` o `"EQUIVALENCIA"`. La `cuota` es **positiva**.
> - **Retenciones / IRPF** → `tipo_impuesto` contiene `"RETENCION"` o `"IRPF"`. La `cuota` es **negativa** (ej: `-142.50`).
>
> Fórmula correcta para reconstruir el total real: `Total = Base + IVA_puro + Recargo - ABS(Retencion)`
>
> Si solo necesitás totales fiscales ya discriminados sin procesar cada línea, usá `/api/v1/analytics` que devuelve `iva_repercutido`, `recargo_repercutido` y `retencion_repercutido` directamente.

---

## 3. Consulta Tradicional de Documentos
Recupera el listado simplificado de documentos.

* **URL:** `/api/v1/documents`
* **Método:** `GET`

### Ejemplos de Petición cURL

#### Estilo A: Parámetros en la URL (Query String)
```bash
curl -X GET "https://[tu-dominio]/api/v1/documents?trimestre=3&año=2024&tipo=recibidas" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"
```

#### Estilo B: Parámetros Estructurados (Opciones cURL)
```bash
curl -G "https://[tu-dominio]/api/v1/documents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "trimestre=3" \
     --data-urlencode "año=2024" \
     --data-urlencode "tipo=recibidas"
```

---

## 4. Exportar Reporte a Excel
Genera un archivo Excel (`.xlsx`) con el libro de IVA y el resumen trimestral consolidado.

* **URL:** `/api/v1/export/excel`
* **Método:** `POST`
* **Content-Type:** `application/json`

### Ejemplo de Petición con cURL (Body JSON en Payload)
En solicitudes `POST`, los parámetros de entrada se envían estructurados dentro del cuerpo del mensaje utilizando `-d` (`--data`):

```bash
curl -X POST "https://[tu-dominio]/api/v1/export/excel" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{
           "año": 2026,
           "trimestre": 1,
           "tipo": "emitidas"
         }' \
     --output "Reporte_Trimestre_1_2026.xlsx"
```

---

## 5. Historial de Productos
Permite buscar precios y transacciones históricas a nivel de línea de detalle.

* **URL:** `/api/v1/products`
* **Método:** `GET`

### Ejemplos de Petición cURL

#### Estilo A: Parámetros en la URL (Query String)
```bash
curl -X GET "https://[tu-dominio]/api/v1/products?producto=cemento&proveedor=Corralón%20Sur" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"
```

#### Estilo B: Parámetros Estructurados (Opciones cURL)
```bash
curl -G "https://[tu-dominio]/api/v1/products" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "producto=cemento" \
     --data-urlencode "proveedor=Corralón Sur"
```

---

## 6. Analíticas Financieras Agregadas
Métricas de rendimiento financiero consolidado con los impuestos ya discriminados.

* **URL:** `/api/v1/analytics`
* **Método:** `GET`

### Campos del objeto `metricas_financieras`
| Campo | Descripción |
| :--- | :--- |
| `iva_repercutido` | IVA puro emitido (excluye recargos y retenciones) |
| `iva_soportado` | IVA puro soportado (excluye recargos y retenciones) |
| `resultado_iva_puro` | `iva_repercutido - iva_soportado` |
| `recargo_repercutido` | Recargo de Equivalencia en facturas emitidas (positivo) |
| `recargo_soportado` | Recargo de Equivalencia en facturas recibidas (positivo) |
| `retencion_repercutido` | Retenciones/IRPF en facturas emitidas (valor absoluto; en BD la cuota es negativa) |
| `retencion_soportado` | Retenciones/IRPF en facturas recibidas (valor absoluto; en BD la cuota es negativa) |

### Ejemplos de Petición cURL

#### Estilo A: Parámetros en la URL (Query String)
```bash
curl -X GET "https://[tu-dominio]/api/v1/analytics?año=2026" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"
```

#### Estilo B: Parámetros Estructurados (Opciones cURL)
```bash
curl -G "https://[tu-dominio]/api/v1/analytics" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "año=2026"
```

---

## 7. Gestión de Incidencias

Flujo típico de trabajo desde un ERP:
1. Hacer un `GET` para obtener las incidencias pendientes con todos los datos del documento.
2. Revisar en el ERP y decidir si aprobar.
3. Hacer un `POST` con el `incidencia_id` para marcarla como resuelta.

### 7.1 Listar Incidencias (GET)

* **URL:** `/api/v1/incidents`
* **Método:** `GET`

#### Estilo A: Parámetros en la URL (Query String)
```bash
# Listar todas las pendientes (default)
curl -X GET "https://[tu-dominio]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"

# Filtrar por estado
curl -X GET "https://[tu-dominio]/api/v1/incidents?estado=todas" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"

# Filtrar por documento específico
curl -X GET "https://[tu-dominio]/api/v1/incidents?estado=pendientes&documento_id=195" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui"
```

#### Estilo B: Parámetros Estructurados (Opciones cURL)
```bash
curl -G "https://[tu-dominio]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "estado=pendientes" \
     --data-urlencode "documento_id=195"
```

### 7.2 Validar (Resolver) una Incidencia (POST)

* **URL:** `/api/v1/incidents`
* **Método:** `POST`
* **Content-Type:** `application/json`

> El body siempre va como JSON. No hay parámetros en la URL para el `POST`.

```bash
# Mínimo (solo incidencia_id obligatorio)
curl -X POST "https://[tu-dominio]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{"incidencia_id": 42}'

# Con observaciones y firmante
curl -X POST "https://[tu-dominio]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{
           "incidencia_id": 42,
           "observaciones": "Diferencia de 0.12€ aceptada. Redondeo del proveedor.",
           "validado_por": "contabilidad@miempresa.com"
         }'
```

#### Respuestas posibles
| HTTP | Significado |
| :--- | :--- |
| `200` | Incidencia validada correctamente. |
| `400` | `incidencia_id` faltante o no es número. |
| `401` | API Key inválida o faltante. |
| `404` | La incidencia no existe o no pertenece a tu empresa. |
| `409` | La incidencia ya estaba validada previamente. |
