import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function GET(req: NextRequest) {
  const trustedCookie = req.cookies.get('trusted_device_2fa')?.value;

  if (!trustedCookie) {
    return NextResponse.json({ active: false });
  }

  try {
    const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
    const { payload } = await jwtVerify(trustedCookie, secretKey, {
      algorithms: ['HS256'],
    });

    if (payload.exp) {
      const remainingTimeMs = payload.exp * 1000 - Date.now();
      const remainingSeconds = Math.max(0, Math.floor(remainingTimeMs / 1000));
      return NextResponse.json({ active: true, remainingSeconds });
    }

    return NextResponse.json({ active: true, remainingSeconds: 0 });
  } catch (error) {
    return NextResponse.json({ active: false });
  }
}
