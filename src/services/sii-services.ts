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
// CONFIGURACIÓN
// ============================================================

const SII_CONFIG = {
  produccion: {
    wsdl: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroFactEmitidas.wsdl',
    endpoint: 'https://www2.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP'
  },
  pruebas: {
    wsdl: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/SuministroFactEmitidas.wsdl',
    endpoint: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP'
  }
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
    console.log(`📍 [SII] Endpoint: ${SII_CONFIG[this.entorno].endpoint}`);
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

  private async crearCliente(certPem: string, keyPem: string): Promise<soap.Client> {
    console.log('🔌 [SII] Creando cliente SOAP...');
    
    await this.configurarDNS();

    const wsdlUrl = this.usarWSDLLocal ? WSDL_LOCAL[this.entorno] : SII_CONFIG[this.entorno].wsdl;
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

      // ✅ Crear cliente SOAP con axios como transporte
      const client = await soap.createClientAsync(wsdlUrl, {
        endpoint: SII_CONFIG[this.entorno].endpoint,
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
    const fechaISO = fecha.split('T')[0];
    const [year, month, day] = fechaISO.split('-');
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
    console.log('📤 [SII] Enviando facturas emitidas...');
    console.log(`   🏢 Empresa: ${payload.empresa_nombre} (${payload.empresa_nif})`);
    console.log(`   📅 Periodo: ${payload.ejercicio}-${payload.periodo}`);
    console.log(`   📄 Facturas: ${payload.facturas_emitidas.length}`);

    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const client = await this.crearCliente(certPem, keyPem);

      console.log('📝 [SII] Construyendo XML SOAP...');
      
      const registros = payload.facturas_emitidas.map(factura => {
        const registro = {
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
          FacturaExpedida: {
            TipoFactura: factura.tipo_factura || 'F1',
            ClaveRegimenEspecialOTrascendencia: factura.clave_regimen || '01',
            DescripcionOperacion: factura.descripcion,
            ImporteTotal: factura.total.toFixed(2),
            TipoDesglose: {
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
            },
          },
        };
        
        if (factura.nif_receptor) {
          (registro.FacturaExpedida as any).Contraparte = {
            NombreRazon: 'Cliente',
            NIF: factura.nif_receptor,
          };
        }
        
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

        if (factura.RegistroSiiFaltas?.length > 0) {
          errores.push(...factura.RegistroSiiFaltas.map((e: any) => ({
            codigo: e.CodigoErrorRegistro,
            descripcion: e.DescripcionErrorRegistro
          })));
        }

        return {
          numero_factura: factura.IDFactura?.NumSerieFacturaEmisor || 'N/A',
          estado,
          errores,
        };
      });

      const facturasAceptadas = detalles.filter((d: any) => d.estado === 'Correcto').length;
      const facturasRechazadas = detalles.filter((d: any) => d.estado !== 'Correcto').length;

      console.log('✅ [SII] Proceso completado');
      console.log(`   ✔️  Aceptadas: ${facturasAceptadas}`);
      console.log(`   ❌ Rechazadas: ${facturasRechazadas}`);

      return {
        success: estadoEnvio === 'Correcto',
        csv,
        estado: estadoEnvio,
        facturas_aceptadas: facturasAceptadas,
        facturas_rechazadas: facturasRechazadas,
        detalles,
        error_general: estadoEnvio !== 'Correcto' ? 'Algunas facturas fueron rechazadas' : null
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
          endpoint: SII_CONFIG[this.entorno].endpoint,
          services: serviceNames,
          operations: operations,
          certificate: {
            subject: certificado.subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(', '),
            issuer: certificado.issuer.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(', '),
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