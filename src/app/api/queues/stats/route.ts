import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { ingestionQueue, geminiQueue, dbWriterQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const [ingestionStats, geminiStats, dbWriterStats] = await Promise.all([
      ingestionQueue.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'),
      geminiQueue.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'),
      dbWriterQueue.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'),
    ]);

    const stats = {
      ingestion: ingestionStats,
      gemini: geminiStats,
      dbWriter: dbWriterStats,
      total: {
        waiting: ingestionStats.wait + geminiStats.wait + dbWriterStats.wait,
        active: ingestionStats.active + geminiStats.active + dbWriterStats.active,
        delayed: ingestionStats.delayed + geminiStats.delayed + dbWriterStats.delayed,
        failed: ingestionStats.failed + geminiStats.failed + dbWriterStats.failed,
        completed: ingestionStats.completed + geminiStats.completed + dbWriterStats.completed,
      }
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('[QueueStatsAPI] Error fetching queue stats:', error);
    return NextResponse.json({ error: 'Error fetching queue stats' }, { status: 500 });
  }
}
