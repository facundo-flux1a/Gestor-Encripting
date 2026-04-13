import { NextResponse } from 'next/server';
import connection from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const empresaId = searchParams.get('empresaId');
        const identificadorFiscal = searchParams.get('identificadorFiscal');

        if (!empresaId || !identificadorFiscal) {
            return NextResponse.json({ error: 'Faltan parámetros empresaId o identificadorFiscal' }, { status: 400 });
        }

        const [rows] = await connection.query(
            `
        SELECT cuenta_compra, cuenta_venta, nombre_referencia 
        FROM entidades_config 
        WHERE empresa_id = ? AND identificador_fiscal = ?
        LIMIT 1
      `,
            [empresaId, identificadorFiscal]
        ) as any[];

        if (rows.length > 0) {
            return NextResponse.json({ config: rows[0] });
        } else {
            return NextResponse.json({ config: null });
        }
    } catch (error) {
        console.error('❌ Error en GET /api/entidades-config:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { empresaId, identificadorFiscal, nombreReferencia, cuentaCompra, cuentaVenta } = body;

        if (!empresaId || !identificadorFiscal) {
            console.warn('❌ [API-ENTIDADES-CONFIG] ERROR: Faltan parámetros:', { empresaId, identificadorFiscal });
            return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
        }

        console.log('� [API-ENTIDADES-CONFIG] INICIANDO UPDATE:', {
            empresaId, identificadorFiscal, cuentaCompra, cuentaVenta
        });

        // 1. Insert or update (upsert) in entidades_config
        await connection.query(
            `
        INSERT INTO entidades_config (
          empresa_id, identificador_fiscal, nombre_referencia, cuenta_compra, cuenta_venta
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          nombre_referencia = VALUES(nombre_referencia),
          cuenta_compra = VALUES(cuenta_compra),
          cuenta_venta = COALESCE(VALUES(cuenta_venta), cuenta_venta)
      `,
            [empresaId, identificadorFiscal, nombreReferencia || null, cuentaCompra || null, cuentaVenta || null]
        );

        // 2. Update existing documents snapshot in entidades_documento
        // We only update documents belonging to the specific company being edited
        await connection.query(
            `
            UPDATE entidades_documento ed
            INNER JOIN documentos d ON ed.documento_id = d.id
            SET ed.cuenta_contable = ?
            WHERE d.id_de_empresa = ? 
            AND ed.identificador_fiscal = ? 
            AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
            `,
            [cuentaCompra || null, empresaId, identificadorFiscal]
        );

        return NextResponse.json({ success: true, updatedDocuments: true });
    } catch (error) {
        console.error('❌ Error en POST /api/entidades-config:', error);
        return NextResponse.json({ error: 'Error agregando/actualizando config' }, { status: 500 });
    }
}
