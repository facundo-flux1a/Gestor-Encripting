import * as XLSX from 'xlsx';
import type { Document } from '@/lib/types';
import { type Row } from '@tanstack/react-table';
import { buildFileUrl, formatEntityData } from '@/lib/api-v1-helpers';

// ==========================================
// TIPOS
// ==========================================

export type ExportFormat = 'excel' | 'csv' | 'json';

export interface ExportOptions {
    filename: string;
    format: ExportFormat;
    includeSummary?: boolean; // Incluir hoja de resumen IVA
    includeFileUrls?: boolean; // Incluir columna de enlace al archivo original en MinIO
    includeEntities?: boolean; // Incluir pestaña con el directorio completo de entidades
    trimestre?: number | null; // Trimestre específico o null para todo el año
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

const isRetencionDetail = (detail: any): boolean => {
    const tipo = (detail.tipo_impuesto || '').toLowerCase();
    return tipo.includes('retencion') || tipo.includes('irpf');
};

const getRetencionFromDoc = (doc: any): number => {
    const detail = doc?.iva_details?.find((i: any) => isRetencionDetail(i));
    return detail ? Math.abs(Number(detail.cuota) || 0) : 0;
};

const getRecargoFromDoc = (doc: any): number => {
    const details = doc?.iva_details?.filter((i: any) => {
        const tipo = (i.tipo_impuesto || '').toLowerCase();
        return tipo.includes('recargo') || tipo.includes('equivalencia');
    }) ?? [];
    return details.reduce((sum: number, i: any) => sum + (Number(i.cuota) || 0), 0);
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
        if (columnId === 'retencion' && item.original) {
            const val = getRetencionFromDoc(item.original);
            return format === 'excel' ? val : formatCurrency(val);
        }
        if (columnId === 'recargo' && item.original) {
            const val = getRecargoFromDoc(item.original);
            return format === 'excel' ? val : formatCurrency(val);
        }
    } else {
        // Si es objeto plano (Document)
        value = item[columnId];
        if (columnId.startsWith('base_') || columnId.startsWith('iva_')) {
            return getTaxColumnValue(item, columnId, format);
        }
        if (columnId === 'retencion') {
            const val = getRetencionFromDoc(item);
            return format === 'excel' ? val : formatCurrency(val);
        }
        if (columnId === 'recargo') {
            const val = getRecargoFromDoc(item);
            return format === 'excel' ? val : formatCurrency(val);
        }
    }

    if (columnId === 'enlace_documento' || columnId === 'url_archivo' || columnId === 'archivo') {
        const docObj = item?.original || item || {};
        const rawPath = docObj.archivos?.[0]?.ruta_archivo
            || docObj.url_archivo
            || docObj.ruta_archivo
            || docObj.archivo_ruta
            || (typeof docObj.archivos === 'string' ? docObj.archivos : '');
        return rawPath ? buildFileUrl(rawPath) : '';
    }

    if (columnId === '__entidad__') {
        const docObj = item?.original || item || {};
        const entidades = Array.isArray(docObj.entidades) ? docObj.entidades : [];
        // Intentar extraer emisor/proveedor primero, luego receptor/cliente
        const emisor = entidades.find((e: any) => e.rol === 'emisor' || e.rol === 'proveedor');
        const receptor = entidades.find((e: any) => e.rol === 'receptor' || e.rol === 'cliente');
        const relevant = emisor || receptor;
        if (relevant) {
            const formatted = formatEntityData(relevant);
            const nombre = formatted.nombre || '';
            const cif = formatted.cif || '';
            return cif ? `${nombre} (${cif})` : nombre;
        }
        // Fallback a campos planos
        return docObj.proveedor || docObj.empresa_emisora || docObj.cliente || '';
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

// ✅ Helper: determina si un detalle es una línea de IVA real (no retención ni recargo)
const isRealIvaDetail = (detail: any): boolean => {
    const tipo = (detail.tipo_impuesto || '').toLowerCase();
    return !tipo.includes('retencion') &&
           !tipo.includes('irpf') &&
           !tipo.includes('recargo') &&
           !tipo.includes('equivalencia');
};

const getTaxColumnValue = (doc: any, columnId: string, format?: ExportFormat): string | number => {
    const rateMatch = columnId.match(/\d+/);
    if (rateMatch) {
        const rate = Number(rateMatch[0]);
        // ✅ FIX: Excluir retenciones/recargos antes de buscar por porcentaje.
        // Sin este filtro, una retención con porcentaje=0 sería devuelta al buscar base_0,
        // duplicando la base imponible en el export.
        const ivaDetail = doc.iva_details?.find(
            (i: any) => isRealIvaDetail(i) && Number(i.porcentaje) === rate
        );
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

    if (columnId === 'retencion') {
        return getRetencionFromDoc(item.original || item);
    }
    if (columnId === 'recargo') {
        return getRecargoFromDoc(item.original || item);
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
            // ✅ FIX: Mismo filtro que getTaxColumnValue — excluir retenciones/recargos
            const ivaDetail = doc.iva_details?.find(
                (i: any) => isRealIvaDetail(i) && Number(i.porcentaje) === rate
            );
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

    // Determinar columnas efectivas agregando URL de archivo si fue solicitado
    const effectiveColumns = [...columns];
    if (options.includeEntities && !effectiveColumns.some(c => c.id === '__entidad__')) {
        // Insertar columna Proveedor/Cliente justo después de la primera columna (ID/fecha)
        effectiveColumns.splice(1, 0, { id: '__entidad__', header: 'Proveedor / Cliente' });
    }
    if (options.includeFileUrls && !effectiveColumns.some(c => c.id === 'enlace_documento' || c.id === 'url_archivo' || c.id === 'archivo')) {
        effectiveColumns.push({ id: 'enlace_documento', header: 'Enlace Documento' });
    }

    // Función interna para generar hoja de datos
    const generateDataSheet = (sheetData: any[]): XLSX.WorkSheet => {
        // 1. Preparar datos procesados
        const rows = sheetData.map(item => {
            const rowData: { [key: string]: any } = {};
            effectiveColumns.forEach(col => {
                rowData[col.header] = getValueForExport(item, col.id, format);
            });
            return rowData;
        });

        // 2. Calcular totales
        const totals: Record<string, number> = {};
        effectiveColumns.forEach(col => totals[col.id] = 0);

        sheetData.forEach(item => {
            effectiveColumns.forEach(col => {
                const val = getNumericValue(item, col.id);
                if (!isNaN(val)) {
                    totals[col.id] = (totals[col.id] || 0) + val;
                }
            });
        });

        // 3. Agregar fila de totales
        if (rows.length > 0) {
            const totalRowData: { [key: string]: any } = {};
            totalRowData[effectiveColumns[0].header] = "TOTALES:";

            effectiveColumns.slice(1).forEach(col => {
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

        // Helper para extraer año de cada documento
        const getDocYear = (item: any): number => {
            const doc = item.original || item;
            if (doc.año) return Number(doc.año);
            if (doc.año_trimestre) return Number(doc.año_trimestre);
            if (doc.fecha_emision) {
                const d = new Date(doc.fecha_emision);
                if (!isNaN(d.getTime())) return d.getFullYear();
            }
            return 0;
        };

        const yearsPresent = Array.from(new Set(data.map(getDocYear).filter(y => y > 0))).sort((a, b) => a - b);
        const hasMultipleYears = yearsPresent.length > 1;

        // 1. HOJA RESUMEN IVA
        if (options.includeSummary) {
            const summarySheet = generateIvaSummarySheet(data, options);
            applyExcelNumberFormat(summarySheet); // ✅ Aplicar formato
            adjustColumnWidths(summarySheet); // ✅ Ajustar anchos
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen IVA');
        }

        // 2. HOJAS POR TRIMESTRE Y AÑO
        if (hasMultipleYears) {
            // Generar pestañas desglosadas por cada año
            yearsPresent.forEach(year => {
                const yearData = data.filter(item => getDocYear(item) === year);
                const quarters: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] };

                yearData.forEach(item => {
                    const doc = item.original || item;
                    let q = doc.num_trimestre;
                    if (!q && doc.fecha_emision) {
                        const month = new Date(doc.fecha_emision).getMonth() + 1;
                        q = Math.ceil(month / 3);
                    }
                    if (q >= 1 && q <= 4) {
                        quarters[q].push(item);
                    }
                });

                [1, 2, 3, 4].forEach(q => {
                    if (quarters[q].length > 0) {
                        const sheet = generateDataSheet(quarters[q]);
                        applyExcelNumberFormat(sheet);
                        adjustColumnWidths(sheet);
                        XLSX.utils.book_append_sheet(workbook, sheet, `${q}T ${year}`);
                    }
                });
            });

            // Pestaña unificada al final con todos los datos combinados independientemente del año
            const consolidadoSheet = generateDataSheet(data);
            applyExcelNumberFormat(consolidadoSheet);
            adjustColumnWidths(consolidadoSheet);
            XLSX.utils.book_append_sheet(workbook, consolidadoSheet, 'Consolidado Global');
        } else {
            // Agrupar datos por trimestre (un solo año)
            const quarters: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] };
            const unknownQuarter: any[] = [];

            data.forEach(item => {
                const doc = item.original || item;
                let q = doc.num_trimestre;

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

            if (unknownQuarter.length > 0 || (quarters[1].length === 0 && quarters[2].length === 0 && quarters[3].length === 0 && quarters[4].length === 0)) {
                const dataToUse = unknownQuarter.length > 0 ? unknownQuarter : data;
                if (dataToUse.length > 0) {
                    const sheet = generateDataSheet(dataToUse);
                    applyExcelNumberFormat(sheet); // ✅ Aplicar formato
                    adjustColumnWidths(sheet); // ✅ Ajustar anchos
                    XLSX.utils.book_append_sheet(workbook, sheet, 'General');
                }
            }
        }

        // 3. HOJA DE ENTIDADES (Directorio completo de Proveedores y Clientes si fue solicitado)
        if (options.includeEntities) {
            const entitiesSheet = generateEntitiesSheet(data);
            applyExcelNumberFormat(entitiesSheet);
            adjustColumnWidths(entitiesSheet);
            XLSX.utils.book_append_sheet(workbook, entitiesSheet, 'Entidades');
        }

        XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else {
        // Para CSV/TXT, exportar todo junto (no soporta pestañas)
        const sheet = generateDataSheet(data);
        let csv = XLSX.utils.sheet_to_csv(sheet);

        if (options.includeSummary) {
            const summarySheet = generateIvaSummarySheet(data, options);
            const summaryCsv = XLSX.utils.sheet_to_csv(summarySheet);

            csv += "\n\n\n--- RESUMEN IVA ---\n\n";
            csv += summaryCsv;
        }

        if (options.includeEntities) {
            const entitiesSheet = generateEntitiesSheet(data);
            const entitiesCsv = XLSX.utils.sheet_to_csv(entitiesSheet);

            csv += "\n\n\n--- ENTIDADES ---\n\n";
            csv += entitiesCsv;
        }

        if (format === 'csv') {
            downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
        } else {
            const jsonRows = data.map(item => {
                const obj: Record<string, any> = {};
                effectiveColumns.forEach(col => {
                    obj[col.header] = getValueForExport(item, col.id);
                });
                return obj;
            });
            const jsonContent = JSON.stringify(jsonRows, null, 2);
            downloadFile(jsonContent, `${filename}.json`, 'application/json;charset=utf-8;');
        }
    }
};

// ==========================================
// LÓGICA DIRECTORIO DE ENTIDADES (PROVEEDORES Y CLIENTES)
// ==========================================

const generateEntitiesSheet = (data: any[]): XLSX.WorkSheet => {
    const entityMap = new Map<string, {
        rol: string;
        nombre: string;
        cif: string;
        direccion: string;
        codigo_postal: string;
        poblacion: string;
        provincia: string;
        telefono: string;
        email: string;
        iban: string;
        totalFacturas: number;
        importeTotal: number;
    }>();

    data.forEach(item => {
        const doc = item.original || item;
        const entidades = doc.entidades && Array.isArray(doc.entidades) ? doc.entidades : [];
        const docTotal = Math.abs(Number(doc.importe_total || doc.total) || 0);

        if (entidades.length > 0) {
            entidades.forEach((ent: any) => {
                const formatted = formatEntityData(ent);
                const nombre = formatted.nombre || 'Sin nombre';
                const cif = formatted.cif || '';
                const key = `${ent.rol || 'desconocido'}_${cif}_${nombre}`.toLowerCase();

                let existing = entityMap.get(key);
                if (!existing) {
                    const rolLabel = (ent.rol === 'emisor' || ent.rol === 'proveedor')
                        ? 'Proveedor / Emisor'
                        : (ent.rol === 'receptor' || ent.rol === 'cliente')
                            ? 'Cliente / Receptor'
                            : ent.rol || 'Otro';

                    existing = {
                        rol: rolLabel,
                        nombre,
                        cif,
                        direccion: formatted.direccion || '',
                        codigo_postal: formatted.codigo_postal || '',
                        poblacion: formatted.poblacion || '',
                        provincia: formatted.provincia || '',
                        telefono: formatted.telefono || '',
                        email: formatted.email || '',
                        iban: formatted.iban || '',
                        totalFacturas: 0,
                        importeTotal: 0,
                    };
                    entityMap.set(key, existing);
                }
                existing.totalFacturas += 1;
                existing.importeTotal += docTotal;
            });
        } else {
            // Fallback si no hay entidades estructuradas
            const provNombre = doc.proveedor || doc.empresa_emisora || '';
            const provCif = doc.cif || doc.cif_emisor || '';
            if (provNombre || provCif) {
                const key = `proveedor_${provCif}_${provNombre}`.toLowerCase();
                let existing = entityMap.get(key);
                if (!existing) {
                    existing = {
                        rol: 'Proveedor / Emisor',
                        nombre: provNombre,
                        cif: provCif,
                        direccion: doc.direccion_emisor || '',
                        codigo_postal: '',
                        poblacion: '',
                        provincia: '',
                        telefono: '',
                        email: '',
                        iban: '',
                        totalFacturas: 0,
                        importeTotal: 0,
                    };
                    entityMap.set(key, existing);
                }
                existing.totalFacturas += 1;
                existing.importeTotal += docTotal;
            }
        }
    });

    const rows = Array.from(entityMap.values()).map(e => ({
        'Rol': e.rol,
        'Razón Social / Nombre': e.nombre,
        'CIF / NIF': e.cif,
        'Dirección': e.direccion,
        'Código Postal': e.codigo_postal,
        'Población': e.poblacion,
        'Provincia': e.provincia,
        'Teléfono': e.telefono,
        'Email': e.email,
        'IBAN': e.iban,
        'Nº Facturas': e.totalFacturas,
        'Total Facturado (€)': e.importeTotal
    }));

    return XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Mensaje': 'No se encontraron entidades asociadas' }]);
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
            // ✅ Campos de datos_extra: base no sujeta a IVA y descuentos globales
            base_no_sujeta: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
            descuento_global: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
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

        // ✅ Acumular base_no_sujeta y descuento_global desde el documento (ya mapeados en top-level)
        const bns  = Math.abs(Number((doc as any).base_no_sujeta  || 0));
        const desc = Math.abs(Number((doc as any).descuento_global || 0));
        if (bns > 0) {
            targetSum.base_no_sujeta[q]   += bns * absSign;
            targetSum.base_no_sujeta.total += bns * absSign;
            totalNetoSum.base_no_sujeta[q]   += bns * netoSign;
            totalNetoSum.base_no_sujeta.total += bns * netoSign;
        }
        if (desc > 0) {
            targetSum.descuento_global[q]   += desc * absSign;
            targetSum.descuento_global.total += desc * absSign;
            totalNetoSum.descuento_global[q]   += desc * netoSign;
            totalNetoSum.descuento_global.total += desc * netoSign;
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

        // ✅ Base no sujeta a IVA (de datos_extra) — se muestra como línea separada en la sección de bases
        const hasBns = summaryData.base_no_sujeta.total !== 0 || activeQuarters.some(q => summaryData.base_no_sujeta[q] !== 0);
        if (hasBns) rows.push(buildRow('Base no sujeta a IVA', summaryData.base_no_sujeta));

        rows.push([]);

        rates.forEach(rate => {
            const key = `iva_${rate}`;
            if (summaryData[key]) {
                const hasData = activeQuarters.some(q => summaryData[key][q] !== 0) || summaryData[key].total !== 0;
                if (hasData) rows.push(buildRow(`IVA ${rate}%`, summaryData[key]));
            }
        });

        rows.push([]);

        const totalBasesRow: (string | number)[] = ['Total Bases (incl. no sujeta)'];
        activeQuarters.forEach(q => {
            let sumQ = 0;
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumQ += summaryData[`base_${r}`][q]; });
            // ✅ Incluir base_no_sujeta en el total de bases
            sumQ += summaryData.base_no_sujeta[q] || 0;
            if (options?.format === 'excel') totalBasesRow.push(sumQ);
            else totalBasesRow.push(formatCurrency(sumQ));
        });
        let sumTotalBases = 0;
        if (options?.trimestre) {
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`][options.trimestre!]; });
            sumTotalBases += summaryData.base_no_sujeta[options.trimestre!] || 0;
        } else {
            rates.forEach(r => { if (summaryData[`base_${r}`]) sumTotalBases += summaryData[`base_${r}`].total; });
            sumTotalBases += summaryData.base_no_sujeta.total || 0;
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
                if (options?.format === 'excel') rowR.push(val);
                else rowR.push(formatCurrency(val));
                if (options?.trimestre) rowSum += val;
                else rowSum = summaryData.retenciones.total;
            });
            if (options?.format === 'excel') rowR.push(rowSum);
            else rowR.push(formatCurrency(rowSum));
            rows.push(rowR);
        }

        // ✅ Descuento global (de datos_extra) — se muestra como deducción si existe
        const hasDescuento = summaryData.descuento_global.total !== 0 || activeQuarters.some(q => summaryData.descuento_global[q] !== 0);
        if (hasDescuento) rows.push(buildRow('(-) Descuento Global', summaryData.descuento_global));


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
