# STORY-090 — Bank Flag Derivation (Deterministic Classification Flag)

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Derive `bank_flag` deterministically from stock characteristics (SIC code, sector, industry). Banks and financial institutions are fully outside the automated valuation framework — EV/EBIT is meaningless for banks and P/E requires loan-loss normalisation beyond framework scope. The flag must fire before any regime selector logic runs (Step 0B in ADR-017).

## Story
As the system,
I want `bank_flag` set deterministically on each in-universe stock,
so that banks and financial institutions are immediately routed to `manual_required` in the regime selector without passing through profitability-based steps.

## Outcome
`bank_flag` is populated on all in-universe stocks via a deterministic rule function. The flag is populated during the classification pipeline run (same cadence as other deterministic flags — EPIC-003, STORY-033). Re-derivation is triggered when sector/industry/SIC changes.

## Scope In

### `deriveBankFlag(stock)` rule function
A pure function in `src/domain/classification/flags/bank-flag.ts`.

**Input fields (from `stock` table):**
- `sic_code` (string or null)
- `sector` (string or null)
- `industry` (string or null)

**V1 implementation: sector + industry string matching (primary and only method)**

The `stock` table does not include a `sic_code` column. V1 uses `sector` and `industry` string matching. A SIC-based upgrade path is noted for future stories if `sic_code` is ever added to the schema.

**Match rules (case-insensitive, substring match):**

| sector | industry | bank_flag |
|---|---|---|
| "Financial Services" | contains "Banks" | true |
| "Financial Services" | contains "Capital Markets" | true |
| "Financial Services" | contains "Credit Services" | true |
| "Financial Services" | contains "Diversified Financial" | true |
| "Financial Services" | contains "Insurance" | false — insurer_flag domain |
| "Financial Services" | contains "Asset Management" | false — neither flag |
| any | "Real Estate Investment Trusts" | false — neither flag |
| any sector not "Financial Services" | any | false |

**Explicit exclusions (must NOT set bank_flag):**
- Insurance industry → insurer_flag domain, not bank_flag
- Asset management, REIT → neither flag

**Returns:** `boolean`

> **Future upgrade path:** When `sic_code` is added to the schema, the function can be upgraded to use SIC ranges (6020–6036 commercial banks, 6200–6211 brokers/dealers) as the primary check with sector/industry as a fallback. For V1, sector/industry is sufficient to correctly classify JPM, BAC, GS, MS as bank_flag=true.

### Integration with classification pipeline
- Add `bank_flag` computation to `StockDeterministicFlagsService` (or equivalent — the service that runs STORY-033 flags)
- Run on every nightly sync pass and on `addStockToUniverse` pipeline
- Persist result to `stock.bank_flag`

### Non-overlap invariant
`bank_flag` and `insurer_flag` must not both be true for the same stock. If both fire (theoretically possible for a bancassurance conglomerate), `insurer_flag` takes precedence (holding_company_flag style — Step 0C fires). Log a warning. In practice this should not occur for any calibration-set stock.

## Scope Out
- Regime selector logic — STORY-092
- UI display of bank_flag — STORY-095
- Manual override of bank_flag — out of scope (use `primary_metric_override` if user disagrees)

## Dependencies
- STORY-089 ✅ (bank_flag column exists on stock)
- STORY-033 ✅ (DeterministicFlagsService pattern established)
- EPIC-003 ✅ (sector, industry fields populated on stocks)

## Preconditions
- `stock.bank_flag` column exists (STORY-089)
- `stock.sector` and `stock.industry` are populated for representative stocks (confirmed: both columns exist in schema)

## Tasks

### TASK-090-001: `deriveBankFlag()` pure function
- File: `src/domain/classification/flags/bank-flag.ts`
- Function signature: `deriveBankFlag(input: { sector: string | null; industry: string | null }): boolean`
- Implement sector/industry string matching per match rules table above (case-insensitive)
- Traceability: `// EPIC-008/STORY-090/TASK-090-001`

### TASK-090-002: Non-overlap guard
- In `deriveBankFlag()`: if industry contains "Insurance", return false (insurer_flag takes precedence by ADR-017 Step 0B/0C ordering)
- Add comment explaining precedence

### TASK-090-003: Integration into DeterministicFlagsService
- Add `deriveBankFlag()` call in the existing deterministic flags computation
- Persist `bank_flag` to `stock` table
- Add to existing `shouldRecomputeFlags()` triggers: sector change, industry change
- Also wire into `addStockToUniverse` pipeline (same pipeline entry point as other deterministic flags)

### TASK-090-004: Unit tests
- `deriveBankFlag()`:
  - sector "Financial Services", industry "Banks" → true
  - sector "Financial Services", industry "Capital Markets" → true
  - sector "Financial Services", industry "Credit Services" → true
  - sector "Financial Services", industry "Insurance" → false (insurer domain, non-overlap guard)
  - sector "Financial Services", industry "Asset Management" → false
  - sector "Technology", industry "Semiconductors" → false
  - sector null, industry null → false
  - Both bank + insurer match → false (non-overlap guard enforced)
- Integration test: after flags run, JPM-mock.bank_flag = true; NVDA-mock.bank_flag = false; MS-mock.bank_flag = true

## Acceptance Criteria
- [ ] `deriveBankFlag()` is a pure function with no DB dependency
- [ ] sector "Financial Services" + industry "Banks" → `bank_flag = true` (JPM, BAC-like)
- [ ] sector "Financial Services" + industry "Capital Markets" → `bank_flag = true` (GS, MS-like)
- [ ] sector "Technology" → `bank_flag = false` (NVDA, MSFT-like)
- [ ] sector "Financial Services" + industry "Insurance" → `bank_flag = false` (BRK-like; non-overlap guard)
- [ ] Non-overlap: insurer + bank conditions → bank_flag = false, insurer_flag = true
- [ ] Bank_flag re-derived on sector/industry change

## Test Strategy
- Unit tests: pure function covering all SIC ranges, heuristic fallback, edge cases
- Integration test: flag pipeline run on test DB; assert bank_flag values for 6 representative stocks
