// EPIC-001/STORY-004/TASK-004-008
// serverExternalPackages: prevents Next.js from bundling Prisma at build time.
// Without this, webpack inlines process.env.DATABASE_URL as undefined (build-time env),
// breaking runtime secret injection (Cloud Run Secret Manager).
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
};

module.exports = nextConfig;
