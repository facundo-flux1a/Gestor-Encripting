export interface TaxAccountsConfig {
  iva_soportado_21: string;
  iva_soportado_10: string;
  iva_soportado_4: string;
  iva_soportado_0: string;
  iva_repercutido_21: string;
  iva_repercutido_10: string;
  iva_repercutido_4: string;
  iva_repercutido_0: string;
  retencion_irpf_19: string;
  retencion_irpf_15: string;
  retencion_irpf_7: string;
  // Operaciones Exteriores (Inversión Sujeto Pasivo - ISP)
  iva_intra_soportado_21: string;
  iva_intra_repercutido_21: string;
  iva_extra_soportado_21: string;
  iva_extra_repercutido_21: string;
}

export const DEFAULT_TAX_ACCOUNTS: TaxAccountsConfig = {
  iva_soportado_21: '47200000',
  iva_soportado_10: '47200000',
  iva_soportado_4: '47200000',
  iva_soportado_0: '47200000',
  iva_repercutido_21: '47700000',
  iva_repercutido_10: '47700000',
  iva_repercutido_4: '47700000',
  iva_repercutido_0: '47700000',
  retencion_irpf_19: '47510000',
  retencion_irpf_15: '47510000',
  retencion_irpf_7: '47510000',
  iva_intra_soportado_21: '47210000',
  iva_intra_repercutido_21: '47720000',
  iva_extra_soportado_21: '47200021',
  iva_extra_repercutido_21: '47700021',
};

export interface BalanceAccountRow {
  cuenta: string;
  descripcion: string;
  totalDebe: number;
  totalHaber: number;
  saldo: number;
  tipoSaldo: 'DEUDOR' | 'ACREEDOR' | 'CERO';
  grupo: 'proveedor' | 'cliente' | 'gasto' | 'ingreso' | 'impuesto' | 'otro';
  numMovimientos: number;
}

export interface BalanceTotalsResponse {
  companyId: number;
  empresaNombre?: string;
  totales: {
    sumaDebe: number;
    sumaHaber: number;
    diferencia: number;
    isCuadrado: boolean;
    totalCuentas: number;
    totalDocumentos: number;
    documentosIncompletos: number;
  };
  rows: BalanceAccountRow[];
}

