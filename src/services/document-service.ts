'use server';

import db from '@/lib/db';
import type { Document, IvaDetail, DocumentUpdatePayload, DocumentEntity, DocumentLine, DocumentFile } from '@/lib/types';
import type { RowDataPacket, OkPacket } from 'mysql2';

interface DocumentPacket extends RowDataPacket {
    id: number;
    tipo_documento: 'Factura' | 'Informe' | 'Contrato' | 'Otro';
    incidencia: number; // MySQL BOOLEAN is 0 or 1
    numero_documento: string;
    fecha_emision: string;
    fecha_vencimiento: string | null;
    importe_total: number;
    importe_sin_impuestos: number;
    moneda: string;
    observaciones: string | null;
    datos_extra: any | null;
    fecha_creacion: string;
}

interface ArchivoPacket extends RowDataPacket {
    tipo_archivo: string | null;
    nombre_archivo: string | null;
    ruta_archivo: string | null;
    hash_archivo: string | null;
    fecha_subida: string;
}

interface EntidadPacket extends RowDataPacket {
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string | null;
    telefono: string | null;
    email: string | null;
    datos_extra: any | null;
}

interface LineaPacket extends RowDataPacket {
    codigo: string | null;
    descripcion: string | null;
    cantidad: number;
    unidad: string | null;
    precio_unitario: number;
    descuento_porcentaje: number;
    precio_neto: number;
    importe_linea: number;
    datos_extra: any | null;
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
            'SELECT tipo_archivo, nombre_archivo, ruta_archivo, hash_archivo, fecha_subida FROM archivos_documento WHERE documento_id = ?',
            [doc.id]
        );
        
        const [entidadRows] = await db.query<EntidadPacket[]>(
            "SELECT rol, nombre, direccion, identificador_fiscal, telefono, email, datos_extra FROM entidades_documento WHERE documento_id = ?",
            [doc.id]
        );
        
        const [lineaRows] = await db.query<LineaPacket[]>(
            'SELECT codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra FROM lineas_documento WHERE documento_id = ?',
            [doc.id]
        );
        
        const [impuestoRows] = await db.query<ImpuestoPacket[]>(
            'SELECT tipo_impuesto, porcentaje, base_imponible, cuota FROM impuestos_documento WHERE documento_id = ?',
            [doc.id]
        );
        
        const proveedor = entidadRows.find(e => e.rol === 'proveedor' || e.rol === 'emisor');
        const cliente = entidadRows.find(e => e.rol === 'cliente' || e.rol === 'receptor');

        let ingreso = 0;
        let gasto = 0;
        
        // Asignación de ingreso/gasto según la entidad principal
        if (proveedor) {
             gasto = doc.importe_total;
        } else if (cliente) {
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
            tipo_documento: doc.tipo_documento,
            incidencia: !!doc.incidencia,
            fecha_emision: doc.fecha_emision,
            fecha_vencimiento: doc.fecha_vencimiento,
            fecha_creacion: doc.fecha_creacion,
            moneda: doc.moneda,
            observaciones: doc.observaciones,
            datos_extra: doc.datos_extra,
            ingreso: ingreso,
            gasto: gasto,
            base_imponible: doc.importe_sin_impuestos,
            iva: total_iva,
            total: doc.importe_total,
            entidades: entidadRows as DocumentEntity[],
            lineas: lineaRows as DocumentLine[],
            iva_details: iva_details,
            archivos: fileRows as DocumentFile[],

            // Legacy fields for backward compatibility
            fecha_subida: doc.fecha_emision,
            proveedor: proveedor?.nombre || cliente?.nombre || 'N/A',
            cif: proveedor?.identificador_fiscal || cliente?.identificador_fiscal || 'N/A',
            nombre_archivo: fileRows.length > 0 ? fileRows[0].nombre_archivo ?? `doc-${doc.id}`: `doc-${doc.id}`,
            contenido: doc.observaciones ?? "",
        };
    }));
    
    return documents;
}

export async function getDocuments(): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT *
        FROM documentos
        ORDER BY fecha_emision DESC
    `);
    
    return mapDocumentPacketsToDocuments(documentRows);
}

export async function getDocumentById(id: number): Promise<Document | null> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT *
        FROM documentos
        WHERE id = ?
    `, [id]);

    if (documentRows.length === 0) {
        return null;
    }

    const documents = await mapDocumentPacketsToDocuments(documentRows);
    return documents[0];
}

export async function getIncidents(): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT *
        FROM documentos
        WHERE incidencia = 1
        ORDER BY fecha_emision DESC
    `);

    return mapDocumentPacketsToDocuments(documentRows);
}

export async function updateDocument(id: number, data: DocumentUpdatePayload): Promise<OkPacket> {
    const { numero_factura, fecha_subida, proveedor, cif, base_imponible, total } = data;
    
    // Update 'documentos' table
    const [docResult] = await db.query<OkPacket>(
      'UPDATE documentos SET numero_documento = ?, fecha_emision = ?, importe_sin_impuestos = ?, importe_total = ? WHERE id = ?',
      [numero_factura, fecha_subida, base_imponible, total, id]
    );

    // Update 'entidades_documento' table
    // This assumes there's a single provider/emitter per document to update. 
    // If there could be more, this logic would need to be more specific.
    await db.query<OkPacket>(
      'UPDATE entidades_documento SET nombre = ?, identificador_fiscal = ? WHERE documento_id = ? AND (rol = ? OR rol = ?)',
      [proveedor, cif, id, 'proveedor', 'emisor']
    );
    
    // Here you could add more logic to update lines, taxes, etc. if needed.
    
    return docResult;
}
