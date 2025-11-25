// app/api/calculate-quarter/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 🔢 Función para calcular trimestre basado en fecha
 * @param fecha - Date object
 * @returns { añoTrimestre: number, numTrimestre: number }
 */
function calculateQuarter(fecha: Date): { añoTrimestre: number; numTrimestre: number } {
  const mes = fecha.getMonth() + 1; // getMonth() devuelve 0-11
  const año = fecha.getFullYear();
  
  let numTrimestre: number;
  
  if (mes >= 1 && mes <= 3) {
    numTrimestre = 1;
  } else if (mes >= 4 && mes <= 6) {
    numTrimestre = 2;
  } else if (mes >= 7 && mes <= 9) {
    numTrimestre = 3;
  } else {
    numTrimestre = 4;
  }
  
  return {
    añoTrimestre: año,
    numTrimestre: numTrimestre
  };
}

/**
 * POST - Calcular trimestre para una fecha específica
 * Body: { fecha_creacion: string (ISO 8601) }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (!body.fecha_creacion) {
      return NextResponse.json(
        { error: 'Se requiere el campo fecha_creacion' },
        { status: 400 }
      );
    }

    const fecha = new Date(body.fecha_creacion);
    
    if (isNaN(fecha.getTime())) {
      return NextResponse.json(
        { error: 'Fecha inválida. Use formato ISO 8601' },
        { status: 400 }
      );
    }

    const { añoTrimestre, numTrimestre } = calculateQuarter(fecha);

    console.log('✅ [API-CALCULATE-QUARTER] Calculado:', {
      fecha_creacion: body.fecha_creacion,
      añoTrimestre,
      numTrimestre
    });

    return NextResponse.json({
      success: true,
      añoTrimestre,
      numTrimestre,
      fecha_procesada: fecha.toISOString()
    });

  } catch (error) {
    console.error('❌ [API-CALCULATE-QUARTER] Error:', error);
    return NextResponse.json(
      { error: 'Error al calcular trimestre' },
      { status: 500 }
    );
  }
}