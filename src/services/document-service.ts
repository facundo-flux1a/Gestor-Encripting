'use server';

import db from '@/lib/db';
import type { Document } from '@/lib/types';
import type { RowDataPacket } from 'mysql2';

interface DocumentPacket extends RowDataPacket {
    id: number;
    numero_documento: string;
    tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
    incidencia: number; // MySQL BOOLEAN is 0 or 1
    fecha_emision: string;
    importe_total: number;
    importe_sin_impuestos: number;
    observaciones: string;
}

interface ArchivoPacket extends RowDataPacket {
    nombre_archivo: string;
}

interface EntidadPacket extends RowDataPacket {
    nombre: string;
    identificador_fiscal: string;
}

export async function getDocuments(): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT 
            d.id,
            d.numero_documento,
            d.tipo_documento,
            d.incidencia,
            d.fecha_emision,
            d.importe_total,
            d.importe_sin_impuestos,
            d.observaciones
        FROM documentos d
        ORDER BY d.fecha_emision DESC
    `);

    const documents = await Promise.all(documentRows.map(async (doc) => {
        const [fileRows] = await db.query<ArchivoPacket[]>(
            'SELECT nombre_archivo FROM archivos_documento WHERE documento_id = ? LIMIT 1',
            [doc.id]
        );
        
        const [entidadRows] = await db.query<EntidadPacket[]>(
            "SELECT nombre, identificador_fiscal FROM entidades_documento WHERE documento_id = ? AND rol = 'proveedor' LIMIT 1",
            [doc.id]
        );

        const [impuestoRows] = await db.query<RowDataPacket[]>(
            'SELECT tipo_impuesto, porcentaje, base_imponible, cuota FROM impuestos_documento WHERE documento_id = ?',
            [doc.id]
        );

        let ingreso = 0;
        let gasto = 0;
        if (doc.tipo_documento === 'Factura' || doc.tipo_documento === 'Informe') {
             ingreso = doc.importe_total > 0 ? doc.importe_total : 0;
             gasto = doc.importe_total <= 0 ? Math.abs(doc.importe_total) : 0;
        } else {
            gasto = doc.importe_total;
        }

        const iva = impuestoRows.reduce((acc, tax) => acc + tax.cuota, 0);

        return {
            id_documento: doc.id,
            numero_factura: doc.numero_documento,
            nombre_archivo: fileRows.length > 0 ? fileRows[0].nombre_archivo : `doc-${doc.id}`,
            tipo_documento: doc.tipo_documento,
            fecha_subida: new Date(doc.fecha_emision).toISOString(),
            incidencia: !!doc.incidencia,
            contenido: doc.observaciones, // Concepto
            ingreso: ingreso,
            gasto: gasto,
            proveedor: entidadRows.length > 0 ? entidadRows[0].nombre : 'N/A',
            cif: entidadRows.length > 0 ? entidadRows[0].identificador_fiscal : 'N/A',
            base_imponible: doc.importe_sin_impuestos,
            iva: iva,
            total: doc.importe_total,
        };
    }));
    
    // Quick fix for types
    return documents as unknown as Document[];
}
