import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me
 *
 * Devuelve el estado de la API key utilizada y los datos de la empresa
 * a la que pertenece (ID, CIF, nombre fiscal y comercial).
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: muvail_xxxxx
 *
 * Códigos de respuesta:
 *   200: Autenticación exitosa y datos de la empresa devueltos.
 *   401: Header ausente, clave inválida o revocada.
 *   404: Empresa asociada no encontrada en la base de datos.
 *   500: Error interno del servidor.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Extraer API Key del header
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Header X-Api-Key requerido.' },
        { status: 401 }
      );
    }

    // 2. Validar la clave
    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json(
        { error: 'API Key inválida o revocada.' },
        { status: 401 }
      );
    }

    const empresaId = authResult.empresa_id;

    // 3. Consultar datos de la empresa (Prisma desencripta automáticamente nombre y CIF)
    const empresa = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: {
        id: true,
        nombre_de_empresa: true,
        nombre_fiscal: true,
        CIF: true,
      },
    });

    if (!empresa) {
      return NextResponse.json(
        { error: 'Empresa asociada a la API Key no encontrada.' },
        { status: 404 }
      );
    }

    // 4. Retornar payload de identidad
    return NextResponse.json({
      status: 'ok',
      autenticado: true,
      api_key: {
        id: authResult.key_id ?? null,
        nombre: authResult.nombre ?? null,
        prefix: authResult.key_prefix ?? null,
      },
      empresa: {
        id: Number(empresa.id),
        cif: empresa.CIF?.trim() || null,
        nombre: empresa.nombre_de_empresa?.trim() || null,
        nombre_fiscal: empresa.nombre_fiscal?.trim() || null,
      },
    });
  } catch (error) {
    console.error('❌ [api/v1/me] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al consultar identidad de la API Key.' },
      { status: 500 }
    );
  }
}
