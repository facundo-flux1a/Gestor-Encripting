'use server';

import { VertexAI } from '@google-cloud/vertexai';
import db from '@/lib/db';
import { getCurrentUser } from './user-service';

// Tipos
export interface Incident {
    id?: number;
    tipo: string;
    descripcion: string;
    severidad: 'baja' | 'media' | 'alta';
    sugerencia: string;
    analisis_nro?: number;
    include_in_context?: boolean;
    created_at?: string;
}

export interface DiagnosticResult {
    success: boolean;
    incidents: Incident[];
    error?: string;
    raw_response?: string;
}

const SYSTEM_PROMPT = `Eres un auditor contable senior con amplia experiencia en fiscalidad española.
Tu misión es identificar el CAMINO DE SOLUCIÓN más eficiente para corregir documentos contables.

ANÁLISIS DE DEPENDENCIAS (OBLIGATORIO ANTES DE GENERAR INCIDENTES):
Antes de reportar cualquier error, razona matemáticamente si cada discrepancia observada es una CAUSA RAÍZ
o un SÍNTOMA derivado de otro error.

REGLA ANTI-CASCADA: Si corriges el Campo A y como resultado el Campo B queda automáticamente correcto
(porque B depende matemáticamente de A), entonces B no es un error independiente. Solo reporta A.

REGLA DE INDEPENDENCIA: Si corregir el Campo A no resuelve el Campo B (el Campo B sigue incorrecto
por razones propias), entonces B también es un error independiente y debe reportarse.

EJEMPLOS DE RAZONAMIENTO (abstractos, para ilustrar el principio):

[CASO A — IVA como síntoma, NO reportar por separado]
Datos: Base=5000€, IVA_registrado=700€, Total_cabecera=5750€
Razonamiento: IVA_esperado = 5000 × 21% = 1050€ ≠ 700€ → hay error en IVA.
Pero: Base(5000€) + IVA_esperado(1050€) = 6050€ ≠ Total_cabecera(5750€) → sigo sin cuadrar.
Alternativa: ¿Y si la Base es la causa raíz? Pruebo: ¿Qué Base hace que IVA+Base=5750€?
Base_correcta = 5750 / 1.21 = 4752.07€. Compruebo: 4752.07 × 21% = 997.93€ ≈ 998€. Total = 5750€ ✓.
Conclusión: La Base (5000€) está inflada. Al corregirla a 4752€, el IVA y el Total cuadran solos.
→ Reporto SOLO: "Base Imponible incorrecta. Corregir de 5000€ a 4752€." NO reporto IVA ni Total.

[CASO B — IVA como causa independiente, SÍ reportar]
Datos: Base=8000€, IVA_registrado=600€, Total_cabecera=8680€
Razonamiento: IVA_esperado = 8000 × 10% = 800€. Si base fuera correcta: 8000+800=8800€ ≠ 8680€.
Si Total es correcto: 8680-8000=680€ de IVA esperado. Pero 8000×10%=800€. Ningún campo corrige al otro.
Conclusión: El IVA registrado (600€) no se explica por ningún error de la Base. Es un error independiente.
→ Reporto: "IVA incorrecto: se registró 600€ pero debería ser 800€ (10% de 8000€)."

CRITERIOS DE AUDITORÍA:
- RECONOCIMIENTO DE MEJORAS: Si un error previo del historial ya fue corregido, menciónalo positivamente.
- FOCO NUMÉRICO ESTRICTO: Solo lo que afecte al descuadre. Ignora detalles estilísticos.
- Cada sugerencia debe incluir el valor exacto del campo correcto.

DIRECTRICES DE TONO:
- Profesional y Serio. Conciso y Técnico. Usa terminología contable adecuada.
- La "sugerencia" debe ser una instrucción directa: "Corregir el campo X de A€ a B€."

ESTRUCTURA JSON:
{
  "incidents": [
    {
      "tipo": "Cálculo incorrecto" | "Dato incongruente" | "Impuesto mal aplicado",
      "descripcion": "Causa raíz con contexto técnico (max 200 chars)",
      "severidad": "baja" | "media" | "alta",
      "sugerencia": "Instrucción directa con el valor correcto exacto"
    }
  ]
}

Responde SOLO JSON.`;

export async function diagnoseDocument(documentId: number): Promise<DiagnosticResult> {
    try {
        const user = await getCurrentUser();
        if (!user) return { success: false, incidents: [], error: 'No autorizado' };

        // 0. Obtener HISTORIAL ESTRUCTURADO (para contexto selectivo)
        const history = await getAuditHistory(documentId);

        // Filtrar solo lo que el usuario quiere enviar como contexto
        const activeContext = history.filter(h => h.include_in_context);
        const nextAnalysisNro = history.length > 0
            ? Math.max(...history.map(h => h.analisis_nro || 0)) + 1
            : 1;

        // Construir bloque de contexto para la IA
        let contextBlock = '';
        if (activeContext.length > 0) {
            contextBlock = activeContext.map(h =>
                `[Hallazgo previo - Análisis nº ${h.analisis_nro}]: ${h.descripcion} (Sugerencia: ${h.sugerencia})`
            ).join('\n');

            // Límite de seguridad
            if (contextBlock.length > 3000) {
                contextBlock = "...(parte del contexto omitido por longitud)...\n" + contextBlock.slice(-3000);
            }
        }

        // 1. Obtener datos del documento con la suma de sus impuestos
        const [rows] = await db.query<any[]>(
            `SELECT d.*, e.recargo as empresa_recargo,
                COALESCE((SELECT SUM(cuota) FROM erp49.impuestos_documento WHERE documento_id = d.id), 0) as total_impuestos
             FROM erp49.documentos d
             LEFT JOIN erp49.empresas e ON d.id_de_empresa = e.id
             WHERE d.id = ? `,
            [documentId]
        );

        if (rows.length === 0) return { success: false, incidents: [], error: 'Documento no encontrado' };
        const doc = rows[0];

        // 1.1 Obtener desglose de impuestos
        const [taxRows] = await db.query<any[]>(
            `SELECT tipo_impuesto, porcentaje, base_imponible, cuota 
             FROM erp49.impuestos_documento 
             WHERE documento_id = ?`,
            [documentId]
        );

        // 1.2 Obtener líneas del documento
        const [lineRows] = await db.query<any[]>(
            `SELECT descripcion, cantidad, precio_unitario, importe_linea, descuento_porcentaje
             FROM erp49.lineas_documento
             WHERE documento_id = ?
             ORDER BY id`,
            [documentId]
        );

        // 1.3 Obtener entidades (emisor y receptor)
        const [entityRows] = await db.query<any[]>(
            `SELECT rol, nombre, identificador_fiscal
             FROM erp49.entidades_documento
             WHERE documento_id = ?`,
            [documentId]
        );

        const emisor = entityRows.find((e: any) => e.rol === 'emisor' || e.rol === 'proveedor');
        const receptor = entityRows.find((e: any) => e.rol === 'receptor' || e.rol === 'cliente');
        const tieneRecargo = Boolean(doc.empresa_recargo);

        // Convertir strings de MySQL a números reales para evitar NaN
        const base = Number(doc.importe_sin_impuestos || 0);
        const total = Number(doc.importe_total || 0);
        const impuestos = Number(doc.total_impuestos || 0);
        const diferencia = Math.abs(total - (base + impuestos));

        // 2. Configurar Vertex AI
        const projectId = process.env.VERTEX_AI_PROJECT_ID;
        const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
        const modelName = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';

        let credentials;
        try {
            let rawCreds = process.env.VERTEX_AI_CREDENTIALS?.trim() || '';

            // Si el string no empieza con {, intentamos ver si está envuelto en comillas
            if (rawCreds && !rawCreds.startsWith('{')) {
                rawCreds = rawCreds.replace(/^['"]|['"]$/g, '').trim();
            }

            credentials = rawCreds ? JSON.parse(rawCreds) : undefined;
        } catch (e) {
            console.error('❌ Error crítico parseando VERTEX_AI_CREDENTIALS:', e);
            return {
                success: false,
                incidents: [],
                error: 'Error de formato en VERTEX_AI_CREDENTIALS. Asegúrate de que el JSON sea válido.'
            };
        }

        if (!projectId) return { success: false, incidents: [], error: 'VERTEX_AI_PROJECT_ID no configurado en .env' };

        const vertexAI = new VertexAI({
            project: projectId,
            location: location,
            googleAuthOptions: credentials ? { credentials } : undefined
        });

        const generativeModel = vertexAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                responseMimeType: 'application/json',
            },
        });

        // ── Pre-análisis matemático de dependencias ──────────────────────────
        // Para cada impuesto, calculamos la cuota "esperada" según la base
        const taxAnalysis = taxRows.map((t: any) => {
            const taxBase = Number(t.base_imponible || 0);
            const pct = Number(t.porcentaje || 0);
            const registeredCuota = Number(t.cuota || 0);
            const expectedCuota = Math.round(taxBase * (pct / 100) * 100) / 100;
            const cuotaDiff = Math.abs(registeredCuota - expectedCuota);
            const cuotaOk = cuotaDiff < 0.02; // tolerancia céntimos
            return { ...t, taxBase, pct, registeredCuota, expectedCuota, cuotaOk, cuotaDiff };
        });

        // Cuota total esperada si la Base fuera la correcta para cada fila
        const totalExpectedCuota = taxAnalysis.reduce((sum: number, t: any) => sum + t.expectedCuota, 0);
        const expectedTotalFromBase = Math.round((base + totalExpectedCuota) * 100) / 100;
        const baseExplainsTotal = Math.abs(expectedTotalFromBase - total) < 0.05;

        // Construir bloque de análisis para el prompt
        // Comprobar si la base de cada impuesto coincide con la base de cabecera (mismo valor = mismo error)
        const taxBaseMatchesHeader = taxAnalysis.every((t: any) => Math.abs(t.taxBase - base) < 0.05);
        const dependencyBlock = `
ANÁLISIS DE DEPENDENCIAS PRE-COMPUTADO:
- Base Imponible (importe_sin_impuestos): ${base}€
- base_imponible de TODOS los impuestos coincide con la Base de cabecera: ${taxBaseMatchesHeader ? 'SÍ → son el MISMO campo. Si la Base es incorrecta, NO reportes la base de cada impuesto como error separado.' : 'NO → algún impuesto tiene una base distinta a la cabecera (posible error independiente).'}
- Cuota total esperada si Base es correcta: ${totalExpectedCuota.toFixed(2)}€ | Total esperado: ${expectedTotalFromBase.toFixed(2)}€
- ¿Total registrado (${total}€) == Base+CuotaEsperada (${expectedTotalFromBase.toFixed(2)}€)? ${baseExplainsTotal ? 'SÍ → Base es la causa raíz. IVA y Total son síntomas. NO los reportes independientemente.' : 'NO → hay errores adicionales independientes.'}
${taxAnalysis.map((t: any) => `- ${t.tipo_impuesto} ${t.pct}%: Cuota registrada ${t.registeredCuota}€ vs esperada ${t.expectedCuota}€ → ${t.cuotaOk ? 'CORRECTO' : `DESVIACIÓN ${t.cuotaDiff.toFixed(2)}€`}`).join('\n')}
`;

        // 3. Preparar prompt de datos
        const sumLines = lineRows.reduce((s: number, l: any) => s + Number(l.importe_linea || 0), 0);
        const promptData = `
CONTEXTO DEL SISTEMA (REGLAS DE NEGOCIO Y ESTRUCTURA):
- La fórmula del sistema es: Total = Base Imponible + SUM(Cuotas de Impuestos).
- "Base Imponible" (campo: importe_sin_impuestos) es la suma neta de las líneas del documento.
- "Total" (campo: importe_total) es el importe final que el cliente paga.
- Las "Cuotas" de cada impuesto se calculan como: base_imponible_del_impuesto × (porcentaje / 100).
- La "Suma de líneas" debería coincidir con la Base Imponible de cabecera.
- Si hay Recargo de Equivalencia (RE), aparecerá como impuesto adicional.

REGLA CRÍTICA DE CO-DEPENDENCIA:
- El campo "base_imponible" dentro de cada registro de impuesto (impuestos_documento)
  es el MISMO valor que "importe_sin_impuestos" de cabecera. Son la misma magnitud.
- Si "importe_sin_impuestos" y "base_imponible" del impuesto difieren por el MISMO importe,
  NO son dos errores distintos. Es UN solo error: la Base Imponible está mal.
  Corrigiendo "importe_sin_impuestos" en cabecera, la base del impuesto se actualiza con ella.
- NUNCA reportes como problema independent la discrepancia entre "base_imponible" del impuesto
  y "importe_sin_impuestos" si ambos valores difieren del correcto por la misma cantidad.

CAMPOS EDITABLES POR EL USUARIO (solo estos deben sugerirse como correcciones):
- importe_sin_impuestos → Base Imponible de cabecera
- importe_total → Total de cabecera
- cuota (en impuestos_documento) → Cuota de cada impuesto
- precio_unitario / importe_linea (en lineas_documento) → Valores de cada línea
NO sugieras corregir campos calculados automáticamente que deberían derivarse de otros.

DOCUMENTO A AUDITAR:
- ID: ${doc.id}
- Número: ${doc.numero_documento || 'N/A'}
- Tipo: ${doc.tipo_documento || 'N/A'}
- Empresa con Recargo de Equivalencia: ${tieneRecargo ? 'SÍ' : 'NO'}
- Emisor: ${emisor ? `${emisor.nombre} (${emisor.identificador_fiscal || 'sin CIF'})` : 'No registrado'}
- Receptor: ${receptor ? `${receptor.nombre} (${receptor.identificador_fiscal || 'sin CIF'})` : 'No registrado'}

VALORES DE CABECERA:
- Base Imponible (importe_sin_impuestos): ${base}€
- Suma de Cuotas Desglosadas: ${impuestos}€
- Total (importe_total): ${total}€
- Suma de Líneas del documento: ${sumLines.toFixed(2)}€
- ¿Suma de líneas == Base? ${Math.abs(sumLines - base) < 0.05 ? 'SÍ ✓' : `NO — diferencia de ${(sumLines - base).toFixed(2)}€`}
- Diferencia Total vs (Base+Cuotas): ${diferencia.toFixed(2)}€

${dependencyBlock}

LÍNEAS DEL DOCUMENTO:
${lineRows.length > 0
                ? lineRows.map((l: any, i: number) =>
                    `Línea ${i + 1}: ${l.descripcion || '(sin desc)'} | Cant: ${l.cantidad} | P.Unit: ${l.precio_unitario}€ | Dto: ${l.descuento_porcentaje || 0}% | Importe: ${l.importe_linea}€`
                ).join('\n')
                : '- No hay líneas registradas.'
            }

${contextBlock ? `
CONTEXTO DE AUDITORÍAS PREVIAS (OBLIGATORIO REVISARLO):
${contextBlock}

INSTRUCCIONES SOBRE EL HISTORIAL:
- Si algún hallazgo previo ya NO aparece como problema en los datos actuales, MENCIÓNALO EXPLÍCITAMENTE como error resuelto.
- NO repitas como nuevo incidente un hallazgo que ya está en el historial si los datos actuales muestran que fue corregido.
- Felicita el progreso cuando corresponda.
` : ''}

DESGLOSE DE IMPUESTOS EN BD:
${taxRows.length > 0
                ? taxRows.map((t: any) => `- ${t.tipo_impuesto} ${t.porcentaje}%: Base ${t.base_imponible}€ -> Cuota ${t.cuota}€`).join('\n')
                : '- No hay impuestos desglosados registrados.'
            }
        `;

        const request = {
            contents: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT + "\n\n" + promptData }] }
            ],
        };

        const TIMEOUT_MS = 45_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Vertex AI timeout: la llamada tardó más de 45 segundos.')), TIMEOUT_MS)
        );

        const result = await Promise.race([
            generativeModel.generateContent(request),
            timeoutPromise
        ]);
        const response = result.response;
        let text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Limpiar bloques de código Markdown
        if (text.includes('```')) {
            text = text.replace(/```json\n?|```/g, '').trim();
        }

        // Reparación de JSON truncado
        if (!text.endsWith('}')) {
            if (!text.includes(']')) text += ' ]';
            if (!text.endsWith('}')) text += ' }';
        }

        try {
            const parsed = JSON.parse(text);
            let incidents: Incident[] = parsed.incidents || [];

            // Normalizar nombres técnicos de impuestos a términos amigables para el usuario
            const normalizeTaxName = (str: string) =>
                str
                    .replace(/IVA_GENERAL/gi, 'IVA')
                    .replace(/IVA_REDUCIDO/gi, 'IVA reducido')
                    .replace(/IVA_SUPERREDUCIDO/gi, 'IVA superreducido')
                    .replace(/RE_EQUIVALENCIA|RECARGO_EQUIVALENCIA/gi, 'Recargo de Equivalencia')
                    .replace(/IRPF/gi, 'IRPF')
                    .replace(/_/g, ' ');

            incidents = incidents.map(inc => ({
                ...inc,
                descripcion: normalizeTaxName(inc.descripcion),
                sugerencia: normalizeTaxName(inc.sugerencia),
            }));

            // Guardar en BD de forma persistente como nuevo hito (incluyendo el contexto usado)
            if (incidents.length > 0) {
                await saveSuggestionsToDb(documentId, doc.id_de_empresa, incidents, nextAnalysisNro, contextBlock);
            }

            return {
                success: true,
                incidents: incidents,
                raw_response: text
            };
        } catch (parseError) {
            console.error('❌ Error parseando respuesta de IA:', parseError);
            return {
                success: false,
                incidents: [],
                error: 'Error de respuesta IA. Reinténtalo.',
                raw_response: text
            };
        }

    } catch (error: any) {
        console.error('❌ Error en Vertex AI:', error);
        return {
            success: false,
            incidents: [],
            error: error.message || 'Error en el servicio de diagnóstico'
        };
    }
}

/**
 * Guarda las sugerencias en la base de datos acumulándolas en el historial.
 */
async function saveSuggestionsToDb(docId: number, empresaId: number, incidents: Incident[], analisisNro: number = 1, contextText: string = '') {
    try {
        // Eliminar análisis anteriores del mismo documento antes de guardar el nuevo
        // (el historial ya va embebido en la columna 'historial' del nuevo registro)
        await db.query(
            `DELETE FROM erp49.ai_suggestions WHERE documento_id = ?`,
            [docId]
        );

        if (incidents.length > 0) {
            const values = incidents.map(i => [
                docId,
                empresaId,
                i.tipo,
                i.descripcion,
                i.severidad,
                i.sugerencia,
                analisisNro,
                contextText,
                true // include_in_context = true por defecto para el nuevo hallazgo
            ]);

            await db.query(
                `INSERT INTO erp49.ai_suggestions 
                (documento_id, empresa_id, tipo, descripcion, severidad, sugerencia, analisis_nro, historial, include_in_context) 
                VALUES ?`,
                [values]
            );
        }
        console.log(`✅ Nuevo hito de auditoría guardado (Analisis #${analisisNro}) para doc #${docId}`);
    } catch (error: any) {
        console.error('❌ ERROR CRÍTICO guardando sugerencias en BD:', error.message);
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            console.error('👉 TIP: Asegúrate de haber ejecutado todos los ALTER TABLE proporcionados.');
        }
    }
}

/**
 * Obtiene el historial completo de sugerencias de un documento.
 */
export async function getAuditHistory(docId: number): Promise<Incident[]> {
    try {
        const [rows] = await db.query<any[]>(
            'SELECT * FROM erp49.ai_suggestions WHERE documento_id = ? ORDER BY created_at DESC',
            [docId]
        );
        return rows;
    } catch (error) {
        console.error('❌ Error obteniendo historial de BD:', error);
        return [];
    }
}

/**
 * Activa o desactiva un hito del historial para ser incluido en el contexto de la IA.
 */
export async function toggleContextItem(id: number, include: boolean) {
    try {
        await db.query('UPDATE erp49.ai_suggestions SET include_in_context = ? WHERE id = ?', [include, id]);
        return { success: true };
    } catch (error) {
        console.error('❌ Error actualizando contexto:', error);
        return { success: false };
    }
}

/**
 * Borra una fila específica del historial.
 */
export async function deleteHistoryItem(id: number) {
    try {
        await db.query('DELETE FROM erp49.ai_suggestions WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        console.error('❌ Error eliminando hito del historial:', error);
        return { success: false };
    }
}

/**
 * Mantiene compatibilidad con la firma anterior para no romper otras partes del código.
 */
export async function getPersistentSuggestions(docId: number) {
    return getAuditHistory(docId);
}

/**
 * Borra todas las sugerencias de un documento.
 */
export async function clearSuggestions(docId: number) {
    try {
        await db.query('DELETE FROM erp49.ai_suggestions WHERE documento_id = ?', [docId]);
        console.log(`🗑️ Historial eliminado para doc #${docId}`);
    } catch (error) {
        console.error('❌ Error eliminando sugerencias de BD:', error);
    }
}
