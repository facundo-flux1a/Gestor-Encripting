import 'dotenv/config';
import { ingestionQueue, geminiQueue, dbWriterQueue } from '../lib/queue';

async function checkFailed() {
  console.log('Checking failed jobs...');
  
  for (const queue of [ingestionQueue, geminiQueue, dbWriterQueue]) {
    const failed = await queue.getFailed();
    console.log(`\n=== Queue: ${queue.name} (${failed.length} failed) ===`);
    
    for (const job of failed.slice(0, 5)) {
      console.log(`Job ID: ${job.id}`);
      console.log(`Job Name: ${job.name}`);
      console.log(`Failed Reason: ${job.failedReason}`);
      console.log(`Stacktrace: ${job.stacktrace?.[0]?.substring(0, 500)}`);
      console.log('---');
    }
  }
  
  process.exit(0);
}

checkFailed();
