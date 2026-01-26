'use server';

import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { revalidatePath } from 'next/cache';
import { getDocumentById } from './document-service';
import { checkIncidentResolutionWithAI } from '@/ai/flows/evaluate-incident-fix.ts';

/**
 * Re-validates a document's incidents.
 * This function should be called WITHOUT await (fire-and-forget) from the main thread.
 */
export async function validateIncidentsAsync(documentId: number) {
    try {
        console.log(`🕵️ [Incidents] Iniciando validación background para Doc #${documentId}`);

        // 1. Obtener documento actual (con sus líneas, entidades, etc.)
        const document = await getDocumentById(documentId);
        if (!document) {
            console.error(`❌ [Incidents] Documento #${documentId} no encontrado.`);
            return;
        }

        // 2. Obtener la compañía del documento (si existe)
        let companyData = undefined;
        if (document.empresa_id) {
            const [companies] = await db.query<RowDataPacket[]>(
                'SELECT id, nombre_de_empresa as name, CIF as cif, nombre_fiscal as nombreFiscal FROM empresas WHERE id = ?',
                [document.empresa_id]
            );
            if (companies.length > 0) {
                companyData = companies[0] as any;
            }
        }

        // 3. Obtener incidencias abiertas
        const [incidents] = await db.query<RowDataPacket[]>(
            'SELECT id, descripcion FROM incidencias_documento WHERE documento_id = ? AND validado = 0',
            [documentId]
        );

        if (incidents.length === 0) {
            console.log(`✅ [Incidents] Doc #${documentId} no tiene incidencias pendientes.`);
            return;
        }

        console.log(`🚨 [Incidents] Doc #${documentId} tiene ${incidents.length} incidencias abiertas. Evaluando...`);

        // 4. Iterar y validar
        for (const incident of incidents) {
            let isResolved = false;
            let resolveReason = '';

            // --- VALIDACIÓN DETERMINISTA (MATEMÁTICA) ---
            // Si la descripción menciona "diferencia" de importes, hacemos chequeo matemático rápido
            const descLower = (incident.descripcion || '').toLowerCase();

            if (descLower.includes('diferencia') || descLower.includes('cálculo') || descLower.includes('total')) {
                const difference = Math.abs(document.total - (document.base_imponible + document.iva));
                // Tolerancia de 1 céntimo
                if (difference < 0.02) {
                    isResolved = true;
                    resolveReason = 'Cálculo matemático correcto (Total = Base + IVA)';
                    console.log(`🧮 [Incidents] Incidencia #${incident.id} resuelta matemáticamente.`);
                }
            }

            // --- VALIDACIÓN IA (SEMÁNTICA) ---
            // Si no se resolvió por matemáticas, preguntamos a la IA
            if (!isResolved) {
                try {
                    // Preparamos el payload limpio para la IA
                    const docPayload = {
                        id_documento: document.id_documento,
                        numero_documento: document.numero_documento,
                        tipo_documento: document.tipo_documento,
                        fecha_emision: document.fecha_emision,
                        total: document.total,
                        base_imponible: document.base_imponible,
                        iva: document.iva,
                        entidades: document.entidades,
                        lineas: document.lineas,
                        observaciones: document.observaciones
                    };

                    const aiResult = await checkIncidentResolutionWithAI({
                        incidentDescription: incident.descripcion,
                        documentData: docPayload,
                        companyData: companyData
                    });

                    if (aiResult.resolved) {
                        isResolved = true;
                        resolveReason = aiResult.reason;
                        console.log(`🤖 [Incidents] Incidencia #${incident.id} resuelta por IA: ${aiResult.reason}`);
                    } else {
                        console.log(`🤖 [Incidents] IA determinó que #${incident.id} NO está resuelta: ${aiResult.reason}`);
                    }

                } catch (aiError) {
                    console.error(`❌ [Incidents] Error en flujo IA para #${incident.id}:`, aiError);
                }
            }

            // 5. Actualizar en BD si se resolvió
            if (isResolved) {
                await db.query(
                    `UPDATE incidencias_documento 
                 SET validado = 1, 
                     validado_por = ?, 
                     fecha_validacion = NOW(),
                     observaciones_validacion = ?
                 WHERE id = ?`,
                    ['AI_AUTO', resolveReason.substring(0, 255), incident.id]
                );
            }
        }

        // 6. Revalidar cache para que el usuario vea los cambios al navegar
        revalidatePath('/documents');
        revalidatePath('/dashboard');
        try {
            revalidatePath(`/documents/${documentId}`);
        } catch (e) { /* ignore */ }

        console.log(`🏁 [Incidents] Validación background completada para Doc #${documentId}`);

    } catch (error) {
        console.error(`❌ [Incidents] Error CRÍTICO en validación background Doc #${documentId}:`, error);
    }
}

/**
 * Validates all open incidents for a specific company context change.
 */
export async function validateCompanyDocuments(companyId: number) {
    // Fire-and-forget loop
    (async () => {
        try {
            console.log(`🏢 [Incidents] Validación por cambio en Empresa #${companyId}`);
            const [docs] = await db.query<RowDataPacket[]>(
                `SELECT DISTINCT d.id 
                 FROM documentos d
                 JOIN incidencias_documento i ON d.id = i.documento_id
                 WHERE d.id_de_empresa = ? AND i.validado = 0`,
                [companyId]
            );

            console.log(`🏢 [Incidents] Encontrados ${docs.length} documentos con incidencias para revalidar.`);

            for (const doc of docs) {
                await validateIncidentsAsync(doc.id);
            }
        } catch (err) {
            console.error('❌ [Incidents] Error revalidando empresa:', err);
        }
    })();
}

/**
 * Validates a single specific incident by ID.
 */
export async function validateSingleIncident(incidentId: number, userId: number | string = 'system') {
    console.log(`🕵️ [Incidents] Validando incidencia individual #${incidentId}`);
    try {
        await db.query(
            `UPDATE incidencias_documento 
             SET validado = 1, 
                 validado_por = ?, 
                 fecha_validacion = NOW(),
                 observaciones_validacion = 'Validación manual individual'
             WHERE id = ?`,
            [userId, incidentId]
        );
        return { success: true };
    } catch (error) {
        console.error(`❌ [Incidents] Error validando incidencia #${incidentId}:`, error);
        return { success: false, error };
    }
}
