import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

import { DEFAULT_TAX_ACCOUNTS } from '@/types/tax-accounts';
import type { TaxAccountsConfig } from '@/types/tax-accounts';

/**
 * GET /api/cuentas-contables/impuestos?companyId=115
 * Devuelve la configuración de cuentas contables de impuestos de la empresa
 * combinada con los defaults del PGC.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
    }

    const empresa = await prisma.empresas.findUnique({
      where: { id: BigInt(companyId) },
      select: { id: true, config_cuentas_impuestos: true },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const savedConfig = (empresa.config_cuentas_impuestos as Record<string, any>) || {};
    const mergedConfig: TaxAccountsConfig = {
      ...DEFAULT_TAX_ACCOUNTS,
      ...savedConfig,
    };

    return NextResponse.json({
      companyId: Number(companyId),
      config: mergedConfig,
      isCustomized: Boolean(empresa.config_cuentas_impuestos),
    });
  } catch (error: any) {
    console.error('❌ [CC-IMPUESTOS-GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/cuentas-contables/impuestos
 * Guarda la configuración de impuestos personalizada para una empresa.
 * Body: { companyId: number, config: TaxAccountsConfig }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, config } = body;

    if (!companyId || !config) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    const updatedEmpresa = await prisma.empresas.update({
      where: { id: BigInt(companyId) },
      data: {
        config_cuentas_impuestos: config,
      },
      select: { id: true, config_cuentas_impuestos: true },
    });

    return NextResponse.json({
      success: true,
      companyId: Number(updatedEmpresa.id),
      config: updatedEmpresa.config_cuentas_impuestos,
    });
  } catch (error: any) {
    console.error('❌ [CC-IMPUESTOS-POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
