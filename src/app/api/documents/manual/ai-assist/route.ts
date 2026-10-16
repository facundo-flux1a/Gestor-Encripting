import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { callAzureOpenAiChat } from '@/services/ingestion/azure-openai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      userMessage,
      history = [],
      currentDraft = {},
      company = {},
    } = body;

    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    const companyName = company.nombre || 'Mi Empresa';
    const companyCif = company.cif || '';

    const systemPrompt = `
Sos el Copiloto Inteligente de Carga Contable de Muvail (gestor empresarial y contable español).
Tu función es asistir al usuario para confeccionar o corregir un borrador de factura/ticket en tiempo real mediante una conversación fluida y natural.

EMPRESA ACTUAL EN EL GESTOR:
- Nombre: ${companyName}
- CIF: ${companyCif}

ESTADO ACTUAL DEL BORRADOR:
${JSON.stringify(currentDraft, null, 2)}

HISTORIAL DE MENSAJES PREVIOS:
${history.slice(-6).map((h: any) => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.content}`).join('\n')}

MENSAJE DEL USUARIO:
"${userMessage}"

INSTRUCCIONES CLAVE:
1. MANTENER DATOS PREVIOS (ESTADO ACUMULATIVO):
   - Nunca borres datos ya presentes en el borrador a menos que el usuario lo solicite expresamente (ej: "borrá las líneas", "cambiá el proveedor").
   - Si el usuario aporta nuevos datos (un concepto, un CIF, una fecha, etc.), combínalos con el borrador existente.
   - Si el usuario dice "Gaces", "Gasas", o nombres con posibles faltas ortográficas, RESPETA LITERALMENTE lo que el usuario escribió si parece intencional o un código/marca propio.

2. CÁLCULO DE IMPORTES Y CUENTAS CONTABLES (PGC ESPAÑOL):
   - Para cada línea en "lineas":
     * codigo: código o SKU del producto si fue especificado, sino ""
     * descripcion: texto exacto del artículo o servicio
     * cantidad (por defecto 1)
     * precioUnitario (número)
     * descuentoPorcentaje (0 si no aplica)
     * importeLinea = cantidad * precioUnitario * (1 - descuentoPorcentaje / 100)
     * cuentaContable: asignar cuenta contable según PGC español:
       - 600000: Compras de mercaderías, productos, materias primas
       - 628000: Suministros (electricidad, agua, combustible/diésel, gas)
       - 629000: Otros servicios (gastos generales, material de oficina, peajes, comidas)
       - 621000: Arrendamientos y alquileres
       - 623000: Servicios de profesionales independientes (abogados, asesorías)
       - 700000: Venta de mercaderías (si es FACTURA EMITIDA)
       - 705000: Prestación de servicios (si es FACTURA EMITIDA)
   - "baseImponible" = suma de los importeLinea de todas las líneas.
   - "impuestos": desglosar según el porcentaje indicado por el usuario (ej: 21, 10, 4, 0).
     * tipo: "IVA"
     * porcentaje: número (21, 10, 4, 0)
     * base = baseImponible atribuible a ese tipo
     * cuota = base * (porcentaje / 100)
     * cuentaContable: "472000" para facturas recibidas/tickets de gasto, o "477000" para facturas emitidas
   - "total" = baseImponible + suma(cuotas de impuestos)
   - "emisor.cuentaContable": "400000" para proveedores habituales, "410000" para acreedores por servicios
   - "receptor.cuentaContable": "430000" para clientes si es FACTURA EMITIDA

3. TONO DE RESPUESTA:
   - Amable, breve, profesional y directo en español.
   - Decile en 1 o 2 oraciones qué entendiste/actualizaste, y si falta algún dato clave (ej: número de factura, CIF del proveedor o fecha) preguntáselo amablemente.

FORMATO OBLIGATORIO DE RESPUESTA:
Devolvé ÚNICAMENTE un objeto JSON válido con esta estructura:
{
  "assistantMessage": "<Texto breve de respuesta y próxima pregunta guía>",
  "updatedDraft": {
    "tipoDocumento": "FACTURA RECIBIDA" | "FACTURA EMITIDA" | "TICKET" | "GASTO",
    "numeroDocumento": string,
    "fechaEmision": "YYYY-MM-DD",
    "fechaVencimiento": "YYYY-MM-DD" | null,
    "formaPago": string,
    "emisor": {
      "nombre": string,
      "cif": string,
      "direccion": string,
      "telefono": string,
      "email": string,
      "cuentaContable": string
    },
    "receptor": {
      "nombre": string,
      "cif": string,
      "direccion": string,
      "cuentaContable": string
    },
    "lineas": [
      {
        "codigo": string,
        "descripcion": string,
        "cantidad": number,
        "precioUnitario": number,
        "descuentoPorcentaje": number,
        "importeLinea": number,
        "cuentaContable": string
      }
    ],
    "impuestos": [
      {
        "tipo": "IVA",
        "porcentaje": number,
        "base": number,
        "cuota": number,
        "cuentaContable": string
      }
    ],
    "baseImponible": number,
    "totalImpuestos": number,
    "total": number
  }
}
`;

    const response = await callAzureOpenAiChat({
      prompt: systemPrompt,
      json: true,
      maxCompletionTokens: 2000,
    });

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(response.text);
    } catch {
      // Intentar extraer bloque JSON si viene envuelto en markdown
      const match = response.text.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      } else {
        throw new Error('Respuesta del modelo no estructurada');
      }
    }

    return NextResponse.json({
      success: true,
      assistantMessage: parsedResult.assistantMessage || 'He actualizado el borrador del documento.',
      updatedDraft: parsedResult.updatedDraft || currentDraft,
    });
  } catch (error) {
    console.error('❌ [API-MANUAL-AI-ASSIST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar la asistencia por IA',
      },
      { status: 500 }
    );
  }
}
