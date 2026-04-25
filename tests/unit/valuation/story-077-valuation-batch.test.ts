// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-077: Valuation Recompute Batch Job
// TASK-077-004: Unit tests — runValuationBatch()

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findMany: jest.fn() },
  },
}));

jest.mock('@/modules/valuation/valuation-persistence.service', () => ({
  persistValuationState: jest.fn(),
}));

import { prisma } from '@/infrastructure/database/prisma';
import { persistValuationState } from '@/modules/valuation/valuation-persistence.service';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';

const mockPersist = persistValuationState as jest.Mock;
const mockFindMany = prisma.stock.findMany as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('EPIC-005/STORY-077/TASK-077-001: runValuationBatch()', () => {
  it('processes all in-universe stocks and returns summary', async () => {
    mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }, { ticker: 'MSFT' }, { ticker: 'TSLA' }]);
    mockPersist
      .mockResolvedValueOnce({ ticker: 'AAPL', status: 'updated' })
      .mockResolvedValueOnce({ ticker: 'MSFT', status: 'skipped' })
      .mockResolvedValueOnce({ ticker: 'TSLA', status: 'updated' });

    const summary = await runValuationBatch();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { inUniverse: true },
      select: { ticker: true },
    });
    expect(summary.total).toBe(3);
    expect(summary.updated).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('tickerFilter restricts query to a single ticker', async () => {
    mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
    mockPersist.mockResolvedValue({ ticker: 'AAPL', status: 'updated' });

    const summary = await runValuationBatch({ tickerFilter: 'AAPL' });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { inUniverse: true, ticker: 'AAPL' },
      select: { ticker: true },
    });
    expect(summary.total).toBe(1);
    expect(summary.updated).toBe(1);
  });

  it('force=true is forwarded to persistValuationState', async () => {
    mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
    mockPersist.mockResolvedValue({ ticker: 'AAPL', status: 'updated' });

    await runValuationBatch({ force: true });

    expect(mockPersist).toHaveBeenCalledWith('AAPL', { force: true });
  });

  it('one ticker error is counted and does not abort batch', async () => {
    mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }, { ticker: 'BAD' }, { ticker: 'MSFT' }]);
    mockPersist
      .mockResolvedValueOnce({ ticker: 'AAPL', status: 'updated' })
      .mockRejectedValueOnce(new Error('no classification'))
      .mockResolvedValueOnce({ ticker: 'MSFT', status: 'updated' });

    const summary = await runValuationBatch();

    expect(summary.total).toBe(3);
    expect(summary.updated).toBe(2);
    expect(summary.errors).toBe(1);
    // Batch did not throw
  });

  it('status=error from persistValuationState counts as error', async () => {
    mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
    mockPersist.mockResolvedValue({ ticker: 'AAPL', status: 'error' });

    const summary = await runValuationBatch();

    expect(summary.errors).toBe(1);
    expect(summary.updated).toBe(0);
  });

  it('empty universe returns zero-count summary', async () => {
    mockFindMany.mockResolvedValue([]);

    const summary = await runValuationBatch();

    expect(summary.total).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toBe(0);
  });
});
