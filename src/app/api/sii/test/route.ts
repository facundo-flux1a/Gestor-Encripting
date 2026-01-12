// src/app/api/sii/test/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { siiService } from '@/services/sii-services';

// ⭐ IMPORTANTE: Forzar runtime de Node.js (no edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sii/test
 * 
 * Test de conexión con AEAT
 * Body: { certificado_pfx?: string (base64), password: string }
 * 
 * Si no se envía certificado_pfx, usa el del .env
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    let { certificado_pfx, password } = body;

    // 🔧 Si no viene certificado, usar el del .env
    if (!certificado_pfx) {
      certificado_pfx = process.env.SII_CERTIFICADO_PFX_BASE64;
    }

    // 🔧 Si no viene password, usar el del .env
    if (!password) {
      password = process.env.SII_CERTIFICADO_PASSWORD;
    }

    // Validar que tengamos ambos (de body o env)
    if (!certificado_pfx || !password) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Faltan credenciales (certificado o password). Configúralas en .env o envíalas en el body.' 
        },
        { status: 400 }
      );
    }

    console.log('🧪 [API /sii/test] Iniciando test de conexión...');

    const result = await siiService.testConnection(certificado_pfx, password);

    if (result.success) {
      console.log('✅ [API /sii/test] Conexión exitosa');
    } else {
      console.log('❌ [API /sii/test] Conexión fallida:', result.error);
    }

    // Devolver el resultado completo (incluye details si hay)
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [API /sii/test] Error inesperado:', error);
    return NextResponse.json(
      { 
        success: false,
        entorno: process.env.SII_ENVIRONMENT?.toUpperCase() || 'PRUEBAS',
        mensaje: 'Error inesperado al conectar con AEAT',
        error: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}