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
  valuation_state_status: string; // 'ready' | 'manual_required' | etc.
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
4. **Flag change:** `pre_operating_leverage_flag`, `cyclicality_flag` changed
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
classification_required → (classification completes) → ready
ready → (price changes) → ready (new valuation)
ready → (metric becomes invalid) → manual_required
ready → (bucket 8) → not_applicable
manual_required → (user provides manual multiple) → ready
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

**END RFC-003**
