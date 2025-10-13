import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, createCompany } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

// GET - Obtener empresassssss
export async function GET() {
  try {
    console.log('🏢 [API-COMPANIES] Iniciando GET...');
    
    // Verificar usuario
    const user = await getCurrentUser();
    console.log('👤 [API-COMPANIES] Usuario actual:', user?.id, user?.email);
    
    if (!user) {
      console.warn('⚠️ [API-COMPANIES] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    const companies = await getCompanies();
    
    console.log('✅ [API-COMPANIES] Empresas obtenidas:', companies.length);
    console.log('📋 [API-COMPANIES] Empresas:', companies);
    
    return NextResponse.json(companies);
    
  } catch (error) {
    console.error('❌ [API-COMPANIES] Error:', error);
    return NextResponse.json({ error: 'Error al obtener empresas' }, { status: 500 });
  }
}

// POST - Crear empresa
export async function POST(request: NextRequest) {
  try {
    console.log('🏢 [API-COMPANIES] Iniciando POST...');
    
    // Verificar usuario
    const user = await getCurrentUser();
    console.log('👤 [API-COMPANIES] Usuario actual:', user?.id, user?.email);
    
    if (!user) {
      console.warn('⚠️ [API-COMPANIES] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    // Obtener datos del body
    const body = await request.json();
    const { name, nombreFiscal, cif } = body;
    
    console.log('📝 [API-COMPANIES] Datos recibidos:', { name, nombreFiscal, cif });
    
    // Validaciones
    if (!name || !name.trim()) {
      console.warn('⚠️ [API-COMPANIES] Nombre vacío');
      return NextResponse.json(
        { error: 'El nombre de la empresa es obligatorio' },
        { status: 400 }
      );
    }
    
    if (!cif || !cif.trim()) {
      console.warn('⚠️ [API-COMPANIES] CIF vacío');
      return NextResponse.json(
        { error: 'El CIF es obligatorio' },
        { status: 400 }
      );
    }
    
    // Crear la empresa
    const newCompany = await createCompany({
      name: name.trim(),
      nombreFiscal: nombreFiscal?.trim() || null,
      cif: cif.trim()
    });
    
    console.log('✅ [API-COMPANIES] Empresa creada:', newCompany);
    
    return NextResponse.json({
      success: true,
      company: newCompany
    }, { status: 201 });
    
  } catch (error) {
    console.error('❌ [API-COMPANIES] Error al crear empresa:', error);
    
    // Si el error tiene un mensaje específico, usarlo
    const errorMessage = error instanceof Error ? error.message : 'Error al crear la empresa';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}