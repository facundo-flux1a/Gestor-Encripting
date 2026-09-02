import { NextRequest, NextResponse } from 'next/server';
import { siiService } from '@/services/sii-services';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      certificado_pfx, password, ejercicio, periodo,
      empresa_nif, empresa_nombre,
      numero_factura, fecha_expedicion,
      nif_emisor,          // solo para recibidas
      nombre_emisor,       // solo para recibidas
      tipo_libro = 'emitidas' // 'emitidas' | 'recibidas'
    } = body;

    if (!certificado_pfx || !password || !empresa_nif || !numero_factura || !fecha_expedicion) {
      return NextResponse.json({
        success: false,
        error: 'Faltan parámetros requeridos: certificado_pfx, password, empresa_nif, numero_factura, fecha_expedicion'
      }, { status: 400 });
    }

    const ejer = parseInt(ejercicio || '2026', 10);
    const per  = (periodo || '01').toString().padStart(2, '0');
    const nombre = empresa_nombre || 'EMPRESA';

    let result;
    if (tipo_libro === 'recibidas') {
      result = await siiService.anularFacturaRecibida(
        ejer, per, empresa_nif, nombre,
        numero_factura, fecha_expedicion,
        nif_emisor || '',
        nombre_emisor || '',
        certificado_pfx, password
      );
    } else {
      result = await siiService.anularFacturaEmitida(
        ejer, per, empresa_nif, nombre,
        numero_factura, fecha_expedicion,
        certificado_pfx, password
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
  }
}
