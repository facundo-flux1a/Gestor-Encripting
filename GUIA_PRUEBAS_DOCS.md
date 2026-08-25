# 📘 Guía de Pruebas: Endpoints de Documentos desde `/docs`

Esta guía te muestra paso a paso cómo probar los nuevos cambios en la API directamente desde la sección interactiva **/docs** de tu aplicación y qué respuesta exacta debes esperar.

---

## 🚀 Paso a Paso para Probar desde `/docs`

1. **Abre tu navegador** y entra en la ruta `/docs` (asegúrate de tener la sesión iniciada en el sistema).
2. **Selecciona tu API Key:**
   - En la parte superior de la página de documentación, verás el selector de **API Key** o la opción de generar/seleccionar una clave activa de tu empresa (ej: *Valentia Alimentación / Espais de Dunes*).
3. **Localiza el Endpoint:**
   - Desplázate hasta la sección **Documentos** (`GET /api/v1/documents` o `GET /api/v1/documents/full`).
4. **Configura los Parámetros de Prueba:**
   - **`desde_id`**: Escribe un ID numérico, por ejemplo `9484` o `8627`.
   - **`limit`**: (Opcional) Pon `5` o `10` para ver pocos resultados claros.
   - **`tipo`**: Deja `todas` (o selecciona `recibidas` / `emitidas`).
5. **Ejecuta la Consulta:**
   - Haz clic en el botón azul **"Probar Endpoint"** (o *"Enviar Petición"*).

---

## 🎯 Resultados Esperados: ¿Qué verificar en la respuesta JSON?

Cuando el endpoint responda, verás una respuesta JSON con código `200 OK`. Debes verificar estos **5 puntos clave**:

### 1. Semáforo Incremental (`desde_id` y orden)
- **Qué comprobar:** Todos los `id` de las facturas en el array `data` deben ser **estrictamente mayores** al `desde_id` que ingresaste.
- **Orden:** Los documentos deben venir ordenados ascendentemente por su `id` (por ejemplo: `9501`, `9502`, `9503`...).

### 2. Fecha de Actualización (`actualizado_en`)
- Cada elemento debe traer el campo `actualizado_en` con formato ISO 8601:
  ```json
  "actualizado_en": "2026-08-22T20:27:43.000Z"
  ```

### 3. Líneas de Detalle (`lineas_detalle`)
- En cada línea de la factura, verifica que:
  - `codigo_proveedor`: Viene con el código si existe (ej. `"ART-001"`) o `null`.
  - `importe_total`: Es la base imponible neta sin IVA de la línea.
  - `iva_porcentaje`: Viene con el tipo de IVA deducido (ej: `21`, `10`, `4` o `0`).
  - `iva_incluido`: Es `false`.

### 4. Datos del Proveedor y Cliente (`entidades`)
- Dentro de `entidades.proveedor` o `entidades.cliente`, los campos deben estar estructurados:
  - Si existen, vienen completos con `direccion`, `codigo_postal`, `poblacion`, `provincia`, `telefono`, `email`, `iban`.
  - Si un dato no estaba en el papel, **debe ser `null`** (nunca `""` ni `0`).

### 5. Enlace del PDF Limpio (`url_archivo`)
- `url_archivo` debe ser un enlace limpio y funcional, por ejemplo:
  ```
  https://minio.allbase.com.ar/gestor-documental/doc_upload_1787419421881_19fea8e1cd_doc_2ab0076d.pdf
  ```
  *(Verifica que **NO** tenga `https://minio...` repetido dos veces).*

---

## 📦 Ejemplo de Respuesta JSON Completa Esperada

```json
{
  "total": 2,
  "data": [
    {
      "id": 9501,
      "numero_documento": "REC-2026-0105",
      "tipo_documento": "FACTURA RECIBIDA",
      "fecha_emision": "2026-05-15T03:00:00.000Z",
      "fecha_vencimiento": null,
      "actualizado_en": "2026-08-22T20:27:43.000Z",
      "importe_total": 605.00,
      "importe_sin_impuestos": 500.00,
      "moneda": "EUR",
      "observaciones": null,
      "trimestre": 2,
      "año": 2026,
      "retencion": 0,
      "is_issued": false,
      "url_archivo": "https://minio.allbase.com.ar/gestor-documental/doc_upload_1787419421881_19fea8e1cd_doc_2ab0076d.pdf",
      "entidades": {
        "proveedor": {
          "nombre": "Distribuciones Mediterráneo S.L.",
          "cif": "B46345678",
          "direccion": "Pol. Ind. Fuente del Jarro, 46988 Paterna",
          "codigo_postal": "46988",
          "poblacion": "Paterna",
          "provincia": "Valencia",
          "telefono": null,
          "email": null,
          "iban": null
        },
        "receptor": {
          "nombre": "ESPAIS DE DUNES S.L.",
          "cif": "B97376321",
          "direccion": null,
          "codigo_postal": null,
          "poblacion": null,
          "provincia": null,
          "telefono": null,
          "email": null,
          "iban": null
        }
      },
      "impuestos": [
        {
          "documento_id": 9501,
          "tipo_impuesto": "IVA",
          "porcentaje": "21.00",
          "base_imponible": "500.00",
          "cuota": "105.00"
        }
      ],
      "lineas_detalle": [
        {
          "codigo_proveedor": "MED-001",
          "codigo_barras": null,
          "descripcion": "Servicios de logística y suministro",
          "cantidad": 1,
          "precio_unitario": 500.00,
          "descuento_porcentaje": 0,
          "precio_neto": 500.00,
          "importe_total": 500.00,
          "iva_porcentaje": 21,
          "iva_incluido": false
        }
      ]
    }
  ]
}
```
