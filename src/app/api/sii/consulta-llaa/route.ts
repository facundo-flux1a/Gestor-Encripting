import { NextRequest, NextResponse } from 'next/server';
import { siiService } from '@/services/sii-services';

const TRIMESTRE_MAP: Record<string, string[]> = {
  '1T': ['01', '02', '03'],
  '2T': ['04', '05', '06'],
  '3T': ['07', '08', '09'],
  '4T': ['10', '11', '12'],
};

function expandPeriodos(input: string[]): string[] {
  const expanded: string[] = [];
  for (const p of input) {
    const key = p.toString().toUpperCase();
    if (TRIMESTRE_MAP[key]) {
      expanded.push(...TRIMESTRE_MAP[key]);
    } else {
      expanded.push(p.toString().padStart(2, '0'));
    }
  }
  return Array.from(new Set(expanded));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { certificado_pfx, password, ejercicio, periodo, periodos, empresa_nif, empresa_nombre } = body;

    if (!certificado_pfx || !password || !empresa_nif) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    const año = parseInt(ejercicio || '2026', 10);
    const nombre = empresa_nombre || 'EMPRESA';

    // Expandir trimestres a meses reales para la AEAT
    const rawPeriodos: string[] = Array.isArray(periodos) && periodos.length > 0
      ? periodos
      : periodo ? [periodo.toString()] : ['01'];
    const listaMeses = expandPeriodos(rawPeriodos);
    const periodoLabel = rawPeriodos.join(', ');

    console.log(`📊 [LLAA] rawPeriodos recibidos: ${JSON.stringify(rawPeriodos)}`);
    console.log(`📊 [LLAA] listaMeses expandidos: ${JSON.stringify(listaMeses)}`);

    let combinedResult: any = null;
    let lastEntorno = 'PRUEBAS';
    let lastError: string | null = null;

    for (const mes of listaMeses) {
      console.log(`📊 [LLAA] Consultando mes: ${mes}`);
      const res = await siiService.consultarLLAA(año, mes, empresa_nif, nombre, certificado_pfx, password);
      console.log(`📊 [LLAA] Mes ${mes} → success: ${res.success}, error: ${res.error || '-'}`);

      if (!res.success) {
        lastError = res.error || 'Error al consultar período ' + mes;
        continue;
      }

      if (res.entorno) lastEntorno = res.entorno;

      if (!combinedResult) {
        combinedResult = res;
      } else {
        // Fusionar IvaDevengado / IvaDeducible de respuestas múltiples
        const baseLLAA = combinedResult.resultado?.RegistroRespuestaConsultaLLAA;
        const newLLAA = res.resultado?.RegistroRespuestaConsultaLLAA;
        if (baseLLAA && newLLAA) {
          for (const block of ['IvaDevengado', 'IvaDeducible'] as const) {
            if (baseLLAA[block] && newLLAA[block]) {
              for (const key of Object.keys(newLLAA[block])) {
                const a = parseFloat(baseLLAA[block][key] || '0');
                const b = parseFloat(newLLAA[block][key] || '0');
                baseLLAA[block][key] = (a + b).toFixed(2);
              }
            }
          }
        }
      }

      if (listaMeses.length > 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (!combinedResult && lastError) {
      return NextResponse.json({ success: false, error: lastError, entorno: lastEntorno });
    }

    // Corregir la etiqueta de período en la respuesta para que muestre lo que seleccionó el usuario
    if (combinedResult?.resultado?.PeriodoImpositivo) {
      combinedResult.resultado.PeriodoImpositivo.Periodo = periodoLabel;
    }

    return NextResponse.json(combinedResult || { success: false, error: 'Sin respuesta de AEAT' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
  }
}
