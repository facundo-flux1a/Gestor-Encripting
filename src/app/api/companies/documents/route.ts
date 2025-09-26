// src/app/api/documents/route.ts

import { NextRequest, NextResponse } from 'next/server';
// 🛑 IMPORTANTE: Asegurate que este path sea correcto para llegar a tu archivo de servicios.
// Si tu archivo de servicios está en '@/lib/document-service', usá esa ruta.
import { getDocuments } from '@/lib/document-service'; 

export const dynamic = 'force-dynamic'; // Asegura que los datos sean siempre frescos.

/**
 * Maneja la solicitud GET para obtener documentos filtrados por ID de empresa.
 * Se llama desde el frontend con: /api/documents?companyId=X
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Obtener los parámetros de búsqueda (query parameters) de la URL
    const { searchParams } = new URL(req.url);
    const companyIdParam = searchParams.get('companyId'); 

    // 2. Validar y convertir el ID
    const empresaId = companyIdParam ? parseInt(companyIdParam, 10) : undefined;
    
    // Si el ID es inválido (por ejemplo, si no es un número), devolvemos vacío
    if (isNaN(empresaId as number)) {
        console.warn('[API-DOCUMENTOS] ID de empresa inválido o faltante.');
        return NextResponse.json([]); 
    }

    // 🛑 3. Llamar a tu función de servicio de documentos con el ID filtrado
    // Nota: Si empresaId es 0 o undefined, tu servicio getDocuments traerá TODOS los documentos (o lo que hayas programado).
    // Si querés que devuelva [] si no hay ID, tenés que manejarlo en el frontend o aquí:
    // const documents = empresaId ? await getDocuments(empresaId) : [];
    const documents = await getDocuments(empresaId);

    // 4. Devolver la respuesta al frontend
    return NextResponse.json(documents);
    
  } catch (error) {
    console.error('[API-DOCUMENTOS] Error fatal al obtener documentos:', error); 
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}