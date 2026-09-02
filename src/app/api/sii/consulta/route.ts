import { NextRequest, NextResponse } from 'next/server';
import { siiService } from '@/services/sii-services';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      certificado_pfx,
      password,
      ejercicio,
      periodo,
      periodos,
      empresa_nif,
      empresa_nombre,
      tipo,
      fechaDesde,
      fechaHasta
    } = body;

    if (!certificado_pfx || !password || !empresa_nif) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    const año = parseInt(ejercicio || '2026', 10);
    const nombre = empresa_nombre || 'EMPRESA';

    // Traducir trimestres ('1T', '2T', '3T', '4T') a sus meses reales ('01'..'12') para la AEAT
    let listaPeriodos: string[] = [];
    if (Array.isArray(periodos) && periodos.length > 0) {
      const expansionMap: Record<string, string[]> = {
        '1T': ['01', '02', '03'],
        '2T': ['04', '05', '06'],
        '3T': ['07', '08', '09'],
        '4T': ['10', '11', '12'],
      };
      for (const p of periodos) {
        const key = p.toString().toUpperCase();
        if (expansionMap[key]) {
          listaPeriodos.push(...expansionMap[key]);
        } else {
          listaPeriodos.push(p.toString().padStart(2, '0'));
        }
      }
      listaPeriodos = Array.from(new Set(listaPeriodos));
    } else if (periodo) {
      const key = periodo.toString().toUpperCase();
      if (key === '1T') listaPeriodos = ['01', '02', '03'];
      else if (key === '2T') listaPeriodos = ['04', '05', '06'];
      else if (key === '3T') listaPeriodos = ['07', '08', '09'];
      else if (key === '4T') listaPeriodos = ['10', '11', '12'];
      else listaPeriodos = [periodo.toString().padStart(2, '0')];
    } else {
      listaPeriodos = ['01'];
    }

    // Ejecutar las consultas de forma secuencial/controlada para cuidar la conexión TLS con AEAT
    const allRecords: any[] = [];
    let lastCabecera: any = null;
    let lastEntorno = 'PRUEBAS';
    let lastError: string | null = null;

    for (const per of listaPeriodos) {
      let res;
      if (tipo === 'recibidas') {
        res = await siiService.consultarFacturasRecibidas(año, per, empresa_nif, nombre, certificado_pfx, password);
      } else {
        res = await siiService.consultarFacturasEmitidas(año, per, empresa_nif, nombre, certificado_pfx, password);
      }

      if (!res.success) {
        lastError = res.error || 'Error al consultar período ' + per;
        continue;
      }

      const data = res.resultado || res;
      if (data?.Cabecera) lastCabecera = data.Cabecera;
      if (res.entorno) lastEntorno = res.entorno;

      const emitidas = data?.RegistroRespuestaConsultaLRFacturasEmitidas;
      const recibidas = data?.RegistroRespuestaConsultaLRFacturasRecibidas;
      const items = Array.isArray(emitidas)
        ? emitidas
        : emitidas
        ? [emitidas]
        : Array.isArray(recibidas)
        ? recibidas
        : recibidas
        ? [recibidas]
        : [];

      allRecords.push(...items);

      // Pequeño delay de 100ms si hay múltiples llamados
      if (listaPeriodos.length > 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (allRecords.length === 0 && lastError) {
      return NextResponse.json({ success: false, error: lastError, entorno: lastEntorno });
    }

    // Deduplicar registros devueltos
    const seen = new Set<string>();
    let deduplicated = allRecords.filter((reg) => {
      const idFact = reg.IDFactura || {};
      const numFact = idFact.NumSerieFacturaEmisor || '';
      const fechaFact = idFact.FechaExpedicionFacturaEmisor || '';
      const key = `${numFact}_${fechaFact}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filtrado fino por Rango de Fechas / Hora si el usuario los especificó
    if (fechaDesde || fechaHasta) {
      const minTime = fechaDesde ? new Date(fechaDesde).getTime() : 0;
      const maxTime = fechaHasta ? new Date(fechaHasta).getTime() : Infinity;

      deduplicated = deduplicated.filter((reg) => {
        const idFact = reg.IDFactura || {};
        const fechaStr = idFact.FechaExpedicionFacturaEmisor || ''; // Ej: "15-01-2026"
        if (!fechaStr) return true;

        // Parsear DD-MM-YYYY a Date
        const parts = fechaStr.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const recDate = new Date(year, month, day).getTime();
          return recDate >= minTime && recDate <= maxTime;
        }
        return true;
      });
    }

    // Construir estructura de respuesta compatible con ResultPanel
    const responsePayload = {
      success: true,
      entorno: lastEntorno,
      resultado: {
        Cabecera: lastCabecera,
        PeriodoLiquidacion: { Ejercicio: año, Periodo: (Array.isArray(periodos) ? periodos.join(', ') : periodo) },
        ResultadoConsulta: deduplicated.length > 0 ? 'ConDatos' : 'SinDatos',
        ...(tipo === 'recibidas'
          ? { RegistroRespuestaConsultaLRFacturasRecibidas: deduplicated }
          : { RegistroRespuestaConsultaLRFacturasEmitidas: deduplicated }),
      },
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
  }
}
