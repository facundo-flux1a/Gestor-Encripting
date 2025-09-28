import { NextRequest, NextResponse } from 'next/server';
// ✅ Importamos la conexión desde tu db.ts
import connection from '@/lib/db'; 
import { getSession } from '@/services/auth-service';

async function getUserIdFromSession(req: NextRequest): Promise<number | null> {
    const session = await getSession(req.cookies.get('session')?.value);
    return session ? session.userId : null;
}

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