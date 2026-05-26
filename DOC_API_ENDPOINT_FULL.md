# Documentación: Endpoint Avanzado de Sincronización (/full)

Este documento detalla el uso del endpoint `/documents/full`, una **reversión avanzada y extendida** del endpoint original `/documents`, diseñado específicamente para la integración profunda y sincronización de datos con ERPs externos.

---

## Información General

* **URL del Endpoint:** `/api/v1/documents/full`
* **Método HTTP:** `GET`
* **Content-Type:** `application/json`
* **Autenticación:** Requiere la cabecera `X-Api-Key` con el token SHA-256 provisto por el sistema (Ej: `muvail_abcdef1234567890`).

### Diferencias Clave: `/documents` vs `/documents/full`

El endpoint original (`/documents`) fue pensado para alimentar vistas simples e interfaces de usuario (listas planas, datos resumidos). Este nuevo endpoint (`/full`) expande radicalmente esa capacidad:

1. **Estructura Profunda (Anidada):** Mientras el original devuelve una lista plana, el `/full` trae el documento principal y **todas sus relaciones** embebidas en el mismo JSON: entidades emisoras/receptoras, líneas de detalle, impuestos desglosados, archivos físicos asociados, incidencias pendientes y resultados del health check matemático. Todo en una sola llamada de red.
2. **Nuevos Parámetros de Filtrado:** Se incorporaron parámetros de consulta (`trimestre`, `año`, `incluir_incidencias`, `incluir_sin_verificar`, etc.) para permitirle al ERP consumir exactamente la porción de la contabilidad que necesita procesar, sin traer basura ni datos en estado de borrador.
3. **Cero Múltiples Consultas:** Al incluir toda la meta-data junta, evita el clásico problema de "N+1 queries" donde el ERP debía consultar primero la lista de facturas, y luego llamar a un endpoint por cada factura para ver sus impuestos o líneas de detalle.

---

## 1. Parámetros de Consulta (Filtros)

Podés enviar estos parámetros opcionales en la URL para filtrar los resultados. Si no enviás ninguno, el endpoint devolverá el historial completo de la empresa.

| Parámetro | Tipo | Default | Descripción |
| :--- | :--- | :--- | :--- |
| `trimestre` | `number` | — | Filtra por trimestre fiscal. Valores permitidos: `1`, `2`, `3`, `4`. |
| `año` | `number` | — | Filtra por año específico. Ej: `2024`, `2025`. |
| `tipo` | `string` | `"todas"` | Sentido del documento. Opciones: `"emitidas"` (facturas de venta), `"recibidas"` (facturas de compra/gastos), o `"todas"`. |
| `proveedor` | `string` | — | Busca coincidencias parciales en el nombre o identificador fiscal (CIF/CUIT) del **emisor** de la factura. |
| `cliente` | `string` | — | Busca coincidencias parciales en el nombre o identificador fiscal (CIF/CUIT) del **receptor** de la factura. |
| `incluir_incidencias` | `boolean` | `false` | Por defecto se **ocultan** los documentos que tienen incidencias pendientes de resolución manual. Pasar `true` para listarlos. |
| `incluir_sin_verificar` | `boolean` | `false` | Por defecto se **ocultan** los documentos que fallaron el Health Check matemático (Base + IVA ≠ Total). Pasar `true` para listarlos. |
| `incluir_sin_confirmar` | `boolean` | `false` | Por defecto se **ocultan** los borradores o documentos que el sistema marcó temporalmente como "(sin confirmar)". Pasar `true` para incluirlos. |

---

## 2. Ejemplos de Invocación (cURL)

### Ejemplo Básico (Obtener todo lo verificable)
```bash
curl -X GET "https://[tu-dominio.com]/api/v1/documents/full" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json"
```

### Ejemplo Avanzado (Con Filtros)
Obtener facturas de venta (emitidas) del primer trimestre de 2026, incluyendo aquellas que tengan descuadres o incidencias.
```bash
curl -G "https://[tu-dominio.com]/api/v1/documents/full" \
     -H "X-Api-Key: muvail_tu_clave_secreta_aqui" \
     -H "Accept: application/json" \
     --data-urlencode "año=2026" \
     --data-urlencode "trimestre=1" \
     --data-urlencode "tipo=emitidas" \
     --data-urlencode "incluir_incidencias=true" \
     --data-urlencode "incluir_sin_verificar=true"
```

---

## 3. Estructura de la Respuesta

La respuesta siempre será un JSON con un array `data` que contiene los documentos.

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
      "año": 2026,
      "trimestre": 1,
      "is_issued": true,
      "trimestre_cerrado": false,
      "enviado_sii": false,
      "canal_carga": "correo",
      "url_archivo": "https://minio.dominio.com/bucket/archivos/factura.pdf",
      "entidades": {
        "emisor": {
          "id": 150,
          "nombre": "VALENTIA ALIMENTACIÓN S.L.",
          "identificador_fiscal": "B12345678",
          "direccion": "Polígono Industrial, S/N",
          "cuenta_contable": "40000001"
        }
      },
      "impuestos": [
        {
          "tipo_impuesto": "IVA_GENERAL",
          "porcentaje": 21.00,
          "base_imponible": 13685.76,
          "cuota": 2874.01,
          "total_con_impuesto": 16559.77
        }
      ],
      "lineas_detalle": [
        {
          "codigo": "ALB-105",
          "descripcion": "ALBARAN 105, 24 MARZO",
          "cantidad": 1.00,
          "precio_unitario": 13685.76,
          "descuento_porcentaje": 0.00,
          "importe_linea": 13685.76,
          "cuenta_contable": "62900000"
        }
      ],
      "archivos": [
        {
          "nombre_archivo": "factura.pdf",
          "tipo_archivo": "application/pdf",
          "url_archivo": "https://minio.dominio.com/bucket/archivos/factura.pdf"
        }
      ],
      "incidencias": [],
      "health_check": {
        "verified": true,
        "check_type": "MISMATCH_MATEMATICO",
        "motivo": null
      }
    }
  ]
}
```

---

## 4. Diccionario de Datos

| Campo | Descripción |
| :--- | :--- |
| `id` | ID numérico interno del documento en el Gestor. |
| `file_hash` | Hash SHA-256 único del archivo procesado. Ideal para prevenir ingestiones duplicadas en el ERP. |
| `tipo_documento` | Clasificación literal detectada por el OCR (ej: `"FACTURA RECIBIDA"`, `"FACTURA EMITIDA"`, `"ABONO"`). |
| `numero_documento` | Número de serie/factura (ej: `"F-2024/001"`). |
| `fecha_emision` | Fecha de emisión en formato `YYYY-MM-DD`. |
| `fecha_vencimiento` | Fecha límite de pago (`null` si el documento no la posee). |
| `importe_total` | Total contable a pagar (incluye todos los impuestos, recargos y retenciones). |
| `importe_sin_impuestos` | Base imponible pura total del documento. |
| `moneda` | Código de moneda estándar ISO (ej: `"EUR"`, `"USD"`, `"ARS"`). |
| `año` / `trimestre` | Ejercicio fiscal y trimestre al que pertenece el documento. |
| `is_issued` | Booleano (`true` o `false`). Indica el sentido de la factura. `true` = Emitida por tu empresa; `false` = Recibida (Gasto/Compra). |
| `trimestre_cerrado` | Si es `true`, el documento no puede sufrir más modificaciones dentro del Gestor porque su período fiscal fue cerrado. |
| `enviado_sii` | Si es `true`, la factura ya fue reportada al Suministro Inmediato de Información. |
| `canal_carga` | Origen del documento (`"correo"`, `"manual"`, `"webhook"`, etc.). |
| `url_archivo` | Enlace público directo al PDF original almacenado en el bucket. |
| `entidades` | Objeto indexado por el rol de la entidad (`emisor`, `receptor`, `proveedor`, `cliente`). Contiene el `cif` (`identificador_fiscal`) y `cuenta_contable` vitales para el asiendo del ERP. |
| `lineas_detalle` | Array con cada una de las líneas o productos facturados (descripción, precio, cantidades y cuenta contable específica). |
| `archivos` | Lista de todos los archivos asociados al registro (puede incluir el XML estructurado adjunto, no solo el PDF). |
| `incidencias` | Lista de alertas resolutivas. Si pediste `incluir_incidencias=true`, acá verás el detalle de por qué el documento está retenido o si fue aprobado forzadamente. |
| `health_check` | Resultados de la validación matemática. `verified: true` significa que las sumatorias de líneas y bases cuadran. |

---

## 5. Reglas Críticas para la Contabilidad: El Array `impuestos[]`

El Gestor Documental almacena los impuestos en crudo, exactamente como se extrajeron del documento, en una única tabla (`impuestos_documento`).

El array de respuesta `impuestos[]` **mezcla diferentes categorías fiscales**. El ERP consumidor es responsable de leer el campo `tipo_impuesto` de cada fila para asentar la cuenta correcta.

### Cómo procesar los valores:

1. **IVA Puro (El estándar):**
   * **Identificación:** El `tipo_impuesto` **NO** contiene la palabra `"RECARGO"`, `"RETENCION"` ni `"IRPF"`. (Ej: `"IVA"`, `"IVA_GENERAL"`).
   * **Comportamiento:** Se suma a la base imponible.

2. **Recargos de Equivalencia:**
   * **Identificación:** El `tipo_impuesto` contiene la palabra `"RECARGO"` o `"EQUIVALENCIA"`.
   * **Comportamiento:** La `cuota` se recibe como un valor **positivo**. Se suma a la base imponible y al IVA.

3. **Retenciones (IRPF, Garantías):**
   * **Identificación:** El `tipo_impuesto` contiene la palabra `"RETENCION"` o `"IRPF"`.
   * **Comportamiento:** La `cuota` se recibe como un valor **negativo** (Ej: `-150.00`). Debe restarse al calcular el subtotal a pagar, pero registrarse en la cuenta de pasivo/activo correspondiente en el ERP.

#### Fórmula de Validación:
Para comprobar que estás parseando bien la información, el cálculo en tu código debe satisfacer la siguiente ecuación:

`importe_total = importe_sin_impuestos + Suma(IVA Puro) + Suma(Recargos) + Suma(Retenciones_Que_Ya_Vienen_Negativas)`

> **Nota para integraciones simplificadas:**
> Si tu ERP no necesita el desglose detallado línea por línea de los productos y solo busca asentar el total consolidado (IVA Total, Recargo Total, Retención Total) de forma ya procesada, recomendamos utilizar el endpoint `/api/v1/analytics`, el cual realiza las exclusiones por detrás y entrega las métricas consolidadas.
