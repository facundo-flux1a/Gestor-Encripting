'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { InteractiveEndpoint, type ParamDef } from '@/components/docs/interactive-endpoint';
import { ApiKeyPanel } from '@/components/docs/api-key-panel';
import {
  BookOpen, Key, Database, FileJson, Download,
  ShieldAlert, BarChart3, TriangleAlert, AlertTriangle,
  Calendar,
} from 'lucide-react';

// ------------- Param definitions per endpoint -------------

const documentsFullParams: ParamDef[] = [
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
    <MainLayout>
      <PageHeader
        title="Documentación de la API (v1)"
        description="Referencia técnica completa para integradores, ERPs externos y automatizaciones (Make/n8n)."
        icon={BookOpen}
      />

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-14 pb-24">

        {/* Introducción */}
        <section className="space-y-4">
          <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            La API REST v1 del Gestor Documental está concebida como la capa de integración oficial para sistemas externos que necesiten consumir, analizar o sincronizar datos fiscales y contables en tiempo real. Es la interfaz preferida para desarrolladores de ERPs, contabilidades, herramientas de BI como Tableau o Google Data Studio, y plataformas de automatización como Make o n8n.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Todos los endpoints están versionados bajo el prefijo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono text-pink-600 dark:text-pink-400">/api/v1/</code> y son de acceso restringido mediante API Keys únicas por empresa (tenant). Cada clave solo otorga acceso a los datos de la empresa a la que está vinculada, garantizando un aislamiento completo entre tenants.
          </p>
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg mt-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Límites de Seguridad del Playground
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                Para proteger la integridad de nuestra base de datos, las peticiones ejecutadas <strong>desde esta interfaz web</strong> están limitadas a 1 petición cada 30 segundos (en modo pruebas). En producción el límite es de 20 llamadas por minuto. Si superas el límite, recibirás un error <code>429 Too Many Requests</code>. Las integraciones reales vía API desde tus sistemas tienen límites mucho más holgados.
              </p>
            </div>
          </div>
        </section>

        {/* 1. Autenticación */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <Key className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              1. Autenticación y Seguridad
            </h2>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Cada petición HTTP debe incluir el header <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">X-Api-Key</code> con tu token de acceso. 
            Las claves se generan desde la sección <strong>Ajustes → Integraciones</strong> del Gestor Documental y están vinculadas a un tenant específico. 
            Una clave comprometida puede revocarse de inmediato desde la misma pantalla sin afectar al resto de las integraciones.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Si el header no se envía o el token es inválido/revocado, el servidor retornará un <code className="font-mono">401 Unauthorized</code>.
          </p>

          <ApiKeyPanel
            apiKey={apiKey}
            setApiKey={setApiKey}
            selectedKeyId={selectedKeyId}
            setSelectedKeyId={setSelectedKeyId}
          />
        </section>

        {/* 2. Endpoints */}
        <section className="space-y-8">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <Database className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              2. Referencia de Endpoints
            </h2>
          </div>

          {/* 2.1 Documents Full */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-indigo-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.1 Consulta Avanzada de Documentos <code className="text-base font-mono text-indigo-400">/full</code></h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              El endpoint central de extracción. Devuelve el árbol completo de cada documento procesado: metadata del encabezado, datos de la entidad emisora y receptora, líneas de detalle de producto o servicio, el array de impuestos desagregado (IVA, Recargo de Equivalencia, IRPF), las rutas de archivos adjuntos y un indicador del estado de salud matemática del documento. Es el equivalente a un <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">JOIN</code> masivo de todas las tablas relacionadas con la factura.
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
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.2 Analíticas Financieras Agregadas</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
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
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.3 Historial de Productos y Servicios</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
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
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-sky-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.4 Resumen de Trimestres Fiscales</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
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
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.5 Motor de Exportación a Excel</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Construye y exporta dinámicamente un libro de Excel estructurado (<code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">.xlsx</code>) que contiene el Libro de IVA Soportado y Repercutido, el resumen trimestral y el desglose por entidades. El archivo cumple con el formato habitual exigido para revisiones contables y pre-declaraciones del Modelo 303. El endpoint devuelve un buffer binario que el cliente debe descargar directamente.
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
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">2.6 Gestión de Incidencias</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
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

        </section>

        {/* 3. Regla Crítica */}
        <section className="bg-red-50 dark:bg-red-950/20 border-2 border-red-500/50 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-red-500 text-white px-6 py-3 flex items-center gap-3">
            <TriangleAlert className="h-6 w-6 animate-pulse" />
            <h2 className="text-lg font-bold tracking-wider uppercase">
              Regla Crítica: Cálculo de Impuestos y Retenciones
            </h2>
          </div>

          <div className="p-6 space-y-6 text-red-950 dark:text-red-100 text-sm">
            <p className="text-base font-medium leading-relaxed">
              El motor OCR extrae la información tal como aparece en la factura y la almacena de forma desagregada bajo el nodo <code className="font-bold bg-white/50 dark:bg-black/50 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900">impuestos[]</code>. Este array agrupa en una sola lista tres conceptos que tienen signos contables opuestos: IVA puro (positivo), Recargo de Equivalencia (positivo) e IRPF o Retenciones (negativo). Si tu ERP suma ciegamente todos los valores del array sin discriminar el tipo, el total resultará incorrecto.
            </p>

            <div className="bg-white/80 dark:bg-black/40 border border-red-200 dark:border-red-900/50 rounded-lg p-5">
              <p className="mb-3 font-semibold text-red-800 dark:text-red-300">Fórmula obligatoria para recalcular o corroborar el total de un documento:</p>
              <div className="font-mono bg-red-950 text-red-400 p-4 rounded text-center text-lg font-bold shadow-inner">
                Total = Base Imponible + IVA_puro + Recargo - ABS(Retención)
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/60 dark:bg-red-950/40 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                  <span className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">+</span>
                  IVA Puro
                </h4>
                <p className="text-xs opacity-90 leading-relaxed">
                  Identifica estos registros verificando que el campo <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">tipo_impuesto</code> <strong>no contenga</strong> las cadenas "RECARGO", "RETENCION" ni "IRPF". El valor del campo <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">cuota_impuesto</code> se suma a la base imponible.
                </p>
              </div>

              <div className="bg-white/60 dark:bg-red-950/40 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                  <span className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">+</span>
                  Recargo de Equivalencia
                </h4>
                <p className="text-xs opacity-90 leading-relaxed">
                  Identificable porque <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">tipo_impuesto</code> contiene "RECARGO". La <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">cuota_impuesto</code> es positiva y se suma también a la base. Es un impuesto adicional al IVA aplicable a comerciantes minoristas bajo este régimen.
                </p>
              </div>

              <div className="bg-white/60 dark:bg-red-950/40 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
                <h4 className="font-bold mb-2 flex items-center gap-2 text-red-700 dark:text-red-400">
                  <span className="bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">-</span>
                  Retención / IRPF
                </h4>
                <p className="text-xs opacity-90 leading-relaxed">
                  <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">tipo_impuesto</code> contiene "RETENCION" o "IRPF". <strong className="underline">Crítico:</strong> La <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">cuota_impuesto</code> se almacena ya como valor negativo en la base de datos. Al restar usa <code className="font-mono">ABS()</code> o simplemente sumalo directamente (ya viene en negativo), evitando una doble negación.
                </p>
              </div>
            </div>

            <p className="text-xs opacity-80 border-t border-red-200 dark:border-red-900/50 pt-4">
              <strong>Alternativa simplificada:</strong> Si solo necesitas los totales agregados para tu contabilidad y no requieres el detalle línea por línea, utiliza el endpoint <code className="font-mono">/api/v1/analytics</code>. Este endpoint ya aplica la fórmula internamente y te devuelve los campos <code className="font-mono">iva_repercutido</code>, <code className="font-mono">iva_soportado</code> y <code className="font-mono">retenciones_practicadas</code> calculados de forma limpia y lista para usar.
            </p>
          </div>
        </section>

      </div>
    </MainLayout>
  );
}
