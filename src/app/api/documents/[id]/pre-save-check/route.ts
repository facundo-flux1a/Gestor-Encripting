import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { numero_documento, empresa_id, tipo_documento, cif, proveedor } = body;

    const issues: Array<{
      type: string;
      title: string;
      description: string;
      blocking?: boolean;
      suggestedActionLabel?: string;
      suggestedValue?: any;
      currentValue?: any;
    }> = [];

    // V6: Verificar número de documento duplicado dentro de la misma empresa respetando reglas de negocio
    if (numero_documento && empresa_id) {
      const cleanNumber = String(numero_documento).trim();
      const normNumber = cleanNumber.toLowerCase().replace(/\s+/g, '');
      const tipo = String(tipo_documento || '').toLowerCase();
      const isRecibida = tipo.includes('recibida') || tipo.includes('recibido');

      if (cleanNumber) {
        const [candidateDocs] = await db.query<RowDataPacket[]>(
          `SELECT 
              d.id, 
              d.numero_documento, 
              d.tipo_documento,
              e.identificador_fiscal_hash as proveedor_cif_hash,
              e.identificador_fiscal as proveedor_cif_raw,
              e.nombre_hash as proveedor_nombre_hash,
              e.nombre as proveedor_nombre_raw
           FROM documentos d
           LEFT JOIN entidades_documento e ON (d.id = e.documento_id AND e.rol IN ('proveedor', 'emisor'))
           WHERE d.id_de_empresa = ?
           AND d.id != ?
           AND d.numero_documento IS NOT NULL 
           AND d.numero_documento != ''`,
          [empresa_id, documentId]
        );

        const targetProveedorStr = String(cif || proveedor || '').trim().toLowerCase();

        const matchingDoc = candidateDocs.find(doc => {
          const docNum = String(doc.numero_documento || '').trim().toLowerCase().replace(/\s+/g, '');
          if (docNum !== normNumber) return false;

          const docTipo = String(doc.tipo_documento || '').toLowerCase();
          const docIsRecibida = docTipo.includes('recibida') || docTipo.includes('recibido');

          if (isRecibida || docIsRecibida) {
            const docCif = doc.proveedor_cif_hash || doc.proveedor_cif_raw;
            const docNombre = doc.proveedor_nombre_hash || doc.proveedor_nombre_raw;
            const docProvStr = String(docCif || docNombre || 'DESCONOCIDO').trim().toLowerCase();

            if (targetProveedorStr && docProvStr && targetProveedorStr !== 'desconocido' && docProvStr !== 'desconocido') {
              return targetProveedorStr === docProvStr;
            }
          }
          return true;
        });

        if (matchingDoc) {
          issues.push({
            type: 'DUPLICATE_NUMBER',
            title: 'Número de documento duplicado',
            description: `Ya existe otro documento con el número "${matchingDoc.numero_documento}" en esta empresa (ID de documento: ${matchingDoc.id}). Ten en cuenta que si guardas de todas formas, ambos documentos irán al Centro de Seguridad hasta que resuelvas la duplicidad.`,
            blocking: false,
            suggestedActionLabel: 'Guardar de todas formas',
            currentValue: matchingDoc.numero_documento,
          });
        }
      }
    }

    return NextResponse.json({ success: true, issues });
  } catch (error: any) {
    console.error('❌ [pre-save-check] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error en pre-save check' }, { status: 500 });
  }
}
