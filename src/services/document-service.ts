'use server';

import db from '@/lib/db';
import type { Document } from '@/lib/types';
import type { RowDataPacket } from 'mysql2';

interface DocumentPacket extends RowDataPacket {
    id: number;
    tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
    incidencia: number; // MySQL BOOLEAN is 0 or 1
    fecha_emision: string;
    importe_total: number;
    observaciones: string;
}

interface ArchivoPacket extends RowDataPacket {
    nombre_archivo: string;
}

export async function getDocuments(): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT 
            d.id,
            d.tipo_documento,
            d.incidencia,
            d.fecha_emision,
            d.importe_total,
            d.observaciones
        FROM documentos d
        ORDER BY d.fecha_emision DESC
    `);

    const documents = await Promise.all(documentRows.map(async (doc) => {
        const [fileRows] = await db.query<ArchivoPacket[]>(
            'SELECT nombre_archivo FROM archivos_documento WHERE documento_id = ? LIMIT 1',
            [doc.id]
        );

        const [lineaRows] = await db.query<RowDataPacket[]>(
            'SELECT SUM(importe_linea) as total FROM lineas_documento WHERE documento_id = ?',
            [doc.id]
        );

        let ingreso = 0;
        let gasto = 0;
        if (doc.tipo_documento === 'Factura' || doc.tipo_documento === 'Informe') { // Assuming Informes can generate income
             ingreso = doc.importe_total > 0 ? doc.importe_total : 0;
             gasto = doc.importe_total <= 0 ? Math.abs(doc.importe_total) : 0;
        } else {
            gasto = doc.importe_total;
        }


        return {
            id_documento: doc.id,
            nombre_archivo: fileRows.length > 0 ? fileRows[0].nombre_archivo : `doc-${doc.id}`,
            tipo_documento: doc.tipo_documento,
            fecha_subida: new Date(doc.fecha_emision).toISOString(),
            incidencia: !!doc.incidencia,
            contenido: doc.observaciones,
            ingreso: ingreso,
            gasto: gasto
        };
    }));
    
    // Quick fix for types
    return documents as unknown as Document[];
}
