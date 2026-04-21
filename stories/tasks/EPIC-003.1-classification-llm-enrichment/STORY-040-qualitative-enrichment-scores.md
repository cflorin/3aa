# STORY-040 — E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done

## Purpose
This story has two inseparable concerns:
1. Write the `combined-enrichment.md` prompt body — the single operational prompt used by `classificationEnrichmentSync` (STORY-038) that returns all three LLM-assessed flags plus all six E1–E6 scores in one call
2. Implement `EnrichmentScoresDetector` and extend the sync job to persist scores

The combined prompt design eliminates the contradiction risk from separate calls and reduces weekly LLM cost. All six qualitative scores (moat_strength, pricing_power, revenue_recurrence, margin_durability, capital_intensity, qualitative_cyclicality) feed into RFC-001's Earnings Quality Scorer as optional classification inputs.

## Story
As a **developer**,
I want **one combined LLM call per stock returning all three ambiguous flags plus all six E1–E6 scores, driven by a single reviewable prompt file** —
so that **all qualitative classification inputs are internally consistent, STORY-038's combined-call architecture is fully realized, and the prompt is a single file that can be reviewed and tuned manually**.

## Combined Output Schema
```typescript
// responseSchema passed to LLMProvider.structuredComplete()
interface CombinedEnrichmentResult {
  // Flags (only relevant for stocks where heuristics were inconclusive)
  holding_company: { flag: boolean; confidence: number; reason: string };
  cyclicality: { flag: boolean; confidence: number; reason: string };
  binary_risk: { flag: boolean; confidence: number; reason: string };

  // Qualitative scores (always computed)
  moat_strength_score: number;           // 1–5, half-integer steps
  pricing_power_score: number;
  revenue_recurrence_score: number;
  margin_durability_score: number;
  capital_intensity_score: number;       // 1 = asset-light, 5 = heavy capex
  qualitative_cyclicality_score: number; // 1 = counter-cyclical, 5 = highly cyclical

  scores_confidence: number;    // 0–1, overall confidence for the six scores
  reasoning_summary: string;   // ≤150 chars
}
```

Per-flag confidence is embedded within each flag object. Per-score confidence is one shared value (`scores_confidence`); individual score granularity is not useful enough to justify 6 separate confidence fields.

## Score Semantics (canonical, documented in RFC-001 and in prompt)
| Score | 1 | 3 | 5 |
|-------|---|---|---|
| moat_strength | No competitive moat | Some differentiation | Very wide, durable moat |
| pricing_power | Pure price-taker (commodity) | Some pricing flexibility | Proven ability to raise prices above inflation |
| revenue_recurrence | Entirely project/transactional | Mixed recurring + transactional | Fully recurring (subscription/long-term contract) |
| margin_durability | Structural decline, commodity pressure | Stable but exposed | Moat-protected, expanding margin |
| capital_intensity | Asset-light (minimal ongoing capex) | Moderate capex | Heavy ongoing capex (utilities, autos, semis) |
| qualitative_cyclicality | Counter-cyclical (grows in recessions) | Neutral | Highly cyclical, recession-sensitive demand |

Half-integer precision: scores rounded to nearest 0.5 before DB write (1.0, 1.5, 2.0, … 5.0). LLM may return fractional values; the detector rounds before persisting.

## Scope In

### Task 1 — Write `combined-enrichment.md` prompt body
Plain text. Variables:
- `{{company_name}}`, `{{sector}}`, `{{industry}}`, `{{description}}`
- `{{revenue_ttm_billions}}`, `{{market_cap_billions}}`
- `{{deterministic_flags}}` — a brief line summarizing flags already determined: e.g., "Note: cyclicality_flag has been set to TRUE by sector rules (Materials). Your cyclicality flag assessment should be consistent with this."

Prompt structure:
1. Context paragraph explaining the purpose (3AA classification inputs)
2. Six score definitions with 1/3/5 anchor points
3. Three flag definitions (holding_company, cyclicality, binary_risk) — asking LLM to confirm or assess each
4. Output format instruction (tool-use schema is passed separately by the code; the prompt just describes what to produce)

### Task 2 — Implement `EnrichmentScoresDetector`
```typescript
// src/modules/classification-enrichment/detectors/enrichment-scores.detector.ts
interface EnrichmentScoresInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  revenue_ttm: number | null;
  market_cap: number | null;
  deterministic_flags: {
    holding_company_flag: boolean | null;  // pass pre-computed value for context
    cyclicality_flag: boolean | null;
    binary_risk: boolean | null;
  };
}

async function detectCombinedEnrichment(
  stock: EnrichmentScoresInput,
  llmProvider: LLMProvider,
  promptLoader: PromptLoader,
): Promise<{
  flags: Partial<Record<'holding_company_flag' | 'cyclicality_flag' | 'binary_flag', boolean | null>>;
  scores: Partial<ClassificationEnrichmentScores>;
  provenance: Record<string, ProvenanceEntry>;
}>
```
- Half-integer rounding: `Math.round(rawScore * 2) / 2`
- Scores with `scores_confidence < threshold` → not written (null kept); each score gets the same provenance confidence entry
- Flags with `flag.confidence < threshold` → that specific flag returns null (not written)
- LLM API error → returns empty object; provenance records `{ error: true, error_message }`

### Task 3 — Populate `description` in enrichment sync
The `description` column (added in STORY-039) must be read from the DB and passed to the combined prompt. The `classificationEnrichmentSync` DB query must add `description: true` to the `select` block. The `ClassificationEnrichmentInput` type gains `description: string | null`. The sync service passes `description: stock.description ?? ''` to the LLM variables.

Additionally, the FMP metadata fetch during the enrichment run should write `description` back to the DB if the field is null (lazy population pattern — fetch once, cache to DB). If the stock already has a non-null `description`, skip the FMP fetch.

### Task 4 — Extend `classificationEnrichmentSync` (STORY-038)
Replace the stub `combined-enrichment.md` call with the real `detectCombinedEnrichment()` call. Pass pre-filter results as `deterministic_flags` context. Merge score writes into the existing single `prisma.stock.update` per stock.

### Task 4 — Unit tests
- `detectCombinedEnrichment()`: 5 tests
  - All outputs above confidence threshold → all written
  - `scores_confidence` below threshold → all 6 scores null; flags still written if individually confident
  - One flag below confidence → that flag null; others written
  - Half-integer rounding: raw 3.7 → 3.5, raw 3.8 → 4.0
  - LLM error → empty result, error in provenance
- Provenance: each score gets same `scores_confidence` entry; flags get individual confidence entries
- Integration with STORY-038 sync: scores appear in DB update alongside flag writes; still one update call per stock

### Task 5 — Optional live smoke test
AAPL through combined call. Verify all 9 outputs (3 flags + 6 scores) return plausible values and provenance is complete. Marked `@smoke`, excluded from CI.

## Acceptance Criteria
- [x] One combined prompt file (`combined-enrichment.md`) drives both flag and score assessment
- [x] Deterministic context (pre-computed flags) passed to LLM to prevent contradictions
- [x] All 6 scores rounded to half-integer precision before DB write
- [x] Low `scores_confidence` sets all 6 scores to null (individual score granularity not used)
- [x] Individual low-confidence flags set that specific flag to null without affecting scores
- [x] Still one DB update per stock after STORY-040 extension
- [x] Unit tests passing (489 tests, 0 failures)

## Dependencies
- STORY-034 (LLMProvider + PromptLoader)
- STORY-038 (sync job to extend; combined-enrichment.md stub must exist)
- STORY-039 (schema columns for 6 scores)
