

'use server';

import db from '@/lib/db';
import type { Document, IvaDetail, DocumentUpdatePayload, DocumentEntity, DocumentLine, DocumentFile, ProviderWithStats } from '@/lib/types';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { ProviderAnalyticsData } from '@/components/dashboard/provider-analytics';
import type { IncidentsAnalyticsData } from '@/components/incidents/incidents-analytics';
import type { IncidentAnalysisResult } from '@/lib/types';
import { redirect } from 'next/navigation';


interface DocumentPacket extends RowDataPacket {
    id: number;
    tipo_documento: string;
    numero_documento: string;
    fecha_emision: string;
    fecha_vencimiento: string | null;
    importe_total: number;
    importe_sin_impuestos: number;
    moneda: string;
    observaciones: string | null;
    datos_extra: any | null;
    fecha_creacion: string;
    total_incidencias?: number;
    pendientes?: number;
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

interface ProviderStatsPacket extends RowDataPacket {
    nombre: string;
    identificador_fiscal: string;
    totalSpent: number;
    totalDocuments: number;
    uniqueProducts: number;
}

interface IncidenciaPacket extends RowDataPacket {
    id: number;
    documento_id: number;
    descripcion: string | null;
    validado: boolean;
}

export interface DashboardAnalytics {
  kpis: {
    totalIngresos: number;
    totalGastos: number;
    totalFacturasIngreso: number;
    totalFacturasGasto: number;
    incidenciasAbiertas: number;
    totalProveedores: number;
    totalProductos: number;
    incidentRate: number;
  };
  quarterlySummary: {
    [key: string]: { ingresos: number; gastos: number };
  };
  documentDistribution: { name: string; value: number }[];
  ivaSummary: {
    [key: string]: { repercutido: number; soportado: number };
  };
  topProviders: { name: string; total: number; fiscalId: string }[];
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
    const [incidenciaRows] = await db.query<IncidenciaPacket[]>('SELECT * FROM incidencias_documento WHERE documento_id IN (?)', [docIds]);

    const documents = documentRows.map(doc => {
        const currentFiles = fileRows.filter(f => f.documento_id === doc.id);
        const currentEntidades = entidadRows.filter(e => e.documento_id === doc.id);
        const currentLineas = lineaRows.filter(l => l.documento_id === doc.id);
        const currentImpuestos = impuestoRows.filter(i => i.documento_id === doc.id);
        const currentIncidencias = incidenciaRows.filter(i => i.documento_id === doc.id);
        
        const proveedor = currentEntidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor');
        const cliente = currentEntidades.find(e => e.rol === 'cliente' || e.rol === 'receptor');

        let ingreso = 0;
        let gasto = 0;
        
        if (proveedor) {
             gasto = Number(doc.importe_total) || 0;
        } else if (cliente) {
             ingreso = Number(doc.importe_total) || 0;
        }

        const iva_details: IvaDetail[] = currentImpuestos.map(tax => ({
            id: tax.id,
            tipo_impuesto: tax.tipo_impuesto,
            porcentaje: tax.porcentaje,
            base_imponible: tax.base_imponible,
            cuota: tax.cuota,
        }));
        
        const total_iva = iva_details.reduce((acc, tax) => acc + (Number(tax.cuota) || 0), 0);

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

        const pendientes = currentIncidencias.filter(i => !i.validado).length;
        const verificado = pendientes === 0;
        const primeraIncidenciaPendiente = currentIncidencias.find(i => !i.validado);

        return {
            id_documento: doc.id,
            numero_factura: doc.numero_documento,
            tipo_documento: doc.tipo_documento,
            verificado: verificado,
            incidencia: pendientes > 0,
            incidencia_razon: primeraIncidenciaPendiente?.descripcion ?? null,
            fecha_emision: doc.fecha_emision,
            fecha_vencimiento: doc.fecha_vencimiento,
            fecha_creacion: doc.fecha_creacion,
            moneda: doc.moneda,
            observaciones: doc.observaciones,
            datos_extra: safeJsonParse(doc.datos_extra),
            ingreso: ingreso,
            gasto: gasto,
            base_imponible: Number(doc.importe_sin_impuestos) || 0,
            iva: total_iva,
            total: Number(doc.importe_total) || 0,
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
        SELECT d.*
        FROM documentos d
        ORDER BY d.fecha_emision DESC
    `);
    
    return mapDocumentPacketsToDocuments(documentRows);
}

export async function getDocumentById(id: number): Promise<Document | null> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT d.*
        FROM documentos d
        WHERE d.id = ?
    `, [id]);

    if (documentRows.length === 0) {
        return null;
    }

    const documents = await mapDocumentPacketsToDocuments(documentRows);
    return documents[0] || null;
}

export async function getIncidents(): Promise<Document[]> {
    const [documentRows] = await db.query<DocumentPacket[]>(`
        SELECT DISTINCT d.* 
        FROM documentos d
        JOIN incidencias_documento i ON d.id = i.documento_id
        WHERE i.validado = 0
        ORDER BY d.fecha_emision DESC
    `);

    return mapDocumentPacketsToDocuments(documentRows);
}

export async function updateDocument(id: number, data: DocumentUpdatePayload): Promise<OkPacket> {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { numero_factura, fecha_emision, base_imponible, total, tipo_documento, fecha_vencimiento, moneda, observaciones, entidades, lineas, iva_details } = data;
        
        const [docResult] = await connection.query<OkPacket>(
          'UPDATE documentos SET numero_documento = ?, fecha_emision = ?, importe_sin_impuestos = ?, importe_total = ?, tipo_documento = ?, fecha_vencimiento = ?, moneda = ?, observaciones = ? WHERE id = ?',
          [numero_factura, fecha_emision, base_imponible, total, tipo_documento, fecha_vencimiento, moneda, observaciones, id]
        );

        await connection.query('DELETE FROM entidades_documento WHERE documento_id = ?', [id]);
        await connection.query('DELETE FROM lineas_documento WHERE documento_id = ?', [id]);
        await connection.query('DELETE FROM impuestos_documento WHERE documento_id = ?', [id]);

        for (const entidad of entidades) {
            await connection.query('INSERT INTO entidades_documento (documento_id, rol, nombre, direccion, identificador_fiscal, telefono, email, datos_extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, entidad.rol, entidad.nombre, entidad.direccion, entidad.identificador_fiscal, entidad.telefono, entidad.email, JSON.stringify(entidad.datos_extra)]);
        }
        for (const linea of lineas) {
             await connection.query('INSERT INTO lineas_documento (documento_id, codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, linea.codigo, linea.descripcion, linea.cantidad, linea.unidad, linea.precio_unitario, linea.descuento_porcentaje, linea.precio_neto, linea.importe_linea, JSON.stringify(linea.datos_extra)]);
        }
        for (const iva of iva_details) {
            const totalConImpuesto = (Number(iva.base_imponible) || 0) + (Number(iva.cuota) || 0);
            await connection.query(
                'INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota, total_con_impuesto) VALUES (?, ?, ?, ?, ?, ?)', 
                [id, iva.tipo_impuesto, iva.porcentaje, iva.base_imponible, iva.cuota, totalConImpuesto]
            );
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

export async function updateDocumentField(id: number, fieldName: string, value: any): Promise<OkPacket> {
    // Direct fields in 'documentos' table
    const directDocumentFields = ['numero_documento', 'fecha_emision', 'fecha_vencimiento', 'importe_sin_impuestos', 'importe_total', 'observaciones', 'tipo_documento'];
    
    if (directDocumentFields.includes(fieldName)) {
        const [result] = await db.query<OkPacket>(`UPDATE documentos SET ?? = ? WHERE id = ?`, [fieldName, value, id]);
        if (result.affectedRows === 0) throw new Error('No se encontró el documento o no se realizaron cambios.');
        return result;
    }

    // Fields related to the provider in 'entidades_documento' table
    if (fieldName === 'proveedor_nombre' || fieldName === 'proveedor_cif') {
        const fieldToUpdate = fieldName === 'proveedor_nombre' ? 'nombre' : 'identificador_fiscal';
        const [result] = await db.query<OkPacket>(
            `UPDATE entidades_documento SET ?? = ? WHERE documento_id = ? AND (rol = 'proveedor' OR rol = 'emisor') LIMIT 1`,
            [fieldToUpdate, value, id]
        );
        if (result.affectedRows === 0) throw new Error('No se encontró el proveedor para este documento.');
        return result;
    }

    // Field related to 'incidencias_documento' table
    if (fieldName === 'incidencia_razon') {
         // This will update the first open incident found. A more complex logic might be needed for multiple incidents.
        const [result] = await db.query<OkPacket>(
            `UPDATE incidencias_documento SET descripcion = ? WHERE documento_id = ? AND validado = 0 LIMIT 1`,
            [value, id]
        );
        // It's okay if no rows are affected, it might mean there are no open incidents to update.
        return result;
    }
    
     // Fields related to 'impuestos_documento' table
    if (fieldName.startsWith('iva_base_') || fieldName.startsWith('iva_cuota_')) {
        const parts = fieldName.split('_');
        const type = parts[1]; // 'base' or 'cuota'
        const percentage = parts[2];
        const fieldToUpdate = type === 'base' ? 'base_imponible' : 'cuota';
        
        const [result] = await db.query<OkPacket>(
            `UPDATE impuestos_documento SET ?? = ? WHERE documento_id = ? AND porcentaje = ? LIMIT 1`,
            [fieldToUpdate, value, id, percentage]
        );
        if (result.affectedRows === 0) throw new Error(`No se encontró un impuesto del ${percentage}% para este documento.`);
        return result;
    }


    // If the field name is not recognized, throw an error.
    throw new Error(`El campo '${fieldName}' no es editable o no se reconoce.`);
}


export async function deleteDocument(id: number): Promise<void> {
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM documentos WHERE id = ?', [id]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error("Error deleting document:", error);
        throw new Error('No se pudo eliminar el documento.');
    } finally {
        connection.release();
        redirect('/documents');
    }
}

export async function validateDocumentIncidents(documentId: number): Promise<OkPacket> {
    const [result] = await db.query<OkPacket>(
        'UPDATE incidencias_documento SET validado = 1, fecha_validacion = CURRENT_TIMESTAMP(), validado_por = ? WHERE documento_id = ? AND validado = 0',
        ['system', documentId]
    );
    return result;
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


export async function getProvidersWithStats(): Promise<ProviderWithStats[]> {
     const [providerRows] = await db.query<ProviderStatsPacket[]>(`
        WITH NormalizedProviders AS (
            SELECT
                *,
                -- Normalize CIF/NIF by removing common prefixes like 'ES'
                REPLACE(UPPER(identificador_fiscal), 'ES-', '') AS normalized_fiscal_id
            FROM entidades_documento
            WHERE identificador_fiscal IS NOT NULL AND identificador_fiscal != ''
              AND (rol = 'proveedor' OR rol = 'emisor')
        ),
        RankedNames AS (
            SELECT
                normalized_fiscal_id,
                nombre,
                identificador_fiscal,
                -- Rank names and original fiscal IDs by frequency for each normalized ID
                ROW_NUMBER() OVER(PARTITION BY normalized_fiscal_id ORDER BY COUNT(*) DESC, MAX(fecha_creacion) DESC) as rn
            FROM NormalizedProviders
            GROUP BY normalized_fiscal_id, nombre, identificador_fiscal
        ),
        PrimaryIdentifiers AS (
            -- Select the most common name and original fiscal ID for each normalized ID
            SELECT normalized_fiscal_id, nombre, identificador_fiscal
            FROM RankedNames
            WHERE rn = 1
        )
        SELECT 
            pi.nombre,
            pi.identificador_fiscal, -- Show the most common original fiscal_id
            SUM(d.importe_total) as totalSpent,
            COUNT(DISTINCT d.id) as totalDocuments,
            COUNT(DISTINCT ld.codigo) as uniqueProducts
        FROM NormalizedProviders np
        JOIN documentos d ON np.documento_id = d.id
        LEFT JOIN lineas_documento ld ON d.id = ld.documento_id
        JOIN PrimaryIdentifiers pi ON np.normalized_fiscal_id = pi.normalized_fiscal_id
        GROUP BY pi.normalized_fiscal_id, pi.nombre, pi.identificador_fiscal
        ORDER BY totalSpent DESC;
    `);
    
    const providers: ProviderWithStats[] = providerRows.map(p => ({
        nombre: p.nombre,
        identificador_fiscal: p.identificador_fiscal,
        totalSpent: Number(p.totalSpent),
        totalDocuments: Number(p.totalDocuments),
        uniqueProducts: Number(p.uniqueProducts),
        rol: 'proveedor', // Default value
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

export async function getProviderAnalytics(fiscalId: string): Promise<ProviderAnalyticsData | null> {
    const provider = await getProviderByFiscalId(fiscalId);
    if (!provider) {
        return null;
    }

    const [docs] = await db.query<DocumentPacket[]>(`
        SELECT d.*
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE ed.identificador_fiscal = ? AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
    `, [fiscalId]);

    const docIds = docs.map(d => d.id);
    const [lines] = docIds.length > 0 ? await db.query<LineaPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN (?)`, [docIds]) : [[]];

    const totalSpent = docs.reduce((acc, doc) => acc + Number(doc.importe_total || 0), 0);
    const totalDocuments = docs.length;
    const averagePurchaseValue = totalDocuments > 0 ? totalSpent / totalDocuments : 0;
    
    const productSpend: { [key: string]: { codigo: string; descripcion: string; total: number } } = {};
    lines.forEach(line => {
        if (line.codigo && line.descripcion) {
            if (!productSpend[line.codigo]) {
                productSpend[line.codigo] = { codigo: line.codigo, descripcion: line.descripcion, total: 0 };
            }
            productSpend[line.codigo].total += Number(line.importe_linea || 0);
        }
    });

    const topProductsBySpend = Object.values(productSpend)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    const monthlySpendMap: { [key: string]: number } = {};
    docs.forEach(doc => {
        const month = new Date(doc.fecha_emision).toISOString().substring(0, 7); // YYYY-MM
        monthlySpendMap[month] = (monthlySpendMap[month] || 0) + Number(doc.importe_total || 0);
    });

    const monthlySpend = Object.entries(monthlySpendMap)
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));

    const analyticsData = {
        provider,
        totalSpent,
        totalDocuments,
        uniqueProducts: Object.keys(productSpend).length,
        averagePurchaseValue,
        topProductsBySpend,
        monthlySpend
    };

    return JSON.parse(JSON.stringify(analyticsData));
}

export async function getIncidentsAnalytics(): Promise<IncidentsAnalyticsData> {
    const [summary] = await db.query<RowDataPacket[]>(`
        SELECT 
            SUM(CASE WHEN validado = 0 THEN 1 ELSE 0 END) as totalOpen,
            SUM(CASE WHEN validado = 1 THEN 1 ELSE 0 END) as totalValidated
        FROM incidencias_documento
    `);

    const [byProvider] = await db.query<RowDataPacket[]>(`
        SELECT e.nombre, COUNT(i.id) as count
        FROM incidencias_documento i
        JOIN entidades_documento e ON i.documento_id = e.documento_id
        WHERE i.validado = 0 AND (e.rol = 'proveedor' OR e.rol = 'emisor')
        GROUP BY e.nombre
        ORDER BY count DESC
        LIMIT 5;
    `);

    const [byType] = await db.query<RowDataPacket[]>(`
        SELECT 
            CASE 
                WHEN descripcion LIKE '%duplicado%' THEN 'Duplicado'
                WHEN descripcion LIKE '%cálculo%' THEN 'Error de Cálculo'
                WHEN descripcion LIKE '%incompletos%' THEN 'Datos Incompletos'
                ELSE 'Otro'
            END as name,
            COUNT(id) as count
        FROM incidencias_documento
        WHERE validado = 0
        GROUP BY name
        ORDER BY count DESC;
    `);
    
    const analyticsData = {
        totalOpen: Number(summary[0]?.totalOpen || 0),
        totalValidated: Number(summary[0]?.totalValidated || 0),
        byProvider: byProvider.map(p => ({ name: p.nombre, count: p.count })),
        byType: byType.map(t => ({ name: t.name, count: t.count })),
    };

    return JSON.parse(JSON.stringify(analyticsData));
}

async function analyzeDocuments(docIds: number[]): Promise<IncidentAnalysisResult> {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    let newIncidentsFound = 0;
    let duplicates = 0;
    let calculationErrors = 0;

    try {
        if (docIds.length === 0) {
            return {
                newIncidentsFound: 0,
                duplicates: 0,
                calculationErrors: 0,
                message: 'No se proporcionaron documentos para el análisis.'
            };
        }
        
       const [docsWithDetails] = await connection.query<RowDataPacket[]>(`
            SELECT 
                d.id,
                d.numero_documento,
                d.importe_total,
                d.importe_sin_impuestos,
                (SELECT identificador_fiscal FROM entidades_documento WHERE documento_id = d.id AND (rol = 'proveedor' OR rol = 'emisor') LIMIT 1) as provider_cif,
                (SELECT COUNT(*) FROM lineas_documento WHERE documento_id = d.id) as line_count,
                (SELECT SUM(importe_linea) FROM lineas_documento WHERE documento_id = d.id) as sum_line_items,
                (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id) as sum_cuota
            FROM documentos d
            WHERE d.id IN (?)
        `, [docIds]);


        // Check for incomplete documents
        for (const doc of docsWithDetails) {
            if (!doc.numero_documento || doc.line_count === 0 || doc.importe_total == 0) {
                const description = `Datos incompletos o faltantes en el documento.`;
                const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?', [doc.id, 'Datos incompletos%']);
                if (existing.length === 0) {
                    await connection.query('INSERT INTO incidencias_documento (documento_id, descripcion) VALUES (?, ?)', [doc.id, description]);
                    newIncidentsFound++;
                }
            }
        }
        

        const validDocsForAnalysis = docsWithDetails.filter(d => d.numero_documento && d.provider_cif && d.importe_total);

        // Check for duplicates
        const docMap = new Map<string, number[]>();
        for (const doc of validDocsForAnalysis) {
            const key = `${doc.provider_cif}|${doc.numero_documento}|${doc.importe_total}`;
            if (!docMap.has(key)) {
                docMap.set(key, []);
            }
            docMap.get(key)!.push(doc.id);
        }

        for (const [key, ids] of docMap.entries()) {
            if (ids.length > 1) {
                duplicates += ids.length;
                const description = `Documento duplicado detectado. Clave: ${key.split('|').slice(0, 2).join(' - ')}. IDs: ${ids.join(', ')}`;
                for (const id of ids) {
                    const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?', [id, 'Documento duplicado%']);
                    if (existing.length === 0) {
                        await connection.query('INSERT INTO incidencias_documento (documento_id, descripcion) VALUES (?, ?)', [id, description]);
                        newIncidentsFound++;
                    }
                }
            }
        }

        // Check for calculation errors
        for (const doc of validDocsForAnalysis) {
            
            // Check 1: Sum of line items vs Base Amount
            if (doc.sum_line_items !== null) {
                if (Math.abs(Number(doc.sum_line_items) - Number(doc.importe_sin_impuestos)) > 0.02) {
                    calculationErrors++;
                    const description = `Error de cálculo en el subtotal. La suma de las líneas (${Number(doc.sum_line_items).toFixed(2)}) no coincide con la base imponible del documento (${Number(doc.importe_sin_impuestos).toFixed(2)}).`;
                    const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?', [doc.id, 'Error de cálculo en el subtotal%']);
                    if (existing.length === 0) {
                        await connection.query('INSERT INTO incidencias_documento (documento_id, descripcion) VALUES (?, ?)', [doc.id, description]);
                        newIncidentsFound++;
                    }
                }
            }


            // Check 2: Base Amount + Taxes vs Total Amount
            if (doc.sum_cuota !== null) { 
                 const calculatedTotal = (Number(doc.importe_sin_impuestos) || 0) + (Number(doc.sum_cuota) || 0);
                if (Math.abs(calculatedTotal - (Number(doc.importe_total) || 0)) > 0.02) { // Tolerance for rounding
                    calculationErrors++;
                    const description = `Error de cálculo en el total. Base: ${doc.importe_sin_impuestos}, Impuestos: ${doc.sum_cuota}, Total Doc: ${doc.importe_total}, Total Calc: ${calculatedTotal.toFixed(2)}.`;
                    const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?', [doc.id, 'Error de cálculo en el total%']);
                    if (existing.length === 0) {
                        await connection.query('INSERT INTO incidencias_documento (documento_id, descripcion) VALUES (?, ?)', [doc.id, description]);
                        newIncidentsFound++;
                    }
                }
            }
        }

        await connection.commit();

        return {
            newIncidentsFound,
            duplicates,
            calculationErrors,
            message: `Análisis completo. Se encontraron ${newIncidentsFound} nuevas incidencias.`
        };

    } catch (error) {
        await connection.rollback();
        console.error("Error running document analysis:", error);
        throw new Error('Falló el análisis de documentos en el servidor.');
    } finally {
        connection.release();
    }
}


export async function runDocumentAnalysis(): Promise<IncidentAnalysisResult> {
    const [allDocIds] = await db.query<RowDataPacket[]>('SELECT id FROM documentos');
    const docIds = allDocIds.map(row => row.id);
    return analyzeDocuments(docIds);
}

export async function runSingleDocumentAnalysis(documentId: number): Promise<IncidentAnalysisResult> {
    return analyzeDocuments([documentId]);
}


export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [kpiRows] = await db.query<RowDataPacket[]>(`
    SELECT
      (SELECT SUM(d.importe_total) FROM documentos d JOIN entidades_documento e ON d.id = e.documento_id WHERE e.rol = 'cliente' OR e.rol = 'receptor') as totalIngresos,
      (SELECT SUM(d.importe_total) FROM documentos d JOIN entidades_documento e ON d.id = e.documento_id WHERE e.rol = 'proveedor' OR e.rol = 'emisor') as totalGastos,
      (SELECT COUNT(d.id) FROM documentos d JOIN entidades_documento e ON d.id = e.documento_id WHERE e.rol = 'cliente' OR e.rol = 'receptor') as totalFacturasIngreso,
      (SELECT COUNT(d.id) FROM documentos d JOIN entidades_documento e ON d.id = e.documento_id WHERE e.rol = 'proveedor' OR e.rol = 'emisor') as totalFacturasGasto,
      (SELECT COUNT(*) FROM incidencias_documento WHERE validado = 0) as incidenciasAbiertas,
      (SELECT COUNT(DISTINCT identificador_fiscal) FROM entidades_documento WHERE (rol = 'proveedor' OR rol = 'emisor') AND identificador_fiscal IS NOT NULL AND identificador_fiscal != '') as totalProveedores,
      (SELECT COUNT(DISTINCT codigo) FROM lineas_documento WHERE codigo IS NOT NULL AND codigo != '') as totalProductos,
      (SELECT COUNT(*) FROM documentos) as totalDocs
  `);
  const kpis = kpiRows[0];
  const incidentRate = kpis.totalDocs > 0 ? (kpis.incidenciasAbiertas / kpis.totalDocs) * 100 : 0;

  const [quarterlyRows] = await db.query<RowDataPacket[]>(`
    SELECT
      CONCAT('T', QUARTER(d.fecha_emision)) as quarter,
      SUM(CASE WHEN e.rol = 'cliente' OR e.rol = 'receptor' THEN d.importe_total ELSE 0 END) as ingresos,
      SUM(CASE WHEN e.rol = 'proveedor' OR e.rol = 'emisor' THEN d.importe_total ELSE 0 END) as gastos
    FROM documentos d
    JOIN entidades_documento e ON d.id = e.documento_id
    WHERE YEAR(d.fecha_emision) = YEAR(CURDATE())
    GROUP BY quarter
  `);

  const quarterlySummary = { T1: { ingresos: 0, gastos: 0 }, T2: { ingresos: 0, gastos: 0 }, T3: { ingresos: 0, gastos: 0 }, T4: { ingresos: 0, gastos: 0 } };
  quarterlyRows.forEach(r => {
    quarterlySummary[r.quarter as keyof typeof quarterlySummary] = { ingresos: r.ingresos, gastos: r.gastos };
  });

  const [distributionRows] = await db.query<RowDataPacket[]>(`
    SELECT tipo_documento as name, COUNT(*) as value
    FROM documentos
    GROUP BY tipo_documento
    ORDER BY value DESC
  `);

  const [ivaRows] = await db.query<RowDataPacket[]>(`
    SELECT
      CONCAT('T', QUARTER(d.fecha_emision)) as quarter,
      SUM(CASE WHEN e.rol = 'cliente' OR e.rol = 'receptor' THEN i.cuota ELSE 0 END) as repercutido,
      SUM(CASE WHEN e.rol = 'proveedor' OR e.rol = 'emisor' THEN i.cuota ELSE 0 END) as soportado
    FROM documentos d
    JOIN impuestos_documento i ON d.id = i.documento_id
    JOIN entidades_documento e ON d.id = e.documento_id
    WHERE YEAR(d.fecha_emision) = YEAR(CURDATE())
    GROUP BY quarter
  `);
  const ivaSummary = { T1: { repercutido: 0, soportado: 0 }, T2: { repercutido: 0, soportado: 0 }, T3: { repercutido: 0, soportado: 0 }, T4: { repercutido: 0, soportado: 0 } };
  ivaRows.forEach(r => {
    ivaSummary[r.quarter as keyof typeof ivaSummary] = { repercutido: r.repercutido, soportado: r.soportado };
  });

  const [topProvidersRows] = await db.query<RowDataPacket[]>(`
    SELECT e.nombre, e.identificador_fiscal, SUM(d.importe_total) as total
    FROM documentos d
    JOIN entidades_documento e ON d.id = e.documento_id
    WHERE e.rol = 'proveedor' OR e.rol = 'emisor'
    GROUP BY e.nombre, e.identificador_fiscal
    ORDER BY total DESC
    LIMIT 5
  `);

  const analyticsData = {
    kpis: {
      totalIngresos: Number(kpis.totalIngresos || 0),
      totalGastos: Number(kpis.totalGastos || 0),
      totalFacturasIngreso: Number(kpis.totalFacturasIngreso || 0),
      totalFacturasGasto: Number(kpis.totalFacturasGasto || 0),
      incidenciasAbiertas: Number(kpis.incidenciasAbiertas || 0),
      totalProveedores: Number(kpis.totalProveedores || 0),
      totalProductos: Number(kpis.totalProductos || 0),
      incidentRate: Number(incidentRate || 0),
    },
    quarterlySummary,
    documentDistribution: distributionRows.map(r => ({ name: r.name, value: Number(r.value) })),
    ivaSummary,
    topProviders: topProvidersRows.map(p => ({ name: p.nombre, total: Number(p.total), fiscalId: p.identificador_fiscal })),
  };

  return JSON.parse(JSON.stringify(analyticsData));
}
    

    

    




    

    

    




    