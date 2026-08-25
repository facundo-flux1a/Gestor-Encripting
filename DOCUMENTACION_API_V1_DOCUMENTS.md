# API Gestor — Endpoints de Documentos
### Versión 2 · Agosto 2026

---

## Índice

1. [Autenticación](#autenticación)
2. [GET /api/v1/documents](#get-apiv1documents)
3. [GET /api/v1/documents/full](#get-apiv1documentsfull)
4. [Ejemplos de llamada completos](#ejemplos-de-llamada-completos)
5. [Estructura de la respuesta](#estructura-de-la-respuesta)
   - [Desglose Financiero e Impuestos](#desglose-financiero-e-impuestos)
   - [Objeto Entidades](#objeto-entidades)
   - [Objeto Líneas de Detalle](#objeto-líneas-de-detalle)
   - [Archivos y URLs](#archivos-y-urls)
6. [Resumen de Cambios y Mejoras (v2)](#resumen-de-cambios-y-mejoras-v2)

---

## Autenticación

Todos los endpoints requieren el header de autenticación:

```http
X-Api-Key: muvail_xxxxx
```

| Caso | Status Code | Respuesta JSON |
|------|-------------|----------------|
| Header ausente | `401 Unauthorized` | `{ "error": "Header X-Api-Key requerido." }` |
| Clave inválida o revocada | `401 Unauthorized` | `{ "error": "API Key inválida o revocada." }` |

> **Nota:** La clave API está vinculada de manera exclusiva a una empresa. Los datos retornados corresponden únicamente a la empresa asociada a dicha clave.

---

## GET /api/v1/documents

Endpoint principal de alto rendimiento para listar documentos contables con sus líneas de detalle, impuestos y entidades asociadas.

### URL
```http
GET https://gestor.muvail.com/api/v1/documents
```

### Parámetros Query (todos opcionales)

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `desde_id` | integer | — | **Sincronización incremental (cursor).** Retorna solo documentos cuyo `id` sea estrictamente mayor a `N` (`WHERE id > N`). |
| `modificados_desde` | string | — | **Sincronización diferencial.** Filtra documentos **creados o modificados** desde la fecha dada. Formatos aceptados: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` (o fecha-hora ISO 8601). Alias: `modificado_desde`. |
| `limit` | integer | `500` | Límite máximo de registros a retornar por petición. Rango: `1` a `1000`. |
| `trimestre` | integer | — | Filtrar por número de trimestre fiscal: `1`, `2`, `3` o `4`. |
| `año` | integer | — | Filtrar por año fiscal (ej: `2026`). Alias aceptado: `ano`. |
| `tipo` | string | `todas` | Tipo de flujo: `emitidas` \| `recibidas` \| `todas`. |
| `proveedor` | string | — | Búsqueda parcial (case-insensitive) por nombre o CIF del emisor/proveedor. |
| `cliente` | string | — | Búsqueda parcial (case-insensitive) por nombre o CIF del receptor/cliente. |

### Errores de validación

| Condición | Status Code | Mensaje |
|-----------|-------------|---------|
| `desde_id` inválido | `400 Bad Request` | `{ "error": "\"desde_id\" debe ser un número entero positivo." }` |
| `trimestre` fuera de rango | `400 Bad Request` | `{ "error": "\"trimestre\" debe ser 1, 2, 3 o 4." }` |
| `tipo` no reconocido | `400 Bad Request` | `{ "error": "\"tipo\" debe ser \"emitidas\", \"recibidas\" o \"todas\"." }` |

---

## GET /api/v1/documents/full

Versión enriquecida y profunda del endpoint de documentos. Retorna la totalidad de metadatos y relaciones del documento, incluyendo **archivos adjuntos múltiples**, **incidencias**, **estado de verificación (health check)**, `file_hash`, `enviado_sii`, `canal_carga`, etc.

### URL
```http
GET https://gestor.muvail.com/api/v1/documents/full
```

### Parámetros Query Adicionales (exclusivos de `/full`)

Acepta **todos** los parámetros query de `/documents`, más los siguientes switches de inclusión:

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `incluir_incidencias` | boolean | `false` | Si se establece en `true`, incluye documentos con incidencias pendientes de validación. |
| `incluir_sin_verificar` | boolean | `false` | Si se establece en `true`, incluye documentos no verificados aún por el proceso de health check. |
| `incluir_sin_confirmar` | boolean | `false` | Si se establece en `true`, incluye borradores o documentos marcados como "(sin confirmar)". |

---

## Ejemplos de llamada completos

### cURL

```bash
# Consulta estándar a /api/v1/documents
curl -H "X-Api-Key: muvail_xxxxx" \
  "https://gestor.muvail.com/api/v1/documents?desde_id=8627&modificados_desde=2026-08-01&limit=200&trimestre=3&año=2026&tipo=recibidas&proveedor=García&cliente=Valentia"
```

```bash
# Consulta enriquecida a /api/v1/documents/full
curl -H "X-Api-Key: muvail_xxxxx" \
  "https://gestor.muvail.com/api/v1/documents/full?desde_id=8627&modificados_desde=2026-08-01&limit=200&trimestre=3&año=2026&tipo=recibidas&incluir_incidencias=true&incluir_sin_verificar=true&incluir_sin_confirmar=true"
```

---

### JavaScript / fetch

```javascript
const BASE_URL = "https://gestor.muvail.com";
const API_KEY  = "muvail_xxxxx";

const params = new URLSearchParams({
  desde_id:          "8627",
  modificados_desde: "2026-08-01",
  limit:             "200",
  trimestre:         "3",
  año:               "2026",
  tipo:              "recibidas", // "emitidas" | "recibidas" | "todas"
  proveedor:         "García",
  cliente:           "Valentia",
  // Opcionales para /full:
  incluir_incidencias:   "true",
  incluir_sin_verificar: "true",
  incluir_sin_confirmar: "true",
});

const response = await fetch(`${BASE_URL}/api/v1/documents/full?${params}`, {
  method: "GET",
  headers: {
    "X-Api-Key": API_KEY
  }
});

const result = await response.json();
console.log(`Total documentos: ${result.total}`, result.data);
```

---

### Python / requests

```python
import requests

BASE_URL = "https://gestor.muvail.com"
API_KEY  = "muvail_xxxxx"

params = {
    "desde_id":           8627,
    "modificados_desde":  "2026-08-01",
    "limit":              200,
    "trimestre":          3,
    "año":                2026,
    "tipo":               "recibidas",
    "proveedor":          "García",
    "cliente":            "Valentia",
    # Opcionales para /full:
    "incluir_incidencias":   True,
    "incluir_sin_verificar": True,
    "incluir_sin_confirmar": True,
}

response = requests.get(
    f"{BASE_URL}/api/v1/documents/full",
    headers={"X-Api-Key": API_KEY},
    params=params
)

data = response.json()
print(f"Total: {data['total']}")
for doc in data["data"]:
    print(f"ID: {doc['id']} | Num: {doc['numero_documento']} | Total: {doc['importe_total']} €")
```

---

### Patrón de Sincronización Incremental (Recomendado)

Para realizar descargas eficientes sin traer duplicados ni sobrecargar la API:

1. **Primera Petición:** Solicitar los primeros documentos ordenados por ID:
   `GET /api/v1/documents?limit=500`
2. **Obtener Cursor:** Extraer el `id` del último documento recibido en el array `data` (ej: `12200`).
3. **Peticiones Siguientes:** Solicitar los documentos posteriores pasando el cursor:
   `GET /api/v1/documents?desde_id=12200&limit=500`
4. **Finalización:** Cuando `total < limit` (o `data` venga vacío), se ha completado la sincronización.

---

## Estructura de la Respuesta

### Formato Envelope

Todas las respuestas exitosas de la API devuelven una estructura estandarizada:

```json
{
  "total": 44,
  "data": [ ...array_de_documentos ]
}
```

> Si no existen documentos que coincidan con la búsqueda, la API retorna: `{ "total": 0, "data": [] }`.

---

### 1. Desglose Financiero e Impuestos

Para responder a los requerimientos contables, el documento distingue claramente entre la base imponible pura, el total con impuestos y el desglose de todos los tributos:

```json
{
  "id": 8627,
  "tipo_documento": "Factura",
  "numero_documento": "V-26-06-16661",
  "fecha_emision": "2026-06-15",
  "fecha_vencimiento": "2026-07-15",
  "actualizado_en": "2026-08-20T14:23:00.000Z",

  "importe_total": 1000.00,
  "importe_sin_impuestos": 1000.00,
  "importe_con_impuestos": 1210.00,
  "moneda": "EUR",
  "retencion": null,

  "impuestos": [
    {
      "tipo_impuesto": "IVA",
      "porcentaje": 21,
      "base_imponible": 1000.00,
      "cuota": 210.00
    }
  ]
}
```

#### Especificaciones Financieras:
- **`importe_total`**: Corresponde a la **base imponible pura** del documento (neto sin impuestos).
- **`importe_con_impuestos`**: Corresponde al **importe final total del documento**, que suma la base imponible más todos los impuestos aplicables (IVA, Recargos) menos las Retenciones.
- **`importe_sin_impuestos`**: Corresponde a la **base imponible pura** (mantenido para retrocompatibilidad).
- **`impuestos`**: Matriz detallada del desglose de tributos asociados al documento. Permite diferenciar **IVA**, **IRPF / Retenciones**, **Recargos de Equivalencia**, etc.
  - `tipo_impuesto`: Identificador del tributo (`"IVA"`, `"IRPF"`, `"RETENCION"`, `"RECARGO"`, etc.).
  - `porcentaje`: Porcentaje numérico del tributo (ej: `21`, `10`, `15`).
  - `base_imponible`: Base sobre la que se calcula la cuota.
  - `cuota`: Valor monetario final resultante de la aplicación del porcentaje sobre la base.

> [!NOTE]
> **Resumen del Ajuste de Campos Financieros:**  
> - **`importe_total`** = Base Imponible (Neto sin impuestos).  
> - **`importe_con_impuestos`** = Total Final (Base + Impuestos - Retenciones).  
> - **`impuestos[]`** = Array de desglose con el tipo de impuesto, porcentaje, base y cuota correspondiente.

---

### 2. Objeto `entidades`

La API expone de forma completa los metadatos de las entidades vinculadas (`emisor`, `receptor`, `proveedor`, `cliente`).

```json
{
  "entidades": {
    "emisor": {
      "nombre": "Dawood Import S.L.",
      "cif": "B12345678",
      "direccion": "Calle Mayor 1, 28001 Madrid",
      "codigo_postal": "28001",
      "poblacion": "Madrid",
      "provincia": "Madrid",
      "telefono": "911234567",
      "email": "info@dawood.es",
      "iban": "ES91 2100 0418 4502 0005 1332"
    },
    "receptor": {
      "nombre": "Valentia Alimentación S.L.",
      "cif": "A87654321",
      "direccion": null,
      "codigo_postal": null,
      "poblacion": null,
      "provincia": null,
      "telefono": null,
      "email": null,
      "iban": null
    }
  }
}
```

#### Política de Valores y Nulos:
- **Campos Completos**: Se extraen y estructuran `nombre`, `cif` (identificador fiscal), `direccion`, `codigo_postal`, `poblacion`, `provincia`, `telefono`, `email` e `iban`.
- **Tratamiento de Nulos**: A excepción de los datos obligatorios o existentes, cualquier campo que no haya sido detectado en la factura física se retorna explícitamente como `null` (jamás como cadena vacía `""` ni como `0`).
- **Extracción Automática**: El código postal y la población son parseados automáticamente del string de dirección si el OCR no los separó previamente.

---

### 3. Objeto `lineas_detalle[]`

Líneas de mercancía o servicios extraídas de la factura:

```json
{
  "lineas_detalle": [
    {
      "codigo_proveedor": "PROD-001",
      "codigo_barras": "8412345678901",
      "descripcion": "Aceite de oliva virgen extra 5L",
      "cantidad": 10,
      "precio_unitario": 18.15,
      "descuento_porcentaje": 0,
      "precio_neto": 18.15,
      "importe_total": 181.50,
      "iva_porcentaje": 10,
      "iva_incluido": false
    }
  ]
}
```

#### Campos de Línea:
- **`codigo_proveedor`**: Código de artículo asignado por el proveedor. Si no existe en la factura, retorna `null`.
- **`codigo_barras`**: Código EAN / código de barras si fue leído por OCR. Si no existe, retorna `null`.
- **`descripcion`**: Texto descriptivo de la línea de factura.
- **`cantidad`**: Cantidad física de la línea.
- **`precio_unitario`**: Precio por unidad antes de descuentos e impuestos.
- **`descuento_porcentaje`**: Porcentaje de descuento aplicado.
- **`precio_neto`**: Precio unitario efectivo tras aplicar el descuento (sin IVA).
- **`importe_total`**: **Base imponible de la línea** (`cantidad × precio_neto`), siempre sin IVA.
- **`iva_porcentaje`**: Porcentaje de IVA específico asignado a la línea (`21`, `10`, `4`, etc.).
- **`iva_incluido`**: Booleano constante (`false`), que certifica que la cifra en `importe_total` es base imponible pura.

> [!IMPORTANT]
> **Aclaración sobre `iva_incluido` y Totales por Línea:**  
> En versiones previas existía ambigüedad sobre si los importes de línea incluían o no el IVA. En la **v2**, todas las cifras de las líneas (`precio_unitario`, `precio_neto`, e `importe_total`) corresponden de forma estricta a la **base imponible (neto sin IVA)**.  
> El campo `"iva_incluido": false` se incluye explícitamente como una **garantía de contrato**: informa al sistema integrador que **no debe restar el IVA** a la cifra de `importe_total`. Si el sistema receptor necesita obtener el importe bruto de la línea con IVA incluido, debe calcularlo mediante:  
> `Importe Con IVA = importe_total × (1 + iva_porcentaje / 100)`

---


### 4. Archivos y URLs

```json
{
  "url_archivo": "https://minio.allbase.com.ar/gestor/empresa/facturas/factura_V26061.pdf"
}
```

- **Disponibilidad Garantizada**: El campo `url_archivo` en la raíz de cada documento **siempre existirá** (si el documento posee archivo adjunto) y contiene la URL pública directa para la descarga del PDF o imagen.
- **Normalización**: Las URLs son construidas de forma centralizada y limpia, eliminando duplicaciones de dominio o de ruta.

En el endpoint `/api/v1/documents/full`, se incluye además la colección de todos los archivos vinculados:

```json
{
  "archivos": [
    {
      "id": 77,
      "tipo_archivo": "pdf",
      "nombre_archivo": "factura_V26061.pdf",
      "hash_archivo": "sha256:abc123...",
      "ruta_archivo": "empresa/facturas/factura_V26061.pdf",
      "fecha_subida": "2026-06-16T09:05:00.000Z",
      "url_archivo": "https://minio.allbase.com.ar/gestor/empresa/facturas/factura_V26061.pdf"
    }
  ]
}
```

---

## Resumen de Cambios y Mejoras (v2)

| # | Feature / Cambio | Descripción Técnica |
|---|------------------|---------------------|
| 1 | **Cursor Incremental `?desde_id=`** | Permite paginar eficientemente pidiendo únicamente documentos con `id > N`, evitando recargar todo el histórico. |
| 2 | **Filtro `?modificados_desde=`** | Retorna documentos que hayan sufrido cambios de OCR, datos o validación a partir de una fecha dada. |
| 3 | **Límite Configurable `?limit=`** | Control explícito de paginación (defecto 500, máximo 1000). |
| 4 | **Claridad Financiera en Totales** | `importe_total` e `importe_sin_impuestos` entregan la base imponible pura; `importe_con_impuestos` entrega el total final con impuestos. |
| 5 | **Soporte Tributario Extendido** | La sección `impuestos` desglosa IVA, retenciones (IRPF), recargos y cuotas de forma diferenciada. |
| 6 | **Entidades Enriquecidas** | Extracción total de `cif`, `direccion`, `codigo_postal`, `poblacion`, `provincia`, `telefono`, `email` e `iban`. |
| 7 | **Identificación de Productos** | Incorporación de `codigo_proveedor` y `codigo_barras` en las líneas de detalle. |
| 8 | **URL Directa de Archivo Estándar** | El campo `url_archivo` se entrega normalizado y listo para consumo directo. |
| 9 | **Consistencia de Nulos (`null`)** | Todo dato inexistente o no detectado se envía como `null`, sin cadenas vacías ni valores de relleno. |
| 10 | **Estructura Envelope `total`** | Garantiza la propiedad `total` incluso en conjuntos vacíos (`{ "total": 0, "data": [] }`). |
