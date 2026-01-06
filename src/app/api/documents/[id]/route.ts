import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById, updateDocument, deleteDocument } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import { DocumentUpdateSchema } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET - Obtener documento por ID
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params; // ✅ AWAIT params
    
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error('❌ Error obteniendo documento:', error);
    return NextResponse.json({ error: 'Error al obtener documento' }, { status: 500 });
  }
}

// PUT - Actualizar documento
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params; // ✅ AWAIT params
    
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json();
    
    // Validar con Zod
    const validation = DocumentUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Datos inválidos', 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const result = await updateDocument(documentId, validation.data);
    
    if (!result.success) {
      return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error actualizando documento:', error);
    return NextResponse.json({ 
      error: error.message || 'Error al actualizar documento' 
    }, { status: 500 });
  }
}

// DELETE - Eliminar documento
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params; // ✅ AWAIT params
    
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const result = await deleteDocument(documentId);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Error al eliminar' 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error eliminando documento:', error);
    return NextResponse.json({ 
      error: 'Error al eliminar documento' 
    }, { status: 500 });
  }
}