# STORY-033 — Deterministic Classification Flags

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
done ✅ (2026-04-21, unit_verified — 23/23 tests passing)

## Purpose
Three classification flags can be computed deterministically without LLM calls. This completes EPIC-003's contribution to the **deterministic** classification dataset — LLM-based flags (`holding_company_flag`, `cyclicality_flag`, `binary_flag`) and qualitative scores are EPIC-003.1.

## Story
As a **developer**,
I want **`material_dilution_flag`, `insurer_flag`, and `pre_operating_leverage_flag` computed deterministically and persisted for each stock** —
so that **the classification engine has correct values for these flags without LLM calls, and EPIC-003.1 only needs to handle the genuinely ambiguous cases**.

## Outcome
- `material_dilution_flag = TRUE` when `share_count_growth_3y > 0.05` (>5% annualized over 3 years)
- `insurer_flag = TRUE` when FMP industry string matches any known insurance/managed-care value (see rule below)
- `pre_operating_leverage_flag = TRUE` when revenue or earnings thresholds indicate pre-inflection stage
- All three written with `provider: "deterministic_heuristic"` in provenance
- NULL for a flag (not written) when the required input data is absent
- No schema migrations needed (columns already exist)

## Flag Rules and Threshold Rationale

### material_dilution_flag
Rule: `share_count_growth_3y > 0.05`
Rationale: At 5% annualized dilution, a 3-year holder has ~15.8% of their economic stake eroded. This is the standard materiality threshold used in equity research for ongoing dilution. Grounded in 3AA Balance Sheet Quality Scorer — dilution is penalized in the grade-B/C boundary.

Threshold precision: exactly 5.00% (`0.05`) → FALSE; 5.01% (`0.0501`) → TRUE.

### insurer_flag
Rule: FMP `industry` field matches any of the following strings (case-insensitive, exact match on FMP's taxonomy):
- "Insurance - Life"
- "Insurance - Property & Casualty"
- "Insurance - Diversified"
- "Insurance - Specialty"
- "Insurance - Reinsurance"
- "Managed Care"
- "Health Insurance"

Note: Cigna (CI) and UnitedHealth (UNH) use FMP `industry = "Managed Care"` — must be enumerated explicitly. Do **not** use `contains "Insurance"` substring — misses managed care cases.

### pre_operating_leverage_flag
Rule:
- `revenueTtm === null` → null (not written)
- `revenueTtm < 50_000_000` → TRUE
- `revenueTtm < 200_000_000 AND earningsTtm !== null AND earningsTtm < 0` → TRUE
- all other non-null revenue cases → FALSE
  - (earningsTtm null AND revenue 50M–200M → FALSE; can't confirm loss condition)

## Dependencies Satisfied
- STORY-032 ✅ (`share_count_growth_3y` written to DB)
- STORY-018 ✅ (`industry` column populated from universe sync)
- STORY-027/028 ✅ (`revenue_ttm`, `earningsTtm` in DB from fundamentals sync)
- EPIC-002 ✅ admin auth pattern available

## Scope In
1. `computeDeterministicFlags()` pure function
2. `syncDeterministicClassificationFlags()` job
3. `POST /api/admin/sync/deterministic-flags` route
4. Unit tests (all in TASK-033-004 alongside task specs)

## Scope Out
- LLM-based flags (`holding_company_flag`, `cyclicality_flag`, `binary_flag`) — EPIC-003.1
- Qualitative E-scores — EPIC-003.1

---

## BDD Scenarios

### Scenario A — material_dilution_flag: positive dilution above threshold
```
Given a stock with share_count_growth_3y = 0.06 (6% annualized)
When computeDeterministicFlags is called
Then materialDilutionFlag = TRUE
```

### Scenario B — material_dilution_flag: exactly at threshold
```
Given a stock with share_count_growth_3y = 0.05 (exactly 5%)
When computeDeterministicFlags is called
Then materialDilutionFlag = FALSE (threshold is exclusive)
```

### Scenario C — material_dilution_flag: null input
```
Given a stock with share_count_growth_3y = null (not yet synced)
When computeDeterministicFlags is called
Then materialDilutionFlag = null (flag not written to DB)
```

### Scenario D — insurer_flag: managed care (Cigna/UHC case)
```
Given a stock with industry = "Managed Care"
When computeDeterministicFlags is called
Then insurerFlag = TRUE
```

### Scenario E — insurer_flag: non-insurer financial services
```
Given a stock with industry = "Diversified Financial Services"
When computeDeterministicFlags is called
Then insurerFlag = FALSE
```

### Scenario F — pre_operating_leverage_flag: sub-$50M revenue
```
Given a stock with revenueTtm = 30_000_000 (< $50M)
When computeDeterministicFlags is called
Then preOperatingLeverageFlag = TRUE
```

### Scenario G — pre_operating_leverage_flag: null revenue
```
Given a stock with revenueTtm = null
When computeDeterministicFlags is called
Then preOperatingLeverageFlag = null (flag not written to DB)
```

### Scenario H — sync job: all non-null flags written with provenance
```
Given a stock where all three inputs are non-null
When syncDeterministicClassificationFlags runs
Then DB update is called with all three flags and correct provenance shape
And provenance for each flag includes provider: "deterministic_heuristic", method: "rule_based", synced_at
```

### Scenario I — sync job: all-null flags skipped
```
Given a stock where all inputs (industry, shareCountGrowth3y, revenueTtm) are null
When syncDeterministicClassificationFlags runs
Then DB update is NOT called
And result.skipped increments by 1
```

---

## Test Plan

| Test | What it proves | Pass criteria |
|------|---------------|---------------|
| materialDilutionFlag: null input | null propagates correctly | returns null |
| materialDilutionFlag: 5.00% | threshold exclusive | returns false |
| materialDilutionFlag: 5.01% | threshold exclusive | returns true |
| materialDilutionFlag: negative (buybacks) | negative CAGR | returns false |
| insurerFlag: null input | null propagates | returns null |
| insurerFlag: "Insurance - Life" | exact match works | returns true |
| insurerFlag: "Insurance - Property & Casualty" | exact match works | returns true |
| insurerFlag: "Insurance - Reinsurance" | exact match works | returns true |
| insurerFlag: "Managed Care" | managed care explicit | returns true |
| insurerFlag: "Health Insurance" | health insurance explicit | returns true |
| insurerFlag: "Diversified Financial Services" | no false positive | returns false |
| preOperatingLeverageFlag: null revenueTtm | null propagates | returns null |
| preOperatingLeverageFlag: < 50M | revenue threshold | returns true |
| preOperatingLeverageFlag: 100M + earnings < 0 | mid-revenue + loss | returns true |
| preOperatingLeverageFlag: 100M + earnings null | null earnings no escalation | returns false |
| preOperatingLeverageFlag: 100M + earnings > 0 | profitable mid-rev | returns false |
| preOperatingLeverageFlag: > 200M + loss | revenue dominates | returns false |
| sync: writes all non-null flags + provenance | DB write shape | update called with correct fields |
| sync: skips all-null | DB not called | update not called, skipped++ |
| sync: mixed null flags (2 of 3 non-null) | partial write | update called with only non-null fields |
| admin route: 200 on valid key | auth pass | status 200, body = sync result |
| admin route: 401 on invalid key | auth reject | status 401 |

Total: 22 tests

---

## Tasks

### TASK-033-001 — `computeDeterministicFlags()` pure function
**File:** `src/modules/data-ingestion/jobs/deterministic-classification-sync.service.ts` (new file, create with this task)
**Status:** ready

**Signature:**
```typescript
// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-001: computeDeterministicFlags() pure function

const INSURER_INDUSTRIES = new Set([
  'insurance - life',
  'insurance - property & casualty',
  'insurance - diversified',
  'insurance - specialty',
  'insurance - reinsurance',
  'managed care',
  'health insurance',
]);

export interface DeterministicFlagsInput {
  industry: string | null;
  shareCountGrowth3y: number | null;
  revenueTtm: number | null;
  earningsTtm: number | null;
}

export interface DeterministicFlagsResult {
  materialDilutionFlag: boolean | null;
  insurerFlag: boolean | null;
  preOperatingLeverageFlag: boolean | null;
}

export function computeDeterministicFlags(input: DeterministicFlagsInput): DeterministicFlagsResult
```

**Logic (exact):**
- `materialDilutionFlag`: `input.shareCountGrowth3y === null ? null : input.shareCountGrowth3y > 0.05`
- `insurerFlag`: `input.industry === null ? null : INSURER_INDUSTRIES.has(input.industry.toLowerCase())`
- `preOperatingLeverageFlag`:
  - `input.revenueTtm === null` → `null`
  - `input.revenueTtm < 50_000_000` → `true`
  - `input.revenueTtm < 200_000_000 && input.earningsTtm !== null && input.earningsTtm < 0` → `true`
  - else → `false`

**Acceptance:** Pure function, no imports from DB or external modules. Returns `null` when required input is null (not `false`).

---

### TASK-033-002 — `syncDeterministicClassificationFlags()` job
**File:** `src/modules/data-ingestion/jobs/deterministic-classification-sync.service.ts` (same file as TASK-033-001)
**Status:** ready | **Depends on:** TASK-033-001

**Signature:**
```typescript
export interface DeterministicFlagsSyncResult {
  updated: number;
  skipped: number;
}

export async function syncDeterministicClassificationFlags(): Promise<DeterministicFlagsSyncResult>
```

**DB read:** `prisma.stock.findMany({ where: { inUniverse: true }, select: { ticker, industry, shareCountGrowth3y, revenueTtm, earningsTtm, dataProviderProvenance } })`

**Decimal conversion:** `shareCountGrowth3y` and `revenueTtm` and `earningsTtm` are `Prisma.Decimal | null` from schema. Convert with `stock.shareCountGrowth3y !== null ? Number(stock.shareCountGrowth3y) : null` before passing to `computeDeterministicFlags`.

**Write logic:**
- Build `data: Prisma.StockUpdateInput = {}` from non-null flags only
- Build `provenanceUpdates: Record<string, unknown> = {}` per non-null flag
- If `Object.keys(data).length === 0` → `skipped++; continue`
- Provenance per flag: `{ provider: 'deterministic_heuristic', method: 'rule_based', synced_at: new Date().toISOString() }`
- Merge pattern: `{ ...currentProv, ...provenanceUpdates }` (preserves other keys)
- One `prisma.stock.update` per stock written
- Return `{ updated, skipped }`

**No try/catch per stock** — errors propagate (differs from share-count-sync). Rationale: deterministic computation never throws from data; if DB fails it should surface. (If future requirement adds error isolation, update here.)

**Logging:** `share_count_sync_start` → loop → `deterministic_flags_sync_complete` with `{ updated, skipped }`.

---

### TASK-033-003 — Admin route `POST /api/admin/sync/deterministic-flags`
**File:** `src/app/api/admin/sync/deterministic-flags/route.ts` (new file, new directory)
**Status:** ready | **Depends on:** TASK-033-002

```typescript
// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-003: POST /api/admin/sync/deterministic-flags
// Auth: validateAdminApiKey (EPIC-002 admin pattern — ADR-011)

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-auth';
import { syncDeterministicClassificationFlags } from '@/modules/data-ingestion/jobs/deterministic-classification-sync.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await syncDeterministicClassificationFlags();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'deterministic_flags_sync_route_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

### TASK-033-004 — Unit tests
**File:** `tests/unit/data-ingestion/story-033-deterministic-flags.test.ts` (new file)
**Status:** ready | **Depends on:** TASK-033-001 through TASK-033-003

**Mock structure (all at top level for jest hoisting):**
```typescript
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: { stock: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } }
}));
jest.mock('@/lib/admin-auth', () => ({ validateAdminApiKey: jest.fn() }));
jest.mock('../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service', () => ({
  syncDeterministicClassificationFlags: jest.fn(),
}));
```

**Section 1: `computeDeterministicFlags()` — 17 tests**
Uses `jest.requireActual` to get real function from the mocked module.

**Section 2: `syncDeterministicClassificationFlags()` — 3 tests**
Uses `jest.requireActual` to get real function; mocks `prisma.stock.findMany` and `prisma.stock.update`.

For Decimal simulation, mock `findMany` returning objects with values wrapped as:
```typescript
const toDecimal = (v: number) => ({ toNumber: () => v, toString: () => String(v) });
```
But since the service uses `Number(stock.shareCountGrowth3y)`, and `Number({ toNumber: ... })` will be `NaN` — use plain numbers in mock data OR test using the Number() conversion. Actually the service code will call `Number(prismaDecimalValue)` — `Number` on a Prisma Decimal object returns `NaN` because Prisma Decimal extends Decimal.js and has a `.toNumber()` method but `Number()` may not work directly.

**Important:** The service must use `.toNumber()` not `Number()` for Prisma Decimal fields. Use:
```typescript
shareCountGrowth3y !== null ? (shareCountGrowth3y as unknown as { toNumber(): number }).toNumber() : null
```
Or cast via `Prisma.Decimal`:
```typescript
import type { Prisma } from '@prisma/client';
// ...
stock.shareCountGrowth3y !== null ? stock.shareCountGrowth3y.toNumber() : null
```

In tests, mock data can just use plain number-like objects with `.toNumber()`:
```typescript
const d = (v: number) => ({ toNumber: () => v });
```
Then when the service calls `.toNumber()` it works. Mock findMany returns `{ ticker: 'AAPL', industry: 'Technology', shareCountGrowth3y: d(0.06), revenueTtm: d(100_000_000_000), earningsTtm: d(25_000_000_000), dataProviderProvenance: {} }`.

**Test cases for sync service:**
1. writes all three non-null flags + correct provenance (stock with all inputs non-null)
2. skips stock when all flags resolve to null (industry null, shareCountGrowth3y null, revenueTtm null)
3. partial write: only non-null flags written (e.g. industry non-null but shareCountGrowth3y null → only insurerFlag written)

**Section 3: admin route — 2 tests**
Uses the top-level mock of `syncDeterministicClassificationFlags`. Follow same pattern as STORY-032 route tests: mock `FMPAdapter` not needed (route doesn't instantiate it).

**Total: 22 tests**

---

## Acceptance Criteria
- [ ] `insurerFlag` returns TRUE for "Managed Care" (Cigna/UHC case)
- [ ] `insurerFlag` returns FALSE for "Diversified Financial Services"
- [ ] `materialDilutionFlag` at exactly 5.00% returns FALSE; 5.01% returns TRUE
- [ ] NULL inputs for any flag result in that flag not being written (not defaulted to FALSE)
- [ ] `preOperatingLeverageFlag` null when `revenueTtm` is null
- [ ] Admin route uses existing admin auth middleware
- [ ] 22/22 unit tests passing
- [ ] No new TypeScript errors introduced
- [ ] Implementation log updated, story status → done
