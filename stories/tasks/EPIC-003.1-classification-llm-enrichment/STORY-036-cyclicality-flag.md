# STORY-036 — cyclicality_flag: Sector Heuristic + LLM

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, unit_verified — 7/7 tests passing)

## Purpose
`cyclicality_flag` is used by RFC-001 to modify bucket scoring for businesses whose earnings and revenue are highly correlated with macroeconomic cycles. Currently always FALSE.

Two-level detection:
1. Sector rules → deterministic TRUE or FALSE for unambiguous sectors (no LLM call)
2. Ambiguous sectors (including `null`) → LLM call with business description

Note: Like STORY-035, this detector is for unit-testability. In production, STORY-038's combined sync makes one LLM call per stock covering all three flags together.

## Story
As a **developer**,
I want **`cyclicality_flag` set via sector-based deterministic rules with LLM enrichment for ambiguous sectors** —
so that **cyclical businesses are correctly identified and the RFC-001 bucket scorer produces appropriate results**.

## Outcome
- Materials, Energy → `TRUE` deterministically
- Consumer Staples, Healthcare, Utilities → `FALSE` deterministically
- Technology, Consumer Discretionary, Industrials, Financials, Communication Services, Real Estate, `null` → LLM call
- Confidence < threshold → null (not written); provenance records null decision
- LLM error → null (no throw); error recorded in provenance
- Provenance: `{ provider: "deterministic_heuristic", method: "sector_rule" }` or `{ provider: "claude", method: "llm", ... }`

**Real Estate in LLM bucket:** cyclicality is highly business-model-dependent within Real Estate (residential vs. industrial vs. hotel REITs). Blanket FALSE is incorrect.

**null sector in LLM bucket:** no sector data → cannot apply rule → LLM with available fields.

## Dependencies
- STORY-034 ✅ (LLMProvider + PromptLoader)
- STORY-035 ✅ (FlagDetectionResult, DetectorOutput, ProvenanceEntry LLM fields all defined)
- STORY-018 ✅ (sector in DB)

---

## BDD Scenarios

### Scenario A — Deterministic TRUE
```
Given stock with sector = "Materials"
When detectCyclicalityFlag is called
Then flag = true, no LLM call
And provenance.provider = "deterministic_heuristic", method = "sector_rule"
```

### Scenario B — Deterministic FALSE
```
Given stock with sector = "Consumer Staples"
When detectCyclicalityFlag is called
Then flag = false, no LLM call
And provenance.provider = "deterministic_heuristic", method = "sector_rule"
```

### Scenario C — Ambiguous sector → LLM
```
Given stock with sector = "Technology"
When detectCyclicalityFlag is called
Then LLM called with company description
```

### Scenario D — Real Estate → LLM (not hardcoded)
```
Given stock with sector = "Real Estate"
When detectCyclicalityFlag is called
Then LLM called (Real Estate is not in either deterministic list)
```

### Scenario E — LLM low confidence → null
```
Given LLM returns confidence = 0.35
When detectCyclicalityFlag is called
Then flag = null, null_decision = true in provenance
```

### Scenario F — LLM error → null
```
Given LLM throws Error
When detectCyclicalityFlag is called
Then flag = null, no throw, error = true in provenance
```

---

## Test Plan

| Test | What it proves | Pass criteria |
|------|---------------|---------------|
| Materials → TRUE, no LLM | deterministic TRUE | flag=true, LLM not called |
| Energy → TRUE, no LLM | deterministic TRUE (second TRUE sector) | flag=true, LLM not called |
| Consumer Staples → FALSE, no LLM | deterministic FALSE | flag=false, LLM not called |
| Technology → LLM called | ambiguous sector escalates | LLM called once |
| Real Estate → LLM called | Real Estate not hardcoded FALSE | LLM called once |
| LLM confidence 0.35 → null | below-threshold gating | flag=null, null_decision=true |
| LLM API error → null, no throw | error isolation | flag=null, error=true in prov |

Total: 7 tests

---

## Tasks

### TASK-036-001 — Write `cyclicality-flag.md` prompt body
**File:** `src/modules/classification-enrichment/prompts/cyclicality-flag.md` (replace stub)
**Status:** ready

**Prompt variables:** `{{company_name}}`, `{{sector}}`, `{{industry}}`, `{{description}}`

**Prompt body:**
```
You are a financial analyst assistant. Your task is to determine whether a publicly traded company is cyclical.

A cyclical company is one whose revenue and earnings show significant sensitivity to macroeconomic cycles — materially higher growth during economic expansions and materially lower growth or losses during recessions, driven by demand sensitivity rather than company-specific factors.

Examples of cyclical companies: steel producers, commodity miners, auto manufacturers, airlines, hotel chains, luxury goods companies.

Examples of non-cyclical (defensive) companies: grocery retailers, pharmaceutical companies, utilities, software subscription businesses with long-term contracts.

Company: {{company_name}}
Sector: {{sector}}
Industry: {{industry}}

Business description:
{{description}}

Based on the sector, industry, and business description, assess whether this company's business is primarily cyclical.
```

---

### TASK-036-002 — Implement `CyclicalityDetector`
**File:** `src/modules/classification-enrichment/detectors/cyclicality.detector.ts` (new file)
**Status:** ready | **Depends on:** TASK-036-001

**Input interface:**
```typescript
export interface CyclicalityInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
}
```

**Sector rule sets:**
```typescript
const CYCLICAL_SECTORS = new Set(['Materials', 'Energy']);
const DEFENSIVE_SECTORS = new Set(['Consumer Staples', 'Healthcare', 'Utilities']);
```

**Logic:**
```
if sector in CYCLICAL_SECTORS  → { flag: true,  provenance: { provider: 'deterministic_heuristic', method: 'sector_rule', confidence: 1.0, synced_at } }
if sector in DEFENSIVE_SECTORS → { flag: false, provenance: { provider: 'deterministic_heuristic', method: 'sector_rule', confidence: 1.0, synced_at } }
else (including null sector)   → LLM call (same pattern as HoldingCompanyDetector)
```

**Prompt path:** `path.join(process.cwd(), 'src/modules/classification-enrichment/prompts/cyclicality-flag.md')`

**Response schema:**
```typescript
const CYCLICALITY_SCHEMA = {
  type: 'object',
  properties: {
    flag_value: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
  },
  required: ['flag_value', 'confidence', 'reason'],
};
```

**LLM path, confidence gating, error isolation:** identical pattern to `holding-company.detector.ts`.

Null-safe variable defaults: `sector ?? ''`, `industry ?? ''`, `description ?? ''`, `company_name ?? ''`.

---

### TASK-036-003 — Unit tests
**File:** `tests/unit/classification-enrichment/story-036-cyclicality-flag.test.ts` (new file)
**Status:** ready | **Depends on:** TASK-036-001, TASK-036-002

**Mock structure:** same as STORY-035 — `jest.mock('fs')`, `jest.requireActual` for real detector, plain object `mockProvider`.

**Total: 7 tests**

---

## Acceptance Criteria
- [ ] Materials/Energy return TRUE with no LLM call
- [ ] Consumer Staples/Healthcare/Utilities return FALSE with no LLM call
- [ ] Real Estate goes to LLM (not hardcoded FALSE)
- [ ] null sector goes to LLM
- [ ] LLM errors do not propagate
- [ ] 7/7 unit tests passing
- [ ] No new TypeScript errors
- [ ] Implementation log updated, story status → done
