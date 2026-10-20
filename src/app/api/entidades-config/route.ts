import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { hashField } from '@/lib/encryption';

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
        SELECT cuenta_compra, cuenta_venta, nombre_referencia, cuenta_gasto, cuenta_ingreso
        FROM entidades_config 
        WHERE empresa_id = ? AND (identificador_fiscal_hash = SHA2(?, 256) OR identificador_fiscal = ?)
        LIMIT 1
      `,
            [empresaId, identificadorFiscal, identificadorFiscal]
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
        const {
            empresaId,
            identificadorFiscal,
            nombreReferencia,
            cuentaCompra,
            cuentaVenta,
            cuentaGasto,
            cuentaIngreso,
            actualizarHistoricos = true,
        } = body;

        if (!empresaId || !identificadorFiscal) {
            console.warn('❌ [API-ENTIDADES-CONFIG] ERROR: Faltan parámetros:', { empresaId, identificadorFiscal });
            return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
        }

        console.log('📝 [API-ENTIDADES-CONFIG] INICIANDO UPDATE:', {
            empresaId, identificadorFiscal, cuentaCompra, cuentaVenta, actualizarHistoricos
        });

        // 1. Insert or update (upsert) in entidades_config
        await connection.query(
            `
        INSERT INTO entidades_config (
          empresa_id, identificador_fiscal, identificador_fiscal_hash, nombre_referencia, cuenta_compra, cuenta_venta, cuenta_gasto, cuenta_ingreso
        ) VALUES (?, ?, SHA2(?, 256), ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          nombre_referencia = COALESCE(VALUES(nombre_referencia), nombre_referencia),
          cuenta_compra = COALESCE(VALUES(cuenta_compra), cuenta_compra),
          cuenta_venta = COALESCE(VALUES(cuenta_venta), cuenta_venta),
          cuenta_gasto = COALESCE(VALUES(cuenta_gasto), cuenta_gasto),
          cuenta_ingreso = COALESCE(VALUES(cuenta_ingreso), cuenta_ingreso)
      `,
            [empresaId, identificadorFiscal, identificadorFiscal, nombreReferencia || null, cuentaCompra || null, cuentaVenta || null, cuentaGasto || null, cuentaIngreso || null]
        );

        let totalUpdated = 0;

        // Solo propagar si actualizarHistoricos es true
        if (actualizarHistoricos) {
            const fiscalHash = hashField(identificadorFiscal);

        // 2. Propagar cuenta_compra (41xxx) a docs del proveedor
        if (cuentaCompra !== undefined && cuentaCompra !== null) {
            await connection.query(
                `
                UPDATE entidades_documento ed
                INNER JOIN documentos d ON ed.documento_id = d.id
                SET ed.cuenta_contable = ?
                WHERE d.id_de_empresa = ? 
                AND (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
                AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
                `,
                [cuentaCompra, empresaId, fiscalHash, identificadorFiscal]
            );
        }

        // 3. Propagar cuenta_venta (43xxx) a docs del cliente
        if (cuentaVenta !== undefined && cuentaVenta !== null) {
            await connection.query(
                `
                UPDATE entidades_documento ed
                INNER JOIN documentos d ON ed.documento_id = d.id
                SET ed.cuenta_contable = ?
                WHERE d.id_de_empresa = ? 
                AND (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
                AND (ed.rol = 'cliente' OR ed.rol = 'receptor')
                `,
                [cuentaVenta, empresaId, fiscalHash, identificadorFiscal]
            );
        }

        // 4. Propagar cuenta_gasto (6xxx) a docs del proveedor
        if (cuentaGasto !== undefined && cuentaGasto !== null) {
            await connection.query(
                `
                UPDATE entidades_documento ed
                INNER JOIN documentos d ON ed.documento_id = d.id
                SET ed.cuenta_gasto = ?
                WHERE d.id_de_empresa = ?
                AND (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
                AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
                `,
                [cuentaGasto, empresaId, fiscalHash, identificadorFiscal]
            );
        }

        // 5. Propagar cuenta_ingreso (7xxx) a docs del cliente
        if (cuentaIngreso !== undefined && cuentaIngreso !== null) {
            await connection.query(
                `
                UPDATE entidades_documento ed
                INNER JOIN documentos d ON ed.documento_id = d.id
                SET ed.cuenta_gasto = ?
                WHERE d.id_de_empresa = ?
                AND (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
                AND (ed.rol = 'cliente' OR ed.rol = 'receptor')
                `,
                [cuentaIngreso, empresaId, fiscalHash, identificadorFiscal]
            );
        }
        } // Fin if (actualizarHistoricos)

        return NextResponse.json({ success: true, updatedDocuments: Boolean(actualizarHistoricos) });
    } catch (error) {
        console.error('❌ Error en POST /api/entidades-config:', error);
        return NextResponse.json({ error: 'Error agregando/actualizando config' }, { status: 500 });
    }
}
