# ADR-005: Threshold Management Strategy - Anchored with Mechanical Derivation

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-003 (Valuation Engine), RFC-002 (Data Model)

---

## Context

The valuation engine assigns each stock 4 thresholds: `max`, `comfortable`, `very_good`, `steal`. These thresholds define valuation zones used for monitoring and alerts.

**The Question:** How should thresholds be managed for 1000 stocks across 72 possible codes (8 buckets × 3 earnings × 3 balance sheet)?

### Framework Reality

The 3AA framework provides **anchored thresholds** for ~20-30 codes (most common combinations):
- `4AA`: max=30, comfortable=25, very_good=22, steal=18 (Forward P/E)
- `5BB`: max=20, comfortable=16, very_good=14, steal=11 (Forward EV/EBIT)
- `6BA`: max=8, comfortable=6, very_good=5, steal=3.5 (EV/Sales)

But the framework does NOT provide explicit thresholds for all 72 combinations:
- `4AB` - Elite compounder with slightly weaker balance sheet → thresholds?
- `3AC` - Stalwart with weak balance sheet → thresholds?
- `7CA` - Hypergrowth with weak earnings quality → thresholds?

**Universe Reality:**
- 1000 stocks will span many codes
- Some codes will have only 1-2 stocks (long tail)
- Cannot manually set thresholds for every code

### Threshold Management Options

**All Manual:**
- User sets thresholds for every code
- 72 codes × 4 thresholds = 288 manual entries
- Flexible but operationally expensive

**All Computed:**
- Derive all thresholds mechanically from rules
- No manual anchoring
- Risk: thresholds don't match framework judgment

**Anchored with Mechanical Derivation:**
- Store explicit thresholds for common codes (anchored)
- Derive thresholds for uncommon codes using downgrade rules (derived)
- Label threshold source for transparency

---

## Decision

V1 shall use **anchored thresholds with mechanical derivation fallback**:

1. **Anchored thresholds:** Store explicit thresholds for ~20-30 common codes in `anchored_thresholds` table
2. **Mechanical derivation:** For codes without anchored thresholds, derive using quality downgrade rules
3. **Threshold source transparency:** Label every threshold as `anchored`, `derived`, or `manual_override`
4. **User override:** Allow manual threshold override for specific tickers (rare edge cases)

### Data Model

```sql
-- Framework configuration (seeded from framework spec)
CREATE TABLE anchored_thresholds (
  code VARCHAR(5) NOT NULL UNIQUE, -- "4AA", "5BB", etc.
  primary_metric VARCHAR(50) NOT NULL,

  max_threshold NUMERIC(10,2) NOT NULL,
  comfortable_threshold NUMERIC(10,2) NOT NULL,
  very_good_threshold NUMERIC(10,2) NOT NULL,
  steal_threshold NUMERIC(10,2) NOT NULL,

  framework_version VARCHAR(10) NOT NULL DEFAULT 'v1.0',
  notes TEXT
);

-- Per-stock thresholds (computed or overridden)
CREATE TABLE valuation_state (
  ticker VARCHAR(10) PRIMARY KEY,
  active_code VARCHAR(5) NOT NULL,
  primary_metric VARCHAR(50) NOT NULL,

  max_threshold NUMERIC(10,2) NOT NULL,
  comfortable_threshold NUMERIC(10,2) NOT NULL,
  very_good_threshold NUMERIC(10,2) NOT NULL,
  steal_threshold NUMERIC(10,2) NOT NULL,

  threshold_source VARCHAR(20) NOT NULL CHECK (
    threshold_source IN ('anchored', 'derived', 'manual_override')
  ),
  derivation_basis TEXT, -- "Derived from 4AA via balance_sheet_downgrade"

  -- If manual override
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  overridden_by VARCHAR(50)
);
```

### Derivation Rules (Quality Downgrade)

```typescript
// Mechanical derivation when no anchored threshold exists
function deriveThresholds(code: string): ThresholdResult {
  // Try to find anchored threshold
  const anchored = await db.query(
    'SELECT * FROM anchored_thresholds WHERE code = $1',
    [code]
  );

  if (anchored.rows.length > 0) {
    return {
      thresholds: anchored.rows[0],
      source: 'anchored',
      derivation_basis: null
    };
  }

  // No anchored threshold, derive mechanically
  const [bucket, earnings, balanceSheet] = parseCode(code); // "4AB" → [4, 'A', 'B']

  // Start with base code (highest quality: AA)
  const baseCode = `${bucket}AA`;
  const base = await db.query(
    'SELECT * FROM anchored_thresholds WHERE code = $1',
    [baseCode]
  );

  if (base.rows.length === 0) {
    // No base anchor for this bucket, cannot derive
    return {
      thresholds: null,
      source: 'missing',
      derivation_basis: `No anchored threshold for bucket ${bucket}`
    };
  }

  // Apply downgrade adjustments
  let adjustedThresholds = { ...base.rows[0] };
  let derivationSteps = [];

  // Earnings quality downgrade
  if (earnings === 'B') {
    adjustedThresholds = downgradeEarningsQuality(adjustedThresholds, 'B');
    derivationSteps.push('earnings_downgrade_B');
  } else if (earnings === 'C') {
    adjustedThresholds = downgradeEarningsQuality(adjustedThresholds, 'C');
    derivationSteps.push('earnings_downgrade_C');
  }

  // Balance sheet quality downgrade
  if (balanceSheet === 'B') {
    adjustedThresholds = downgradeBalanceSheetQuality(adjustedThresholds, 'B');
    derivationSteps.push('balance_sheet_downgrade_B');
  } else if (balanceSheet === 'C') {
    adjustedThresholds = downgradeBalanceSheetQuality(adjustedThresholds, 'C');
    derivationSteps.push('balance_sheet_downgrade_C');
  }

  return {
    thresholds: adjustedThresholds,
    source: 'derived',
    derivation_basis: `Derived from ${baseCode} via ${derivationSteps.join(', ')}`
  };
}

// Downgrade rules (example: reduce thresholds by 10% for B, 20% for C)
function downgradeEarningsQuality(thresholds: Thresholds, grade: 'B' | 'C'): Thresholds {
  const reductionPct = grade === 'B' ? 0.10 : 0.20;
  return {
    max_threshold: thresholds.max_threshold * (1 - reductionPct),
    comfortable_threshold: thresholds.comfortable_threshold * (1 - reductionPct),
    very_good_threshold: thresholds.very_good_threshold * (1 - reductionPct),
    steal_threshold: thresholds.steal_threshold * (1 - reductionPct)
  };
}
```

---

## Rationale

### Why Anchored + Mechanical Derivation?

**1. Operational Feasibility**
- Cannot manually set thresholds for 72 codes
- Framework provides explicit anchors for ~30 codes (common cases)
- Mechanical derivation handles long tail (rare codes)

**2. Framework Fidelity**
- Anchored thresholds preserve framework judgment (4AA = 30 P/E max, not computed)
- Derived thresholds follow framework principles (lower quality → lower thresholds)
- Transparency: user knows which thresholds are anchored vs derived

**3. Flexibility**
- Can add new anchored thresholds as framework evolves
- Can tune derivation rules without rewriting engine
- User can override specific stocks if needed (edge cases)

**4. Auditability**
- Every threshold labeled with source (anchored/derived/manual_override)
- Derivation basis logged ("Derived from 4AA via balance_sheet_downgrade_B")
- Can answer: "Why is AAPL's max threshold 25?"
  - "Anchored from framework table for code 4AA"

**5. Framework Evolution**
- V1 launches with 30 anchored codes
- V1.1 adds 10 more anchored codes (based on usage patterns)
- Derived thresholds automatically update to use new anchors

### Why NOT All Manual?

**Does Not Scale:**
- 72 codes × 4 thresholds = 288 manual entries
- Universe will span many codes (especially with quality variations)
- Manual threshold maintenance = high operational burden

**Framework Updates Are Painful:**
- If framework adjusts 4AA max threshold from 30 → 28
- Must manually update all related codes (4AB, 4AC, 4BA, etc.)
- Error-prone and time-consuming

### Why NOT All Computed?

**Loses Framework Judgment:**
- Framework thresholds are judgment-based, not formula-based
- 4AA max=30 is a judgment call (not computed from revenue growth formula)
- Pure computation would lose this nuance

**No Ground Truth:**
- Derivation rules need base anchors to start from
- All-computed requires picking arbitrary starting values
- Anchored thresholds provide ground truth

### Why NOT Hardcode Derivation Rules?

**Inflexible:**
- Downgrade percentages (10% for B, 20% for C) may need tuning
- Hardcoded rules require code changes
- Better to make derivation rules configurable

**ADR Decision:**
- V1 uses simple percentage downgrades (10%/20%)
- V2 could make derivation rules configurable (store in DB)
- For now, hardcoded is acceptable (can change if needed)

---

## Consequences

### Positive ✅

**Operational Efficiency:**
- Only ~30 anchored thresholds to maintain
- Derivation handles long tail automatically
- User intervention only for edge cases

**Framework Fidelity:**
- Anchored thresholds preserve judgment
- Derived thresholds follow framework principles
- Transparency via source labeling

**Flexibility:**
- Can add new anchored thresholds as framework evolves
- Can tune derivation rules if needed
- Can override specific stocks manually

**Auditability:**
- Every threshold has source label
- Derivation basis logged
- Can trace threshold back to framework table

**Framework Evolution:**
- Update anchored_thresholds table → derived thresholds auto-update
- No need to manually update all related codes

### Negative ⚠️

**Derivation Approximation:**
- Derived thresholds are approximations, not explicit judgments
- 10%/20% downgrade may not match framework intent perfectly
- **Mitigation:** User can override if derivation is wrong

**Initial Seeding Work:**
- Must manually seed 30 anchored thresholds from framework
- One-time effort (~2 hours)
- **Mitigation:** Framework spec provides explicit values

**Derivation Rule Tuning:**
- May need to adjust downgrade percentages based on usage
- Requires code change (hardcoded for V1)
- **Mitigation:** V2 can make derivation rules configurable

**User Confusion:**
- User may not understand difference between anchored vs derived
- Must explain in UI
- **Mitigation:** Show source label and derivation basis in inspection view

---

## Alternatives Considered

### Alternative 1: All Manual Thresholds

**Approach:**
```sql
CREATE TABLE thresholds (
  code VARCHAR(5) PRIMARY KEY,
  max_threshold NUMERIC(10,2),
  comfortable_threshold NUMERIC(10,2),
  very_good_threshold NUMERIC(10,2),
  steal_threshold NUMERIC(10,2)
);
-- User manually enters 72 rows (one per code)
```

**Rejected Because:**
- ❌ Does not scale (288 manual entries)
- ❌ Framework only provides explicit values for ~30 codes
- ❌ High operational burden to maintain
- ❌ Framework updates require updating many rows manually
- ✅ Would be appropriate for <10 codes (small portfolio)

---

### Alternative 2: All Computed (No Anchors)

**Approach:**
- Define formula: `max_threshold = base_multiple × quality_adjustment × growth_adjustment`
- Compute all thresholds from stock fundamentals
- No manual anchoring

**Rejected Because:**
- ❌ Framework thresholds are judgment-based, not formula-based
- ❌ No ground truth for base multiples
- ❌ Loses framework fidelity (4AA max=30 is a judgment, not computed)
- ✅ Would be appropriate for pure quantitative framework (not 3AA)

---

### Alternative 3: Anchored Only (No Derivation)

**Approach:**
- Store thresholds only for codes with explicit framework anchors
- Stocks with rare codes (no anchor) → `manual_required` state
- User must manually set thresholds for rare codes

**Rejected Because:**
- ❌ Forces user to manually configure rare codes
- ❌ Rare codes may appear frequently in universe (e.g., AB, BC combinations)
- ❌ High operational burden
- ✅ Would be appropriate if framework provided explicit thresholds for all 72 codes

---

### Alternative 4: Hierarchical Derivation (Multiple Fallbacks)

**Approach:**
- Try exact match (e.g., 4AB)
- Fall back to bucket + earnings (4AX, ignoring balance sheet)
- Fall back to bucket only (4XX, ignoring quality)
- Fall back to default by metric (Forward P/E default thresholds)

**Rejected Because:**
- ❌ More complex than simple quality downgrade
- ❌ Ignoring balance sheet quality loses important signal
- ❌ Fallback chain is hard to explain to user
- ✅ Could be considered for V2 if simple downgrade proves insufficient

---

## Implementation Notes

### Seeding Anchored Thresholds

```sql
-- Seed framework thresholds from spec
INSERT INTO anchored_thresholds (code, primary_metric, max_threshold, comfortable_threshold, very_good_threshold, steal_threshold, notes)
VALUES
  ('4AA', 'forward_pe', 30.0, 25.0, 22.0, 18.0, 'Elite compounder - highest quality'),
  ('4AB', 'forward_pe', 28.0, 23.0, 20.0, 16.0, 'Elite compounder - slightly weaker balance sheet'),
  ('5BB', 'forward_ev_ebit', 20.0, 16.0, 14.0, 11.0, 'Operating leverage - average quality'),
  ('6BA', 'ev_sales', 8.0, 6.0, 5.0, 3.5, 'High growth - strong balance sheet'),
  ('3AA', 'forward_pe', 22.0, 18.0, 16.0, 13.0, 'Stalwart - highest quality'),
  -- Add ~25 more rows for common codes
  ;
```

### Confidence-Based Effective Code (Amendment 2026-04-26)

When `confidence_level = 'low'`, the threshold lookup uses an **effective code** derived by demoting the bucket by 1 (floor 1), not the raw `active_code`. The EQ and BS grades are preserved. The demotion is applied before the anchored lookup and mechanical derivation steps below — both use the effective code as the lookup key. The original `active_code` is stored in the persisted `valuation_state` for auditability. See RFC-003 §Confidence-Based Effective Bucket for the full specification.

### Threshold Lookup with Derivation

```typescript
async function getThresholdsForStock(ticker: string): Promise<ThresholdResult> {
  const state = await db.query('SELECT active_code FROM classification_state WHERE ticker = $1', [ticker]);
  const code = state.rows[0].active_code;

  // Check for manual override
  const override = await db.query(
    'SELECT * FROM valuation_state WHERE ticker = $1 AND threshold_source = $2',
    [ticker, 'manual_override']
  );

  if (override.rows.length > 0) {
    return {
      thresholds: override.rows[0],
      source: 'manual_override',
      derivation_basis: override.rows[0].override_reason
    };
  }

  // Try anchored threshold
  const anchored = await db.query(
    'SELECT * FROM anchored_thresholds WHERE code = $1',
    [code]
  );

  if (anchored.rows.length > 0) {
    return {
      thresholds: anchored.rows[0],
      source: 'anchored',
      derivation_basis: null
    };
  }

  // Derive mechanically
  return deriveThresholds(code);
}
```

### Quality Downgrade Example

```typescript
// 4AB: Start with 4AA anchor, downgrade balance sheet B
const base = { max: 30, comfortable: 25, very_good: 22, steal: 18 }; // 4AA
const derived = downgradeBalanceSheetQuality(base, 'B'); // 10% reduction
// Result: { max: 27, comfortable: 22.5, very_good: 19.8, steal: 16.2 }

// 4AC: Start with 4AA anchor, downgrade balance sheet C
const derived2 = downgradeBalanceSheetQuality(base, 'C'); // 20% reduction
// Result: { max: 24, comfortable: 20, very_good: 17.6, steal: 14.4 }
```

### User Override (Rare Edge Case)

```typescript
async function overrideThresholds(
  ticker: string,
  thresholds: Thresholds,
  override_reason: string,
  user: string
): Promise<void> {
  await db.query(`
    UPDATE valuation_state
    SET max_threshold = $1,
        comfortable_threshold = $2,
        very_good_threshold = $3,
        steal_threshold = $4,
        threshold_source = 'manual_override',
        override_reason = $5,
        overridden_at = NOW(),
        overridden_by = $6
    WHERE ticker = $7
  `, [
    thresholds.max,
    thresholds.comfortable,
    thresholds.very_good,
    thresholds.steal,
    override_reason,
    user,
    ticker
  ]);
}
```

---

## User Experience Implications

### Inspection View - Threshold Source Display

```
╔══════════════════════════════════════════════════════════╗
║ AAPL - Valuation Thresholds                              ║
╠══════════════════════════════════════════════════════════╣
║ Code: 4AA                                                ║
║ Metric: Forward P/E                                      ║
║                                                          ║
║ Thresholds (ANCHORED from framework table):              ║
║   Max:        30.0x                                      ║
║   Comfortable: 25.0x                                     ║
║   Very Good:  22.0x                                      ║
║   Steal:      18.0x                                      ║
║                                                          ║
║ Current Multiple: 28.5x (Comfortable Zone)               ║
╚══════════════════════════════════════════════════════════╝
```

```
╔══════════════════════════════════════════════════════════╗
║ XYZ Corp - Valuation Thresholds                          ║
╠══════════════════════════════════════════════════════════╣
║ Code: 4AB                                                ║
║ Metric: Forward P/E                                      ║
║                                                          ║
║ Thresholds (DERIVED from 4AA via balance_sheet_B):       ║
║   Max:        27.0x (10% downgrade from 4AA)             ║
║   Comfortable: 22.5x                                     ║
║   Very Good:  19.8x                                      ║
║   Steal:      16.2x                                      ║
║                                                          ║
║ Current Multiple: 20.0x (Very Good Zone)                 ║
║                                                          ║
║ [ Override Thresholds ] (rare edge case)                 ║
╚══════════════════════════════════════════════════════════╝
```

**Key Elements:**
- Show threshold source (ANCHORED vs DERIVED vs MANUAL_OVERRIDE)
- Show derivation basis if derived
- Allow manual override (rare, for edge cases)

---

## Framework Evolution Strategy

### Adding New Anchored Thresholds

**V1.0:** 30 anchored codes (most common)
**V1.1:** Analyze universe distribution, add 10 more anchors for frequently-occurring codes
**V2.0:** Consider making derivation rules configurable (store in DB)

### Tuning Derivation Rules

**V1:** Hardcoded 10%/20% downgrades
**Evaluation:** After 3 months, analyze derived thresholds vs user overrides
**Adjustment:** If many user overrides, tune downgrade percentages (e.g., 8%/18% instead of 10%/20%)

---

## Related Decisions

- **RFC-003:** Defines threshold selection logic and derivation rules
- **RFC-002:** Defines anchored_thresholds and valuation_state schemas
- **ADR-004:** Manual override pattern applies to thresholds (similar to classification)

---

## Notes

- Anchored thresholds are framework judgments, not computed
- Derived thresholds are mechanical approximations (may require tuning)
- User overrides are rare (expect <1% of stocks to need manual thresholds)
- Framework version tracked in anchored_thresholds for evolution support

---

---

## Amendment — 2026-04-27: Regime-Keyed Threshold Table (EPIC-008)

**Related:** RFC-003 Amendment 2026-04-27, RFC-001 Amendment 2026-04-27, ADR-017

### Context for Amendment

The V1 `anchored_thresholds` table is keyed by `{bucket}{EQ}{BS}` code (e.g. `4AA`). The introduction of `valuation_regime` as a formal concept (RFC-003 Amendment 2026-04-27) makes this key incorrect: the threshold family is now determined by regime, not by bucket. Keeping the code-keyed table as the active lookup source would preserve the coupling problem that the amendment is designed to fix.

### Decision

Introduce a new `valuation_regime_thresholds` table as the **active threshold lookup source** for the valuation engine. The old `anchored_thresholds` table is **frozen** — no further seeding; existing rows preserved for audit continuity.

### New Table Structure

Primary key: `(valuation_regime, earnings_quality, balance_sheet_quality)`.

**V2 seeding (9 rows — A/A base families only; see RFC-001 Amendment for schema):**

All 9 rows use `earnings_quality = 'A'` and `balance_sheet_quality = 'A'`. These are the base families from which quality downgrades are computed at runtime.

Quality downgrades for non-A/A combinations are **not stored in the table**. They are computed at runtime using regime-specific downgrade configs (see §Downgrade Configs below).

This is simpler than both:
- The old system (16 anchors + mechanical derivation from nearest anchor): replaced by 9 base rows + formula
- A pre-seeded 81-row table: more rows than needed, harder to maintain

### Downgrade Configs (Code-Level Constants)

```typescript
// Regime-specific quality downgrade step values.
// eqAbStep: turns/x subtracted moving EQ from A to B
// eqBcStep: turns/x subtracted moving EQ from B to C (additive)
// bsAbStep: turns/x subtracted moving BS from A to B
// bsBcStep: turns/x subtracted moving BS from B to C (additive)

const REGIME_DOWNGRADE_CONFIG = {
  mature_pe:                  { eqAbStep: 2.5, eqBcStep: 2.0, bsAbStep: 1.0, bsBcStep: 2.0 },
  profitable_growth_pe:       { eqAbStep: 4.0, eqBcStep: 4.0, bsAbStep: 2.0, bsBcStep: 3.0 },
  profitable_growth_ev_ebit:  { eqAbStep: 3.0, eqBcStep: 3.0, bsAbStep: 1.5, bsBcStep: 2.0 },
  cyclical_earnings:          { eqAbStep: 2.0, eqBcStep: 2.0, bsAbStep: 1.0, bsBcStep: 1.5 },
  sales_growth_standard:      { eqAbStep: 2.0, eqBcStep: 1.75, bsAbStep: 1.0, bsBcStep: 1.75 },
  sales_growth_hyper:         { eqAbStep: 2.0, eqBcStep: 1.75, bsAbStep: 1.0, bsBcStep: 1.75 },
  // financial_special_case, not_applicable, manual_required: no threshold derivation
} as const;
```

**Rationale for larger steps in `profitable_growth_pe`:** The base multiple is 36x (vs 22x for `mature_pe`). The same percentage-style quality risk deserves larger absolute downgrade steps when the starting point is higher. This preserves the framework principle that quality differences matter proportionally.

### Growth Tier Config (`profitable_growth_pe` only)

The `profitable_growth_pe` regime supports three growth tiers. The base table row (36/30/24/18) represents the `high` tier (≥35% growth). `mid` and `standard` tiers substitute a different base quad before quality downgrade. Spread compresses alongside the maximum — see ADR-017 §Growth Tier Overlay for rationale.

```typescript
const GROWTH_TIER_CONFIG = {
  high:     { minGrowth: 0.35, base: { max: 36, comfortable: 30, veryGood: 24, steal: 18 } },
  mid:      { minGrowth: 0.25, base: { max: 30, comfortable: 25, veryGood: 21, steal: 17 } },
  standard: { minGrowth: 0.20, base: { max: 26, comfortable: 22, veryGood: 19, steal: 16 } },
} as const;
```

`null` `revenueGrowthFwd` → treated as `high` (data gap does not penalise). Applies only to `profitable_growth_pe`; all other regimes ignore this config.

### Threshold Family Label

Each computed threshold result is labeled with a `threshold_family` string. For `profitable_growth_pe`: `{regime}_{tier}_{EQ}{BS}` (e.g. `profitable_growth_pe_mid_BA`). For all other regimes: `{regime}_{EQ}{BS}` (e.g. `mature_pe_BA`). This replaces `derived_from_code` for new records. `derived_from_code` is preserved in the DB for historical records.

### `threshold_source` Values (Extended)

Existing values: `'anchored'`, `'derived'`, `'manual_override'`.

Added: `'regime_derived'` — threshold was derived from a `ValuationRegimeThreshold` base row + quality downgrade formula. The label `'anchored'` is preserved for any stock whose threshold was previously computed from the old `anchored_thresholds` table and has not been recomputed.

### Lookup Resolution Order (updated)

```
1. Manual override? → use it (source: 'manual_override')
2. Regime is not_applicable, financial_special_case, manual_required? → no thresholds
3. Lookup base family row from valuation_regime_thresholds by (valuation_regime, 'A', 'A')
4. Apply growth tier overlay (profitable_growth_pe only): substitute base quad from
   GROWTH_TIER_CONFIG for 'mid' or 'standard' tier; all other regimes skip this step
5. Apply quality downgrade formula using regime's downgrade config (REGIME_DOWNGRADE_CONFIG)
6. Apply cyclical overlay (RFC-003 Amendment §Cyclical Overlay)
7. Apply secondary adjustments (dilution, gross margin — unchanged)
8. Persist with source: 'regime_derived',
   threshold_family: '{regime}_{tier}_{EQ}{BS}' for profitable_growth_pe,
                     '{regime}_{EQ}{BS}' for all others
```

### AnchoredThreshold Freeze Protocol

- `anchored_thresholds` table: no new INSERT or UPDATE after 2026-04-27
- Existing 16 rows: preserved indefinitely for audit continuity
- Valuation engine: does not query `anchored_thresholds` after EPIC-008 migration
- Historical `valuation_state` records referencing `derived_from_code`: preserved; no backfill needed
- Migration: when EPIC-008 recomputes valuation for all tickers, `threshold_source` updates to `'regime_derived'` and `threshold_family` is populated; `derived_from_code` may be null for new records

### Provisional Values Notice

All base threshold values in `valuation_regime_thresholds` are **provisional** until calibration-basket validation is complete (EPIC-008 Step 7). Values must not be treated as final until that validation pass is approved.
