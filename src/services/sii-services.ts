// src/services/sii-services.ts
import soap from 'soap';
import forge from 'node-forge';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import path from 'path';
import axios from 'axios';

const dnsResolve = promisify(dns.resolve4);

// ============================================================
// TIPOS Y CONSTANTES
// ============================================================

interface SIIFactura {
  numero: string;
  fecha: string;
  nif_emisor: string;
  nif_receptor?: string;
  nombre_receptor?: string;
  pais_receptor?: string;
  pais_emisor?: string;
  base_imponible: number;
  tipo_iva: number;
  cuota_iva: number;
  total: number;
  descripcion: string;
  tipo_factura?: string;
  clave_regimen?: string;
}

interface SIIPayload {
  ejercicio: number;
  periodo: string;
  empresa_nif: string;
  empresa_nombre: string;
  facturas_emitidas: SIIFactura[];
}

// ============================================================
// CONFIGURACIÓN — URLs verificadas contra WSDL oficial AEAT (junio 2026)
// Fuente: https://sede.agenciatributaria.gob.es/.../wsdl-servicios-web.html
// ============================================================

/**
 * WSDL oficiales descargados de la Sede Electrónica de la AEAT (V_1_1):
 * - SuministroFactEmitidas.wsdl  → operaciones: SuministroLRFacturasEmitidas, AnulacionLRFacturasEmitidas,
 *                                                ConsultaLRFacturasEmitidas, ConsultaLRFactInformadasCliente,
 *                                                ConsultaLRFactInformadasAgrupadasCliente
 * - SuministroFactRecibidas.wsdl → operaciones: SuministroLRFacturasRecibidas, AnulacionLRFacturasRecibidas,
 *                                                ConsultaLRFacturasRecibidas, ConsultaLRFactInformadasProveedor,
 *                                                ConsultaLRFactInformadasAgrupadasProveedor
 * - ConsultaLLAA.wsdl            → operaciones: ConsultaLLAA  (libros registro global)
 *
 * NOTA: la librería `soap` usará el WSDL para descubrir los métodos y los llama
 * como client.NombreOperacionAsync(body). No usar Async cuando hay problemas con soap.
 */
const SII_WSDL_BASE = 'https://sede.agenciatributaria.gob.es/static_files/Sede/Procedimiento_ayuda/G417/FicherosSuministros/V_1_1/WSDL';

const SII_CONFIG = {
  // === FACTURAS EMITIDAS ===
  emitidas: {
    produccion: {
      // Certificado de usuario
      wsdl: `${SII_WSDL_BASE}/SuministroFactEmitidas.wsdl`,
      endpoint: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    },
    produccion_sello: {
      // Certificado de sello de entidad
      wsdl: `${SII_WSDL_BASE}/SuministroFactEmitidas.wsdl`,
      endpoint: 'https://www10.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    },
    pruebas: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactEmitidas.wsdl`,
      endpoint: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    },
    pruebas_sello: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactEmitidas.wsdl`,
      endpoint: 'https://prewww10.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    },
  },

  // === FACTURAS RECIBIDAS ===
  recibidas: {
    produccion: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactRecibidas.wsdl`,
      endpoint: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
    },
    produccion_sello: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactRecibidas.wsdl`,
      endpoint: 'https://www10.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
    },
    pruebas: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactRecibidas.wsdl`,
      endpoint: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
    },
    pruebas_sello: {
      wsdl: `${SII_WSDL_BASE}/SuministroFactRecibidas.wsdl`,
      endpoint: 'https://prewww10.aeat.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
    },
  },

  // === CONSULTA LLAA (Libros registro — estado de envíos) ===
  llaa: {
    produccion: {
      wsdl: `${SII_WSDL_BASE}/ConsultaLLAA.wsdl`,
      endpoint: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/llaa/SiiLLAAV1SOAP',
    },
    produccion_sello: {
      wsdl: `${SII_WSDL_BASE}/ConsultaLLAA.wsdl`,
      endpoint: 'https://www10.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/llaa/SiiLLAAV1SOAP',
    },
    pruebas: {
      wsdl: `${SII_WSDL_BASE}/ConsultaLLAA.wsdl`,
      endpoint: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/llaa/SiiLLAAV1SOAP',
    },
    pruebas_sello: {
      wsdl: `${SII_WSDL_BASE}/ConsultaLLAA.wsdl`,
      endpoint: 'https://prewww10.aeat.es/wlpl/SSII-FACT/ws/llaa/SiiLLAAV1SOAP',
    },
  },
};

// Acceso rápido para compatibilidad con el código existente
const SII_COMPAT = {
  produccion: SII_CONFIG.emitidas.produccion,
  pruebas: SII_CONFIG.emitidas.pruebas,
};

const WSDL_LOCAL = {
  produccion: path.join(process.cwd(), 'public', 'wsdl', 'sii-produccion.wsdl'),
  pruebas: path.join(process.cwd(), 'public', 'wsdl', 'sii-pruebas.wsdl')
};

// ============================================================
// SERVICIO SII
// ============================================================

class SIIService {
  private entorno: 'produccion' | 'pruebas';
  private usarWSDLLocal: boolean;

  constructor() {
    this.entorno = (process.env.SII_ENVIRONMENT as any) || 'pruebas';
    this.usarWSDLLocal = process.env.SII_WSDL_LOCAL === 'true';
    
    console.log(`🔧 [SII] Inicializado en modo: ${this.entorno.toUpperCase()}`);
    console.log(`📍 [SII] Endpoint base (emitidas): ${SII_COMPAT[this.entorno].endpoint}`);
  }

  // ============================================================
  // CONFIGURACIÓN DNS
  // ============================================================

  private async configurarDNS(): Promise<void> {
    try {
      dns.setServers(['8.8.8.8', '8.8.4.4']);
      console.log('🌐 [SII] DNS configurado: Google DNS (8.8.8.8)');
    } catch (error) {
      console.warn('⚠️ [SII] No se pudo configurar DNS:', error);
    }
  }

  // ============================================================
  // CARGA DE CERTIFICADO
  // ============================================================

  private cargarCertificado(certificadoBase64: string, password: string) {
    console.log('🔐 [SII] Cargando certificado...');
    
    const p12Der = forge.util.decode64(certificadoBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const pkeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const cert = certBags[forge.pki.oids.certBag]?.[0];
    const pkey = pkeyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];

    if (!cert?.cert || !pkey?.key) {
      throw new Error('No se pudo extraer certificado o clave privada');
    }

    const certPem = forge.pki.certificateToPem(cert.cert);
    const keyPem = forge.pki.privateKeyToPem(pkey.key);

    console.log('✅ [SII] Certificado cargado correctamente');
    console.log(`📋 [SII] Subject: ${cert.cert.subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(', ')}`);
    console.log(`📅 [SII] Válido hasta: ${cert.cert.validity.notAfter}`);

    return { 
      certPem, 
      keyPem, 
      certificado: cert.cert 
    };
  }

  // ============================================================
  // CREACIÓN DE CLIENTE SOAP CON AXIOS
  // ============================================================

  private async crearCliente(certPem: string, keyPem: string, overrideEndpoint?: string, overrideWsdlUrl?: string): Promise<soap.Client> {
    console.log('🔌 [SII] Creando cliente SOAP...');
    
    await this.configurarDNS();

    const wsdlUrl = overrideWsdlUrl || (this.usarWSDLLocal ? WSDL_LOCAL[this.entorno] : SII_COMPAT[this.entorno].wsdl);
    console.log(`📄 [SII] WSDL: ${wsdlUrl}`);

    // ✅ Crear agente HTTPS con el certificado
    const httpsAgent = new https.Agent({
      cert: certPem,
      key: keyPem,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      keepAlive: true,
      timeout: 30000,
    });

    console.log('🔒 [SII] Agente HTTPS configurado con certificado mTLS');

    try {
      // ✅ Crear instancia de axios con el agente HTTPS
      const axiosInstance = axios.create({
        httpsAgent,
        timeout: 30000,
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': '',
        },
      });

      console.log('✅ [SII] Instancia de axios creada con certificado');

      // ✅ Crear cliente SOAP (endpoint se inyecta para permitir emitidas/recibidas/llaa)
      const client = await soap.createClientAsync(wsdlUrl, {
        endpoint: overrideEndpoint || SII_COMPAT[this.entorno].endpoint,
        request: axiosInstance,
        wsdl_options: {
          httpsAgent,
        },
      });

      console.log('✅ [SII] Cliente SOAP creado correctamente');

      // ✅ Verificar servicios disponibles
      const services = client.describe();
      const serviceNames = Object.keys(services);
      console.log(`📋 [SII] Servicios disponibles: ${serviceNames.join(', ')}`);

      if (serviceNames.length > 0) {
        const operations = Object.keys(services[serviceNames[0]]).flatMap(port => 
          Object.keys(services[serviceNames[0]][port])
        );
        console.log(`📋 [SII] Operaciones disponibles: ${operations.length}`);
      }

      return client;

    } catch (error: any) {
      console.error('❌ [SII] Error al crear cliente SOAP:', error);
      console.error('📋 [SII] Mensaje:', error.message);
      if (error.response) {
        console.error('📋 [SII] Response status:', error.response.status);
        console.error('📋 [SII] Response data:', error.response.data?.substring(0, 500));
      }
      throw error;
    }
  }

  // ============================================================
  // FORMATEO DE FECHA
  // ============================================================

  private formatearFecha(fecha: string): string {
    const fechaBase = fecha.split('T')[0]; // quitar parte de hora si existe

    // Si ya está en formato DD-MM-YYYY, devolverla tal cual
    const yaFormateada = /^\d{2}-\d{2}-\d{4}$/.test(fechaBase);
    if (yaFormateada) {
      console.log(`📅 [SII] Fecha ya formateada: ${fecha} -> ${fechaBase}`);
      return fechaBase;
    }

    // Si viene como YYYY-MM-DD, convertir a DD-MM-YYYY
    const [year, month, day] = fechaBase.split('-');
    const resultado = `${day}-${month}-${year}`;
    console.log(`📅 [SII] Fecha formateada: ${fecha} -> ${resultado}`);
    return resultado;
  }

  // ============================================================
  // ENVÍO DE FACTURAS EMITIDAS
  // ============================================================

  async enviarFacturasEmitidas(
    payload: SIIPayload,
    certificadoBase64: string,
    password: string
  ) {
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const client = await this.crearCliente(certPem, keyPem);

      console.log('📝 [SII] Construyendo XML SOAP...');
      
      const registros = payload.facturas_emitidas.map(factura => {
        const tieneReceptor = !!(factura.nif_receptor && factura.nif_receptor.trim());
        const tipoFactura = factura.tipo_factura ? factura.tipo_factura : (tieneReceptor ? 'F1' : 'F2');

        const facturaExpedida: any = {
          TipoFactura: tipoFactura,
          ClaveRegimenEspecialOTrascendencia: factura.clave_regimen || '01',
          ImporteTotal: factura.total.toFixed(2),
          DescripcionOperacion: factura.descripcion,
        };

        if (tieneReceptor) {
          const nifReceptorLimpio = (factura.nif_receptor || '').trim().toUpperCase();
          const paisReceptor = (factura.pais_receptor || 'ES').trim().toUpperCase();

          if (paisReceptor === 'ES') {
            facturaExpedida.Contraparte = {
              NombreRazon: factura.nombre_receptor || 'Cliente',
              NIF: nifReceptorLimpio,
            };
          } else {
            facturaExpedida.Contraparte = {
              NombreRazon: factura.nombre_receptor || 'Cliente',
              IDOtro: {
                CodigoPais: paisReceptor,
                IDType: '07',
                ID: nifReceptorLimpio || '000000000',
              },
            };
          }
        }

        facturaExpedida.TipoDesglose = {
          DesgloseFactura: {
            Sujeta: {
              NoExenta: {
                TipoNoExenta: 'S1',
                DesgloseIVA: {
                  DetalleIVA: [{
                    TipoImpositivo: factura.tipo_iva.toFixed(2),
                    BaseImponible: factura.base_imponible.toFixed(2),
                    CuotaRepercutida: factura.cuota_iva.toFixed(2),
                  }],
                },
              },
            },
          },
        };

        const registro: any = {
          PeriodoLiquidacion: {
            Ejercicio: payload.ejercicio.toString(),
            Periodo: payload.periodo,
          },
          IDFactura: {
            IDEmisorFactura: {
              NIF: factura.nif_emisor,
            },
            NumSerieFacturaEmisor: factura.numero,
            FechaExpedicionFacturaEmisor: this.formatearFecha(factura.fecha),
          },
          FacturaExpedida: facturaExpedida,
        };

        return registro;
      });

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: {
            NombreRazon: payload.empresa_nombre,
            NIF: payload.empresa_nif,
          },
          TipoComunicacion: 'A0',
        },
        RegistroLRFacturasEmitidas: registros,
      };

      console.log('📝 [SII] XML SOAP construido');
      console.log('📋 [SII] Body preview:', JSON.stringify(soapBody, null, 2).substring(0, 500));

      if (!client.SuministroLRFacturasEmitidasAsync) {
        const methods = Object.keys(client);
        console.error('❌ [SII] Método SuministroLRFacturasEmitidasAsync no encontrado');
        console.error('📋 [SII] Métodos disponibles:', methods.join(', '));
        throw new Error('Método SuministroLRFacturasEmitidasAsync no encontrado en el cliente SOAP');
      }

      console.log('🚀 [SII] Enviando petición al SII...');
      
      const [result] = await client.SuministroLRFacturasEmitidasAsync(soapBody);
      
      console.log('✅ [SII] Respuesta recibida del SII');
      console.log('📋 [SII] Respuesta completa:', JSON.stringify(result, null, 2).substring(0, 1000));

      const respuesta = result?.RespuestaLinea || result;
      const estadoEnvio = result?.EstadoEnvio || 'Desconocido';
      const csv = result?.CSV || 'N/A';

      let facturasArray = [];
      if (Array.isArray(respuesta)) {
        facturasArray = respuesta;
      } else if (respuesta) {
        facturasArray = [respuesta];
      }

      const detalles = facturasArray.map((factura: any) => {
        const estado = factura.EstadoRegistro || 'Desconocido';
        const errores = [];

        if (factura.CodigoErrorRegistro) {
          errores.push({
            codigo: factura.CodigoErrorRegistro,
            descripcion: factura.DescripcionErrorRegistro
          });
        }

        if (factura.RegistroSiiFaltas?.length > 0) {
          errores.push(...factura.RegistroSiiFaltas.map((e: any) => ({
            codigo: e.CodigoErrorRegistro,
            descripcion: e.DescripcionErrorRegistro
          })));
        }

        return {
          numero_factura: factura.IDFactura?.NumSerieFacturaEmisor || 'N/A',
          estado,
          codigo_error: factura.CodigoErrorRegistro,
          descripcion_error: factura.DescripcionErrorRegistro,
          errores,
        };
      });

      const facturasAceptadas = detalles.filter((d: any) => d.estado === 'Correcto').length;
      const facturasRechazadas = detalles.filter((d: any) => d.estado !== 'Correcto').length;

      console.log('✅ [SII] Proceso completado');
      console.log(`   ✔️  Aceptadas: ${facturasAceptadas}`);
      console.log(`   ❌ Rechazadas: ${facturasRechazadas}`);

      const primerRechazo = detalles.find((d: any) => d.estado !== 'Correcto');
      const primerErrorDesc = primerRechazo?.descripcion_error || (primerRechazo?.errores?.[0]?.descripcion);
      const primerErrorCode = primerRechazo?.codigo_error || (primerRechazo?.errores?.[0]?.codigo);
      const errorGeneralText = primerErrorDesc ? (primerErrorCode ? `[Error ${primerErrorCode}] ${primerErrorDesc}` : primerErrorDesc) : 'Algunas facturas fueron rechazadas';

      return {
        success: estadoEnvio === 'Correcto',
        csv,
        estado: estadoEnvio,
        facturas_aceptadas: facturasAceptadas,
        facturas_rechazadas: facturasRechazadas,
        detalles,
        error_general: estadoEnvio !== 'Correcto' ? errorGeneralText : null
      };

    } catch (error: any) {
      console.error('❌ [SII] Error al enviar facturas:', error.message);
      
      const errorInfo: any = {
        message: error.message,
        stack: error.stack?.substring(0, 500),
      };

      if (error.response) {
        errorInfo.response = {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 1000) 
            : JSON.stringify(error.response.data).substring(0, 1000)
        };
      }

      if (error.config) {
        errorInfo.request = {
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers,
        };
      }
      
      console.error('📋 [SII] Error detallado:', JSON.stringify(errorInfo, null, 2));
      
      return {
        success: false,
        csv: null,
        estado: 'Error',
        facturas_aceptadas: 0,
        facturas_rechazadas: payload.facturas_emitidas.length,
        detalles: [],
        error_general: error.message || 'Error desconocido al conectar con AEAT'
      };
    }
  }

  // ============================================================
  // SUMINISTRO / ALTA DE FACTURAS RECIBIDAS (SuministroLRFacturasRecibidas)
  // ============================================================

  async enviarFacturasRecibidas(
    payload: {
      ejercicio: number;
      periodo: string;
      empresa_nif: string;
      empresa_nombre: string;
      facturas_recibidas: Array<{
        numero: string;
        fecha: string;
        nif_emisor: string;
        nombre_emisor?: string;
        base_imponible: number;
        tipo_iva: number;
        cuota_iva: number;
        total: number;
        descripcion: string;
        tipo_factura?: string;
        clave_regimen?: string;
        cuota_deducible?: number;
      }>;
    },
    certificadoBase64: string,
    password: string
  ) {
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      
      const wsdlRecibidas = this.usarWSDLLocal 
        ? path.join(process.cwd(), 'public', 'wsdl', 'sii-recibidas-pruebas.wsdl')
        : 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroFactRecibidas.wsdl';

      const endpointRecibidas = SII_CONFIG.recibidas[this.entorno].endpoint;
      const client = await this.crearCliente(certPem, keyPem, endpointRecibidas, wsdlRecibidas);

      console.log('📝 [SII-RECIBIDAS] Construyendo XML SOAP para Facturas Recibidas...');
      
      const registros = payload.facturas_recibidas.map(factura => {
        const tieneEmisorNif = !!(factura.nif_emisor && factura.nif_emisor.trim());
        const tipoFactura = factura.tipo_factura ? factura.tipo_factura : (tieneEmisorNif ? 'F1' : 'F2');
        const cuotaDeducible = factura.cuota_deducible !== undefined ? factura.cuota_deducible : factura.cuota_iva;
        const fechaFormateada = this.formatearFecha(factura.fecha);

        return {
          PeriodoLiquidacion: {
            Ejercicio: payload.ejercicio.toString(),
            Periodo: payload.periodo.padStart(2, '0'),
          },
          IDFactura: {
            IDEmisorFactura: {
              NIF: tieneEmisorNif ? factura.nif_emisor.trim() : payload.empresa_nif,
            },
            NumSerieFacturaEmisor: factura.numero,
            FechaExpedicionFacturaEmisor: fechaFormateada,
          },
          FacturaRecibida: {
            TipoFactura: tipoFactura,
            ClaveRegimenEspecialOTrascendencia: factura.clave_regimen || '01',
            ImporteTotal: (factura.total || 0).toFixed(2),
            DescripcionOperacion: factura.descripcion || 'Gasto / Servicio recibido',
            DesgloseFactura: {
              DesgloseIVA: {
                DetalleIVA: [{
                  TipoImpositivo: (factura.tipo_iva || 0).toFixed(2),
                  BaseImponible: (factura.base_imponible || 0).toFixed(2),
                  CuotaSoportada: (factura.cuota_iva || 0).toFixed(2),
                }],
              },
            },
            Contraparte: {
              NombreRazon: factura.nombre_emisor || 'Proveedor',
              NIF: tieneEmisorNif ? factura.nif_emisor.trim() : payload.empresa_nif,
            },
            FechaRegContable: fechaFormateada,
            CuotaDeducible: cuotaDeducible.toFixed(2),
          },
        };
      });

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: {
            NombreRazon: payload.empresa_nombre,
            NIF: payload.empresa_nif,
          },
          TipoComunicacion: 'A0',
        },
        RegistroLRFacturasRecibidas: registros,
      };

      console.log('🚀 [SII-RECIBIDAS] Enviando petición a AEAT...');
      
      if (!client.SuministroLRFacturasRecibidasAsync) {
        throw new Error('Método SuministroLRFacturasRecibidasAsync no encontrado en cliente SOAP');
      }

      const [result] = await client.SuministroLRFacturasRecibidasAsync(soapBody);
      console.log('✅ [SII-RECIBIDAS] Respuesta recibida de AEAT');

      console.log('📨 [SII-RECIBIDAS] Respuesta RAW de AEAT:', JSON.stringify(result, null, 2));

      const respuesta = result?.RespuestaLinea || result;
      const estadoEnvio = result?.EstadoEnvio || 'Desconocido';
      const csv = result?.CSV || 'N/A';

      let facturasArray: any[] = [];
      if (Array.isArray(respuesta)) facturasArray = respuesta;
      else if (respuesta) facturasArray = [respuesta];

      const detalles = facturasArray.map((f: any) => {
        // La AEAT puede devolver el error directamente en la línea o en RegistroSiiFaltas
        const errores: any[] = [];
        if (f.CodigoErrorRegistro) {
          errores.push({ codigo: f.CodigoErrorRegistro, descripcion: f.DescripcionErrorRegistro });
        }
        if (Array.isArray(f.RegistroSiiFaltas)) {
          errores.push(...f.RegistroSiiFaltas.map((e: any) => ({
            codigo: e.CodigoErrorRegistro,
            descripcion: e.DescripcionErrorRegistro
          })));
        }
        return {
          numero_factura: f.IDFactura?.NumSerieFacturaEmisor || 'N/A',
          estado: f.EstadoRegistro || 'Desconocido',
          errores,
        };
      });

      const errorMsgs = detalles.flatMap((d: any) => d.errores.map((e: any) => `[${e.codigo}] ${e.descripcion}`));

      return {
        success: estadoEnvio === 'Correcto' || estadoEnvio === 'ParcialmenteCorrecto',
        csv,
        estado: estadoEnvio,
        facturas_aceptadas: detalles.filter((d: any) => d.estado === 'Correcto').length,
        facturas_rechazadas: detalles.filter((d: any) => d.estado !== 'Correcto').length,
        detalles,
        error_general: errorMsgs.length > 0 ? errorMsgs.join('; ') : (estadoEnvio !== 'Correcto' ? 'Factura rechazada por la AEAT (sin código de error devuelto)' : null),
      };
    } catch (error: any) {
      console.error('❌ [SII-RECIBIDAS] Error al enviar facturas recibidas:', error.message);
      return {
        success: false,
        csv: null,
        estado: 'Error',
        facturas_aceptadas: 0,
        facturas_rechazadas: payload.facturas_recibidas.length,
        detalles: [],
        error_general: error.message || 'Error al conectar con AEAT para Facturas Recibidas',
      };
    }
  }

  // ============================================================
  // ANULACIÓN / BAJA DE FACTURAS EMITIDAS
  // ============================================================

  async anularFacturaEmitida(
    ejercicio: number,
    periodo: string,
    empresaNif: string,
    empresaNombre: string,
    numeroFactura: string,
    fechaExpedicion: string,
    certificadoBase64: string,
    password: string
  ) {
    console.log('🗑️ [SII] Solicitando Baja/Anulación de factura emitida a la AEAT...');
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const client = await this.crearCliente(certPem, keyPem);

      const fechaFormateada = this.formatearFecha(fechaExpedicion);

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: {
            NombreRazon: empresaNombre,
            NIF: empresaNif,
          },
        },
        RegistroLRBajaExpedidas: [{
          PeriodoLiquidacion: {
            Ejercicio: ejercicio.toString(),
            Periodo: periodo.padStart(2, '0'),
          },
          IDFactura: {
            IDEmisorFactura: {
              NIF: empresaNif,
            },
            NumSerieFacturaEmisor: numeroFactura,
            FechaExpedicionFacturaEmisor: fechaFormateada,
          },
        }],
      };

      if (!client.AnulacionLRFacturasEmitidasAsync) {
        throw new Error('Método AnulacionLRFacturasEmitidasAsync no encontrado en el cliente SOAP');
      }

      const [result] = await client.AnulacionLRFacturasEmitidasAsync(soapBody);
      console.log('📡 [SII] Respuesta de anulación de AEAT:', JSON.stringify(result, null, 2).substring(0, 1000));
      return { success: true, entorno: this.entorno.toUpperCase(), resultado: result };
    } catch (error: any) {
      console.error('❌ [SII] Error en anulación de factura:', error.message);
      return { success: false, entorno: this.entorno.toUpperCase(), error: error.message };
    }
  }

  // ============================================================
  // ANULACIÓN DE FACTURAS RECIBIDAS
  // ============================================================

  async anularFacturaRecibida(
    ejercicio: number,
    periodo: string,
    empresaNif: string,
    empresaNombre: string,
    numeroFactura: string,
    fechaExpedicion: string,
    nifEmisor: string,
    nombreEmisor: string,
    certificadoBase64: string,
    password: string
  ) {
    console.log('🗑️ [SII] Solicitando Baja/Anulación de factura RECIBIDA a la AEAT...');
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const endpointRecibidas = SII_CONFIG.recibidas[this.entorno].endpoint;
      const wsdlRecibidas = this.usarWSDLLocal
        ? path.join(process.cwd(), 'public', 'wsdl', 'sii-recibidas-pruebas.wsdl')
        : SII_CONFIG.recibidas[this.entorno].wsdl;

      const client = await this.crearCliente(certPem, keyPem, endpointRecibidas, wsdlRecibidas);

      const fechaFormateada = this.formatearFecha(fechaExpedicion);

      const emisorObj: any = {
        NombreRazon: (nombreEmisor && nombreEmisor.trim()) ? nombreEmisor.trim() : 'PROVEEDOR',
      };
      if (nifEmisor && nifEmisor.trim()) {
        emisorObj.NIF = nifEmisor.trim();
      } else {
        emisorObj.NIF = empresaNif;
      }

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: { NombreRazon: empresaNombre, NIF: empresaNif },
        },
        RegistroLRBajaRecibidas: [{
          PeriodoLiquidacion: {
            Ejercicio: ejercicio.toString(),
            Periodo: periodo.padStart(2, '0'),
          },
          IDFactura: {
            IDEmisorFactura: emisorObj,
            NumSerieFacturaEmisor: numeroFactura,
            FechaExpedicionFacturaEmisor: fechaFormateada,
          },
        }],
      };

      if (!(client as any).AnulacionLRFacturasRecibidasAsync) {
        const methods = Object.getOwnPropertyNames(client).filter(k => typeof (client as any)[k] === 'function');
        throw new Error(`Método AnulacionLRFacturasRecibidasAsync no encontrado. Disponibles: ${methods.join(', ')}`);
      }

      try {
        const [result] = await (client as any).AnulacionLRFacturasRecibidasAsync(soapBody);
        console.log('📡 [SII] Respuesta de anulación recibida de AEAT:', JSON.stringify(result, null, 2).substring(0, 1000));
        return { success: true, entorno: this.entorno.toUpperCase(), resultado: result };
      } catch (soapErr: any) {
        console.log('📡 [SII] XML Enviado que falló:', client.lastRequest);
        throw soapErr;
      }
    } catch (error: any) {
      console.error('❌ [SII] Error en anulación de factura recibida:', error.message);
      return { success: false, entorno: this.entorno.toUpperCase(), error: error.message };
    }
  }

  // ============================================================
  // CONSULTA DE FACTURAS EMITIDAS (AEAT GET DIRECTO)
  // ============================================================

  async consultarFacturasEmitidas(
    ejercicio: number,
    periodo: string,
    empresaNif: string,
    empresaNombre: string,
    certificadoBase64: string,
    password: string
  ) {
    console.log('🔍 [SII] Consultando facturas emitidas directamente en la AEAT...');
    console.log(`   🏢 Empresa: ${empresaNombre} (${empresaNif})`);
    console.log(`   📅 Ejercicio-Periodo: ${ejercicio}-${periodo}`);

    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      // La consulta ConsultaLRFacturasEmitidas está definida en el mismo WSDL que el suministro
      // y usa el mismo endpoint fe (facturas emitidas).
      const endpointEmitidas = SII_CONFIG.emitidas[this.entorno].endpoint;
      const client = await this.crearCliente(certPem, keyPem, endpointEmitidas);

      // Cabecera obligatoria para ConsultaLR según el XSD del SII v1.1
      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: {
            NombreRazon: empresaNombre,
            NIF: empresaNif,
          },
        },
        FiltroConsulta: {
          PeriodoLiquidacion: {
            Ejercicio: ejercicio.toString(),
            // Periodo en AEAT = mes 2 dígitos (01..12)
            Periodo: periodo.padStart(2, '0'),
          },
        },
      };

      console.log('📝 [SII] Body de ConsultaLRFacturasEmitidas:', JSON.stringify(soapBody, null, 2));

      // Nombre exacto del método según el WSDL oficial: ConsultaLRFacturasEmitidas
      // la librería soap lo expone como ConsultaLRFacturasEmitidasAsync
      if (!(client as any).ConsultaLRFacturasEmitidasAsync) {
        const methods = Object.getOwnPropertyNames(client).filter(k => typeof (client as any)[k] === 'function');
        throw new Error(`Método ConsultaLRFacturasEmitidasAsync no encontrado en el WSDL. Métodos disponibles: ${methods.join(', ')}`);
      }

      try {
        const [result] = await (client as any).ConsultaLRFacturasEmitidasAsync(soapBody);
        console.log('📡 [SII] XML Enviado a AEAT:', client.lastRequest);
        console.log('✅ [SII] Consulta recibida directamente de Hacienda');

        return {
          success: true,
          entorno: this.entorno.toUpperCase(),
          resultado: result,
        };
      } catch (soapErr: any) {
        console.log('📡 [SII] XML Enviado que falló:', client.lastRequest);
        throw soapErr;
      }
    } catch (error: any) {
      console.error('❌ [SII] Error al ejecutar consulta en la AEAT:', error.message);
      return {
        success: false,
        entorno: this.entorno.toUpperCase(),
        error: error.message || 'Error en la consulta directa a los servidores de Hacienda',
      };
    }
  }

  // ============================================================
  // CONSULTA DE FACTURAS RECIBIDAS (AEAT DIRECTO)
  // ============================================================

  async consultarFacturasRecibidas(
    ejercicio: number,
    periodo: string,
    empresaNif: string,
    empresaNombre: string,
    certificadoBase64: string,
    password: string
  ) {
    console.log('🔍 [SII] Consultando facturas recibidas en la AEAT...');
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const endpointRecibidas = SII_CONFIG.recibidas[this.entorno].endpoint;
      const wsdlRecibidas = this.usarWSDLLocal 
        ? path.join(process.cwd(), 'public', 'wsdl', 'sii-recibidas-pruebas.wsdl')
        : SII_CONFIG.recibidas[this.entorno].wsdl;

      const client = await this.crearCliente(certPem, keyPem, endpointRecibidas, wsdlRecibidas);

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: { NombreRazon: empresaNombre, NIF: empresaNif },
        },
        FiltroConsulta: {
          PeriodoLiquidacion: {
            Ejercicio: ejercicio.toString(),
            Periodo: periodo.padStart(2, '0'),
          },
        },
      };

      if (!(client as any).ConsultaLRFacturasRecibidasAsync) {
        const methods = Object.getOwnPropertyNames(client).filter(k => typeof (client as any)[k] === 'function');
        throw new Error(`Método ConsultaLRFacturasRecibidasAsync no encontrado. Disponibles: ${methods.join(', ')}`);
      }

      try {
        const [result] = await (client as any).ConsultaLRFacturasRecibidasAsync(soapBody);
        console.log('📡 [SII] XML Recibidas Enviado a AEAT:', client.lastRequest);
        return { success: true, entorno: this.entorno.toUpperCase(), resultado: result };
      } catch (soapErr: any) {
        console.log('📡 [SII] XML Recibidas Enviado que falló:', client.lastRequest);
        throw soapErr;
      }
    } catch (error: any) {
      console.error('❌ [SII] Error al ejecutar consulta recibidas en AEAT:', error.message);
      return { success: false, entorno: this.entorno.toUpperCase(), error: error.message };
    }
  }

  // ============================================================
  // CONSULTA LLAA — Estado de Libros Registro
  // ============================================================

  async consultarLLAA(
    ejercicio: number,
    periodo: string,
    empresaNif: string,
    empresaNombre: string,
    certificadoBase64: string,
    password: string
  ) {
    console.log('📚 [SII] Consultando estado LLAA en la AEAT...');
    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const endpointLLAA = SII_CONFIG.llaa[this.entorno].endpoint;
      const wsdlLLAA = this.usarWSDLLocal 
        ? path.join(process.cwd(), 'public', 'wsdl', 'sii-llaa-pruebas.wsdl')
        : SII_CONFIG.llaa[this.entorno].wsdl;

      const client = await this.crearCliente(certPem, keyPem, endpointLLAA, wsdlLLAA);

      const soapBody = {
        Cabecera: {
          IDVersionSii: '1.1',
          Titular: { NombreRazon: empresaNombre, NIF: empresaNif },
        },
        FiltroConsulta: {
          PeriodoLiquidacion: {
            Ejercicio: ejercicio.toString(),
            Periodo: periodo.padStart(2, '0'),
          },
        },
      };

      if (!(client as any).ConsultaLLAAAsync) {
        const methods = Object.getOwnPropertyNames(client).filter(k => typeof (client as any)[k] === 'function');
        throw new Error(`Método ConsultaLLAAAsync no encontrado. Disponibles: ${methods.join(', ')}`);
      }

      try {
        const [result] = await (client as any).ConsultaLLAAAsync(soapBody);
        console.log('📡 [SII] XML LLAA Enviado a AEAT:', client.lastRequest);
        return { success: true, entorno: this.entorno.toUpperCase(), resultado: result };
      } catch (soapErr: any) {
        console.log('📡 [SII] XML LLAA Enviado que falló:', client.lastRequest);
        throw soapErr;
      }
    } catch (error: any) {
      console.error('❌ [SII] Error al ejecutar consulta LLAA en AEAT:', error.message);
      return { success: false, entorno: this.entorno.toUpperCase(), error: error.message };
    }
  }

  // ============================================================
  // TEST DE CONEXIÓN
  // ============================================================

  async testConnection(certificadoBase64: string, password: string) {
    console.log('🧪 [SII] Iniciando test de conexión...');

    try {
      const { certPem, keyPem, certificado } = this.cargarCertificado(certificadoBase64, password);
      const client = await this.crearCliente(certPem, keyPem);

      console.log('✅ [SII] WSDL cargado correctamente');

      const services = client.describe();
      const serviceNames = Object.keys(services);
      const operations = serviceNames.length > 0 
        ? Object.keys(services[serviceNames[0]]).flatMap(port => 
            Object.keys(services[serviceNames[0]][port])
          )
        : [];

      console.log(`   Servicios disponibles: ${serviceNames.join(', ')}`);
      console.log(`   Operaciones: ${operations.length}`);

      return {
        success: true,
        entorno: this.entorno.toUpperCase(),
        mensaje: 'Conexión establecida correctamente con el SII',
        details: {
          endpoint: SII_COMPAT[this.entorno].endpoint,
          services: serviceNames,
          operations: operations,
          certificate: {
            subject: certificado.subject.attributes.map((a: any) => (a.shortName || a.name) ? `${a.shortName || a.name}=${a.value}` : `${a.value}`).join(', '),
            issuer: certificado.issuer.attributes.map((a: any) => (a.shortName || a.name) ? `${a.shortName || a.name}=${a.value}` : `${a.value}`).join(', '),
            validFrom: certificado.validity.notBefore.toISOString(),
            validTo: certificado.validity.notAfter.toISOString(),
            serialNumber: certificado.serialNumber,
          }
        }
      };
    } catch (error: any) {
      console.error('❌ [SII] Error en test:', error);
      return {
        success: false,
        entorno: this.entorno.toUpperCase(),
        mensaje: 'Error al conectar con el SII',
        error: error.message
      };
    }
  }
}

// ✅ Exportar instancia singleton
export const siiService = new SIIService();