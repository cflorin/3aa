import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const tables = await p.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  console.log(JSON.stringify(tables));
  await p.$disconnect();
}
main();
