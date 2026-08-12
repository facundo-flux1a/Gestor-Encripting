import { NextResponse } from 'next/server';
import { getSession, completeTutorialUploadQueue } from '@/services/auth-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let tutorialStatus = 1;
    try {
      const [dbUser] = await db.query<RowDataPacket[]>(
        'SELECT tutorial_upload_queue FROM usuarios WHERE id = ?',
        [session.userId]
      );
      if (dbUser && dbUser.length > 0 && dbUser[0]?.tutorial_upload_queue !== undefined) {
        tutorialStatus = Number(dbUser[0].tutorial_upload_queue);
      }
    } catch (e) {
      console.warn('⚠️ [GET /api/user/tutorial-upload-queue] Campo tutorial_upload_queue no hallado en DB aún, default a 1');
    }

    const shouldShow = tutorialStatus === 1;

    return NextResponse.json({
      shouldShow,
      tutorial: shouldShow,
      tutorialUploadQueue: tutorialStatus
    });

  } catch (error) {
    console.error('❌ [GET /api/user/tutorial-upload-queue] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await completeTutorialUploadQueue();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [POST /api/user/tutorial-upload-queue] Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
