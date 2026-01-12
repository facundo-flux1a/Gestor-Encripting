// src/services/sii-service.ts
import soap from 'soap';
import forge from 'node-forge';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
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
    
    const certificadoBuffer = Buffer.from(certificadoBase64, 'base64');
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

    return { certPem, keyPem, certificadoBuffer };
  }

  // ============================================================
  // CREACIÓN DE AGENTE HTTPS
  // ============================================================

  private crearAgenteHTTPS(certPem: string, keyPem: string) {
    return new https.Agent({
      cert: certPem,
      key: keyPem,
      rejectUnauthorized: this.entorno === 'produccion',
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      keepAlive: false
    });
  }

  // ============================================================
  // REQUEST PERSONALIZADO CON AXIOS
  // ============================================================

  private crearCustomRequest(certPem: string, keyPem: string) {
    return async (options: any, callback: Function) => {
      console.log('📤 [SII] Enviando petición SOAP...');
      console.log('📍 [SII] URL:', {
        url: options.url || options.uri,
        method: options.method,
        headers: options.headers
      });

      try {
        const axiosConfig = {
          method: options.method || 'POST',
          url: options.url || options.uri,
          data: options.body,
          headers: options.headers || {},
          httpsAgent: new https.Agent({
            cert: certPem,
            key: keyPem,
            rejectUnauthorized: this.entorno === 'produccion',
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            keepAlive: false
          }),
          maxRedirects: 0,
          validateStatus: () => true, // Aceptar cualquier status
          transformResponse: [(data: any) => data], // No transformar
        };

        const response = await axios(axiosConfig);
        
        console.log('✅ [SII] Respuesta recibida');
        console.log('📊 [SII] Status:', response.status);
        console.log('📦 [SII] Headers:', response.headers);
        
        // Si es un redirect (302), es un error de autenticación
        if (response.status === 302) {
          const error = new Error('Error 403: No se detecta certificado electrónico (redirect 302)');
          console.error('❌ [SII] Redirect detectado - Certificado no válido');
          console.error('📍 [SII] Location:', response.headers.location);
          callback(error);
          return;
        }
        
        // Si no es 200, también es error
        if (response.status !== 200) {
          const error = new Error(`Error HTTP ${response.status}: ${response.statusText || 'Error desconocido'}`);
          console.error('❌ [SII] Error HTTP:', response.status);
          callback(error);
          return;
        }
        
        // node-soap espera este formato específico
        callback(null, {
          body: response.data,
          statusCode: response.status,
          headers: response.headers
        }, response.data);
        
      } catch (error: any) {
        console.error('❌ [SII] Error en petición:', {
          message: error.message,
          code: error.code,
          response: error.response?.status
        });
        
        // Pasar el error en el formato que espera node-soap
        callback(error);
      }
    };
  }

  // ============================================================
  // CREACIÓN DE CLIENTE SOAP
  // ============================================================

  private async crearCliente(certPem: string, keyPem: string): Promise<soap.Client> {
    await this.configurarDNS();

    const wsdlUrl = this.usarWSDLLocal ? WSDL_LOCAL[this.entorno] : SII_CONFIG[this.entorno].wsdl;

    if (this.usarWSDLLocal) {
      console.log(`📁 [SII] Usando WSDL local: ${wsdlUrl}`);
    }

    console.log('🔌 [SII] Creando cliente SOAP con mTLS...');

    const httpsAgent = this.crearAgenteHTTPS(certPem, keyPem);
    const customRequest = this.crearCustomRequest(certPem, keyPem);

    console.log('🔐 [SII] Agente HTTPS con certificado cliente creado');
    console.log(`   TLS: 1.2-1.3, Validación SSL: ${this.entorno === 'produccion'}`);

    const client = await soap.createClientAsync(wsdlUrl, {
      endpoint: SII_CONFIG[this.entorno].endpoint,
      wsdl_options: {
        httpsAgent,
        timeout: 30000,
      },
      request: customRequest, // ← Request personalizado con axios
    });

    console.log('✅ [SII] Cliente SOAP creado con mTLS');

    return client;
  }

  // ============================================================
  // TEST DE CONEXIÓN
  // ============================================================

  async testConexion(certificadoBase64: string, password: string) {
    console.log('🧪 [SII] Iniciando test de conexión...');

    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
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
        exito: true,
        entorno: this.entorno,
        endpoint: SII_CONFIG[this.entorno].endpoint,
        servicios: serviceNames,
        operaciones: operations,
      };
    } catch (error: any) {
      console.error('❌ [SII] Error en test:', error);
      throw error;
    }
  }

  // ============================================================
  // FORMATEO DE FECHA
  // ============================================================

  private formatearFecha(fecha: string): string {
    // Convertir de YYYY-MM-DD (ISO) a DD-MM-YYYY (AEAT)
    const [year, month, day] = fecha.split('-');
    const fechaFormateada = `${day}-${month}-${year}`;
    console.log(`📅 [SII] Fecha formateada: ${fecha} -> ${fechaFormateada}`);
    return fechaFormateada;
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
    console.log(`   Empresa: ${payload.empresa_nombre} (${payload.empresa_nif})`);
    console.log(`   Periodo: ${payload.ejercicio}-${payload.periodo}`);
    console.log(`   Facturas: ${payload.facturas_emitidas.length}`);

    try {
      const { certPem, keyPem } = this.cargarCertificado(certificadoBase64, password);
      const client = await this.crearCliente(certPem, keyPem);

      const registros = payload.facturas_emitidas.map(factura => ({
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
      }));

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

      console.log('📝 [SII] XML construido:', JSON.stringify(soapBody, null, 2));
      console.log('🔍 [SII] Verificando método SOAP...');

      if (!client.SuministroLRFacturasEmitidasAsync) {
        throw new Error('Método SuministroLRFacturasEmitidasAsync no encontrado en el cliente SOAP');
      }

      console.log('✅ [SII] Método encontrado, llamando...');

      // Llamada SOAP con async/await
      const [result] = await client.SuministroLRFacturasEmitidasAsync(soapBody);

      console.log('📥 [SII] Respuesta recibida de AEAT');
      console.log('📦 [SII] Result:', JSON.stringify(result, null, 2));

      // Parsear respuesta
      const respuesta = result?.RespuestaLinea || result;
      const estadoEnvio = result?.EstadoEnvio || 'Desconocido';
      const csv = result?.CSV || 'N/A';

      console.log('📊 [SII] Estado del envío:', estadoEnvio);
      console.log('📋 [SII] CSV:', csv);

      // Procesar detalles de facturas
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

        console.log(`📋 [SII] Detalle de factura:`);
        console.log(`   Estado: ${estado}`);
        if (errores.length > 0) {
          errores.forEach(e => console.log(`   ❌ [${e.codigo}] ${e.descripcion}`));
        }

        return {
          numeroFactura: factura.IDFactura?.NumSerieFacturaEmisor || 'N/A',
          estado,
          errores,
        };
      });

      const facturasAceptadas = detalles.filter((d: any) => d.estado === 'Correcto').length;
      const facturasRechazadas = detalles.filter((d: any) => d.estado !== 'Correcto').length;

      console.log('✅ [SII] Proceso completado');
      console.log(`   Aceptadas: ${facturasAceptadas}`);
      console.log(`   Rechazadas: ${facturasRechazadas}`);

      return {
        success: estadoEnvio === 'Correcto',
        csv,
        estado: estadoEnvio,
        facturas_aceptadas: facturasAceptadas,
        facturas_rechazadas: facturasRechazadas,
        detalles,
        respuestaAEAT: result,
      };

    } catch (error: any) {
      console.error('❌ [SII] Error al enviar facturas:', error.message);
      console.error('❌ [SII] Error stack:', error.stack);
      
      throw new Error(`Error al enviar facturas al SII: ${error.message}`);
    }
  }
}

// Exportar instancia singleton
export const siiService = new SIIService();