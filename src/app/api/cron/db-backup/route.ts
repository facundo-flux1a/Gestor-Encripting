import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { upstash } from '@/lib/upstash';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);
const BACKUP_STATE_KEY = 'db-backup:last-change-hash';

/**
 * GET /api/cron/db-backup
 * Comprueba si hubo cambios en BD y lanza backup-db.sh si procede.
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [rows] = await db.query<any[]>(`
      SELECT MD5(CONCAT_WS('|',
        COALESCE((SELECT MAX(fecha_creacion) FROM documentos), '0'),
        COALESCE((SELECT MAX(fecha_actualizacion) FROM trimestres), '0'),
        COALESCE((SELECT MAX(fecha_actualizacion) FROM incidencias_documento), '0'),
        COALESCE((SELECT COUNT(*) FROM documentos), 0)
      )) as change_hash
    `);

    const currentHash = rows[0]?.change_hash || 'unknown';
    const lastHash = await upstash.get<string>(BACKUP_STATE_KEY);

    if (lastHash === currentHash) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Sin cambios — no se crea copia de seguridad',
        changeHash: currentHash,
      });
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'backup-db.sh');

    try {
      const { stdout, stderr } = await execFileAsync('bash', [scriptPath], {
        timeout: 300_000,
        env: process.env,
      });
      await upstash.set(BACKUP_STATE_KEY, currentHash);

      return NextResponse.json({
        success: true,
        skipped: false,
        message: 'Backup ejecutado',
        changeHash: currentHash,
        output: stdout?.slice(-500),
        stderr: stderr?.slice(-200) || undefined,
      });
    } catch (execErr: any) {
      console.error('❌ [CRON db-backup] Error ejecutando script:', execErr);
      return NextResponse.json({
        success: false,
        error: 'No se pudo ejecutar backup-db.sh (¿mysqldump instalado?)',
        details: execErr.message,
        changeHash: currentHash,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ [CRON db-backup]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
