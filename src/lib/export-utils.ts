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
export const getValueForExport = (item: any, columnId: string): string => {
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
            return getTaxColumnValue(item, columnId);
        }
    }

    if (value instanceof Date) {
        return value.toLocaleDateString('es-ES');
    }
    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    // Formateo de moneda para columnas conocidas
    if (typeof value === 'number') {
        return formatCurrency(value);
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value ?? '');
};

const getTaxColumnValue = (doc: any, columnId: string): string => {
    const rateMatch = columnId.match(/\d+/);
    if (rateMatch) {
        const rate = Number(rateMatch[0]);
        const ivaDetail = doc.iva_details?.find((i: any) => Number(i.porcentaje) === rate);
        if (columnId.startsWith('base_')) {
            return formatCurrency(ivaDetail?.base_imponible ?? 0);
        }
        if (columnId.startsWith('iva_')) {
            return formatCurrency(ivaDetail?.cuota ?? 0);
        }
    }
    return '';
};

const getNumericValue = (item: any, columnId: string): number => {
    // Lógica para obtener valor numérico crudo para sumatorias
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
        return 0;
    }

    let val: any;
    if (item && typeof item.getValue === 'function') {
        val = item.getValue(columnId);
    } else {
        val = item[columnId];
    }

    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        if (['base', 'iva', 'retencion', 'total', 'base_imponible', 'importe_total', 'importe_sin_impuestos'].includes(columnId)) {
            return Number(val) || 0;
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
                rowData[col.header] = getValueForExport(item, col.id);
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
                const isNumeric = ['base', 'iva', 'retencion', 'total', 'base_imponible', 'importe_total', 'importe_sin_impuestos'].includes(col.id)
                    || col.id.startsWith('base_') || col.id.startsWith('iva_');

                if (isNumeric) {
                    totalRowData[col.header] = formatCurrency(totals[col.id] || 0);
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
    // Estructura:
    //          1T  2T  3T  4T  Total
    // Base 21
    // Base 10
    // ...
    // IVA 21
    // ...
    // Totales

    const summaryData: any = {};
    // keys: base_21, base_10, base_4, base_0, iva_21, iva_10, iva_4, iva_0
    // values: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 }

    const rates = [21, 15, 10, 4, 0]; // Agregado 15% por si acaso (retenciones o nuevos tipos)
    const types = ['base', 'iva'];

    // Inicializar estructura
    types.forEach(type => {
        rates.forEach(rate => {
            if (type === 'iva' && rate === 0) return; // IVA 0 no suele tener cuota
            summaryData[`${type}_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        });
    });

    // Detectar qué trimestres tienen datos
    const quartersWithData = new Set<number>();

    data.forEach(item => {
        const doc = item.original || item;
        let q = doc.num_trimestre;
        if (!q && doc.fecha_emision) {
            const month = new Date(doc.fecha_emision).getMonth() + 1;
            q = Math.ceil(month / 3);
        }
        if (!q || q < 1 || q > 4) return;

        quartersWithData.add(q);

        if (doc.iva_details && Array.isArray(doc.iva_details)) {
            doc.iva_details.forEach((detail: any) => {
                const rate = Number(detail.porcentaje);

                // Acumular Base
                const keyBase = `base_${rate}`;
                if (summaryData[keyBase]) {
                    const base = Number(detail.base_imponible) || 0;
                    summaryData[keyBase][q] += base;
                    summaryData[keyBase].total += base;
                }

                // Acumular Cuota
                const keyIva = `iva_${rate}`;
                if (summaryData[keyIva]) {
                    const cuota = Number(detail.cuota) || 0;
                    summaryData[keyIva][q] += cuota;
                    summaryData[keyIva].total += cuota;
                }
            });
        }
    });

    // Determinar qué columnas mostrar
    let activeQuarters: number[] = [];
    if (options?.trimestre) {
        // Si se especificó un trimestre, mostrar SOLO ese trimestre
        activeQuarters = [options.trimestre];
    } else {
        // Si NO se especificó trimestre (Anual), mostrar SIEMPRE los 4 trimestres
        activeQuarters = [1, 2, 3, 4];
    }

    // Construir filas para Excel
    const rows = [];

    // Header row
    rows.push(['Resumen anual iva']);

    const subHeaderRow = [''];
    activeQuarters.forEach(q => subHeaderRow.push(`${q} trimestre`));
    subHeaderRow.push('total');
    rows.push(subHeaderRow);

    // Helper para construir fila de datos
    const buildRow = (label: string, dataObj: any) => {
        const row = [label];
        let rowSum = 0;
        activeQuarters.forEach(q => {
            const val = dataObj[q];
            row.push(formatCurrency(val));

            if (options?.trimestre) {
                rowSum += val;
            } else {
                rowSum = dataObj.total; // En anual usamos el total acumulado real
            }
        });
        row.push(formatCurrency(rowSum));
        return row;
    };

    // Filas Base
    rates.forEach(rate => {
        const key = `base_${rate}`;
        if (!summaryData[key]) return;
        const d = summaryData[key];

        // Solo agregar fila si hay datos
        //if (d.total !== 0) { // Comentado para mostrar siempre en anual
        rows.push(buildRow(`base ${rate}`, d));
        //}
    });

    rows.push([]); // Espacio

    // Filas IVA
    rates.forEach(rate => {
        const key = `iva_${rate}`;
        if (!summaryData[key]) return;
        const d = summaryData[key];

        // Solo agregar fila si hay datos
        //if (d.total !== 0) {
        rows.push(buildRow(`iva ${rate}`, d));
        //}
    });

    rows.push([]); // Espacio

    // Total final (Base + Cuota)
    const totalRow = ['Total (Base + IVA)'];
    // Suma por columna (trimestre)
    activeQuarters.forEach(q => {
        let sumQ = 0;
        rates.forEach(r => {
            if (summaryData[`base_${r}`]) sumQ += summaryData[`base_${r}`][q];
            if (summaryData[`iva_${r}`]) sumQ += summaryData[`iva_${r}`][q];
        });
        totalRow.push(formatCurrency(sumQ));
    });

    // Suma total global
    let sumTotal = 0;
    if (options?.trimestre) {
        rates.forEach(r => {
            if (summaryData[`base_${r}`]) sumTotal += summaryData[`base_${r}`][options.trimestre!];
            if (summaryData[`iva_${r}`]) sumTotal += summaryData[`iva_${r}`][options.trimestre!];
        });
    } else {
        rates.forEach(r => {
            if (summaryData[`base_${r}`]) sumTotal += summaryData[`base_${r}`].total;
            if (summaryData[`iva_${r}`]) sumTotal += summaryData[`iva_${r}`].total;
        });
    }

    totalRow.push(formatCurrency(sumTotal));
    rows.push(totalRow);

    // ✅ NUEVO: Totales separados
    rows.push([]); // Espacio

    // Total Bases
    const totalBasesRow = ['Total Bases'];
    activeQuarters.forEach(q => {
        let sumQ = 0;
        rates.forEach(r => { if (summaryData[`base_${r}`]) sumQ += summaryData[`base_${r}`][q]; });
        totalBasesRow.push(formatCurrency(sumQ));
    });
    // Sum total bases
    let sumTotalBases = 0;
    if (options?.trimestre) {
        rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`][options.trimestre!]; });
    } else {
        rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`].total; });
    }
    totalBasesRow.push(formatCurrency(sumTotalBases));
    rows.push(totalBasesRow);

    // Total IVA
    const totalIvaRow = ['Total IVA'];
    activeQuarters.forEach(q => {
        let sumQ = 0;
        rates.forEach(r => { if (summaryData[`iva_${r}`]) sumQ += summaryData[`iva_${r}`][q]; });
        totalIvaRow.push(formatCurrency(sumQ));
    });
    // Sum total iva
    let sumTotalIva = 0;
    if (options?.trimestre) {
        rates.forEach(r => { if (summaryData[`iva_${r}`]) sumTotalIva += summaryData[`iva_${r}`][options.trimestre!]; });
    } else {
        rates.forEach(r => { if (summaryData[`iva_${r}`]) sumTotalIva += summaryData[`iva_${r}`].total; });
    }
    totalIvaRow.push(formatCurrency(sumTotalIva));
    rows.push(totalIvaRow);


    return XLSX.utils.aoa_to_sheet(rows);
};
