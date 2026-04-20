// EPIC-001: Platform Foundation & Deployment
// STORY-008: Implement Next.js Application Foundation with Health Check
// TASK-008-003: Unit tests for health endpoint with mocked Prisma

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

import { GET } from '../../../src/app/api/health/route';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockQueryRaw = prisma.$queryRaw as jest.Mock;

describe('EPIC-001/STORY-008/TASK-008-003: GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns HTTP 200 with status=healthy when DB query succeeds', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  it('returns HTTP 200 with status=degraded when DB throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('degraded');
  });

  it('includes db=connected when healthy', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const body = await (await GET()).json();
    expect(body.db).toBe('connected');
  });

  it('includes db=disconnected and error field when DB throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const body = await (await GET()).json();
    expect(body.db).toBe('disconnected');
    expect(body.error).toBe('ECONNREFUSED');
  });

  it('always includes timestamp and service fields', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const body = await (await GET()).json();
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(body.service).toBe('3aa-web');
  });
});
