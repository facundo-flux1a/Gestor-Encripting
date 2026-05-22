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

## 3. Posibles futuras APIs a Implementarse (Roadmap)

Con el objetivo de ampliar el ecosistema de integraciones, aquí te mostramos algunas de las capacidades que se podrían añadir a la API v1 en futuras actualizaciones. La autenticación para todas estas APIs usaría el mismo mecanismo de `X-Api-Key`.

### 🔮 3.1. API de Extracción y Consulta de Documentos (GET `/api/v1/documents`)
**¿Para qué serviría?**
Permitirá a un ERP externo consultar el listado de facturas procesadas de manera estructurada (en formato JSON en lugar de Excel).

**¿Qué traería?**
Un JSON con la lista de documentos, indicando bases imponibles, desglose de impuestos, proveedores, fechas de vencimiento, estado (pagada/pendiente) y una URL firmada de corta duración para descargar el archivo PDF/Imagen original.

**Filtros soportados:**
* `trimestre` y `año`: Para extraer en lotes periodos fiscales específicos.
* `tipo`: Para distinguir entre comprobantes de gastos (`recibidas`) o ingresos (`emitidas`).
* `proveedor` o `cliente`: Filtrado directo (ej: para sincronizar solo un CUIT/CIF en particular).
* `fecha_desde` y `fecha_hasta`: Para sincronizaciones diarias (ej: "traer solo lo validado hoy").

**Aplicación práctica:** 
Creación de flujos de trabajo avanzados en herramientas como n8n o Make.com. Usando el Gestor Documental como fuente de verdad de comprobantes validados, podrías diseñar automatizaciones externas robustas que conecten y sincronicen estos datos directamente con otras plataformas contables, bases de datos propietarias o ERPs complejos.

---

### 🔮 3.2. API de Ingesta Automatizada (POST `/api/v1/documents/upload`)
**¿Para qué serviría?**
Permitiría inyectar documentos al sistema directamente desde otras plataformas sin que un usuario tenga que entrar al dashboard a subirlos.

**¿Qué parámetros recibiría?**
Únicamente el archivo binario (PDF/JPG) o una URL pública de descarga directa del mismo. No es necesario enviar identificadores de empresa, usuario ni configuraciones adicionales, ya que el backend del Gestor Documental extrae toda esta información de enrutamiento directamente desde la API Key (`X-Api-Key`), haciendo que la integración sea extremadamente limpia y segura.

**Aplicación práctica:**
Dado que el sistema ya cuenta con recepción nativa por correo electrónico, esta API es ideal para flujos desde repositorios en la nube (Google Drive, OneDrive, Dropbox). A través de n8n o Make, podrías hacer que, cada vez que un operario arrastre una factura a la carpeta "Drive/Facturas a procesar", la API lo capture y lo inyecte automáticamente al Gestor Documental para su extracción inmediata por la IA.

---

### 🔮 3.3. API de Analítica e Historial de Productos (GET `/api/v1/analytics` y `/api/v1/products`)
**¿Para qué serviría?**
Para extraer las métricas de negocio agregadas, alimentar herramientas de Business Intelligence (PowerBI, Tableau, Looker Studio) y analizar detalladamente el comportamiento de compras, costos y variaciones por proveedor.

**¿Qué traería?**
- **Métricas Financieras:** Total de IVA soportado y repercutido en el mes actual, proyecciones de gasto, y el estado del "Health Check" contable.
- **Datos de Compras (Productos):** Un listado detallado de los productos y servicios adquiridos, mostrando precios unitarios, histórico de compras de ese ítem, cantidades y a qué proveedor se le compró.

**Filtros soportados:**
* `trimestre` y `año`: Para ver la salud financiera o comparar métricas de un periodo exacto.
* `producto_nombre/código`: Permite analizar la variación del costo de un material en específico durante el año.
* `proveedor`: Para consolidar el total gastado con un solo socio comercial y revisar su histórico de precios facturados.

**Aplicación práctica:**
Los directores financieros (CFOs) podrán conectar esta API a un panel maestro en PowerBI para cruzar los datos de gastos en tiempo real con las ventas de la empresa. Al mismo tiempo, abrirá la puerta para que el departamento de Compras evalúe y compare qué proveedor ofreció el mejor precio históricamente para un mismo producto, detectando inflación encubierta o permitiendo negociar mejores tarifas en volumen.
