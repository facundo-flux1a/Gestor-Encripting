import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import pool, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-metrics
 * Obtiene métricas de uso de IA del usuario actual
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Obtener IDs de empresas del usuario
    const [empresasRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM ${dbName}.empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [user.id]
    );

    const empresaIds = empresasRows.map(e => e.id);

    if (empresaIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totales: {
            total_analisis: 0,
            total_tokens: 0,
            analisis_con_propia_key: 0,
            por_provider: {},
          },
          por_modelo: [],
          incidencias: {
            total_incidencias: 0,
            incidencias_alta: 0,
            incidencias_media: 0,
            incidencias_baja: 0,
          },
          limites: {
            openai: { limite: 5, usado_hoy: 0, restante: 5, porcentaje: 0 },
            gemini: { limite: 50, usado_hoy: 0, restante: 50, porcentaje: 0 },
            is_unlimited: false,
          },
        },
      });
    }

    // ✅ Obtener límites del usuario
    const [limitsRows] = await pool.query<RowDataPacket[]>(
      `SELECT daily_limit_openai, daily_limit_gemini, is_unlimited
       FROM ${dbName}.ai_user_config
       WHERE user_id = ?`,
      [user.id]
    );

    const userLimits = limitsRows[0] || {
      daily_limit_openai: 5,
      daily_limit_gemini: 50,
      is_unlimited: false,
    };

    // ✅ Obtener uso diario actual
    const today = new Date().toISOString().split('T')[0];
    const [dailyUsageRows] = await pool.query<RowDataPacket[]>(
      `SELECT provider, request_count
       FROM ${dbName}.ai_daily_usage
       WHERE user_id = ? AND usage_date = ?`,
      [user.id, today]
    );

    const openaiUsedToday = dailyUsageRows.find(r => r.provider === 'openai')?.request_count || 0;
    const geminiUsedToday = dailyUsageRows.find(r => r.provider === 'gemini')?.request_count || 0;

    // Totales generales
    const [totalesRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        COUNT(*) as total_analisis,
        SUM(tokens_used) as total_tokens,
        SUM(CASE WHEN used_own_key = 1 THEN 1 ELSE 0 END) as analisis_con_propia_key
       FROM ${dbName}.ai_usage_log
       WHERE user_id = ?`,
      [user.id]
    );

    const totales = totalesRows[0] || {
      total_analisis: 0,
      total_tokens: 0,
      analisis_con_propia_key: 0,
    };

    // Por proveedor
    const [providerRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        provider,
        COUNT(*) as total_analisis,
        SUM(tokens_used) as total_tokens
       FROM ${dbName}.ai_usage_log
       WHERE user_id = ?
       GROUP BY provider`,
      [user.id]
    );

    const por_provider: Record<string, { total_analisis: number; total_tokens: number }> = {};
    providerRows.forEach(row => {
      por_provider[row.provider] = {
        total_analisis: row.total_analisis,
        total_tokens: row.total_tokens || 0,
      };
    });

    // Por modelo
    const [modeloRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        provider,
        model,
        COUNT(*) as total_analisis,
        SUM(tokens_used) as total_tokens,
        SUM(CASE WHEN used_own_key = 1 THEN 1 ELSE 0 END) as analisis_con_propia_key,
        MIN(created_at) as primer_analisis,
        MAX(created_at) as ultimo_analisis
       FROM ${dbName}.ai_usage_log
       WHERE user_id = ?
       GROUP BY provider, model
       ORDER BY total_analisis DESC`,
      [user.id]
    );

    // Incidencias
    const [incidenciasRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        COUNT(*) as total_incidencias,
        SUM(CASE WHEN severidad = 'alta' THEN 1 ELSE 0 END) as incidencias_alta,
        SUM(CASE WHEN severidad = 'media' THEN 1 ELSE 0 END) as incidencias_media,
        SUM(CASE WHEN severidad = 'baja' THEN 1 ELSE 0 END) as incidencias_baja
       FROM ${dbName}.ai_incidencias_documento
       WHERE documento_id IN (
         SELECT id FROM ${dbName}.documentos WHERE id_de_empresa IN (?)
       )`,
      [empresaIds]
    );

    const incidencias = incidenciasRows[0] || {
      total_incidencias: 0,
      incidencias_alta: 0,
      incidencias_media: 0,
      incidencias_baja: 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        totales: {
          ...totales,
          por_provider,
        },
        por_modelo: modeloRows,
        incidencias,
        limites: {
          openai: {
            limite: userLimits.daily_limit_openai,
            usado_hoy: openaiUsedToday,
            restante: Math.max(0, userLimits.daily_limit_openai - openaiUsedToday),
            porcentaje: userLimits.daily_limit_openai > 0 
              ? (openaiUsedToday / userLimits.daily_limit_openai) * 100 
              : 0,
          },
          gemini: {
            limite: userLimits.daily_limit_gemini,
            usado_hoy: geminiUsedToday,
            restante: Math.max(0, userLimits.daily_limit_gemini - geminiUsedToday),
            porcentaje: userLimits.daily_limit_gemini > 0 
              ? (geminiUsedToday / userLimits.daily_limit_gemini) * 100 
              : 0,
          },
          is_unlimited: userLimits.is_unlimited || false,
        },
      },
    });

  } catch (error: any) {
    console.error('❌ Error en /api/ai-metrics:', error);
    return NextResponse.json(
      { 
        error: 'Error al obtener métricas',
        details: error.message 
      },
      { status: 500 }
    );
  }
}