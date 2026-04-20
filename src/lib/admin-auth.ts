// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-001: Admin API key auth guard
// ADR-011: ADMIN_API_KEY gate enforced before any DB operation; empty string never valid

import { NextRequest } from 'next/server';

// Returns true only when the request carries an x-api-key header that exactly
// matches the ADMIN_API_KEY env var. Both empty-string header and empty-string
// env var are rejected — Secret Manager injection failure must surface as 401.
export function validateAdminApiKey(req: NextRequest): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return false;
  const provided = req.headers.get('x-api-key');
  if (!provided || provided.trim() === '') return false;
  return provided === apiKey;
}
