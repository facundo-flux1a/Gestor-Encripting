import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    console.log("TEST DB: Counting documents...");
    const count = await prisma.documentos.count();
    console.log("TEST DB: Count is", count);
    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error("TEST DB: Error", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
