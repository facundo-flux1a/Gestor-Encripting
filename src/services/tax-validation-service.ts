
'use server';

import db from '@/lib/db';
import type { OkPacket, RowDataPacket } from 'mysql2';
import type { TaxValidationRule, CreateTaxValidationRulePayload } from '@/lib/types';
import { revalidatePath } from 'next/cache';

export async function getTaxValidationRules(): Promise<TaxValidationRule[]> {
    try {
        const [rows] = await db.query<RowDataPacket[]>('SELECT id, vigente, DATE_FORMAT(date_init, "%Y-%m-%d") as date_init, DATE_FORMAT(date_finish, "%Y-%m-%d") as date_finish, tipo_impuesto, porcentaje FROM validacion_impuestos ORDER BY date_init DESC');
        if (!rows || rows.length === 0) {
            return [];
        }
        return rows.map(row => ({
            ...row,
            vigente: Boolean(row.vigente),
            porcentaje: parseFloat(row.porcentaje)
        })) as TaxValidationRule[];
    } catch (error) {
        console.error("Failed to fetch tax validation rules:", error);
        // En un entorno de producción, podrías manejar esto de forma más elegante
        // pero por ahora, devolver un array vacío es seguro.
        return [];
    }
}


export async function createTaxValidationRule(payload: CreateTaxValidationRulePayload): Promise<{ success: boolean; id?: number }> {
  const { date_init, date_finish, tipo_impuesto, porcentaje } = payload;
  
  const [result] = await db.query<OkPacket>(
    'INSERT INTO validacion_impuestos (date_init, date_finish, tipo_impuesto, porcentaje, vigente) VALUES (?, ?, ?, ?, ?)',
    [date_init, date_finish, tipo_impuesto, porcentaje, true]
  );
  
  revalidatePath('/settings/tax-validation');
  return { success: true, id: result.insertId };
}

export async function updateTaxRuleVigente(id: number, vigente: boolean): Promise<{ success: boolean }> {
    await db.query('UPDATE validacion_impuestos SET vigente = ? WHERE id = ?', [vigente, id]);
    revalidatePath('/settings/tax-validation');
    return { success: true };
}

export async function deleteTaxRule(id: number): Promise<{ success: boolean }> {
    await db.query('DELETE FROM validacion_impuestos WHERE id = ?', [id]);
    revalidatePath('/settings/tax-validation');
    return { success: true };
}
