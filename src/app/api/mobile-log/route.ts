import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log(`\x1b[36m📱 [MOBILE LOG]\x1b[0m ${body.message}`);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ success: false }, { status: 400 });
    }
}
