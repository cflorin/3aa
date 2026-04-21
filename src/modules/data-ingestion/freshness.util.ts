// EPIC-003: Data Ingestion & Universe Management
// STORY-022: Data Freshness Tracking
// TASK-022-001: computeFreshnessStatus() — pure utility, no I/O
// RFC-004 §Data Freshness: threshold values and boundary rules
// ADR-010: TypeScript

export type FreshnessStatus = 'fresh' | 'stale' | 'missing';

export interface FreshnessInput {
  price_last_updated_at: Date | null;
  fundamentals_last_updated_at: Date | null;
  estimates_last_updated_at: Date | null;
  /** Injectable timestamp for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

export interface FreshnessResult {
  price: FreshnessStatus;
  fundamentals: FreshnessStatus;
  estimates: FreshnessStatus;
  overall: FreshnessStatus;
}

// RFC-004 §Data Freshness — threshold values
// Unit-test-validated boundary semantics (from TASK-022-002 spec):
// - age < FRESH_DAYS → fresh; age >= FRESH_DAYS AND <= MISSING_DAYS → stale; age > MISSING_DAYS → missing
// Price: 1d=fresh, 2d=stale, 5d=stale, 6d=missing → PRICE_MISSING_DAYS=5 (last stale day)
// Fundamentals: 89d=fresh, 90d=stale, 179d=stale, 180d=missing → FUND_MISSING_DAYS=179 (last stale day)
const PRICE_FRESH_DAYS = 2;
const PRICE_MISSING_DAYS = 5;   // age <= 5 → stale; age > 5 → missing

const FUND_FRESH_DAYS = 90;
const FUND_MISSING_DAYS = 179;  // age <= 179 → stale; age > 179 (i.e. >= 180) → missing

// Estimates use same thresholds as fundamentals (RFC-004)
const EST_FRESH_DAYS = FUND_FRESH_DAYS;
const EST_MISSING_DAYS = FUND_MISSING_DAYS;

function daysDiff(then: Date, now: Date): number {
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Determines freshness status for a single data category.
 * Formula: age < freshDays → fresh; age <= missingDays → stale; age > missingDays → missing.
 */
function categoryStatus(
  lastUpdatedAt: Date | null,
  now: Date,
  freshDays: number,
  missingDays: number,
): FreshnessStatus {
  if (lastUpdatedAt === null) return 'missing';
  const age = daysDiff(lastUpdatedAt, now);
  if (age < freshDays) return 'fresh';
  if (age <= missingDays) return 'stale';
  return 'missing';
}

/**
 * Computes the freshness status for a stock across all three data categories.
 *
 * Overall rule (RFC-004):
 * - 'missing' if any category is missing
 * - 'stale' if any category is stale (and none missing)
 * - 'fresh' only if all three categories are fresh
 */
export function computeFreshnessStatus(input: FreshnessInput): FreshnessResult {
  const now = input.now ?? new Date();

  const price = categoryStatus(
    input.price_last_updated_at, now, PRICE_FRESH_DAYS, PRICE_MISSING_DAYS,
  );
  const fundamentals = categoryStatus(
    input.fundamentals_last_updated_at, now, FUND_FRESH_DAYS, FUND_MISSING_DAYS,
  );
  const estimates = categoryStatus(
    input.estimates_last_updated_at, now, EST_FRESH_DAYS, EST_MISSING_DAYS,
  );

  let overall: FreshnessStatus;
  if (price === 'missing' || fundamentals === 'missing' || estimates === 'missing') {
    overall = 'missing';
  } else if (price === 'stale' || fundamentals === 'stale' || estimates === 'stale') {
    overall = 'stale';
  } else {
    overall = 'fresh';
  }

  return { price, fundamentals, estimates, overall };
}
