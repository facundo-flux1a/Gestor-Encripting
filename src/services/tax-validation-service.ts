
'use server';

import db from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { TaxValidationRule, CreateTaxValidationRulePayload } from '@/lib/types';

export async function getTaxValidationRules(): Promise<TaxValidationRule[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT * FROM validacion_impuestos ORDER BY date_init DESC'
  );

  return rows.map(row => ({
    id: row.id,
    vigente: Boolean(row.vigente),
    date_init: new Date(row.date_init).toISOString().split('T')[0],
    date_finish: new Date(row.date_finish).toISOString().split('T')[0],
    tipo_impuesto: row.tipo_impuesto,
    porcentaje: Number(row.porcentaje),
  }));
}

export async function createTaxValidationRule(payload: CreateTaxValidationRulePayload): Promise<TaxValidationRule> {
  const { date_init, date_finish, tipo_impuesto, porcentaje } = payload;
  
  const [result] = await db.query<OkPacket>(
    'INSERT INTO validacion_impuestos (date_init, date_finish, tipo_impuesto, porcentaje, vigente) VALUES (?, ?, ?, ?, ?)',
    [date_init, date_finish, tipo_impuesto, porcentaje, false] // Default to not vigente
  );

  const [newRuleRows] = await db.query<RowDataPacket[]>('SELECT * FROM validacion_impuestos WHERE id = ?', [result.insertId]);
  
  const newRule = newRuleRows[0];

  return {
    id: newRule.id,
    vigente: Boolean(newRule.vigente),
    date_init: new Date(newRule.date_init).toISOString().split('T')[0],
    date_finish: new Date(newRule.date_finish).toISOString().split('T')[0],
    tipo_impuesto: newRule.tipo_impuesto,
    porcentaje: Number(newRule.porcentaje),
  };
}

export async function updateTaxRuleVigente(id: number, vigente: boolean): Promise<{ success: boolean }> {
    await db.query<OkPacket>(
        'UPDATE validacion_impuestos SET vigente = ? WHERE id = ?',
        [vigente, id]
    );
    return { success: true };
}

export async function deleteTaxRule(id: number): Promise<{ success: boolean }> {
    await db.query<OkPacket>('DELETE FROM validacion_impuestos WHERE id = ?', [id]);
    return { success: true };
}


/**
 * Re-runs validation for all active rules against all documents.
 */
export async function runAllTaxValidations(): Promise<{ incidentsCreated: number }> {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    let totalIncidentsCreated = 0;

    try {
        const [activeRules] = await connection.query<RowDataPacket[]>('SELECT * FROM validacion_impuestos WHERE vigente = 1');

        if (activeRules.length === 0) {
            await connection.commit();
            return { incidentsCreated: 0 };
        }

        for (const rule of activeRules) {
            const description = `Impuesto no válido: utiliza ${rule.tipo_impuesto} al ${Number(rule.porcentaje)}% en el rango (${new Date(rule.date_init).toLocaleDateString()} - ${new Date(rule.date_finish).toLocaleDateString()})`;

            const [docsToFlag] = await connection.query<RowDataPacket[]>(`
                SELECT DISTINCT d.id
                FROM documentos d
                JOIN impuestos_documento i ON d.id = i.documento_id
                WHERE
                    d.fecha_emision BETWEEN ? AND ?
                    AND i.tipo_impuesto = ?
                    AND i.porcentaje = ?
            `, [rule.date_init, rule.date_finish, rule.tipo_impuesto, rule.porcentaje]);

            for (const doc of docsToFlag) {
                 const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion = ?', [doc.id, description]);
                 if (existing.length === 0) {
                     await connection.query('INSERT INTO incidencias_documento (documento_id, descripcion, tipo_incidencia) VALUES (?, ?, ?)', [doc.id, description, 'Validación de Impuesto']);
                     totalIncidentsCreated++;
                 }
            }
        }

        await connection.commit();
        return { incidentsCreated: totalIncidentsCreated };
    } catch (error) {
        await connection.rollback();
        console.error("Error running tax validations:", error);
        throw new Error("Ocurrió un error al ejecutar la validación de impuestos.");
    } finally {
        connection.release();
    }
}
