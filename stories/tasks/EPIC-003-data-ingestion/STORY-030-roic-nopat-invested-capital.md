# STORY-030 — ROIC: NOPAT / Invested Capital

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Fix the `roic` computation in both adapters. Currently both Tiingo and FMP adapters compute ROIC as `netIncome / (equity + debt)` — wrong in two ways: (1) net income includes the tax shield distortion that ROIC is meant to strip away, and (2) cash should be subtracted from invested capital since it is not a productive operating asset. The correct formula is `NOPAT / Invested Capital` where NOPAT = EBIT × (1 − effective_tax_rate) and Invested Capital = equity + debt − cash.

ROIC is a primary signal in earnings quality scoring (EPIC-004) and is strategically important for identifying companies with sustainable competitive advantages.

## Story
As a **developer**,
I want **`roic` to be computed as NOPAT / Invested Capital using TTM EBIT, effective tax rate, total equity, total debt, and cash** —
so that **the classification engine uses the correct measure of capital efficiency, not a net-income proxy**.

## Outcome
- `roic` = `nopat_ttm / invested_capital` where:
  - `nopat_ttm` = TTM EBIT × (1 − effective_tax_rate)
  - `effective_tax_rate` = TTM tax expense / TTM pre-tax income (clamped to [0.0, 0.50])
  - `invested_capital` = total_equity + total_debt − cash_and_equivalents
- `roic` = null if invested_capital ≤ 0 or EBIT unavailable
- `roic` uses TTM data (4-quarter sum from Tiingo), not single annual period (FMP)
- Tiingo is the primary source (TTM granularity); FMP fallback uses most recent annual period

## Scope In

### Task 1 — Tiingo adapter: fix ROIC formula with TTM NOPAT
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`

**Current (wrong):**
```typescript
const investedCapital = equity != null && debt != null ? equity + debt : null;
const roic = investedCapital != null && investedCapital !== 0
  ? ttmEarnings / investedCapital : null;
```

**Fix:**

New TTM DataCode sums needed (add to the existing TTM loop):
```typescript
const ttmEbit = sumIncome(ttmQ, 'ebit');
const ttmTaxExp = sumIncome(ttmQ, 'taxExp');        // income tax expense
const ttmPretaxInc = sumIncome(ttmQ, 'pretaxinc');  // income before tax
```

**Pre-implementation verification required:** Confirm `taxExp` and `pretaxinc` are valid Tiingo income statement DataCodes. Run a live call to `/tiingo/fundamentals/{ticker}/statements` for AAPL and inspect the DataCode list. If DataCodes differ, update accordingly.

Balance sheet (from latest quarter `quarters[0]`):
```typescript
const cash = latestBalance.cashAndEq ?? null;  // DataCode: cashAndEq (confirmed in STORY-026 Fix 4)
// Note: shortTermInvestments not available from Tiingo balance sheet fixtures — excluded from V1 IC formula
```

Computation:
```typescript
// Effective tax rate: use TTM, clamped to [0, 0.50] to avoid distortion from one-off items
const effectiveTaxRate =
  ttmPretaxInc > 0 && ttmTaxExp >= 0
    ? Math.min(ttmTaxExp / ttmPretaxInc, 0.50)
    : 0.25; // Use 25% statutory fallback if pretax income <= 0

const nopat = ttmEbit * (1 - effectiveTaxRate);

const investedCapital =
  equity != null && debt != null && cash != null
    ? equity + debt - cash
    : equity != null && debt != null
      ? equity + debt   // fallback: omit cash if unavailable
      : null;

const roic =
  investedCapital != null && investedCapital > 0 && ttmEbit !== 0
    ? nopat / investedCapital
    : null;
```

**Tax rate fallback rationale:** When a company has a loss year (pretaxInc ≤ 0), using 25% statutory rate is more accurate than 0% or a nonsensical negative rate. Document this in code.

### Task 2 — FMP adapter: fix ROIC formula using annual EBIT + tax rate
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts` — `fetchFundamentals()`

**Current (wrong):**
```typescript
const investedCapital = equity !== null && totalDebt !== null ? equity + totalDebt : null;
const roic = investedCapital !== null && investedCapital !== 0 && netIncome !== null
  ? netIncome / investedCapital : null;
```

**Fix:**

Extract additional fields from FMP income statement (most recent annual entry):
```typescript
const incomeTax = latest.incomeTaxExpense != null ? Number(latest.incomeTaxExpense) : null;
const pretaxIncome = latest.incomeBeforeTax != null ? Number(latest.incomeBeforeTax) : null;
const cash = latestBalance?.cashAndCashEquivalents != null
  ? Number(latestBalance.cashAndCashEquivalents) : null;
```

**Field name verification:** `incomeTaxExpense` and `incomeBeforeTax` are used in common FMP income statement responses. Verify against the existing `tests/fixtures/fmp-income-statement-response.json` fixture — if field names differ, update. `cashAndCashEquivalents` is **confirmed** in `tests/fixtures/fmp-balance-sheet-response.json`.

Computation (same logic as Tiingo):
```typescript
const effectiveTaxRate =
  pretaxIncome != null && pretaxIncome > 0 && incomeTax != null && incomeTax >= 0
    ? Math.min(incomeTax / pretaxIncome, 0.50)
    : 0.25;

const nopat = ebit != null ? ebit * (1 - effectiveTaxRate) : null;

const investedCapital =
  equity !== null && totalDebt !== null && cash !== null
    ? equity + totalDebt - cash
    : equity !== null && totalDebt !== null
      ? equity + totalDebt
      : null;

const roic =
  nopat !== null && investedCapital !== null && investedCapital > 0
    ? nopat / investedCapital
    : null;
```

### Task 3 — Update `FundamentalData` canonical type
**File:** `src/modules/data-ingestion/types.ts` (or wherever `FundamentalData` is defined)

No new fields needed on the canonical type — `roic` already exists. The computation is internal to each adapter.

However, document the formula change in the type definition comment:
```typescript
roic?: number | null;  // NOPAT / Invested Capital; NOPAT = TTM EBIT × (1 - effective_tax_rate); IC = equity + debt - cash
```

### Task 4 — Fundamentals sync service: provenance for roic
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`

`roic` is already tracked in `buildUpdateFromFundamentals()` (lines 80–84). No change needed to the mapping — the formula fix happens in the adapter. Provenance entry for `roic` continues to use `result.source_provider` (tiingo or fmp).

### Task 5 — Update FMP income statement fixture
**File:** `tests/fixtures/fmp-income-statement-response.json`

Add `incomeTaxExpense` and `incomeBeforeTax` fields if not already present. Verify and update with realistic AAPL values (FY2023: income tax ~$29.9B, pre-tax income ~$113.7B → effective rate ~26.3%).

### Task 6 — Integration tests
**File:** `tests/integration/data-ingestion/roic.test.ts`

Test cases:
- AAPL `roic` ≈ 35–55% (SA: AAPL ROIC ~45% — very high due to low/negative IC from massive buybacks)
- MSFT `roic` ≈ 20–35% (SA: MSFT ROIC ~25%)
- TSLA `roic` ≈ 5–20% (lower; capital-intensive)
- Company with invested_capital ≤ 0: `roic = null` (not infinity or negative)
  - Note: AAPL may actually have negative invested capital (equity < 0 due to buybacks) — if so, return null and document
- Company with loss year: `roic` uses 25% statutory tax rate, not negative rate
- Unit test: `computeROIC(ebit, taxRate, equity, debt, cash)` — zero IC guard, negative IC guard, tax clamp

## Scope Out
- Short-term investments in invested capital — not available from Tiingo balance sheet DataCodes; excluded from V1 formula; document as known simplification
- Storing `nopat` and `invested_capital` as separate columns — can be recomputed; not needed for V1
- Weighted average ROIC over 3 years — single-period TTM is standard for classification inputs

## Dependencies
- STORY-026 Fix 4 (net_debt_to_ebitda) establishes `cashAndEq` DataCode usage in Tiingo balance sheet — confirms `cashAndEq` is a valid DataCode
- STORY-026 Fix 6 (cash_and_equivalents populated from FMP) — `cashAndCashEquivalents` confirmed in FMP balance sheet fixture
- Tiingo `taxExp` and `pretaxinc` DataCode verification — required before implementation

## Acceptance Criteria
- [ ] Tiingo adapter: ROIC uses NOPAT / (equity + debt − cash), not netIncome / (equity + debt)
- [ ] FMP adapter: same formula fix
- [ ] AAPL `roic`: non-null result (handle negative IC edge case gracefully — return null if IC ≤ 0)
- [ ] MSFT `roic` ≈ 20–35% (SA validation)
- [ ] Effective tax rate clamped to [0, 0.50] — no negative or >50% rates written to DB
- [ ] 25% statutory fallback used when pretax income ≤ 0
- [ ] Unit test for null guard when invested_capital ≤ 0
- [ ] `data_provider_provenance.roic` entry present after sync
- [ ] No regression in STORY-023 or STORY-024 suites

## Test Strategy
- Integration tests: AAPL, MSFT, TSLA ROIC within reasonable SA range (wide tolerance: ±10pp due to IC variability from buybacks)
- Unit tests: formula edge cases (negative IC, zero IC, loss year, missing cash)
- Regression: all existing tests pass

## Definition of Done
- [ ] Tiingo adapter ROIC formula fixed
- [ ] FMP adapter ROIC formula fixed
- [ ] FMP income statement fixture updated with tax fields
- [ ] Tiingo DataCodes `taxExp`/`pretaxinc` verified from live API call
- [ ] Integration tests passing for MSFT, TSLA (AAPL may return null due to negative IC)
- [ ] Implementation log updated
- [ ] Story status updated to `done`

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Fundamentals Sync; RFC-002 stocks table
- ADR: ADR-001 (Tiingo primary for fundamentals)
- Downstream: EPIC-004 classification engine (roic is a secondary earnings quality signal — used when non-null; classification engine must handle null gracefully)

## Notes
- **AAPL ROIC edge case:** Apple's aggressive buyback program means total stockholders' equity can be negative (~−$4B as of 2023). This makes invested capital (equity + debt − cash) potentially negative or very small. The standard response is to return `null` when IC ≤ 0, since ROIC is undefined (or infinitely positive) in that scenario. EPIC-004 must handle null gracefully — Apple is not impaired by null ROIC; it's a sign of exceptional capital efficiency.
- **Tax rate cap at 50%:** Anomalous years (large deferred tax liabilities, one-time items) can produce apparent tax rates > 50%. Capping at 50% prevents an unrealistically low NOPAT distorting the ROIC computation.
