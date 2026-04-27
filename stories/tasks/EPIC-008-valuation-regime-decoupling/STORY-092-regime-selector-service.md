# STORY-092 — RegimeSelectorService: selectRegime() Implementation

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Implement the deterministic regime selector (ADR-017 Steps 0A–6) as a pure function. This function takes stock financial characteristics and classification flags and returns one of 9 `ValuationRegime` values. It replaces the indirect metric-from-bucket logic of `MetricSelector` (EPIC-005) as the primary routing logic. The `MetricSelector` is superseded but not deleted — it remains for any path that relies on code alone.

## Story
As the system,
I want a deterministic `selectRegime()` function that maps stock financials + classification flags to a `ValuationRegime`,
so that the correct threshold family is assigned based on earnings structure rather than bucket alone.

## Outcome
`src/domain/valuation/regime-selector.ts` implements `selectRegime(input: RegimeSelectorInput): ValuationRegime` per ADR-017. All 9 regimes are reachable; all precedence rules are preserved.

## Scope In

### `RegimeSelectorInput` interface
New interface (separate from `ValuationInput` — regime selector only needs financial characteristics):

```typescript
interface RegimeSelectorInput {
  activeCode: string;             // for bucket extraction
  bankFlag: boolean;
  insurerFlag: boolean;
  holdingCompanyFlag: boolean;
  preOperatingLeverageFlag: boolean;
  netIncomeTtm: number | null;
  freeCashFlowTtm: number | null;
  operatingMarginTtm: number | null;
  grossMarginTtm: number | null;
  fcfConversionTtm: number | null;  // freeCashFlowTtm / netIncomeTtm
  revenueGrowthFwd: number | null;
  structuralCyclicalityScore: number;  // 0–3
}
```

### `selectRegime(input: RegimeSelectorInput): ValuationRegime`

Steps per ADR-017:

```
Step 0A: bucket = 8 → not_applicable
Step 0B: bankFlag = true → manual_required
Step 0C: insurerFlag = true → financial_special_case
Step 0D: holdingCompanyFlag = true → financial_special_case

Step 1: (sales-valued growth path)
  fires if:
    !net_income_positive
    OR (op_margin < 0.10 AND rev_growth_fwd >= 0.10)
    OR pre_operating_leverage_flag
  → sales_growth_hyper if rev_growth_fwd >= 0.40 AND gross_margin >= 0.70
  → sales_growth_standard otherwise

Step 2: (profitable high-growth PE)
  fires if:
    rev_growth_fwd >= 0.20 (non-null)
    AND op_margin >= 0.25
    AND net_income_positive
    AND fcf_positive
    AND fcf_conversion >= 0.60
  → profitable_growth_pe

Step 3: (cyclical earnings)
  fires if:
    structural_cyclicality_score >= 1
    AND net_income_positive
    AND op_margin >= 0.10
  → cyclical_earnings

Step 4: (profitable transitional EV/EBIT)
  fires if:
    rev_growth_fwd >= 0.15 (non-null)
    AND net_income_positive AND fcf_positive
    AND op_margin >= 0.10 AND op_margin < 0.25
  → profitable_growth_ev_ebit

Step 5: (mature PE default)
  fires if:
    net_income_positive AND fcf_positive
  → mature_pe

Step 6: catch-all → manual_required
```

**Score-3 routing:** When `structuralCyclicalityScore === 3` AND stock would otherwise qualify Step 2 (profitable_growth_pe), Step 3 is re-entered. Step 2 check includes: `if structuralCyclicalityScore >= 3 AND step2Conditions: return 'cyclical_earnings'`.

**Derived helpers inside `selectRegime()`:**
- `netIncomePositive = netIncomeTtm != null && netIncomeTtm > 0`
- `fcfPositive = freeCashFlowTtm != null && freeCashFlowTtm > 0`
- `bucket = parseBucket(activeCode)` (shared utility)

## Precedence Rationale (from ADR-017 — preserved in code comments)
1. Bucket 8 first — no model for lottery stocks
2. Bank flag before other special cases — banks fully outside framework
3. Insurer/holding company before income tests — non-standard earnings bases
4. Sales-valued path before PE — unprofitable names must not reach PE regimes
5. Step 2 before Step 3 — NVIDIA-like qualify Step 2 before cyclical routing
6. Step 4 before Step 5 — transitional growth names get EV/EBIT not mature PE

## Scope Out
- Growth tier selection (within profitable_growth_pe) — STORY-093
- Cyclical overlay computation — STORY-093
- Threshold assignment — STORY-093
- Integration into computeValuation() — STORY-094
- `fcfConversionTtm` computation (already in stock_derived_metrics from EPIC-003)

## Dependencies
- STORY-089 ✅ (`ValuationRegime` type defined in types.ts)
- STORY-090 ✅ (bank_flag populated on stock)

## Preconditions
- `ValuationRegime` union type exists in `src/domain/valuation/types.ts`
- `RegimeSelectorInput` type defined in same file or regime-selector.ts

## Tasks

### TASK-092-001: TypeScript types for RegimeSelectorInput
- Add `RegimeSelectorInput` interface to `src/domain/valuation/types.ts`
- Or co-locate in `src/domain/valuation/regime-selector.ts`

### TASK-092-002: `selectRegime()` implementation
- File: `src/domain/valuation/regime-selector.ts`
- Implement all 6 steps + score-3 routing
- Add traceability comments: `// ADR-017 Step 0B — bank_flag` etc.
- Add precedence rationale as block comment at top of function
- `parseBucket(activeCode): number` utility (reuse from metric-selector if available)
- Traceability: `// EPIC-008/STORY-092/TASK-092-002`

### TASK-092-003: Unit tests — all regime paths
- File: `tests/unit/domain/valuation/regime-selector.test.ts`

**Test cases (named after representative stocks):**

| Input profile | Expected regime |
|---|---|
| Bucket 8 | `not_applicable` |
| bankFlag = true, any financials | `manual_required` |
| insurerFlag = true | `financial_special_case` |
| holdingCompanyFlag = true | `financial_special_case` |
| net_income_positive=false, rev_growth≥40%, gross_margin≥70% | `sales_growth_hyper` |
| net_income_positive=false, rev_growth=25% | `sales_growth_standard` |
| op_margin 4% (< 10%), rev_growth 15% (≥ 10%) → Step 1 fires | `sales_growth_standard` |
| op_margin 4% (< 10%), rev_growth 5% (< 10%) → Step 1 does NOT fire | falls through |
| NVDA-like: op_margin 65%, rev_growth 70%, fcf_conv 0.81, score=2 | `profitable_growth_pe` |
| NVDA-like with score=3 | `cyclical_earnings` (score-3 override) |
| MU-like: profitable but fcf_conv 0.40 (< 0.60), cyclical score≥1 | `cyclical_earnings` |
| WMT-like: profitable, fcf_positive, low growth | `mature_pe` |
| Transitional: op_margin 15%, rev_growth 20%, net/fcf positive | `profitable_growth_ev_ebit` |
| Loss-making with negative FCF | `manual_required` |
| JPM-like (bank_flag=true) | `manual_required` |
| BRK-like (insurer+holding) | `financial_special_case` (insurer fires first) |

**Edge cases:**
- `rev_growth_fwd = null` → Step 2 fails (null doesn't satisfy ≥ 0.20)
- `fcf_conversion_ttm = null` → Step 2 fails
- Both netIncomePositive=true and fcfPositive=false → skips Step 2 and Step 5; falls to Step 4 or 6
- `op_margin = exactly 0.10` → Step 1 op_margin condition does NOT fire (requires < 0.10)
- `op_margin = exactly 0.25` → Step 2 requires ≥ 0.25 → fires at exactly 0.25
- WMT fix: op_margin 4.47%, rev_growth_fwd 5% → Step 1 does NOT fire (rev_growth < 0.10)

## Acceptance Criteria
- [ ] All 9 `ValuationRegime` values are reachable via unit tests
- [ ] `bank_flag = true` → `manual_required` regardless of all other inputs
- [ ] `insurer_flag + holding_company_flag` both true → `financial_special_case` (insurer check runs first)
- [ ] Score-3 stock that would qualify Step 2 → routed to `cyclical_earnings`
- [ ] WMT (op_margin 4.47%, rev_growth 5%): Step 1 does NOT fire → falls to Step 5 → `mature_pe`
- [ ] `rev_growth_fwd = null` → Step 2 and Step 4 both fail
- [ ] `selectRegime()` is a pure function: same input → same output; no I/O
- [ ] All unit tests pass

## Test Strategy
- Unit tests: 20+ cases covering all regime paths + edge cases listed above
- No DB dependency (pure function)
- Describe blocks: `describe('ADR-017 Step 0A'), describe('ADR-017 Step 1'), …`
