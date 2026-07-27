import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { redis } from '@/lib/redis';

async function main() {
  const deleted = await redis.del('workers:dev:singleton-lock');
  console.log(deleted ? '✅ Lock de Redis liberado correctamente.' : '⚠️ No había lock activo (ya expiró solo).');
  await redis.quit();
}

main().catch(console.error);
