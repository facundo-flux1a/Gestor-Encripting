import { NextResponse } from 'next/server';
import { getSession, completeTutorialHealthCheck } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [rows] = await db.query<RowDataPacket[]>(
            'SELECT tutorial_health_check FROM usuarios WHERE id = ?',
            [session.userId]
        );

        return NextResponse.json({
            tutorial_health_check: rows[0]?.tutorial_health_check === 1
        });
    } catch (error) {
        console.error('Error in GET /api/user/tutorial-health-check:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const result = await completeTutorialHealthCheck();
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in POST /api/user/tutorial-health-check:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
