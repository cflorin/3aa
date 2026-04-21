# STORY-035 — holding_company_flag: SIC Heuristic + LLM

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, unit_verified — 7/7 tests passing; BC-035-001 confirmed)

## Purpose
`holding_company_flag` is used by RFC-001's tie-break resolver to redirect holding companies with stalwart growth profiles from Bucket 4/5 to Bucket 3. Currently always FALSE.

Two-level detection:
1. SIC codes 6710–6726 → TRUE deterministically (no LLM call)
2. All other stocks → LLM call with company description (no intermediate keyword heuristic)

Note: This story implements the standalone `HoldingCompanyDetector`. In production, `classificationEnrichmentSync` (STORY-038) makes a single combined call per stock covering all three flags together. This detector exists for unit-testability and for potential single-flag admin overrides.

## Story
As a **developer**,
I want **`holding_company_flag` auto-detected via SIC heuristic with LLM fallback** —
so that **holding companies receive correct bucket assignments from the RFC-001 tie-break resolver**.

## Outcome
- SIC 6710–6726 → `holding_company_flag = TRUE` deterministically
- All other stocks → LLM call; confidence ≥ 0.60 → write result; confidence < 0.60 → null (not written)
- LLM API error → null returned (no throw); error recorded in provenance
- Provenance: `{ provider: "deterministic_heuristic", method: "sic_code", confidence: 1.0 }` or `{ provider: "claude", model, prompt_file, prompt_version, confidence, method: "llm" }`

## BC-035-001 anticipated
Story spec assumes FMP `/profile` returns `sic` field. If FMP stable tier does not return `sic`, all stocks fall through to LLM path — document as BC-035-001 in implementation log. SIC heuristic code remains in detector for when `sic_code` IS provided (synthetic test fixtures cover it). Do NOT add a second API call to fetch SIC.

## Dependencies
- STORY-034 ✅ (LLMProvider, PromptLoader)
- FMP profile endpoint (Task 1 of this story — verify `description` and `sic` field availability)

---

## BDD Scenarios

### Scenario A — SIC in range
```
Given stock with sic_code = "6719" (Berkshire Hathaway)
When detectHoldingCompanyFlag is called
Then flag = true, no LLM call made
And provenance.provider = "deterministic_heuristic", method = "sic_code", confidence = 1.0
```

### Scenario B — SIC null → LLM high confidence TRUE
```
Given stock with sic_code = null and description = "holding company that owns..."
When detectHoldingCompanyFlag is called
Then LLM called once; flag = true
And provenance.provider = "claude", method = "llm", confidence ≥ 0.60
```

### Scenario C — LLM low confidence
```
Given LLM returns confidence = 0.40
When detectHoldingCompanyFlag is called
Then flag = null (not written to DB)
And provenance.null_decision = true, confidence = 0.40 recorded
```

### Scenario D — LLM API error
```
Given LLM throws Error("network error")
When detectHoldingCompanyFlag is called
Then flag = null (not thrown)
And provenance.error = true, error_message recorded
```

---

## Test Plan

| Test | What it proves | Pass criteria |
|------|---------------|---------------|
| SIC 6719 → TRUE, no LLM call | SIC heuristic fires | flag=true, LLM not called |
| SIC outside range → LLM called | SIC heuristic does not fire | LLM called |
| sic_code null → LLM called | null SIC goes to LLM | LLM called |
| LLM confidence 0.9 TRUE → flag=true | high-conf TRUE path | flag=true, llm provenance |
| LLM confidence 0.9 FALSE → flag=false | high-conf FALSE path | flag=false, llm provenance |
| LLM confidence 0.4 → null | below-threshold gating | flag=null, null_decision=true |
| LLM API error → null, no throw | error isolation | flag=null, error=true in prov |

Total: 7 tests

---

## Tasks

### TASK-035-001 — Extend StockMetadata + fetchMetadata() + extend ProvenanceEntry
**Files:** `src/modules/data-ingestion/types.ts` (modify), `src/modules/data-ingestion/adapters/fmp.adapter.ts` (modify)
**Status:** ready

**StockMetadata additions:**
```typescript
/** Company business description — from FMP profile; null if not returned */
description: string | null;
/** FMP SIC code string (e.g. "6719") — null if not returned by stable profile endpoint */
sicCode: string | null;
```

**fetchMetadata() additions:**
```typescript
description: item.description ? String(item.description) : null,
sicCode: item.sic ? String(item.sic) : null,
```

**FMP profile investigation:** Check live FMP `/profile` response for AAPL to confirm whether `description` and `sic` fields are present. If `sic` absent → `sicCode: null` for all stocks → log BC-035-001.

**ProvenanceEntry extensions** (same task — same types.ts file):
```typescript
export interface ProvenanceEntry {
  // existing fields...
  model?: string;            // LLM model identifier (e.g. "claude-sonnet-4-6")
  confidence?: number;       // 0–1 confidence from LLM response
  prompt_file?: string;      // prompt filename (e.g. "holding-company-flag.md")
  prompt_version?: string;   // sha256 of prompt content, first 8 chars
  null_decision?: boolean;   // true when confidence < threshold — flag not written
  error?: boolean;           // true when LLM call threw
  error_message?: string;    // error message from thrown error
}
```

**Regression:** Existing tests that construct `ProvenanceEntry` objects must still compile — all new fields are optional.

---

### TASK-035-002 — Write `holding-company-flag.md` prompt body
**File:** `src/modules/classification-enrichment/prompts/holding-company-flag.md` (replace stub)
**Status:** ready | **Depends on:** none (in parallel with TASK-035-001)

**Prompt variables:** `{{company_name}}`, `{{sector}}`, `{{industry}}`, `{{description}}`

**Prompt body:**
```markdown
You are a financial analyst assistant. Your task is to determine whether a publicly traded company is a holding company.

A holding company is one whose PRIMARY purpose is to own equity stakes in other companies (subsidiaries or portfolio companies) rather than directly operating a business itself. Examples: Berkshire Hathaway, Loews Corporation, Leucadia National.

A company is NOT a holding company if it:
- Operates its own business and may have subsidiaries that support that business
- Is described primarily by its products, services, customers, or markets
- Uses subsidiaries only for geographic or legal structuring

Company: {{company_name}}
Sector: {{sector}}
Industry: {{industry}}

Business description:
{{description}}

Based solely on the business description above, assess whether this company is primarily a holding company.
```

---

### TASK-035-003 — Implement `HoldingCompanyDetector`
**File:** `src/modules/classification-enrichment/detectors/holding-company.detector.ts` (new file, new directory)
**Status:** ready | **Depends on:** TASK-035-001, TASK-035-002

**Interfaces (defined in this file):**
```typescript
export interface HoldingCompanyInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  sic_code: string | null;
}

export interface FlagDetectionResult {
  flag_value: boolean;
  confidence: number;
  reason: string;
}

export interface DetectorOutput {
  flag: boolean | null;   // null = not written (low confidence or error)
  provenance: ProvenanceEntry;
}
```

**SIC range check:**
```typescript
const SIC_MIN = 6710;
const SIC_MAX = 6726;
function isHoldingCompanySic(sic: string): boolean {
  const n = parseInt(sic, 10);
  return !isNaN(n) && n >= SIC_MIN && n <= SIC_MAX;
}
```

**Response schema** (passed to `structuredComplete`):
```typescript
const HOLDING_COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    flag_value: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
  },
  required: ['flag_value', 'confidence', 'reason'],
};
```

**Confidence threshold:** read from `process.env.LLM_ENRICHMENT_CONFIDENCE_THRESHOLD`, default `0.60`.

**Prompt path:** resolved with `path.join(process.cwd(), 'src/modules/classification-enrichment/prompts/holding-company-flag.md')` — absolute path for `PromptLoader.load()`.

**detectHoldingCompanyFlag logic:**
```
if (sic_code !== null && isHoldingCompanySic(sic_code)):
  return { flag: true, provenance: { provider: 'deterministic_heuristic', method: 'sic_code', confidence: 1.0, synced_at } }

try:
  load prompt via PromptLoader (raw content, no variables yet — variables passed to structuredComplete)
  call llmProvider.structuredComplete<FlagDetectionResult>(rawPrompt, { company_name, sector, industry, description }, HOLDING_COMPANY_SCHEMA)
  if llmResult.result.confidence >= threshold:
    return { flag: llmResult.result.flag_value, provenance: { provider: 'claude', model: llmResult.model, prompt_file: 'holding-company-flag.md', prompt_version: llmResult.promptVersion, confidence: llmResult.result.confidence, method: 'llm', synced_at } }
  else:
    return { flag: null, provenance: { ..., null_decision: true, confidence: llmResult.result.confidence, synced_at } }
catch err:
  return { flag: null, provenance: { provider: 'claude', error: true, error_message: err.message, synced_at } }
```

**Null-safe variable defaults:** if `company_name`, `sector`, `industry`, or `description` is null, pass empty string `''` to template variables (prevents PromptLoader/ClaudeProvider from throwing on null values).

---

### TASK-035-004 — Unit tests
**File:** `tests/unit/classification-enrichment/story-035-holding-company-flag.test.ts` (new file)
**Status:** ready | **Depends on:** TASK-035-001 through TASK-035-003

**Mock structure (top-level for jest hoisting):**
```typescript
jest.mock('fs');        // for PromptLoader file reads in detector
jest.mock('path');     // not needed — detector uses path.join; mock fs instead
```

**PromptLoader:** mock `fs.readFileSync` to return prompt stub content (avoids disk dependency).

**LLMProvider:** use `mockProvider = { providerName: 'claude', structuredComplete: jest.fn() }` — plain object mock, no module mock needed.

**Test fixture (base input):**
```typescript
const BASE_INPUT: HoldingCompanyInput = {
  ticker: 'TEST',
  company_name: 'Test Corp',
  sector: 'Financials',
  industry: 'Diversified Financial Services',
  description: 'A company that operates various businesses.',
  sic_code: null,
};
```

**LLM mock response helper:**
```typescript
const mockLlmResponse = (flag: boolean, confidence: number) => ({
  result: { flag_value: flag, confidence, reason: 'test reason' },
  model: 'claude-test',
  promptVersion: 'abc12345',
  inputTokens: 100,
  outputTokens: 20,
});
```

**Total: 7 tests**

---

## Acceptance Criteria
- [ ] SIC 6719 (BRK.B) → TRUE without LLM call, provenance `method: "sic_code"`
- [ ] LLM API error → null returned, no throw, `error: true` in provenance
- [ ] Confidence < 0.60 → null returned, `null_decision: true` in provenance
- [ ] No keyword/substring heuristic anywhere in detector code
- [ ] 7/7 unit tests passing
- [ ] No new TypeScript errors
- [ ] Implementation log updated, story status → done
