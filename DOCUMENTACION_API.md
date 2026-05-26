# Documentación de la API de Gestor Documental

Esta documentación proporciona los detalles necesarios para integrar sistemas externos (ERPs, CRMs, herramientas de BI) con la plataforma del Gestor Documental a través de nuestra API REST v1.

---

## 1. Autenticación (API Keys)

Todas las llamadas a la API requieren de un **Token de Autenticación** (API Key). Esta clave asegura que tu integración solo tenga acceso a los datos de la empresa para la que fue generada.

### ¿Cómo generar una API Key?
1. Inicia sesión en el panel principal (Dashboard) del Gestor Documental.
2. Ve a la sección de **Configuración** o **Ajustes** en el menú de navegación.
3. Desplázate hacia abajo hasta encontrar el apartado **Seguridad > Integración API**.
4. Haz clic en el botón **+ Nueva Clave**.
5. Asigna un nombre descriptivo a tu clave (por ejemplo: *"Conexión a mi ERP contable"*) y confirma.
6. **¡Importante!** Copia el token que aparece en pantalla (`muvail_...`). Por razones de seguridad, **el token completo solo se mostrará esta única vez**. Si lo pierdes, deberás revocar la clave y generar una nueva.

### ¿Cómo enviar la API Key en tus peticiones?
Debes incluir la clave en los **headers** (cabeceras) de tus peticiones HTTP usando la propiedad `X-Api-Key`.

**Ejemplo de Header:**
```http
X-Api-Key: muvail_aBcD1234efGh5678...
```

---

## 2. Endpoints Disponibles Actualmente

### 🟢 Generación de Reporte Excel
Exporta un reporte detallado de los documentos procesados (facturas, abonos) junto con su resumen de IVA, calculado y consolidado en un archivo Microsoft Excel (`.xlsx`).

* **URL:** `/api/v1/export/excel`
* **Método:** `POST`
* **Content-Type:** `application/json`

#### Parámetros del Body (Filtros)
Todos los parámetros son **opcionales**. Si envías un JSON vacío `{}`, la API exportará todo el historial de documentos de la empresa vinculada a la API Key.

| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del proveedor/emisor. |
| `cliente` | `string` | Busca coincidencias en nombre o CIF del cliente/receptor. |
| `tipo` | `string` | `"emitidas"`, `"recibidas"` o `"todas"`. (Default: `"todas"`). |

#### Ejemplo de Petición (cURL)
```bash
curl -X POST "https://[tu-dominio]/api/v1/export/excel" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Content-Type: application/json" \
     -d '{
           "año": 2024,
           "trimestre": 3,
           "tipo": "recibidas"
         }' --output "Reporte_Trimestre3.xlsx"
```

#### Respuesta
* **Éxito (200 OK):** La API devolverá un binario (archivo Excel) con cabecera `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
* **Error (401 Unauthorized):** Si falta la API Key o es inválida/revocada.
* **Error (404 Not Found):** Si no hay documentos que coincidan con los filtros aplicados.

---

## 3. Consulta de Documentos
Extrae un listado estructurado en JSON de los documentos procesados (facturas, abonos, etc.), ideal para sincronizar bases de datos externas.

* **URL:** `/api/v1/documents`
* **Método:** `GET`
* **Content-Type:** `application/json`

#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del proveedor. |
| `cliente` | `string` | Busca coincidencias en nombre o CIF del cliente. |
| `tipo` | `string` | `"emitidas"`, `"recibidas"` o `"todas"`. |

#### Ejemplo de Petición (cURL)
```bash
curl -X GET "https://[tu-dominio]/api/v1/documents?trimestre=3&año=2024" \
     -H "X-Api-Key: muvail_tu_clave"
```

#### Respuesta
```json
{
  "data": [
    {
      "id_documento": 140,
      "numero_documento": "A-0014",
      "tipo_documento": "Factura",
      "fecha_emision": "2024-08-15",
      "importe_total": 5400.00,
      "url_archivo": "https://minio.allbase.com.ar/gestor-documental/factura_A0014.pdf",
      "proveedores": [
        { "nombre": "Corralón Sur", "identificador_fiscal": "30-12345678-9" }
      ],
      "impuestos": [
        { "tipo_impuesto": "IVA", "porcentaje": 21, "base_imponible": 4462.80, "cuota": 937.20 }
      ],
      "lineas_detalle": [
        { "descripcion": "Cemento Portland", "cantidad": 50, "precio_unitario": 89.25, "importe_linea": 4462.80 }
      ]
    }
  ]
}
```

> **⚠️ Importante — Array `impuestos[]` en este endpoint:**
> El array `impuestos[]` de `/api/v1/documents` es un **volcado sin filtrar** de la tabla `impuestos_documento`. Contiene **todos los tipos de impuesto** del documento: IVA puro, Recargos de Equivalencia y Retenciones/IRPF mezclados.
>
> Para procesar correctamente en tu ERP deberás discriminar por `tipo_impuesto`:
> - **IVA puro** → filas donde `tipo_impuesto` **NO** contiene `"RECARGO"`, `"RETENCION"` ni `"IRPF"`.
> - **Recargo de Equivalencia** → filas con `tipo_impuesto` que contiene `"RECARGO"` o `"EQUIVALENCIA"`. La `cuota` se almacena con **signo positivo**.
> - **Retenciones / IRPF** → filas con `tipo_impuesto` que contiene `"RETENCION"` o `"IRPF"`. La `cuota` se almacena con **signo negativo** (ej: `-142.50`).
>
> Fórmula correcta para obtener el total real: `Total = Base + IVA_puro + Recargo - ABS(Retencion)`
>
> Si preferís recibir los impuestos ya calculados y separados, utilizá el endpoint `/api/v1/analytics` que devuelve los campos `iva_repercutido`, `recargo_repercutido` y `retencion_repercutido` ya discriminados.

---

## 3.1 Consulta Unificada de Documentos Completos (Recomendado para Sincronización)
Extrae un volcado completo con toda la información disponible en la base de datos (incluyendo hash de archivo original, cuentas contables a nivel de entidad y de línea de producto, descuentos, incidencias de validación y estado del health check).

* **URL:** `/api/v1/documents/full`
* **Método:** `GET`
* **Content-Type:** `application/json`

#### Parámetros Query (Filtros e Inclusiones Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del emisor. |
| `cliente` | `string` | Busca coincidencias en nombre o CIF del receptor. |
| `tipo` | `string` | `"emitidas"`, `"recibidas"` o `"todas"`. |
| `incluir_incidencias` | `boolean` | `true` para incluir documentos con incidencias pendientes (por defecto `false`, los oculta). |
| `incluir_sin_verificar` | `boolean` | `true` para incluir documentos que fallaron en el health check de descuadre (por defecto `false`, los oculta). |
| `incluir_sin_confirmar` | `boolean` | `true` para incluir borradores y facturas marcadas como "(sin confirmar)" (por defecto `false`). |

#### Ejemplo de Petición (cURL)
```bash
curl -X GET "https://[tu-dominio]/api/v1/documents/full?incluir_incidencias=true&incluir_sin_verificar=true" \
     -H "X-Api-Key: muvail_tu_clave"
```

#### Respuesta
```json
{
  "total": 1,
  "data": [
    {
      "id": 2564,
      "file_hash": "62b7cf537b...",
      "tipo_documento": "FACTURA EMITIDA",
      "numero_documento": "2/108",
      "fecha_emision": "2026-03-26",
      "fecha_vencimiento": "2026-04-26",
      "importe_total": 16559.77,
      "importe_sin_impuestos": 13685.76,
      "moneda": "EUR",
      "observaciones": null,
      "datos_extra": null,
      "fecha_creacion": "2026-03-26T12:00:00.000Z",
      "id_de_empresa": 11,
      "is_new": 0,
      "trimestre_cerrado": false,
      "enviado_sii": false,
      "fecha_cierre_trimestre": null,
      "año": 2026,
      "trimestre": 1,
      "canal_carga": "correo",
      "is_issued": true,
      "url_archivo": "https://minio.allbase.com.ar/gestor-documental/archivos/...",
      "entidades": {
        "emisor": {
          "id": 150,
          "nombre": "VALENTIA ALIMENTACIÓN S.L.",
          "identificador_fiscal": "B12345678",
          "direccion": "Polígono Industrial, S/N",
          "telefono": "960000000",
          "email": "facturas@valentia.com",
          "cuenta_contable": "40000001",
          "datos_extra": null,
          "fecha_creacion": "2026-03-26T12:00:00.000Z"
        }
      },
      "impuestos": [
        {
          "id": 845,
          "tipo_impuesto": "IVA_GENERAL",
          "porcentaje": 21.00,
          "base_imponible": 13685.76,
          "cuota": 2874.01,
          "total_con_impuesto": 16559.77,
          "fecha_creacion": "2026-03-26T12:00:00.000Z"
        }
      ],
      "lineas_detalle": [
        {
          "id": 9201,
          "codigo": "ALB-105",
          "descripcion": "ALBARAN 105, 24 MARZO",
          "cantidad": 1.00,
          "unidad": "ud",
          "precio_unitario": 13685.7600,
          "descuento_porcentaje": 0.00,
          "precio_neto": 13685.7600,
          "importe_linea": 13685.7600,
          "cuenta_contable": "62900000",
          "datos_extra": null,
          "fecha_creacion": "2026-03-26T12:00:00.000Z"
        }
      ],
      "archivos": [
        {
          "id": 5012,
          "tipo_archivo": "application/pdf",
          "nombre_archivo": "factura-valentia-2-108.pdf",
          "hash_archivo": "62b7cf537b...",
          "ruta_archivo": "archivos/factura-valentia-2-108.pdf",
          "fecha_subida": "2026-03-26T12:00:00.000Z",
          "url_archivo": "https://minio.allbase.com.ar/gestor-documental/archivos/..."
        }
      ],
      "incidencias": [],
      "health_check": {
        "verified": true,
        "created_at": "2026-04-30T16:42:02.000Z",
        "check_type": "MISMATCH_MATEMATICO",
        "motivo": null
      }
    }
  ]
}

#### Campos de la respuesta

Cada objeto del array `data[]` contiene:

| Campo | Descripción |
| :--- | :--- |
| `id` | ID interno del documento. |
| `file_hash` | Hash SHA-256 del archivo original. Permite detectar duplicados en el ERP. |
| `tipo_documento` | Tipo literal extraído por el OCR (ej: `"FACTURA RECIBIDA"`, `"ABONO EMITIDO"`). |
| `numero_documento` | Número de serie de la factura. |
| `fecha_emision` | Fecha de emisión (`YYYY-MM-DD`). |
| `fecha_vencimiento` | Fecha de vencimiento de pago (`null` si no aplica). |
| `importe_total` | Total del documento incluyendo todos los impuestos. |
| `importe_sin_impuestos` | Base imponible total (sin IVA, sin recargos, sin retenciones). |
| `moneda` | Código ISO de la moneda (ej: `"EUR"`). |
| `observaciones` | Notas del documento (`null` si no hay). |
| `datos_extra` | JSON libre con campos adicionales extraídos por el OCR (`null` si no hay). |
| `año` | Año fiscal del documento. |
| `trimestre` | Trimestre fiscal del documento (1–4). |
| `is_issued` | `true` si la empresa es **emisora**, `false` si es **receptora**. Se calcula comparando el CIF del emisor contra el CIF de la empresa. |
| `trimestre_cerrado` | `true` si el trimestre fue cerrado y bloqueado. |
| `enviado_sii` | `true` si fue marcado como enviado al SII. |
| `canal_carga` | Canal de ingreso del documento (`"correo"`, `"manual"`, `"webhook"`, etc.). |
| `url_archivo` | URL pública directa al archivo original (PDF/imagen). |
| `entidades` | Objeto indexado por `rol` (`emisor`, `receptor`, `proveedor`, etc.). Cada entidad incluye: `nombre`, `identificador_fiscal`, `direccion`, `telefono`, `email`, `cuenta_contable`, `datos_extra`. |
| `lineas_detalle` | Array de líneas. Cada línea incluye: `codigo`, `descripcion`, `cantidad`, `unidad`, `precio_unitario`, `descuento_porcentaje`, `precio_neto`, `importe_linea`, `cuenta_contable`. |
| `impuestos` | Array de impuestos **sin filtrar** (ver nota abajo). Cada fila: `tipo_impuesto`, `porcentaje`, `base_imponible`, `cuota`, `total_con_impuesto`. |
| `archivos` | Array de archivos con `nombre_archivo`, `hash_archivo`, `tipo_archivo`, `ruta_archivo`, `url_archivo`. |
| `incidencias` | Array de incidencias. Vacío si no tiene. Cada una incluye: `descripcion`, `validado`, `fecha_validacion`, `validado_por`, `observaciones_validacion`. |
| `health_check` | Estado del chequeo matemático: `{ verified, check_type, motivo }`. `null` si nunca fue verificado. |

> **⚠️ Importante — Array `impuestos[]` en este endpoint:**
> Es un volcado sin filtrar. Contiene **todos los tipos de impuesto mezclados**: IVA puro, Recargos de Equivalencia y Retenciones/IRPF.
>
> Para procesar correctamente en tu ERP, discriminá por `tipo_impuesto`:
> - **IVA puro** → filas donde `tipo_impuesto` **NO** contiene `"RECARGO"`, `"RETENCION"` ni `"IRPF"`.
> - **Recargo de Equivalencia** → `tipo_impuesto` contiene `"RECARGO"` o `"EQUIVALENCIA"`. La `cuota` es **positiva**.
> - **Retenciones / IRPF** → `tipo_impuesto` contiene `"RETENCION"` o `"IRPF"`. La `cuota` es **negativa** (ej: `-142.50`).
>
> Fórmula correcta para reconstruir el total: `Total = Base + IVA_puro + Recargo - ABS(Retencion)`
>
> Si solo necesitás los totales discriminados, usá `/api/v1/analytics` que devuelve `iva_repercutido`, `recargo_repercutido` y `retencion_repercutido` directamente.

---

## 4. Analíticas Financieras
Extrae métricas consolidadas sobre el rendimiento financiero y la salud contable de la empresa.

* **URL:** `/api/v1/analytics`
* **Método:** `GET`

#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |

#### Ejemplo de Petición (cURL)
```bash
curl -X GET "https://[tu-dominio]/api/v1/analytics?año=2024" \
     -H "X-Api-Key: muvail_tu_clave"
```

#### Respuesta
```json
{
  "metricas_financieras": {
    "total_ingresos": 120500.00,
    "total_gastos": 45000.50,
    "beneficio_neto": 75499.50,
    "iva_repercutido": 25305.00,
    "iva_soportado": 9450.10,
    "documentos_totales": 150
  },
  "health_check": {
    "score_salud_porcentaje": 98,
    "descuadres_matematicos": 1,
    "alertas_logicas": 0,
    "documentos_con_incidencias": []
  }
}
```

---

## 5. Historial de Productos
Extrae un histórico detallado línea por línea de todos los productos y servicios adquiridos, útil para cruzar precios de proveedores.

* **URL:** `/api/v1/products`
* **Método:** `GET`

#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `producto` | `string` | Busca coincidencias en la descripción del producto (ej: "cemento"). |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del proveedor. |

#### Ejemplo de Petición (cURL)
```bash
curl -X GET "https://[tu-dominio]/api/v1/products?producto=cemento" \
     -H "X-Api-Key: muvail_tu_clave"
```

---

## 6. Gestión de Incidencias
Permite listar las incidencias de validación de documentos y marcarlas como resueltas directamente desde el ERP externo. Solo se puede operar sobre incidencias de la empresa vinculada a la API Key.

### 6.1 Listar Incidencias

* **URL:** `/api/v1/incidents`
* **Método:** `GET`

#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `estado` | `string` | `pendientes` (default), `validadas`, `todas`. |
| `documento_id` | `number` | Filtra incidencias de un documento específico. |

#### Ejemplo de Petición (cURL)
```bash
curl -X GET "https://[tu-dominio]/api/v1/incidents?estado=pendientes" \
     -H "X-Api-Key: muvail_tu_clave"
```

#### Respuesta
```json
{
  "total": 2,
  "filtros": { "estado": "pendientes", "documento_id": "todos" },
  "data": [
    {
      "incidencia_id": 42,
      "documento_id": 195,
      "estado": "pendiente",
      "descripcion_incidencia": "Diferencia de 0.12€ entre total y base+IVA.",
      "validado_por": null,
      "fecha_validacion": null,
      "observaciones_validacion": null,
      "documento": {
        "tipo_documento": "FACTURA RECIBIDA",
        "numero_documento": "F-2024/0089",
        "fecha_emision": "2024-09-15",
        "importe_total": 1250.12,
        "importe_sin_impuestos": 1033.00,
        "moneda": "EUR",
        "entidad_nombre": "Proveedor S.A.",
        "entidad_cif": "B12345678",
        "verificado_matematicamente": false,
        "razon_descuadre": "Total no coincide con Base + IVA"
      }
    }
  ]
}
```

### 6.2 Validar (Resolver) una Incidencia

* **URL:** `/api/v1/incidents`
* **Método:** `POST`
* **Content-Type:** `application/json`

#### Body JSON
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `incidencia_id` | `number` | **Obligatorio.** ID de la incidencia a resolver (obtenido del `GET`). |
| `observaciones` | `string` | Opcional. Motivo de la aprobación para el registro. |
| `validado_por` | `string` | Opcional. Email o identificador del usuario que aprueba desde el ERP. |

#### Ejemplo de Petición (cURL)
```bash
curl -X POST "https://[tu-dominio]/api/v1/incidents" \
     -H "X-Api-Key: muvail_tu_clave" \
     -H "Content-Type: application/json" \
     -d '{
           "incidencia_id": 42,
           "observaciones": "Diferencia de 0.12€ aceptada. Redondeo del proveedor.",
           "validado_por": "contabilidad@miempresa.com"
         }'
```

#### Respuesta
```json
{
  "success": true,
  "incidencia_id": 42,
  "documento_id": 195,
  "estado": "validada",
  "validado_por": "contabilidad@miempresa.com",
  "fecha_validacion": "2026-05-26T15:00:00.000Z",
  "observaciones": "Diferencia de 0.12€ aceptada. Redondeo del proveedor."
}
```

#### Códigos de Error
| Código | Motivo |
| :--- | :--- |
| `400` | `incidencia_id` faltante o no es número. |
| `401` | API Key inválida o faltante. |
| `404` | La incidencia no existe o no pertenece a tu empresa. |
| `409` | La incidencia ya estaba validada previamente. |
