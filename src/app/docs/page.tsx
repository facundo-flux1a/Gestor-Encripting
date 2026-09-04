'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { InteractiveEndpoint, type ParamDef } from '@/components/docs/interactive-endpoint';
import { ApiKeyPanel } from '@/components/docs/api-key-panel';
import {
  BookOpen, Key, Database, FileJson, Download,
  ShieldAlert, BarChart3, TriangleAlert, AlertTriangle,
  Calendar, FileImage,
} from 'lucide-react';
import { DocsProvider } from '@/context/DocsProvider';
import { DocsTutorial } from '@/components/tutorials/DocsTutorial';
import { DocsTutorialMobile } from '@/components/tutorials/DocsTutorialMobile';

// ------------- Param definitions per endpoint -------------

const documentsFullParams: ParamDef[] = [
  {
    key: 'desde_id',
    label: 'Desde ID (Semáforo Incremental)',
    description: 'Devuelve facturas con ID estrictamente mayor al especificado. Ideal para sincronizaciones incrementales.',
    type: 'number',
    defaultValue: '',
  },
  {
    key: 'modificados_desde',
    label: 'Modificados Desde',
    description: 'Filtra facturas creadas o actualizadas a partir de una fecha (acepta DD/MM/AAAA, DD/MM/AA, YYYY-MM-DD o ISO 8601).',
    type: 'text',
    defaultValue: '',
  },
  {
    key: 'limit',
    label: 'Límite de resultados',
    description: 'Número máximo de documentos a devolver (1-1000). Por defecto 500.',
    type: 'number',
    defaultValue: 100,
  },
  {
    key: 'trimestre',
    label: 'Trimestre',
    description: 'Filtra por trimestre fiscal (1, 2, 3 ó 4).',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    defaultValue: '1',
  },
  {
    key: 'año',
    label: 'Año',
    description: 'Filtra por ejercicio fiscal. Ej: 2025.',
    type: 'number',
    defaultValue: new Date().getFullYear(),
  },
  {
    key: 'tipo',
    label: 'Tipo de documento',
    description: 'Distingue entre facturas emitidas (ventas), recibidas (compras) o todas.',
    type: 'enum',
    options: ['todas', 'emitidas', 'recibidas'],
    defaultValue: 'todas',
  },
  {
    key: 'proveedor',
    label: 'Proveedor',
    description: 'Filtra por proveedor emisor. Selecciona uno de los registrados en tu base de datos.',
    type: 'async-enum',
    asyncOptionsUrl: '/api/docs/filters/proveedores',
    asyncOptionsKey: 'proveedores',
  },
  {
    key: 'cliente',
    label: 'Cliente',
    description: 'Filtra por cliente receptor. Selecciona uno de los registrados en tu base de datos.',
    type: 'async-enum',
    asyncOptionsUrl: '/api/docs/filters/clientes',
    asyncOptionsKey: 'clientes',
  },
  {
    key: 'incluir_incidencias',
    label: 'Incluir documentos retenidos',
    description: 'Por defecto se excluyen facturas con incidencias activas. Activa para incluirlas.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'incluir_sin_verificar',
    label: 'Incluir fallos matemáticos',
    description: 'Por defecto se excluyen documentos cuyo total no cuadra matemáticamente.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'incluir_sin_confirmar',
    label: 'Incluir borradores',
    description: 'Por defecto solo se exportan documentos confirmados. Activa para incluir borradores.',
    type: 'boolean',
    defaultValue: 'false',
  },
  {
    key: 'include_thumbnail_url',
    label: 'Incluir URLs de miniatura',
    description: 'Por defecto (true) se inyecta un enlace dinámico a la vista previa JPEG del documento. Desactívalo (false) para omitir este campo.',
    type: 'boolean',
    defaultValue: 'true',
  },
];

const analyticsParams: ParamDef[] = [
  {
    key: 'trimestre',
    label: 'Trimestre',
    description: 'Agrega las métricas solo para el trimestre indicado.',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    defaultValue: '1',
  },
  {
    key: 'año',
    label: 'Año',
    description: 'Ejercicio fiscal a analizar.',
    type: 'number',
    defaultValue: new Date().getFullYear(),
  },
];

const productsParams: ParamDef[] = [
  {
    key: 'producto',
    label: 'Descripción del producto',
    description: 'Búsqueda parcial en la descripción de línea de factura. Ej: "cemento", "asesoría".',
    type: 'text',
    defaultValue: '',
  },
  {
    key: 'proveedor',
    label: 'Proveedor',
    description: 'Filtra por proveedor para ver el historial de compras de un suministrador específico.',
    type: 'async-enum',
    asyncOptionsUrl: '/api/docs/filters/proveedores',
    asyncOptionsKey: 'proveedores',
  },
  {
    key: 'trimestre',
    label: 'Trimestre',
    description: 'Acota la búsqueda a un trimestre específico.',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    defaultValue: '1',
  },
  {
    key: 'año',
    label: 'Año',
    description: 'Ejercicio fiscal.',
    type: 'number',
    defaultValue: new Date().getFullYear(),
  },
];

const quartersParams: ParamDef[] = [
  {
    key: 'trimestre',
    label: 'Trimestre específico',
    description: 'Si se omite, devuelve todos los trimestres del año indicado.',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    defaultValue: '1',
  },
  {
    key: 'año',
    label: 'Año',
    description: 'Ejercicio fiscal.',
    type: 'number',
    defaultValue: new Date().getFullYear(),
  },
  {
    key: 'cerrado',
    label: 'Solo cerrados / solo abiertos',
    description: 'Filtra por estado de cierre del trimestre.',
    type: 'boolean',
    defaultValue: 'false',
  },
];

const excelParams: ParamDef[] = [
  {
    key: 'trimestre',
    label: 'Trimestre',
    description: 'Trimestre fiscal a incluir en el reporte.',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    defaultValue: '1',
  },
  {
    key: 'año',
    label: 'Año',
    description: 'Ejercicio fiscal del reporte.',
    type: 'number',
    defaultValue: new Date().getFullYear(),
  },
  {
    key: 'tipo',
    label: 'Tipo de documento',
    description: 'Filtra qué tipo de facturas incluir en el Libro de IVA.',
    type: 'enum',
    options: ['todas', 'emitidas', 'recibidas'],
    defaultValue: 'todas',
  },
];

const incidentsGetParams: ParamDef[] = [
  {
    key: 'estado',
    label: 'Estado',
    description: 'Filtra incidencias por su estado de resolución.',
    type: 'enum',
    options: ['todas', 'pendientes', 'validadas'],
    defaultValue: 'pendientes',
  },
  {
    key: 'documento_id',
    label: 'ID de Documento',
    description: 'Filtra incidencias asociadas a un documento específico.',
    type: 'number',
    defaultValue: '',
  },
];

const incidentsPostParams: ParamDef[] = [
  {
    key: 'incidencia_id',
    label: 'ID de la Incidencia',
    description: 'ID numérico de la incidencia a resolver (obtenido del GET).',
    type: 'number',
    defaultValue: '42',
  },
  {
    key: 'observaciones',
    label: 'Observaciones',
    description: 'Comentario libre explicando el motivo de la validación.',
    type: 'text',
    defaultValue: 'Redondeo del proveedor, aceptado.',
  },
  {
    key: 'validado_por',
    label: 'Validado por',
    description: 'Identificador del sistema o usuario que valida la incidencia.',
    type: 'text',
    defaultValue: 'bot_erp@empresa.com',
  },
];

const thumbnailParams: ParamDef[] = [
  {
    key: 'id',
    label: 'Documento ID',
    description: 'Selecciona uno de tus últimos 100 documentos para generar su vista previa.',
    type: 'async-enum',
    asyncOptionsUrl: '/api/docs/filters/documentos',
    asyncOptionsKey: 'documentos',
  },
];

// ------------- Mock responses -------------

const incidentPostMock = {
  ok: true,
  mensaje: '[SIMULACIÓN] La incidencia #42 habría sido marcada como validada.',
  incidencia_id: 42,
  validado_por: 'bot_erp@empresa.com',
  nota: 'Este es un resultado simulado. En producción, este endpoint modificaría el estado de la incidencia en la base de datos.',
};

// ------------- Page Component -------------

export default function DocsPage() {
  const [apiKey, setApiKey] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);

  return (
    <DocsProvider>
      {/* Desktop tutorial */}
      <div className="hidden md:block">
        <DocsTutorial />
      </div>
      {/* Mobile tutorial */}
      <div className="block md:hidden">
        <DocsTutorialMobile />
      </div>

      <MainLayout>
        <PageHeader
          title="Documentación de la API (v1)"
          description="Referencia técnica completa para integradores, ERPs externos y automatizaciones (Make/n8n)."
          icon={BookOpen}
        />

      <div className="w-full max-w-4xl mx-auto py-6 sm:py-8 px-3 sm:px-6 lg:px-8 space-y-14 pb-24 overflow-x-hidden break-words">

        {/* Introducción */}
        <section className="space-y-4" data-tutorial="docs-header">
          <p className="text-lg text-muted-foreground leading-relaxed">
            La API REST v1 del Gestor Documental está concebida como la capa de integración oficial para sistemas externos que necesiten consumir, analizar o sincronizar datos fiscales y contables en tiempo real. Es la interfaz preferida para desarrolladores de ERPs, contabilidades, herramientas de BI como Tableau o Google Data Studio, y plataformas de automatización como Make o n8n.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Todos los endpoints están versionados bajo el prefijo <code className="bg-muted text-primary px-1.5 py-0.5 rounded font-mono text-xs font-semibold border border-border/50">/api/v1/</code> y son de acceso restringido mediante API Keys únicas por empresa (tenant). Cada clave solo otorga acceso a los datos de la empresa a la que está vinculada, garantizando un aislamiento completo entre tenants.
          </p>
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mt-4 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Límites de Seguridad del Playground
              </p>
              <p className="text-xs opacity-90 leading-relaxed">
                Para proteger la integridad de nuestra base de datos, las peticiones ejecutadas <strong>desde esta interfaz web</strong> están limitadas a 1 petición cada 30 segundos (en modo pruebas). En producción el límite es de 20 llamadas por minuto. Si superas el límite, recibirás un error <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded text-xs font-bold">429 Too Many Requests</code>. Las integraciones reales vía API desde tus sistemas tienen límites mucho más holgados.
              </p>
            </div>
          </div>
        </section>

        {/* 1. Autenticación */}
        <section className="space-y-4" data-tutorial="docs-auth-section">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Key className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              1. Autenticación y Seguridad
            </h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Cada petición HTTP debe incluir el header <code className="bg-muted text-primary px-1.5 py-0.5 rounded text-xs font-mono font-semibold border border-border/50">X-Api-Key</code> con tu token de acceso. 
            Las claves se generan desde la sección <strong>Ajustes → Integraciones</strong> del Gestor Documental y están vinculadas a un tenant específico. 
            Una clave compromised puede revocarse de inmediato desde la misma pantalla sin afectar al resto de las integraciones.
          </p>
          <p className="text-sm text-muted-foreground">
            Si el header no se envía o el token es inválido/revocado, el servidor retornará un <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">401 Unauthorized</code>.
          </p>

          <ApiKeyPanel
            apiKey={apiKey}
            setApiKey={setApiKey}
            selectedKeyId={selectedKeyId}
            setSelectedKeyId={setSelectedKeyId}
          />
        </section>

        {/* 2. Endpoints */}
        <section className="space-y-8" data-tutorial="docs-endpoints-list">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              2. Referencia de Endpoints
            </h2>
          </div>

          {/* 2.1 Documents Full */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <FileJson className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                2.1 Consulta Avanzada de Documentos 
                <code className="text-sm font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">/full</code>
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              El endpoint central de extracción. Devuelve el árbol completo de cada documento procesado: metadata del encabezado, datos de la entidad emisora y receptora, líneas de detalle de producto o servicio, el array de impuestos desagregado (IVA, Recargo de Equivalencia, IRPF), un indicador del estado de salud matemática del documento, y la URL a la previsualización (miniatura JPEG) del PDF renderizada por nuestro motor interno Ghostscript. Es el equivalente a un <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">JOIN</code> masivo de todas las tablas relacionadas con la factura.
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/documents/full"
              description="Devuelve un array JSON con el payload completo y anidado de cada factura."
              params={documentsFullParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
          </div>

          {/* 2.2 Analytics */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.2 Analíticas Financieras Agregadas</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Endpoint de alto nivel que devuelve KPIs financieros ya agregados y depurados: ingresos totales, gastos totales, IVA repercutido, IVA soportado, retenciones y el resultado neto del período. Está optimizado para dashboards de gestión y herramientas de BI donde no se necesita el detalle línea por línea sino las cifras consolidadas del trimestre. Evita al integrador tener que hacer la agregación matemática por su cuenta.
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/analytics"
              description="Retorna métricas financieras consolidadas listas para consumir en un panel de control externo o en una hoja de cálculo."
              params={analyticsParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
          </div>

          {/* 2.3 Products */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.3 Historial de Productos y Servicios</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Extrae el registro histórico línea a línea de todos los productos y servicios que aparecen en las facturas procesadas. Esto incluye descripción, cantidad, precio unitario, descuentos y total por línea. Es especialmente útil para análisis de evolución de precios de materiales, estudios de variación de costes por proveedor y detección de duplicidades en pedidos.
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/products"
              description="Devuelve el historial de líneas de producto/servicio extraídas de las facturas. Admite búsqueda textual por descripción y filtrado por proveedor."
              params={productsParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
          </div>

          {/* 2.4 Quarters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.4 Resumen de Trimestres Fiscales</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Proporciona el estado y los totales de cada trimestre fiscal registrado en el sistema. Indica si el trimestre está abierto (activo, puede recibir nuevas facturas) o cerrado (congelado para declaración). Es la fuente de verdad para que un sistema externo sepa en qué período debe encuadrar un documento antes de enviarlo, y para verificar el estado de declaraciones anteriores.
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/quarters"
              description="Devuelve los trimestres fiscales con su estado de apertura/cierre y sus totales financieros acumulados."
              params={quartersParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
          </div>

          {/* 2.5 Excel Export */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.5 Motor de Exportación a Excel</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Construye y exporta dinámicamente un libro de Excel estructurado (<code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs text-primary font-medium">.xlsx</code>) que contiene el Libro de IVA Soportado y Repercutido, el resumen trimestral y el desglose por entidades. El archivo cumple con el formato habitual exigido para revisiones contables y pre-declaraciones del Modelo 303. El endpoint devuelve un buffer binario que el cliente debe descargar directamente.
            </p>
            <InteractiveEndpoint
              method="POST"
              path="/api/v1/export/excel"
              description="Genera y descarga el Libro de IVA en formato Excel. El archivo se descargará directamente a tu equipo."
              params={excelParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
              isBinaryResponse
              binaryFilename={`Libro_IVA_Q${new Date().getFullYear()}.xlsx`}
            />
          </div>

          {/* 2.6 Incidents */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.6 Gestión de Incidencias</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              El motor de OCR retiene automáticamente las facturas que presentan descuadres matemáticos (por ejemplo, cuando la suma de líneas no cuadra con el total declarado) o inconsistencias detectadas por los modelos de IA. Este endpoint permite a un ERP consultar ese listado de documentos retenidos y, una vez revisados manualmente por el operador, aprobar su liberación para que continúen el flujo contable normal.
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/incidents"
              description="Devuelve el listado de documentos retenidos por incidencias activas, con el detalle del error detectado y su estado de resolución."
              params={incidentsGetParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
            <InteractiveEndpoint
              method="POST"
              path="/api/v1/incidents"
              description="Marca una incidencia como resuelta y libera el documento para que continúe su flujo de procesamiento contable."
              params={incidentsPostParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
              isMockOnly
              mockResponse={incidentPostMock}
            />
          </div>

          {/* 2.7 Thumbnail */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <FileImage className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">2.7 Previsualización de PDF (Thumbnail)</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Genera al instante una vista previa en formato JPEG (calidad 85%) de la primera página del documento PDF. El sistema renderiza el documento internamente usando Ghostscript de forma nativa y cachea el resultado en MinIO. Este endpoint es súper liviano e ideal para mostrar miniaturas en galerías dentro de tu ERP sin tener que descargar los PDFs originales.
              <br /><span className="inline-block mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">⚠️ Límite del Playground: máx. 5 peticiones por minuto para no afectar al servidor compartido.</span>
            </p>
            <InteractiveEndpoint
              method="GET"
              path="/api/v1/documents/[id]/thumbnail"
              description="Seleccioná un documento de la lista. Al ejecutar, verás la miniatura renderizada directamente debajo."
              params={thumbnailParams}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
            />
          </div>

        </section>

        {/* 3. Regla Crítica */}
        <section className="bg-destructive/5 border border-destructive/30 rounded-xl overflow-hidden shadow-sm" data-tutorial="docs-responses-section">
          <div className="bg-destructive/10 border-b border-destructive/20 text-destructive px-6 py-3.5 flex items-center gap-3">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <h2 className="text-base font-bold tracking-wider uppercase">
              Regla Crítica: Cálculo de Impuestos y Retenciones
            </h2>
          </div>

          <div className="p-6 space-y-6 text-foreground text-sm">
            <p className="text-sm leading-relaxed text-muted-foreground">
              El motor OCR extrae la información tal como aparece en la factura y la almacena de forma desagregada bajo el nodo <code className="font-semibold bg-muted text-primary px-1.5 py-0.5 rounded border border-border">impuestos[]</code>. Este array agrupa en una sola lista tres conceptos que tienen signos contables opuestos: IVA puro (positivo), Recargo de Equivalencia (positivo) e IRPF o Retenciones (negativo). Si tu ERP suma ciegamente todos los valores del array sin discriminar el tipo, el total resultará incorrecto.
            </p>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <p className="font-semibold text-foreground text-sm">Fórmula obligatoria para recalcular o corroborar el total de un documento:</p>
              <div className="font-mono bg-slate-950 text-slate-100 p-3 sm:p-4 rounded-lg text-center text-xs sm:text-base font-bold shadow-inner break-words overflow-x-auto border border-slate-800">
                Total = Base Imponible + IVA_puro + Recargo - ABS(Retención)
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <h4 className="font-bold mb-2 flex items-center gap-2 text-foreground">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">+</span>
                  IVA Puro
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identifica estos registros verificando que el campo <code className="font-mono bg-muted px-1 rounded">tipo_impuesto</code> <strong>no contenga</strong> las cadenas "RECARGO", "RETENCION" ni "IRPF". El valor del campo <code className="font-mono bg-muted px-1 rounded">cuota_impuesto</code> se suma a la base imponible.
                </p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <h4 className="font-bold mb-2 flex items-center gap-2 text-foreground">
                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">+</span>
                  Recargo de Equivalencia
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identificable porque <code className="font-mono bg-muted px-1 rounded">tipo_impuesto</code> contiene "RECARGO". La <code className="font-mono bg-muted px-1 rounded">cuota_impuesto</code> es positiva y se suma también a la base. Es un impuesto adicional al IVA aplicable a comerciantes minoristas bajo este régimen.
                </p>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <h4 className="font-bold mb-2 flex items-center gap-2 text-destructive">
                  <span className="bg-destructive text-destructive-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">-</span>
                  Retención / IRPF
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <code className="font-mono bg-muted px-1 rounded">tipo_impuesto</code> contiene "RETENCION" o "IRPF". <strong className="underline text-foreground">Crítico:</strong> La <code className="font-mono bg-muted px-1 rounded">cuota_impuesto</code> se almacena ya como valor negativo en la base de datos. Al restar usa <code className="font-mono">ABS()</code> o sumalo directamente (ya viene en negativo).
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground border-t border-border pt-4">
              <strong>Alternativa simplificada:</strong> Si solo necesitas los totales agregados para tu contabilidad y no requieres el detalle línea por línea, utiliza el endpoint <code className="font-mono text-primary">/api/v1/analytics</code>. Este endpoint ya aplica la fórmula internamente y te devuelve los campos <code className="font-mono">iva_repercutido</code>, <code className="font-mono">iva_soportado</code> y <code className="font-mono">retenciones_practicadas</code> calculados de forma limpia.
            </p>
          </div>
        </section>

        {/* ====================== WEBHOOKS ====================== */}
        <section className="space-y-6" id="webhooks" data-tutorial="docs-webhooks-info">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Webhooks (Notificaciones Push)
            </h2>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            Los Webhooks envían peticiones HTTP POST automáticamente a tu ERP cuando ocurre un evento relevante, sin que tengas que hacer polling. Se configuran desde <strong>Dashboard → Webhooks</strong>.
          </p>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-3 shadow-sm">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-primary" />
              Comportamiento del Motor de Webhooks
            </h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2 ml-1">
              <li className="leading-relaxed">
                <strong className="text-foreground">Eventos concurrentes individuales (No hay lotes):</strong> Para simplificar y estabilizar las integraciones externas, el sistema no agrupa operaciones masivas en un solo payload gigante. Si subís un ZIP con 50 facturas, o eliminás 20 juntas, recibirás 50 peticiones individuales concurrentes. Tu endpoint debe estar preparado para absorber múltiples llamadas en paralelo.
              </li>
              <li className="leading-relaxed">
                <strong className="text-foreground">Cascada de resolución:</strong> Cuando resolvés una incidencia manualmente desde el dashboard, se dispara un evento <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">incidencia.resuelta_manualmente</code>. Si tras esa resolución el documento queda limpio de errores y pasa a estado válido, el motor disparará inmediatamente después un segundo evento <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">documento.listo_para_erp</code> (siempre y cuando estés suscrito a él).
              </li>
            </ul>
          </div>

          <div className="space-y-8 mt-6">
            <h3 className="text-xl font-bold tracking-tight text-foreground border-b border-border pb-2">Ejemplos de Payload por Evento</h3>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-primary font-mono bg-primary/10 border border-primary/20 inline-block px-2.5 py-1 rounded">documento.listo_para_erp</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Se dispara cuando el documento es validado (o al liberarse desde <code className="font-mono text-xs">incidencia.resuelta_manualmente</code>). Contiene toda la metadata contable para asentar el documento de inmediato en tu ERP.</p>
              <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`{
  "webhook_id": 42,
  "evento": "documento.listo_para_erp",
  "fecha_evento": "2026-06-03T15:30:00Z",
  "empresa_id": 15,
  "data": {
    "id": 4158,
    "tipo_documento": "Factura",
    "numero_documento": "INV-2026-001",
    "fecha_emision": "2026-05-15",
    "importe_total": 1250.50,
    "moneda": "EUR",
    "entidades": [
      { "rol": "emisor", "nombre": "Empresa Ficticia S.A.", "identificador_fiscal": "A12345678" }
    ],
    "iva_details": [
      { "tipo_impuesto": "IVA 21%", "base_imponible": 1000, "cuota": 210 }
    ]
  }
}`}
              </pre>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-primary font-mono bg-primary/10 border border-primary/20 inline-block px-2.5 py-1 rounded">documento.modificado</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Incluye un array estricto (<code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">campos_actualizados</code>) detallando qué propiedades mutaron <strong>realmente</strong> tras una edición en el dashboard. Útil para hacer updates quirúrgicos en tu base de datos.</p>
              <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`{
  "webhook_id": 42,
  "evento": "documento.modificado",
  "fecha_evento": "2026-06-03T15:35:12Z",
  "empresa_id": 15,
  "data": {
    "documento_id": 4158,
    "campos_actualizados": ["importe_total", "iva_details"],
    "tipo_documento": "Factura",
    "numero_documento": "2/108",
    "importe_total": 1500.00,
    "fecha_emision": "2026-05-15"
  }
}`}
              </pre>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-primary font-mono bg-primary/10 border border-primary/20 inline-block px-2.5 py-1 rounded">documento.requiere_atencion</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Evento de alerta. Avisa que un documento quedó retenido en el dashboard debido a descuadres matemáticos o validaciones fallidas.</p>
              <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`{
  "webhook_id": 42,
  "evento": "documento.requiere_atencion",
  "fecha_evento": "2026-06-03T15:40:00Z",
  "empresa_id": 15,
  "data": {
    "id": 4159,
    "tipo_documento": "Ticket",
    "file_hash": "a1b2c3d4..."
  }
}`}
              </pre>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-primary font-mono bg-primary/10 border border-primary/20 inline-block px-2.5 py-1 rounded">incidencia.resuelta_manualmente</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Indica que un usuario forzó la resolución de una incidencia. Inmediatamente después suele dispararse un evento <code className="font-mono text-xs text-primary">listo_para_erp</code>.</p>
              <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`{
  "webhook_id": 42,
  "evento": "incidencia.resuelta_manualmente",
  "fecha_evento": "2026-06-03T15:45:00Z",
  "empresa_id": 15,
  "data": {
    "documento_id": 4159,
    "validado_por": "dashboard",
    "quedan_incidencias_pendientes": false,
    "documento_metadata": {
       "numero_documento": "TKT-002",
       "importe_total": 45.00
    }
  }
}`}
              </pre>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-primary font-mono bg-primary/10 border border-primary/20 inline-block px-2.5 py-1 rounded">documento.eliminado</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Indica que un documento fue borrado del sistema. Útil para anular el registro de forma síncrona en tu ERP.</p>
              <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`{
  "webhook_id": 42,
  "evento": "documento.eliminado",
  "fecha_evento": "2026-06-03T15:50:00Z",
  "empresa_id": 15,
  "data": {
    "id": 4158
  }
}`}
              </pre>
            </div>

          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Eventos disponibles</h3>
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Evento</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Cuándo se dispara</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {([
                    ['documento.listo_para_erp', 'Documento procesado o liberado de incidencias, listo para contabilizar. Incluye metadata contable completa (Entidades, IVA).'],
                    ['documento.requiere_atencion', 'Documento procesado con incidencias o descuadres contables.'],
                    ['documento.modificado', 'Se actualizaron datos. El payload incluye el array exacto de campos_actualizados que sufrieron cambios reales.'],
                    ['incidencia.resuelta_manualmente', 'Incidencia resuelta desde el dashboard. Acompañada casi siempre de un evento listo_para_erp subsiguiente.'],
                    ['documento.eliminado', 'Un documento fue eliminado del sistema.'],
                  ] as [string, string][]).map(([evento, desc]) => (
                    <tr key={evento} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{evento}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Verificación de Firma HMAC SHA-256</h3>
            <p className="text-sm text-muted-foreground">
              Cada petición incluye el header <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs text-primary font-semibold border border-border/50">X-Muvail-Signature</code> generado con HMAC SHA-256 usando el secreto único del webhook. <strong className="text-foreground">Siempre verificá la firma</strong> antes de procesar.
            </p>
            <pre className="text-sm bg-slate-950 text-slate-200 p-4 rounded-xl overflow-x-auto leading-relaxed shadow-sm border border-slate-800">
{`import crypto from 'crypto';

function verifyMuvailWebhook(rawBody: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// En tu endpoint (Next.js / Express):
export async function POST(req: Request) {
  const sig = req.headers.get('x-muvail-signature') ?? '';
  const body = await req.text(); // RAW body, antes de parsear
  
  if (!verifyMuvailWebhook(body, sig, process.env.WEBHOOK_SECRET!)) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 });
  }
  
  const event = JSON.parse(body);
  // Procesá el evento según event.evento
  return Response.json({ ok: true });
}`}
            </pre>
          </div>
        </section>

      </div>
    </MainLayout>
    </DocsProvider>
  );
}
