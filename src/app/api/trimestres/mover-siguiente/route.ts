import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import pool from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';

export async function POST(request: NextRequest) {
  const conn = await pool.getConnection();
  
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { documentoId } = await request.json();

    if (!documentoId) {
      return NextResponse.json({ error: 'Falta documentoId' }, { status: 400 });
    }

    await conn.beginTransaction();

    // Obtener documento actual
    const [docRows] = await conn.query<RowDataPacket[]>(
      'SELECT año_trimestre, num_trimestre, id_de_empresa FROM documentos WHERE id = ?',
      [documentoId]
    );

    if (docRows.length === 0) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const { año_trimestre, num_trimestre, id_de_empresa } = docRows[0];

    // Calcular siguiente trimestre
    let nuevoAño = año_trimestre;
    let nuevoTrimestre = num_trimestre + 1;

    if (nuevoTrimestre > 4) {
      nuevoTrimestre = 1;
      nuevoAño += 1;
    }

    // Actualizar documento
    await conn.query<OkPacket>(
      `UPDATE documentos 
       SET año_trimestre = ?, num_trimestre = ?, trimestre_cerrado = 0 
       WHERE id = ?`,
      [nuevoAño, nuevoTrimestre, documentoId]
    );

    await conn.commit();

    console.log(`✅ [MOVER-SIGUIENTE] Doc ${documentoId}: ${año_trimestre}T${num_trimestre} → ${nuevoAño}T${nuevoTrimestre}`);

    return NextResponse.json({
      success: true,
      nuevoAño,
      nuevoTrimestre,
      message: `Documento movido a T${nuevoTrimestre} ${nuevoAño}`
    });

  } catch (error) {
    await conn.rollback();
    console.error('❌ [API-MOVER-SIGUIENTE] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  } finally {
    conn.release();
  }
}