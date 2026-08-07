import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { analyzeDocumentWithAI } from '@/services/ai-service';
import { canMakeRequest } from '@/services/ai-limits-service';
import { userHasEmpresaAccess } from '@/lib/empresa-access';
import pool, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analyze-document
 * Analiza un documento usando IA y guarda las incidencias encontradas
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🤖 [API-ANALYZE] Iniciando análisis...');
    
    // Validar usuario
    const user = await getCurrentUser();
    console.log('👤 [API-ANALYZE] Usuario actual:', user?.id, user?.email);
    
    if (!user) {
      console.warn('⚠️ [API-ANALYZE] No hay usuario autenticado');
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const { documentId } = await request.json();
    console.log('📄 [API-ANALYZE] Documento a analizar:', documentId);

    if (!documentId) {
      console.warn('⚠️ [API-ANALYZE] documentId faltante');
      return NextResponse.json(
        { error: 'documentId es requerido' },
        { status: 400 }
      );
    }

    // Obtener el documento y verificar permisos
    const [docRows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.*, e.id_de_usuario 
       FROM ${dbName}.documentos d
       INNER JOIN ${dbName}.empresas e ON d.id_de_empresa = e.id
       WHERE d.id = ?`,
      [documentId]
    );

    if (docRows.length === 0) {
      console.warn('⚠️ [API-ANALYZE] Documento no encontrado');
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    const document = docRows[0];
    console.log('📋 [API-ANALYZE] Documento encontrado:', {
      id: document.id,
      tipo: document.tipo_documento,
      empresa: document.id_de_empresa,
      usuario: document.id_de_usuario
    });

    // Verificar que el documento pertenece a una empresa del usuario
    if (!userHasEmpresaAccess(user.id, document.id_de_usuario)) {
      console.warn('⚠️ [API-ANALYZE] Sin permisos - Doc pertenece a otra empresa/usuario');
      return NextResponse.json(
        { error: 'No tienes permiso para analizar este documento' },
        { status: 403 }
      );
    }

    // Validar que el documento tenga datos para analizar
    if (!document.datos_extra && !document.importe_total) {
      console.warn('⚠️ [API-ANALYZE] Sin datos para analizar');
      return NextResponse.json(
        { error: 'El documento no tiene datos para analizar' },
        { status: 400 }
      );
    }

    // Obtener configuración de IA del usuario para saber qué provider va a usar
    const [configRows] = await pool.execute<RowDataPacket[]>(
      `SELECT use_own_key, shared_provider, daily_limit_openai, daily_limit_gemini, is_unlimited
       FROM ${dbName}.ai_user_config
       WHERE user_id = ?`,
      [user.id]
    );

    const config = configRows[0] || { 
      use_own_key: false, 
      shared_provider: 'openai',
      daily_limit_openai: 5,
      daily_limit_gemini: 50,
      is_unlimited: false
    };

    // Si usa su propia key, no validar límites
    const shouldCheckLimits = !config.use_own_key && !config.is_unlimited;

    if (shouldCheckLimits) {
      // Determinar qué provider se va a usar
      const provider = config.shared_provider || 'openai';
      
      console.log(`🔍 [API-ANALYZE] Validando límites para ${provider}...`);

      // Verificar límites
      const limitCheck = await canMakeRequest(user.id, provider);

      if (!limitCheck.allowed) {
        console.warn(`⚠️ [API-ANALYZE] Límite alcanzado para ${provider}:`, limitCheck.reason);
        return NextResponse.json(
          { 
            error: 'Límite diario alcanzado',
            message: limitCheck.reason,
            usage: limitCheck.usage,
          },
          { status: 429 }
        );
      }

      console.log(`✅ [API-ANALYZE] Límites OK - Remaining: ${limitCheck.usage?.remaining}/${limitCheck.usage?.limit}`);
    } else {
      console.log(`ℹ️ [API-ANALYZE] Sin validación de límites (${config.use_own_key ? 'usa propia key' : 'usuario ilimitado'})`);
    }

    console.log(`✅ [API-ANALYZE] Iniciando análisis con IA...`);

    // Llamar al servicio de IA (esto ya incrementa el uso internamente)
    const result = await analyzeDocumentWithAI(documentId);

    if (!result.success) {
      console.error('❌ [API-ANALYZE] Error en análisis:', result.error);
      return NextResponse.json(
        { 
          error: result.error || 'Error al analizar el documento'
        },
        { status: 500 }
      );
    }

    console.log(`✅ [API-ANALYZE] Análisis completado: ${result.incidents.length} incidencias`);

    // ✅ Guardar las incidencias con id_de_empresa
    if (result.incidents && result.incidents.length > 0) {
      const values = result.incidents.map((inc: any) => [
        documentId,
        document.id_de_empresa, // ✅ AGREGADO: id de empresa del documento
        inc.tipo || 'OTRO',
        inc.descripcion || '',
        inc.severidad || 'baja',
        result.usage_log_id || null,
        result.provider,
        result.model,
      ]);

      await pool.query(
        `INSERT INTO ${dbName}.ai_incidencias_documento 
         (documento_id, id_de_empresa, tipo, descripcion, severidad, analisis_id, provider, model)
         VALUES ?`,
        [values]
      );

      console.log(`✅ [API-ANALYZE] ${result.incidents.length} incidencias guardadas (${result.provider}/${result.model}) - log_id: ${result.usage_log_id}`);
    }

    console.log(`✅ [API-ANALYZE] Respuesta enviada al frontend`);

    return NextResponse.json({
      success: true,
      incidentsFound: result.incidents?.length || 0,
      incidents: result.incidents,
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokens_used,
    });

  } catch (error: any) {
    console.error('❌ [API-ANALYZE] Error crítico:', error);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error.message 
      },
      { status: 500 }
    );
  }
}