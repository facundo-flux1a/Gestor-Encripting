
'use server';

import db from '@/lib/db';
import type { Document, IvaDetail, DocumentUpdatePayload, DocumentEntity, DocumentLine, DocumentFile } from '@/lib/types';
import type { RowDataPacket, OkPacket } from 'mysql2';

interface DocumentPacket extends RowDataPacket {
    id: number;
    tipo_documento: string;
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
    id: number;
    tipo_archivo: string | null;
    nombre_archivo: string | null;
    ruta_archivo: string | null;
    hash_archivo: string | null;
    fecha_subida: string;
    documento_id: number;
}

interface EntidadPacket extends RowDataPacket {
    id: number;
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string | null;
    telefono: string | null;
    email: string | null;
    datos_extra: any | null;
    documento_id: number;
}

interface LineaPacket extends RowDataPacket {
    id: number;
    documento_id: number;
    codigo: string | null;
    descripcion: string | null;
    cantidad: number;
    unidad: string | null;
    precio_unitario: number;
    descuento_porcentaje: number;
    precio_neto: number;
    importe_linea: number;
    datos_extra: any | null;
    fecha_emision: string; // Joined from documentos table
    numero_documento: string; // Joined from documentos table
}

interface ImpuestoPacket extends RowDataPacket {
    id: number;
    tipo_impuesto: string;
    porcentaje: number;
    base_imponible: number;
    cuota: number;
    documento_id: number;
}

// Función para mapear los tipos de documento de la BD al tipo Document
function mapTipoDocumento(dbTipo: string): 'Factura' | 'Nomina' | 'Contrato' | 'Alquiler' | 'Otro' {
    const allowedTypes: ('Factura' | 'Nomina' | 'Contrato' | 'Alquiler' | 'Otro')[] = ['Factura', 'Nomina', 'Contrato', 'Alquiler', 'Otro'];
    if (allowedTypes.includes(dbTipo as any)) {
        return dbTipo as 'Factura' | 'Nomina' | 'Contrato' | 'Alquiler' | 'Otro';
    }
    return 'Otro';
}

// Helper function to safely parse JSON. Ensures the output is an object or null.
const safeJsonParse = (data: any): object | null => {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return typeof parsed === 'object' && parsed !== null ? parsed : null;
        } catch (e) {
            return null;
        }
    }
    return (typeof data === 'object' && data !== null) ? data : null;
};


async function mapDocumentPacketsToDocuments(documentRows: DocumentPacket[]): Promise<Document[]> {
    if (!documentRows || documentRows.length === 0) {
        return [];
    }
    const docIds = documentRows.map(doc => doc.id);
    
    const [fileRows] = await db.query<ArchivoPacket[]>('SELECT * FROM archivos_documento WHERE documento_id IN (?)', [docIds]);
    const [entidadRows] = await db.query<EntidadPacket[]>("SELECT * FROM entidades_documento WHERE documento_id IN (?)", [docIds]);
    const [lineaRows] = await db.query<LineaPacket[]>('SELECT * FROM lineas_documento WHERE documento_id IN (?)', [docIds]);
    const [impuestoRows] = await db.query<ImpuestoPacket[]>('SELECT * FROM impuestos_documento WHERE documento_id IN (?)', [docIds]);

    const documents = documentRows.map(doc => {
        const currentFiles = fileRows.filter(f => f.documento_id === doc.id);
        const currentEntidades = entidadRows.filter(e => e.documento_id === doc.id);
        const currentLineas = lineaRows.filter(l => l.documento_id === doc.id);
        const currentImpuestos = impuestoRows.filter(i => i.documento_id === doc.id);
        
        const proveedor = currentEntidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor');
        const cliente = currentEntidades.find(e => e.rol === 'cliente' || e.rol === 'receptor');

        let ingreso = 0;
        let gasto = 0;
        
        if (proveedor) {
             gasto = doc.importe_total;
        } else if (cliente) {
             ingreso = doc.importe_total;
        }

        const iva_details: IvaDetail[] = currentImpuestos.map(tax => ({
            id: tax.id,
            tipo_impuesto: tax.tipo_impuesto,
            porcentaje: tax.porcentaje,
            base_imponible: tax.base_imponible,
            cuota: tax.cuota,
        }));
        
        const total_iva = iva_details.reduce((acc, tax) => acc + tax.cuota, 0);

        const entidades: DocumentEntity[] = currentEntidades.map(e => ({
            id: e.id,
            rol: e.rol,
            nombre: e.nombre,
            direccion: e.direccion,
            identificador_fiscal: e.identificador_fiscal,
            telefono: e.telefono,
            email: e.email,
            datos_extra: safeJsonParse(e.datos_extra),
        }));

        const lineas: DocumentLine[] = currentLineas.map(l => ({
             id: l.id,
             codigo: l.codigo,
             descripcion: l.descripcion,
             cantidad: l.cantidad,
             unidad: l.unidad,
             precio_unitario: l.precio_unitario,
             descuento_porcentaje: l.descuento_porcentaje,
             precio_neto: l.precio_neto,
             importe_linea: l.importe_linea,
             datos_extra: safeJsonParse(l.datos_extra),
        }));
        
        const archivos: DocumentFile[] = currentFiles.map(f => ({
            id: f.id,
            tipo_archivo: f.tipo_archivo,
            nombre_archivo: f.nombre_archivo,
            ruta_archivo: f.ruta_archivo,
            hash_archivo: f.hash_archivo,
            fecha_subida: f.fecha_subida,
        }));


        return {
            id_documento: doc.id,
            numero_factura: doc.numero_documento,
            tipo_documento: mapTipoDocumento(doc.tipo_documento),
            incidencia: !!doc.incidencia,
            fecha_emision: doc.fecha_emision,
            fecha_vencimiento: doc.fecha_vencimiento,
            fecha_creacion: doc.fecha_creacion,
            moneda: doc.moneda,
            observaciones: doc.observaciones,
            datos_extra: safeJsonParse(doc.datos_extra),
            ingreso: ingreso,
            gasto: gasto,
            base_imponible: doc.importe_sin_impuestos,
            iva: total_iva,
            total: doc.importe_total,
            entidades: entidades,
            lineas: lineas,
            iva_details: iva_details,
            archivos: archivos,
            fecha_subida: doc.fecha_emision, 
            proveedor: proveedor?.nombre || cliente?.nombre || 'N/A',
            cif: proveedor?.identificador_fiscal || cliente?.identificador_fiscal || 'N/A',
            nombre_archivo: currentFiles.length > 0 ? currentFiles[0].nombre_archivo ?? `doc-${doc.id}`: `doc-${doc.id}`,
            contenido: doc.observaciones ?? "",
        };
    });
    
    return JSON.parse(JSON.stringify(documents));
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
    return documents[0] || null;
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
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { numero_factura, fecha_emision, base_imponible, total, tipo_documento, incidencia, fecha_vencimiento, moneda, observaciones, entidades, lineas, iva_details } = data;
        
        let dbTipoDocumento: string = tipo_documento;

        const [docResult] = await connection.query<OkPacket>(
          'UPDATE documentos SET numero_documento = ?, fecha_emision = ?, importe_sin_impuestos = ?, importe_total = ?, tipo_documento = ?, incidencia = ?, fecha_vencimiento = ?, moneda = ?, observaciones = ? WHERE id = ?',
          [numero_factura, fecha_emision, base_imponible, total, dbTipoDocumento, incidencia, fecha_vencimiento, moneda, observaciones, id]
        );

        // Update/Insert logic
        for (const entidad of entidades) {
            if (entidad.id) {
                await connection.query('UPDATE entidades_documento SET rol = ?, nombre = ?, direccion = ?, identificador_fiscal = ?, telefono = ?, email = ?, datos_extra = ? WHERE id = ?', [entidad.rol, entidad.nombre, entidad.direccion, entidad.identificador_fiscal, entidad.telefono, entidad.email, JSON.stringify(entidad.datos_extra), entidad.id]);
            } else {
                await connection.query('INSERT INTO entidades_documento (documento_id, rol, nombre, direccion, identificador_fiscal, telefono, email, datos_extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, entidad.rol, entidad.nombre, entidad.direccion, entidad.identificador_fiscal, entidad.telefono, entidad.email, JSON.stringify(entidad.datos_extra)]);
            }
        }
        for (const linea of lineas) {
            if (linea.id) {
                await connection.query('UPDATE lineas_documento SET codigo = ?, descripcion = ?, cantidad = ?, unidad = ?, precio_unitario = ?, descuento_porcentaje = ?, precio_neto = ?, importe_linea = ?, datos_extra = ? WHERE id = ?', [linea.codigo, linea.descripcion, linea.cantidad, linea.unidad, linea.precio_unitario, linea.descuento_porcentaje, linea.precio_neto, linea.importe_linea, JSON.stringify(linea.datos_extra), linea.id]);
            } else {
                await connection.query('INSERT INTO lineas_documento (documento_id, codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, linea.codigo, linea.descripcion, linea.cantidad, linea.unidad, linea.precio_unitario, linea.descuento_porcentaje, linea.precio_neto, linea.importe_linea, JSON.stringify(linea.datos_extra)]);
            }
        }
        for (const iva of iva_details) {
             if (iva.id) {
                await connection.query('UPDATE impuestos_documento SET tipo_impuesto = ?, porcentaje = ?, base_imponible = ?, cuota = ? WHERE id = ?', [iva.tipo_impuesto, iva.porcentaje, iva.base_imponible, iva.cuota, iva.id]);
            } else {
                await connection.query('INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota) VALUES (?, ?, ?, ?, ?)', [id, iva.tipo_impuesto, iva.porcentaje, iva.base_imponible, iva.cuota]);
            }
        }

        await connection.commit();
        return docResult;
    } catch (error) {
        await connection.rollback();
        console.error("Error updating document:", error);
        throw error;
    } finally {
        connection.release();
    }
}

export async function getUniqueProvidersCount(): Promise<number> {
    const [providerRows] = await db.query<RowDataPacket[]>(`
       SELECT COUNT(DISTINCT identificador_fiscal) as count
       FROM entidades_documento
       WHERE (rol = 'proveedor' OR rol = 'emisor')
         AND identificador_fiscal IS NOT NULL AND identificador_fiscal != ''
    `);

    return providerRows[0].count || 0;
}

export async function getUniqueProviders(): Promise<DocumentEntity[]> {
    const [providerRows] = await db.query<EntidadPacket[]>(`
        SELECT 
            identificador_fiscal, 
            nombre,
            MAX(id) as id,
            MAX(rol) as rol,
            MAX(direccion) as direccion,
            MAX(telefono) as telefono,
            MAX(email) as email,
            MAX(datos_extra) as datos_extra
        FROM entidades_documento
        WHERE (rol = 'proveedor' OR rol = 'emisor')
          AND identificador_fiscal IS NOT NULL 
          AND identificador_fiscal != ''
        GROUP BY identificador_fiscal, nombre
        ORDER BY nombre ASC
    `);

    const providers: DocumentEntity[] = providerRows.map(p => ({
        id: p.id,
        rol: p.rol,
        nombre: p.nombre,
        direccion: p.direccion,
        identificador_fiscal: p.identificador_fiscal,
        telefono: p.telefono,
        email: p.email,
        datos_extra: safeJsonParse(p.datos_extra),
    }));

    return JSON.parse(JSON.stringify(providers));
}

export async function getAllProducts(): Promise<number> {
    const [lineaRows] = await db.query<RowDataPacket[]>(`
        SELECT COUNT(DISTINCT codigo) as count
        FROM lineas_documento
        WHERE codigo IS NOT NULL AND codigo != ''
    `);
    
    return lineaRows[0].count || 0;
}


// Get by fiscal Id, as name can be repeated or contain special chars
export async function getDocumentsByProviderName(fiscalId: string): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT d.*
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE ed.identificador_fiscal = ? AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
        ORDER BY d.fecha_emision DESC
    `, [fiscalId]);

    return mapDocumentPacketsToDocuments(documentRows);
}


export async function getProviderByFiscalId(fiscalId: string): Promise<DocumentEntity | null> {
    const [providerRows] = await db.query<EntidadPacket[]>(`
        SELECT *
        FROM entidades_documento
        WHERE identificador_fiscal = ? AND (rol = 'proveedor' OR rol = 'emisor')
        LIMIT 1
    `, [fiscalId]);

    if (providerRows.length === 0) {
        return null;
    }
    const p = providerRows[0];
    const provider: DocumentEntity = {
        id: p.id,
        rol: p.rol,
        nombre: p.nombre,
        direccion: p.direccion,
        identificador_fiscal: p.identificador_fiscal,
        telefono: p.telefono,
        email: p.email,
        datos_extra: safeJsonParse(p.datos_extra),
    };

    return JSON.parse(JSON.stringify(provider));
}


export async function getProductsByProviderName(fiscalId: string): Promise<DocumentLine[]> {
    const [lineaRows] = await db.query<LineaPacket[]>(`
        WITH RankedLines AS (
            SELECT 
                ld.*, 
                d.fecha_emision,
                ROW_NUMBER() OVER(PARTITION BY ld.codigo ORDER BY d.fecha_emision DESC) as rn
            FROM lineas_documento ld
            JOIN documentos d ON ld.documento_id = d.id
            JOIN entidades_documento ed ON d.id = ed.documento_id
            WHERE ed.identificador_fiscal = ? AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
              AND ld.codigo IS NOT NULL AND ld.codigo != ''
        )
        SELECT * FROM RankedLines WHERE rn = 1
        ORDER BY descripcion ASC;
    `, [fiscalId]);

    const products: DocumentLine[] = lineaRows.map(l => ({
        id: l.id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.precio_unitario,
        descuento_porcentaje: l.descuento_porcentaje,
        precio_neto: l.precio_neto,
        importe_linea: l.importe_linea,
        datos_extra: safeJsonParse(l.datos_extra),
        fecha_emision: l.fecha_emision, // Add this field
   }));

    return JSON.parse(JSON.stringify(products));
}

export async function getProductHistory(providerFiscalId: string, productCode: string): Promise<{ productInfo: DocumentLine | null, history: DocumentLine[] }> {
    const [lineaRows] = await db.query<LineaPacket[]>(`
        SELECT 
            ld.*, 
            d.fecha_emision,
            d.numero_documento
        FROM lineas_documento ld
        JOIN documentos d ON ld.documento_id = d.id
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE ed.identificador_fiscal = ? 
          AND ld.codigo = ?
          AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
        ORDER BY d.fecha_emision DESC;
    `, [providerFiscalId, productCode]);

    if (lineaRows.length === 0) {
        return { productInfo: null, history: [] };
    }

    const history: DocumentLine[] = lineaRows.map(l => ({
        id: l.id,
        documento_id: l.documento_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.precio_unitario,
        descuento_porcentaje: l.descuento_porcentaje,
        precio_neto: l.precio_neto,
        importe_linea: l.importe_linea,
        datos_extra: safeJsonParse(l.datos_extra),
        fecha_emision: l.fecha_emision,
        numero_documento: l.numero_documento,
   }));

    const productInfo = history[0]; // The first one is the most recent

    return JSON.parse(JSON.stringify({ productInfo, history }));
}

    
