import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

interface ResetToken extends RowDataPacket {
  id: bigint;
  user_id: bigint;
  token: string;
  email: string;
  expires_at: Date;
  used: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    console.log('🔍 [VALIDATE-TOKEN] Validando token:', token);

    if (!token) {
      console.log('❌ [VALIDATE-TOKEN] Token no proporcionado');
      return NextResponse.json(
        { valid: false, message: 'Token no proporcionado' },
        { status: 400 }
      );
    }

    // Buscar token en DB
    const [rows] = await db.query<ResetToken[]>(
      `SELECT 
        id, 
        user_id, 
        token, 
        email, 
        expires_at, 
        used 
      FROM erp49.password_reset_tokens 
      WHERE token = ?`,
      [token]
    );

    console.log('📊 [VALIDATE-TOKEN] Resultado query:', rows.length > 0 ? 'Token encontrado' : 'Token no encontrado');

    if (rows.length === 0) {
      console.log('❌ [VALIDATE-TOKEN] Token no existe en DB');
      return NextResponse.json(
        { valid: false, message: 'Token inválido o expirado' },
        { status: 404 }
      );
    }

    const resetToken = rows[0];

    // Verificar si ya fue usado
    if (resetToken.used === 1) {
      console.log('❌ [VALIDATE-TOKEN] Token ya fue usado');
      return NextResponse.json(
        { valid: false, message: 'Este token ya fue utilizado' },
        { status: 400 }
      );
    }

    // Verificar si expiró
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);

    console.log('⏰ [VALIDATE-TOKEN] Ahora:', now.toISOString());
    console.log('⏰ [VALIDATE-TOKEN] Expira:', expiresAt.toISOString());

    if (now > expiresAt) {
      console.log('❌ [VALIDATE-TOKEN] Token expirado');
      return NextResponse.json(
        { valid: false, message: 'El token ha expirado. Solicita uno nuevo.' },
        { status: 400 }
      );
    }

    console.log('✅ [VALIDATE-TOKEN] Token válido para usuario:', resetToken.email);

    return NextResponse.json({
      valid: true,
      email: resetToken.email,
      userId: resetToken.user_id.toString()
    });

  } catch (error) {
    console.error('❌ [VALIDATE-TOKEN] Error:', error);
    return NextResponse.json(
      { valid: false, message: 'Error al validar el token' },
      { status: 500 }
    );
  }
}