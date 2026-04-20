# TASK-010-001 — Install bcrypt + Create Admin API Key Auth Guard

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Install the `bcrypt` npm package (+ `@types/bcrypt` dev dependency) and create the reusable admin API key validation guard at `src/lib/admin-auth.ts`. This guard is called first in every admin endpoint before any database operation.

## Traceability
- ADR-011: ADMIN_API_KEY gate, bcrypt 10 rounds
- PRD §9A: Admin-only account provisioning, no self-service

## Implementation Steps

1. **Install bcrypt:**
   ```bash
   npm install bcrypt
   npm install --save-dev @types/bcrypt
   ```

2. **Create `src/lib/admin-auth.ts`:**
   ```typescript
   // EPIC-002: Authentication & User Management
   // STORY-010: Admin User Creation API
   // TASK-010-001: Admin API key auth guard
   // ADR-011: ADMIN_API_KEY gate enforced before any DB operation

   import { NextRequest } from 'next/server';

   export function validateAdminApiKey(req: NextRequest): boolean {
     const apiKey = process.env.ADMIN_API_KEY;
     if (!apiKey) return false;
     const provided = req.headers.get('x-api-key');
     if (!provided || provided.trim() === '') return false;
     return provided === apiKey;
   }
   ```

## Files Changed
- `package.json` — MODIFIED: bcrypt added to dependencies, @types/bcrypt to devDependencies
- `package-lock.json` — MODIFIED: lock file updated
- `src/lib/admin-auth.ts` — CREATED: `validateAdminApiKey(req: NextRequest): boolean`

## Acceptance Criteria
- [ ] `npm install bcrypt` completes without errors
- [ ] `src/lib/admin-auth.ts` exports `validateAdminApiKey`
- [ ] Returns `false` if `ADMIN_API_KEY` env var is undefined
- [ ] Returns `false` if `ADMIN_API_KEY` env var is empty string
- [ ] Returns `false` if `x-api-key` header is missing
- [ ] Returns `false` if `x-api-key` header is empty string
- [ ] Returns `false` if provided key does not match env var
- [ ] Returns `true` if provided key exactly matches env var

## Edge Cases
- `ADMIN_API_KEY` undefined (Secret Manager injection failure) → returns `false`, endpoint returns 401, not 500
- Empty string env var must never be treated as valid
- Whitespace-only header value treated as empty (trim check)

## Definition of Done
- [ ] bcrypt package installed and importable
- [ ] `src/lib/admin-auth.ts` created with traceability comments
- [ ] Ready to be imported by TASK-010-002 through TASK-010-004

---

**END TASK-010-001**
