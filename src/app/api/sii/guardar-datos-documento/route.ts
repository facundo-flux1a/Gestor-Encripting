import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import pool from '@/lib/db';
import { prisma } from '@/lib/prisma';

import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      nif_cliente,
      nombre_cliente,
      pais_cliente,
      tipo_factura,
      clave_regimen,
      base_imponible,
      cuota_iva
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de documento requerido' }, { status: 400 });
    }

    const docId = BigInt(id);

    // 1. Actualizar entidad (cliente/proveedor/receptor) en entidades_documento
    const nifLimpio = (nif_cliente || '').trim();
    const nombreLimpio = (nombre_cliente || '').trim();
    const paisLimpio = (pais_cliente || 'ES').trim().toUpperCase();

    const nifHash = nifLimpio ? createHash('sha256').update(nifLimpio.toLowerCase()).digest('hex') : null;
    const nombreHash = nombreLimpio ? createHash('sha256').update(nombreLimpio.toLowerCase()).digest('hex') : null;

    // Actualizar todas las entidades asociadas al documento (contraparte)
    await prisma.entidades_documento.updateMany({
      where: {
        documento_id: docId,
        rol: { in: ['cliente', 'proveedor', 'receptor'] }
      },
      data: {
        identificador_fiscal: nifLimpio,
        nombre: nombreLimpio,
        identificador_fiscal_hash: nifHash,
        nombre_hash: nombreHash
      }
    });

    // 2. Actualizar datos en la tabla `documentos`
    const base = parseFloat(base_imponible) || 0;
    const cuota = parseFloat(cuota_iva) || 0;
    const total = base + cuota;

    // Si por error se guardó 'F1', 'F2', etc. como tipo_documento, restaurarlo a 'FACTURA EMITIDA'
    await pool.query(
      `UPDATE documentos 
       SET tipo_documento = 'FACTURA EMITIDA' 
       WHERE id = ? AND tipo_documento IN ('F1', 'F2', 'F3', 'F4', 'R1', 'R2', 'R3', 'R4')`,
      [id]
    );

    await pool.query(
      `UPDATE documentos 
       SET 
         importe_sin_impuestos = ?, 
         importe_total = ?,
         datos_extra = JSON_SET(
           COALESCE(datos_extra, '{}'), 
           '$.clave_regimen', ?, 
           '$.pais_contraparte', ?,
           '$.tipo_factura_sii', ?
         )
       WHERE id = ?`,
      [base, total, clave_regimen || '01', paisLimpio, tipo_factura || 'F1', id]
    );

    // 3. Actualizar cuotas e impuestos en `impuestos_documento`
    await pool.query(
      `UPDATE impuestos_documento 
       SET base_imponible = ?, cuota = ?, total_con_impuesto = ?
       WHERE documento_id = ? AND tipo_impuesto = 'IVA'`,
      [base, cuota, total, id]
    );

    console.log(`✅ [SII-SAVE] Documento #${id} actualizado en base de datos correctamente. País: ${paisLimpio}, NIF: ${nifLimpio}`);

    return NextResponse.json({
      success: true,
      mensaje: 'Documento guardado permanentemente en la base de datos'
    });

  } catch (error: any) {
    console.error('❌ [SII-SAVE] Error al guardar datos del documento:', error);
    return NextResponse.json({ error: error.message || 'Error al guardar datos' }, { status: 500 });
  }
}
