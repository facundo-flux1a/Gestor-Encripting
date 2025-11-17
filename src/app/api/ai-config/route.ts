import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { getUserAIConfig, saveUserAIConfig } from '@/services/ai-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-config
 * Obtiene la configuración de IA del usuario
 */
export async function GET() {
  try {
    console.log('🤖 [API-AI-CONFIG] Iniciando GET...');
    
    const user = await getCurrentUser();
    console.log('👤 [API-AI-CONFIG] Usuario:', user?.id);
    
    if (!user) {
      console.warn('⚠️ [API-AI-CONFIG] No autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const config = await getUserAIConfig();
    console.log('📋 [API-AI-CONFIG] Config obtenida:', config ? 'Sí' : 'No (usar defaults)');
    
    // Mapear snake_case de BD a camelCase para frontend
    return NextResponse.json({
      useOwnKey: config?.use_own_key || false,
      ownProvider: config?.own_provider || null,
      customPrompt: config?.custom_prompt || '',
      preferredModel: config?.preferred_model || 'gpt-4o-mini',
      sharedProvider: config?.shared_provider || 'gemini', // ✅ NUEVO
      // NO devolvemos la API key por seguridad
    });
  } catch (error: any) {
    console.error('❌ [API-AI-CONFIG] Error al obtener config:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-config
 * Guarda la configuración de IA del usuario
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🤖 [API-AI-CONFIG] Iniciando POST...');
    
    const user = await getCurrentUser();
    console.log('👤 [API-AI-CONFIG] Usuario:', user?.id);
    
    if (!user) {
      console.warn('⚠️ [API-AI-CONFIG] No autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { useOwnKey, ownProvider, ownApiKey, customPrompt, preferredModel, sharedProvider } = body;

    console.log('📝 [API-AI-CONFIG] Datos recibidos:', {
      useOwnKey,
      ownProvider,
      hasApiKey: !!ownApiKey,
      hasCustomPrompt: !!customPrompt,
      preferredModel,
      sharedProvider, // ✅ NUEVO
    });

    // Validaciones
    if (useOwnKey) {
      if (!ownProvider || !['openai', 'gemini'].includes(ownProvider)) {
        console.warn('⚠️ [API-AI-CONFIG] Proveedor inválido');
        return NextResponse.json(
          { error: 'Proveedor inválido' },
          { status: 400 }
        );
      }

      if (!ownApiKey) {
        console.warn('⚠️ [API-AI-CONFIG] API Key requerida');
        return NextResponse.json(
          { error: 'API Key requerida cuando usas tu propia key' },
          { status: 400 }
        );
      }

      // Validar formato de la API key
      if (ownProvider === 'openai' && !ownApiKey.startsWith('sk-')) {
        console.warn('⚠️ [API-AI-CONFIG] Formato OpenAI inválido');
        return NextResponse.json(
          { error: 'API Key de OpenAI debe empezar con "sk-"' },
          { status: 400 }
        );
      }

      if (ownProvider === 'gemini' && !ownApiKey.startsWith('AIza')) {
        console.warn('⚠️ [API-AI-CONFIG] Formato Gemini inválido');
        return NextResponse.json(
          { error: 'API Key de Gemini debe empezar con "AIza"' },
          { status: 400 }
        );
      }
    }

    // Guardar configuración (mapear camelCase a snake_case)
    const result = await saveUserAIConfig({
      use_own_key: useOwnKey,
      own_provider: useOwnKey ? ownProvider : null,
      own_api_key: useOwnKey ? ownApiKey : null,
      custom_prompt: customPrompt || null,
      preferred_model: preferredModel || 'gpt-4o-mini',
      shared_provider: sharedProvider || 'gemini', // ✅ NUEVO
    });

    if (!result.success) {
      console.error('❌ [API-AI-CONFIG] Error al guardar:', result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    console.log('✅ [API-AI-CONFIG] Configuración guardada correctamente');
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('❌ [API-AI-CONFIG] Error al guardar config:', error);
    return NextResponse.json(
      { error: 'Error al guardar configuración' },
      { status: 500 }
    );
  }
}