# Referencia Completa de la API REST (v1)

Esta documentación proporciona los detalles necesarios para integrar sistemas externos (ERPs, CRMs, herramientas de BI) con la plataforma del Gestor Documental a través de nuestra API REST v1.

---

## 1. Autenticación (API Keys)

Todas las llamadas a la API requieren de un **Token de Autenticación** (API Key). 
Debes incluir la clave en los **headers** de tus peticiones HTTP usando la propiedad `X-Api-Key`.

**Ejemplo de Header:**
```http
X-Api-Key: muvail_aBcD1234efGh5678...
```

---

## 2. Endpoints Disponibles

A continuación se listan todos los endpoints externos disponibles en la versión 1 de la API.

### 2.1 Consulta de Documentos (Simplificada)
Extrae un listado estructurado en JSON de los documentos procesados, ideal para sincronizar bases de datos externas de manera rápida.

* **URL:** `/api/v1/documents`
* **Método:** `GET`

#### Parámetros Query (Opcionales)
* `trimestre` (number): 1, 2, 3, 4.
* `año` (number): Ej: 2024.
* `proveedor` (string): Busca coincidencias en nombre o CIF del proveedor.
* `cliente` (string): Busca coincidencias en nombre o CIF del cliente.
* `tipo` (string): "emitidas", "recibidas" o "todas".

### 2.2 Consulta Unificada de Documentos Completos (Avanzado)
Recupera toda la información estructurada de los documentos procesados junto con todas sus tablas relacionadas (líneas, impuestos, archivos, incidencias y salud matemática).

* **URL:** `/api/v1/documents/full`
* **Método:** `GET`

#### Parámetros Query (Opcionales)
* `trimestre` (number): 1, 2, 3, 4.
* `año` (number): Ej: 2024.
* `tipo` (string): "emitidas", "recibidas", "todas".
* `proveedor` (string): Coincidencias en nombre o CIF del emisor.
* `cliente` (string): Coincidencias en nombre o CIF del receptor.
* `incluir_incidencias` (boolean): `true` para incluir documentos con incidencias (default: false).
* `incluir_sin_verificar` (boolean): `true` para incluir documentos que fallaron el health check (default: false).
* `incluir_sin_confirmar` (boolean): `true` para incluir borradores (default: false).

### 2.3 Analíticas Financieras Agregadas
Métricas de rendimiento financiero consolidado con los impuestos ya discriminados.

* **URL:** `/api/v1/analytics`
* **Método:** `GET`

#### Parámetros Query (Opcionales)
* `trimestre` (number): 1, 2, 3, 4.
* `año` (number): Ej: 2024.

### 2.4 Historial de Productos y Servicios
Extrae un histórico detallado línea por línea de todos los productos adquiridos o vendidos.

* **URL:** `/api/v1/products`
* **Método:** `GET`

#### Parámetros Query (Opcionales)
* `trimestre` / `año`
* `producto` (string): Busca coincidencias en la descripción del producto.
* `proveedor` (string): Busca coincidencias en el proveedor.

### 2.5 Resumen de Trimestres Fiscales
Obtén un estado rápido de los trimestres fiscales (abiertos/cerrados) junto con sus totales.

* **URL:** `/api/v1/quarters`
* **Método:** `GET`

#### Parámetros Query (Opcionales)
* `trimestre` / `año`
* `cerrado` (boolean): `true` o `false`.

### 2.6 Exportación de Reporte a Excel
Construye y exporta dinámicamente un reporte detallado (Libro de IVA, resumen trimestral) en formato `.xlsx`.

* **URL:** `/api/v1/export/excel`
* **Método:** `POST`
* **Content-Type:** `application/json`

#### Body (JSON)
* `año` (number), `trimestre` (number), `proveedor` (string), `cliente` (string), `tipo` (string).

### 2.7 Gestión de Incidencias (Listar y Resolver)
Permite a un ERP consultar documentos con errores matemáticos o de calidad, y resolverlos.

#### Listar Incidencias
* **URL:** `/api/v1/incidents`
* **Método:** `GET`
* **Parámetros:** `estado` ("pendientes", "validadas", "todas"), `documento_id` (number).

#### Resolver Incidencia
* **URL:** `/api/v1/incidents`
* **Método:** `POST`
* **Body (JSON):**
  * `incidencia_id` (number, obligatorio).
  * `observaciones` (string, opcional).
  * `validado_por` (string, opcional).

---

## Regla Importante sobre Impuestos

Al consumir `/documents` o `/documents/full`, el array `impuestos[]` agrupa IVA, Recargos de Equivalencia y Retenciones. Para calcular un total:
`Total = Base + IVA_puro + Recargo - ABS(Retencion)`

* `IVA_puro`: tipo de impuesto no incluye "RECARGO" ni "RETENCION".
* `Recargo`: tipo de impuesto incluye "RECARGO" (positivo).
* `Retencion`: tipo de impuesto incluye "RETENCION" o "IRPF" (negativo en BD).
