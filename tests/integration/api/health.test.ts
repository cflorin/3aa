// EPIC-001: Platform Foundation & Deployment
// STORY-008: Implement Next.js Application Foundation with Health Check
// TASK-008-004: Integration test for health endpoint against real test DB

import { GET } from '../../../src/app/api/health/route';

describe('EPIC-001/STORY-008/TASK-008-004: GET /api/health (integration)', () => {
  it('returns HTTP 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('reports status=healthy and db=connected against real test DB', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.db).toBe('connected');
  });
});
