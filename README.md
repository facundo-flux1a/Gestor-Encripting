# Gestor Documental & ERP Inteligente 🚀

Una solución integral de **Enterprise Resource Planning (ERP)** diseñada para la automatización radical de la gestión documental y el cumplimiento fiscal. Este sistema optimiza el flujo de facturación mediante procesamiento inteligente y reportes en tiempo real.

---

## ✨ Características Principales

### 📊 Dashboard Operativo
- **Visualización en Tiempo Real**: KPIs críticos de ingresos, gastos, beneficios netos y resultado de IVA.
- **Color-Coding Financiero**: Clasificación visual inmediata (Verde para flujos positivos, Rojo para flujos negativos) en los componentes.
- **Detección de Desajustes**: Sistema de alerta para discrepancias contables detectadas automáticamente (`hasMismatches`).

### 📑 Gestión Documental Inteligente (360°)
- **Ingestión Automatizada**: Soporte para subida manual y captura automatizada desde buzones de correo.
- **Procesamiento de Archivos**: Capacidad de manejar PDFs, imágenes e incluso archivos comprimidos (RAR).
- **Extracción con IA**: Análisis avanzado para la extracción automática de metadatos (Base Imponible, IVA, Retenciones) y clasificación de tipos de documentos.
- **Gestión de Incidencias**: Workflow para el tratamiento de errores de extracción o datos incompletos, garantizando la calidad del dato.

### ⚖️ Módulo Fiscal y Reportes (Trimestres)
- **Grid de Alto Rendimiento**: Visualización masiva de facturas mediante **AG Grid**, con soporte para miles de registros y edición en tiempo real.
- **Informes Trimestrales**: Generación automática de modelos de IVA y Resúmenes Anuales.
- **Cierres de Periodo**: Bloqueo de seguridad para evitar modificaciones en trimestres ya presentados ante la administración.

### 🔌 Integraciones Estratégicas
- **Conexión SII (AEAT)**: Soporte para el Suministro Inmediato de Información, facilitando la comunicación con la Agencia Tributaria.
- **Vínculo Proveedores**: Gestión de estadísticas por proveedor y configuración de cuentas contables específicas.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router), TypeScript |
| **Estilos** | Tailwind CSS, shadcn/ui |
| **Gráficos** | Recharts (Analíticas), AG Grid (Reportes Fiscales) |
| **Base de Datos** | MariaDB / MySQL |
| **Estado/Cache** | Upstash (Redis) para persistencia de contexto |
| **Almacenamiento** | MinIO (S3 Compatible) para activos documentales |

---

## 🏗️ Estructura del Proyecto

- `src/app/api/`: Endpoints especializados (AI Analysis, Documents, SII, Activity).
- `src/services/`: Lógica centralizada de base de datos (`document-service.ts`, `auth-service.ts`).
- `src/components/`:
    - `/dashboard/`: Componentes de visualización y KPIs.
    - `/trimestres/`: Módulo de gestión fiscal y grid de datos.
    - `/incidents/`: Interfaz para resolución de errores de IA.
- `src/context/`: Proveedores de estado para empresas (`CompanyProvider`) y actividad (`ActividadProvider`).

---

## 🚀 Guía de Instalación

1.  **Clonar y configurar**: `npm install`
2.  **Variables de Entorno**: Configurar `.env` basándose en `.env.example` (DB, Upstash, MinIO).
3.  **Desarrollo**: `npm run dev`
4.  **Producción**: `npm run build && npm run start`

---

## 🔒 Seguridad
- Autenticación robusta y gestión de sesiones.
- Sistema de roles (ADMIN, EDITOR, VIEWER) con permisos granulares por empresa.
