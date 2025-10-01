import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db'; 
import { getSession } from '@/services/auth-service';

async function getUserIdFromSession(req: NextRequest): Promise<number | null> {
    const session = await getSession(req.cookies.get('session')?.value);
    return session ? session.userId : null;
}

// GET - Modificado para incluir nombre_fiscal y CIF
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [rows] = await connection.query(
      'SELECT id, nombre_de_empresa, nombre_fiscal, CIF FROM empresas WHERE id_de_usuario = ?',
      [userId]
    );

    const companies = rows as { 
      id: number, 
      nombre_de_empresa: string,
      nombre_fiscal: string | null,
      CIF: string
    }[];

    const formattedCompanies = companies.map(company => ({
      id: company.id,
      name: company.nombre_de_empresa,
      nombreFiscal: company.nombre_fiscal,
      cif: company.CIF
    }));

    console.log('[API-COMPANIES-GET] Empresas recuperadas:', formattedCompanies.length);

    return NextResponse.json(formattedCompanies);
  } catch (error) {
    console.error('[API-COMPANIES-GET] Error fetching companies:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - CIF obligatorio, nombreFiscal opcional
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, nombreFiscal, cif } = await req.json();

    console.log('[API-COMPANIES-POST] Datos recibidos del cliente:', {
      name: name?.trim(),
      nombreFiscal: nombreFiscal?.trim() || null,
      cif: cif?.trim(),
      userId
    });

    // Validar solo los campos obligatorios
    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'El nombre de la empresa es requerido' },
        { status: 400 }
      );
    }

    if (!cif?.trim()) {
      return NextResponse.json(
        { error: 'El CIF es requerido' },
        { status: 400 }
      );
    }

    console.log('[API-COMPANIES-POST] Insertando en base de datos...');

    const [result] = await connection.query(
      'INSERT INTO empresas (nombre_de_empresa, nombre_fiscal, CIF, id_de_usuario) VALUES (?, ?, ?, ?)',
      [name.trim(), nombreFiscal?.trim() || null, cif.trim(), userId]
    );

    const insertResult = result as { insertId: number };
    const newCompanyId = insertResult.insertId;

    console.log('[API-COMPANIES-POST] Empresa insertada con ID:', newCompanyId);

    const [rows] = await connection.query(
      'SELECT id, nombre_de_empresa, nombre_fiscal, CIF FROM empresas WHERE id = ?',
      [newCompanyId]
    );

    const newCompanyData = rows as { 
      id: number, 
      nombre_de_empresa: string,
      nombre_fiscal: string | null,
      CIF: string
    }[];
    
    if (newCompanyData.length === 0) {
      throw new Error('Error al recuperar la empresa creada');
    }

    const newCompany = {
      id: newCompanyData[0].id,
      name: newCompanyData[0].nombre_de_empresa,
      nombreFiscal: newCompanyData[0].nombre_fiscal,
      cif: newCompanyData[0].CIF
    };

    console.log('[API-COMPANIES-POST] Nueva empresa creada y recuperada:', newCompany);

    return NextResponse.json(newCompany, { status: 201 });

  } catch (error) {
    console.error('[API-COMPANIES-POST] Error creating company:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Duplicate entry')) {
        return NextResponse.json(
          { error: 'Ya existe una empresa con ese nombre' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Error interno del servidor al crear la empresa' },
      { status: 500 }
    );
  }
}