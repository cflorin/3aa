# RFC-001: Classification Engine Architecture

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** None
**Creates New Decisions:** YES
**Refines Existing:** NO

---

## Context / Problem

The 3AA framework requires every stock to be classified using a 3-part code: `[Bucket][Earnings Quality][Balance Sheet Quality]`. This classification determines which valuation metric and threshold grid applies, making it the foundation of the monitoring system.

Current state: No classification system exists.

Requirements:
- Rules-first, deterministic, transparent
- Judgment-final (user can override)
- Confidence-aware (system communicates certainty)
- Durable (history preserved for audit)
- Observable (reason codes explain suggestions)

---

## Goals

1. Design deterministic rules engine for 3AA code suggestion
2. Define scoring-based classification with tie-breaks and missing-data degradation
3. Establish clear interface contracts to downstream systems
4. Specify persistence for classification state and audit history
5. Define recomputation triggers and state transitions

---

## Non-Goals

1. Machine learning classification (explicitly rules-only per framework)
2. Define data sourcing (RFC-004: Data Ingestion)
3. Design UI for review (implementation detail)
4. Specify valuation logic (RFC-003)
5. Define alert generation (RFC-005)

---

## High-Level Architecture

```
Input: Stock Fundamentals + Flags
    ↓
┌─────────────────────────────────────┐
│   Bucket Scorer (1-8)               │
│   - Additive rule scoring           │
│   - Revenue/EPS growth matching     │
│   - Business stage indicators       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Earnings Quality Scorer (A/B/C)   │
│   - Moat/durability indicators      │
│   - FCF conversion, ROIC            │
│   - Margin stability                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Balance Sheet Scorer (A/B/C)      │
│   - Leverage ratios                 │
│   - Interest coverage               │
│   - Dilution risk                   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Tie-Break Resolver                │
│   - 3 vs 4, 4 vs 5, 5 vs 6, 6 vs 7  │
│   - Special case overrides          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Confidence Computer               │
│   - Score separation analysis       │
│   - Missing data penalty            │
└─────────────────────────────────────┘
    ↓
Output: suggested_code, confidence, reason_codes, scores
    ↓
┌─────────────────────────────────────┐
│   Persistence                       │
│   - classification_state            │
│   - classification_history          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   Manual Override Handler           │
│   - Preserve suggested_code         │
│   - Store final_code + reason       │
└─────────────────────────────────────┘
```

---

## Component Responsibilities

### Bucket Scorer
- **Input:** revenue_growth, eps_growth, profit maturity, business stage indicators
- **Output:** Score per bucket (1-8), reason codes
- **Logic:** Additive scoring based on range matching
- **Determinism:** Identical inputs → identical scores

### Earnings Quality Scorer
- **Input:** fcf_conversion, moat indicators, margin stability, roic
- **Output:** Score per grade (A/B/C), reason codes
- **Logic:** Additive scoring based on durability/cash generation

### Balance Sheet Scorer
- **Input:** net_debt_to_ebitda, interest_coverage, dilution, liquidity
- **Output:** Score per grade (A/B/C), reason codes
- **Logic:** Additive scoring based on leverage/coverage thresholds

### Tie-Break Resolver
- **Input:** Bucket scores, quality scores
- **Output:** Single winning bucket/grades, tie-break reason codes
- **Logic:** Framework-defined rules (3 vs 4: choose 4 only if exceptional quality)

### Confidence Computer
- **Input:** Score distributions, missing field counts, tie-break invocations
- **Output:** Confidence level (high/medium/low), confidence reasons
- **Logic:** Score separation + missing data penalty

### Manual Override Handler
- **Responsibility:** Accept final_code + override_reason from user
- **Guarantee:** Never overwrite suggested_code; store both

---

## Interface Contracts

### Classification Engine Interface

```typescript
interface ClassificationEngine {
  /**
   * Generate classification suggestion.
   * MUST be deterministic: same inputs → same outputs.
   */
  classifyStock(input: ClassificationInput): ClassificationResult;

  /**
   * Determine if recomputation needed based on input changes.
   */
  shouldRecompute(
    current: ClassificationInput,
    previous: ClassificationInput
  ): RecomputeDecision;
}

interface ClassificationInput {
  ticker: string;
  fundamentals: FundamentalFields;
  flags: ManualFlags;
}

interface FundamentalFields {
  // Growth
  revenue_growth_3y?: number;
  revenue_growth_fwd?: number;
  eps_growth_3y?: number;
  eps_growth_fwd?: number;
  gross_profit_growth?: number;

  // Profitability
  gross_margin?: number;
  operating_margin?: number;
  fcf_margin?: number;
  fcf_conversion?: number;
  roic?: number;
  net_income_positive?: boolean;
  fcf_positive?: boolean;

  // Balance Sheet
  net_debt_to_ebitda?: number;
  interest_coverage?: number;
  share_count_growth_3y?: number;
}

interface ManualFlags {
  holding_company_flag?: boolean;
  insurer_flag?: boolean;
  cyclicality_flag?: boolean;
  binary_flag?: boolean;
  pre_operating_leverage_flag?: boolean;
}

interface ClassificationResult {
  suggested_bucket: number | null;
  suggested_earnings_quality: 'A' | 'B' | 'C' | null;
  suggested_balance_sheet_quality: 'A' | 'B' | 'C' | null;
  suggested_code: string | null; // "4AA" or null
  confidence_level: 'high' | 'medium' | 'low';
  reason_codes: string[];
  scores: {
    bucket: Record<number, number>;
    earnings_quality: Record<string, number>;
    balance_sheet_quality: Record<string, number>;
  };
  metadata: {
    missing_field_count: number;
    tie_breaks_applied: string[];
    computation_timestamp: Date;
  };
}
```

### Downstream Contract (for Valuation Engine)

```typescript
interface ClassificationOutput {
  ticker: string;

  /**
   * Active code for valuation purposes.
   * GUARANTEE: final_code if exists, else suggested_code.
   * GUARANTEE: Never null if classification_status != 'classification_required'
   */
  active_code: string; // "4AA"

  /**
   * Confidence level (for UI badging).
   */
  confidence_level: 'high' | 'medium' | 'low';

  /**
   * Manual flags affecting metric selection.
   */
  flags: ManualFlags;

  /**
   * Last classification update timestamp.
   */
  last_updated: Date;
}
```

---

## Scoring Algorithm

### Bucket Scoring

Additive scoring per bucket based on rule matches:

```typescript
interface BucketRule {
  bucket: number;
  condition: (f: FundamentalFields) => boolean;
  score: number;
  reason_code: string;
}

// Example: Bucket 4 (Elite Compounder)
const BUCKET_4_RULES: BucketRule[] = [
  {
    bucket: 4,
    condition: (f) => (f.revenue_growth_fwd ?? 0) >= 8 && (f.revenue_growth_fwd ?? 0) <= 15,
    score: 3,
    reason_code: 'rev_growth_8_15_pct'
  },
  {
    bucket: 4,
    condition: (f) => (f.eps_growth_fwd ?? 0) >= 12 && (f.eps_growth_fwd ?? 0) <= 18,
    score: 3,
    reason_code: 'eps_growth_12_18_pct'
  },
  {
    bucket: 4,
    condition: (f) => (f.fcf_conversion ?? 0) > 0.80,
    score: 2,
    reason_code: 'high_fcf_conversion'
  }
];
```

**Open Question (requires ADR):** Exact score values per rule

### Tie-Break Resolution

```typescript
interface TieBreakRule {
  candidates: [number, number];
  resolver: (scores: Record<number, number>, input: ClassificationInput) => number;
  reason_code: string;
}

const BUCKET_TIE_BREAKS: TieBreakRule[] = [
  {
    candidates: [3, 4],
    resolver: (scores, input) => {
      // Choose 4 only if moat/FCF exceptional
      const exceptional =
        (input.fundamentals.fcf_conversion ?? 0) > 0.85 &&
        (input.fundamentals.roic ?? 0) > 0.20;
      return exceptional ? 4 : 3;
    },
    reason_code: 'bucket_3_vs_4_tiebreak'
  },
  {
    candidates: [4, 5],
    resolver: (scores, input) => {
      // Choose 4 if durable compounder; 5 if operating leverage dependent
      const operatingLeverageDependent =
        (input.fundamentals.operating_margin ?? 100) < 0.15;
      return operatingLeverageDependent ? 5 : 4;
    },
    reason_code: 'bucket_4_vs_5_tiebreak'
  }
];

// Special case overrides
function applySpecialCaseOverrides(
  winningBucket: number,
  input: ClassificationInput
): number {
  if (input.flags.binary_flag === true) {
    return 8; // Force Bucket 8
  }

  if ((input.flags.holding_company_flag || input.flags.insurer_flag) &&
      (winningBucket === 4 || winningBucket === 5)) {
    const stalwartProfile =
      (input.fundamentals.revenue_growth_fwd ?? 0) >= 3 &&
      (input.fundamentals.revenue_growth_fwd ?? 0) <= 8;
    if (stalwartProfile) return 3;
  }

  return winningBucket;
}
```

### Confidence Computation

```typescript
function computeConfidence(
  scores: ClassificationResult['scores'],
  metadata: {
    missing_field_count: number;
    tie_breaks_applied: string[];
  }
): 'high' | 'medium' | 'low' {
  const bucketScores = Object.values(scores.bucket).sort((a, b) => b - a);
  const bucketSeparation = bucketScores[0] - bucketScores[1];

  const earningsScores = Object.values(scores.earnings_quality).sort((a, b) => b - a);
  const earningsSeparation = earningsScores[0] - earningsScores[1];

  const balanceScores = Object.values(scores.balance_sheet_quality).sort((a, b) => b - a);
  const balanceSeparation = balanceScores[0] - balanceScores[1];

  // Thresholds (requires ADR-002)
  const CLEAR_WINNER_THRESHOLD = 3;
  const MISSING_DATA_LOW_THRESHOLD = 5;

  // Low confidence
  if (
    metadata.missing_field_count >= MISSING_DATA_LOW_THRESHOLD ||
    metadata.tie_breaks_applied.length > 1 ||
    (bucketSeparation < 2 && earningsSeparation < 2)
  ) {
    return 'low';
  }

  // High confidence
  if (
    metadata.missing_field_count === 0 &&
    bucketSeparation >= CLEAR_WINNER_THRESHOLD &&
    earningsSeparation >= CLEAR_WINNER_THRESHOLD &&
    balanceSeparation >= CLEAR_WINNER_THRESHOLD &&
    metadata.tie_breaks_applied.length === 0
  ) {
    return 'high';
  }

  return 'medium';
}
```

**Open Question (requires ADR-002):** Exact confidence threshold boundaries

---

## Missing Data Handling

**Strategy:** Conservative degradation

```typescript
function handleMissingData(
  input: FundamentalFields
): { degraded: boolean; count: number; reason_codes: string[] } {
  const CRITICAL_FIELDS = [
    'revenue_growth_fwd',
    'eps_growth_fwd',
    'fcf_conversion',
    'net_debt_to_ebitda'
  ];

  const missing = CRITICAL_FIELDS.filter(
    field => input[field] === undefined || input[field] === null
  );

  return {
    degraded: missing.length > 0,
    count: missing.length,
    reason_codes: missing.map(f => `missing_${f}`)
  };
}
```

If >5 critical fields missing: Return `suggested_code = null`, `confidence = 'low'`

---

## Persistence Schema (Multi-User)

**See RFC-002 and ADR-007 for full multi-user data model.**

Classification engine writes to **shared** `classification_state` table:

```sql
-- SHARED (System Suggestions) - Computed once, visible to all users
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  suggested_bucket INT,
  suggested_earnings_quality CHAR(1),
  suggested_balance_sheet_quality CHAR(1),
  suggested_code VARCHAR(5), -- System suggestion
  confidence_level VARCHAR(10),
  reason_codes JSONB,
  scores JSONB,
  updated_at TIMESTAMPTZ
  -- NOTE: No final_code here (moved to per-user table)
);

-- PER-USER (User Overrides) - Independent per user
CREATE TABLE user_classification_overrides (
  user_id UUID NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  final_bucket INT,
  final_earnings_quality CHAR(1),
  final_balance_sheet_quality CHAR(1),
  final_code VARCHAR(5), -- User's manual classification
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, ticker)
);

-- SHARED (Audit Trail)
CREATE TABLE classification_history (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10),
  old_suggested_code VARCHAR(5),
  new_suggested_code VARCHAR(5),
  change_reason VARCHAR(50),
  changed_at TIMESTAMPTZ,
  context_snapshot JSONB
  -- NOTE: Only tracks system suggestion changes (shared)
);
```

**Active Code Resolution (Per-User Query):**
```sql
-- Get active code for user (user override || system suggestion)
SELECT COALESCE(uco.final_code, cs.suggested_code) AS active_code
FROM classification_state cs
LEFT JOIN user_classification_overrides uco
  ON cs.ticker = uco.ticker AND uco.user_id = $1
WHERE cs.ticker = $2;
```

---

## Override Model (Multi-User)

**System Behavior:**
1. Classification engine computes `suggested_code` → writes to shared `classification_state`
2. All users see same system suggestion
3. Each user can independently override → writes to `user_classification_overrides` (per-user)

**User A's View:**
- System suggests: 4AA
- User A overrides to: 3AA
- Active code for User A: 3AA

**User B's View (same stock):**
- System suggests: 4AA
- User B accepts system suggestion (no override)
- Active code for User B: 4AA

**Recomputation:**
- Classification engine updates `classification_state.suggested_code`
- User overrides remain in `user_classification_overrides` (preserved)
- Users see new system suggestion but keep their override unless they remove it

**No Global State Transitions:**
- There is no single "accepted" or "overridden" state (per-user concept)
- Each user independently decides whether to override

---

## Recomputation Triggers

```typescript
interface RecomputeTrigger {
  field: keyof FundamentalFields;
  threshold: number; // absolute change
}

const TRIGGERS: RecomputeTrigger[] = [
  { field: 'revenue_growth_fwd', threshold: 5.0 }, // 5% absolute
  { field: 'eps_growth_fwd', threshold: 5.0 },
  { field: 'fcf_conversion', threshold: 10.0 }, // 10% absolute
  { field: 'net_debt_to_ebitda', threshold: 0.5 } // 0.5x absolute
];

function shouldRecompute(
  current: FundamentalFields,
  previous: FundamentalFields
): RecomputeDecision {
  const triggered = TRIGGERS.filter(t => {
    const curr = current[t.field];
    const prev = previous[t.field];
    if (curr === undefined || prev === undefined) return false;
    return Math.abs(curr - prev) >= t.threshold;
  });

  return {
    should_recompute: triggered.length > 0,
    reasons: triggered.map(t => `material_change_${t.field}`)
  };
}
```

**Open Question (requires ADR-003):** Exact recomputation trigger thresholds

**Scheduled Refresh:**
- Daily: If vendor data refreshed
- Weekly: Full universe regardless of changes

---

## Observability

### Metrics

```typescript
metrics.counter('classification.suggestion.generated', {
  ticker, suggested_bucket, confidence_level
});

metrics.counter('classification.low_confidence', { ticker });

metrics.histogram('classification.score_separation.bucket', {
  value: bucketScores[0] - bucketScores[1]
});

metrics.counter('classification.override.applied', {
  ticker, old_suggested_code, new_final_code
});

metrics.counter('classification.recompute.triggered', {
  ticker, reason
});
```

### Structured Logging

```typescript
logger.info('classification.suggestion', {
  ticker,
  suggested_code,
  confidence_level,
  reason_codes,
  scores,
  missing_field_count,
  computation_duration_ms
});

logger.warn('classification.low_confidence', {
  ticker,
  suggested_code,
  confidence_level: 'low',
  missing_fields: [...]
});
```

---

## Edge Cases

**1. All bucket scores tied**
- Resolution: Apply tie-break cascade
- Confidence: Degraded to 'low'
- Reason: `extreme_bucket_ambiguity`

**2. Binary flag on normal stock**
- Resolution: Force Bucket 8 (special case override)
- Confidence: 'low' unless binary nature unambiguous

**3. All quality scores zero**
- Resolution: Default to 'C' grade
- Confidence: 'low'
- Reason: `default_to_lowest_quality`

**4. Missing >5 critical fields**
- Resolution: `suggested_code = null`
- Confidence: 'low'
- State: `classification_required`

**5. Contradictory flags**
- Resolution: `binary_flag` takes precedence
- Confidence: Degraded to 'low'
- Reason: `contradictory_flags_detected`

---

## Alternatives Considered

### Alternative 1: Machine Learning Classifier
**Rejected:** Framework requires transparent, auditable rules. ML lacks reason codes.

### Alternative 2: Hard Rule Cascades (No Scoring)
**Rejected:** Fragile to boundaries (7.9% vs 8.1%). Scoring allows graceful degradation.

### Alternative 3: Store Only Final Code
**Rejected:** Framework explicitly requires preserving both suggested and final codes for monitoring.

---

## Open Questions

1. **Exact score values per rule** → Requires ADR-001
2. **Confidence threshold boundaries** → Requires ADR-002
3. **Missing data tolerance** → How many critical fields can be missing?
4. **Tie-break precedence** → If multiple tie-breaks apply, which order?
5. **Override expiration** → Should overrides expire if suggestion converges to final_code? (V2?)

---

## Required ADRs

1. **ADR-001: Classification Scoring Algorithm Weights**
2. **ADR-002: Confidence Threshold Boundaries**
3. **ADR-003: Recomputation Trigger Thresholds**
4. **ADR-004: Missing Data Handling Policy**
5. **ADR-005: Tie-Break Algorithm Precedence**
6. **ADR-006: Bucket/Quality Rule Set v1**

---

**END RFC-001**
