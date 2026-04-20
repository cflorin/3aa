// EPIC-001: Platform Foundation & Deployment
// STORY-007: Configure Cloud Scheduler for Nightly Batch Orchestration
// TASK-007-002: OIDC token verification for Cloud Scheduler endpoints

const SCHEDULER_SA = 'aaa-scheduler@aa-investor.iam.gserviceaccount.com';
const DEFAULT_AUDIENCE = 'https://aaa-web-717628686883.us-central1.run.app';
const TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';

interface TokenInfoPayload {
  aud: string;
  email: string;
  exp: string;
}

// Verifies that the request carries a valid Google OIDC token issued by the
// Cloud Scheduler service account. Uses Google's tokeninfo endpoint — no
// extra dependencies, acceptable latency for once-daily cron invocations.
//
// Skips verification outside production so local dev and integration tests
// can exercise cron endpoints without a real OIDC token.
export async function verifySchedulerToken(request: Request): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const token = authHeader.slice(7);

  const audience = process.env.SCHEDULER_AUDIENCE ?? DEFAULT_AUDIENCE;
  const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    throw new Error(`Token verification failed: tokeninfo returned ${res.status}`);
  }

  const payload = (await res.json()) as TokenInfoPayload;

  if (payload.aud !== audience) {
    throw new Error(`Token audience mismatch: expected ${audience}, got ${payload.aud}`);
  }
  if (payload.email !== SCHEDULER_SA) {
    throw new Error(`Unexpected service account: ${payload.email}`);
  }
}
