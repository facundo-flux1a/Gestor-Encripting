import { NextRequest, NextResponse } from 'next/server';
import { createCompany } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

// GET - Obtener empresas (CON mail_de_carga)
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

    // ✅ QUERY DIRECTA: Asegurar que traiga TODOS los campos incluido mail_de_carga
    const [companies] = await db.query<RowDataPacket[]>(
      `SELECT 
        id,
        nombre_de_empresa as name,
        nombre_fiscal,
        CIF,
        mail_de_carga,
        recargo
      FROM empresas 
      WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))
      ORDER BY nombre_de_empresa ASC`,
      [user.id]
    );

    const formattedCompanies = companies.map((c: any) => ({
      ...c,
      recargo: !!c.recargo
    }));

    console.log('✅ [API-COMPANIES] Empresas obtenidas:', formattedCompanies.length);
    console.log('📋 [API-COMPANIES] Empresas con mail_de_carga:',
      formattedCompanies.map((c: any) => ({ id: c.id, name: c.name, mail: c.mail_de_carga, recargo: c.recargo }))
    );

    return NextResponse.json(formattedCompanies);

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
    const { name, nombreFiscal, cif, mailDeCarga, recargo } = body;

    console.log('📝 [API-COMPANIES] Datos recibidos:', { name, nombreFiscal, cif, mailDeCarga, recargo });

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

    // Crear la empresa con mail_de_carga opcional
    const newCompany = await createCompany({
      name: name.trim(),
      nombreFiscal: nombreFiscal?.trim() || null,
      cif: cif.trim(),
      mailDeCarga: mailDeCarga?.trim() || null,
      recargo: !!recargo
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