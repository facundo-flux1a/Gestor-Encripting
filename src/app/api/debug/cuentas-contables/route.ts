import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import {
  getDocumentsAccountingDebugList,
  approveDocumentSuggestionsBatch,
  updateSingleDocumentAccountItem
} from '@/services/cuentas-contables-debug-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyIdParams = searchParams.getAll('companyId');

    if (!companyIdParams || companyIdParams.length === 0) {
      return NextResponse.json({ success: true, documents: [], count: 0 });
    }

    const empresaIds = companyIdParams
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));

    if (empresaIds.length === 0) {
      return NextResponse.json({ success: true, documents: [], count: 0 });
    }

    const documents = await getDocumentsAccountingDebugList(empresaIds);

    return NextResponse.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error: any) {
    console.error('❌ [API-DEBUG-CUENTAS-CONTABLES] Error en GET:', error);
    return NextResponse.json({
      error: error?.message || 'Error interno al procesar cuentas contables'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'approve_batch') {
      const { documentIds } = body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return NextResponse.json({ error: 'Faltan IDs de documentos para aprobar' }, { status: 400 });
      }

      const result = await approveDocumentSuggestionsBatch(documentIds);
      return NextResponse.json(result);
    }

    if (action === 'update_item') {
      const { documentoId, tipo, referenciaId, cuentaContable, rememberRule, empresaId, identificadorFiscal, descripcionPatron } = body;
      if (!documentoId || !tipo || !cuentaContable) {
        return NextResponse.json({ error: 'Parámetros insuficientes para actualizar cuenta' }, { status: 400 });
      }

      const result = await updateSingleDocumentAccountItem({
        documentoId,
        tipo,
        referenciaId,
        cuentaContable,
        rememberRule,
        empresaId,
        identificadorFiscal,
        descripcionPatron
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ [API-DEBUG-CUENTAS-CONTABLES] Error en POST:', error);
    return NextResponse.json({
      error: error?.message || 'Error interno al actualizar cuentas contables'
    }, { status: 500 });
  }
}
