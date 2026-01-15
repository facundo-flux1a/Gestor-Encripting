import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresa_id');

    if (!empresaId) {
      return NextResponse.json({ error: 'empresa_id es requerido' }, { status: 400 });
    }

    console.log('📋 [GET /api/trimestres/disponibles] Empresa:', empresaId);

    // ✅ Generar opciones de trimestres (2 años atrás, 1 año adelante)
    const añoActual = new Date().getFullYear();
    const todasOpciones: { año: number; trimestre: number }[] = [];

    for (let año = añoActual - 2; año <= añoActual + 1; año++) {
      for (let trimestre = 1; trimestre <= 4; trimestre++) {
        todasOpciones.push({ año, trimestre });
      }
    }

    // ✅ Consultar trimestres existentes en BD
    const [existentes] = await db.query<RowDataPacket[]>(
      `SELECT DISTINCT 
         año_trimestre as año, 
         num_trimestre as trimestre,
         MAX(trimestre_cerrado) as cerrado
       FROM documentos 
       WHERE id_de_empresa = ?
       GROUP BY año_trimestre, num_trimestre`,
      [empresaId]
    );

    console.log('📊 [disponibles] Trimestres en BD:', existentes.length);

    // ✅ Marcar cuáles existen y si están cerrados
    const trimestresMap = new Map(
      existentes.map(ex => [
        `${ex.año}-${ex.trimestre}`,
        { existe: true, cerrado: Boolean(ex.cerrado) }
      ])
    );

    // ✅ FILTRAR: Solo trimestres abiertos (cerrado = false) + nuevos
    const resultado = todasOpciones
      .map(opcion => {
        const key = `${opcion.año}-${opcion.trimestre}`;
        const info = trimestresMap.get(key);
        
        return {
          año: opcion.año,
          trimestre: opcion.trimestre,
          existe: info?.existe || false,
          cerrado: info?.cerrado || false,
          label: `${opcion.año} - T${opcion.trimestre}${info?.existe ? '' : ' (crear nuevo)'}`
        };
      })
      .filter(t => !t.cerrado) // ⬅️ CRÍTICO: Solo abiertos
      .sort((a, b) => {
        if (a.año !== b.año) return b.año - a.año;
        return b.trimestre - a.trimestre;
      });

    console.log('✅ [disponibles] Trimestres disponibles:', resultado.length);

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('❌ Error en GET /api/trimestres/disponibles:', error);
    return NextResponse.json(
      { error: 'Error al obtener trimestres disponibles' },
      { status: 500 }
    );
  }
}