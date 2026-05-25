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
