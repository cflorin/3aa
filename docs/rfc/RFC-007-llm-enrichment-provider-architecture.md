# RFC-007: LLM Enrichment Provider Architecture

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-21
**Dependencies:** RFC-001 (Classification Engine), RFC-004 (Data Ingestion Pipeline), ADR-012 (LLM Enrichment Decision)
**Creates New Decisions:** YES
**Refines Existing:** RFC-004 (adds LLM as a data source type)

---

## Context / Problem

EPIC-003.1 introduces LLM-based enrichment for classification flags and qualitative scores. The LLM provider must be:
- **Swappable** — user must be able to change API key or switch to a different LLM provider without touching enrichment logic
- **Versioned** — prompts must be reviewable and editable as plain text files; prompt changes must not require code deployments
- **Auditable** — every LLM decision must record model identifier, prompt version, confidence, and reasoning summary in provenance

---

## Goals

1. Define abstract `LLMProvider` interface used by all enrichment jobs
2. Specify concrete `ClaudeProvider` implementation for V1.0
3. Establish prompt file conventions (location, format, versioning)
4. Define structured output contract for flag detection and qualitative scoring
5. Specify confidence gating and provenance recording
6. Specify error handling and fallback behavior

---

## Non-Goals

1. Using LLM at classification engine invocation time (data enrichment only — ADR-012)
2. Fine-tuning or embedding models (V1 uses off-the-shelf API)
3. Multi-turn conversation flows (single structured-output calls only)
4. Real-time LLM calls (batch job only — ADR-002)

---

## High-Level Architecture

```
Classification Enrichment Pipeline (EPIC-003.1)
    │
    ├── DeterministicPreFilters (per stock, no LLM)
    │       ├── SIC heuristic → holding_company_flag (SIC 6710–6726)
    │       ├── Sector rules → cyclicality_flag (Materials/Energy TRUE; Staples/Healthcare FALSE)
    │       ├── Biotech rule → binary_flag (pre-revenue Healthcare)
    │       └── Large-cap exclusion → binary_flag FALSE (market_cap > $10B, non-Healthcare/Financials/Energy)
    │
    └── Combined LLM Enrichment (ONE call per stock, only if needed)
            │
            ├── LLMProvider (abstract interface)
            │       └── ClaudeProvider (concrete V1.0)
            │
            ├── PromptLoader
            │       └── loads plain .md files from src/modules/classification-enrichment/prompts/
            │
            └── ClassificationEnrichmentSync job
                    └── combined-enrichment.md → SINGLE call per stock returns:
                            ├── holding_company flag (if not determined by SIC)
                            ├── cyclicality flag (if not determined by sector rule)
                            ├── binary_risk flag (if not excluded by large-cap rule)
                            └── E1–E6 qualitative scores (moat, pricing power, etc.)
```

**Key constraint:** At most ONE LLM call per stock per enrichment run. Deterministic pre-filters run first; the combined call covers only fields the pre-filters could not determine. Stocks where all three flags are determined deterministically still receive one LLM call for E1–E6 scores (with pre-computed flag values passed as context for consistency).

---

## LLMProvider Interface

```typescript
// EPIC-003.1: STORY-034
// src/modules/classification-enrichment/ports/llm-provider.interface.ts

interface LLMProviderConfig {
  apiKey: string;
  model: string;           // pinned per run, e.g. "claude-sonnet-4-6"
  maxTokens?: number;
  timeoutMs?: number;
}

interface LLMResponse<T> {
  result: T;
  model: string;           // actual model used (may differ from requested if deprecated)
  promptVersion: string;   // hash of prompt content used
  inputTokens: number;
  outputTokens: number;
}

interface LLMProvider {
  readonly providerName: string;  // e.g. "claude", "openai"

  /**
   * Send a structured-output prompt and return a typed result.
   * @param promptContent  Full prompt text (loaded from prompt file by caller)
   * @param variables      Template variables to interpolate into prompt
   * @param responseSchema JSON Schema describing the expected output shape
   */
  structuredComplete<T>(
    promptContent: string,
    variables: Record<string, unknown>,
    responseSchema: object
  ): Promise<LLMResponse<T>>;
}
```

---

## ClaudeProvider Implementation

```typescript
// src/modules/classification-enrichment/providers/claude.provider.ts

class ClaudeProvider implements LLMProvider {
  readonly providerName = 'claude';

  constructor(private readonly config: LLMProviderConfig) {}

  async structuredComplete<T>(
    promptContent: string,
    variables: Record<string, unknown>,
    responseSchema: object
  ): Promise<LLMResponse<T>> {
    const interpolated = interpolateTemplate(promptContent, variables);
    const promptVersion = sha256(promptContent).slice(0, 8);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 1024,
        tools: [{ name: 'output', input_schema: responseSchema }],
        tool_choice: { type: 'tool', name: 'output' },
        messages: [{ role: 'user', content: interpolated }],
      }),
    });

    // parse tool_use block → typed result
    // ...
    return { result, model: this.config.model, promptVersion, inputTokens, outputTokens };
  }
}
```

Provider is instantiated once in the application module and injected into enrichment services. API key comes from environment variable `ANTHROPIC_API_KEY` (or `LLM_API_KEY` for provider-agnostic configuration).

---

## Prompt File Conventions

### Location

```
src/modules/classification-enrichment/prompts/
  combined-enrichment.md    ← PRIMARY: single operational prompt used by classificationEnrichmentSync
  holding-company-flag.md   ← standalone flag prompt (for documentation + single-flag admin use)
  cyclicality-flag.md       ← standalone flag prompt
  binary-flag.md            ← standalone flag prompt
```

`combined-enrichment.md` is the primary runtime prompt. It covers all three ambiguous flags and all six E1–E6 scores in a single call. Individual flag prompts exist for documentation, review, and optional standalone use.

### Format

Prompt files are **plain text Markdown** — no YAML frontmatter, no embedded schemas. The output schema (JSON Schema object) lives in the TypeScript detector code next to the call site and is passed as `responseSchema` to `LLMProvider.structuredComplete()`.

This keeps prompt files maximally readable as plain text while keeping schema changes co-located with the code that interprets them.

Template variables use `{{variable_name}}` syntax. Example (fragment):

```markdown
You are a financial analyst assistant performing classification enrichment for an investment monitoring system.

Company: {{company_name}}
Sector: {{sector}}
Industry: {{industry}}
Revenue (TTM): {{revenue_ttm_billions}} billion USD
Market Cap: {{market_cap_billions}} billion USD
Business description: {{description}}

{{deterministic_flags_context}}

Assess the following dimensions...
```

### Versioning

Prompt files are tracked in git. `promptVersion` stored in provenance is the first 8 characters of SHA-256 of the raw file content. Any edit to a prompt file changes its version hash. The sync job's recomputation trigger detects hash drift and automatically re-enriches affected stocks on the next weekly run.

**Prompt changes do not require code changes.** The `PromptLoader` reads files at runtime.

---

## Structured Output Contracts

### Combined Enrichment Call (primary — one call per stock)

```typescript
// responseSchema passed to LLMProvider.structuredComplete() by detectCombinedEnrichment()
interface CombinedEnrichmentResult {
  // Three ambiguous flags (each includes per-flag confidence)
  holding_company: { flag: boolean; confidence: number; reason: string };
  cyclicality:     { flag: boolean; confidence: number; reason: string };
  binary_risk:     { flag: boolean; confidence: number; reason: string };

  // Qualitative scores — 1.0–5.0, half-integer steps, rounded before DB write
  moat_strength_score: number;
  pricing_power_score: number;
  revenue_recurrence_score: number;
  margin_durability_score: number;
  capital_intensity_score: number;       // 1=asset-light, 5=heavy capex
  qualitative_cyclicality_score: number; // 1=counter-cyclical, 5=highly cyclical

  scores_confidence: number;    // shared 0–1 confidence for the six score values
  reasoning_summary: string;   // ≤150 chars, auditable rationale
}
```

### Standalone Flag Detection (used by individual detectors in unit tests / admin single-flag ops)

```typescript
// Used by HoldingCompanyDetector, CyclicalityDetector, BinaryFlagDetector standalone paths
interface FlagDetectionResult {
  flag_value: boolean;
  confidence: number;   // 0–1
  reason: string;       // ≤200 chars
}
```

Score semantics (canonical — also documented in combined-enrichment.md prompt):

| Score | 1 | 3 | 5 |
|-------|---|---|---|
| moat_strength | No competitive moat | Some differentiation | Very wide, durable moat |
| pricing_power | Price-taker (commodity) | Some pricing flexibility | Proven ability to raise prices above inflation |
| revenue_recurrence | Entirely project/transactional | Mixed | Fully recurring (subscription/long-term contract) |
| margin_durability | Structural decline | Stable but exposed | Moat-protected, expanding margin |
| capital_intensity | Asset-light (minimal capex) | Moderate | Heavy ongoing capex (utilities, autos, semis) |
| qualitative_cyclicality | Counter-cyclical | Neutral | Highly cyclical, recession-sensitive |

---

## Confidence Gating

**Per-flag confidence** (from `CombinedEnrichmentResult.holding_company.confidence` etc.):
```
if (flag.confidence >= 0.60):  write flag value to DB
else:                           retain existing value; record null decision in provenance
```

**Scores confidence** (shared `scores_confidence` for all six scores):
```
if (scores_confidence >= 0.60):  write all 6 scores to DB
else:                             write no scores; record null decision for all 6 in provenance
```

Individual score-level confidence gating is not used — if the overall enrichment call has low confidence, no scores are trustworthy. Null decision is still recorded as auditable provenance.

Threshold configurable via `LLM_ENRICHMENT_CONFIDENCE_THRESHOLD` env var (default 0.60).

---

## Provenance Shape

Extends existing `dataProviderProvenance` JSONB. No new DB columns needed.

All fields come from a single combined LLM call. Flags and scores share the same `prompt_file` and `prompt_version` (both come from `combined-enrichment.md`). Flags have individual confidence; scores share `scores_confidence`.

```json
{
  "holding_company_flag": {
    "provider": "claude",
    "model": "claude-sonnet-4-6",
    "prompt_file": "combined-enrichment.md",
    "prompt_version": "a3f7b2c1",
    "synced_at": "2026-04-21T02:00:00.000Z",
    "confidence": 0.87,
    "method": "llm"
  },
  "cyclicality_flag": {
    "provider": "deterministic_heuristic",
    "method": "sector_rule",
    "synced_at": "2026-04-21T02:00:00.000Z",
    "confidence": 1.0
  },
  "insurer_flag": {
    "provider": "deterministic_heuristic",
    "method": "industry_string_match",
    "synced_at": "2026-04-21T02:00:00.000Z",
    "confidence": 1.0
  },
  "moat_strength_score": {
    "provider": "claude",
    "model": "claude-sonnet-4-6",
    "prompt_file": "combined-enrichment.md",
    "prompt_version": "a3f7b2c1",
    "synced_at": "2026-04-21T02:00:00.000Z",
    "confidence": 0.74,
    "method": "llm"
  }
}
```

Note: `moat_strength_score` through `qualitative_cyclicality_score` all share the same provenance entry shape (same call, same prompt_version, same scores_confidence value).

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| LLM API error (5xx, timeout) | Retain existing DB value; record `{ error: true, error_message: "..." }` in provenance; retry on next scheduled run |
| confidence < 0.60 | Retain existing value; record null decision with confidence in provenance |
| JSON parse failure | Same as API error |
| Rate limit hit | Exponential backoff, max 3 retries; if all fail, mark stock as skipped in run summary |
| Full job failure | Do not mark any flags as updated; log error; next scheduled run retries full batch |

---

## Configuration

```typescript
// Environment variables
ANTHROPIC_API_KEY=sk-ant-...          // or LLM_API_KEY for provider-agnostic naming
LLM_PROVIDER=claude                   // selects which concrete provider to instantiate
LLM_MODEL=claude-sonnet-4-6          // pinned model; change triggers re-enrichment
LLM_ENRICHMENT_CONFIDENCE_THRESHOLD=0.60
LLM_ENRICHMENT_MAX_TOKENS=1024
```

---

## Scheduling and Recomputation Triggers

Classification enrichment sync runs weekly (Sunday 02:00 UTC). A stock is included in an incremental run if ANY of the following triggers are true:

1. No existing provenance for any classification flag (new stock)
2. `data_last_synced_at > NOW() - 30 days` (underlying data refreshed)
3. Any flag/score provenance `prompt_version` ≠ current hash of `combined-enrichment.md`
4. Any flag/score provenance `model` ≠ current `LLM_MODEL` env var
5. Any flag/score provenance has `error: true`

Triggers 3 and 4 ensure that prompt edits and model upgrades automatically propagate to all affected stocks on the next weekly run without a forced full-run.

Full re-enrichment: admin endpoint `POST /api/admin/enrichment/run-full`.

---

## Decisions Made (superseding Open Questions from original draft)

1. **Env var name:** `ANTHROPIC_API_KEY` for V1 (provider-specific clarity). The `LLMProvider` interface abstracts the key usage — switching providers means swapping the concrete class, not changing the env var contract.
2. **Template interpolation:** Simple `{{variable}}` replacement only. No template engine dependency. `PromptLoader` throws on missing variable (fail-fast, not silent substitution).
3. **Prompt file format:** Plain text `.md` only — no YAML frontmatter. Output schema lives in TypeScript next to the detector.
4. **Call volume:** One combined LLM call per stock maximum. Separate per-flag calls are not used in production (only in unit tests for individual detectors).
