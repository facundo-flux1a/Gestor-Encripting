import { NextRequest, NextResponse } from 'next/server';
// ✅ Importamos la conexión desde tu db.ts
import connection from '@/lib/db'; 
import { getSession } from '@/services/auth-service';

async function getUserIdFromSession(req: NextRequest): Promise<number | null> {
    const session = await getSession(req.cookies.get('session')?.value);
    return session ? session.userId : null;
}

// GET - Tu código existente que ya funciona
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req);

    if (!userId) {
      // Retorna 401 si no hay sesión activa
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Usamos el 'connection' pool para ejecutar la consulta de forma segura
    const [rows] = await connection.query(
      'SELECT id, nombre_de_empresa FROM empresas WHERE id_de_usuario = ?',
      [userId]
    );

    // Hacemos el casting para asegurar el tipo de dato
    const companies = rows as { id: number, nombre_de_empresa: string }[];

    // Mapeamos y formateamos al formato que espera tu componente cliente
    const formattedCompanies = companies.map(company => ({
      id: company.id,
      name: company.nombre_de_empresa, // Mapea 'nombre_de_empresa' a 'name'
    }));

    return NextResponse.json(formattedCompanies);
  } catch (error) {
    console.error('[API-COMPANIES-GET] Error fetching companies:', error);
    // Retorna 500 en caso de un error en la base de datos o el servidor
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Método nuevo para crear empresas
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession(req);

    if (!userId) {
      // Retorna 401 si no hay sesión activa
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obtener datos del request
    const { name } = await req.json();

    // Validar que el nombre no esté vacío
    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'El nombre de la empresa es requerido' },
        { status: 400 }
      );
    }

    // Insertar la nueva empresa en la base de datos
    const [result] = await connection.query(
      'INSERT INTO empresas (nombre_de_empresa, id_de_usuario) VALUES (?, ?)',
      [name.trim(), userId]
    );

    // Obtener el ID de la empresa recién creada
    const insertResult = result as { insertId: number };
    const newCompanyId = insertResult.insertId;

    // Obtener la empresa completa para retornarla
    const [rows] = await connection.query(
      'SELECT id, nombre_de_empresa FROM empresas WHERE id = ?',
      [newCompanyId]
    );

    const newCompanyData = rows as { id: number, nombre_de_empresa: string }[];
    
    if (newCompanyData.length === 0) {
      throw new Error('Error al recuperar la empresa creada');
    }

    const newCompany = {
      id: newCompanyData[0].id,
      name: newCompanyData[0].nombre_de_empresa
    };

    console.log('[API-COMPANIES-POST] Nueva empresa creada:', newCompany);

    // Retornar la nueva empresa en el formato esperado por el cliente
    return NextResponse.json(newCompany, { status: 201 });

  } catch (error) {
    console.error('[API-COMPANIES-POST] Error creating company:', error);
    
    // Manejar errores específicos de base de datos
    if (error instanceof Error) {
      // Error de duplicado (si tienes constraint de nombre único)
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