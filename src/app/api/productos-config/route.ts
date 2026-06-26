
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getCurrentUser } from '@/services/user-service';
import { hashField, normalizeEntityName } from '@/lib/encryption';

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const empresaId = searchParams.get('empresaId');
        const proveedorCif = searchParams.get('proveedorCif');

        if (!empresaId) return NextResponse.json({ error: 'Falta empresaId' }, { status: 400 });

        let query = 'SELECT * FROM productos_config WHERE id_de_empresa = ?';
        const params: any[] = [empresaId];

        if (proveedorCif) {
            query += ' AND (proveedor_cif_hash = SHA2(?, 256) OR proveedor_cif = ? OR proveedor_cif IS NULL)';
            params.push(proveedorCif, proveedorCif);
        }

        const [rows] = await db.query(query, params);
        return NextResponse.json(rows);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { action, empresaId, items } = await req.json();

        if (!empresaId || !items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
        }

        if (action === 'save_rules') {
            for (const item of items) {
                const normPatron = item.normalizedDescription || item.description;
                const rawPatron = item.description;
                const patron = normPatron;
                const cuenta = item.cuenta_contable;
                const cif = item.proveedor_cif || null;

                // 1. Guardar regla (limpiamos por normalizado y por original para evitar duplicados de versiones antiguas)
                await db.query(`
                    DELETE FROM productos_config 
                    WHERE id_de_empresa = ? 
                    AND (patron = ? OR patron = ?) 
                    AND (IFNULL(proveedor_cif_hash, '') = IFNULL(SHA2(?, 256), '') OR IFNULL(proveedor_cif, '') = IFNULL(?, ''))
                `, [empresaId, patron, rawPatron, cif, cif]);

                await db.query(`
                    INSERT INTO productos_config (id_de_empresa, proveedor_cif, proveedor_cif_hash, patron, cuenta_contable, is_ai_suggested, justification)
                    VALUES (?, ?, SHA2(?, 256), ?, ?, 0, NULL)
                `, [empresaId, cif, cif, patron, cuenta]);

                // 2. Actualizar histórico de líneas con JOIN para asegurar proveedor y empresa
                // Usamos REGEXP_REPLACE para normalizar en SQL igual que en JS
                let updateQuery = `
                    UPDATE lineas_documento ld
                    JOIN documentos d ON ld.documento_id = d.id
                    JOIN entidades_documento ed ON d.id = ed.documento_id
                    SET ld.cuenta_contable = ?
                    WHERE d.id_de_empresa = ?
                    AND (
                        IFNULL(ed.identificador_fiscal_hash, '') = IFNULL(?, '') OR
                        IFNULL(ed.identificador_fiscal, '') = IFNULL(?, '')
                    )
                    AND ed.rol IN ('proveedor', 'emisor')
                `;
                let updateParams = [cuenta, empresaId, cif ? hashField(normalizeEntityName(cif)) : null, cif];

                if (item.code) {
                    updateQuery += ' AND ld.codigo = ?';
                    updateParams.push(item.code);
                } else {
                    // Si no hay código, comparamos normalizando en vuelo
                    updateQuery += `
                        AND UPPER(TRIM(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(ld.descripcion, '\\\\([^)]*\\\\)', ''),
                                    '\\\\[[^\\]]*\\\\]', ''
                                ),
                                '[[:space:]\\\\-_]+', ' '
                            )
                        )) = ?
                    `;
                    updateParams.push(normPatron.toUpperCase());
                }

                await db.query(updateQuery, updateParams);
            }
            return NextResponse.json({ success: true, message: 'Reglas y líneas actualizadas' });
        }

        if (action === 'clear_accounts') {
            for (const item of items) {
                const normPatron = item.normalizedDescription || item.description;
                const patron = normPatron;
                const cif = item.proveedor_cif || null;

                // 1. Eliminar regla (intentamos por normalizado y por original para ser exhaustivos)
                await db.query(`
                    DELETE FROM productos_config 
                    WHERE id_de_empresa = ? 
                    AND (patron = ? OR patron = ?) 
                    AND (IFNULL(proveedor_cif_hash, '') = IFNULL(SHA2(?, 256), '') OR IFNULL(proveedor_cif, '') = IFNULL(?, ''))
                `, [empresaId, normPatron, item.description, cif, cif]);

                // 2. Resetear líneas
                let resetQuery = `
                    UPDATE lineas_documento ld
                    JOIN documentos d ON ld.documento_id = d.id
                    JOIN entidades_documento ed ON d.id = ed.documento_id
                    SET ld.cuenta_contable = NULL
                    WHERE d.id_de_empresa = ?
                    AND (
                        IFNULL(ed.identificador_fiscal_hash, '') = IFNULL(?, '') OR
                        IFNULL(ed.identificador_fiscal, '') = IFNULL(?, '')
                    )
                    AND ed.rol IN ('proveedor', 'emisor')
                `;
                let resetParams = [empresaId, cif ? hashField(normalizeEntityName(cif)) : null, cif];

                if (item.code) {
                    resetQuery += ' AND ld.codigo = ?';
                    resetParams.push(item.code);
                } else {
                    resetQuery += `
                        AND UPPER(TRIM(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(ld.descripcion, '\\\\([^)]*\\\\)', ''),
                                    '\\\\[[^\\]]*\\\\]', ''
                                ),
                                '[[:space:]\\\\-_]+', ' '
                            )
                        )) = ?
                    `;
                    resetParams.push(normPatron.toUpperCase());
                }

                await db.query(resetQuery, resetParams);
            }
            return NextResponse.json({ success: true, message: 'Cuentas limpiadas' });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

    } catch (error: any) {
        console.error('❌ Error en /api/productos-config:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
