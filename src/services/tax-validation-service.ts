
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
    [date_init, date_finish, tipo_impuesto, porcentaje, true] // Default to vigente = true
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
