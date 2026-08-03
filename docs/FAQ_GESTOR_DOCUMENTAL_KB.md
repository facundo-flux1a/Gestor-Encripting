# Base de Conocimiento — Gestor Documental Muvail

Documentación para usuarios finales y soporte. Producto de **Muvail**.

---

## 1. Qué es Gestor Documental Muvail

Gestor Documental Muvail es una plataforma de gestión documental con inteligencia artificial. Permite subir facturas, albaranes y otros documentos comerciales; el sistema los procesa automáticamente extrayendo datos contables (emisor, cliente, CIF, líneas de producto, IVA, recargos, retenciones) y organizándolos por trimestre fiscal.

Está pensado para contadores, administrativos y dueños de PYME que necesitan controlar gastos, ingresos e IVA sin cargar datos a mano.

---

## 2. Primeros pasos

### Registro e inicio de sesión

1. Accedé a la URL de la plataforma.
2. Podés registrarte con email y contraseña, o iniciar sesión con Google.
3. Si olvidaste tu contraseña, usá "¿Olvidaste tu contraseña?" en la pantalla de login.
4. Algunas cuentas pueden requerir verificación de email o autenticación en dos pasos (2FA).

### Selector de empresa

En el sidebar izquierdo verás el **selector de empresas**. Cada empresa tiene sus propios documentos, CIF, trimestres y configuración. Si tenés acceso a varias empresas, elegí la correcta antes de subir documentos o consultar datos.

### Secciones principales del menú

| Sección | Ruta | Para qué sirve |
|---------|------|----------------|
| Dashboard | `/dashboard` | Métricas financieras, gráficos, resumen del trimestre |
| Documentos | `/documents` | Listado, filtros, búsqueda y detalle de facturas |
| Salud Documental | `/dashboard/health-check` | Documentos con descuadres matemáticos |
| Trimestres | `/trimestres` | Vista fiscal por Q1–Q4, cerrar trimestre |
| Actividad | `/dashboard/actividad` | Historial de subidas y procesamiento |
| Incidencias | `/incidents` | Documentos con errores de extracción |
| Entidades | `/proveedores` | Proveedores y clientes consolidados |
| Webhooks | `/dashboard/webhooks` | Integraciones entrantes |
| Docs | `/docs` | Playground de la API REST |
| Ajustes | `/settings` | Perfil, equipo, API keys, 2FA |

---

## 3. Subir documentos

### Desde el dashboard

1. Andá a **Documentos** (`/documents`).
2. Hacé clic en el botón de subir (icono de nube) o arrastrá archivos al área de drop.
3. Formatos soportados: **PDF**, imágenes (JPG, PNG), archivos **ZIP** o **RAR** con lotes.
4. Podés subir un archivo o una carpeta entera.
5. El sistema muestra el progreso en un chip flotante abajo a la derecha.

### Qué pasa después de subir

1. **Recibido**: el archivo se guarda en almacenamiento seguro.
2. **Procesando**: la IA extrae datos del documento (OCR + extracción estructurada).
3. **Completado**: el documento quedó guardado con todos sus datos.
4. **Fallido**: hubo un error (archivo corrupto, timeout, etc.). Podés reintentar desde Actividad.
5. **Duplicado**: el mismo archivo (mismo hash) ya existía en la empresa.

### Subida por correo o webhook

Si tu empresa tiene configurado un webhook o dirección de correo, los documentos pueden llegar automáticamente sin usar el dashboard. Consultá con tu administrador la URL del webhook en **Webhooks**.

### Consejos para mejores resultados

- Preferí PDFs nativos (no escaneos borrosos) cuando sea posible.
- Una factura por archivo suele dar mejor extracción que PDFs con muchas páginas mezcladas.
- Si subís un lote grande (20+ archivos), el procesamiento puede tardar varios minutos. No cierres la pestaña; el progreso se actualiza solo.

---

## 4. Tipos de documento

El sistema clasifica automáticamente:

| Tipo | Significado |
|------|-------------|
| **Factura Emitida** | Tu empresa emitió la factura a un cliente |
| **Factura Recibida** | Un proveedor te emitió la factura |
| **Abono Emitido** | Tu empresa emitió una nota de crédito/devolución |
| **Abono Recibido** | Un proveedor te emitió un abono |
| **(sin confirmar)** | No se pudo determinar emitida/recibida (requiere revisión) |

La clasificación se basa en comparar el CIF y nombre de tu empresa (configurado en el dashboard) con el emisor y receptor del documento.

---

## 5. Incidencias

### Qué es una incidencia

Una **incidencia** es un aviso de calidad en la extracción. Ejemplos:

- CIF del emisor no encontrado en el documento
- CIF del cliente ausente
- No se pudo determinar si es emitida o recibida
- Validación matemática falló (base + IVA + recargo − retención ≠ total)

### Incidencia vs Salud Documental

- **Incidencia** (`/incidents`): problemas de extracción o clasificación. Algunos documentos con incidencia pueden igualmente entrar a trimestres si pasan los controles duros.
- **Salud Documental** (`/dashboard/health-check`): descuadres matemáticos en totales. Estos documentos quedan en estado **REVISION** y **no suman** en el dashboard ni en trimestres hasta corregirse.

### Cómo resolver incidencias

1. Andá a **Incidencias** en el menú.
2. Revisá la descripción del error.
3. Abrí el documento y corregí los campos manualmente si es necesario.
4. Validá o confirmá el documento cuando esté correcto.

---

## 6. Salud Documental (Health Check)

### Qué detecta

Verifica que la fórmula fiscal cuadre:

```
Base imponible + IVA + Recargo de equivalencia − Retenciones = Importe total
```

Tolerancia: ±2 €.

### Estados fiscales internos

| Estado | Significado |
|--------|-------------|
| RECIBIDO | Archivo subido, en cola de procesamiento |
| VALIDADO | Extracción correcta → entra a agregados de dashboard y trimestres |
| REVISION | Descuadre matemático → visible pero excluido de totales |

### Diagnóstico con IA

En Salud Documental podés usar el botón **IA** para que el sistema analice el documento y sugiera la corrección exacta del error.

---

## 7. Trimestres fiscales

### Organización

Los documentos se organizan por **trimestre** (Q1: ene–mar, Q2: abr–jun, Q3: jul–sep, Q4: oct–dic) y **año fiscal**.

### Acciones disponibles

- **Ver documentos** de un trimestre con filtros.
- **Cerrar trimestre** cuando hayas revisado todos los documentos.
- **Mover al siguiente trimestre** documentos mal clasificados por fecha.
- **Exportar Excel** del trimestre con resumen de IVA.

### Documentos excluidos de totales

No suman en trimestres ni dashboard:

- Documentos en estado REVISION (health check fallido)
- Documentos marcados como borrador o sin confirmar (según filtros activos)

---

## 8. Entidades (Proveedores y Clientes)

La sección **Entidades** (`/proveedores`) consolida proveedores y clientes detectados en tus facturas.

Podés ver:

- Listado de entidades con CIF y nombre
- Detalle por proveedor con histórico de facturas
- Analítica de precios por producto/código

---

## 9. Actividad

En **Actividad** (`/dashboard/actividad`) ves el historial de todas las subidas:

| Estado | Significado |
|--------|-------------|
| Completado | Documento procesado y guardado |
| Fallido | Error en subida o procesamiento |
| Duplicado | Archivo ya existía |
| Procesando / waiting_capacity | En cola o esperando capacidad del servidor |

Si una subida quedó "colgada", esperá unos minutos. El sistema reconcilia estados huérfanos automáticamente.

---

## 10. Dashboard

El **Dashboard** muestra:

- **Ingresos totales** (facturas emitidas)
- **Gastos totales** (facturas recibidas)
- **Beneficio antes de impuestos**
- Gráficos por mes y por tipo de documento
- Resumen del trimestre activo

Los totales solo incluyen documentos **VALIDADOS**. Los que están en REVISION no afectan las cifras.

---

## 11. Ajustes y equipo

### Perfil de usuario

En **Ajustes** (`/settings`) podés editar tu nombre, email y contraseña.

### Gestión de equipo

- Invitá miembros a cada empresa por email.
- Cada invitación genera un enlace de aceptación.
- Los miembros ven solo las empresas a las que fueron invitados.

### Autenticación en dos pasos (2FA)

Activá 2FA en Ajustes para mayor seguridad. Una vez activo, necesitarás un código de tu app autenticadora al iniciar sesión.

### Repetir tutoriales

En Ajustes podés volver a ejecutar los tutoriales interactivos de Documentos, Salud Documental, etc.

---

## 12. API REST v1 — Integración con ERP

### Generar una API Key

1. Iniciá sesión en el dashboard.
2. Andá a **Ajustes** (`/settings`).
3. Buscá la sección **Integración API** o **Seguridad > API Keys**.
4. Clic en **+ Nueva Clave**.
5. Asigná un nombre (ej: "Conexión ERP contable").
6. **Importante**: copiá el token (`muvail_...`) inmediatamente. Solo se muestra una vez.

### Autenticación

Todas las llamadas requieren el header:

```
X-Api-Key: muvail_tu_clave_secreta
```

Cada API key está vinculada a **una empresa**. Solo accede a los datos de esa empresa.

### Endpoints principales

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/v1/documents` | GET | Listado simplificado de documentos |
| `/api/v1/documents/full` | GET | Volcado completo con líneas, impuestos, incidencias |
| `/api/v1/analytics` | GET | Métricas financieras agregadas (IVA discriminado) |
| `/api/v1/products` | GET | Histórico de productos línea por línea |
| `/api/v1/quarters` | GET | Estado de trimestres (abiertos/cerrados) |
| `/api/v1/export/excel` | POST | Exportar reporte Excel |
| `/api/v1/incidents` | GET/POST | Listar y resolver incidencias |

### Filtros comunes (query params)

- `trimestre`: 1, 2, 3 o 4
- `año`: ej. 2025
- `tipo`: `emitidas`, `recibidas` o `todas`
- `proveedor` / `cliente`: búsqueda por nombre o CIF

### Parámetros especiales de `/documents/full`

- `incluir_incidencias=true` — incluye docs con incidencias activas (default: excluidos)
- `incluir_sin_verificar=true` — incluye docs con health check fallido
- `incluir_sin_confirmar=true` — incluye borradores

### Impuestos en la API

El array `impuestos[]` puede mezclar IVA, Recargo de Equivalencia y Retenciones. Para procesar correctamente:

- **IVA puro**: `tipo_impuesto` NO contiene "RECARGO", "RETENCION" ni "IRPF"
- **Recargo**: contiene "RECARGO" o "EQUIVALENCIA" (cuota positiva)
- **Retención**: contiene "RETENCION" o "IRPF" (cuota negativa)

Fórmula: `Total = Base + IVA + Recargo − |Retención|`

El endpoint `/api/v1/analytics` devuelve `iva_repercutido`, `recargo_repercutido` y `retencion_repercutido` ya discriminados.

### Playground interactivo

En **Docs** (`/docs`) podés probar cada endpoint con tu API key sin escribir código.

---

## 13. Glosario fiscal

### Recargo de equivalencia

Impuesto adicional al IVA para comerciantes minoristas en España:

| IVA | Recargo |
|-----|---------|
| 21% | 5,2% |
| 10% | 1,4% |
| 4% | 0,5% |

Aparece como línea separada en la factura, además del IVA.

### Retención / IRPF

Descuento en la factura (típico en servicios profesionales). Se resta del total a pagar. En el sistema se almacena con signo negativo.

### CIF / NIF

- **Emisor (proveedor)**: suele estar en la cabecera/membrete de la factura.
- **Cliente (receptor)**: suele estar en el recuadro "Cliente" o "Facturar a".

No confundir emisor con cliente: intercambiarlos causa clasificación incorrecta emitida/recibida.

### Abonos

Notas de crédito o rectificativas. Los importes se almacenan con **signo negativo**.

---

## 14. Preguntas frecuentes (FAQ)

### ¿Cuánto tarda en procesarse una factura?

Depende del tamaño y complejidad. Una factura simple suele procesarse en 1–3 minutos. Lotes grandes (20–30 PDFs) pueden tardar 10–30 minutos. Seguí el progreso en el chip de subida o en Actividad.

### ¿Por qué mi documento dice Duplicado?

El sistema detectó que el mismo archivo (mismo contenido/hash) ya fue subido antes para esa empresa. No se crea un duplicado en la base de datos.

### ¿Por qué no aparece en el dashboard?

Posibles causas:
1. Todavía está procesando (revisá Actividad).
2. Falló el health check (está en REVISION) — revisá Salud Documental.
3. Está marcado como borrador o sin confirmar.
4. Pertenece a otro trimestre o empresa (revisá filtros y selector de empresa).

### ¿Cómo corrijo un CIF mal extraído?

1. Abrí el documento desde Documentos o Incidencias.
2. Editá el campo CIF del emisor o cliente.
3. Guardá los cambios.

### ¿Puedo exportar mis datos?

Sí:
- **Excel por trimestre**: desde Trimestres o vía API `POST /api/v1/export/excel`
- **JSON completo**: vía API `GET /api/v1/documents/full`
- **Exportar desde Documentos**: botón Exportar en la tabla

### ¿Cómo invito a alguien de mi equipo?

Ajustes → Gestión de Equipo → seleccioná la empresa → Invitar por email.

### ¿La plataforma guarda mis documentos originales?

Sí. El PDF/imagen original se almacena de forma segura. Siempre podés descargarlo o ver la miniatura desde el detalle del documento.

### ¿Qué hago si el procesamiento falló?

1. Revisá Actividad para ver el error.
2. Reintentá subir el archivo.
3. Si el error persiste, contactá soporte con el ID de actividad.

---

## 15. Contacto y soporte

Para bugs, pérdida de datos o consultas de facturación de la suscripción, contactá al equipo de soporte de **Muvail**.

Para consultas de uso de la plataforma, usá este asistente de ayuda integrado en el dashboard.
