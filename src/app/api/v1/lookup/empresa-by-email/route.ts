import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashField } from '@/lib/encryption';

/**
 * POST /api/v1/lookup/empresa-by-email
 *
 * Endpoint interno para que n8n pueda encontrar una empresa a partir del
 * email de carga (mail_de_carga). Usa el blind index hash para buscar en
 * el campo encriptado, ya que la comparación directa no es posible con AES-256.
 *
 * Autenticación: Bearer <CRON_SECRET> en el header Authorization
 *
 * Body: { "email": "contabilidad@empresa.com" }
 *
 * Response OK:
 *   { found: true, empresa: { id, nombre_de_empresa, nombre_fiscal, CIF, mail_de_carga, recargo } }
 *
 * Response no encontrado:
 *   { found: false, empresa: null }
 */
export async function POST(req: Request) {
  try {
    // ── 1. Autenticación ──────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      console.warn('⚠️ [LOOKUP] Intento de acceso no autorizado a /api/v1/lookup/empresa-by-email');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Validar body ───────────────────────────────────────────────────
    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    const email = body?.email?.trim();
    if (!email) {
      return NextResponse.json({ error: 'El campo "email" es requerido' }, { status: 400 });
    }

    // ── 3. Calcular blind index hash ──────────────────────────────────────
    // hashField() hace sha256(value.toLowerCase().trim()), igual que el cron de encriptación
    const emailHash = hashField(email);
    console.log(`🔍 [LOOKUP] Buscando empresa para email hash: ${emailHash.substring(0, 8)}...`);

    // ── 4. Buscar empresa por hash ────────────────────────────────────────
    const empresa = await prisma.empresas.findFirst({
      where: {
        mail_de_carga_hash: emailHash,
      },
      select: {
        id: true,
        nombre_de_empresa: true,
        nombre_fiscal: true,
        CIF: true,
        mail_de_carga: true,
        recargo: true,
        config_roles: true,
      },
    });

    // ── 5. Respuesta ──────────────────────────────────────────────────────
    if (!empresa) {
      console.log(`❌ [LOOKUP] No se encontró empresa para el email: ${email}`);
      return NextResponse.json({ found: false, empresa: null });
    }

    console.log(`✅ [LOOKUP] Empresa encontrada: ID ${empresa.id} para email: ${email}`);

    return NextResponse.json({
      found: true,
      empresa: {
        id: Number(empresa.id),
        nombre_de_empresa: empresa.nombre_de_empresa,
        nombre_fiscal: empresa.nombre_fiscal,
        CIF: empresa.CIF,
        mail_de_carga: empresa.mail_de_carga,
        recargo: empresa.recargo,
        config_roles: empresa.config_roles,
      },
    });
  } catch (error) {
    console.error('❌ [LOOKUP] Error en /api/v1/lookup/empresa-by-email:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
