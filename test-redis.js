const { Redis } = require('ioredis');
const redis = new Redis('redis://default:nJzWJWhCpxNIFtMylbWzWbBfGgNefNch@metro.proxy.rlwy.net:32610');
async function run() {
  await redis.set('test_tpm', '67299');
  const tpm = parseInt(await redis.get('test_tpm') || '0', 10);
  console.log('tpm', tpm, tpm < 25500);
  await redis.del('test_tpm');
  process.exit(0);
}
run();
