import { prisma } from '../lib/prisma';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function run() {
  const acts = await prisma.actividad.findMany({
    orderBy: { created_at: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(acts, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
