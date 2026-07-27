import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const empresa = await prisma.empresas.findUnique({
    where: { id: BigInt(120) }
  });

  if (!empresa) return NextResponse.json({ error: 'Not found' });

  return NextResponse.json({
    id: empresa.id.toString(),
    nombre_de_empresa: empresa.nombre_de_empresa,
    nombre_fiscal: empresa.nombre_fiscal,
    CIF: empresa.CIF,
  });
}
