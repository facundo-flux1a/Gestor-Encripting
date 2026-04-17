
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { getUserAIConfig } from '@/services/ai-service';
import { canMakeRequest, incrementDailyUsage } from '@/services/ai-limits-service';
import db from '@/lib/db';
import { normalizeProductDescription } from '@/lib/utils';

const PRODUCT_CLASSIFICATION_SYSTEM_PROMPT = `Eres un experto contable senior especializado en el Plan General Contable (PGC) de España.
Tu tarea es asignar la cuenta contable de 3 a 4 dígitos más adecuada para una lista de productos o servicios de facturas.

REGLAS DE CLASIFICACIÓN:
- GRUPO 6 (Compras/Gastos):
  - 600: Mercancías (compra de bienes para revender sin transformar).
  - 601: Materias primas.
  - 602: Otros aprovisionamientos (repuestos, embalajes, material de oficina materialmente relevante).
  - 623: Servicios de profesionales independientes (abogados, gestores, ingenieros).
  - 624: Transportes.
  - 627: Publicidad, propaganda y RR.PP.
  - 628: Suministros (Electricidad, Agua, Gas, Telefonía).
  - 629: Otros servicios (Material de oficina menor, limpieza, reparaciones pequeñas, peajes, parkings).
- GRUPO 7 (Ventas/Ingresos):
  - 700: Ventas de mercaderías.
  - 705: Prestación de servicios.

FORMATO DE SALIDA:
Debes responder exclusivamente con un objeto JSON que contenga un array "classifications":
{
  "classifications": [
    {
      "original_index": number,
      "cuenta_contable": "string (3-4 dígitos)",
      "justificacion": "string breve en español",
      "confianza": number (0-1)
    }
  ]
}

IMPORTANTE: 
- Si no estás seguro, usa la 629 para gastos generales o 705 para servicios generales.
- NO incluyas texto fuera del JSON.
`;

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { items } = await req.json(); // Array de { description: string, code?: string, index: number }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No hay items para clasificar' }, { status: 400 });
        }

        const userConfig = await getUserAIConfig();
        let apiKey: string | null = null;
        let usedOwnKey = false;

        if (userConfig?.use_own_key && userConfig.own_api_key && (userConfig.own_provider === 'openai' || !userConfig.own_provider)) {
            apiKey = userConfig.own_api_key;
            usedOwnKey = true;
        } else {
            const limitCheck = await canMakeRequest(user.id, 'openai');
            if (!limitCheck.allowed) {
                return NextResponse.json({ error: limitCheck.reason || 'Límite diario de OpenAI alcanzado' }, { status: 429 });
            }
            apiKey = process.env.AI_PRODUCT_CLASSIFIER_KEY || process.env.SHARED_OPENAI_KEY || null;
        }

        if (!apiKey) {
            console.error('❌ AI Config Error: No se encontró API key para OpenAI');
            return NextResponse.json({ error: 'Configuración de OpenAI no disponible en el servidor' }, { status: 500 });
        }

        const userPrompt = `Clasifica los siguientes productos:\n${items.map((it: any, i: number) => `${i}. [Desc: ${it.description}${it.code ? ` | Cod: ${it.code}` : ''}]`).join('\n')}`;

        try {
            console.log('🤖 Iniciando clasificación con OpenAI (gpt-4o-mini)...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: PRODUCT_CLASSIFICATION_SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('❌ OpenAI Error Data:', data);
                // Manejo específico de cuota excedida para mostrar mensaje claro al usuario
                if (data.error?.code === 'insufficient_quota') {
                    return NextResponse.json({
                        error: 'Cuota de OpenAI excedida. Por favor, verifica tu plan y facturación en la plataforma de OpenAI.'
                    }, { status: 429 });
                }
                throw new Error(data.error?.message || 'Error en OpenAI');
            }

            const classificationResult = {
                content: data.choices[0].message.content,
                tokens: data.usage.total_tokens
            };

            if (!usedOwnKey) {
                await incrementDailyUsage(user.id, 'openai', classificationResult.tokens);
            }

            // Limpiar y parsear JSON
            const cleanContent = classificationResult.content.trim().replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
            const parsed = JSON.parse(cleanContent);
            const classifications = parsed.classifications || [];

            // PERSISTENCIA: Guardar sugerencias en productos_config con is_ai_suggested = 1
            const empresaId = req.nextUrl.searchParams.get('empresaId') || items[0]?.empresaId;
            const proveedorCif = req.nextUrl.searchParams.get('proveedorCif') || items[0]?.proveedorCif;

            if (empresaId && classifications.length > 0) {
                console.log(`💾 Persistiendo ${classifications.length} sugerencias para empresa ${empresaId}...`);
                for (const cls of classifications) {
                    const originalItem = items[cls.original_index];
                    if (!originalItem) continue;

                    const rawPatron = originalItem.description;
                    const patron = normalizeProductDescription(rawPatron);
                    const cif = proveedorCif || originalItem.proveedorCif || null;

                    // Limpiar previa (por patrón exacto o normalizado) para evitar duplicados
                    await db.query(`
                        DELETE FROM productos_config 
                        WHERE id_de_empresa = ? 
                        AND (patron = ? OR patron = ?) 
                        AND (IFNULL(proveedor_cif, '') = IFNULL(?, ''))
                    `, [empresaId, rawPatron, patron, cif]);

                    await db.query(`
                        INSERT INTO productos_config (id_de_empresa, proveedor_cif, patron, cuenta_contable, is_ai_suggested, justification)
                        VALUES (?, ?, ?, ?, 1, ?)
                    `, [empresaId, cif, patron, cls.cuenta_contable, cls.justificacion]);
                }
            }

            return NextResponse.json({
                ...parsed,
                usage: classificationResult.tokens,
                provider: 'openai'
            });

        } catch (openaiError: any) {
            console.error('❌ Error fatal en clasificación OpenAI:', openaiError);
            throw openaiError;
        }
    } catch (error: any) {
        console.error('❌ Error en /api/productos/classify:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
