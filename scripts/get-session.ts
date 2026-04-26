import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const users = await p.$queryRaw<{ email: string; user_id: string }[]>`
    SELECT email, user_id FROM users WHERE is_active=true LIMIT 3`;
  console.log('Users:', JSON.stringify(users));
  const sessions = await p.$queryRaw<{ session_id: string }[]>`
    SELECT session_id FROM user_sessions WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 3`;
  console.log('Sessions:', JSON.stringify(sessions));
  await p.$disconnect();
}
main();
