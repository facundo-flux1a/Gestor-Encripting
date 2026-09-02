# 📗 Guía de Integración & Especificación Técnica: API v1 de Ingestión de Documentos (`POST /api/v1/documents`)

Esta es la guía oficial y exhaustiva para la **ingesta directa y síncrona de documentos** (facturas emitidas, facturas recibidas, abonos/rectificativas y documentos no facturables/justificantes) en **Muvail Systems** a través del endpoint `POST /api/v1/documents`.

---

## 📑 Tabla de Contenidos

1. [Arquitectura & Principios de Ingesta](#-arquitectura--principios-de-ingesta)
2. [Autenticación & Headers](#-autenticación--headers)
3. [Mecanismo de Idempotencia y Actualización](#-mecanismo-de-idempotencia-y-actualización)
4. [Tratamiento de Archivos Adjuntos (PDF, PNG, JPG, XLSX, CSV)](#-tratamiento-de-archivos-adjuntos)
5. [Desglose Exhaustivo de Campos del Payload JSON](#-desglose-exhaustivo-de-campos-del-payload-json)
   - [Clasificación de Flujo (`is_issued`)](#clasificación-de-flujo-is_issued)
   - [Tratamiento de Descuento Global (`descuento_global`)](#tratamiento-de-descuento-global-descuento_global)
   - [Operaciones No Sujetas o Exentas (`base_no_sujeta`)](#operaciones-no-sujetas-o-exentas-base_no_sujeta)
   - [Abonos y Facturas Rectificativas](#abonos-y-facturas-rectificativas)
   - [Documentos No Facturables / Justificantes ("Otros")](#documentos-no-facturables--justificantes-otros)
6. [Payload Maestro JSON (Lote de Producción Multi-Documento)](#-payload-maestro-json-lote-de-producción-multi-documento)
7. [Respuesta HTTP y Manejo de Errores](#-respuesta-http-y-manejo-de-errores)
8. [Observabilidad y Trazabilidad en la UI](#-observabilidad-y-trazabilidad-en-la-ui)
9. [📖 Glosario de Términos Integradores](#-glosario-de-términos-integradores)

---

## 🏛️ Arquitectura & Principios de Ingesta

La API v1 de Muvail Systems permite a ERPs, sistemas contables y plataformas de terceros enviar documentos fiscales y contables directamente formateados en JSON, evitando la incertidumbre del procesamiento OCR o la extracción por IA.

### Principios Fundamentales:

1. **Fidelidad a Origen**: Los importes, desgloses de impuestos (IVA/IRPF), retenciones y líneas ingresados se almacenan exactamente según lo especificado en el JSON.
2. **Capacidad de Lote**: Cada solicitud HTTP puede enviar un array `documentos` con hasta **50 documentos** por llamada.
3. **Ingesta Síncrona**: El servidor procesa el lote, descarga y almacena los archivos binarios adjuntos si existen, realiza los cálculos de trimestre contable y responde en una única transacción HTTP.

---

## 🔑 Autenticación & Headers

Todas las solicitudes deben incluir la clave de API asignada a la empresa en la cabecera `X-Api-Key`.

```http
POST /api/v1/documents HTTP/1.1
Host: gestor.muvail.com
X-Api-Key: flux_live_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

- **Respuesta en caso de error de autenticación**: `401 Unauthorized`.

---

## 🔄 Mecanismo de Idempotencia y Actualización

Para prevenir la duplicación de registros cuando un sistema externo reintenta una llamada o actualiza una factura en origen, el backend genera internamente una clave única de referencia externa:

$$\text{ref\_externa} = \text{CIF\_EMISOR} + "::" + \text{SERIE} + "::" + \text{NUMERO}$$

### Comportamiento del Servidor:

- **Si el documento NO existe**: Se inserta un nuevo registro en la base de datos y se registra en la cola de actividad con `step: 'Guardado'`.
- **Si el documento YA existe**: Se ejecuta un reemplazo atómico transaccional en Prisma. Se eliminan las relaciones previas (líneas, impuestos, entidades, archivo) y se reinsertan los datos actualizados. La cola de actividad registra `step: 'Actualizado'`.

---

## 📁 Tratamiento de Archivos Adjuntos

Si el objeto del documento incluye la propiedad opcional `url_archivo`:

1. **Descarga Directa**: El servidor realiza una petición HTTP síncrona para obtener el binario (tiempo límite de 10 segundos).
2. **Autenticación en Descarga**: Si la URL requiere credenciales, se proporciona el objeto `url_archivo_auth` (admite `bearer`, `basic` o `header` personalizado).
3. **Detección Binaria de Tipo MIME (_Magic Bytes_)**: El backend inspecciona la firma binaria del archivo y la cabecera HTTP devuelta para clasificar el tipo de archivo real (`pdf`, `png`, `jpg`, `webp`, `xlsx`, `csv`).
4. **Almacenamiento Persistente**: El archivo se sube a MinIO/S3 con el `Content-Type` adecuado (`application/pdf`, `image/png`, etc.), lo que permite que el panel de previsualización en la aplicación web renderice directamente la imagen o el PDF sin forzar descargas en el navegador.

---

## 🔍 Desglose Exhaustivo de Campos del Payload JSON

| Campo                       | Tipo      | Requerido | Descripción & Regla de Negocio                                                                                                                             |
| :-------------------------- | :-------- | :-------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numero_documento`          | `string`  |  **Sí**   | Número identificador oficial del documento (ej. `F-2026-001`). Parte fundamental de la idempotencia.                                                       |
| `serie`                     | `string`  |    No     | Serie o prefijo del documento (ej. `F2026`, `REC`). Si se omite, se asume vacía `""`.                                                                      |
| `fecha_emision`             | `string`  |  **Sí**   | Fecha de emisión (`YYYY-MM-DD` o ISO 8601). Determina automáticamente el trimestre contable (`Q1`, `Q2`, `Q3`, `Q4`).                                      |
| `fecha_vencimiento`         | `string`  |    No     | Fecha límite de cobro/pago (`YYYY-MM-DD`).                                                                                                                 |
| `is_issued`                 | `boolean` |    No     | **Dirección del documento**. `true` = Emitida (Venta), `false` = Recibida (Gasto). Ver detalle abajo.                                                      |
| `moneda`                    | `string`  |    No     | Código ISO de la divisa (`EUR` por defecto).                                                                                                               |
| `descuento_global`          | `number`  |    No     | Descuento comercial aplicado de forma general sobre la base imponible total.                                                                               |
| `base_no_sujeta`            | `number`  |    No     | Importe de operaciones exentas de IVA o no sujetas a tributación.                                                                                          |
| `importe_sin_impuestos`     | `number`  |  **Sí**   | Suma total de las bases imponibles del documento.                                                                                                          |
| `importe_total`             | `number`  |  **Sí**   | Importe total del documento ($Total = Base + IVA - IRPF$).                                                                                                 |
| `observaciones`             | `string`  |    No     | Notas aclaratorias o texto libre asociado al documento.                                                                                                    |
| `url_archivo`               | `string`  |    No     | URL remota del documento adjunto (PDF, PNG, JPG, XLSX, CSV).                                                                                               |
| `url_archivo_auth`          | `object`  |    No     | Configuración de autenticación para descargar el archivo (`tipo`, `token`, `header_name`, `header_value`).                                                 |
| `entidades`                 | `object`  |    No     | Contiene `emisor` y `cliente` con sus datos fiscales (`nombre`, `cif`, `direccion`, `email`, `telefono`).                                                  |
| `impuestos`                 | `array`   |    No     | Lista de desglose impositivo (`tipo_impuesto`/`tipo`, `porcentaje`, `base`/`base_imponible`, `cuota`).                                                     |
| `lineas` / `lineas_detalle` | `array`   |    No     | Detalle de conceptos (`codigo_proveedor`/`codigo`, `descripcion`, `cantidad`, `precio_unitario`, `descuento_porcentaje`, `importe_total`/`importe_linea`). |

---

### Clasificación de Flujo (`is_issued`)

A diferencia de los paneles de consulta, el payload de carga por API **no requiere una cadena textual de "tipo de documento"**. El tipo y dirección contable del documento se controlan mediante el flag booleano `is_issued`:

- **`is_issued: true` (o si se omite)**:
  - El documento se registra como **FACTURA EMITIDA** (Factura de venta o ingreso).
  - La entidad enviada en `entidades.emisor` corresponde a la **propia empresa**.
  - La entidad enviada en `entidades.cliente` se guarda con el rol de **Cliente / Comprador**.

- **`is_issued: false`**:
  - El documento se registra como **FACTURA RECIBIDA** (Factura de gasto o compra).
  - La entidad enviada en `entidades.emisor` se guarda con el rol de **Proveedor / Vendedor**.
  - La entidad enviada en `entidades.cliente` corresponde a la **propia empresa**.

---

### Tratamiento de Descuento Global (`descuento_global`)

El campo `descuento_global` representa un bonificación o descuento comercial general que aplica a todo el documento por fuera del desglose individual de las líneas.

- Se especifica en la raíz del documento como un valor numérico positivo.
- Se guarda de forma transparente en los metadatos `datos_extra.descuento_global`.

---

### Operaciones No Sujetas o Exentas (`base_no_sujeta`)

Para operaciones comerciales que no generan cuota de IVA (por ejemplo, exportaciones, operaciones intracomunitarias exentas o servicios no sujetos a IVA):

- Se indica el importe numérico en el campo `base_no_sujeta`.
- No requiere incluir un bloque con `porcentaje: 0` dentro del array `impuestos`, aunque puede combinarse con impuestos normales si el documento contiene tramos mixtos.

---

### Abonos y Facturas Rectificativas

Los abonos, devoluciones o facturas rectificativas emitidas/recibidas se ingresan manteniendo la misma estructura JSON, aplicando **importes en negativo**:

- `importe_sin_impuestos` e `importe_total` se envían con signo negativo (ej. `-500.00`).
- Las cuotas y bases imponibles dentro de `impuestos` y las líneas en `lineas` se envían igualmente en negativo.
- La serie suele identificar la condición de abono/rectificativa (ej. `serie: "REC-2026"` o `serie: "ABONO"`).

> [!IMPORTANT]
> **Excepción — Retención IRPF en abonos**: Si el abono lleva retención de IRPF, la cuota de IRPF **sí debe enviarse en positivo**, aunque el resto de importes sean negativos. La lógica contable de abonos invierte el signo de IVA pero la retención actúa como una recuperación (el pagador devuelve lo retenido), por lo que su cuota es positiva

---

### Documentos No Facturables / Justificantes ("Otros")

Para registrar comprobantes de pago, albaranes, recibos de caja o tiques que no constituyen una factura formal con desglose impositivo:

- El array `impuestos` se envía vacío `[]` (o se omite).
- Se especifica el importe en `base_no_sujeta` con el total del documento.
- **`importe_sin_impuestos` debe enviarse como `0.00`** cuando todo el importe es base no sujeta. La validación de cuadre del gestor utiliza la fórmula `importe_sin_impuestos + base_no_sujeta + cuotas_IVA = importe_total`, por lo que ambos campos son **aditivos**, no sinónimos. Si se envía el mismo valor en los dos, el sistema detectará un descuadre.

---

## 📦 Payload Maestro JSON (Lote de Producción Multi-Documento)

A continuación se presenta un **ejemplo completo y funcional de llamada batch (`POST /api/v1/documents`)** que incluye un lote de 5 documentos cubriendo todos los casos de uso:

```json
{
  "documentos": [
    {
      "numero_documento": "F-2026-00892",
      "serie": "F2026",
      "fecha_emision": "2026-09-01",
      "fecha_vencimiento": "2026-10-01",
      "is_issued": true,
      "moneda": "EUR",
      "forma_pago": "TRANSFERENCIA_BANCARIA",
      "observaciones": "Desarrollo de software y consultoría API v1",
      "importe_sin_impuestos": 1000.0,
      "importe_total": 1060.0,
      "url_archivo": "https://gestor.muvail.com/archivos/factura-892.pdf",
      "entidades": {
        "emisor": {
          "nombre": "Muvail Systems S.L.",
          "cif": "B25926494",
          "direccion": "Calle Gran Vía 45, Madrid",
          "email": "facturacion@muvail.com"
        },
        "cliente": {
          "nombre": "Cliente Ejemplo S.A.",
          "cif": "A87654321",
          "direccion": "Av. Diagonal 123, Barcelona",
          "email": "admin@clienteejemplo.com"
        }
      },
      "impuestos": [
        { "tipo": "IVA", "porcentaje": 21.0, "base": 1000.0, "cuota": 210.0 },
        { "tipo": "IRPF", "porcentaje": 15.0, "base": 1000.0, "cuota": 150.0 }
      ],
      "lineas": [
        {
          "codigo_proveedor": "DEV-01",
          "descripcion": "Consultoría y Desarrollo Fullstack API v1",
          "cantidad": 10,
          "precio_unitario": 100.0,
          "descuento_porcentaje": 0,
          "precio_neto": 100.0,
          "importe_total": 1000.0
        }
      ]
    },
    {
      "numero_documento": "PROV-88412",
      "serie": "INV",
      "fecha_emision": "2026-08-28",
      "is_issued": false,
      "moneda": "EUR",
      "descuento_global": 50.0,
      "base_no_sujeta": 120.0,
      "importe_sin_impuestos": 950.0,
      "importe_total": 1109.5,
      "url_archivo": "https://gestor.muvail.com/archivos/invoices/PROV-88412.png",
      "url_archivo_auth": {
        "tipo": "bearer",
        "token": "secret_token_storage_12345"
      },
      "entidades": {
        "emisor": {
          "nombre": "Suministros Industriales Iberia S.L.",
          "cif": "B12345678",
          "direccion": "Polígono Industrial Norte, Nave 4, Valencia"
        },
        "cliente": {
          "nombre": "Muvail Systems S.L.",
          "cif": "B25926494"
        }
      },
      "impuestos": [
        { "tipo": "IVA", "porcentaje": 21.0, "base": 430.0, "cuota": 90.3 },
        { "tipo": "IVA", "porcentaje": 10.0, "base": 470.0, "cuota": 47.0 }
      ]
    },
    {
      "numero_documento": "REC-2026-0012",
      "serie": "RECT",
      "fecha_emision": "2026-09-02",
      "is_issued": true,
      "observaciones": "Abono de 2 licencias devueltas por el cliente",
      "importe_sin_impuestos": -200.0,
      "importe_total": -242.0,
      "entidades": {
        "emisor": { "nombre": "Muvail Systems S.L.", "cif": "B25926494" },
        "cliente": { "nombre": "Cliente Ejemplo S.A.", "cif": "A87654321" }
      },
      "impuestos": [
        { "tipo": "IVA", "porcentaje": 21.0, "base": -200.0, "cuota": -42.0 }
      ],
      "lineas": [
        {
          "descripcion": "Devolución Licencias Software",
          "cantidad": 2,
          "precio_unitario": -100.0,
          "importe_total": -200.0
        }
      ]
    },
    {
      "numero_documento": "TIQUET-9941",
      "fecha_emision": "2026-09-02",
      "is_issued": false,
      "observaciones": "Justificante de peaje y aparcamiento - Viaje comercial",
      "base_no_sujeta": 45.5,
      "importe_sin_impuestos": 0.0,
      "importe_total": 45.5,
      "url_archivo": "https://gestor.muvail.com/archivos/tiquets/TIQUET-9941.jpg",
      "entidades": {
        "emisor": {
          "nombre": "Aparcamientos Estación S.A.",
          "cif": "A99887766"
        },
        "cliente": { "nombre": "Muvail Systems S.L.", "cif": "B25926494" }
      },
      "impuestos": []
    },
    {
      "numero_documento": "F-2026-00893",
      "serie": "F2026",
      "fecha_emision": "2026-09-02",
      "is_issued": true,
      "importe_sin_impuestos": 500.0,
      "importe_total": 605.0,
      "entidades": {
        "emisor": { "nombre": "Muvail Systems S.L.", "cif": "B25926494" },
        "cliente": {
          "nombre": "Servicios Digitales Gomez S.L.",
          "cif": "B44556677"
        }
      },
      "impuestos": [
        { "tipo": "IVA", "porcentaje": 21.0, "base": 500.0, "cuota": 105.0 }
      ]
    }
  ]
}
```

---

## 📤 Respuesta HTTP y Manejo de Errores

El servidor procesa individualmente cada elemento del lote y devuelve un código HTTP `200 OK` con el resumen consolidado de la operación:

```json
{
  "mensaje": "Procesamiento de 5 documento(s) finalizado.",
  "resumen": {
    "total": 5,
    "exitosos": 5,
    "errores": 0
  },
  "resultados": [
    {
      "numero_documento": "F-2026-00892",
      "estado": "guardado",
      "id_documento": 16640,
      "tipo": "FACTURA EMITIDA"
    },
    {
      "numero_documento": "PROV-88412",
      "estado": "actualizado",
      "id_documento": 16635,
      "tipo": "FACTURA RECIBIDA"
    },
    {
      "numero_documento": "REC-2026-0012",
      "estado": "guardado",
      "id_documento": 16641,
      "tipo": "FACTURA EMITIDA"
    },
    {
      "numero_documento": "TIQUET-9941",
      "estado": "guardado",
      "id_documento": 16642,
      "tipo": "FACTURA RECIBIDA"
    },
    {
      "numero_documento": "F-2026-00893",
      "estado": "guardado",
      "id_documento": 16643,
      "tipo": "FACTURA EMITIDA"
    }
  ]
}
```

### Respuestas de Error Comunes:

- **HTTP `400 Bad Request`**:
  - Si el JSON enviado no es válido.
  - Si el array `documentos` está ausente o vacío.
  - Si el lote supera el límite máximo de **50 documentos**.
- **Errores por elemento en `resultados`**:
  - Si a un documento individual le falta `numero_documento` o `fecha_emision`, ese elemento reportará `"estado": "error"` con la causa detallada sin abortar el resto del lote.

---

## 🎨 Observabilidad y Trazabilidad en la UI

Todos los documentos cargados a través de esta API reciben automáticamente el atributo `canal_origen: 'api'` en la base de datos. Esto activa de forma transparente:

1. **Badge Verde `API`**: En la tabla principal de documentos (`DocumentsTable`), en el detalle de la factura (`ReviewInvoiceLayout`) y en la vista auditora (`AuditSplitView`).
2. **Notificación de Actividad**: En el panel de estado de subidas, el evento reflejará el paso exacto (`"Guardado"` para nuevos registros o `"Actualizado"` para reemplazos idempotentes).

---

## 📖 Glosario de Términos Integradores

- **Idempotencia**: Garantía de que múltiples peticiones idénticas no generen registros duplicados en la base de datos.
- **Ref Externa (`ref_externa`)**: Identificador único interno generado concatenando `CIF_EMISOR::SERIE::NUMERO`. Se almacena dentro de la columna JSON `datos_extra.ref_externa` de la tabla `documentos`. La `serie` **no tiene columna propia** en el esquema de la tabla; vive exclusivamente como el segmento del medio de esta cadena.
- **is_issued**: Booleano que define si el documento es emitido (`true`) o recibido (`false`).
- **Descuento Global**: Bonificación económica aplicada sobre la suma total de las bases imponibles del documento. Se persiste en `datos_extra.descuento_global`.
- **Base No Sujeta**: Parte del importe comercial exenta de tributación indirecta (exenta de IVA). Se persiste en `datos_extra.base_no_sujeta`.
