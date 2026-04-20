# EPIC-001: Platform Foundation & Deployment
# STORY-003: Provision Core GCP Infrastructure (initial)
# STORY-004: Implement Prisma Schema and Database Migrations
#
# Migrations run via the `migrator` stage (Cloud Run Job `aaa-migrate`) triggered from
# Cloud Build before each deployment. See cloudbuild.yaml run-migrations step.

FROM node:20-alpine AS base
# libc6-compat required for Prisma query engine binary on Alpine/musl
RUN apk add --no-cache libc6-compat

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Database migrator (Cloud Run Job — applies migrations then seeds framework data) ──
# Full node_modules required: Prisma CLI + ts-node (for db seed) absent in runner stage.
FROM base AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && chmod +x prisma/migrate-and-seed.sh
# STORY-005: runs migrate deploy then db seed; see prisma/migrate-and-seed.sh
CMD ["/bin/sh", "prisma/migrate-and-seed.sh"]

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Production runtime ────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone output (includes its own node_modules subset at runtime)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema needed by the query engine at runtime to resolve env("DATABASE_URL")
COPY --from=builder /app/prisma ./prisma

# Prisma generated client and engine (runtime deps, needed by @prisma/client)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 8080
ENV PORT 8080
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
