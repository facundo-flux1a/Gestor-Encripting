import * as XLSX from 'xlsx';
import type { Document } from '@/lib/types';
import { type Row } from '@tanstack/react-table';

// ==========================================
// TIPOS
// ==========================================

export type ExportFormat = 'excel' | 'csv' | 'txt';

interface ExportOptions {
    filename: string;
    format: ExportFormat;
    includeSummary?: boolean; // Nuevo: incluir hoja de resumen IVA
    trimestre?: number | null; // Nuevo: trimestre específico o null para todo el año
    exportContext?: 'trimestres' | 'documentos' | 'documentos_emitidas' | 'documentos_recibidas' | 'otros';
}

// ==========================================
// UTILIDADES DE FORMATEO (Extraídas de export-button.tsx)
// ==========================================

export const formatCurrency = (amount: number, minimumFractionDigits = 2) => {
    if (isNaN(amount)) return '0,00';
    return new Intl.NumberFormat('es-ES', {
        style: 'decimal',
        minimumFractionDigits,
        maximumFractionDigits: 2
    }).format(amount);
};

// Función auxiliar para obtener valor de una celda o propiedad de documento
export const getValueForExport = (item: any, columnId: string, format?: ExportFormat): string | number => {
    let value: any;

    // Si es Row de react-table
    if (item && typeof item.getValue === 'function') {
        value = item.getValue(columnId);
        // Lógica específica para columnas de impuestos en react-table que pueden necesitar acceso a row.original
        if ((columnId.startsWith('base_') || columnId.startsWith('iva_')) && item.original) {
            return getTaxColumnValue(item.original, columnId);
        }
    } else {
        // Si es objeto plano (Document)
        value = item[columnId];
        if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
            return getTaxColumnValue(item, columnId, format);
        }
    }

    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    // Forzar conversión a número en Excel para columnas conocidas aunque vengan como string
    if (format === 'excel' && value !== null && value !== undefined && value !== '') {
        const isColumnNumeric = ['base', 'iva', 'retencion', 'total', 'base_imponible', 'importe_total', 'importe_sin_impuestos', 'cantidad'].includes(columnId)
            || columnId.startsWith('base_')
            || columnId.startsWith('iva_')
            || columnId.includes('total')
            || columnId.includes('ingreso')
            || columnId.includes('gasto')
            || columnId.includes('precio')
            || columnId.includes('importe')
            || columnId.includes('resultado')
            || columnId.includes('cantidad');

        if (isColumnNumeric) {
            const numVal = Number(value);
            if (!isNaN(numVal)) return numVal;
        }
    }

    // Formateo de moneda para columnas conocidas
    if (typeof value === 'number') {
        if (format === 'excel') return value;
        return formatCurrency(value);
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value ?? '');
};

const getTaxColumnValue = (doc: any, columnId: string, format?: ExportFormat): string | number => {
    const rateMatch = columnId.match(/\d+/);
    if (rateMatch) {
        const rate = Number(rateMatch[0]);
        const ivaDetail = doc.iva_details?.find((i: any) => Number(i.porcentaje) === rate);
        if (columnId.startsWith('base_')) {
            if (format === 'excel') return ivaDetail?.base_imponible ?? 0;
            return formatCurrency(ivaDetail?.base_imponible ?? 0);
        }
        if (columnId.startsWith('iva_')) {
            if (format === 'excel') return ivaDetail?.cuota ?? 0;
            return formatCurrency(ivaDetail?.cuota ?? 0);
        }
    }
    return '';
};

const getNumericValue = (item: any, columnId: string): number => {
    // Lógica para obtener valor numérico
    let val: any;
    if (item && typeof item.getValue === 'function') {
        val = item.getValue(columnId);
    } else {
        val = item[columnId];
    }

    // Si la celda explícitamente existe en el root del objeto o fila
    if (val !== undefined && val !== null) {
        if (typeof val === 'number') return val;
        if (typeof val === 'string' && !isNaN(Number(val))) return Number(val);
    }

    // Lógica para obtener dinámicamente desgloses de IVA (base_21, iva_21)
    if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
        const doc = item.original || item; // Support both Row and Document
        const rateMatch = columnId.match(/\d+/);
        if (rateMatch) {
            const rate = Number(rateMatch[0]);
            const ivaDetail = doc.iva_details?.find((i: any) => Number(i.porcentaje) === rate);
            if (columnId.startsWith('base_')) {
                return Number(ivaDetail?.base_imponible) || 0;
            } else if (columnId.startsWith('iva_')) {
                return Number(ivaDetail?.cuota) || 0;
            }
        }
    }

    return 0;
};


// ==========================================
// LÓGICA DE EXPORTACIÓN
// ==========================================

const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([`\uFEFF${content}`], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Helper para aplicar formato de miles a celdas numéricas
const applyExcelNumberFormat = (sheet: XLSX.WorkSheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");
    // Iterar sobre todas las celdas
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];

            // Si la celda existe y es de tipo numérico ('n')
            if (cell && cell.t === 'n') {
                // Aplicar formato estándar con separador de miles y 2 decimales
                // #,##0.00 se adapta a la configuración regional del usuario al abrir Excel
                cell.z = '#,##0.00';
            }
        }
    }
};

// Helper para ajustar ancho de columnas automáticamente
const adjustColumnWidths = (sheet: XLSX.WorkSheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");
    const colWidths: number[] = [];

    // Iterar para encontrar el ancho máximo por columna
    for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLen = 10; // Ancho mínimo base

        for (let R = range.s.r; R <= range.e.r; ++R) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];

            if (cell && cell.v) {
                let cellLen = 0;
                // Si es número, estimar longitud incluyendo formato (aprox: dígitos + 30%)
                if (cell.t === 'n') {
                    cellLen = String(cell.v).length + 4;
                } else {
                    cellLen = String(cell.v).length;
                }

                if (cellLen > maxLen) maxLen = cellLen;
            }
        }
        // Limitar ancho máximo para no exagerar (ej. descripciones largas)
        colWidths[C] = Math.min(maxLen + 2, 50);
    }

    sheet['!cols'] = colWidths.map(w => ({ wch: w }));
};

export const generateAdvancedExport = (
    data: any[], // Row<any>[] | Document[]
    columns: { id: string, header: string }[],
    options: ExportOptions
) => {
    const { filename, format } = options;
    const isExcel = format === 'excel';

    // Función interna para generar hoja de datos
    const generateDataSheet = (sheetData: any[]): XLSX.WorkSheet => {
        // 1. Preparar datos procesados
        const rows = sheetData.map(item => {
            const rowData: { [key: string]: any } = {};
            columns.forEach(col => {
                rowData[col.header] = getValueForExport(item, col.id, format);
            });
            return rowData;
        });

        // 2. Calcular totales
        const totals: Record<string, number> = {};
        columns.forEach(col => totals[col.id] = 0);

        sheetData.forEach(item => {
            columns.forEach(col => {
                const val = getNumericValue(item, col.id);
                if (!isNaN(val)) {
                    totals[col.id] = (totals[col.id] || 0) + val;
                }
            });
        });

        // 3. Agregar fila de totales
        if (rows.length > 0) {
            const totalRowData: { [key: string]: any } = {};
            totalRowData[columns[0].header] = "TOTALES:";

            columns.slice(1).forEach(col => {
                // Check heuristic for numeric column or tax column
                const isNumeric = ['base', 'iva', 'retencion', 'total', 'base_imponible', 'importe_total', 'importe_sin_impuestos', 'cantidad'].includes(col.id)
                    || col.id.startsWith('base_')
                    || col.id.startsWith('iva_')
                    || col.id.includes('total')
                    || col.id.includes('ingreso')
                    || col.id.includes('gasto')
                    || col.id.includes('precio')
                    || col.id.includes('importe')
                    || col.id.includes('resultado')
                    || col.id.includes('cantidad');

                if (isNumeric) {
                    if (isExcel) {
                        totalRowData[col.header] = totals[col.id] || 0;
                    } else {
                        totalRowData[col.header] = formatCurrency(totals[col.id] || 0);
                    }
                } else {
                    totalRowData[col.header] = "";
                }
            });
            rows.push(totalRowData);
        }

        return XLSX.utils.json_to_sheet(rows);
    };

    if (isExcel) {
        const workbook = XLSX.utils.book_new();

        // 1. HOJA RESUMEN IVA
        if (options.includeSummary) {
            const summarySheet = generateIvaSummarySheet(data, options);
            applyExcelNumberFormat(summarySheet); // ✅ Aplicar formato
            adjustColumnWidths(summarySheet); // ✅ Ajustar anchos
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen IVA');
        }

        // 2. HOJAS POR TRIMESTRE (1T, 2T, 3T, 4T)
        // Agrupar datos por trimestre
        const quarters: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] };
        const unknownQuarter: any[] = [];

        data.forEach(item => {
            const doc = item.original || item;
            let q = doc.num_trimestre;

            // Intentar inferir trimestre si falta
            if (!q && doc.fecha_emision) {
                const month = new Date(doc.fecha_emision).getMonth() + 1;
                q = Math.ceil(month / 3);
            }

            if (q >= 1 && q <= 4) {
                quarters[q].push(item);
            } else {
                unknownQuarter.push(item);
            }
        });

        // Agregar hojas para trimestres con datos
        [1, 2, 3, 4].forEach(q => {
            if (quarters[q].length > 0) {
                const sheet = generateDataSheet(quarters[q]);
                applyExcelNumberFormat(sheet); // ✅ Aplicar formato
                adjustColumnWidths(sheet); // ✅ Ajustar anchos
                XLSX.utils.book_append_sheet(workbook, sheet, `${q}T`);
            }
        });

        // Si hay documentos sin trimestre o si no se generó ninguna hoja de trimestre, poner todo en "General"
        // O si explicitamente se pide "exportar todo" y no hay data por trimestre separada
        if (unknownQuarter.length > 0 || (quarters[1].length === 0 && quarters[2].length === 0 && quarters[3].length === 0 && quarters[4].length === 0)) {
            // Si no hay datos trimestrales, usar todos los datos en una hoja general
            const dataToUse = unknownQuarter.length > 0 ? unknownQuarter : data;
            if (dataToUse.length > 0) {
                const sheet = generateDataSheet(dataToUse);
                applyExcelNumberFormat(sheet); // ✅ Aplicar formato
                adjustColumnWidths(sheet); // ✅ Ajustar anchos
                XLSX.utils.book_append_sheet(workbook, sheet, 'General');
            }
        }

        XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else {
        // Para CSV/TXT, exportar todo junto (no soporta pestañas)
        // Usamos la logica simple de una hoja
        const sheet = generateDataSheet(data);
        let csv = XLSX.utils.sheet_to_csv(sheet);

        // ✅ Si se pide resumen, AGREGARLO al final del mismo archivo
        if (options.includeSummary) {
            const summarySheet = generateIvaSummarySheet(data, options);
            const summaryCsv = XLSX.utils.sheet_to_csv(summarySheet);

            // Agregar separador visual (líneas vacías + título)
            csv += "\n\n\n--- RESUMEN IVA ---\n\n";
            csv += summaryCsv;
        }

        if (format === 'csv') {
            downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
        } else {
            const txt = csv.split('\n').map(r => r.split(',').join('\t')).join('\n');
            downloadFile(txt, `${filename}.txt`, 'text/plain;charset=utf-8;');
        }
    }
};


// ==========================================
// LÓGICA RESUMEN IVA (Nuevo Requerimiento)
// ==========================================

const generateIvaSummarySheet = (data: any[], options?: ExportOptions): XLSX.WorkSheet => {
    const rates = [21, 15, 10, 4, 0];
    const types = ['base', 'iva'];

    const createEmptySummary = () => {
        const sum: any = {
            retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
            recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
            total_real: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 }
        };
        types.forEach(type => {
            rates.forEach(rate => {
                if (type === 'iva' && rate === 0) return;
                sum[`${type}_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            });
        });
        return sum;
    };

    const ingresosSum = createEmptySummary();
    const gastosSum = createEmptySummary();
    const totalNetoSum = createEmptySummary();
    const quartersWithData = new Set<number>();

    let totalIsIssued = 0;
    let totalNotIssued = 0;

    data.forEach(item => {
        const doc = item.original || item;
        let isIssued = false;
        if (doc.is_issued !== undefined && doc.is_issued !== null) {
            isIssued = Number(doc.is_issued) === 1;
        } else {
            isIssued = Number(doc.importe_total || doc.total) >= 0;
        }
        if (isIssued) totalIsIssued++;
        else totalNotIssued++;
    });

    const isExportingGastos = (totalNotIssued > 0 && totalIsIssued === 0);
    const ctx = options?.exportContext || (isExportingGastos ? 'documentos_recibidas' : 'documentos');

    data.forEach(item => {
        const doc = item.original || item;
        let q = doc.num_trimestre;
        if (!q && doc.fecha_emision) {
            const month = new Date(doc.fecha_emision).getMonth() + 1;
            q = Math.ceil(month / 3);
        }
        if (!q || q < 1 || q > 4) return;
        quartersWithData.add(q);

        const tipoLower = (doc.tipo_documento || '').toLowerCase();
        const esAbono = tipoLower.includes('abono') || tipoLower.includes('crédito') || tipoLower.includes('credito') || Number(doc.importe_total || doc.total) < 0;

        let isIssued = false;
        if (doc.is_issued !== undefined && doc.is_issued !== null) {
            isIssued = Number(doc.is_issued) === 1;
        } else {
            isIssued = Number(doc.importe_total || doc.total) >= 0;
        }

        if (ctx === 'documentos_recibidas' && isIssued) return;
        if (ctx === 'documentos_emitidas' && !isIssued) return;

        const targetSum = isIssued ? ingresosSum : gastosSum;
        const absSign = esAbono ? -1 : 1;

        // El Total Real del documento se suma en positivo a su propia tabla (ingresos o gastos)
        const docTotal = Math.abs(Number(doc.importe_total || doc.total) || 0) * absSign;
        targetSum.total_real[q] += docTotal;
        targetSum.total_real.total += docTotal;

        // Para el balance neto (Trimestres): Ingresos suman, Gastos restan
        const netoBaseSign = isIssued ? 1 : -1;
        const netoSign = esAbono ? (netoBaseSign * -1) : netoBaseSign;
        const docTotalNeto = Math.abs(Number(doc.importe_total || doc.total) || 0) * netoSign;
        totalNetoSum.total_real[q] += docTotalNeto;
        totalNetoSum.total_real.total += docTotalNeto;

        if (doc.iva_details && Array.isArray(doc.iva_details)) {
            doc.iva_details.forEach((detail: any) => {
                const tipoIva = (detail.tipo_impuesto || '').toLowerCase();
                const cuota = Math.abs(Number(detail.cuota) || 0);
                const cuotaAbs = cuota * absSign;
                const cuotaNeto = cuota * netoSign;

                if (tipoIva.includes('retencion')) {
                    targetSum.retenciones[q] += cuotaAbs;
                    targetSum.retenciones.total += cuotaAbs;
                    totalNetoSum.retenciones[q] += cuotaNeto;
                    totalNetoSum.retenciones.total += cuotaNeto;
                    return;
                }

                if (tipoIva.includes('recargo') || tipoIva.includes('equivalencia')) {
                    targetSum.recargos[q] += cuotaAbs;
                    targetSum.recargos.total += cuotaAbs;
                    totalNetoSum.recargos[q] += cuotaNeto;
                    totalNetoSum.recargos.total += cuotaNeto;
                    return;
                }

                const rate = Number(detail.porcentaje);

                const keyBase = `base_${rate}`;
                if (targetSum[keyBase]) {
                    const base = Math.abs(Number(detail.base_imponible) || 0);
                    const baseAbs = base * absSign;
                    const baseNeto = base * netoSign;

                    targetSum[keyBase][q] += baseAbs;
                    targetSum[keyBase].total += baseAbs;

                    totalNetoSum[keyBase][q] += baseNeto;
                    totalNetoSum[keyBase].total += baseNeto;
                }

                const keyIva = `iva_${rate}`;
                if (targetSum[keyIva]) {
                    targetSum[keyIva][q] += cuotaAbs;
                    targetSum[keyIva].total += cuotaAbs;

                    totalNetoSum[keyIva][q] += cuotaNeto;
                    totalNetoSum[keyIva].total += cuotaNeto;
                }
            });
        }
    });

    let activeQuarters: number[] = [];
    if (options?.trimestre) {
        activeQuarters = [options.trimestre];
    } else {
        activeQuarters = [1, 2, 3, 4];
    }

    const rows: (string | number)[][] = [];

    const buildTable = (title: string, summaryData: any) => {
        rows.push([title]);

        const subHeaderRow = [''];
        activeQuarters.forEach(q => subHeaderRow.push(`${q} trimestre`));
        subHeaderRow.push('total');
        rows.push(subHeaderRow);

        const buildRow = (label: string, dataObj: any) => {
            const row: (string | number)[] = [label];
            let rowSum = 0;
            activeQuarters.forEach(q => {
                const val = dataObj[q];
                if (options?.format === 'excel') row.push(val);
                else row.push(formatCurrency(val));

                if (options?.trimestre) rowSum += val;
                else rowSum = dataObj.total;
            });
            if (options?.format === 'excel') row.push(rowSum);
            else row.push(formatCurrency(rowSum));
            return row;
        };

        rates.forEach(rate => {
            const key = `base_${rate}`;
            if (summaryData[key]) {
                const hasData = activeQuarters.some(q => summaryData[key][q] !== 0) || summaryData[key].total !== 0;
                if (hasData) rows.push(buildRow(`Base ${rate}%`, summaryData[key]));
            }
        });

        rows.push([]);

        rates.forEach(rate => {
            const key = `iva_${rate}`;
            if (summaryData[key]) {
                const hasData = activeQuarters.some(q => summaryData[key][q] !== 0) || summaryData[key].total !== 0;
                if (hasData) rows.push(buildRow(`IVA ${rate}%`, summaryData[key]));
            }
        });

        rows.push([]);

        const totalBasesRow: (string | number)[] = ['Total Bases'];
        activeQuarters.forEach(q => {
            let sumQ = 0;
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumQ += summaryData[`base_${r}`][q]; });
            if (options?.format === 'excel') totalBasesRow.push(sumQ);
            else totalBasesRow.push(formatCurrency(sumQ));
        });
        let sumTotalBases = 0;
        if (options?.trimestre) {
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`][options.trimestre!]; });
        } else {
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`].total; });
        }
        if (options?.format === 'excel') totalBasesRow.push(sumTotalBases);
        else totalBasesRow.push(formatCurrency(sumTotalBases));
        rows.push(totalBasesRow);

        const totalIvaRow: (string | number)[] = ['Total IVA'];
        activeQuarters.forEach(q => {
            let sumQ = 0;
            rates.forEach(r => { if (summaryData[`iva_${r}`]) sumQ += summaryData[`iva_${r}`][q]; });
            if (options?.format === 'excel') totalIvaRow.push(sumQ);
            else totalIvaRow.push(formatCurrency(sumQ));
        });
        let sumTotalIva = 0;
        if (options?.trimestre) {
            rates.forEach(r => { if (summaryData[`iva_${r}`]) sumTotalIva += summaryData[`iva_${r}`][options.trimestre!]; });
        } else {
            rates.forEach(r => { if (summaryData[`iva_${r}`]) sumTotalIva += summaryData[`iva_${r}`].total; });
        }
        if (options?.format === 'excel') totalIvaRow.push(sumTotalIva);
        else totalIvaRow.push(formatCurrency(sumTotalIva));
        rows.push(totalIvaRow);

        rows.push([]);

        const totalRowLabel = 'Total Gral. Facturado';
        const totalRow: (string | number)[] = [totalRowLabel];

        activeQuarters.forEach(q => {
            const val = summaryData.total_real[q];
            if (options?.format === 'excel') totalRow.push(val);
            else totalRow.push(formatCurrency(val));
        });

        let sumTotalReal = 0;
        if (options?.trimestre) {
            sumTotalReal = summaryData.total_real[options.trimestre!];
        } else {
            sumTotalReal = summaryData.total_real.total;
        }

        if (options?.format === 'excel') totalRow.push(sumTotalReal);
        else totalRow.push(formatCurrency(sumTotalReal));

        rows.push(totalRow);

        // SEPARATOR
        rows.push([]);

        const hasRecargos = summaryData.recargos.total !== 0 || [1, 2, 3, 4].some(q => summaryData.recargos[q] !== 0);
        const hasRetenciones = summaryData.retenciones.total !== 0 || [1, 2, 3, 4].some(q => summaryData.retenciones[q] !== 0);

        if (hasRecargos) rows.push(buildRow('Total Recargos', summaryData.recargos));

        if (hasRetenciones) {
            const rowR: (string | number)[] = ['Total Retenciones'];
            let rowSum = 0;
            activeQuarters.forEach(q => {
                const val = summaryData.retenciones[q];
                // Las retenciones las mostramos en negativo si restan, pero matemáticamente ya están bien.
                // Como las pasamos sumadas directamente, las mostramos positivo.
                if (options?.format === 'excel') rowR.push(val);
                else rowR.push(formatCurrency(val));
                if (options?.trimestre) rowSum += val;
                else rowSum = summaryData.retenciones.total;
            });
            if (options?.format === 'excel') rowR.push(rowSum);
            else rowR.push(formatCurrency(rowSum));
            rows.push(rowR);
        }


        // Espaciador entre tablas si hay varias
        rows.push([]);
        rows.push([]);
    };

    if (ctx === 'trimestres') {
        buildTable('Resumen anual iva (Ingresos)', ingresosSum);
        buildTable('Resumen anual iva (Gastos)', gastosSum);
        buildTable('Resumen anual iva (Total Neto)', totalNetoSum);
    } else if (ctx === 'documentos_recibidas') {
        buildTable('Resumen anual iva (Gastos)', gastosSum);
    } else if (ctx === 'documentos_emitidas') {
        buildTable('Resumen anual iva (Ingresos)', ingresosSum);
    } else {
        const primarySum = totalIsIssued >= totalNotIssued ? ingresosSum : gastosSum;
        const mainLabel = totalIsIssued >= totalNotIssued ? 'Resumen anual iva (Ingresos)' : 'Resumen anual iva (Gastos)';
        buildTable(mainLabel, primarySum);
    }

    return XLSX.utils.aoa_to_sheet(rows);
};
