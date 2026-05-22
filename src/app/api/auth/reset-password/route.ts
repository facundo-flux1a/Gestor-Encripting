import { NextRequest, NextResponse } from 'next/server';
import db, { dbName } from '@/lib/db';
import bcrypt from 'bcryptjs';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface ResetToken extends RowDataPacket {
  id: bigint;
  user_id: bigint;
  token: string;
  email: string;
  expires_at: Date;
  used: number;
}

interface User extends RowDataPacket {
  id: number;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword, password } = body;
    
    // ✅ Aceptar ambos nombres de campo
    const passwordToUse = newPassword || password;

    console.log('🔍 [RESET-PASSWORD] Iniciando reset para token:', token);

    // Validaciones básicas
    if (!token || !passwordToUse) {
      console.log('❌ [RESET-PASSWORD] Faltan datos');
      return NextResponse.json(
        { success: false, message: 'Token y contraseña son requeridos' },
        { status: 400 }
      );
    }

    if (passwordToUse.length < 8) {
      console.log('❌ [RESET-PASSWORD] Contraseña muy corta');
      return NextResponse.json(
        { success: false, message: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    // Buscar y validar token
    const [rows] = await db.query<ResetToken[]>(
      `SELECT 
        id, 
        user_id, 
        token, 
        email, 
        expires_at, 
        used 
      FROM ${dbName}.password_reset_tokens 
      WHERE token = ?`,
      [token]
    );

    if (rows.length === 0) {
      console.log('❌ [RESET-PASSWORD] Token no existe');
      return NextResponse.json(
        { success: false, message: 'Token inválido o expirado' },
        { status: 404 }
      );
    }

    const resetToken = rows[0];

    // Verificar si ya fue usado
    if (resetToken.used === 1) {
      console.log('❌ [RESET-PASSWORD] Token ya usado');
      return NextResponse.json(
        { success: false, message: 'Este token ya fue utilizado' },
        { status: 400 }
      );
    }

    // Verificar si expiró
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);

    if (now > expiresAt) {
      console.log('❌ [RESET-PASSWORD] Token expirado');
      return NextResponse.json(
        { success: false, message: 'El token ha expirado' },
        { status: 400 }
      );
    }

    // ✅ NUEVO: Obtener la contraseña actual del usuario
    const [userRows] = await db.query<User[]>(
      `SELECT id, password FROM ${dbName}.usuarios WHERE id = ?`,
      [resetToken.user_id]
    );

    if (userRows.length === 0) {
      console.log('❌ [RESET-PASSWORD] Usuario no encontrado');
      return NextResponse.json(
        { success: false, message: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = userRows[0];

    // ✅ NUEVO: Verificar si la nueva contraseña es igual a la anterior
    let isSamePassword = false;

    try {
      // Intentar comparar con bcrypt (si la contraseña actual está hasheada)
      isSamePassword = await bcrypt.compare(passwordToUse, user.password);
    } catch (error) {
      // Si falla bcrypt, comparar como texto plano (por si aún no migró)
      isSamePassword = user.password === passwordToUse;
    }

    if (isSamePassword) {
      console.log('❌ [RESET-PASSWORD] Nueva contraseña igual a la anterior');
      return NextResponse.json(
        { success: false, message: 'La nueva contraseña no puede ser igual a la anterior' },
        { status: 400 }
      );
    }

    console.log('✅ [RESET-PASSWORD] Token válido, hasheando contraseña...');

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(passwordToUse, 10);

    console.log('💾 [RESET-PASSWORD] Actualizando contraseña para user_id:', resetToken.user_id.toString());

    // Actualizar contraseña del usuario
    const [updateResult] = await db.query<ResultSetHeader>(
      `UPDATE ${dbName}.usuarios 
       SET password = ?, 
           fecha_actualizacion = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [hashedPassword, resetToken.user_id]
    );

    if (updateResult.affectedRows === 0) {
      console.log('❌ [RESET-PASSWORD] Error al actualizar');
      return NextResponse.json(
        { success: false, message: 'Error al actualizar la contraseña' },
        { status: 500 }
      );
    }

    console.log('✅ [RESET-PASSWORD] Contraseña actualizada, marcando token como usado...');

    // Marcar token como usado
    await db.query<ResultSetHeader>(
      `UPDATE ${dbName}.password_reset_tokens 
       SET used = 1 
       WHERE id = ?`,
      [resetToken.id]
    );

    console.log('🎉 [RESET-PASSWORD] Proceso completado exitosamente para:', resetToken.email);

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    console.error('❌ [RESET-PASSWORD] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Error al actualizar la contraseña' },
      { status: 500 }
    );
  }
}