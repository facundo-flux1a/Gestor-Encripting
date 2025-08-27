
'use server';

import db from '@/lib/db';
import type { OkPacket, RowDataPacket } from 'mysql2';
import type { TaxValidationRule, CreateTaxValidationRulePayload } from '@/lib/types';
import { revalidatePath } from 'next/cache';

export async function getTaxValidationRules(): Promise<TaxValidationRule[]> {
    try {
        const [rows] = await db.query<RowDataPacket[]>(
            'SELECT id, vigente, DATE_FORMAT(date_init, "%Y-%m-%d") as date_init, DATE_FORMAT(date_finish, "%Y-%m-%d") as date_finish, tipo_impuesto, porcentaje FROM validacion_impuestos ORDER BY date_init DESC'
        );
        
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
        return [];
    }
}

export async function createTaxValidationRule(payload: CreateTaxValidationRulePayload): Promise<{ success: boolean; id?: number; error?: string }> {
    try {
        const { date_init, date_finish, tipo_impuesto, porcentaje } = payload;
        
        if (new Date(date_init) >= new Date(date_finish)) {
            return { 
                success: false, 
                error: 'La fecha de inicio debe ser menor que la fecha de fin' 
            };
        }
        
        const [result] = await db.query<OkPacket>(
            'INSERT INTO validacion_impuestos (date_init, date_finish, tipo_impuesto, porcentaje, vigente) VALUES (?, ?, ?, ?, ?)',
            [date_init, date_finish, tipo_impuesto, porcentaje, true]
        );
        
        revalidatePath('/settings/tax-validation');
        return { success: true, id: result.insertId };
        
    } catch (error) {
        console.error('Error creating tax validation rule:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Error desconocido al crear la regla' 
        };
    }
}


export async function updateTaxRuleVigente(id: number, vigente: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        await db.query('UPDATE validacion_impuestos SET vigente = ? WHERE id = ?', [vigente, id]);
        revalidatePath('/settings/tax-validation');
        return { success: true };
        
    } catch (error) {
        console.error('Error updating tax rule vigente:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Error desconocido al actualizar la regla' 
        };
    }
}

export async function deleteTaxRule(id: number): Promise<{ success: boolean; error?: string }> {
    try {
        await db.query('DELETE FROM validacion_impuestos WHERE id = ?', [id]);
        revalidatePath('/settings/tax-validation');
        return { success: true };
        
    } catch (error) {
        console.error('Error deleting tax rule:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Error desconocido al eliminar la regla' 
        };
    }
}
