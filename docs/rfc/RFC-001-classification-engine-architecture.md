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
  flags: ClassificationFlags;
  enrichment?: ClassificationEnrichmentScores;  // E1–E6 qualitative scores (EPIC-003.1)
  trend_metrics?: ClassificationTrendMetrics;   // Quarterly-history-derived trend fields (RFC-008)
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

/**
 * ClassificationFlags — populated by EPIC-003 (deterministic) and EPIC-003.1 (LLM-enriched).
 * Manual override always takes precedence; stored separately in data_provider_provenance.
 *
 * Sourcing tiers:
 *   deterministic_computed:   share_count_growth_3y → material_dilution_flag
 *   deterministic_heuristic:  insurer_flag (SIC/industry), pre_operating_leverage_flag (revenue)
 *   hybrid (heuristic + LLM): holding_company_flag, cyclicality_flag, binary_flag
 *   manual_override:          any flag; stored with provider="manual" in provenance
 */
interface ClassificationFlags {
  holding_company_flag?: boolean;       // LLM-enriched (heuristic pre-filter)
  insurer_flag?: boolean;               // deterministic: SIC 6311–6399 or industry string
  cyclicality_flag?: boolean;           // sector heuristic + LLM for ambiguous sectors
  binary_flag?: boolean;               // heuristic (pre-revenue biotech) + LLM
  pre_operating_leverage_flag?: boolean; // deterministic: revenue_ttm < $50M threshold
  material_dilution_flag?: boolean;     // deterministic: share_count_growth_3y > 0.05
}

/**
 * ClassificationEnrichmentScores — qualitative 1–5 scores from EPIC-003.1 LLM enrichment.
 * Half-integer precision (1.0, 1.5, 2.0 … 5.0). Null if confidence < 0.60 at enrichment time.
 * Optional in ClassificationInput: engine degrades gracefully when scores absent.
 */
interface ClassificationEnrichmentScores {
  moat_strength_score?: number;           // 1=no moat, 5=very wide moat
  pricing_power_score?: number;           // 1=price-taker, 5=strong pricing power
  revenue_recurrence_score?: number;      // 1=transactional, 5=fully recurring
  margin_durability_score?: number;       // 1=commodity pressure, 5=structurally protected
  capital_intensity_score?: number;       // 1=asset-light, 5=heavy capex
  qualitative_cyclicality_score?: number; // 1=counter-cyclical, 5=highly cyclical
}

/**
 * ClassificationTrendMetrics — quarterly-history-derived trend/trajectory fields from RFC-008.
 * Populated via stock_derived_metrics JOIN in toClassificationInput() after EPIC-003 quarterly
 * history stories are complete. All fields are optional — scorers degrade gracefully when absent.
 * When quarters_available < 4, all numeric trend fields will be null.
 */
interface ClassificationTrendMetrics {
  // Availability indicator
  quarters_available?: number;

  // TTM from quarterly history (preferred over provider snapshot when present)
  revenue_ttm_qhist?: number;
  operating_income_ttm_qhist?: number;
  net_income_ttm_qhist?: number;
  free_cash_flow_ttm_qhist?: number;
  cfo_to_net_income_ratio_ttm?: number;

  // Margin trajectory (numeric slopes in pp over window)
  operating_margin_trend_4q?: number;
  operating_margin_trend_8q?: number;
  gross_margin_trend_4q?: number;
  fcf_margin_trend_4q?: number;
  fcf_margin_trend_8q?: number;
  cfo_margin_trend_4q?: number;

  // Margin stability (0.0–1.0; 1.0 = perfectly stable)
  gross_margin_stability_score?: number;
  operating_margin_stability_score?: number;
  fcf_margin_stability_score?: number;
  cfo_to_net_income_stability_score?: number;

  // Operating leverage
  operating_leverage_ratio_4q?: number;
  operating_leverage_ratio_8q?: number;
  gross_profit_drop_through_4q?: number;
  operating_leverage_emerging_flag?: boolean;
  operating_margin_expansion_flag?: boolean;
  operating_income_acceleration_flag?: boolean;

  // Earnings quality trend
  fcf_conversion_trend_4q?: number;
  fcf_conversion_trend_8q?: number;
  earnings_quality_trend_score?: number;    // −1.0 to +1.0
  cash_earnings_support_flag?: boolean;
  deteriorating_cash_conversion_flag?: boolean;

  // Dilution and SBC
  diluted_share_growth_1y?: number;
  diluted_share_growth_3y?: number;
  sbc_burden_score?: number;
  material_dilution_trend_flag?: boolean;

  // Capital intensity
  capex_intensity_trend_4q?: number;
  reinvestment_burden_signal?: boolean;
  maintenance_capital_burden_proxy?: number;
}

/** @deprecated Use ClassificationFlags instead */
type ManualFlags = ClassificationFlags;

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
   * Classification flags (auto-detected and/or manual override).
   */
  flags: ClassificationFlags;

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

## Amendment — 2026-04-21: Classification Flags Sourcing (EPIC-003 / EPIC-003.1)

**Change:** `ManualFlags` renamed to `ClassificationFlags` with explicit sourcing tiers.
`ClassificationEnrichmentScores` interface added for E1–E6 qualitative scores.

**Sourcing tiers:**

| Flag / Field | Source tier | EPIC |
|---|---|---|
| `share_count_growth_3y` | vendor_native (FMP historical shares) | EPIC-003 STORY-032 |
| `material_dilution_flag` | deterministic_computed (> 0.05 threshold) | EPIC-003 STORY-033 |
| `insurer_flag` | deterministic_heuristic (SIC / industry string) | EPIC-003 STORY-033 |
| `pre_operating_leverage_flag` | deterministic_heuristic (revenue_ttm threshold) | EPIC-003 STORY-033 |
| `holding_company_flag` | hybrid: SIC heuristic + LLM fallback | EPIC-003.1 STORY-035 |
| `cyclicality_flag` | hybrid: sector rules + LLM for ambiguous sectors | EPIC-003.1 STORY-036 |
| `binary_flag` | hybrid: biotech heuristic + LLM | EPIC-003.1 STORY-037 |
| E1–E6 scores | claude_llm_enriched (batch call) | EPIC-003.1 STORY-040 |

**Flag override policy:** Manual override accepted for all flags via admin endpoint.
Provider = "manual" recorded in `dataProviderProvenance`. Manual override takes precedence over any auto-detected value.

**Related:** ADR-012, RFC-007

## Amendment — 2026-04-25: Quarterly History Integration (RFC-008)

### ClassificationInput expansion

`ClassificationInput` gains a new optional field `trend_metrics?: ClassificationTrendMetrics` (interface defined above). Populated via a JOIN to `stock_derived_metrics` in `toClassificationInput()`. When `stock_derived_metrics` has no row for the ticker, `trend_metrics` is `undefined` — all scorers treat absent trend metrics as graceful degradation (no errors, no fabricated values).

### Earnings Quality Scorer revision (pending RFC-008 implementation)

The current EQ scorer (EPIC-004 stories) uses point-in-time proxy signals. Once quarterly history is live, the EQ scorer will be revised to:

| Signal | Current (interim) | Future (quarterly-derived) |
|---|---|---|
| FCF quality | `fcf_conversion` point-in-time | `fcf_conversion_trend_4q`, `cash_earnings_support_flag` |
| Margin stability | `net_margin` point-in-time | `operating_margin_stability_score`, `fcf_margin_stability_score` |
| Earnings reliability | `EQ_EPS_DECLINING`, spread proxies | `earnings_quality_trend_score`, `deteriorating_cash_conversion_flag` |
| SBC/dilution | `material_dilution_flag` (annual) | `sbc_burden_score`, `material_dilution_trend_flag` (quarterly) |
| Operating leverage | `pre_operating_leverage_flag` (static) | `operating_leverage_emerging_flag`, `operating_margin_expansion_flag` |

The proxy signals (`EQ_EPS_DECLINING`, `EQ_EPS_REV_SPREAD_MODERATE/SEVERE` added 2026-04-25) are retained as fallback when `quarters_available < 4`. They are NOT kept alongside quarterly signals when quarterly data is available.

### Bucket Scorer input expansion (pending RFC-008 implementation)

The bucket scorer may use quarterly-derived growth context:
- `revenue_ttm_qhist` as a fiscal-calendar-aware alternative to FMP-sourced revenue snapshot
- `operating_leverage_ratio_4q/8q` as supporting signals for Bucket 4/5 tie-break decisions
- Forward estimate plausibility check against 4-quarter revenue trend slope

Forward estimates remain primary for Buckets 1–4; quarterly trend context is a supporting signal.

### Confidence Computer revision

A new Step 5 (trajectory quality penalty) is added after the existing 4-step confidence computation. See ADR-014 Amendment 2026-04-25 for the full trajectory quality penalty rules. When `trend_metrics` is absent, Step 5 is skipped.

### shouldRecompute new trigger

`shouldRecompute` gains a third trigger type: `quarterly_data_updated`. Fired when `stock_derived_metrics.derived_as_of` for the ticker is newer than `classification_state.classification_last_updated_at` — i.e., the derived metrics were refreshed after the last classification run. No extra flag column needed; the comparison is a timestamp query. See ADR-016.

### Related
RFC-008 (full quarterly history architecture), ADR-015 (storage), ADR-016 (cadence), ADR-013 Amendment 2026-04-25 (interim EQ proxy signals), ADR-014 Amendment 2026-04-25 (trajectory confidence)

---

---

## Amendment — 2026-04-27: Data Model Extensions for Valuation Regime Decoupling (EPIC-008)

**Related:** RFC-003 Amendment 2026-04-27, ADR-005 Amendment 2026-04-27, ADR-017, ADR-018

This amendment defines the data model changes required to support the `valuation_regime` concept introduced in RFC-003 Amendment 2026-04-27.

### New Table: `valuation_regime_thresholds`

Replaces `anchored_thresholds` as the active threshold lookup source for the valuation engine. The old `anchored_thresholds` table is frozen (read-only; kept for audit continuity).

```sql
CREATE TABLE valuation_regime_thresholds (
  valuation_regime       VARCHAR(30)   NOT NULL,
  earnings_quality       CHAR(1)       NOT NULL CHECK (earnings_quality IN ('A', 'B', 'C')),
  balance_sheet_quality  CHAR(1)       NOT NULL CHECK (balance_sheet_quality IN ('A', 'B', 'C')),
  primary_metric         VARCHAR(50)   NOT NULL,
  max_threshold          DECIMAL(10,2) NOT NULL,
  comfortable_threshold  DECIMAL(10,2) NOT NULL,
  very_good_threshold    DECIMAL(10,2) NOT NULL,
  steal_threshold        DECIMAL(10,2) NOT NULL,
  framework_version      VARCHAR(10)   NOT NULL DEFAULT 'v2.0',
  effective_from         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  effective_until        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (valuation_regime, earnings_quality, balance_sheet_quality)
);
```

**Initial seed (9 rows — A/A base families only; all values provisional until calibration):**

| valuation_regime | EQ | BS | metric | max | comfortable | very_good | steal |
|-----------------|----|----|--------|-----|-------------|-----------|-------|
| `mature_pe` | A | A | `forward_pe` | 22.0 | 20.0 | 18.0 | 16.0 |
| `profitable_growth_pe` | A | A | `forward_pe` | 36.0 | 30.0 | 24.0 | 18.0 |
| `profitable_growth_ev_ebit` | A | A | `forward_ev_ebit` | 24.0 | 20.0 | 16.0 | 12.0 |
| `cyclical_earnings` | A | A | `forward_ev_ebit` | 16.0 | 13.0 | 10.0 | 7.0 |
| `sales_growth_standard` | A | A | `ev_sales` | 12.0 | 10.0 | 8.0 | 6.0 |
| `sales_growth_hyper` | A | A | `ev_sales` | 18.0 | 15.0 | 11.0 | 8.0 |
| `financial_special_case` | A | A | `forward_operating_earnings_ex_excess_cash` | NULL | NULL | NULL | NULL |
| `not_applicable` | A | A | `no_stable_metric` | NULL | NULL | NULL | NULL |
| `manual_required` | A | A | `no_stable_metric` | NULL | NULL | NULL | NULL |

Quality downgrades for non-A/A combinations are computed at runtime using the regime-specific downgrade config (see RFC-003 Amendment §Threshold Assigner). No additional rows are seeded.

### Changes to `stock` Table

```sql
-- Remove: cyclicality_flag BOOLEAN DEFAULT false
-- Add:
ALTER TABLE stocks ADD COLUMN structural_cyclicality_score SMALLINT NOT NULL DEFAULT 0
  CHECK (structural_cyclicality_score BETWEEN 0 AND 3);
ALTER TABLE stocks ADD COLUMN cycle_position VARCHAR(20) NOT NULL DEFAULT 'insufficient_data'
  CHECK (cycle_position IN ('depressed', 'normal', 'elevated', 'peak', 'insufficient_data'));

-- Backward-compat computed column (keeps existing API consumers working):
ALTER TABLE stocks ADD COLUMN cyclicality_flag BOOLEAN GENERATED ALWAYS AS
  (structural_cyclicality_score >= 1) STORED;
```

### Changes to `stock_derived_metrics` Table

```sql
ALTER TABLE stock_derived_metrics ADD COLUMN fcf_conversion_ttm DECIMAL(10, 4);
-- Computed value: free_cash_flow_ttm / net_income_ttm
-- NULL when either is NULL or net_income_ttm <= 0
```

### Changes to `valuation_state` Table

```sql
ALTER TABLE valuation_state ADD COLUMN valuation_regime VARCHAR(30);
ALTER TABLE valuation_state ADD COLUMN structural_cyclicality_score_snapshot SMALLINT;
ALTER TABLE valuation_state ADD COLUMN cycle_position_snapshot VARCHAR(20);
ALTER TABLE valuation_state ADD COLUMN cyclical_overlay_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE valuation_state ADD COLUMN cyclical_overlay_value DECIMAL(5, 2);
ALTER TABLE valuation_state ADD COLUMN cyclical_confidence VARCHAR(20);
ALTER TABLE valuation_state ADD COLUMN threshold_family VARCHAR(40);
-- current_multiple_basis extended: add 'mid_cycle' to existing enum
-- derived_from_code deprecated for new records; threshold_family replaces it
```

### `anchored_thresholds` Table

No schema changes. Table is frozen:
- No new rows will be seeded
- Existing rows preserved for audit continuity
- Valuation engine no longer reads from this table for regime-based computation

### Prisma Model Updates

```prisma
model ValuationRegimeThreshold {
  valuationRegime      String   @db.VarChar(30) @map("valuation_regime")
  earningsQuality      String   @db.Char(1)     @map("earnings_quality")
  balanceSheetQuality  String   @db.Char(1)     @map("balance_sheet_quality")
  primaryMetric        String   @db.VarChar(50) @map("primary_metric")
  maxThreshold         Decimal? @db.Decimal(10, 2) @map("max_threshold")
  comfortableThreshold Decimal? @db.Decimal(10, 2) @map("comfortable_threshold")
  veryGoodThreshold    Decimal? @db.Decimal(10, 2) @map("very_good_threshold")
  stealThreshold       Decimal? @db.Decimal(10, 2) @map("steal_threshold")
  frameworkVersion     String   @default("v2.0") @db.VarChar(10) @map("framework_version")
  effectiveFrom        DateTime @default(now()) @db.Timestamptz(6) @map("effective_from")
  effectiveUntil       DateTime? @db.Timestamptz(6) @map("effective_until")
  createdAt            DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@id([valuationRegime, earningsQuality, balanceSheetQuality])
  @@map("valuation_regime_thresholds")
}

// Stock model additions:
// structuralCyclicalityScore  Int      @default(0) @map("structural_cyclicality_score")
// cyclePosition               String   @default("insufficient_data") @map("cycle_position")
// cyclicalityFlag             Boolean  (generated: structuralCyclicalityScore >= 1)

// StockDerivedMetrics addition:
// fcfConversionTtm            Decimal? @db.Decimal(10, 4) @map("fcf_conversion_ttm")

// ValuationState additions:
// valuationRegime             String?  @db.VarChar(30) @map("valuation_regime")
// structuralCyclicalityScoreSnapshot  Int? @map("structural_cyclicality_score_snapshot")
// cyclePositionSnapshot       String?  @db.VarChar(20) @map("cycle_position_snapshot")
// cyclicalOverlayApplied      Boolean  @default(false) @map("cyclical_overlay_applied")
// cyclicalOverlayValue        Decimal? @db.Decimal(5, 2) @map("cyclical_overlay_value")
// cyclicalConfidence          String?  @db.VarChar(20) @map("cyclical_confidence")
// thresholdFamily             String?  @db.VarChar(40) @map("threshold_family")
```

### Entity Relationship Update

```
stocks (1) ──┬─→ (1) valuation_state (extended: + valuation_regime, cyclical fields)
             │
             ├─→ (framework_config)
             │     ├─→ valuation_regime_thresholds  [NEW — active threshold source]
             │     ├─→ anchored_thresholds  [FROZEN — audit only]
             │     └─→ tsr_hurdles  [unchanged]
```

### Related
RFC-003 Amendment 2026-04-27, ADR-005 Amendment 2026-04-27, ADR-017, ADR-018

**END RFC-001**
