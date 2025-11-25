import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const exportId = searchParams.get('exportId');

    if (!exportId) {
      return NextResponse.json(
        { error: 'exportId requerido' },
        { status: 400 }
      );
    }

    console.log('🔍 [check-export] Consultando export:', exportId);

    // Consultar estado del export
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT estado, url_archivo, nombre_archivo 
       FROM exports 
       WHERE id = ? AND id_de_usuario = ?`,
      [exportId, user.id]
    );

    if (rows.length === 0) {
      console.log('❌ [check-export] Export no encontrado:', exportId);
      return NextResponse.json(
        { error: 'Export no encontrado' },
        { status: 404 }
      );
    }

    const exportData = rows[0];
    
    console.log('📊 [check-export] Estado:', {
      exportId,
      estado: exportData.estado,
      url: exportData.url_archivo ? 'presente' : 'null',
      nombre: exportData.nombre_archivo
    });

    // ✅ IMPORTANTE: Retornar con el campo "status" (no "estado")
    const response = {
      status: exportData.estado,           // ← Backend devuelve "status"
      urlArchivo: exportData.url_archivo,
      nombreArchivo: exportData.nombre_archivo
    };

    console.log('📤 [check-export] Enviando respuesta:', response);

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [check-export] Error:', error);
    return NextResponse.json(
      { error: 'Error al consultar export' },
      { status: 500 }
    );
  }
}