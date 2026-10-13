import { prisma } from '@/lib/prisma';
import db from '@/lib/db';
import { getDocuments } from '@/services/document-service';
import { hashField, normalizeEntityName } from '@/lib/encryption';
import type { Document } from '@/lib/types';

export interface AccountingAccountItem {
  id?: number | string;
  tipo: 'tercero' | 'gasto' | 'impuesto';
  codigo: string;          // e.g. "4000000", "6290000", "4720021"
  nombre: string;          // e.g. "Telefónica de España SAU", "Otros servicios (Software)", "H.P. IVA soportado 21%"
  debe: number;            // Importe Debe (€)
  haber: number;           // Importe Haber (€)
  is_suggested: boolean;   // true = sugerencia IA / heurística, false = confirmado / aprobado
  confianza?: number;      // 0.0 - 1.0
  justificacion?: string;  // Explicación
  origen: 'bd_directa' | 'regla_proveedor' | 'regla_producto' | 'ia_datos_extra' | 'heuristica_pgc';
  referencia_id?: number;  // ID de la entidad, línea o impuesto
}

export interface DocumentAccountingDebug {
  id_documento: number;
  numero_documento: string;
  tipo_documento: string;
  fecha_emision: string | null;
  proveedor: string;
  cif: string;
  pais?: string;
  empresa_id: number | null;
  empresa_nombre?: string;
  is_issued: boolean;       // true = emitida (ingreso), false = recibida (gasto)
  total: number;
  base_imponible: number;
  total_iva: number;
  retencion_irpf: number;

  // Cuentas vinculadas estructuradas
  cuenta_tercero: AccountingAccountItem;
  cuentas_gasto: AccountingAccountItem[];
  cuentas_impuesto: AccountingAccountItem[];

  // Asiento contable completo (Debe y Haber)
  asiento: AccountingAccountItem[];
  total_debe: number;
  total_haber: number;
  cuadrado: boolean;
  diferencia: number;

  // Estados
  estado_contable: 'aprobado' | 'revision' | 'sin_asignar';
  sugerencias_pendientes: number;
  total_cuentas: number;
}

/**
 * Heurística de PGC español para asignar cuenta de gasto según texto y descripción
 */
export function heuristicExpenseAccount(text: string): { codigo: string; nombre: string; justificacion: string } {
  const t = (text || '').toLowerCase();

  // Software, SaaS, Cloud, Hosting
  if (/software|saas|cloud|aws|google cloud|openai|anthropic|azure|github|slack|zoom|hosting|dominio|licencia|adobe|cursor|stripe/i.test(t)) {
    return { codigo: '6290000', nombre: 'Software / SaaS', justificacion: 'Herramientas tecnológicas y suscripciones digitales' };
  }

  // Suministros (Luz, Agua, Gas, Teléfono, Fibra)
  if (/suministro|electricidad|luz|agua|gas|iberdrola|endesa|naturgy|telefon|telecom|vodafone|orange|movistar|fibra|internet/i.test(t)) {
    return { codigo: '6280000', nombre: 'Suministros', justificacion: 'Servicios de telefonía, electricidad y suministros básicos' };
  }

  // Servicios de profesionales independientes
  if (/asesor|abogado|notari|gestor|consultor|ingenier|profesional|honorarios|auditor/i.test(t)) {
    return { codigo: '6230000', nombre: 'Serv. Profesionales', justificacion: 'Honorarios de asesoría jurídica, fiscal, notaría o consultoría' };
  }

  // Hostelería, Restauración, Viajes, Parking
  // PGC: 629 (Otros servicios) para gastos operativos de desplazamiento;
  // 627 (Publicidad/RRPP) aplica solo cuando es comida de representación comercial con cliente.
  // Como heurística genérica, 629 es más seguro.
  if (/restauran|comida|cena|almuerzo|cafe|bar |hotel|viaje|parking|peaje|taxi|uber|cabify/i.test(t)) {
    return { codigo: '6290000', nombre: 'Gastos de viaje / Hostelería', justificacion: 'Dietas, desplazamientos y hostelería operativa (PGC 629). Si es representación comercial con cliente, considerar 627.' };
  }

  // Transporte y mensajería
  if (/transport|envio|portes|mensajer|seur|dhl|mrw|correos|ups/i.test(t)) {
    return { codigo: '6240000', nombre: 'Transportes', justificacion: 'Servicios logísticos y de transporte de mercancías' };
  }

  // Reparaciones y conservación
  if (/reparaci|mantenimient|conservaci|reforma/i.test(t)) {
    return { codigo: '6220000', nombre: 'Reparaciones', justificacion: 'Mantenimiento preventivo o reparaciones técnicas' };
  }

  // Arrendamientos y cánones
  if (/alquiler|arrendamient|renting|leasing|canon/i.test(t)) {
    return { codigo: '6210000', nombre: 'Arrendamientos', justificacion: 'Alquiler de local u oficinas' };
  }

  // Seguros
  if (/seguro|poliza|mutua|prima/i.test(t)) {
    return { codigo: '6250000', nombre: 'Seguros', justificacion: 'Pólizas de seguro empresarial o de responsabilidad' };
  }

  // Material de oficina / suministros consumibles
  if (/papel|oficina|consumible|cartucho|tinta|boligrafo|material|suministro/i.test(t)) {
    return { codigo: '6290000', nombre: 'Material de oficina', justificacion: 'Material consumible y equipamiento de oficina' };
  }

  // Mercancías / Materias primas
  if (/mercader|producto|articulo|stock/i.test(t)) {
    return { codigo: '6000000', nombre: 'Compras mercaderías', justificacion: 'Bienes para la actividad comercial o transformación' };
  }

  // Por defecto PGC
  return { codigo: '6290000', nombre: 'Otros servicios', justificacion: 'Cuenta general de gastos de explotación (PGC Grupo 629)' };
}

/**
 * Obtiene la lista completa de documentos con el análisis y enriquecimiento de Cuentas Contables
 */
export async function getDocumentsAccountingDebugList(empresaIds: number[]): Promise<DocumentAccountingDebug[]> {
  if (!empresaIds || empresaIds.length === 0) return [];

  // 1. Obtener documentos base mediante el servicio central
  const rawDocs = await getDocuments(empresaIds, false);
  if (!rawDocs || rawDocs.length === 0) return [];

  const docIds = rawDocs.map(d => BigInt(d.id_documento));

  // 2. Traer configuraciones de entidades de la BD (reglas guardadas de proveedores)
  const [entidadesConfigRows, productosConfigRows, entidadesDbRows, lineasDbRows, impuestosDbRows] = await Promise.all([
    db.query(`SELECT empresa_id, identificador_fiscal, identificador_fiscal_hash, cuenta_compra, cuenta_venta FROM entidades_config WHERE empresa_id IN (?)`, [empresaIds]).then(([rows]: any) => rows || []).catch(() => []),
    db.query(`SELECT id_de_empresa, proveedor_cif, proveedor_cif_hash, patron, cuenta_contable, is_ai_suggested, justification FROM productos_config WHERE id_de_empresa IN (?)`, [empresaIds]).then(([rows]: any) => rows || []).catch(() => []),
    prisma.entidades_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: { id: true, documento_id: true, rol: true, cuenta_contable: true, identificador_fiscal: true, identificador_fiscal_hash: true, nombre: true, datos_extra: true }
    }),
    prisma.lineas_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: { id: true, documento_id: true, descripcion: true, cuenta_contable: true, importe_linea: true, datos_extra: true }
    }),
    prisma.impuestos_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: { id: true, documento_id: true, tipo_impuesto: true, porcentaje: true, cuota: true, cuenta_contable: true }
    })
  ]);

  // Indexar entidades_config por empresa_id y hash
  const configEntidadMap = new Map<string, any>();
  for (const c of entidadesConfigRows) {
    const key = `${c.empresa_id}_${c.identificador_fiscal_hash || c.identificador_fiscal}`;
    configEntidadMap.set(key, c);
  }

  // Mapear cada documento al formato DocumentAccountingDebug
  const results: DocumentAccountingDebug[] = rawDocs.map(doc => {
    const isIssued = doc.is_issued === 1;
    const isTicket = (doc.tipo_documento || '').toLowerCase().includes('ticket');
    const docIdNum = doc.id_documento;

    const currentEntidadesDb = entidadesDbRows.filter((e: any) => Number(e.documento_id) === docIdNum);
    const currentLineasDb = lineasDbRows.filter((l: any) => Number(l.documento_id) === docIdNum);
    const currentImpuestosDb = impuestosDbRows.filter((i: any) => Number(i.documento_id) === docIdNum);

    const emisor = currentEntidadesDb.find((e: any) => e.rol === 'emisor' || e.rol === 'proveedor');
    const receptor = currentEntidadesDb.find((e: any) => e.rol === 'receptor' || e.rol === 'cliente');
    const entidadPrincipal = isIssued ? (receptor || emisor) : (emisor || receptor);

    // Flag de proveedor extranjero UE — se computa aquí arriba porque afecta
    // tanto al importe del Tercero (sección 1) como a los impuestos (sección 3).
    const docDatosExtra = (doc.datos_extra as Record<string, any>) || {};
    const esProveedorExtranjero = Boolean(docDatosExtra.es_proveedor_extranjero_ue);

    // Para proveedores extranjeros UE (autorepercusión intracomunitaria), el proveedor
    // NO cobra IVA español. El worker almacena:
    //   importe_total = base_real + IVA_INTRA_soportado
    // Pero las líneas solo contienen base_real. Por eso el Tercero (Proveedor)
    // debe ser: importe_total - Σ(cuotas IVA_INTRA_SOPORTADO).
    // Esto es GENÉRICO: funciona para cualquier porcentaje de IVA, cualquier doc extranjero.
    // Para docs locales (esProveedorExtranjero = false): siempre usa doc.total sin cambios.
    let importeTercero: number;
    if (esProveedorExtranjero) {
      const ivaIntraSoportadoTotal = currentImpuestosDb
        .filter((i: any) => /intra/i.test(i.tipo_impuesto || '') && /soportado/i.test(i.tipo_impuesto || '') && !/repercutido/i.test(i.tipo_impuesto || ''))
        .reduce((sum: number, i: any) => sum + (Number(i.cuota) || 0), 0);
      const computed = Number(doc.total || 0) - ivaIntraSoportadoTotal;
      // Fallback: si por algún error el resultado es ≤0, usar doc.total tal cual
      importeTercero = computed > 0 ? Number(computed.toFixed(2)) : Number(doc.total || 0);
    } else {
      importeTercero = Number(doc.total || 0);
    }

    // ==========================================
    // 1. CUENTA DE TERCERO (Proveedor / Cliente / Banco)
    // ==========================================
    let cuentaTercero: AccountingAccountItem;
    const entidadCuentaGuardada = entidadPrincipal?.cuenta_contable?.trim();

    // Buscar si hay regla en entidades_config
    const fiscalHash = entidadPrincipal?.identificador_fiscal_hash || (entidadPrincipal?.identificador_fiscal ? hashField(entidadPrincipal.identificador_fiscal) : null);
    const entidadConfig = fiscalHash && doc.empresa_id ? configEntidadMap.get(`${doc.empresa_id}_${fiscalHash}`) : null;

    if (entidadCuentaGuardada) {
      cuentaTercero = {
        tipo: 'tercero',
        codigo: entidadCuentaGuardada,
        nombre: entidadPrincipal?.nombre || doc.proveedor || (isIssued ? 'Cliente' : 'Proveedor'),
        debe: isIssued ? importeTercero : 0,
        haber: isIssued ? 0 : importeTercero,
        is_suggested: false,
        origen: 'bd_directa',
        referencia_id: entidadPrincipal ? Number(entidadPrincipal.id) : undefined
      };
    } else if (entidadConfig && (isIssued ? entidadConfig.cuenta_venta : entidadConfig.cuenta_compra)) {
      const codigoConfig = isIssued ? entidadConfig.cuenta_venta : entidadConfig.cuenta_compra;
      cuentaTercero = {
        tipo: 'tercero',
        codigo: codigoConfig,
        nombre: entidadPrincipal?.nombre || doc.proveedor || (isIssued ? 'Cliente habitual' : 'Proveedor habitual'),
        debe: isIssued ? importeTercero : 0,
        haber: isIssued ? 0 : importeTercero,
        is_suggested: false,
        origen: 'regla_proveedor',
        justificacion: 'Regla memorizada para este CIF en entidades_config',
        referencia_id: entidadPrincipal ? Number(entidadPrincipal.id) : undefined
      };
    } else {
      // Heurística PGC
      let codSugerido = '4000000';
      let nombreSugerido = doc.proveedor || 'Proveedor';
      let justif = 'Cuenta PGC estándar para proveedores';

      if (isIssued) {
        codSugerido = '4300000';
        nombreSugerido = doc.proveedor || 'Clientes (Venta)';
        justif = 'Cuenta PGC estándar para clientes nacionales';
      } else if (isTicket || !doc.cif || doc.cif === 'N/A' || /varios|al contado|ticket/i.test(doc.proveedor)) {
        codSugerido = '5720000';
        nombreSugerido = 'Bancos c/c / Caja (Pago Contado)';
        justif = 'Factura simplificada o ticket abonado al contado sin proveedor individualizado';
      } else {
        // Diferenciación Acreedor de servicios (410) vs Proveedor de mercancías (400)
        const provText = `${doc.proveedor} ${doc.lineas?.map(l => l.descripcion).join(' ') || ''}`.toLowerCase();
        if (/telecom|telefon|google|amazon web services|aws|hosting|software|asesor|suministro|endesa|iberdrola/i.test(provText)) {
          codSugerido = '4100000';
          nombreSugerido = `${doc.proveedor} (Acreedor de servicios)`;
          justif = 'Prestación de servicios de terceros (Acreedores varios PGC 410)';
        } else {
          codSugerido = '4000000';
          nombreSugerido = `${doc.proveedor} (Proveedor)`;
        }
      }

      cuentaTercero = {
        tipo: 'tercero',
        codigo: codSugerido,
        nombre: nombreSugerido,
        debe: isIssued ? importeTercero : 0,
        haber: isIssued ? 0 : importeTercero,
        is_suggested: true,
        confianza: 0.88,
        justificacion: justif,
        origen: 'heuristica_pgc',
        referencia_id: entidadPrincipal ? Number(entidadPrincipal.id) : undefined
      };
    }

    // ==========================================
    // 2. CUENTAS DE GASTO / COMPRA / INGRESO (Líneas)
    // ==========================================
    const cuentasGasto: AccountingAccountItem[] = [];

    if (currentLineasDb.length > 0) {
      for (const linea of currentLineasDb) {
        const importe = Number(linea.importe_linea) || 0;
        const desc = linea.descripcion || doc.proveedor || 'Gasto general';
        const lineaCuentaGuardada = linea.cuenta_contable?.trim();

        // Revisar si existe coincidencia en productos_config
        const prodMatch = productosConfigRows.find((p: any) =>
          p.id_de_empresa === doc.empresa_id &&
          desc.toLowerCase().includes((p.patron || '').toLowerCase())
        );

        if (lineaCuentaGuardada) {
          cuentasGasto.push({
            tipo: 'gasto',
            codigo: lineaCuentaGuardada,
            nombre: desc,
            // Recibida: gasto va al Debe (si importe > 0) o Haber si es abono (importe < 0)
            debe: !isIssued ? (importe >= 0 ? importe : 0) : 0,
            haber: isIssued ? (importe >= 0 ? importe : 0) : (importe < 0 ? Math.abs(importe) : 0),
            is_suggested: false,
            origen: 'bd_directa',
            referencia_id: Number(linea.id)
          });
        } else if (prodMatch) {
          cuentasGasto.push({
            tipo: 'gasto',
            codigo: prodMatch.cuenta_contable,
            nombre: `${desc} [Regla catálogo]`,
            // Recibida → Debe; Emitida (venta) → Haber
            debe: !isIssued ? (importe >= 0 ? importe : 0) : 0,
            haber: isIssued ? (importe >= 0 ? importe : 0) : (importe < 0 ? Math.abs(importe) : 0),
            is_suggested: prodMatch.is_ai_suggested === 1,
            justificacion: prodMatch.justification || 'Coincidencia con regla de producto',
            origen: 'regla_producto',
            referencia_id: Number(linea.id)
          });
        } else {
          // Heurística de gasto o venta
          if (isIssued) {
            cuentasGasto.push({
              tipo: 'gasto',
              codigo: '7000000',
              nombre: `Ventas de mercaderías / Servicios (${desc})`,
              debe: 0,
              haber: importe,
              is_suggested: true,
              confianza: 0.90,
              justificacion: 'Cuenta PGC estándar para ingresos por ventas (Grupo 700)',
              origen: 'heuristica_pgc',
              referencia_id: Number(linea.id)
            });
          } else {
            const h = heuristicExpenseAccount(desc);
            const isGeneric = !desc || /gasto general|servicios generales|varios/i.test(desc) || desc.trim().toLowerCase() === (doc.proveedor || '').trim().toLowerCase();
            const cleanNombre = isGeneric ? h.nombre : `${h.nombre} (${desc.length > 24 ? desc.substring(0, 24) + '...' : desc})`;
            cuentasGasto.push({
              tipo: 'gasto',
              codigo: h.codigo,
              nombre: cleanNombre,
              debe: importe >= 0 ? importe : 0,
              haber: importe < 0 ? Math.abs(importe) : 0,
              is_suggested: true,
              confianza: 0.85,
              justificacion: h.justificacion,
              origen: 'heuristica_pgc',
              referencia_id: Number(linea.id)
            });
          }
        }
      }
    } else {
      // Si el documento no tiene líneas desglosadas, creamos una cuenta de gasto por la Base Imponible
      const base = Number(doc.base_imponible) || Number(doc.total) || 0;
      if (isIssued) {
        cuentasGasto.push({
          tipo: 'gasto',
          codigo: '7000000',
          nombre: 'Ventas de mercaderías',
          debe: 0,
          haber: base,
          is_suggested: true,
          confianza: 0.85,
          justificacion: 'Ingreso estimado a cuenta PGC 700',
          origen: 'heuristica_pgc'
        });
      } else {
        const h = heuristicExpenseAccount(doc.proveedor || '');
        cuentasGasto.push({
          tipo: 'gasto',
          codigo: h.codigo,
          nombre: h.nombre,
          debe: base,
          haber: 0,
          is_suggested: true,
          confianza: 0.80,
          justificacion: h.justificacion,
          origen: 'heuristica_pgc'
        });
      }
    }

    // ==========================================
    // 3. CUENTAS DE IMPUESTOS (IVA / Retención IRPF)
    // ==========================================
    const cuentasImpuesto: AccountingAccountItem[] = [];

    if (currentImpuestosDb.length > 0) {
      // ── Lógica de impuestos ──
      // Para proveedores extranjeros UE (autorepercusión):
      //   IVA_INTRA_SOPORTADO (cuota > 0) → Debe (472)
      //   IVA_INTRA_REPERCUTIDO (cuota < 0) → Haber (477)
      // El balance cuadra porque el Tercero ya usa base_imponible (no total).
      // Para facturas nacionales: lógica estándar de siempre.
      // NO hay lógica de "espejo" — fue eliminada porque el verdadero fix
      // es usar la base correcta en el Tercero.

      for (const imp of currentImpuestosDb) {
        const tipo = (imp.tipo_impuesto || '').toLowerCase();
        const cuota = Number(imp.cuota) || 0;
        const pct = Number(imp.porcentaje) || 0;
        const cuentaGuardada = imp.cuenta_contable?.trim();

        if (cuota === 0 && pct === 0) continue;

        const isRetencion   = /retencion|reten|irpf/i.test(tipo);
        // repercutido: el tipo lo dice explícitamente O la cuota es negativa (signo contable)
        const isRepercutido = /repercutido/i.test(tipo) || cuota < 0;

        const importe = Math.abs(cuota);

        if (cuentaGuardada) {
          cuentasImpuesto.push({
            tipo: 'impuesto',
            codigo: cuentaGuardada,
            nombre: `${isRetencion ? 'Retención IRPF' : isRepercutido ? 'IVA Repercutido (Autorepercusión)' : 'IVA'} (${pct}%)`,
            debe: isRetencion
              ? (isIssued ? importe : 0)
              : isRepercutido
                ? 0
                : (!isIssued ? importe : 0),
            haber: isRetencion
              ? (!isIssued ? importe : 0)
              : isRepercutido
                ? importe
                : (isIssued ? importe : 0),
            is_suggested: false,
            origen: 'bd_directa',
            referencia_id: Number(imp.id)
          });
        } else {
          let codigoTax: string;
          let nombreTax: string;

          if (isRetencion) {
            codigoTax = isIssued ? '4730000' : '4751000';
            nombreTax = isIssued
              ? `H.P. Retenciones y pagos a cuenta (${pct}%)`
              : `H.P. Acreedora por retenciones practicadas (${pct}%)`;
          } else if (isRepercutido) {
            // PGC: 4772 = IVA repercutido por inversión del sujeto pasivo (ISP intracomunitario)
            //       4770 = IVA repercutido operaciones interiores normales
            const isIntraRep = /intra/i.test(tipo);
            if (isIntraRep) {
              codigoTax = '4772000';
              nombreTax = `H.P. IVA repercutido ISP intracomunitario ${pct}%`;
            } else {
              codigoTax = pct === 10 ? '4770010' : pct === 4 ? '4770004' : '4770021';
              nombreTax = `H.P. IVA repercutido (autorepercusión) ${pct}%`;
            }
          } else if (isIssued) {
            codigoTax = pct === 10 ? '4770010' : pct === 4 ? '4770004' : '4770021';
            nombreTax = `H.P. IVA repercutido ${pct}%`;
          } else {
            // PGC: 4721 = IVA soportado adquisiciones intracomunitarias de bienes/servicios
            //       4720 = IVA soportado operaciones interiores normales
            const isIntraSop = /intra/i.test(tipo);
            if (isIntraSop) {
              codigoTax = '4721000';
              nombreTax = `H.P. IVA soportado adquisición intracomunitaria ${pct}%`;
            } else {
              codigoTax = pct === 10 ? '4720010' : pct === 4 ? '4720004' : '4720021';
              nombreTax = `H.P. IVA soportado ${pct}%`;
            }
          }

          cuentasImpuesto.push({
            tipo: 'impuesto',
            codigo: codigoTax,
            nombre: nombreTax,
            debe: isRetencion
              ? (isIssued ? importe : 0)
              : isRepercutido
                ? 0
                : (!isIssued ? importe : 0),
            haber: isRetencion
              ? (!isIssued ? importe : 0)
              : isRepercutido
                ? importe
                : (isIssued ? importe : 0),
            is_suggested: true,
            confianza: 0.95,
            justificacion: isRetencion
              ? 'Cuenta PGC de retenciones fiscales IRPF'
              : isRepercutido
                ? (/intra/i.test(tipo)
                    ? `PGC 4772 — IVA repercutido por inversión del sujeto pasivo intracomunitario ${pct}%`
                    : `Autorepercusión IVA ${pct}% → Haber (477)`)
                : (/intra/i.test(tipo)
                    ? `PGC 4721 — IVA soportado adquisición intracomunitaria ${pct}%`
                    : `Subcuenta PGC estándar de IVA soportado al ${pct}%`),
            origen: 'heuristica_pgc',
            referencia_id: Number(imp.id)
          });
        }
      }
    } else if (doc.iva && doc.iva > 0) {
      // IVA global sin desglose
      const codigoTax = isIssued ? '4770021' : '4720021';
      cuentasImpuesto.push({
        tipo: 'impuesto',
        codigo: codigoTax,
        nombre: isIssued ? 'H.P. IVA repercutido 21%' : 'H.P. IVA soportado 21%',
        debe: isIssued ? 0 : doc.iva,
        haber: isIssued ? doc.iva : 0,
        is_suggested: true,
        confianza: 0.90,
        justificacion: 'IVA soportado general calculado de factura',
        origen: 'heuristica_pgc'
      });
    }

    // ==========================================
    // 4. ASIENTO COMPLETO CUADRADO (Debe y Haber)
    // ==========================================
    const asiento: AccountingAccountItem[] = [
      cuentaTercero,
      ...cuentasGasto,
      ...cuentasImpuesto
    ];

    const totalDebe = Number(asiento.reduce((acc, item) => acc + (item.debe || 0), 0).toFixed(2));
    const totalHaber = Number(asiento.reduce((acc, item) => acc + (item.haber || 0), 0).toFixed(2));
    const diferencia = Number((totalDebe - totalHaber).toFixed(2));
    const cuadrado = Math.abs(diferencia) <= 0.05; // Margen de tolerancia de céntimos

    const sugerenciasPendientes = asiento.filter(a => a.is_suggested).length;
    const totalCuentas = asiento.length;

    let estadoContable: 'aprobado' | 'revision' | 'sin_asignar' = 'aprobado';
    if (sugerenciasPendientes > 0) {
      estadoContable = 'revision';
    } else if (totalCuentas === 0) {
      estadoContable = 'sin_asignar';
    }

    return {
      id_documento: doc.id_documento,
      numero_documento: doc.numero_documento || `ID-${doc.id_documento}`,
      tipo_documento: doc.tipo_documento || 'factura',
      fecha_emision: doc.fecha_emision,
      proveedor: doc.proveedor,
      cif: doc.cif,
      empresa_id: doc.empresa_id,
      empresa_nombre: doc.empresa_nombre,
      is_issued: isIssued,
      total: Number(doc.total) || 0,
      base_imponible: Number(doc.base_imponible) || 0,
      total_iva: Number(doc.iva) || 0,
      retencion_irpf: Number(doc.retencion_irpf) || 0,
      cuenta_tercero: cuentaTercero,
      cuentas_gasto: cuentasGasto,
      cuentas_impuesto: cuentasImpuesto,
      asiento: asiento,
      total_debe: totalDebe,
      total_haber: totalHaber,
      cuadrado: cuadrado,
      diferencia: diferencia,
      estado_contable: estadoContable,
      sugerencias_pendientes: sugerenciasPendientes,
      total_cuentas: totalCuentas
    };
  });

  return results;
}

/**
 * Aprueba masivamente las sugerencias contables para los documentos seleccionados
 */
export async function approveDocumentSuggestionsBatch(documentIds: number[]): Promise<{ success: boolean; approvedCount: number }> {
  if (!documentIds || documentIds.length === 0) {
    return { success: true, approvedCount: 0 };
  }

  // 1. Obtener la información actual con sugerencias
  const [docs] = await Promise.all([
    prisma.documentos.findMany({
      where: { id: { in: documentIds.map(id => BigInt(id)) } },
      select: { id: true, id_de_empresa: true }
    })
  ]);

  if (docs.length === 0) return { success: true, approvedCount: 0 };

  const empresaIds: number[] = Array.from(new Set(docs.map((d: any) => Number(d.id_de_empresa)).filter(Boolean))) as number[];
  const list = await getDocumentsAccountingDebugList(empresaIds);
  const selectedList = list.filter(item => documentIds.includes(item.id_documento));

  let count = 0;

  for (const item of selectedList) {
    const docBigInt = BigInt(item.id_documento);

    // 1. Confirmar tercero si está sugerido
    if (item.cuenta_tercero && item.cuenta_tercero.is_suggested && item.cuenta_tercero.codigo) {
      await prisma.entidades_documento.updateMany({
        where: {
          documento_id: docBigInt,
          rol: { in: ['proveedor', 'emisor', 'acreedor', 'cliente', 'receptor'] }
        },
        data: { cuenta_contable: item.cuenta_tercero.codigo }
      });
      count++;
    }

    // 2. Confirmar líneas si están sugeridas
    for (const gasto of item.cuentas_gasto) {
      if (gasto.is_suggested && gasto.codigo && gasto.referencia_id) {
        await prisma.lineas_documento.update({
          where: { id: BigInt(gasto.referencia_id) },
          data: { cuenta_contable: gasto.codigo }
        });
        count++;
      }
    }

    // 3. Confirmar impuestos si están sugeridos
    for (const imp of item.cuentas_impuesto) {
      if (imp.is_suggested && imp.codigo && imp.referencia_id) {
        await prisma.impuestos_documento.update({
          where: { id: BigInt(imp.referencia_id) },
          data: { cuenta_contable: imp.codigo }
        });
        count++;
      }
    }
  }

  return { success: true, approvedCount: count };
}

/**
 * Modifica o confirma una cuenta contable específica de un documento
 */
export async function updateSingleDocumentAccountItem(payload: {
  documentoId: number;
  tipo: 'tercero' | 'gasto' | 'impuesto';
  referenciaId?: number;
  cuentaContable: string;
  rememberRule?: boolean;
  empresaId?: number;
  identificadorFiscal?: string;
  descripcionPatron?: string;
}): Promise<{ success: boolean }> {
  const { documentoId, tipo, referenciaId, cuentaContable, rememberRule, empresaId, identificadorFiscal, descripcionPatron } = payload;
  const docBigInt = BigInt(documentoId);

  if (tipo === 'tercero') {
    if (referenciaId) {
      await prisma.entidades_documento.update({
        where: { id: BigInt(referenciaId) },
        data: { cuenta_contable: cuentaContable }
      });
    } else {
      await prisma.entidades_documento.updateMany({
        where: {
          documento_id: docBigInt,
          rol: { in: ['proveedor', 'emisor', 'acreedor', 'cliente', 'receptor'] }
        },
        data: { cuenta_contable: cuentaContable }
      });
    }

    // Si marcó recordar regla y tenemos empresa y CIF:
    if (rememberRule && empresaId && identificadorFiscal) {
      await db.query(`
        INSERT INTO entidades_config (empresa_id, identificador_fiscal, identificador_fiscal_hash, cuenta_compra)
        VALUES (?, ?, SHA2(?, 256), ?)
        ON DUPLICATE KEY UPDATE cuenta_compra = VALUES(cuenta_compra)
      `, [empresaId, identificadorFiscal, identificadorFiscal, cuentaContable]);
    }
  } else if (tipo === 'gasto') {
    if (referenciaId) {
      await prisma.lineas_documento.update({
        where: { id: BigInt(referenciaId) },
        data: { cuenta_contable: cuentaContable }
      });
    }

    // Si marcó recordar regla para este producto
    if (rememberRule && empresaId && descripcionPatron) {
      await db.query(`
        INSERT INTO productos_config (id_de_empresa, patron, cuenta_contable, is_ai_suggested)
        VALUES (?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE cuenta_contable = VALUES(cuenta_contable), is_ai_suggested = 0
      `, [empresaId, descripcionPatron, cuentaContable]);
    }
  } else if (tipo === 'impuesto') {
    if (referenciaId) {
      await prisma.impuestos_documento.update({
        where: { id: BigInt(referenciaId) },
        data: { cuenta_contable: cuentaContable }
      });
    }
  }

  return { success: true };
}
