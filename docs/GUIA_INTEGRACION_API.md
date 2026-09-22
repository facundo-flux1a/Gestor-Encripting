# Guía de Integración API Gestor — ERP

> **Base URL Producción:** `https://gestor.muvail.com/api/v1`  
> **Autenticación:** Header obligatorio `X-Api-Key: <tu_api_key>` en todas las peticiones.  
> **Formato de datos:** JSON (`Content-Type: application/json`).

---

## 1. Identificador de Origen (`ref_origen`) — Ida y Vuelta

### Descripción
Permite al ERP enviar su propio identificador único interno (por ejemplo el ID interno de factura o código del sistema externo como `ERP-FAC-2026-9001`).
- **Persistencia garantizada:** El Gestor almacena este identificador en base de datos.
- **Devolución automática:** Se devuelve íntegro en `GET /api/v1/documents`, en `GET /api/v1/documents/full` y en la columna **"Ref. Origen"** del Excel de exportación (`GET /api/v1/export/excel`).
- **Trazabilidad:** Permite reconciliar unívocamente cada factura entre Facturación, Gestor y Contabilidad sin depender exclusivamente del número de factura.

---

### 1.1 Envío de Factura con `ref_origen` (POST /documents)

#### Petición HTTP
`POST https://gestor.muvail.com/api/v1/documents`

#### Ejemplo cURL (Producción)
```bash
curl -X POST "https://gestor.muvail.com/api/v1/documents" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <TU_API_KEY>" \
  -d '{
    "documentos": [
      {
        "ref_origen": "ERP-FAC-2026-9001",
        "numero_documento": "FAC-2026-001",
        "serie": "F",
        "is_issued": true,
        "tipo_documento": "factura",
        "fecha_emision": "2026-09-22",
        "fecha_vencimiento": "2026-10-22",
        "importe_total": 1210.00,
        "importe_sin_impuestos": 1000.00,
        "moneda": "EUR",
        "forma_pago": "transferencia",
        "entidades": {
          "emisor": {
            "nombre": "Muvail Systems S.L.",
            "cif": "B25926494",
            "direccion": "Calle Principal 123",
            "codigo_postal": "46001",
            "poblacion": "Valencia",
            "provincia": "Valencia",
            "pais": "ESP"
          },
          "cliente": {
            "nombre": "Cliente Ejemplo S.A.",
            "cif": "A12345678",
            "direccion": "Av. Diagonal 456",
            "codigo_postal": "08006",
            "poblacion": "Barcelona",
            "provincia": "Barcelona",
            "pais": "ESP"
          }
        },
        "impuestos": [
          {
            "tipo_impuesto": "IVA",
            "porcentaje": 21,
            "base_imponible": 1000.00,
            "cuota": 210.00
          }
        ],
        "lineas": [
          {
            "codigo": "SERV-01",
            "descripcion": "Servicios de desarrollo de software",
            "cantidad": 1,
            "precio_unitario": 1000.00,
            "importe_linea": 1000.00
          }
        ]
      }
    ]
  }'
```

#### Respuesta Real (201 Created)
```json
{
  "resumen": {
    "total": 1,
    "creados": 1,
    "actualizados": 0,
    "fallidos": 0
  },
  "resultados": [
    {
      "numero_documento": "FAC-2026-001",
      "estado": "creado",
      "id_interno": 17666
    }
  ]
}
```

---

### 1.2 Recuperación del Documento con `ref_origen` (GET /documents)

#### Petición HTTP
`GET https://gestor.muvail.com/api/v1/documents?tipo=emitidas&limit=10`

#### Ejemplo cURL (Producción)
```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?tipo=emitidas&limit=10" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Respuesta Real
```json
{
  "total": 1,
  "data": [
    {
      "id": 17666,
      "ref_origen": "ERP-FAC-2026-9001",
      "origen": "sistema",
      "canal_origen": "api",
      "tipo_documento": "FACTURA EMITIDA",
      "numero_documento": "FAC-2026-001",
      "fecha_emision": "2026-09-22T03:00:00.000Z",
      "fecha_vencimiento": "2026-10-22T03:00:00.000Z",
      "actualizado_en": "2026-09-22T17:58:00.000Z",
      "factura_rectificada": null,
      "factura_rectificada_id": null,
      "rectificada_por_numero": null,
      "rectificada_por_id": null,
      "motivo_rectificacion": null,
      "base_sujeta": 1000,
      "base_no_sujeta": 0,
      "base_total": 1000,
      "base_imponible": 1000,
      "importe_total": 1000,
      "importe_sin_impuestos": 1000,
      "importe_con_impuestos": 1210,
      "moneda": "EUR",
      "observaciones": null,
      "trimestre": 1,
      "año": 2027,
      "retencion": 0,
      "retencion_irpf": 0,
      "descuento_global": 0,
      "entidades": {
        "emisor": {
          "nombre": "Muvail Systems S.L.",
          "cif": "B25926494",
          "direccion": "Calle Principal 123",
          "codigo_postal": null,
          "poblacion": null,
          "provincia": null,
          "telefono": null,
          "email": null,
          "iban": null
        },
        "cliente": {
          "nombre": "Cliente Ejemplo S.A.",
          "cif": "A12345678",
          "direccion": "Av. Diagonal 456",
          "codigo_postal": null,
          "poblacion": null,
          "provincia": null,
          "telefono": null,
          "email": null,
          "iban": null
        }
      },
      "is_issued": true,
      "url_archivo": null,
      "url_proxy": null,
      "impuestos": [
        {
          "documento_id": 17666,
          "tipo_impuesto": "IVA",
          "porcentaje": "21.00",
          "base_imponible": "1000.00",
          "cuota": "210.00"
        }
      ],
      "lineas_detalle": [
        {
          "codigo_proveedor": null,
          "codigo_barras": null,
          "descripcion": "Servicios de desarrollo de software",
          "cantidad": 1,
          "precio_unitario": 1000,
          "descuento_porcentaje": 0,
          "precio_neto": 1000,
          "importe_total": 1000,
          "iva_porcentaje": 21,
          "iva_incluido": false
        }
      ]
    }
  ]
}
```

---

### 1.3 Detalle Completo con `ref_origen` (GET /documents/full)

#### Petición HTTP
`GET https://gestor.muvail.com/api/v1/documents/full?tipo=emitidas&limit=10`

#### Ejemplo cURL (Producción)
```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents/full?tipo=emitidas&limit=10" \
  -H "X-Api-Key: <TU_API_KEY>"
```

El endpoint `/full` devuelve exactamente el mismo campo `"ref_origen": "ERP-FAC-2026-9001"` junto a los metadatos completos del documento, auditoría, trazabilidad e incidencias.
```

---

### 1.4 Presencia en Exportación Excel (GET /export/excel)

El endpoint:
```bash
curl -X GET "https://gestor.muvail.com/api/v1/export/excel?tipo=emitidas" \
  -H "X-Api-Key: <TU_API_KEY>" \
  --output facturas_emitidas.xlsx
```
Genera un archivo Excel que incluye la columna **`Ref. Origen`** con el valor `"ERP-FAC-2026-9001"`.

---

## 2. Facturas RECIBIDAS Estructuradas (`is_issued: false`)

### Descripción
Permite al ERP enviar facturas recibidas de proveedores ya estructuradas con sus datos exactos (base, cuotas, emisor, cliente, líneas y PDF opcional) sin pasar por ningún proceso de OCR.

- **Cero OCR:** El Gestor inserta los datos directamente en la base de datos fiscal. Si se proporciona `url_archivo`, el PDF se descarga y se almacena en el bucket privado asociándolo al documento, **sin encolar tareas de OCR ni re-extraer datos**.
- **Trazabilidad:** Quedan registradas con `origen: "sistema"` y `canal_origen: "api"`.
- **Tipificación automática por `is_issued`:** El campo `is_issued` es el mecanismo principal de tipificación. Al enviarlo como `false`, el sistema determina que el documento es **RECIBIDO** y typifica en consecuencia: `FACTURA RECIBIDA`, `ABONO RECIBIDO`, `TICKET`, etc., asignando las entidades a `proveedor` y `receptor`. Si `is_issued: true`, el tipo resultante es siempre `EMITIDO`.
- **Detección de abono por importe negativo (fallback):** Si el `tipo_documento` enviado es `"abono"` o `"rectificativa"`, o si `importe_total` / `importe_sin_impuestos` son negativos, el sistema fuerza la tipificación a `ABONO EMITIDO` / `ABONO RECIBIDO` independientemente de lo que indique el `tipo_documento`. Los importes negativos actúan como red de seguridad para ERPs que no distinguen explícitamente el tipo en el campo `tipo_documento`.

### Clave de Idempotencia (Prevención de Duplicados)
Para evitar documentos duplicados en facturas recibidas, el sistema calcula la siguiente clave única por empresa:
```text
ref_externa = {CIF_EMISOR}::{SERIE}::{NUMERO_DOCUMENTO}
```
- **Si no existe:** Se inserta el documento nuevo (`"estado": "creado"`).
- **Si ya existe:** Se actualiza el registro existente en la base de datos con los nuevos datos (`"estado": "actualizado"`), manteniendo el mismo ID interno.

---

### 2.1 Envío de Factura Recibida (POST /documents)

#### Petición HTTP
`POST https://gestor.muvail.com/api/v1/documents`

#### Ejemplo cURL (Producción)
```bash
curl -X POST "https://gestor.muvail.com/api/v1/documents" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <TU_API_KEY>" \
  -d '{
    "documentos": [
      {
        "ref_origen": "ERP-REC-2026-0042",
        "numero_documento": "PROV-2026-8841",
        "serie": "",
        "is_issued": false,
        "tipo_documento": "factura",
        "fecha_emision": "2026-09-22",
        "fecha_vencimiento": "2026-10-22",
        "importe_total": 605.00,
        "importe_sin_impuestos": 500.00,
        "moneda": "EUR",
        "forma_pago": "transferencia",
        "entidades": {
          "emisor": {
            "nombre": "Consultoría Estratégica Palau S.L.",
            "cif": "B47234567",
            "direccion": "Calle Mayor 10",
            "codigo_postal": "46002",
            "poblacion": "Valencia",
            "provincia": "Valencia",
            "pais": "ESP"
          },
          "cliente": {
            "nombre": "Muvail Systems S.L.",
            "cif": "B25926494",
            "direccion": "Calle Principal 123",
            "codigo_postal": "46001",
            "poblacion": "Valencia",
            "provincia": "Valencia",
            "pais": "ESP"
          }
        },
        "impuestos": [
          {
            "tipo_impuesto": "IVA",
            "porcentaje": 21,
            "base_imponible": 500.00,
            "cuota": 105.00
          }
        ],
        "lineas": [
          {
            "codigo": "CONS-01",
            "descripcion": "Consultoría estratégica mensual",
            "cantidad": 1,
            "precio_unitario": 500.00,
            "importe_linea": 500.00
          }
        ]
      }
    ]
  }'
```

#### Respuesta Real (201 Created)
```json
{
  "resumen": {
    "total": 1,
    "creados": 1,
    "actualizados": 0,
    "fallidos": 0
  },
  "resultados": [
    {
      "numero_documento": "PROV-2026-8841",
      "estado": "creado",
      "id_interno": 17667
    }
  ]
}
```

---

### 2.2 Consulta de Facturas Recibidas (GET /documents?tipo=recibidas)

#### Petición HTTP
`GET https://gestor.muvail.com/api/v1/documents?tipo=recibidas&limit=10`

#### Ejemplo cURL (Producción)
```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?tipo=recibidas&limit=10" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Respuesta Real
```json
{
  "total": 1,
  "data": [
    {
      "id": 17667,
      "ref_origen": "ERP-REC-2026-0042",
      "origen": "sistema",
      "canal_origen": "api",
      "tipo_documento": "FACTURA RECIBIDA",
      "numero_documento": "PROV-2026-8841",
      "fecha_emision": "2026-09-22T03:00:00.000Z",
      "fecha_vencimiento": "2026-10-22T03:00:00.000Z",
      "actualizado_en": "2026-09-22T18:15:28.000Z",
      "factura_rectificada": null,
      "factura_rectificada_id": null,
      "rectificada_por_numero": null,
      "rectificada_por_id": null,
      "motivo_rectificacion": null,
      "base_sujeta": 500,
      "base_no_sujeta": 0,
      "base_total": 500,
      "base_imponible": 500,
      "importe_total": 500,
      "importe_sin_impuestos": 500,
      "importe_con_impuestos": 605,
      "moneda": "EUR",
      "observaciones": null,
      "trimestre": 1,
      "año": 2027,
      "retencion": 0,
      "retencion_irpf": 0,
      "descuento_global": 0,
      "entidades": {
        "proveedor": {
          "nombre": "Consultoría Estratégica Palau S.L.",
          "cif": "B47234567",
          "direccion": "Calle Mayor 10",
          "codigo_postal": null,
          "poblacion": null,
          "provincia": null,
          "telefono": null,
          "email": null,
          "iban": null
        },
        "receptor": {
          "nombre": "Muvail Systems S.L.",
          "cif": "B25926494",
          "direccion": "Calle Principal 123",
          "codigo_postal": null,
          "poblacion": null,
          "provincia": null,
          "telefono": null,
          "email": null,
          "iban": null
        }
      },
      "is_issued": false,
      "url_archivo": null,
      "url_proxy": null,
      "impuestos": [
        {
          "documento_id": 17667,
          "tipo_impuesto": "IVA",
          "porcentaje": "21.00",
          "base_imponible": "500.00",
          "cuota": "105.00"
        }
      ],
      "lineas_detalle": [
        {
          "codigo_proveedor": null,
          "codigo_barras": null,
          "descripcion": "Consultoría estratégica mensual",
          "cantidad": 1,
          "precio_unitario": 500,
          "descuento_porcentaje": 0,
          "precio_neto": 500,
          "importe_total": 500,
          "iva_porcentaje": 21,
          "iva_incluido": false
        }
      ]
    }
  ]
}
```

---

## 3. Marca de Trazabilidad: `origen: "sistema"` vs `"ocr"`

### Descripción
Permite al ERP identificar con certeza absoluta qué facturas fueron inyectadas mediante integración directa desde su software/ERP y cuáles fueron subidas por usuarios humanos o extraídas mediante OCR.

- **`"origen": "sistema"`** y **`"canal_origen": "api"`**:  
  Documento insertado por API REST. Todos sus campos están validados en origen; el Gestor garantiza que ningún proceso automático de OCR modificará sus valores.
- **`"origen": "ocr"`** y **`"canal_origen": "dashboard"` / `"correo"`**:  
  Documento digitalizado mediante el motor de OCR/IA a partir de un archivo subido manualmente o recibido por buzón.

Ambos campos se devuelven en la raíz de cada documento en `GET /documents` y `GET /documents/full`.

---

## 4. Facturas Rectificativas y Abonos

### Descripción
Soporte completo para facturas rectificativas y abonos con importes negativos y **enlace bidireccional inteligente**:

1. **Detección Automática de Abono:**
   - Si `tipo_documento` es `"abono"` o `"rectificativa"`, o si los importes (`importe_total`, `importe_sin_impuestos`) son negativos.
   - Tipificación resultante: `ABONO EMITIDO` (cuando `is_issued: true`) o `ABONO RECIBIDO` (cuando `is_issued: false`).
2. **Enlace Inteligente a la Factura Original:**
   - En el campo `factura_rectificada` (o `ref_factura_origen`), el ERP puede enviar:
     - El **número de la factura original** (ej: `"FAC-2026-001"`).
     - O el **`ref_origen` de la factura original** (ej: `"ERP-FAC-2026-9001"`).
   - El Gestor localiza la factura original y establece el vínculo bidireccional:
     - En el abono: `factura_rectificada_id` apunta al ID de la original.
     - En la factura original: `rectificada_por_id` y `rectificada_por_numero` apuntan automáticamente al abono recién creado.
3. **Motivo de Rectificación:**
   - Se especifica en `motivo_rectificacion` (o `motivo`) y se almacena en base de datos.
4. **Signos Negativos Admitidos:**
   - Bases imponibles, cuotas e importes totales admiten signo negativo tanto a nivel global como en cada línea de detalle e impuesto.

---

### 4.1 Creación de Abono / Rectificativa (POST /documents)

#### Petición HTTP
`POST https://gestor.muvail.com/api/v1/documents`

El flujo completo requiere dos pasos: primero se ingresa la factura original, y luego el abono que la rectifica.

**Paso 1 — Factura original (la que será rectificada)**
```bash
curl -X POST "https://gestor.muvail.com/api/v1/documents" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <TU_API_KEY>" \
  -d '{
    "documentos": [
      {
        "ref_origen": "ERP-FAC-2026-9001",
        "numero_documento": "FAC-2026-001",
        "serie": "F",
        "is_issued": true,
        "tipo_documento": "factura",
        "fecha_emision": "2026-09-22",
        "fecha_vencimiento": "2026-10-22",
        "importe_total": 1210.00,
        "importe_sin_impuestos": 1000.00,
        "moneda": "EUR",
        "entidades": {
          "emisor": {
            "nombre": "Muvail Systems S.L.",
            "cif": "B25926494"
          },
          "cliente": {
            "nombre": "Cliente Ejemplo S.A.",
            "cif": "A12345678"
          }
        },
        "impuestos": [
          {
            "tipo_impuesto": "IVA",
            "porcentaje": 21,
            "base_imponible": 1000.00,
            "cuota": 210.00
          }
        ],
        "lineas": [
          {
            "descripcion": "Servicios de desarrollo de software",
            "cantidad": 1,
            "precio_unitario": 1000.00,
            "importe_linea": 1000.00
          }
        ]
      }
    ]
  }'
```

**Respuesta Paso 1 (201 Created)**
```json
{
  "resumen": { "total": 1, "creados": 1, "actualizados": 0, "fallidos": 0 },
  "resultados": [
    { "numero_documento": "FAC-2026-001", "estado": "creado", "id_interno": 17666 }
  ]
}
```

---

**Paso 2 — Abono / Rectificativa que referencia la factura original**

En `factura_rectificada` se puede enviar tanto el `numero_documento` como el `ref_origen` de la factura original:
```bash
curl -X POST "https://gestor.muvail.com/api/v1/documents" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <TU_API_KEY>" \
  -d '{
    "documentos": [
      {
        "ref_origen": "ERP-ABO-2026-0005",
        "numero_documento": "ABO-2026-001",
        "serie": "R",
        "is_issued": true,
        "tipo_documento": "abono",
        "factura_rectificada": "ERP-FAC-2026-9001",
        "motivo_rectificacion": "Devolución parcial por disconformidad en horas de servicio",
        "fecha_emision": "2026-09-22",
        "importe_total": -242.00,
        "importe_sin_impuestos": -200.00,
        "moneda": "EUR",
        "entidades": {
          "emisor": {
            "nombre": "Muvail Systems S.L.",
            "cif": "B25926494"
          },
          "cliente": {
            "nombre": "Cliente Ejemplo S.A.",
            "cif": "A12345678"
          }
        },
        "impuestos": [
          {
            "tipo_impuesto": "IVA",
            "porcentaje": 21,
            "base_imponible": -200.00,
            "cuota": -42.00
          }
        ],
        "lineas": [
          {
            "descripcion": "Abono horas de soporte no consumidas",
            "cantidad": -1,
            "precio_unitario": 200.00,
            "importe_linea": -200.00
          }
        ]
      }
    ]
  }'
```

**Respuesta Paso 2 (201 Created)**
```json
{
  "resumen": { "total": 1, "creados": 1, "actualizados": 0, "fallidos": 0 },
  "resultados": [
    { "numero_documento": "ABO-2026-001", "estado": "creado", "id_interno": 17668 }
  ]
}
```

---

### 4.2 Verificación del Enlace Bidireccional (GET /documents?tipo=emitidas)

Al consultar las facturas emitidas, se observa cómo ambos documentos quedan enlazados recíprocamente:

```json
{
  "total": 2,
  "data": [
    {
      "id": 17666,
      "ref_origen": "ERP-FAC-2026-9001",
      "tipo_documento": "FACTURA EMITIDA",
      "numero_documento": "FAC-2026-001",
      "factura_rectificada": null,
      "factura_rectificada_id": null,
      "rectificada_por_numero": "ABO-2026-001",
      "rectificada_por_id": 17668,
      "base_total": 1000,
      "importe_con_impuestos": 1210
    },
    {
      "id": 17668,
      "ref_origen": "ERP-ABO-2026-0005",
      "tipo_documento": "ABONO EMITIDO",
      "numero_documento": "ABO-2026-001",
      "factura_rectificada": "FAC-2026-001",
      "factura_rectificada_id": 17666,
      "rectificada_por_numero": null,
      "rectificada_por_id": null,
      "motivo_rectificacion": "Devolución parcial por disconformidad en horas de servicio",
      "base_total": -200,
      "importe_con_impuestos": -242
    }
  ]
}
```

---

## 5. Sincronización Incremental (`?desde_id=`, `?modificados_desde=` y `actualizado_en`)

### Descripción
Permite al ERP sincronizar documentos de forma continua y eficiente sin necesidad de descargar todo el histórico en cada consulta.

Existen dos estrategias complementarias:

### Estrategia A: Paginación por Cursor con `?desde_id=`
Ideal para ingesta secuencial de nuevos documentos:
- Se ordena por `id ASC`.
- Filtra por `id > {desde_id}`.
- El ERP simplemente almacena el mayor `id` procesado y lo envía en la siguiente petición.

#### Petición HTTP
`GET https://gestor.muvail.com/api/v1/documents?desde_id=17666&limit=10`

#### Ejemplo cURL (Producción)
```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?desde_id=17666&limit=10" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Respuesta Real
Excluye la factura `17666` y retorna solo los documentos posteriores (`17667` y `17668`):
```json
{
  "total": 2,
  "data": [
    {
      "id": 17667,
      "ref_origen": "ERP-REC-2026-0042",
      "tipo_documento": "FACTURA RECIBIDA",
      "numero_documento": "PROV-2026-8841"
    },
    {
      "id": 17668,
      "ref_origen": "ERP-ABO-2026-0005",
      "tipo_documento": "ABONO EMITIDO",
      "numero_documento": "ABO-2026-001"
    }
  ]
}
```

---

### Estrategia B: Sincronización por Cambios con `?modificados_desde=` y `actualizado_en`
Ideal para detectar tanto nuevos documentos como ediciones o modificaciones realizadas posteriormente:
- **`actualizado_en`:** Campo devuelto en cada documento con la fecha/hora real de la última modificación en formato ISO 8601 UTC (`GREATEST(fecha_creacion, ultima_auditoria)`).
- **`?modificados_desde=YYYY-MM-DDTHH:mm:ss.sssZ`:** Filtra únicamente aquellos documentos cuya creación o auditoría de edición sea posterior o igual a esa marca temporal.

#### Petición HTTP
`GET https://gestor.muvail.com/api/v1/documents?modificados_desde=2026-09-22T18:55:00.000Z`

#### Ejemplo cURL (Producción)
```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?modificados_desde=2026-09-22T18:55:00.000Z" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Comportamiento Comprobado en Prueba Real:
1. **Antes de modificar:** Con fecha `18:55:00.000Z`, el endpoint devolvió:
   ```json
   { "total": 0, "data": [] }
   ```
2. **Tras modificar un campo:** Se editó el número de la factura `17667` a las `18:57:22.000Z`.
3. **Resultado tras la modificación:** La misma llamada devuelve de inmediato el documento actualizado:
   ```json
   {
     "total": 1,
     "data": [
       {
         "id": 17667,
         "ref_origen": "ERP-REC-2026-0042",
         "tipo_documento": "FACTURA RECIBIDA",
         "numero_documento": "PROV-2026-884",
         "actualizado_en": "2026-09-22T18:57:22.000Z"
       }
     ]
   }
   ```

---

## 6. Descarga de Archivos: Presigned URLs y `permalink` Opcional

### Descripción
El Gestor proporciona URLs seguras para que el ERP pueda descargar los PDFs o imágenes de cada factura directamente:

1. **`url_archivo` (Presigned URL — Por Defecto):**
   - URL temporal firmada criptográficamente directa al storage privado (`https://storage.gestor.muvail.com/...`).
   - **Ventajas:** Descarga directa desde el storage sin saturar la red ni la memoria del servidor de la aplicación.
   - **Caducidad:** Por defecto dura **24 horas (86.400 segundos)**. Es personalizable mediante el parámetro `?url_expires_in={segundos}` (ej: `?url_expires_in=3600` para 1 hora).
2. **`permalink` (Enlace Permanente — Opcional mediante `?permalink=true`):**
   - Para no sobrecargar la respuesta por defecto, la URL permanente a través de proxy (`https://gestor.muvail.com/api/files/...`) solo se incluye si el cliente lo solicita explícitamente pasando `?permalink=true` (o `?incluir_permalink=true`) en la query.

---

### 6.1 Envío de Factura con PDF Adjunto (POST /documents)

El ERP puede incluir la URL del PDF que desea almacenar en el Gestor:

```bash
curl -X POST "https://gestor.muvail.com/api/v1/documents" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <TU_API_KEY>" \
  -d '{
    "documentos": [
      {
        "ref_origen": "ERP-FAC-PDF-0099",
        "numero_documento": "FAC-PDF-001",
        "serie": "P",
        "is_issued": true,
        "tipo_documento": "factura",
        "fecha_emision": "2026-09-22",
        "importe_total": 121.00,
        "importe_sin_impuestos": 100.00,
        "url_archivo": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        "entidades": {
          "emisor": { "nombre": "Muvail Systems S.L.", "cif": "B25926494" },
          "cliente": { "nombre": "Cliente Ejemplo S.A.", "cif": "A12345678" }
        },
        "impuestos": [
          { "tipo_impuesto": "IVA", "porcentaje": 21, "base_imponible": 100.00, "cuota": 21.00 }
        ]
      }
    ]
  }'
```

---

### 6.2 Consulta con Presigned URL por Defecto (GET /documents)

```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?desde_id=17668&limit=5" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Respuesta Real por Defecto (Solo `url_archivo`)
```json
{
  "total": 1,
  "data": [
    {
      "id": 17669,
      "ref_origen": "ERP-FAC-PDF-0099",
      "origen": "sistema",
      "canal_origen": "api",
      "tipo_documento": "FACTURA EMITIDA",
      "numero_documento": "FAC-PDF-001",
      "importe_total": 100,
      "importe_sin_impuestos": 100,
      "importe_con_impuestos": 121,
      "is_issued": true,
      "url_archivo": "https://storage.gestor.muvail.com/archivos/FAC-PDF-001_1790093380732.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=20260922T161001Z&X-Amz-Expires=86400&X-Amz-Signature=<firma>&X-Amz-SignedHeaders=host"
    }
  ]
}
```

---

### 6.3 Consulta Solicitando `permalink` Permanente (GET /documents?permalink=true)

Si el ERP necesita guardar una URL fija en su base de datos que no expire nunca:

```bash
curl -X GET "https://gestor.muvail.com/api/v1/documents?desde_id=17668&permalink=true" \
  -H "X-Api-Key: <TU_API_KEY>"
```

#### Respuesta con `permalink`
```json
{
  "total": 1,
  "data": [
    {
      "id": 17669,
      "numero_documento": "FAC-PDF-001",
      "url_archivo": "https://storage.gestor.muvail.com/archivos/FAC_PDF_001_1790094200.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=86400&X-Amz-Signature=<firma>",
      "permalink": "https://gestor.muvail.com/api/files/archivos/FAC_PDF_001_1790094200.pdf"
    }
  ]
}
```
