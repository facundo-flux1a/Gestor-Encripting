'use server';

import db from '@/lib/db';
import { getCurrentUser } from './user-service';
import { encrypt, decrypt } from '@/lib/encryption';
import { canMakeRequest, incrementDailyUsage } from './ai-limits-service'; // ✅ IMPORTAR

// ============================================
// PROMPT BASE (ADAPTADO DE MICROSERVICE)
// ============================================
const BASE_SYSTEM_PROMPT = `Eres un auditor contable y fiscal especializado en validación de documentos comerciales españoles. Tu tarea es analizar los datos de un documento y detectar inconsistencias, errores o campos faltantes.

IMPORTANTE: Debes devolver ÚNICAMENTE un objeto JSON válido. NO EXTRAS, NO COMENTARIOS, SOLO JSON VÁLIDO.

REGLAS DE VALIDACIÓN OBLIGATORIAS:

1. CAMPOS OBLIGATORIOS VACÍOS:
   - Proveedor/Emisor (nombre, CIF/NIF)
   - Número de documento
   - Fecha de emisión
   - Total del documento
   - Base imponible
   Si alguno está vacío o es "N/A", reportar como incidencia.

2. VALIDACIÓN DE CIF/NIF:
   - Formato español válido: letra + 8 dígitos
   - Letra de control correcta según algoritmo español
   - Si el formato es inválido, reportar como incidencia ALTA

3. CÁLCULOS MATEMÁTICOS:
   - Base imponible + IVA debe ser igual al Total (tolerancia ±0.01€)
   - La suma de todas las bases por tipo de IVA debe coincidir con la base total
   - Si hay retención: Total = Base + IVA - Retención
   - Si los cálculos no cuadran, reportar como incidencia ALTA

4. VALIDACIÓN DE FECHAS:
   - Fecha de emisión no puede ser futura (posterior a hoy)
   - Fecha de vencimiento debe ser igual o posterior a fecha de emisión
   - Formato de fecha debe ser válido (DD/MM/YYYY o YYYY-MM-DD)
   - Fechas inválidas o inconsistentes: incidencia MEDIA

5. TIPOS DE IVA VÁLIDOS EN ESPAÑA:
   - Solo se aceptan: 0%, 4%, 7%, 10%, 21%
   - Cualquier otro porcentaje: incidencia MEDIA
   - IVA aplicado sobre una base 0 o negativa: incidencia ALTA

6. IMPORTES SOSPECHOSOS:
   - Totales negativos: incidencia ALTA
   - Bases imponibles muy altas (>10,000€) con IVA 0%: incidencia MEDIA
   - Retenciones sin base imponible: incidencia MEDIA
   - Descuentos superiores al 100%: incidencia ALTA

7. FORMATO Y COHERENCIA:
   - Número de documento no puede estar vacío si es una factura
   - Observaciones con caracteres extraños o excesivamente largas (>500 chars): incidencia BAJA
   - Múltiples espacios, saltos de línea o caracteres de control: incidencia BAJA

NIVELES DE SEVERIDAD:
- ALTA: Errores críticos que impiden la contabilización (cálculos incorrectos, CIF inválido, totales negativos)
- MEDIA: Datos importantes faltantes o formatos incorrectos (fechas inconsistentes, IVA inválido, campos clave vacíos)
- BAJA: Datos opcionales faltantes, formatos menores (descripciones incompletas, espacios extra)

ESTRUCTURA DE SALIDA OBLIGATORIA:
{
  "incidents": [
    {
      "tipo": "Campo vacío" | "Cálculo incorrecto" | "Duplicado" | "Formato inválido" | "Fecha inconsistente" | "Importe sospechoso" | "IVA inválido" | "CIF inválido",
      "descripcion": "Descripción clara y específica del problema detectado",
      "severidad": "baja" | "media" | "alta"
    }
  ]
}

Si no encuentras ningún problema, devuelve: { "incidents": [] }

EJEMPLOS DE INCIDENCIAS:

Ejemplo 1 - Cálculo incorrecto:
{
  "incidents": [
    {
      "tipo": "Cálculo incorrecto",
      "descripcion": "Base imponible (1000.00€) + IVA (210.00€) = 1210.00€, pero el total declarado es 1250.00€. Diferencia: 40.00€",
      "severidad": "alta"
    }
  ]
}

Ejemplo 2 - CIF inválido:
{
  "incidents": [
    {
      "tipo": "CIF inválido",
      "descripcion": "El CIF 'B1234567X' no cumple con el formato español válido (letra + 8 dígitos)",
      "severidad": "alta"
    }
  ]
}

Ejemplo 3 - Múltiples incidencias:
{
  "incidents": [
    {
      "tipo": "Campo vacío",
      "descripcion": "El campo 'Proveedor' está vacío",
      "severidad": "media"
    },
    {
      "tipo": "Fecha inconsistente",
      "descripcion": "La fecha de vencimiento (2025-01-15) es anterior a la fecha de emisión (2025-02-01)",
      "severidad": "media"
    }
  ]
}

NO incluyas explicaciones fuera del JSON. NO agregues texto adicional. SOLO devuelve el objeto JSON.`;

// ============================================
// TIPOS
// ============================================

export interface UserAIConfig {
  use_own_key: boolean;
  own_provider: 'openai' | 'gemini' | null;
  own_api_key: string | null;
  custom_prompt: string | null;
  preferred_model: string;
  shared_provider: 'gemini' | 'openai';
}

export interface AnalysisResult {
  success: boolean;
  incidents: Array<{
    tipo: string;
    descripcion: string;
    severidad: 'baja' | 'media' | 'alta';
  }>;
  raw_response?: string;
  tokens_used?: number;
  used_own_key: boolean;
  provider: string;
  model: string;
  error?: string;
  usage_log_id?: number;
}

// ============================================
// CONFIG DE USUARIO
// ============================================

export async function getUserAIConfig(): Promise<UserAIConfig | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const [rows] = await db.query<any[]>(
      `SELECT * FROM erp49.ai_user_config WHERE user_id = ? LIMIT 1`,
      [user.id]
    );

    if (rows.length === 0) return null;

    const config = rows[0];

    // Desencriptar la API key si existe
    if (config.own_api_key_encrypted) {
      try {
        config.own_api_key = decrypt(config.own_api_key_encrypted);
      } catch (error) {
        console.error('❌ Error desencriptando API key:', error);
        config.own_api_key = null;
      }
    } else {
      config.own_api_key = null;
    }

    return config;
  } catch (error) {
    console.error('❌ Error obteniendo config:', error);
    return null;
  }
}

export async function saveUserAIConfig(config: {
  use_own_key: boolean;
  own_provider?: 'openai' | 'gemini';
  own_api_key?: string;
  custom_prompt?: string;
  preferred_model?: string;
  shared_provider?: 'gemini' | 'openai';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'No autorizado' };
    }

    // Encriptar la API key si existe
    let encryptedKey: string | null = null;
    if (config.own_api_key?.trim()) {
      try {
        encryptedKey = encrypt(config.own_api_key.trim());
      } catch (error) {
        console.error('❌ Error encriptando API key:', error);
        return { success: false, error: 'Error al encriptar la API key' };
      }
    }

    const existing = await getUserAIConfig();

    if (existing) {
      await db.query(
        `UPDATE erp49.ai_user_config 
         SET use_own_key = ?, own_provider = ?, own_api_key_encrypted = ?, 
             custom_prompt = ?, preferred_model = ?, shared_provider = ?
         WHERE user_id = ?`,
        [
          config.use_own_key,
          config.own_provider || null,
          encryptedKey,
          config.custom_prompt || null,
          config.preferred_model || 'gpt-4o-mini',
          config.shared_provider || 'gemini',
          user.id
        ]
      );
    } else {
      await db.query(
        `INSERT INTO erp49.ai_user_config 
         (user_id, use_own_key, own_provider, own_api_key_encrypted, custom_prompt, preferred_model, shared_provider)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          config.use_own_key,
          config.own_provider || null,
          encryptedKey,
          config.custom_prompt || null,
          config.preferred_model || 'gpt-4o-mini',
          config.shared_provider || 'gemini'
        ]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Error guardando config:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// LLAMADAS A IA
// ============================================

async function callOpenAI(
  apiKey: string,
  model: string,
  fullPrompt: string,
  documentData: string
): Promise<{ content: string; tokens: number }> {
  console.log(`🔍 [OPENAI] Llamando a modelo: ${model}`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: fullPrompt },
        { role: 'user', content: documentData }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('❌ [OPENAI] Error response:', errorData);
    throw new Error(errorData.error?.message || JSON.stringify(errorData));
  }

  const data = await response.json();
  console.log(`✅ [OPENAI] Respuesta OK, tokens: ${data.usage?.total_tokens || 0}`);

  return {
    content: data.choices[0].message.content,
    tokens: data.usage?.total_tokens || 0
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  fullPrompt: string,
  documentData: string
): Promise<{ content: string; tokens: number }> {
  const modelName = model.replace(/^models\//, '').replace(/-latest$/, '');

  console.log(`🔍 [GEMINI] Llamando a modelo: ${modelName}`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  console.log(`🔗 [GEMINI] URL:`, url);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: fullPrompt + '\n\nDOCUMENTO A ANALIZAR:\n' + documentData }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
      }
    }),
  });

  if (!response.ok) {
    let errorData;
    const responseText = await response.text();
    console.error('❌ [GEMINI] Error HTTP:', response.status, response.statusText);
    console.error('❌ [GEMINI] Response text:', responseText);

    try {
      errorData = JSON.parse(responseText);
    } catch (e) {
      errorData = { error: { message: `HTTP ${response.status}: ${responseText || 'Sin contenido'}` } };
    }

    console.error('❌ [GEMINI] Error response:', errorData);
    throw new Error(errorData.error?.message || JSON.stringify(errorData));
  }

  const data = await response.json();
  console.log(`✅ [GEMINI] Respuesta OK, tokens: ${data.usageMetadata?.totalTokenCount || 0}`);
  console.log('📄 [GEMINI] Contenido de respuesta:', JSON.stringify(data.candidates?.[0]?.content, null, 2));

  return {
    content: data.candidates[0].content.parts[0].text,
    tokens: data.usageMetadata?.totalTokenCount || 0
  };
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================

export async function analyzeDocumentWithAI(documentId: number): Promise<AnalysisResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        incidents: [],
        error: 'No autorizado',
        used_own_key: false,
        provider: '',
        model: ''
      };
    }

    // Obtener config del usuario
    const userConfig = await getUserAIConfig();

    let apiKey: string | null = null;
    let provider: 'openai' | 'gemini' = 'gemini';
    let model: string = 'gpt-4o-mini';
    let usedOwnKey = false;

    // ✅ DECIDIR QUÉ KEY USAR
    if (userConfig?.use_own_key && userConfig.own_api_key) {
      // Usar key propia del usuario
      apiKey = userConfig.own_api_key;
      provider = userConfig.own_provider || 'openai';
      model = userConfig.preferred_model || 'gpt-4o-mini';
      usedOwnKey = true;
      console.log('🔑 Usando API key propia del usuario');
    } else {
      // ✅ USAR KEY COMPARTIDA - VALIDAR LÍMITES CON ai-limits-service
      provider = userConfig?.shared_provider || 'gemini';

      // Verificar si puede hacer la request
      const limitCheck = await canMakeRequest(user.id, provider);

      if (!limitCheck.allowed) {
        // Intentar con el otro proveedor
        console.log(`⚠️ ${provider} límite alcanzado, intentando fallback...`);
        provider = provider === 'gemini' ? 'openai' : 'gemini';

        const fallbackCheck = await canMakeRequest(user.id, provider);

        if (!fallbackCheck.allowed) {
          return {
            success: false,
            incidents: [],
            error: limitCheck.reason || 'Límite diario de análisis alcanzado. Por favor, configura tu propia API key para continuar sin límites.',
            used_own_key: false,
            provider: '',
            model: ''
          };
        }
      }

      // Obtener la API key del proveedor seleccionado
      apiKey = provider === 'gemini'
        ? process.env.SHARED_GEMINI_KEY || null
        : process.env.SHARED_OPENAI_KEY || null;

      if (!apiKey) {
        return {
          success: false,
          incidents: [],
          error: 'API key compartida no configurada',
          used_own_key: false,
          provider: '',
          model: ''
        };
      }

      model = provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini';
      console.log(`🔑 Usando shared key: ${provider} (preferencia del usuario: ${userConfig?.shared_provider || 'gemini'})`);
    }

    // Obtener datos del documento
    const [rows] = await db.query<any[]>(
      `SELECT * FROM erp49.documentos WHERE id = ?`,
      [documentId]
    );

    if (rows.length === 0) {
      return {
        success: false,
        incidents: [],
        error: 'Documento no encontrado',
        used_own_key: usedOwnKey,
        provider,
        model
      };
    }

    const doc = rows[0];

    // Extraer datos del JSON si existe
    let datosExtra: any = {};
    try {
      datosExtra = doc.datos_extra ? JSON.parse(doc.datos_extra) : {};
    } catch (e) {
      datosExtra = doc.datos_extra || {};
    }

    // Extraer información del documento desde datos_extra
    const documentoInfo = datosExtra.DOCUMENTO || {};
    const clienteInfo = datosExtra.CLIENTE || {};
    const empresaEmisora = datosExtra.EMPRESA_EMISORA || {};
    const metadatos = datosExtra.METADATOS || {};
    const totalesPorImpuesto = datosExtra.TOTALES_POR_IMPUESTO || [];

    // Calcular IVA total
    const ivaTotal = totalesPorImpuesto.reduce((sum: number, item: any) =>
      sum + (parseFloat(item.CUOTA_IVA || 0)), 0
    );

    // Preparar datos del documento
    const documentData = `
DATOS DEL DOCUMENTO:
- ID: ${doc.id}
- Tipo: ${doc.tipo_documento || 'N/A'}
- Número: ${doc.numero_documento || documentoInfo.NUMERO_DOCUMENTO || 'N/A'}
- Fecha Emisión: ${doc.fecha_emision || documentoInfo.FECHA_EMISION || 'N/A'}
- Fecha Vencimiento: ${doc.fecha_vencimiento || documentoInfo.FECHA_VENCIMIENTO || 'N/A'}

PROVEEDOR/EMISOR:
- Nombre: ${empresaEmisora.NOMBRE || metadatos.REMITENTE || 'N/A'}
- CIF/NIF: ${empresaEmisora.CIF || clienteInfo.CIF || 'N/A'}
- Dirección: ${empresaEmisora.DIRECCION || 'N/A'}

CLIENTE/DESTINATARIO:
- Nombre: ${clienteInfo.NOMBRE || metadatos.DESTINATARIO || 'N/A'}
- CIF/NIF: ${clienteInfo.CIF || 'N/A'}

IMPORTES:
- Base Imponible: ${doc.importe_sin_impuestos || documentoInfo.IMPORTE_SIN_IVA || 0}€
- IVA: ${ivaTotal || 0}€
- Total: ${doc.importe_total || documentoInfo.IMPORTE_TOTAL || 0}€
- Moneda: ${doc.moneda || 'EUR'}

DESGLOSE POR IVA:
${totalesPorImpuesto.map((item: any) =>
      `- Base: ${item.BASE_IMPONIBLE}€ | IVA ${item.PORCENTAJE}%: ${item.CUOTA_IVA}€ | Total: ${item.TOTAL_CON_IVA}€`
    ).join('\n') || '- Sin desglose disponible'}

OBSERVACIONES: ${doc.observaciones || 'N/A'}

INFORMACIÓN ADICIONAL:
${metadatos.ESTADO ? `- Estado: ${metadatos.ESTADO}` : ''}
${metadatos.PERIODO_FISCAL ? `- Período Fiscal: ${metadatos.PERIODO_FISCAL}` : ''}
${metadatos.NUMERO_REFERENCIA ? `- Referencia: ${metadatos.NUMERO_REFERENCIA}` : ''}

FECHA ACTUAL: ${new Date().toISOString().split('T')[0]}
`.trim();

    // Construir prompt completo
    let fullPrompt = BASE_SYSTEM_PROMPT;

    if (userConfig?.custom_prompt?.trim()) {
      fullPrompt += `\n\n--- INSTRUCCIONES ADICIONALES DEL USUARIO ---\n${userConfig.custom_prompt.trim()}\n`;
    }

    // Llamar a la IA
    let result: { content: string; tokens: number };

    if (provider === 'openai') {
      result = await callOpenAI(apiKey, model, fullPrompt, documentData);
    } else {
      result = await callGemini(apiKey, model, fullPrompt, documentData);
    }

    // ✅ Incrementar uso SOLO si usó key compartida y análisis exitoso
    if (!usedOwnKey) {
      await incrementDailyUsage(user.id, provider, result.tokens);
      console.log(`📊 Uso incrementado: ${provider} | ${result.tokens} tokens`);
    }

    // Parsear respuesta
    let parsed;
    try {
      console.log('📄 [ANALYZE] Raw response (primeros 500 chars):', result.content.substring(0, 500));

      // Limpiar markdown code fences
      let cleanContent = result.content.trim();
      cleanContent = cleanContent.replace(/^```json\s*/i, '');
      cleanContent = cleanContent.replace(/\s*```\s*$/, '');
      cleanContent = cleanContent.trim();

      console.log('🧹 [ANALYZE] Contenido limpio (primeros 500 chars):', cleanContent.substring(0, 500));

      parsed = JSON.parse(cleanContent);
    } catch (parseError: any) {
      console.error('❌ [ANALYZE] Error parseando JSON:', parseError.message);
      console.error('📄 [ANALYZE] Contenido completo de respuesta:', result.content);
      throw new Error(`Error parseando respuesta de IA: ${parseError.message}`);
    }

    const incidents = parsed.incidents || [];

    // Guardar log de uso
    const [logResult] = await db.query<any>(
      `INSERT INTO erp49.ai_usage_log 
       (user_id, document_id, provider, model, used_own_key, tokens_used, incidents_found)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, documentId, provider, model, usedOwnKey, result.tokens, incidents.length]
    );

    const usageLogId = logResult.insertId;
    console.log(`✅ Análisis completado: ${incidents.length} incidencias | ${result.tokens} tokens | ${provider} | log_id: ${usageLogId}`);

    return {
      success: true,
      incidents,
      raw_response: result.content,
      tokens_used: result.tokens,
      used_own_key: usedOwnKey,
      provider,
      model,
      usage_log_id: usageLogId,
    };

  } catch (error: any) {
    console.error('❌ Error en analyzeDocumentWithAI:', error);
    return {
      success: false,
      incidents: [],
      error: error.message || 'Error desconocido al analizar el documento',
      used_own_key: false,
      provider: '',
      model: ''
    };
  }
}