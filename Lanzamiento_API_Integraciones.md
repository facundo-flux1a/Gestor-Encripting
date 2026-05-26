# 🚀 Actualización: Ampliación del Ecosistema de APIs (v1.1)

¡Nos complace anunciar la expansión continua de la API v1 del Gestor Documental! Partiendo de nuestra exitosa ruta de exportación de Excel, ahora hemos incorporado un nuevo conjunto de endpoints REST pensados para profundizar la interconexión con sistemas ERP, CRMs, plataformas de Business Intelligence y automatizaciones (Make.com / n8n).

Con esta actualización, ampliamos nuestras herramientas de consulta para seguir construyendo el **motor central asíncrono** de tu contabilidad, dando un paso más hacia una integración total.

---

## ✨ Novedades y Capacidades

### 1. Extracción de Datos Estructurados
Convierte tus facturas en datos vivos.
- JSONs completos que incluyen: encabezados, bases imponibles, líneas de producto granulares y el `Score` de salud del documento.
- URLs automáticas de acceso al documento original para su previsualización inmediata.

### 2. Business Intelligence y Compras
Hemos abierto las puertas a tu analítica de negocio.
- **Analíticas Financieras:** Conecta la salud de tu empresa y el IVA directamente a PowerBI o Tableau.
- **Historial de Productos:** Cruza datos de compras, analiza históricos de precios de un mismo ítem y audita proveedores al instante.

---

## 📚 Documentación Técnica (Nuevos Endpoints)

Todas las peticiones requieren el header de autenticación: `X-Api-Key: muvail_tu_clave`.

### 📊 Consulta de Datos (Data Retrieval)

#### A. Listado de Documentos Procesados
Extrae todas las facturas en JSON, ideal para sincronizar bases de datos.
* **Endpoint:** `GET /api/v1/documents`
#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del proveedor. |
| `cliente` | `string` | Busca coincidencias en nombre o CIF del cliente. |
| `tipo` | `string` | `"emitidas"`, `"recibidas"` o `"todas"`. |

* **Ejemplo de Petición (cURL):**
  ```bash
  curl -X GET "https://[tu-dominio]/api/v1/documents?trimestre=3&año=2024" \
       -H "X-Api-Key: muvail_tu_clave"
  ```
* **Ejemplo de Respuesta:**
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

#### B. Analíticas Financieras Agregadas
Métricas maestras de facturación, IVA y el estado de auditoría (Health Check).
* **Endpoint:** `GET /api/v1/analytics`
#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |

* **Ejemplo de Petición (cURL):**
  ```bash
  curl -X GET "https://[tu-dominio]/api/v1/analytics?año=2024" \
       -H "X-Api-Key: muvail_tu_clave"
  ```
* **Ejemplo de Respuesta:**
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
      "documentos_con_incidencias": [
        {
          "id": 140,
          "tipo_documento": "Factura",
          "numero_documento": "A-0014",
          "proveedor": "Corralón Sur",
          "razon_incidencia": "Múltiples alertas"
        }
      ]
    }
  }
  ```

#### C. Historial Detallado de Productos
Extrae cada línea individual de los comprobantes para trazar variaciones de precios y controlar proveedores.
* **Endpoint:** `GET /api/v1/products`
#### Parámetros Query (Filtros Opcionales)
| Parámetro | Tipo | Opciones / Descripción |
| :--- | :--- | :--- |
| `trimestre` | `number` | `1`, `2`, `3`, `4`. Filtra por trimestre fiscal. |
| `año` | `number` | Ej: `2024`. Filtra por un año específico. |
| `producto` | `string` | Busca coincidencias en la descripción del producto (ej: "cemento"). |
| `proveedor` | `string` | Busca coincidencias en nombre o CIF del proveedor. |

* **Ejemplo de Petición (cURL):**
  ```bash
  curl -X GET "https://[tu-dominio]/api/v1/products?producto=cemento" \
       -H "X-Api-Key: muvail_tu_clave"
  ```
* **Ejemplo de Respuesta:**
  ```json
  {
    "data": [
      {
        "producto_servicio": "Cemento Portland",
        "cantidad": 50,
        "precio_unitario": 800.00,
        "proveedor": { "nombre": "Corralón Sur" }
      }
    ]
  }
  ```

---
*Gestor Documental API v1*
