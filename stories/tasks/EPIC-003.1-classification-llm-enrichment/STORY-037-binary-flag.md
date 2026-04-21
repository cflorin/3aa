# STORY-037 — binary_flag: Heuristic + Targeted LLM

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, unit_verified — 8/8 tests passing)

## Purpose
`binary_flag` forces any stock to Bucket 8 (RFC-001 highest-priority override). Currently always FALSE. LLM calls are gated to a targeted cohort — the large-cap exclusion removes ~600–700 of ~1,000 universe stocks from the weekly LLM run.

Three-level detection:
1. Pre-revenue biotech → TRUE deterministically (no LLM)
2. Large-cap non-Healthcare/Financials/Energy → FALSE deterministically (no LLM)
3. Everything else → LLM call

## Story
As a **developer**,
I want **`binary_flag` set for pre-revenue biotech via heuristic and for targeted risk cohorts via LLM, with large-cap non-Healthcare/Financials/Energy stocks excluded from LLM calls** —
so that **binary-risk names are correctly identified without incurring LLM costs for the bulk of the universe**.

## Outcome
- `sector = "Healthcare" AND revenue_ttm < 50_000_000` → TRUE, no LLM
- `market_cap > 10_000_000_000 AND sector ∉ {Healthcare, Financials, Energy}` → FALSE, no LLM
- All other stocks → LLM call
- `market_cap = null` → cannot apply large-cap exclusion → falls to LLM
- `revenue_ttm = null` for Healthcare → cannot confirm pre-revenue → falls to LLM (not TRUE)
- Confidence < threshold → null; LLM error → null

## Dependencies
- STORY-034 ✅ (LLMProvider + PromptLoader)
- STORY-035 ✅ (FlagDetectionResult, DetectorOutput)
- STORY-027 ✅ (market_cap and revenue_ttm in DB)

---

## BDD Scenarios

### Scenario A — Pre-revenue biotech
```
Given sector = "Healthcare" AND revenue_ttm = 10_000_000 (< $50M)
When detectBinaryFlag is called
Then flag = true, no LLM call
And provenance.method = "pre_revenue_biotech"
```

### Scenario B — Large-cap Tech (AAPL)
```
Given sector = "Technology" AND market_cap = 3_000_000_000_000 (> $10B)
When detectBinaryFlag is called
Then flag = false, no LLM call
And provenance.method = "large_cap_exclusion"
```

### Scenario C — Large-cap Healthcare (JNJ) → LLM not excluded
```
Given sector = "Healthcare" AND market_cap = 400_000_000_000
When detectBinaryFlag is called
Then LLM called (Healthcare not excluded by large-cap rule)
```

### Scenario D — Small-cap Tech → LLM called
```
Given sector = "Technology" AND market_cap = 6_000_000_000 (≤ $10B)
When detectBinaryFlag is called
Then LLM called
```

### Scenario E — LLM low confidence → null
```
Given LLM returns confidence = 0.45
When detectBinaryFlag is called
Then flag = null, null_decision = true
```

---

## Test Plan

| Test | What it proves | Pass criteria |
|------|---------------|---------------|
| Pre-revenue biotech (HC, rev<50M) → TRUE, no LLM | Level 1 fires | flag=true, LLM not called |
| Large-cap Tech (>$10B, non-HC/Fin/Energy) → FALSE, no LLM | Level 2 fires | flag=false, LLM not called |
| Large-cap Healthcare → LLM called | HC exempt from Level 2 | LLM called |
| Small-cap Tech (≤$10B) → LLM called | Level 2 doesn't fire | LLM called |
| LLM TRUE high confidence | LLM path TRUE | flag=true, claude provenance |
| LLM FALSE high confidence | LLM path FALSE | flag=false, claude provenance |
| LLM confidence 0.45 → null | below-threshold gating | flag=null, null_decision=true |
| LLM error → null, no throw | error isolation | flag=null, error=true |

Total: 8 tests

---

## Tasks

### TASK-037-001 — Write `binary-flag.md` prompt body
**File:** `src/modules/classification-enrichment/prompts/binary-flag.md` (replace stub)
**Status:** ready

**Variables:** `{{company_name}}`, `{{sector}}`, `{{industry}}`, `{{description}}`, `{{revenue_ttm_billions}}`, `{{market_cap_billions}}`

**Prompt body:**
```
You are a financial analyst assistant. Your task is to determine whether a publicly traded company has significant binary risk.

A company has binary risk when its near-term equity value depends primarily on a specific binary outcome — a single event (drug trial result, litigation verdict, regulatory approval, contract award, resource discovery, debt refinancing) that could plausibly cause a 50% or greater change in equity value in either direction within the next 12–24 months.

Most large, established companies do NOT have binary risk. Binary risk is most common in:
- Clinical-stage biotech/pharma awaiting FDA approval
- Small exploration-stage energy/mining companies
- Companies with a single major contract at risk of non-renewal
- Companies in material litigation where an adverse judgment would be existential

Company: {{company_name}}
Sector: {{sector}}
Industry: {{industry}}
Revenue (TTM): ${{revenue_ttm_billions}}B
Market Cap: ${{market_cap_billions}}B

Business description:
{{description}}

Based on the above, does this company have significant binary risk as defined above?
```

---

### TASK-037-002 — Implement `BinaryFlagDetector`
**File:** `src/modules/classification-enrichment/detectors/binary-flag.detector.ts` (new file)
**Status:** ready | **Depends on:** TASK-037-001

**Input interface:**
```typescript
export interface BinaryFlagInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  revenue_ttm: number | null;
  market_cap: number | null;
}
```

**Constants:**
```typescript
const PRE_REVENUE_THRESHOLD = 50_000_000;
const LARGE_CAP_THRESHOLD = 10_000_000_000;
const LLM_GATE_SECTORS = new Set(['Healthcare', 'Financials', 'Energy']);
```

**Logic (exact):**
```
Level 1 — Deterministic TRUE:
  if sector === 'Healthcare' && revenue_ttm !== null && revenue_ttm < PRE_REVENUE_THRESHOLD:
    return { flag: true, provenance: { provider: 'deterministic_heuristic', method: 'pre_revenue_biotech', confidence: 1.0, synced_at } }

Level 2 — Deterministic FALSE (large-cap exclusion):
  if market_cap !== null && market_cap > LARGE_CAP_THRESHOLD && sector !== null && !LLM_GATE_SECTORS.has(sector):
    return { flag: false, provenance: { provider: 'deterministic_heuristic', method: 'large_cap_exclusion', confidence: 1.0, synced_at } }

Level 3 — LLM:
  variables: {
    company_name: stock.company_name ?? '',
    sector: stock.sector ?? '',
    industry: stock.industry ?? '',
    description: stock.description ?? '',
    revenue_ttm_billions: stock.revenue_ttm !== null ? (stock.revenue_ttm / 1e9).toFixed(2) : 'N/A',
    market_cap_billions: stock.market_cap !== null ? (stock.market_cap / 1e9).toFixed(2) : 'N/A',
  }
```

**Prompt path:** `path.join(process.cwd(), 'src/modules/classification-enrichment/prompts/binary-flag.md')`

**LLM path, confidence gating, error isolation:** same pattern as STORY-035/036.

---

### TASK-037-003 — Unit tests
**File:** `tests/unit/classification-enrichment/story-037-binary-flag.test.ts` (new file)
**Status:** ready | **Depends on:** TASK-037-001, TASK-037-002

**Mock structure:** same pattern — `jest.mock('fs')`, `jest.requireActual`, plain object `mockProvider`.

**Total: 8 tests**

---

## Acceptance Criteria
- [ ] Pre-revenue biotech returns TRUE without LLM call, `method: "pre_revenue_biotech"`
- [ ] Large-cap Tech (>$10B) returns FALSE without LLM call, `method: "large_cap_exclusion"`
- [ ] Large-cap Healthcare goes to LLM (Healthcare exempt from large-cap exclusion)
- [ ] null market_cap falls to LLM (cannot apply exclusion)
- [ ] LLM errors do not propagate
- [ ] 8/8 unit tests passing
- [ ] No new TypeScript errors
- [ ] Implementation log updated, story status → done
