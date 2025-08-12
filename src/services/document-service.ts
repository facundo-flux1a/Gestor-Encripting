'use server';

import db from '@/lib/db';
import type { Document, IvaDetail } from '@/lib/types';
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
    rol: string;
}

interface ImpuestoPacket extends RowDataPacket {
    tipo_impuesto: string;
    porcentaje: number;
    base_imponible: number;
    cuota: number;
}

async function mapDocumentPacketsToDocuments(documentRows: DocumentPacket[]): Promise<Document[]> {
    const documents = await Promise.all(documentRows.map(async (doc) => {
        const [fileRows] = await db.query<ArchivoPacket[]>(
            'SELECT nombre_archivo FROM archivos_documento WHERE documento_id = ? LIMIT 1',
            [doc.id]
        );
        
        const [entidadRows] = await db.query<EntidadPacket[]>(
            "SELECT nombre, identificador_fiscal, rol FROM entidades_documento WHERE documento_id = ?",
            [doc.id]
        );
        
        const proveedor = entidadRows.find(e => e.rol === 'proveedor') || entidadRows.find(e => e.rol === 'emisor');
        const cliente = entidadRows.find(e => e.rol === 'cliente') || entidadRows.find(e => e.rol === 'receptor');

        const [impuestoRows] = await db.query<ImpuestoPacket[]>(
            'SELECT tipo_impuesto, porcentaje, base_imponible, cuota FROM impuestos_documento WHERE documento_id = ?',
            [doc.id]
        );

        let ingreso = 0;
        let gasto = 0;
        
        if (doc.tipo_documento === 'Factura' && proveedor) {
             gasto = doc.importe_total;
        } else {
             ingreso = doc.importe_total;
        }

        const iva_details: IvaDetail[] = impuestoRows.map(tax => ({
            tipo_impuesto: tax.tipo_impuesto,
            porcentaje: tax.porcentaje,
            base_imponible: tax.base_imponible,
            cuota: tax.cuota,
        }));
        
        const total_iva = iva_details.reduce((acc, tax) => acc + tax.cuota, 0);

        return {
            id_documento: doc.id,
            numero_factura: doc.numero_documento,
            nombre_archivo: fileRows.length > 0 ? fileRows[0].nombre_archivo : `doc-${doc.id}`,
            tipo_documento: doc.tipo_documento,
            fecha_subida: doc.fecha_emision,
            incidencia: !!doc.incidencia,
            contenido: doc.observaciones,
            ingreso: ingreso,
            gasto: gasto,
            proveedor: proveedor?.nombre || cliente?.nombre || 'N/A',
            cif: proveedor?.identificador_fiscal || cliente?.identificador_fiscal || 'N/A',
            base_imponible: doc.importe_sin_impuestos,
            iva: total_iva,
            iva_details: iva_details,
            total: doc.importe_total,
        };
    }));
    
    return documents as unknown as Document[];
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
    
    return mapDocumentPacketsToDocuments(documentRows);
}


export async function getIncidents(): Promise<Document[]> {
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
        WHERE d.incidencia = 1
        ORDER BY d.fecha_emision DESC
    `);

    return mapDocumentPacketsToDocuments(documentRows);
}