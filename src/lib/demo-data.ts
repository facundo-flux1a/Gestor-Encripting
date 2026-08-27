import type { Company, Document, DashboardAnalytics, Incident, Trimestre, ProviderWithStats, Activity } from './types';

// ============================================================================
// EMPRESAS DE PRUEBA (DEMO / PRESENTACIÓN)
// ============================================================================
export const DEMO_COMPANIES: Company[] = [
  {
    id: 9991,
    name: 'Innovatech Solutions S.L.',
    nombreFiscal: 'Innovatech Solutions Sociedad Limitada',
    cif: 'B87654321',
    mail_de_carga: 'facturas.innovatech@muvail.com',
    recargo: false,
    id_de_usuario: [1],
    config_roles: { '1': 'ADMIN' }
  },
  {
    id: 9992,
    name: 'Nexus Digital Consultores S.A.',
    nombreFiscal: 'Nexus Digital Consultores Sociedad Anónima',
    cif: 'A12345678',
    mail_de_carga: 'administracion.nexus@muvail.com',
    recargo: false,
    id_de_usuario: [1],
    config_roles: { '1': 'ADMIN' }
  },
  {
    id: 9993,
    name: 'Logística & Servicios Norte S.L.',
    nombreFiscal: 'Logística & Servicios Norte S.L.',
    cif: 'B45678901',
    mail_de_carga: 'gestion.logistica@muvail.com',
    recargo: true,
    id_de_usuario: [1],
    config_roles: { '1': 'ADMIN' }
  }
];

// ============================================================================
// DOCUMENTOS DE PRUEBA (FACTURAS EMITIDAS, RECIBIDAS, PENDIENTES Y OTROS)
// ============================================================================
export const DEMO_DOCUMENTS: Document[] = [
  // ── Facturas Emitidas (Ingresos) ──────────────────────────────────────────
  {
    id_documento: 8001,
    numero_documento: 'INV-2026-0089',
    tipo_documento: 'Factura Emitida',
    fecha_emision: '2026-08-24',
    fecha_vencimiento: '2026-09-24',
    fecha_creacion: '2026-08-24T10:15:00Z',
    moneda: 'EUR',
    observaciones: 'Servicios de consultoría tecnológica correspondientes a la Fase 2.',
    datos_extra: { cif: 'A98765432' },
    base_imponible: 12500.00,
    iva: 2625.00,
    total: 15125.00,
    is_new: 0,
    is_issued: 1,
    retencion_irpf: 0,
    proveedor: 'Innovatech Solutions S.L.',
    cif: 'B87654321',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      {
        id: 101,
        rol: 'emisor',
        nombre: 'Innovatech Solutions S.L.',
        direccion: 'Calle Gran Vía 42, Madrid',
        identificador_fiscal: 'B87654321',
        telefono: '+34 912 345 678',
        email: 'billing@innovatech.es',
        datos_extra: {}
      },
      {
        id: 102,
        rol: 'receptor',
        nombre: 'Grupo Industrial Muvail S.A.',
        direccion: 'Avenida de la Industria 15, Barcelona',
        identificador_fiscal: 'A98765432',
        telefono: '+34 934 567 890',
        email: 'compras@muvail-grupo.es',
        datos_extra: {}
      }
    ],
    lineas: [
      {
        id: 201,
        documento_id: 8001,
        codigo: 'CONS-002',
        descripcion: 'Consultoría e Implementación de Sistemas Cloud (Fase 2)',
        cantidad: 1,
        unidad: 'servicio',
        precio_unitario: 8500.00,
        descuento_porcentaje: 0,
        precio_neto: 8500.00,
        importe_linea: 8500.00,
        datos_extra: {}
      },
      {
        id: 202,
        documento_id: 8001,
        codigo: 'DEV-005',
        descripcion: 'Desarrollo de Modulo de Automatización de Procesos',
        cantidad: 1,
        unidad: 'servicio',
        precio_unitario: 4000.00,
        descuento_porcentaje: 0,
        precio_neto: 4000.00,
        importe_linea: 4000.00,
        datos_extra: {}
      }
    ],
    iva_details: [
      { id: 301, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 12500.00, cuota: 2625.00 }
    ],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8002,
    numero_documento: 'INV-2026-0088',
    tipo_documento: 'Factura Emitida',
    fecha_emision: '2026-08-15',
    fecha_vencimiento: '2026-09-15',
    fecha_creacion: '2026-08-15T11:30:00Z',
    moneda: 'EUR',
    observaciones: 'Licenciamiento anual plataforma SaaS Enterprise Q3',
    datos_extra: { cif: 'B54321987' },
    base_imponible: 8400.00,
    iva: 1764.00,
    total: 10164.00,
    is_new: 0,
    is_issued: 1,
    retencion_irpf: 0,
    proveedor: 'Innovatech Solutions S.L.',
    cif: 'B87654321',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 103, rol: 'emisor', nombre: 'Innovatech Solutions S.L.', direccion: 'Calle Gran Vía 42, Madrid', identificador_fiscal: 'B87654321', telefono: null, email: null, datos_extra: {} },
      { id: 104, rol: 'receptor', nombre: 'Consultoría Tecnológica Global S.L.', direccion: 'Paseo de la Castellana 120, Madrid', identificador_fiscal: 'B54321987', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [
      { id: 203, documento_id: 8002, codigo: 'SAAS-ENT', descripcion: 'Suscripción Licencia SaaS Enterprise 12 Meses', cantidad: 1, unidad: 'pack', precio_unitario: 8400.00, descuento_porcentaje: 0, precio_neto: 8400.00, importe_linea: 8400.00, datos_extra: {} }
    ],
    iva_details: [
      { id: 302, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 8400.00, cuota: 1764.00 }
    ],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8003,
    numero_documento: 'INV-2026-0087',
    tipo_documento: 'Factura Emitida',
    fecha_emision: '2026-08-01',
    fecha_vencimiento: '2026-08-31',
    fecha_creacion: '2026-08-01T09:00:00Z',
    moneda: 'EUR',
    observaciones: 'Diseño UX/UI y Prototipado para Aplicación Móvil',
    datos_extra: {},
    base_imponible: 6200.00,
    iva: 1302.00,
    total: 7502.00,
    is_new: 0,
    is_issued: 1,
    proveedor: 'Innovatech Solutions S.L.',
    cif: 'B87654321',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 105, rol: 'emisor', nombre: 'Innovatech Solutions S.L.', direccion: 'Calle Gran Vía 42, Madrid', identificador_fiscal: 'B87654321', telefono: null, email: null, datos_extra: {} },
      { id: 106, rol: 'receptor', nombre: 'Soluciones Creativas Alpha S.L.', direccion: 'Ronda de Sant Pere 18, Barcelona', identificador_fiscal: 'B33445566', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [
      { id: 204, documento_id: 8003, codigo: 'DESIGN-01', descripcion: 'Diseño de Interfaz y Experiencia de Usuario', cantidad: 1, unidad: 'proyecto', precio_unitario: 6200.00, descuento_porcentaje: 0, precio_neto: 6200.00, importe_linea: 6200.00, datos_extra: {} }
    ],
    iva_details: [
      { id: 303, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 6200.00, cuota: 1302.00 }
    ],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8004,
    numero_documento: 'INV-2026-0075',
    tipo_documento: 'Factura Emitida',
    fecha_emision: '2026-05-20',
    fecha_vencimiento: '2026-06-20',
    fecha_creacion: '2026-05-20T14:20:00Z',
    moneda: 'EUR',
    observaciones: 'Instalación y Configuración de Servidores de Alta Disponibilidad',
    datos_extra: {},
    base_imponible: 14800.00,
    iva: 3108.00,
    total: 17908.00,
    is_new: 0,
    is_issued: 1,
    proveedor: 'Innovatech Solutions S.L.',
    cif: 'B87654321',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 2,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 107, rol: 'emisor', nombre: 'Innovatech Solutions S.L.', direccion: 'Calle Gran Vía 42, Madrid', identificador_fiscal: 'B87654321', telefono: null, email: null, datos_extra: {} },
      { id: 108, rol: 'receptor', nombre: 'Edificaciones del Mediterráneo S.L.', direccion: 'Avenida del Puerto 88, Valencia', identificador_fiscal: 'B77889900', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [],
    iva_details: [{ id: 304, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 14800.00, cuota: 3108.00 }],
    archivos: [],
    incidencias: []
  },

  // ── Facturas Recibidas (Gastos) ──────────────────────────────────────────
  {
    id_documento: 8005,
    numero_documento: 'AWS-2026-98741',
    tipo_documento: 'Factura Recibida',
    fecha_emision: '2026-08-22',
    fecha_vencimiento: '2026-09-22',
    fecha_creacion: '2026-08-22T16:45:00Z',
    moneda: 'EUR',
    observaciones: 'Servicios de infraestructura Cloud EC2, S3 y RDS Agosto 2026',
    datos_extra: {},
    base_imponible: 1450.00,
    iva: 304.50,
    total: 1754.50,
    is_new: 0,
    is_issued: 0,
    proveedor: 'Amazon Web Services EMEA SARL',
    cif: 'EU826015342',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 109, rol: 'emisor', nombre: 'Amazon Web Services EMEA SARL', direccion: '38 Avenue John F. Kennedy, L-1855 Luxembourg', identificador_fiscal: 'EU826015342', telefono: null, email: 'aws-billing@amazon.com', datos_extra: {} },
      { id: 110, rol: 'receptor', nombre: 'Innovatech Solutions S.L.', direccion: 'Calle Gran Vía 42, Madrid', identificador_fiscal: 'B87654321', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [
      { id: 205, documento_id: 8005, codigo: 'AWS-EC2', descripcion: 'Compute Instance Usage (EC2 & Lambda)', cantidad: 1, unidad: 'mes', precio_unitario: 950.00, descuento_porcentaje: 0, precio_neto: 950.00, importe_linea: 950.00, datos_extra: {} },
      { id: 206, documento_id: 8005, codigo: 'AWS-S3', descripcion: 'Storage & Data Transfer (S3 & CloudFront)', cantidad: 1, unidad: 'mes', precio_unitario: 500.00, descuento_porcentaje: 0, precio_neto: 500.00, importe_linea: 500.00, datos_extra: {} }
    ],
    iva_details: [{ id: 305, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 1450.00, cuota: 304.50 }],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8006,
    numero_documento: 'TEL-2026-04981',
    tipo_documento: 'Factura Recibida',
    fecha_emision: '2026-08-18',
    fecha_vencimiento: '2026-09-05',
    fecha_creacion: '2026-08-18T08:12:00Z',
    moneda: 'EUR',
    observaciones: 'Fibra Óptica Simétrica 1Gbps + 12 Líneas Móviles Corporativas',
    datos_extra: {},
    base_imponible: 480.00,
    iva: 100.80,
    total: 580.80,
    is_new: 0,
    is_issued: 0,
    proveedor: 'Telefónica España S.A.U.',
    cif: 'A28015865',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 111, rol: 'emisor', nombre: 'Telefónica España S.A.U.', direccion: 'Ronda de la Comunicación s/n, Madrid', identificador_fiscal: 'A28015865', telefono: null, email: null, datos_extra: {} },
      { id: 112, rol: 'receptor', nombre: 'Innovatech Solutions S.L.', direccion: 'Calle Gran Vía 42, Madrid', identificador_fiscal: 'B87654321', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [],
    iva_details: [{ id: 306, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 480.00, cuota: 100.80 }],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8007,
    numero_documento: 'GGL-2026-88123',
    tipo_documento: 'Factura Recibida',
    fecha_emision: '2026-08-10',
    fecha_vencimiento: '2026-08-31',
    fecha_creacion: '2026-08-10T15:20:00Z',
    moneda: 'EUR',
    observaciones: 'Google Workspace Enterprise - 45 Cuentas de usuario',
    datos_extra: {},
    base_imponible: 890.00,
    iva: 186.90,
    total: 1076.90,
    is_new: 0,
    is_issued: 0,
    proveedor: 'Google Ireland Limited',
    cif: 'IE6388047V',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 113, rol: 'emisor', nombre: 'Google Ireland Limited', direccion: 'Gordon House, Barrow Street, Dublin 4, Ireland', identificador_fiscal: 'IE6388047V', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [],
    iva_details: [{ id: 307, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 890.00, cuota: 186.90 }],
    archivos: [],
    incidencias: []
  },
  {
    id_documento: 8008,
    numero_documento: 'SUM-2026-01294',
    tipo_documento: 'Factura Recibida',
    fecha_emision: '2026-08-05',
    fecha_vencimiento: '2026-09-05',
    fecha_creacion: '2026-08-05T09:40:00Z',
    moneda: 'EUR',
    observaciones: 'Equipamiento informático y monitores 4K para oficina',
    datos_extra: {},
    base_imponible: 2150.00,
    iva: 451.50,
    total: 2601.50,
    is_new: 0,
    is_issued: 0,
    proveedor: 'Suministros Industriales Iberia S.L.',
    cif: 'B98123456',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [],
    lineas: [],
    iva_details: [{ id: 308, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 2150.00, cuota: 451.50 }],
    archivos: [],
    incidencias: []
  },

  // ── Documentos Sin Confirmar ──────────────────────────────────────────────
  {
    id_documento: 8009,
    numero_documento: 'PEND-2026-0001 (Sin Confirmar)',
    tipo_documento: 'Factura Recibida (Sin Confirmar)',
    fecha_emision: '2026-08-26',
    fecha_vencimiento: '2026-09-26',
    fecha_creacion: '2026-08-26T17:00:00Z',
    moneda: 'EUR',
    observaciones: 'Pendiente de verificar desglose de potencia e impuestos eléctricos',
    datos_extra: {},
    base_imponible: 620.00,
    iva: 130.20,
    total: 750.20,
    is_new: 1,
    is_issued: 0,
    proveedor: 'Iberdrola Clientes S.A.U.',
    cif: 'A95758389',
    incidencia: true,
    verificado: false,
    incidencia_razon: 'Comprobación de término de potencia e IVA 21% requerida',
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [
      { id: 115, rol: 'emisor', nombre: 'Iberdrola Clientes S.A.U.', direccion: 'Plaza Euskadi 5, Bilbao', identificador_fiscal: 'A95758389', telefono: null, email: null, datos_extra: {} }
    ],
    lineas: [],
    iva_details: [{ id: 309, tipo_impuesto: 'IVA General', porcentaje: 21, base_imponible: 620.00, cuota: 130.20 }],
    archivos: [],
    incidencias: [
      {
        id: 501,
        documento_id: 8009,
        incidencia: true,
        fecha_incidencia: '2026-08-26T17:00:00Z',
        descripcion: 'Verificar si aplica reducción de impuesto eléctrico en factura de suministro',
        validado: false,
        fecha_validacion: null,
        validado_por: null
      }
    ]
  },

  // ── Otros Documentos ──────────────────────────────────────────────────────
  {
    id_documento: 8010,
    numero_documento: 'ALB-2026-0042',
    tipo_documento: 'Albarán de Entrega',
    fecha_emision: '2026-08-21',
    fecha_vencimiento: null,
    fecha_creacion: '2026-08-21T12:00:00Z',
    moneda: 'EUR',
    observaciones: 'Albarán de recepción de material de oficina y papelería',
    datos_extra: {},
    base_imponible: 340.00,
    iva: 71.40,
    total: 411.40,
    is_new: 0,
    is_issued: 0,
    proveedor: 'Distribuidora Central de Papelería S.L.',
    cif: 'B11223344',
    incidencia: false,
    verificado: true,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    empresa_cif: 'B87654321',
    num_trimestre: 3,
    año_trimestre: 2026,
    trimestre_cerrado: 0,
    entidades: [],
    lineas: [],
    iva_details: [],
    archivos: [],
    incidencias: []
  }
];

// ============================================================================
// DASHBOARD ANALYTICS DE PRUEBA (MÉTRICAS Y GRÁFICOS)
// ============================================================================
export const DEMO_DASHBOARD_ANALYTICS: DashboardAnalytics = {
  kpis: {
    totalIngresos: 53100.00,
    totalGastos: 7150.00,
    totalIngresosSinIva: 43900.00,
    totalGastosSinIva: 5910.00,
    totalFacturasIngreso: 5,
    totalFacturasGasto: 7,
    beneficio: 45950.00,
    beneficioSinIva: 37990.00,
    ivaRepercutido: 9200.00,
    ivaSoportado: 1240.00,
    recargoRepercutido: 0,
    recargoSoportado: 0,
    retencionRepercutido: 0,
    retencionSoportado: 0,
    resultadoIva: 7960.00,
    incidenciasAbiertas: 1,
    totalProveedores: 5,
    totalProductos: 14,
    incidentRate: 7.1,
    totalDocs: 13,
    hasMismatches: false
  },
  quarterlySummary: {
    '1': { ingresos: 13552.00, gastos: 1113.20 },
    '2': { ingresos: 17908.00, gastos: 1669.80 },
    '3': { ingresos: 32791.00, gastos: 6013.70 },
    '4': { ingresos: 0.00, gastos: 0.00 }
  },
  yearlySummary: {
    '2026': { ingresos: 64251.00, gastos: 8796.70 },
    '2025': { ingresos: 185400.00, gastos: 42100.00 },
    '2024': { ingresos: 142000.00, gastos: 38500.00 }
  },
  multiYearQuarterlySummary: {
    '2026': {
      '1': { ingresos: 13552.00, gastos: 1113.20 },
      '2': { ingresos: 17908.00, gastos: 1669.80 },
      '3': { ingresos: 32791.00, gastos: 6013.70 },
      '4': { ingresos: 0.00, gastos: 0.00 }
    },
    '2025': {
      '1': { ingresos: 42000.00, gastos: 9500.00 },
      '2': { ingresos: 48500.00, gastos: 11200.00 },
      '3': { ingresos: 45100.00, gastos: 10400.00 },
      '4': { ingresos: 49800.00, gastos: 11000.00 }
    }
  },
  documentDistribution: [
    { name: 'Facturas Emitidas', value: 5 },
    { name: 'Facturas Recibidas', value: 7 },
    { name: 'Sin Confirmar', value: 1 },
    { name: 'Otros Documentos', value: 1 }
  ],
  ivaSummary: {
    '1': { repercutido: 2352.00, soportado: 193.20 },
    '2': { repercutido: 3108.00, soportado: 289.80 },
    '3': { repercutido: 5691.00, soportado: 1043.70 },
    '4': { repercutido: 0.00, soportado: 0.00 }
  },
  ivaYearlySummary: {
    '2026': { repercutido: 11151.00, soportado: 1526.70 }
  },
  multiYearIvaSummary: {
    '2026': {
      '1': { repercutido: 2352.00, soportado: 193.20 },
      '2': { repercutido: 3108.00, soportado: 289.80 },
      '3': { repercutido: 5691.00, soportado: 1043.70 },
      '4': { repercutido: 0.00, soportado: 0.00 }
    }
  },
  topProviders: [
    { name: 'Amazon Web Services EMEA', total: 3424.30, fiscalId: 'EU826015342' },
    { name: 'Suministros Industriales Iberia S.L.', total: 2601.50, fiscalId: 'B98123456' },
    { name: 'Telefónica España S.A.U.', total: 1137.40, fiscalId: 'A28015865' },
    { name: 'Google Ireland Limited', total: 1076.90, fiscalId: 'IE6388047V' },
    { name: 'Distribuidora Central de Papelería S.L.', total: 411.40, fiscalId: 'B11223344' }
  ],
  yearUsed: 2026
};

// ============================================================================
// PROVEEDORES DE PRUEBA
// ============================================================================
export const DEMO_PROVEEDORES: ProviderWithStats[] = [
  {
    id: 1,
    rol: 'proveedor',
    nombre: 'Amazon Web Services EMEA SARL',
    direccion: '38 Avenue John F. Kennedy, Luxembourg',
    identificador_fiscal: 'EU826015342',
    telefono: '+352 2789 0011',
    email: 'aws-billing@amazon.com',
    datos_extra: {},
    totalSpent: 3424.30,
    totalDocuments: 2,
    uniqueProducts: 2,
    empresaNombre: 'Innovatech Solutions S.L.'
  },
  {
    id: 2,
    rol: 'proveedor',
    nombre: 'Telefónica España S.A.U.',
    direccion: 'Ronda de la Comunicación s/n, Madrid',
    identificador_fiscal: 'A28015865',
    telefono: '+34 900 101 010',
    email: 'facturacion@telefonica.es',
    datos_extra: {},
    totalSpent: 1137.40,
    totalDocuments: 2,
    uniqueProducts: 1,
    empresaNombre: 'Innovatech Solutions S.L.'
  },
  {
    id: 3,
    rol: 'proveedor',
    nombre: 'Google Ireland Limited',
    direccion: 'Gordon House, Barrow Street, Dublin',
    identificador_fiscal: 'IE6388047V',
    telefono: '+353 1 436 1000',
    email: 'billing-europe@google.com',
    datos_extra: {},
    totalSpent: 1076.90,
    totalDocuments: 1,
    uniqueProducts: 1,
    empresaNombre: 'Innovatech Solutions S.L.'
  },
  {
    id: 4,
    rol: 'proveedor',
    nombre: 'Suministros Industriales Iberia S.L.',
    direccion: 'Polígono Industrial Las Mercedes, Madrid',
    identificador_fiscal: 'B98123456',
    telefono: '+34 918 765 432',
    email: 'ventas@suministrosiberia.com',
    datos_extra: {},
    totalSpent: 2601.50,
    totalDocuments: 1,
    uniqueProducts: 3,
    empresaNombre: 'Innovatech Solutions S.L.'
  }
];

// ============================================================================
// INCIDENCIAS / AUDITORÍA DE PRUEBA
// ============================================================================
export const DEMO_INCIDENTS: Incident[] = [
  {
    id: 501,
    documento_id: 8009,
    incidencia: true,
    fecha_incidencia: '2026-08-26T17:00:00Z',
    descripcion: 'Verificar si aplica reducción de impuesto eléctrico en factura de suministro',
    validado: false,
    fecha_validacion: null,
    validado_por: null
  }
];

// ============================================================================
// TRIMESTRES DE PRUEBA
// ============================================================================
export const DEMO_TRIMESTRES: Trimestre[] = [
  {
    año: 2026,
    trimestre: 1,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    total_documentos: 2,
    total_ingresos: 13552.00,
    total_gastos: 1113.20,
    total_ingresos_sin_iva: 11200.00,
    total_gastos_sin_iva: 920.00,
    iva_repercutido: 2352.00,
    iva_soportado: 193.20,
    recargo_repercutido: 0,
    recargo_soportado: 0,
    cerrado: true,
    cerrado_estado: 1,
    fecha_cierre: '2026-04-15T18:00:00Z'
  },
  {
    año: 2026,
    trimestre: 2,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    total_documentos: 2,
    total_ingresos: 17908.00,
    total_gastos: 1669.80,
    total_ingresos_sin_iva: 14800.00,
    total_gastos_sin_iva: 1380.00,
    iva_repercutido: 3108.00,
    iva_soportado: 289.80,
    recargo_repercutido: 0,
    recargo_soportado: 0,
    cerrado: true,
    cerrado_estado: 1,
    fecha_cierre: '2026-07-15T19:30:00Z'
  },
  {
    año: 2026,
    trimestre: 3,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    total_documentos: 9,
    total_ingresos: 32791.00,
    total_gastos: 6013.70,
    total_ingresos_sin_iva: 27100.00,
    total_gastos_sin_iva: 4970.00,
    iva_repercutido: 5691.00,
    iva_soportado: 1043.70,
    recargo_repercutido: 0,
    recargo_soportado: 0,
    cerrado: false,
    cerrado_estado: 0,
    fecha_cierre: null
  },
  {
    año: 2026,
    trimestre: 4,
    empresa_id: 9991,
    empresa_nombre: 'Innovatech Solutions S.L.',
    total_documentos: 0,
    total_ingresos: 0,
    total_gastos: 0,
    total_ingresos_sin_iva: 0,
    total_gastos_sin_iva: 0,
    iva_repercutido: 0,
    iva_soportado: 0,
    recargo_repercutido: 0,
    recargo_soportado: 0,
    cerrado: false,
    cerrado_estado: 0,
    fecha_cierre: null
  }
];

// ============================================================================
// ACTIVIDAD Y AUDIT LOG DE PRUEBA
// ============================================================================
export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: 9001,
    upload_id: 'upl_demo_01',
    parent_upload_id: null,
    id_de_empresa: 9991,
    documento_id: 8001,
    documento_nombre: 'factura_consultoria_q3.pdf',
    documento_tipo: 'application/pdf',
    status: 'COMPLETED',
    step: 'DONE',
    progress: 100,
    mensaje: 'Documento procesado y validado correctamente',
    error_detalle: null,
    created_at: '2026-08-24T10:14:00Z',
    updated_at: '2026-08-24T10:15:00Z',
    completed_at: '2026-08-24T10:15:00Z',
    nombre_de_empresa: 'Innovatech Solutions S.L.',
    CIF: 'B87654321',
    tipo_documento: 'Factura Emitida',
    numero_documento: 'INV-2026-0089',
    empresa_emisora: 'Innovatech Solutions S.L.',
    cliente: 'Grupo Industrial Muvail S.A.',
    is_new: 0,
    'dashboard-correo': 'dashboard'
  },
  {
    id: 9002,
    upload_id: 'upl_demo_02',
    parent_upload_id: null,
    id_de_empresa: 9991,
    documento_id: 8005,
    documento_nombre: 'aws_invoice_august_2026.pdf',
    documento_tipo: 'application/pdf',
    status: 'COMPLETED',
    step: 'DONE',
    progress: 100,
    mensaje: 'Clasificado como Gasto Cloud Services (AWS)',
    error_detalle: null,
    created_at: '2026-08-22T16:44:00Z',
    updated_at: '2026-08-22T16:45:00Z',
    completed_at: '2026-08-22T16:45:00Z',
    nombre_de_empresa: 'Innovatech Solutions S.L.',
    CIF: 'B87654321',
    tipo_documento: 'Factura Recibida',
    numero_documento: 'AWS-2026-98741',
    empresa_emisora: 'Amazon Web Services EMEA SARL',
    cliente: 'Innovatech Solutions S.L.',
    is_new: 0,
    'dashboard-correo': 'correo'
  }
];

// ============================================================================
// AUDITORÍA Y CENTRO DE SEGURIDAD DE PRUEBA
// ============================================================================
export const DEMO_AUDITORIA_DATA = {
  summary: {
    total: 13,
    mismatches: 1,
    logic_checks: 1,
  },
  documents: DEMO_DOCUMENTS,
  triggeredDiagnoses: [],
};

export const DEMO_INCIDENTS_ANALYTICS = {
  totalOpen: 1,
  totalValidated: 4,
  byProvider: [
    { provider: 'Iberdrola Clientes S.A.U.', count: 1 }
  ],
  byType: [
    { type: 'Verificación Término de Potencia', count: 1 }
  ],
  docIdsByType: {
    'Verificación Término de Potencia': [8009]
  }
};

