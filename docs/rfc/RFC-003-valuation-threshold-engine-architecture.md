# RFC-003: Valuation & Threshold Engine Architecture

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** RFC-001 (Classification Engine), RFC-002 (Data Model)
**Creates New Decisions:** YES
**Refines Existing:** NO

---

## Context / Problem

Once a stock is classified with a 3AA code, the valuation engine must:
- Select the correct primary valuation metric (Forward P/E, EV/EBIT, EV/Sales, etc.)
- Compute the current multiple
- Assign threshold grid (max, comfortable, very good, steal)
- Calculate TSR hurdles (base + quality adjustments)
- Determine valuation zone

This mapping is the core of the framework's principle: **same growth does not deserve the same multiple**.

---

## Goals

1. Define deterministic metric selection rules by bucket
2. Specify current multiple computation approach
3. Establish anchored threshold lookup vs derived threshold generation
4. Define TSR hurdle calculation with quality adjustments
5. Design valuation zone assignment algorithm
6. Specify secondary adjustments (gross margin, dilution, cyclicality)

---

## Non-Goals

1. Define how valuation is triggered (workflow orchestration concern)
2. Performance caching strategies (implementation detail)
3. UI rendering of thresholds (implementation detail)
4. Manual TSR estimation workflow (out of V1 scope)

---

## Inherited Assumptions (from RFC-001)

- Classification engine produces `suggested_code` (stored in `classification_state`)
- Users can override via `user_classification_overrides.final_code`
- **Valuation engine uses system `suggested_code`** (not user overrides) for V1 alert generation
- ~~Classification confidence exists but does NOT affect valuation logic~~ **AMENDED 2026-04-26:** Low classification confidence triggers effective bucket demotion for metric and threshold selection (see §Confidence-Based Effective Bucket below)
- User overrides preserved for inspection display (see ADR-007 multi-user architecture)

---

## Data Provider Architecture (V1)

**Multi-Provider Support:** V1 supports pluggable data providers (RFC-004).

**Supported Providers:**
- **Tiingo:** Historical fundamentals, balance sheet, EOD prices, partial forward estimates
- **FMP:** Historical fundamentals, strong forward analyst estimate coverage
- **Hybrid:** Field-level provider selection for optimal coverage

**Provider Capabilities:**

| Data Category | Tiingo | FMP | V1 Strategy |
|---------------|--------|-----|-------------|
| Market cap, sector, industry | ✅ | ✅ | Configurable primary + fallback |
| EOD prices | ✅ | ✅ | Configurable primary + fallback |
| Historical fundamentals | ✅ | ✅ | Configurable primary + fallback |
| Balance sheet | ✅ | ✅ | Configurable primary + fallback |
| Forward analyst estimates | Partial | Strong | **FMP preferred**, Tiingo fallback |

**Forward Metric Handling:**

| Metric | Provider Strategy | Fallback 1 | Fallback 2 | manual_required Condition |
|--------|-------------------|------------|------------|---------------------------|
| `forward_pe` | FMP primary, Tiingo secondary | Trailing P/E × (1 + eps_growth_fwd) | None | All sources missing |
| `forward_ev_ebit` | FMP primary, Tiingo secondary | Trailing × growth | None | All sources + derivation fail |
| `ev_sales` | Computed (provider-agnostic) | Market cap + net debt / revenue | None | Missing market cap or revenue |
| `forward_operating_earnings_ex_excess_cash` | Manual only | None | None | Always for 3AA holding companies |

**Provenance Tracking:**
- Each metric tracks `{value, source_provider, synced_at, fallback_used}` (RFC-002)
- Sources: `'tiingo'`, `'fmp'`, `'computed_trailing'`, `'manual_override'`, `'missing'`

---

## High-Level Architecture

```
Input: active_code, stock fundamentals, flags
    ↓
┌──────────────────────────────────────────┐
│  Metric Selector                         │
│  - Bucket-based rules                    │
│  - Special case handling                 │
│  - Returns: primary_metric               │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Current Multiple Computor               │
│  - Fetch metric value from stock data    │
│  - Apply cyclicality context if needed   │
│  - Returns: current_multiple, basis      │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Threshold Assigner                      │
│  - Lookup anchored thresholds (DB)       │
│  - OR derive mechanically                │
│  - Returns: thresholds, source           │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Secondary Adjustments                   │
│  - Gross margin (EV/Sales)               │
│  - Dilution (Buckets 5-7)                │
│  - Cyclicality flag handling             │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  TSR Hurdle Calculator                   │
│  - Base hurdle by bucket (from DB)       │
│  - Quality adjustments                   │
│  - Returns: adjusted_tsr_hurdle          │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Valuation Zone Assigner                 │
│  - Compare current_multiple to thresholds│
│  - Returns: valuation_zone               │
└──────────────────────────────────────────┘
    ↓
Output: valuation_state (persisted to DB)
```

---

## Component Responsibilities

### Confidence-Based Effective Bucket

**Added: 2026-04-26**

Before metric selection and threshold derivation begin, the valuation engine resolves an **effective code** from the active code and classification confidence level.

**Rule:** When `confidence_level = 'low'`, the effective bucket is `bucket − 1` (floor 1). The EQ and BS grade characters are preserved. All downstream stages (metric selector, threshold assigner, TSR hurdle calculator) use the effective code. The original `active_code` is retained in the persisted result for auditability.

```
effectiveBucket = (confidenceLevel === 'low') ? Math.max(bucket - 1, 1) : bucket
effectiveCode   = `${effectiveBucket}${activeCode.slice(1)}`
```

**Examples:**

| Active code | Confidence | Effective code | Metric used |
|-------------|------------|----------------|-------------|
| `6BA`       | low        | `5BA`          | EV/EBIT     |
| `5AA`       | low        | `4AA`          | Fwd P/E     |
| `4AA`       | low        | `3AA`          | Fwd P/E (same family) |
| `1AA`       | low        | `1AA`          | Fwd P/E (floor) |
| `6BA`       | medium     | `6BA`          | EV/Sales (no demotion) |
| `6BA`       | high       | `6BA`          | EV/Sales (no demotion) |

**Rationale:** A `low`-confidence classification means the scoring algorithm could not clearly distinguish the winning bucket from the runner-up. In that situation the system defaults to the more conservative (lower) bucket's metric rather than potentially applying a growth-stage metric (EV/Sales) to a stock whose growth profile is ambiguous. The displayed classification code is unchanged so the user can see the original system suggestion.

**UI indication:** The stock detail Classification tab renders a demotion notice when `effectiveCode !== activeCode`, showing the original and effective bucket alongside the confidence level.

---

### Metric Selector

**Input:** `active_code`, `holding_company_flag`, `insurer_flag`, `pre_operating_leverage_flag`

**Output:** `primary_metric`, `metric_reason`

**Logic:**
```typescript
function selectPrimaryMetric(
  active_code: string,
  flags: {
    holding_company_flag?: boolean;
    insurer_flag?: boolean;
    pre_operating_leverage_flag?: boolean;
  }
): { primary_metric: string; metric_reason: string } {
  const bucket = parseInt(active_code[0]);

  // Bucket 8: No stable metric
  if (bucket === 8) {
    return {
      primary_metric: 'no_stable_metric',
      metric_reason: 'bucket_8_speculation'
    };
  }

  // Buckets 1-4: Forward P/E (with special cases)
  if (bucket >= 1 && bucket <= 4) {
    // Special case: 3AA Berkshire/holding company/insurer
    if (
      bucket === 3 &&
      active_code.endsWith('AA') &&
      (flags.holding_company_flag || flags.insurer_flag)
    ) {
      return {
        primary_metric: 'forward_operating_earnings_ex_excess_cash',
        metric_reason: '3AA_holding_company_insurer'
      };
    }

    return {
      primary_metric: 'forward_pe',
      metric_reason: `bucket_${bucket}_default`
    };
  }

  // Bucket 5: EV/EBIT or EV/Sales (pre-operating-leverage check)
  if (bucket === 5) {
    if (flags.pre_operating_leverage_flag) {
      return {
        primary_metric: 'ev_sales',
        metric_reason: 'bucket_5_pre_operating_leverage'
      };
    }
    return {
      primary_metric: 'forward_ev_ebit',
      metric_reason: 'bucket_5_default'
    };
  }

  // Buckets 6-7: EV/Sales
  if (bucket === 6 || bucket === 7) {
    return {
      primary_metric: 'ev_sales',
      metric_reason: `bucket_${bucket}_default`
    };
  }

  throw new Error(`Invalid bucket: ${bucket}`);
}
```

---

### Current Multiple Computor

**Input:** `primary_metric`, `stock_data`, `cyclicality_flag`

**Output:** `current_multiple`, `current_multiple_basis`, `metric_source`

**Logic with Forward Estimate Fallback:**
```typescript
function computeCurrentMultiple(
  primary_metric: string,
  stock_data: StockData,
  cyclicality_flag: boolean
): { current_multiple: number | null; basis: string; source: string } {
  if (primary_metric === 'no_stable_metric') {
    return {
      current_multiple: null,
      basis: 'not_applicable',
      source: 'n/a'
    };
  }

  // Try direct metric value from Tiingo
  let value = stock_data[primary_metric];
  let source = 'tiingo';

  // Fallback for forward_pe if missing (with safety guardrails)
  if (primary_metric === 'forward_pe' && (value === null || value === undefined)) {
    const trailing_pe = stock_data['trailing_pe'];
    const eps_growth_fwd = stock_data['eps_growth_fwd'];
    const trailing_eps = stock_data['trailing_eps'];

    // GUARDRAIL: Skip fallback if denominator is unstable or negative
    if (trailing_eps && trailing_eps <= 0) {
      // Negative or zero earnings - fallback formula unreliable
      return { current_multiple: null, basis: 'manual_required', source: 'negative_earnings' };
    }

    // GUARDRAIL: Skip fallback for flagged cyclicals (peak/trough distortion risk)
    if (cyclicality_flag) {
      return { current_multiple: null, basis: 'manual_required', source: 'cyclical_flagged' };
    }

    if (trailing_pe && eps_growth_fwd && trailing_pe > 0) {
      // Estimate: forward_pe ≈ trailing_pe / (1 + eps_growth_fwd/100)
      value = trailing_pe / (1 + eps_growth_fwd / 100);
      source = 'computed_trailing';
    }
  }

  // Fallback for forward_ev_ebit if missing (with safety guardrails)
  if (primary_metric === 'forward_ev_ebit' && (value === null || value === undefined)) {
    const trailing_ev_ebit = stock_data['trailing_ev_ebit'];
    const ebit_growth_assumption = stock_data['operating_margin_trend']; // Proxy
    const trailing_ebit = stock_data['trailing_ebit'];

    // GUARDRAIL: Skip fallback if denominator is unstable or negative
    if (trailing_ebit && trailing_ebit <= 0) {
      return { current_multiple: null, basis: 'manual_required', source: 'negative_ebit' };
    }

    // GUARDRAIL: Skip fallback for flagged cyclicals
    if (cyclicality_flag) {
      return { current_multiple: null, basis: 'manual_required', source: 'cyclical_flagged' };
    }

    if (trailing_ev_ebit && ebit_growth_assumption && trailing_ev_ebit > 0) {
      value = trailing_ev_ebit / (1 + ebit_growth_assumption / 100);
      source = 'computed_trailing';
    }
  }

  // If still missing, mark as missing_data
  if (value === null || value === undefined || value <= 0) {
    return {
      current_multiple: null,
      basis: 'missing_data',
      source: 'missing'
    };
  }

  // Cyclicality context
  let basis = 'spot';
  if (cyclicality_flag) {
    basis = 'spot_cyclical';
  }

  return { current_multiple: value, basis, source };
}
```

**Manual Override Support:**
- User can set `current_multiple_basis = 'mid_cycle'` manually
- User can override `current_multiple` with custom value (source becomes `'manual_override'`)

**V1 Limitation:**
- `forward_operating_earnings_ex_excess_cash` has NO fallback
- 3AA holding companies/insurers ALWAYS require manual input for this metric
- Status: `valuation_state_status = 'manual_required'` if 3AA + holding_company_flag + missing metric

---

### Threshold Assigner

**Input:** `active_code`

**Output:** `thresholds`, `threshold_source`, `derived_from_code?`, `adjustments[]`

**Logic:**

```typescript
interface ThresholdResult {
  max: number;
  comfortable: number;
  very_good: number;
  steal: number;
  threshold_source: 'anchored' | 'derived' | 'manual_override';
  derived_from_code?: string;
  adjustments: string[];
}

async function assignThresholds(
  active_code: string
): Promise<ThresholdResult> {
  // 1. Try anchored lookup
  const anchored = await db.query(
    'SELECT * FROM anchored_thresholds WHERE code = $1 AND effective_until IS NULL',
    [active_code]
  );

  if (anchored.rows.length > 0) {
    const row = anchored.rows[0];
    return {
      max: row.max_threshold,
      comfortable: row.comfortable_threshold,
      very_good: row.very_good_threshold,
      steal: row.steal_threshold,
      threshold_source: 'anchored',
      adjustments: []
    };
  }

  // 2. Derive mechanically
  return deriveThresholds(active_code);
}
```

---

### Threshold Derivation (for Missing Codes)

**Logic:** Find nearest anchored code in same bucket, apply quality downgrades

```typescript
function deriveThresholds(code: string): ThresholdResult {
  const bucket = parseInt(code[0]);
  const earningsQuality = code[1];
  const balanceSheetQuality = code[2];

  // Find anchor reference for this bucket
  const anchorCode = findAnchorReference(bucket, earningsQuality, balanceSheetQuality);
  const anchorThresholds = getAnchoredThresholds(anchorCode);

  // Apply downgrades
  let adjustments: string[] = [];
  let { max, comfortable, very_good, steal } = anchorThresholds;

  // Metric family determines adjustment units
  const metricFamily = getMetricFamily(bucket);

  if (metricFamily === 'pe' || metricFamily === 'ev_ebit') {
    // P/E or EV/EBIT: adjust in "turns"
    const turnAdjustment = calculateTurnAdjustment(
      anchorCode,
      code,
      metricFamily
    );

    max -= turnAdjustment;
    comfortable -= turnAdjustment;
    very_good -= turnAdjustment;
    steal -= turnAdjustment;

    adjustments.push(`downgrade_${turnAdjustment}_turns`);

  } else if (metricFamily === 'ev_sales') {
    // EV/Sales: adjust in "x sales"
    const salesAdjustment = calculateSalesAdjustment(anchorCode, code);

    max -= salesAdjustment;
    comfortable -= salesAdjustment;
    very_good -= salesAdjustment;
    steal -= salesAdjustment;

    adjustments.push(`downgrade_${salesAdjustment}x_sales`);
  }

  // Floor enforcement
  if (metricFamily === 'pe' || metricFamily === 'ev_ebit') {
    max = Math.max(max, 1.0);
    comfortable = Math.max(comfortable, 1.0);
    very_good = Math.max(very_good, 1.0);
    steal = Math.max(steal, 1.0);
  } else if (metricFamily === 'ev_sales') {
    max = Math.max(max, 0.5);
    comfortable = Math.max(comfortable, 0.5);
    very_good = Math.max(very_good, 0.5);
    steal = Math.max(steal, 0.5);
  }

  // Ensure descending order
  if (!(max > comfortable && comfortable > very_good && very_good > steal)) {
    throw new Error(`Derived thresholds violate descending order for ${code}`);
  }

  return {
    max,
    comfortable,
    very_good,
    steal,
    threshold_source: 'derived',
    derived_from_code: anchorCode,
    adjustments
  };
}

function calculateTurnAdjustment(
  anchorCode: string,
  targetCode: string,
  metricFamily: string
): number {
  const anchorEQ = anchorCode[1];
  const anchorBS = anchorCode[2];
  const targetEQ = targetCode[1];
  const targetBS = targetCode[2];

  let adjustment = 0;

  // Earnings quality downgrades
  if (anchorEQ === 'A' && targetEQ === 'B') adjustment += 2.5;
  if (anchorEQ === 'A' && targetEQ === 'C') adjustment += 4.5; // 2.5 + 2.0
  if (anchorEQ === 'B' && targetEQ === 'C') adjustment += 2.0;

  // Balance sheet downgrades
  if (anchorBS === 'A' && targetBS === 'B') adjustment += 1.0;
  if (anchorBS === 'A' && targetBS === 'C') adjustment += 3.0; // 1.0 + 2.0
  if (anchorBS === 'B' && targetBS === 'C') adjustment += 2.0;

  return adjustment;
}

function calculateSalesAdjustment(
  anchorCode: string,
  targetCode: string
): number {
  const anchorEQ = anchorCode[1];
  const anchorBS = anchorCode[2];
  const targetEQ = targetCode[1];
  const targetBS = targetCode[2];

  let adjustment = 0;

  // Earnings quality downgrades (EV/Sales)
  if (anchorEQ === 'A' && targetEQ === 'B') adjustment += 2.0;
  if (anchorEQ === 'A' && targetEQ === 'C') adjustment += 3.75; // 2.0 + 1.75
  if (anchorEQ === 'B' && targetEQ === 'C') adjustment += 1.75;

  // Balance sheet downgrades (EV/Sales)
  if (anchorBS === 'A' && targetBS === 'B') adjustment += 1.0;
  if (anchorBS === 'A' && targetBS === 'C') adjustment += 2.75; // 1.0 + 1.75
  if (anchorBS === 'B' && targetBS === 'C') adjustment += 1.75;

  return adjustment;
}
```

**Open Question (requires ADR):** Threshold rounding rules (nearest 0.5? 0.1?)

---

### Secondary Adjustments

#### Gross Margin Adjustment (Buckets 6-7, EV/Sales only)

```typescript
function applyGrossMarginAdjustment(
  thresholds: ThresholdResult,
  gross_margin: number | null
): ThresholdResult {
  if (gross_margin === null) return thresholds;

  let adjustment = 0;
  if (gross_margin > 80) {
    adjustment = 1.0; // Add 1.0x sales to all thresholds
    thresholds.adjustments.push('gross_margin_above_80_plus_1x');
  } else if (gross_margin < 60) {
    adjustment = -1.5; // Subtract 1.5x sales
    thresholds.adjustments.push('gross_margin_below_60_minus_1_5x');
  }

  if (adjustment !== 0) {
    thresholds.max += adjustment;
    thresholds.comfortable += adjustment;
    thresholds.very_good += adjustment;
    thresholds.steal += adjustment;
  }

  return thresholds;
}
```

#### Dilution Adjustment (Buckets 5-7)

```typescript
function applyDilutionAdjustment(
  thresholds: ThresholdResult,
  share_count_growth_3y: number | null,
  material_dilution_flag: boolean,
  metricFamily: string
): ThresholdResult {
  const hasDilution =
    (share_count_growth_3y !== null && share_count_growth_3y > 5) ||
    material_dilution_flag;

  if (!hasDilution) return thresholds;

  let adjustment = 0;
  if (metricFamily === 'pe' || metricFamily === 'ev_ebit') {
    adjustment = -1.0; // Subtract 1 turn
    thresholds.adjustments.push('dilution_minus_1_turn');
  } else if (metricFamily === 'ev_sales') {
    adjustment = -1.0; // Subtract 1.0x sales
    thresholds.adjustments.push('dilution_minus_1x_sales');
  }

  if (adjustment !== 0) {
    thresholds.max += adjustment;
    thresholds.comfortable += adjustment;
    thresholds.very_good += adjustment;
    thresholds.steal += adjustment;
  }

  return thresholds;
}
```

---

### TSR Hurdle Calculator

**Input:** `bucket`, `earnings_quality`, `balance_sheet_quality`

**Output:** `base_tsr_hurdle`, `adjusted_tsr_hurdle`, `tsr_reason_codes[]`

**Logic:**

```typescript
async function calculateTSRHurdle(
  bucket: number,
  earnings_quality: string,
  balance_sheet_quality: string
): Promise<{
  base_hurdle_label: string;
  base_hurdle_default: number;
  adjusted_hurdle: number;
  reason_codes: string[];
}> {
  // Fetch base hurdle from DB
  const result = await db.query(
    'SELECT * FROM tsr_hurdles WHERE bucket = $1 AND effective_until IS NULL',
    [bucket]
  );

  if (result.rows.length === 0) {
    throw new Error(`No TSR hurdle found for bucket ${bucket}`);
  }

  const row = result.rows[0];
  let adjusted = row.base_hurdle_default;
  const reasons: string[] = [`bucket_${bucket}_base`];

  // Earnings quality adjustment
  if (earnings_quality === 'A') {
    adjusted += row.earnings_quality_a_adjustment; // -1.0
    reasons.push('eq_A_minus_1_0');
  } else if (earnings_quality === 'C') {
    adjusted += row.earnings_quality_c_adjustment; // +2.5
    reasons.push('eq_C_plus_2_5');
  }

  // Balance sheet adjustment
  if (balance_sheet_quality === 'A') {
    adjusted += row.balance_sheet_a_adjustment; // -0.5
    reasons.push('bs_A_minus_0_5');
  } else if (balance_sheet_quality === 'C') {
    adjusted += row.balance_sheet_c_adjustment; // +1.75
    reasons.push('bs_C_plus_1_75');
  }

  return {
    base_hurdle_label: row.base_hurdle_label,
    base_hurdle_default: row.base_hurdle_default,
    adjusted_hurdle: adjusted,
    reason_codes: reasons
  };
}
```

---

### Valuation Zone Assigner

**Input:** `current_multiple`, `thresholds`

**Output:** `valuation_zone`

**Logic:**

```typescript
function assignValuationZone(
  current_multiple: number | null,
  thresholds: ThresholdResult,
  primary_metric: string
): string {
  if (primary_metric === 'no_stable_metric' || current_multiple === null) {
    return 'not_applicable';
  }

  if (current_multiple <= thresholds.steal) {
    return 'steal_zone';
  }
  if (current_multiple <= thresholds.very_good) {
    return 'very_good_zone';
  }
  if (current_multiple <= thresholds.comfortable) {
    return 'comfortable_zone';
  }
  if (current_multiple <= thresholds.max) {
    return 'max_zone';
  }

  return 'above_max';
}
```

---

## Interface Contracts

### Valuation Engine Interface

```typescript
interface ValuationEngine {
  /**
   * Compute valuation state for a stock.
   * MUST be deterministic: same inputs → same outputs.
   */
  computeValuation(input: ValuationInput): Promise<ValuationResult>;

  /**
   * Determine if recomputation needed.
   */
  shouldRecompute(
    current: ValuationInput,
    previous: ValuationInput
  ): RecomputeDecision;
}

interface ValuationInput {
  ticker: string;
  active_code: string; // from classification engine
  stock_data: StockData;
  flags: ManualFlags;
}

interface StockData {
  current_price: number;
  forward_pe?: number;
  forward_ev_ebit?: number;
  ev_sales?: number;
  forward_operating_earnings_ex_excess_cash?: number;
  gross_margin?: number;
  share_count_growth_3y?: number;
}

interface ValuationResult {
  active_code: string;
  primary_metric: string;
  metric_reason: string;
  current_multiple: number | null;
  current_multiple_basis: string;

  max_threshold: number;
  comfortable_threshold: number;
  very_good_threshold: number;
  steal_threshold: number;
  threshold_source: 'anchored' | 'derived' | 'manual_override';
  derived_from_code?: string;
  threshold_adjustments: string[];

  base_tsr_hurdle_label: string;
  base_tsr_hurdle_default: number;
  adjusted_tsr_hurdle: number;
  hurdle_source: 'default' | 'manual_override';
  tsr_reason_codes: string[];

  valuation_zone: string;
  valuation_state_status: string; // 'classification_required' | 'not_applicable' | 'manual_required' | 'computed' | 'stale'
}
```

---

## Persistence (Multi-User)

**See RFC-002 and ADR-007 for full multi-user data model.**

Valuation engine writes to **shared** `valuation_state` table:

```sql
-- SHARED (System Computation) - Computed once, visible to all users
INSERT INTO valuation_state (
  ticker,
  system_active_code, -- Based on system suggested_code (not user overrides)
  primary_metric,
  current_multiple,
  max_threshold, -- From anchored thresholds or derived
  comfortable_threshold,
  very_good_threshold,
  steal_threshold,
  threshold_source, -- 'anchored' | 'derived' | 'manual_override'
  adjusted_tsr_hurdle,
  valuation_zone, -- Based on system thresholds
  updated_at
) VALUES (...);

-- PER-USER (Threshold Overrides) - Rare, per-user manual thresholds
CREATE TABLE user_valuation_overrides (
  user_id UUID NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  max_threshold NUMERIC(10,2),
  comfortable_threshold NUMERIC(10,2),
  very_good_threshold NUMERIC(10,2),
  steal_threshold NUMERIC(10,2),
  override_reason TEXT,
  PRIMARY KEY (user_id, ticker)
);

-- SHARED (Audit Trail)
INSERT INTO valuation_history (
  ticker,
  old_valuation_zone,
  new_valuation_zone,
  change_reason,
  context_snapshot
) VALUES (...);
```

**Active Thresholds Resolution (Per-User Query):**
```sql
-- Get active thresholds for user (user override || system thresholds)
SELECT
  COALESCE(uvo.max_threshold, vs.max_threshold) AS active_max_threshold,
  COALESCE(uvo.comfortable_threshold, vs.comfortable_threshold) AS active_comfortable_threshold,
  COALESCE(uvo.very_good_threshold, vs.very_good_threshold) AS active_very_good_threshold,
  COALESCE(uvo.steal_threshold, vs.steal_threshold) AS active_steal_threshold
FROM valuation_state vs
LEFT JOIN user_valuation_overrides uvo
  ON vs.ticker = uvo.ticker AND uvo.user_id = $1
WHERE vs.ticker = $2;
```

**Note:** User threshold overrides are rare (<1% of stocks). Most users rely on system thresholds.

### User Valuation Override Scope (V1)

**CRITICAL:** User valuation overrides affect **inspection display only**, not operational alert generation.

**Alert Generation Uses Shared System State:**
- Valuation engine computes `valuation_state` using system `suggested_code` (not user overrides)
- Alert generation uses thresholds from `valuation_state` (shared)
- User valuation overrides in `user_valuation_overrides` are visible in inspection view but don't affect alerts

**Rationale:**
- V1 is monitoring-first: alerts generated from consistent framework across all users
- Per-user valuation recomputation adds complexity (~100s runtime for 10 users)
- User overrides preserve autonomy for inspection/review without complicating alert logic

**Inspection View Pattern:**
```typescript
// User sees both system thresholds and their override
async function getThresholdsForInspection(
  ticker: string,
  userId: string
): Promise<ThresholdDisplay> {
  const result = await db.query(`
    SELECT
      vs.max_threshold AS system_max_threshold,
      vs.very_good_threshold AS system_very_good_threshold,
      vs.steal_threshold AS system_steal_threshold,
      vs.valuation_zone AS system_valuation_zone,
      uvo.max_threshold AS user_max_threshold,
      uvo.very_good_threshold AS user_very_good_threshold,
      uvo.steal_threshold AS user_steal_threshold,
      uvo.override_reason
    FROM valuation_state vs
    LEFT JOIN user_valuation_overrides uvo
      ON vs.ticker = uvo.ticker AND uvo.user_id = $1
    WHERE vs.ticker = $2
  `, [userId, ticker]);

  return {
    ticker,
    system_thresholds: {
      max: result.system_max_threshold,
      very_good: result.system_very_good_threshold,
      steal: result.system_steal_threshold,
      zone: result.system_valuation_zone
    },
    user_override: result.user_max_threshold ? {
      max: result.user_max_threshold,
      very_good: result.user_very_good_threshold,
      steal: result.user_steal_threshold,
      reason: result.override_reason,
      // User override zone computed client-side for display
      override_zone: computeZone(currentMultiple, result.user_steal_threshold, ...)
    } : null,
    alert_uses_system_thresholds: true // Explicit label
  };
}
```

**V2 Evolution Path:**
- Add user preference: "Use my threshold overrides for alerts"
- Implement per-user valuation recomputation (on-demand or batched)
- Maintain backward compatibility (default: system thresholds)

---

## Recomputation Triggers

Valuation recompute needed when:

1. **Classification change:** System `suggested_code` changed (not user override)
2. **Price change:** `current_price` changed (affects current_multiple)
3. **Metric value change:** Forward P/E, EV/EBIT, EV/Sales changed materially
4. **Flag change:** `pre_operating_leverage_flag`, ~~`cyclicality_flag`~~ (`structural_cyclicality_score` — see Amendment 2026-04-27) changed
5. **Framework config update:** New framework version activated

**Note:** User classification overrides do NOT trigger valuation recompute (V1 scope). Valuation always uses system `suggested_code`.

```typescript
function shouldRecompute(
  current: ValuationInput,
  previous: ValuationInput
): RecomputeDecision {
  const reasons: string[] = [];

  // Use system suggested_code (not user override)
  if (current.system_suggested_code !== previous.system_suggested_code) {
    reasons.push('suggested_code_changed');
  }

  if (current.stock_data.current_price !== previous.stock_data.current_price) {
    reasons.push('price_changed');
  }

  // Check metric value changes (material threshold: 5%)
  const metricFields = ['forward_pe', 'forward_ev_ebit', 'ev_sales'];
  for (const field of metricFields) {
    const curr = current.stock_data[field];
    const prev = previous.stock_data[field];
    if (curr && prev && Math.abs((curr - prev) / prev) >= 0.05) {
      reasons.push(`${field}_changed_materially`);
    }
  }

  return {
    should_recompute: reasons.length > 0,
    reasons
  };
}
```

---

## State Transitions

```
classification_required → (classification completes) → computed
computed → (price changes) → computed (new valuation)
computed → (metric becomes invalid) → manual_required
computed → (underlying data changes) → stale → (recompute) → computed
computed → (bucket 8) → not_applicable
manual_required → (user provides manual multiple) → computed
```

---

## Edge Cases

**1. Bucket 8 (Lottery/Binary)**
- `primary_metric = 'no_stable_metric'`
- `valuation_zone = 'not_applicable'`
- No threshold assignment
- No TSR hurdle

**2. Missing Current Multiple**
- `current_multiple = null`
- `valuation_state_status = 'manual_required'`
- Triggers data quality alert

**3. Negative or Zero Metric Value**
- Treated as missing data
- `valuation_state_status = 'manual_required'`

**4. Derived Thresholds Violate Floor**
- Apply floor rules: P/E ≥ 1.0x, EV/Sales ≥ 0.5x
- Log warning for manual review

**5. Pre-Operating-Leverage Flag Changes**
- Metric switches from `forward_ev_ebit` to `ev_sales`
- Thresholds switch from Bucket 5 EV/EBIT to Bucket 6 EV/Sales style
- Triggers valuation recompute

---

## Observability

### Metrics

```typescript
metrics.counter('valuation.metric_selected', { ticker, primary_metric });
metrics.counter('valuation.threshold_assigned', { ticker, threshold_source });
metrics.counter('valuation.zone_assigned', { ticker, valuation_zone });
metrics.counter('valuation.zone_changed', {
  ticker,
  old_zone,
  new_zone
});
metrics.counter('valuation.manual_required', { ticker, reason });
```

### Structured Logging

```typescript
logger.info('valuation.computed', {
  ticker,
  active_code,
  primary_metric,
  current_multiple,
  thresholds,
  threshold_source,
  valuation_zone,
  adjusted_tsr_hurdle
});

logger.warn('valuation.derived_thresholds', {
  ticker,
  active_code,
  derived_from_code,
  adjustments
});
```

---

## Alternatives Considered

### Alternative 1: Store All Possible Threshold Combinations in DB
**Rejected:** 8 buckets × 3 EQ × 3 BS = 72 combinations. Framework only provides ~16 anchors. Mechanical derivation is transparent and maintainable.

### Alternative 2: Compute Thresholds On-the-Fly (No Caching)
**Rejected:** Adds latency for no benefit. Thresholds change rarely (framework updates). Cache in `valuation_state` table.

### Alternative 3: Store Only Final Zone, Not Thresholds
**Rejected:** User needs to see threshold grid for transparency. Framework requires showing `anchored` vs `derived` labels.

---

## Open Questions

1. **Threshold rounding:** Round derived thresholds to nearest 0.5? 0.1? → Requires ADR-004
2. **Cyclicality mid-cycle:** How to compute mid-cycle earnings? Manual override only, or formula? → V1: Manual override only
3. **Framework config versioning:** How to handle framework updates? → Decided: effective_from/effective_until in DB

---

## Required ADRs

1. **ADR-004: Threshold Derivation Rounding Policy**
2. **ADR-010: Cyclicality Mid-Cycle Handling** (deferred to V1.1 if no formula available)

---

---

## Amendment — 2026-04-27: Valuation Regime Decoupling (EPIC-008)

**Related:** PRD Amendment 2026-04-27, ADR-017 (Regime Selection), ADR-018 (Cyclical Overlay), ADR-005 Amendment 2026-04-27, RFC-001 Amendment 2026-04-27

### Motivation

The V1 architecture couples bucket → primary_metric → threshold family in a single pipeline step. This produces:

1. Profitable high-growth names forced into EV/Sales (wrong metric, wrong family)
2. All P/E names sharing one threshold family regardless of growth profile
3. Cyclical names receiving no threshold adjustment for cycle position

### New Concept: `valuation_regime`

`valuation_regime` is introduced as a formal intermediate stage between classification output and valuation metric/threshold selection. It is a persisted, computed field on `valuation_state`.

The metric is a 1:1 deterministic lookup from regime. No independent metric selection logic remains.

```
bucket + stock characteristics + flags
    ↓
[Cyclical Score Pre-computation — separate service, runs before valuation batch]
    ↓
[Regime Selector — deterministic Steps 0–6]
    ↓
valuation_regime  (persisted)
    ↓
primary_metric  (1:1 lookup)
    ↓
ValuationRegimeThreshold: base family lookup + quality downgrade formula
    ↓
Cyclical Overlay (if applicable)
    ↓
Secondary Adjustments (dilution, gross margin — unchanged)
    ↓
TSR Hurdle (bucket-keyed — unchanged)
    ↓
Zone Assignment (unchanged)
```

### Updated High-Level Architecture

```
Input: active_code, stock fundamentals, flags, derived metrics, cyclical scores
    ↓
┌──────────────────────────────────────────┐
│  Effective Code Resolver                 │
│  - Confidence-based bucket demotion      │  (unchanged, 2026-04-26)
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Regime Selector  [NEW]                  │
│  - Steps 0–6 deterministic rules         │
│  - Inputs: financial characteristics     │
│            + flags + cyclical scores     │
│  - Returns: valuation_regime             │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Metric Resolver  [SIMPLIFIED]           │
│  - 1:1 lookup: regime → primary_metric   │
│  - No conditional logic                  │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Current Multiple Computor               │  (unchanged)
│  - Cyclicality context preserved         │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Threshold Assigner  [AMENDED]           │
│  - Lookup: ValuationRegimeThreshold      │
│    by (valuation_regime, A/A base)       │
│  - Apply quality downgrade formula       │
│    (regime-specific step config)         │
│  - Returns: thresholds, threshold_family │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Cyclical Overlay  [NEW]                 │
│  - Fires when: score > 0 AND             │
│    regime = profitable_growth_pe         │
│  - Applies haircut from overlay matrix   │
│  - Returns: adjusted thresholds,         │
│    overlay_value, cyclical_confidence    │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Secondary Adjustments                   │  (unchanged)
│  - Dilution, gross margin                │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  TSR Hurdle Calculator                   │  (unchanged — bucket-keyed)
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│  Valuation Zone Assigner                 │  (unchanged)
└──────────────────────────────────────────┘
    ↓
Output: valuation_state (extended — see §Updated Interface Contracts)
```

### Regime Selector — Full Specification

See ADR-017 for the authoritative decision record. Reproduced here for completeness.

**Inputs required (additions to ValuationInput):**

```typescript
interface ValuationInput {
  // ... existing fields ...
  // New regime-selector inputs:
  netIncomeTtm: number | null;          // from stock_derived_metrics
  freeCashFlowTtm: number | null;       // from stock_derived_metrics
  operatingMarginTtm: number | null;    // from stock_derived_metrics
  grossMarginTtm: number | null;        // from stock_derived_metrics
  fcfConversionTtm: number | null;      // freeCashFlowTtm / netIncomeTtm
  revenueGrowthFwd: number | null;      // from stock
  structuralCyclicalityScore: number;   // 0–3; replaces cyclicality_flag
  cyclePosition: CyclePosition;         // depressed|normal|elevated|peak|insufficient_data
  // STORY-098: high amortisation detection inputs (from stock — FMP ebitdaAvg / ebitAvg)
  ebitdaNtm: number | null;             // NTM EBITDA consensus; null when FMP does not provide
  ebitNtm: number | null;               // NTM EBIT consensus; null when not provided
}
```

**Regime 1:1 metric map:**

```typescript
const REGIME_METRIC: Record<ValuationRegime, PrimaryMetric> = {
  not_applicable:                'no_stable_metric',
  financial_special_case:        'forward_operating_earnings_ex_excess_cash',
  sales_growth_standard:         'ev_sales',
  sales_growth_hyper:            'ev_sales',
  profitable_growth_pe:          'forward_pe',
  cyclical_earnings:             'forward_ev_ebit',
  profitable_growth_ev_ebit:     'forward_ev_ebit',
  high_amortisation_earnings:    'forward_ev_ebitda',  // STORY-098 — 2026-04-28
  mature_pe:                     'forward_pe',
  manual_required:               'no_stable_metric',
};
```

**Regime selector logic (Steps 0–6):**

```typescript
function selectRegime(input: ValuationInput): ValuationRegime {
  const bucket = parseBucket(input.activeCode);
  const netIncomePositive = input.netIncomeTtm != null && input.netIncomeTtm > 0;
  const fcfPositive = input.freeCashFlowTtm != null && input.freeCashFlowTtm > 0;
  const opMargin = input.operatingMarginTtm ?? null;
  const revGrowthFwd = input.revenueGrowthFwd ?? null;
  const fcfConversion = input.fcfConversionTtm ?? null;
  const grossMargin = input.grossMarginTtm ?? null;
  const cyclical = input.structuralCyclicalityScore >= 1;

  // Step 0A — Bucket 8
  if (bucket === 8) return 'not_applicable';

  // Step 0B — Bank flag (any bucket)
  // Banks/financial institutions: EV/EBIT meaningless; P/E requires loan-loss normalisation
  // outside framework scope. Always manual_required regardless of profitability.
  if (input.bankFlag) return 'manual_required';

  // Step 0C — Insurer / Step 0D — Holding company (any bucket)
  if (input.insurerFlag || input.holdingCompanyFlag) return 'financial_special_case';

  // Step 1 — Sales-valued growth path
  // Note: fcfPositive=false alone does NOT trigger Step 1.
  // A profitable company with negative FCF falls to manual_required via Step 6.
  // The op_margin gate is conditioned on growth to protect mature low-margin businesses.
  const step1Fires =
    !netIncomePositive ||
    (opMargin !== null && opMargin < 0.10 && revGrowthFwd !== null && revGrowthFwd >= 0.10) ||
    input.preOperatingLeverageFlag;

  if (step1Fires) {
    // Hyper-growth sales variant
    if (
      revGrowthFwd !== null && revGrowthFwd >= 0.40 &&
      grossMargin !== null && grossMargin >= 0.70
    ) {
      return 'sales_growth_hyper';
    }
    return 'sales_growth_standard';
  }

  // Step 2 — Profitable high-growth PE path
  if (
    revGrowthFwd !== null && revGrowthFwd >= 0.20 &&
    opMargin !== null && opMargin >= 0.25 &&
    netIncomePositive &&
    fcfPositive &&
    fcfConversion !== null && fcfConversion >= 0.60
  ) {
    return 'profitable_growth_pe';
  }

  // Step 3 — Cyclical earnings path
  if (
    cyclical &&
    netIncomePositive &&
    opMargin !== null && opMargin >= 0.10
  ) {
    return 'cyclical_earnings';
  }

  // Step 4 — Profitable transitional EV/EBIT
  if (
    revGrowthFwd !== null && revGrowthFwd >= 0.15 &&
    netIncomePositive &&
    fcfPositive &&
    opMargin !== null && opMargin >= 0.10 && opMargin < 0.25
  ) {
    return 'profitable_growth_ev_ebit';
  }

  // Step 4.5 — High amortisation earnings (STORY-098, 2026-04-28)
  // ebitdaNtm/ebitNtm >= 1.30 means implied D&A >= 30% of EBIT — pharma/large-cap acquirer signal
  if (
    input.ebitdaNtm != null &&
    input.ebitNtm != null &&
    input.ebitNtm > 0 &&
    input.ebitdaNtm / input.ebitNtm >= 1.30 &&
    netIncomePositive &&
    fcfPositive
  ) {
    return 'high_amortisation_earnings';
  }

  // Step 5 — Mature PE default
  if (netIncomePositive && fcfPositive) {
    return 'mature_pe';
  }

  // Step 6 — Catch-all
  return 'manual_required';
}
```

**Precedence rationale (must be preserved):**
- Bucket 8 first — no valuation model applies to lottery stocks
- Bank flag before other special cases — banks are fully outside the automated framework
- Insurer / holding company before income tests — non-standard earnings bases
- Immature/sales-valued path before anything else — unprofitable names must not reach PE regimes
- Profitable high-growth PE before cyclical — NVIDIA-like names qualify Step 2 before reaching Step 3
- Cyclical earnings before profitable transitional — cyclical names have different risk profile
- Mature PE as final automated path — stable profitable names that didn't qualify anything else

### Threshold Assigner — Amendment

~~Lookup: `anchored_thresholds` table by exact `code` match; derive mechanically from nearest anchor.~~

**AMENDED 2026-04-27:** Threshold resolution now uses `ValuationRegimeThreshold` table (see ADR-005 Amendment and RFC-001 Amendment for schema). Logic:

1. Lookup base family row by `valuation_regime` (all base rows use A/A tier_high as reference)
2. Apply growth tier overlay for `profitable_growth_pe`: substitute base quad from `GROWTH_TIER_CONFIG` if tier ≠ `high`
3. Apply regime-specific quality downgrade formula:

```typescript
interface RegimeDowngradeConfig {
  eqAbStep: number;   // turns/x subtracted per EQ grade A→B
  eqBcStep: number;   // turns/x subtracted per EQ grade B→C
  bsAbStep: number;   // turns/x subtracted per BS grade A→B
  bsBcStep: number;   // turns/x subtracted per BS grade B→C
}

const REGIME_DOWNGRADE_CONFIG: Record<string, RegimeDowngradeConfig> = {
  mature_pe:                  { eqAbStep: 2.5, eqBcStep: 2.0, bsAbStep: 1.0, bsBcStep: 2.0 },
  profitable_growth_pe:       { eqAbStep: 4.0, eqBcStep: 4.0, bsAbStep: 2.0, bsBcStep: 3.0 },
  profitable_growth_ev_ebit:  { eqAbStep: 3.0, eqBcStep: 3.0, bsAbStep: 1.5, bsBcStep: 2.0 },
  cyclical_earnings:          { eqAbStep: 2.0, eqBcStep: 2.0, bsAbStep: 1.0, bsBcStep: 1.5 },
  sales_growth_standard:      { eqAbStep: 2.0, eqBcStep: 1.75, bsAbStep: 1.0, bsBcStep: 1.75 },
  sales_growth_hyper:         { eqAbStep: 2.0, eqBcStep: 1.75, bsAbStep: 1.0, bsBcStep: 1.75 },
};

type GrowthTier = 'high' | 'mid' | 'standard';

interface GrowthTierEntry {
  minGrowth: number;
  base: ThresholdQuad;
}

// Growth tier base quads for profitable_growth_pe only.
// Spread compresses alongside the maximum as growth decreases — lower-growth names have
// lower fair-value uncertainty. Steal floors at 16–17x (≈ mature_pe steal) because the
// Step 2 quality gates are still met regardless of growth tier.
const GROWTH_TIER_CONFIG: Record<GrowthTier, GrowthTierEntry> = {
  high:     { minGrowth: 0.35, base: { max: 36, comfortable: 30, veryGood: 24, steal: 18 } },
  mid:      { minGrowth: 0.25, base: { max: 30, comfortable: 25, veryGood: 21, steal: 17 } },
  standard: { minGrowth: 0.20, base: { max: 26, comfortable: 22, veryGood: 19, steal: 16 } },
};

function resolveGrowthTier(revenueGrowthFwd: number): GrowthTier {
  // Null cannot occur here: Step 2 requires non-null revenueGrowthFwd >= 0.20.
  // A stock reaching profitable_growth_pe always has a known forward growth value.
  if (revenueGrowthFwd >= 0.35) return 'high';
  if (revenueGrowthFwd >= 0.25) return 'mid';
  return 'standard';
}

function applyGrowthTierOverlay(
  regime: ValuationRegime,
  revenueGrowthFwd: number | null,
  baseFromTable: ThresholdQuad,
): { base: ThresholdQuad; tier: GrowthTier | null } {
  if (regime !== 'profitable_growth_pe') return { base: baseFromTable, tier: null };
  // revenueGrowthFwd is non-null here: Step 2 guarantees it
  const tier = resolveGrowthTier(revenueGrowthFwd!);
  return { base: GROWTH_TIER_CONFIG[tier].base, tier };
}

function applyQualityDowngrade(
  base: ThresholdQuad,
  eqGrade: string,
  bsGrade: string,
  config: RegimeDowngradeConfig,
): ThresholdQuad {
  let eqAdj = 0;
  if (eqGrade === 'B') eqAdj = config.eqAbStep;
  if (eqGrade === 'C') eqAdj = config.eqAbStep + config.eqBcStep;

  let bsAdj = 0;
  if (bsGrade === 'B') bsAdj = config.bsAbStep;
  if (bsGrade === 'C') bsAdj = config.bsAbStep + config.bsBcStep;

  const totalAdj = eqAdj + bsAdj;
  return enforceFloorAndOrder({
    max: base.max - totalAdj,
    comfortable: base.comfortable - totalAdj,
    veryGood: base.veryGood - totalAdj,
    steal: base.steal - totalAdj,
  });
}
```

4. Result: `threshold_family` label (e.g. `profitable_growth_pe_mid_BA`), `threshold_source = 'regime_derived'`

The `derived_from_code` field is deprecated for new records. `threshold_family` replaces it.  
The old `AnchoredThreshold` table is frozen; existing records remain for audit continuity.

### Cyclical Overlay — New Component

See ADR-018 for the authoritative decision record.

**Fires when:** `structural_cyclicality_score >= 1` AND `valuation_regime = 'profitable_growth_pe'`

**Does not fire for:** `cyclical_earnings` regime — that regime's base family already reflects cyclical risk discount.

**Interaction with growth tier overlay:** Growth tier and cyclical overlay are independent. Growth tier substitutes the base quad (step 2 above) before quality downgrade. Cyclical overlay is a scalar subtraction applied after quality downgrade (step 4). A `mid`-tier company with cyclicality will receive both adjustments independently.

**Overlay matrix for `profitable_growth_pe`:**

```typescript
function computeCyclicalOverlay(
  score: number,          // 0–3
  position: CyclePosition,
): number {             // turns to subtract from all thresholds
  if (score === 0) return 0;
  if (score === 1) {
    return position === 'elevated' || position === 'peak' ? 4.0 : 2.0;
  }
  if (score === 2) {
    return position === 'elevated' || position === 'peak' ? 6.0 : 4.0;
  }
  // score === 3: force to manual_required or cyclical_earnings — do not apply overlay
  return 0; // handled upstream: score=3 re-routes to cyclical_earnings
}
```

**Cyclical_earnings regime overlays** (cycle_position → threshold reduction):

```typescript
function computeCyclicalEarningsOverlay(position: CyclePosition): number {
  if (position === 'elevated') return 2.0;
  if (position === 'peak') return 3.5;   // 3–4 range; use 3.5 as default
  return 0; // depressed, normal, insufficient_data: use base family as-is
}
```

For `cyclical_earnings` + `depressed`: no automatic tightening; system logs a basis warning that spot earnings may be below normal (conservative signal for user).

### Updated ValuationInput Interface

```typescript
interface ValuationInput {
  ticker: string;
  activeCode: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  primaryMetricOverride?: PrimaryMetric;

  // Valuation multiples (unchanged)
  forwardPe: number | null;
  forwardEvEbit: number | null;
  evSales: number | null;
  trailingPe: number | null;
  trailingEvEbit: number | null;
  forwardOperatingEarningsExExcessCash: number | null;

  // Existing flags (unchanged)
  holdingCompanyFlag: boolean;
  insurerFlag: boolean;
  preOperatingLeverageFlag: boolean;
  materialDilutionFlag: boolean;
  grossMargin: number | null;          // spot, for secondary adjustments
  shareCountGrowth3y: number | null;

  // NEW: regime selector inputs (from stock_derived_metrics + stock)
  netIncomeTtm: number | null;
  freeCashFlowTtm: number | null;
  operatingMarginTtm: number | null;
  grossMarginTtm: number | null;
  fcfConversionTtm: number | null;     // freeCashFlowTtm / netIncomeTtm
  revenueGrowthFwd: number | null;

  // NEW: cyclical score inputs (pre-computed by CyclicalScoreService)
  structuralCyclicalityScore: number;  // 0–3; replaces cyclicality_flag
  cyclePosition: CyclePosition;        // depressed|normal|elevated|peak|insufficient_data

  // Framework config (unchanged)
  valuationRegimeThresholds: ValuationRegimeThresholdRow[];
  tsrHurdles: TsrHurdleRow[];
}
```

**Note:** `cyclicalityFlag` (boolean) is removed from `ValuationInput`. Downstream references to `cyclicalityFlag` use `structuralCyclicalityScore >= 1`.

### Updated ValuationResult Interface

```typescript
interface ValuationResult {
  // ... all existing fields preserved ...

  // NEW fields:
  valuationRegime: ValuationRegime;
  structuralCyclicalityScore: number;
  cyclePosition: CyclePosition;
  cyclicalOverlayApplied: boolean;
  cyclicalOverlayValue: number | null;
  cyclicalConfidence: 'high' | 'medium' | 'low' | 'insufficient_data';
  growthTier: GrowthTier | null;       // null for non-profitable_growth_pe regimes
  thresholdFamily: string;             // e.g. 'profitable_growth_pe_mid_BA'
}
```

### New Pre-computation Layer: CyclicalScoreService

A new service analogous to `computeDerivedMetrics`, running before the valuation batch:

**Responsibility:** Derive `structuralCyclicalityScore` (0–3) and `cyclePosition` from `stock_quarterly_history`.

**Conservative inference rules (explicit):**
- Fewer than 8 quarters of history → `cyclePosition = 'insufficient_data'`; `structuralCyclicalityScore` uses classification flag only (0 if no `cyclicality_flag`, 1 if flag set)
- `elevated`: current TTM operating margin > 12Q trailing average × 1.15 AND consistent revenue growth above history midpoint
- `peak`: current TTM operating margin > 12Q trailing average × 1.25 AND revenue at history-window high
- `depressed`: current TTM operating margin < 12Q trailing average × 0.85
- Default (neither condition met clearly): `normal`
- When in doubt: assign `normal`, not elevated or peak

**LLM signal integration:**  
`marginDurabilityScore` and `pricingPowerScore` from `ClassificationEnrichmentScore` (EPIC-003.1) may modulate `structuralCyclicalityScore` by ±1 level. Cap: max ±1. LLM signals never override the profitability gates in Steps 1–5 of the regime selector.

**Persists to:** `stock.structural_cyclicality_score` and `stock.cycle_position`.

### Updated Recomputation Triggers

```typescript
// New triggers added to shouldRecompute():
if (current.structuralCyclicalityScore !== previous.structuralCyclicalityScore) {
  reasons.push('cyclicality_score_changed');
}
if (current.cyclePosition !== previous.cyclePosition) {
  reasons.push('cycle_position_changed');
}
if (current.operatingMarginTtm !== previous.operatingMarginTtm) {
  reasons.push('operating_margin_ttm_changed');
}
```

### Backward Compatibility

- `cyclicality_flag` is preserved in the database as a computed column (`structural_cyclicality_score >= 1`) — no API breakage
- Existing `derived_from_code` field on `valuation_state` is preserved for historical records; new records use `threshold_family` instead
- TSR hurdle calculation is unchanged — still bucket-keyed
- Zone assignment is unchanged
- Dilution and gross-margin secondary adjustments are unchanged

**END RFC-003**
