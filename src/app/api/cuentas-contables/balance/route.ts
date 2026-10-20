import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { TaxAccountsConfig, BalanceAccountRow, BalanceTotalsResponse } from '@/types/tax-accounts';
import { DEFAULT_TAX_ACCOUNTS } from '@/types/tax-accounts';

export const dynamic = 'force-dynamic';

const PGC_DESCRIPTIONS: Record<string, string> = {
  '6000000': 'Compras de mercaderías',
  '60000000': 'Compras de mercaderías',
  '6020000': 'Compras de otros aprovisionamientos',
  '60200000': 'Compras de otros aprovisionamientos',
  '6210000': 'Arrendamientos y cánones',
  '62100000': 'Arrendamientos y cánones',
  '6220000': 'Reparaciones y conservación',
  '62200000': 'Reparaciones y conservación',
  '6230000': 'Servicios de profesionales independientes',
  '62300000': 'Servicios de profesionales independientes',
  '6240000': 'Transportes',
  '62400000': 'Transportes',
  '6250000': 'Primas de seguros',
  '62500000': 'Primas de seguros',
  '6260000': 'Servicios bancarios y similares',
  '62600000': 'Servicios bancarios y similares',
  '6270000': 'Publicidad, propaganda y RRPP',
  '62700000': 'Publicidad, propaganda y RRPP',
  '6280000': 'Suministros (Luz, agua, gas)',
  '62800000': 'Suministros (Luz, agua, gas)',
  '6290000': 'Otros servicios / Material de oficina',
  '62900000': 'Otros servicios / Material de oficina',
  '6290001': 'Material y suministros de oficina',
  '62900001': 'Material y suministros de oficina',

  '7000000': 'Ventas de mercaderías',
  '70000000': 'Ventas de mercaderías',
  '7050000': 'Prestaciones de servicios',
  '70500000': 'Prestaciones de servicios',

  '4720000': 'Hacienda Pública - IVA Soportado (Deducible)',
  '47200000': 'Hacienda Pública - IVA Soportado (Deducible)',
  '47200021': 'Hacienda Pública - IVA Soportado ISP Exterior (21%)',
  '47210000': 'Hacienda Pública - IVA Soportado ISP Intracomunitario',
  '4770000': 'Hacienda Pública - IVA Repercutido (Devengado)',
  '47700000': 'Hacienda Pública - IVA Repercutido (Devengado)',
  '47700021': 'Hacienda Pública - IVA Repercutido ISP Exterior (21%)',
  '47720000': 'Hacienda Pública - IVA Repercutido ISP Intracomunitario',
  '4751000': 'Hacienda Pública - Retenciones IRPF practicadas',
  '47510000': 'Hacienda Pública - Retenciones IRPF practicadas',
  '4730000': 'Hacienda Pública - Retenciones a cuenta',
  '47300000': 'Hacienda Pública - Retenciones a cuenta',

  '4000000': 'Proveedores varios',
  '40000000': 'Proveedores varios',
  '4100000': 'Acreedores por servicios',
  '41000000': 'Acreedores por servicios',
  '4300000': 'Clientes varios',
  '43000000': 'Clientes varios',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const yearStr = searchParams.get('year');
    const trimestreStr = searchParams.get('trimestre');

    if (!companyId) {
      return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
    }

    const empresaBigInt = BigInt(companyId);

    // Obtener empresa y su config de impuestos
    const empresa = await prisma.empresas.findUnique({
      where: { id: empresaBigInt },
      select: { id: true, nombre_de_empresa: true, config_cuentas_impuestos: true },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const taxConfig: TaxAccountsConfig = {
      ...DEFAULT_TAX_ACCOUNTS,
      ...((empresa.config_cuentas_impuestos as Record<string, any>) || {}),
    };

    // Obtener todas las entidades configuradas de la empresa para resolver nombres de cuentas
    const entidadesConfig = await prisma.entidades_config.findMany({
      where: { empresa_id: empresaBigInt },
      select: {
        identificador_fiscal_hash: true,
        nombre_referencia: true,
        cuenta_compra: true,
        cuenta_venta: true,
        cuenta_gasto: true,
        cuenta_ingreso: true,
      },
    });

    const accountLabels: Record<string, string> = { ...PGC_DESCRIPTIONS };
    for (const ec of entidadesConfig) {
      const name = ec.nombre_referencia || 'Entidad';
      if (ec.cuenta_compra) accountLabels[ec.cuenta_compra] = `Acreedor: ${name}`;
      if (ec.cuenta_venta) accountLabels[ec.cuenta_venta] = `Cliente: ${name}`;
      if (ec.cuenta_gasto && !accountLabels[ec.cuenta_gasto]) accountLabels[ec.cuenta_gasto] = `Gasto: ${name}`;
      if (ec.cuenta_ingreso && !accountLabels[ec.cuenta_ingreso]) accountLabels[ec.cuenta_ingreso] = `Ingreso: ${name}`;
    }

    // Filtros de fecha / trimestre
    const whereClause: Record<string, any> = {
      id_de_empresa: empresaBigInt,
    };

    if (yearStr && yearStr !== 'all') {
      whereClause.año_trimestre = parseInt(yearStr, 10);
    }
    if (trimestreStr && trimestreStr !== 'all') {
      whereClause.num_trimestre = parseInt(trimestreStr, 10);
    }

    // Traer documentos con sus entidades e impuestos
    const docs = await prisma.documentos.findMany({
      where: whereClause,
      include: {
        entidades_documento: true,
        impuestos_documento: true,
      },
      orderBy: { fecha_emision: 'asc' },
    });

    const accountLedger: Record<string, { debe: number; haber: number; movimientos: number; customLabel?: string }> = {};

    const addMovement = (cuentaRaw: string | null | undefined, debe: number, haber: number, defaultDesc?: string) => {
      const cuenta = (cuentaRaw || '').trim();
      if (!cuenta) return;

      if (!accountLedger[cuenta]) {
        accountLedger[cuenta] = { debe: 0, haber: 0, movimientos: 0, customLabel: defaultDesc };
      }
      accountLedger[cuenta].debe += debe;
      accountLedger[cuenta].haber += haber;
      accountLedger[cuenta].movimientos += 1;
      if (defaultDesc) {
        accountLabels[cuenta] = defaultDesc;
      }
    };

    let totalDocumentos = docs.length;
    let documentosIncompletos = 0;

    for (const doc of docs) {
      const tipoDoc = (doc.tipo_documento || '').toUpperCase();
      const isAbono = tipoDoc.includes('ABONO') || tipoDoc.includes('RECTIFICAT') || (Number(doc.importe_total || 0) < 0);
      const sign = isAbono ? -1 : 1;

      const totalDoc = Math.abs(Number(doc.importe_total || 0));
      const baseDoc = Math.abs(Number(doc.importe_sin_impuestos || 0));

      const esEmitida = tipoDoc.includes('EMITIDA') || tipoDoc.includes('VENTA');

      // Buscar entidades
      const emisor = doc.entidades_documento.find(e => e.rol === 'proveedor' || e.rol === 'emisor');
      const receptor = doc.entidades_documento.find(e => e.rol === 'cliente' || e.rol === 'receptor');

      if (!esEmitida) {
        // --- FACTURA RECIBIDA (COMPRA / GASTO) ---
        // 1. Cuenta Acreedor / Proveedor (HABER)
        const cuentaAcreedor = emisor?.cuenta_contable || (emisor ? '41000000' : null);
        const nombreAcreedor = emisor?.nombre || 'Acreedor';

        if (!cuentaAcreedor) {
          documentosIncompletos++;
        } else {
          addMovement(cuentaAcreedor, 0, totalDoc * sign, `Acreedor: ${nombreAcreedor}`);
        }

        // 2. Cuenta de Gasto (DEBE)
        const cuentaGasto = emisor?.cuenta_gasto || '62900000';
        addMovement(cuentaGasto, baseDoc * sign, 0, PGC_DESCRIPTIONS[cuentaGasto] || `Gasto: ${nombreAcreedor}`);

        // 3. Impuestos
        for (const imp of doc.impuestos_documento) {
          const t = (imp.tipo_impuesto || 'IVA').toUpperCase();
          const cuota = Math.abs(Number(imp.cuota || 0));

          if (t === 'RETENCION' || t.includes('RET') || t.includes('IRPF')) {
            // Retención IRPF practicada al profesional: va al HABER de la 4751
            const ccRet = imp.cuenta_contable || taxConfig.retencion_irpf_15 || '47510000';
            addMovement(ccRet, 0, cuota * sign, 'Hacienda Pública - Retenciones IRPF practicadas');
          } else if (t.includes('EXTRA_REPERCUTIDO') || t.includes('INTRA_REPERCUTIDO')) {
            // Repercutido exterior ISP: va al HABER en positivo
            const ccReperc = imp.cuenta_contable || (t.includes('INTRA') ? taxConfig.iva_intra_repercutido_21 : taxConfig.iva_extra_repercutido_21) || '47700021';
            const label = t.includes('INTRA') 
              ? 'Hacienda Pública - IVA Repercutido ISP Intracomunitario' 
              : 'Hacienda Pública - IVA Repercutido ISP Exterior';
            addMovement(ccReperc, 0, cuota * sign, label);
          } else {
            // IVA Soportado (general, reducidos, o ISP soportado): va al DEBE en positivo
            const ccSop = imp.cuenta_contable || taxConfig.iva_soportado_21 || '47200000';
            const descSop = t.includes('EXTRA') 
              ? 'Hacienda Pública - IVA Soportado ISP Exterior' 
              : (t.includes('INTRA') ? 'Hacienda Pública - IVA Soportado ISP Intracomunitario' : 'Hacienda Pública - IVA Soportado (Deducible)');
            addMovement(ccSop, cuota * sign, 0, descSop);
          }
        }
      } else {
        // --- FACTURA EMITIDA (VENTA / INGRESO) ---
        // 1. Cuenta Cliente (DEBE)
        const cuentaCliente = receptor?.cuenta_contable || (receptor ? '43000000' : null);
        const nombreCliente = receptor?.nombre || 'Cliente';

        if (!cuentaCliente) {
          documentosIncompletos++;
        } else {
          addMovement(cuentaCliente, totalDoc * sign, 0, `Cliente: ${nombreCliente}`);
        }

        // 2. Cuenta de Ingreso (HABER)
        const cuentaIngreso = receptor?.cuenta_gasto || '70000000';
        addMovement(cuentaIngreso, 0, baseDoc * sign, PGC_DESCRIPTIONS[cuentaIngreso] || `Ingreso: ${nombreCliente}`);

        // 3. Impuestos Repercutidos (HABER)
        for (const imp of doc.impuestos_documento) {
          const t = (imp.tipo_impuesto || 'IVA').toUpperCase();
          const cuota = Math.abs(Number(imp.cuota || 0));

          if (t === 'RETENCION' || t.includes('RET')) {
            // Retención soportada en venta: va al DEBE de la 473
            addMovement('47300000', cuota * sign, 0, 'H.P. Retenciones y pagos a cuenta');
          } else {
            const ccReperc = imp.cuenta_contable || taxConfig.iva_repercutido_21 || '47700000';
            addMovement(ccReperc, 0, cuota * sign, 'H.P. IVA Repercutido');
          }
        }
      }
    }

    // Convertir ledger en lista formateada
    const rows: BalanceAccountRow[] = Object.keys(accountLedger).map(cuenta => {
      const data = accountLedger[cuenta];
      const debe = Math.round(data.debe * 100) / 100;
      const haber = Math.round(data.haber * 100) / 100;
      const saldo = Math.round((debe - haber) * 100) / 100;

      let tipoSaldo: 'DEUDOR' | 'ACREEDOR' | 'CERO' = 'CERO';
      if (saldo > 0.001) tipoSaldo = 'DEUDOR';
      else if (saldo < -0.001) tipoSaldo = 'ACREEDOR';

      let grupo: BalanceAccountRow['grupo'] = 'otro';
      if (cuenta.startsWith('40') || cuenta.startsWith('41')) grupo = 'proveedor';
      else if (cuenta.startsWith('43')) grupo = 'cliente';
      else if (cuenta.startsWith('6')) grupo = 'gasto';
      else if (cuenta.startsWith('7')) grupo = 'ingreso';
      else if (cuenta.startsWith('47')) grupo = 'impuesto';

      return {
        cuenta,
        descripcion: accountLabels[cuenta] || data.customLabel || PGC_DESCRIPTIONS[cuenta] || 'Cuenta Contable',
        totalDebe: debe,
        totalHaber: haber,
        saldo: Math.abs(saldo),
        tipoSaldo,
        grupo,
        numMovimientos: data.movimientos,
      };
    });

    // Ordenar por número de cuenta contable ascendente
    rows.sort((a, b) => a.cuenta.localeCompare(b.cuenta, undefined, { numeric: true }));

    const sumaDebe = Math.round(rows.reduce((sum, r) => sum + r.totalDebe, 0) * 100) / 100;
    const sumaHaber = Math.round(rows.reduce((sum, r) => sum + r.totalHaber, 0) * 100) / 100;
    const diferencia = Math.round(Math.abs(sumaDebe - sumaHaber) * 100) / 100;
    const isCuadrado = diferencia < 0.05;

    return NextResponse.json({
      companyId: Number(companyId),
      empresaNombre: empresa.nombre_de_empresa,
      totales: {
        sumaDebe,
        sumaHaber,
        diferencia,
        isCuadrado,
        totalCuentas: rows.length,
        totalDocumentos,
        documentosIncompletos,
      },
      rows,
    });
  } catch (error: any) {
    console.error('❌ [BALANCE-CC] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
