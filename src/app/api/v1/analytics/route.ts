import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import { getDashboardAnalytics, getHealthCheckAnalytics } from '@/services/document-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/analytics
 * 
 * Devuelve métricas de negocio agregadas y el estado de salud contable.
 */
export async function GET(request: NextRequest) {
  try {
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json({ error: 'Header X-Api-Key requerido.' }, { status: 401 });
    }

    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json({ error: 'API Key inválida o revocada.' }, { status: 401 });
    }

    const empresaId = authResult.empresa_id;

    const searchParams = request.nextUrl.searchParams;
    const trimestreParam = searchParams.get('trimestre');
    const añoParam = searchParams.get('año');

    const trimestre = trimestreParam ? Number(trimestreParam) : undefined;
    const año = añoParam ? Number(añoParam) : undefined;

    // Obtener métricas financieras generales
    const dashboardData = await getDashboardAnalytics([empresaId], año, trimestre);

    // Obtener estado del health check
    const healthCheckData = await getHealthCheckAnalytics([empresaId]);

    const logicChecks = healthCheckData.summary.logic_checks || 0;
    const totalIssues = healthCheckData.summary.mismatches + logicChecks;
    const healthScore = healthCheckData.summary.total > 0
        ? Math.round(((healthCheckData.summary.total - totalIssues) / healthCheckData.summary.total) * 100)
        : 100;

    return NextResponse.json(
      {
        filtros: {
          año: año || 'Todos',
          trimestre: trimestre || 'Todos',
        },
        metricas_financieras: {
          total_ingresos: dashboardData.kpis.totalIngresos,
          total_gastos: dashboardData.kpis.totalGastos,
          beneficio_neto: dashboardData.kpis.beneficio,
          // IVA PURO (excluye Recargos de Equivalencia y Retenciones/IRPF)
          iva_repercutido: dashboardData.kpis.ivaRepercutido,
          iva_soportado: dashboardData.kpis.ivaSoportado,
          resultado_iva_puro: dashboardData.kpis.resultadoIva,
          // RECARGOS DE EQUIVALENCIA (separados del IVA puro)
          recargo_repercutido: dashboardData.kpis.recargoRepercutido,
          recargo_soportado: dashboardData.kpis.recargoSoportado,
          // RETENCIONES / IRPF (cuota almacenada con signo negativo en BD)
          retencion_repercutido: dashboardData.kpis.retencionRepercutido,
          retencion_soportado: dashboardData.kpis.retencionSoportado,
          documentos_totales: dashboardData.kpis.totalDocs,
          facturas_ingreso: dashboardData.kpis.totalFacturasIngreso,
          facturas_gasto: dashboardData.kpis.totalFacturasGasto,
          evolucion_mensual: dashboardData.quarterlySummary,
          top_proveedores: dashboardData.topProviders,
          distribucion_documentos: dashboardData.documentDistribution
        },
        health_check: {
          score_salud_porcentaje: healthScore,
          documentos_analizados: healthCheckData.summary.total,
          descuadres_matematicos: healthCheckData.summary.mismatches,
          alertas_logicas: logicChecks,
          incidencias_activas: healthCheckData.documents.length,
          documentos_con_incidencias: healthCheckData.documents.map(d => ({
            id: d.id_documento,
            tipo_documento: d.tipo_documento,
            numero_documento: d.numero_documento,
            proveedor: d.proveedor,
            razon_incidencia: d.incidencia_razon || 'Múltiples alertas'
          }))
        }
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('❌ [GET /api/v1/analytics] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
