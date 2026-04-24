// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-006: Unit tests — resolveActiveCode (mocked Prisma)
// RFC-001 §User Override API; RFC-003 §Override Semantics; ADR-007

// Mocks must come before imports that use them
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userClassificationOverride: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../src/domain/classification/persistence', () => ({
  getClassificationState: jest.fn(),
}));

import { resolveActiveCode } from '../../../src/domain/classification/override';
import { prisma } from '@/infrastructure/database/prisma';
import { getClassificationState } from '../../../src/domain/classification/persistence';

const mockFindUnique = prisma.userClassificationOverride.findUnique as jest.Mock;
const mockGetState = getClassificationState as jest.Mock;

const USER_ID = 'user-uuid-001';
const TICKER = 'MSFT';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EPIC-004/STORY-045/TASK-045-006: resolveActiveCode', () => {

  describe('(a) Override present', () => {
    it('returns override code as active_code, source="override"', async () => {
      mockGetState.mockResolvedValue({ suggested_code: '3AA', confidence_level: 'low' });
      mockFindUnique.mockResolvedValue({ finalCode: '4AA', overrideReason: 'My own view is B4' });

      const result = await resolveActiveCode(USER_ID, TICKER);

      expect(result.active_code).toBe('4AA');
      expect(result.user_override_code).toBe('4AA');
      expect(result.system_suggested_code).toBe('3AA');
      expect(result.source).toBe('override');
      expect(result.override_scope).toBe('display_only');
    });

    it('override reason is returned', async () => {
      mockGetState.mockResolvedValue({ suggested_code: '3AA', confidence_level: 'low' });
      mockFindUnique.mockResolvedValue({ finalCode: '5BA', overrideReason: 'Margin expansion thesis confirmed' });

      const result = await resolveActiveCode(USER_ID, TICKER);
      expect(result.user_override_reason).toBe('Margin expansion thesis confirmed');
    });
  });

  describe('(b) No override, system code present', () => {
    it('returns system code as active_code, source="system"', async () => {
      mockGetState.mockResolvedValue({ suggested_code: '3AA', confidence_level: 'low' });
      mockFindUnique.mockResolvedValue(null);

      const result = await resolveActiveCode(USER_ID, TICKER);

      expect(result.active_code).toBe('3AA');
      expect(result.user_override_code).toBeNull();
      expect(result.system_suggested_code).toBe('3AA');
      expect(result.source).toBe('system');
    });
  });

  describe('(c) No override, no system code (null)', () => {
    it('returns active_code=null, source="none"', async () => {
      mockGetState.mockResolvedValue({ suggested_code: null, confidence_level: 'low' });
      mockFindUnique.mockResolvedValue(null);

      const result = await resolveActiveCode(USER_ID, TICKER);

      expect(result.active_code).toBeNull();
      expect(result.system_suggested_code).toBeNull();
      expect(result.user_override_code).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('(d) No classification state row at all', () => {
    it('returns active_code=null when no state exists and no override', async () => {
      mockGetState.mockResolvedValue(null);
      mockFindUnique.mockResolvedValue(null);

      const result = await resolveActiveCode(USER_ID, TICKER);

      expect(result.active_code).toBeNull();
      expect(result.system_confidence).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('(e) COALESCE order — override wins over system', () => {
    it('override code takes precedence even when system code is also set', async () => {
      mockGetState.mockResolvedValue({ suggested_code: '3AA', confidence_level: 'high' });
      mockFindUnique.mockResolvedValue({ finalCode: '5BA', overrideReason: 'Long term growth conviction' });

      const result = await resolveActiveCode(USER_ID, TICKER);

      expect(result.active_code).toBe('5BA');   // override wins
      expect(result.system_suggested_code).toBe('3AA'); // system still reported
      expect(result.source).toBe('override');
    });
  });
});
