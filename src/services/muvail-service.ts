/**
 * src/services/muvail-service.ts
 *
 * Integración externa con el ERP / Contabilidad Muvail.
 * Permite buscar terceros (clientes y proveedores) por NIF/código
 * y darlos de alta automáticamente para sincronizar cuentas contables.
 *
 * Especificación de la API:
 * - Staging: https://crm-staging-263418105374.europe-southwest1.run.app/api/externo/v1
 * - Prod:    https://crm-263418105374.europe-southwest1.run.app/api/externo/v1
 * - Cabeceras:
 *   - Authorization: Bearer <API_KEY>
 *   - X-Sociedad: <CIF de la empresa>
 *   - Idempotency-Key: <UUID único por alta>
 */

import { randomUUID } from 'crypto';

// ─── Tipos e Interfaces ────────────────────────────────────────────────────────

export interface MuvailTercero {
  codigo: number;
  codigo_visible: string;
  nombre: string;
  nif?: string;
  es_cliente: boolean;
  es_proveedor: boolean;
  direccion?: string;
  cp?: string;
  poblacion?: string;
  provincia?: string;
  pais?: string;
  telefono?: string;
  email?: string;
  [key: string]: unknown;
}

export interface MuvailCrearTerceroPayload {
  nombre: string;
  nif: string;
  es_cliente: boolean;
  es_proveedor: boolean;
  direccion?: string;
  cp?: string;
  poblacion?: string;
  provincia?: string;
  pais?: string;
  telefono?: string;
  email?: string;
  confirmado?: boolean;
}

export interface MuvailResultadoAlta {
  creado: boolean;
  motivo?: 'YA_EXISTE' | string;
  tercero?: MuvailTercero;
  error?: string;
  codigoError?: string;
  parecidos?: MuvailTercero[];
}

export interface MuvailConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

// ─── Servicio Principal ─────────────────────────────────────────────────────────

export class MuvailService {
  private static DEFAULT_STAGING_URL =
    'https://crm-staging-263418105374.europe-southwest1.run.app/api/externo/v1';

  private static DEFAULT_PROD_URL =
    'https://crm-263418105374.europe-southwest1.run.app/api/externo/v1';

  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(config?: MuvailConfig) {
    const isProd = process.env.NODE_ENV === 'production' && process.env.MUVAIL_ENV === 'production';
    
    this.baseUrl =
      config?.baseUrl ||
      process.env.MUVAIL_API_URL ||
      (isProd ? MuvailService.DEFAULT_PROD_URL : MuvailService.DEFAULT_STAGING_URL);

    // Asegurar que no tenga barra al final
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');

    this.apiKey = config?.apiKey || process.env.MUVAIL_API_KEY || '';
    this.timeoutMs = config?.timeoutMs || 10000;
  }

  /**
   * Genera las cabeceras requeridas para toda llamada a Muvail.
   */
  private getHeaders(cifSociedad: string, idempotencyKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Sociedad': cifSociedad.trim().toUpperCase(),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return headers;
  }

  /**
   * Helper genérico para peticiones fetch con timeout y control de errores.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit,
    cifSociedad: string
  ): Promise<{ status: number; data: T; headers: Headers }> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        data = await response.text().catch(() => null);
      }

      return {
        status: response.status,
        data: data as T,
        headers: response.headers,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`[MUVAIL] Timeout de ${this.timeoutMs}ms agotado al llamar a ${endpoint}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 1. Buscar tercero por NIF / CIF
   * GET /terceros?nif=B12345678
   */
  async buscarPorNif(cifSociedad: string, nif: string): Promise<MuvailTercero | null> {
    if (!nif || !cifSociedad) return null;

    const nifLimpio = nif.replace(/[\s\-_.]/g, '').toUpperCase();
    const res = await this.request<any>(
      `/terceros?nif=${encodeURIComponent(nifLimpio)}`,
      {
        method: 'GET',
        headers: this.getHeaders(cifSociedad),
      },
      cifSociedad
    );

    if (res.status === 200 && res.data) {
      // Muvail puede devolver un objeto directo o un array con el tercero
      if (Array.isArray(res.data)) {
        return res.data.length > 0 ? (res.data[0] as MuvailTercero) : null;
      }
      return res.data as MuvailTercero;
    }

    if (res.status === 404) {
      return null;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      console.warn(`[MUVAIL] ⚠️ Rate limit 429 alcanzado. Retry-After: ${retryAfter}s`);
      return null;
    }

    return null;
  }

  /**
   * 2. Buscar tercero por código numérico
   * GET /terceros/:codigo
   */
  async buscarPorCodigo(cifSociedad: string, codigo: number): Promise<MuvailTercero | null> {
    if (!codigo || !cifSociedad) return null;

    const res = await this.request<any>(
      `/terceros/${codigo}`,
      {
        method: 'GET',
        headers: this.getHeaders(cifSociedad),
      },
      cifSociedad
    );

    if (res.status === 200 && res.data) {
      return res.data as MuvailTercero;
    }

    return null;
  }

  /**
   * 3. Buscar por texto libre o papel (cliente/proveedor)
   * GET /terceros?q=perez&papel=cliente
   */
  async buscarPorTexto(
    cifSociedad: string,
    query: string,
    papel?: 'cliente' | 'proveedor'
  ): Promise<MuvailTercero[]> {
    if (!query || !cifSociedad) return [];

    let endpoint = `/terceros?q=${encodeURIComponent(query)}`;
    if (papel) endpoint += `&papel=${papel}`;

    const res = await this.request<any>(
      endpoint,
      {
        method: 'GET',
        headers: this.getHeaders(cifSociedad),
      },
      cifSociedad
    );

    if (res.status === 200 && Array.isArray(res.data)) {
      return res.data as MuvailTercero[];
    }

    return [];
  }

  /**
   * 4. Dar de alta a un tercero (cliente o proveedor)
   * POST /terceros
   *
   * Respuestas contempladas:
   * - 201: Creado nuevo con éxito -> { creado: true, tercero: { codigo: ... } }
   * - 200: Ya existía ese NIF -> { creado: false, motivo: "YA_EXISTE", tercero: { codigo: ... } }
   * - 409: HAY_PARECIDOS -> si no traía NIF y hay parecidos
   * - 400: DATOS_NO_VALEN -> error en algún campo
   * - 401/403: No autorizado
   * - 429: Rate limit
   */
  async crearTercero(
    cifSociedad: string,
    payload: MuvailCrearTerceroPayload,
    options?: { idempotencyKey?: string }
  ): Promise<MuvailResultadoAlta> {
    const key = options?.idempotencyKey || randomUUID();

    const bodyToSend: Record<string, any> = {
      nombre: payload.nombre.trim(),
      nif: (payload.nif || '').replace(/[\s\-_.]/g, '').toUpperCase(),
      es_cliente: Boolean(payload.es_cliente),
      es_proveedor: Boolean(payload.es_proveedor),
      pais: payload.pais || 'ES',
    };

    if (payload.direccion) bodyToSend.direccion = payload.direccion.trim();
    if (payload.cp) bodyToSend.cp = payload.cp.trim();
    if (payload.poblacion) bodyToSend.poblacion = payload.poblacion.trim();
    if (payload.provincia) bodyToSend.provincia = payload.provincia.trim();
    if (payload.telefono) bodyToSend.telefono = payload.telefono.trim();
    if (payload.email) bodyToSend.email = payload.email.trim();
    if (payload.confirmado) bodyToSend.confirmado = true;

    const res = await this.request<any>(
      '/terceros',
      {
        method: 'POST',
        headers: this.getHeaders(cifSociedad, key),
        body: JSON.stringify(bodyToSend),
      },
      cifSociedad
    );

    if (res.status === 201) {
      return {
        creado: true,
        tercero: res.data?.tercero || res.data,
      };
    }

    if (res.status === 200) {
      return {
        creado: false,
        motivo: res.data?.motivo || 'YA_EXISTE',
        tercero: res.data?.tercero || res.data,
      };
    }

    if (res.status === 409) {
      return {
        creado: false,
        error: 'HAY_PARECIDOS',
        codigoError: '409_HAY_PARECIDOS',
        parecidos: res.data?.parecidos || [],
      };
    }

    if (res.status === 400) {
      return {
        creado: false,
        error: res.data?.error || 'DATOS_NO_VALEN',
        codigoError: '400_DATOS_NO_VALEN',
      };
    }

    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      return {
        creado: false,
        error: `Límite de peticiones alcanzado (429). Reintentar en ${retry}s`,
        codigoError: '429_RATE_LIMIT',
      };
    }

    return {
      creado: false,
      error: res.data?.error || `Error HTTP ${res.status}`,
      codigoError: String(res.status),
    };
  }

  /**
   * 5. Helper de Alto Nivel: Obtener o Crear Tercero
   * Aplica la recomendación del equipo de Muvail:
   * "Antes de dar de alta, buscad por NIF. Y si el alta os devuelve YA_EXISTE, usad ese código."
   */
  async sincronizarTercero(
    cifSociedad: string,
    payload: MuvailCrearTerceroPayload
  ): Promise<{ codigo: number; codigoVisible: string; esNuevo: boolean } | null> {
    // 1. Buscar primero por NIF si lo tenemos
    if (payload.nif) {
      try {
        const existente = await this.buscarPorNif(cifSociedad, payload.nif);
        if (existente && existente.codigo) {
          return {
            codigo: existente.codigo,
            codigoVisible: existente.codigo_visible || String(existente.codigo),
            esNuevo: false,
          };
        }
      } catch (err) {
        console.warn('[MUVAIL] Error en búsqueda previa por NIF, intentando alta directa:', err);
      }
    }

    // 2. Dar de alta en Muvail
    const resultado = await this.crearTercero(cifSociedad, payload);

    if (resultado.tercero && resultado.tercero.codigo) {
      return {
        codigo: resultado.tercero.codigo,
        codigoVisible: resultado.tercero.codigo_visible || String(resultado.tercero.codigo),
        esNuevo: resultado.creado,
      };
    }

    console.error('[MUVAIL] ❌ No se pudo sincronizar el tercero:', resultado.error);
    return null;
  }

  /**
   * Helper para transformar una entidad extraída de la factura por la IA
   * al payload estándar que espera Muvail.
   */
  static adaptarDesdeFactura(
    entidad: {
      nombre?: string;
      cif?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
    },
    tipo: 'proveedor' | 'cliente'
  ): MuvailCrearTerceroPayload {
    // Intentar extraer CP con regex estándar de 5 dígitos (España) si la dirección existe
    let cp: string | undefined = undefined;
    if (entidad.direccion) {
      const cpMatch = entidad.direccion.match(/\b([0-5]\d{4})\b/);
      if (cpMatch) cp = cpMatch[1];
    }

    return {
      nombre: (entidad.nombre || 'Tercero sin nombre').trim(),
      nif: (entidad.cif || '').trim(),
      es_cliente: tipo === 'cliente',
      es_proveedor: tipo === 'proveedor',
      direccion: entidad.direccion?.trim(),
      cp,
      telefono: entidad.telefono?.trim(),
      email: entidad.email?.trim(),
      pais: 'ES',
    };
  }
}

// Instancia singleton por defecto
export const muvailService = new MuvailService();
