# EPIC-003.1 — Classification LLM Enrichment

## Status
planned

## Purpose
EPIC-003 provides deterministic classification flags and financial inputs. EPIC-003.1 completes the classification dataset by using LLM-based enrichment to detect the three flags that cannot be determined by heuristics alone (`holding_company_flag`, `cyclicality_flag`, `binary_flag`) and to compute the six E1–E6 qualitative scores that feed RFC-001's Earnings Quality Scorer.

All LLM calls are isolated to this epic. The classification engine (RFC-001) remains fully deterministic rules-based (ADR-004) — this epic enriches the input data, not the classification logic itself.

## V1 Scope Boundary
- Provider: Claude (Anthropic API) via abstract `LLMProvider` interface (RFC-007, ADR-012)
- Call volume: at most one combined LLM call per stock per weekly run
- Flags covered: `holding_company_flag`, `cyclicality_flag`, `binary_flag`
- Scores covered: E1–E6 (moat_strength, pricing_power, revenue_recurrence, margin_durability, capital_intensity, qualitative_cyclicality)
- Deterministic-only flags (`insurer_flag`, `material_dilution_flag`, `pre_operating_leverage_flag`) are EPIC-003, not this epic

Out of scope for V1: fine-tuning, embeddings, multi-turn flows, real-time LLM calls, provider switching (interface ready but only ClaudeProvider implemented).

## Stories
| ID | Story | Status |
|----|-------|--------|
| STORY-034 | LLM Provider Interface + PromptLoader | planned |
| STORY-035 | holding_company_flag: SIC heuristic + LLM | planned |
| STORY-036 | cyclicality_flag: sector rules + LLM | planned |
| STORY-037 | binary_flag: biotech heuristic + LLM | planned |
| STORY-038 | classificationEnrichmentSync job | planned |
| STORY-039 | Enrichment score schema migration | planned |
| STORY-040 | E1–E6 scores + combined-enrichment.md prompt | planned |

## Integration Checkpoint Criteria
EPIC-003.1 is complete when ALL of the following are true:

1. **First successful weekly run** — `classificationEnrichmentSync` completes in incremental mode with `errors = 0` for a representative batch (≥10 stocks)
2. **Full provenance** — every stock processed has `dataProviderProvenance` entries for all three flags and all six scores with non-null `prompt_version`, `model`, and `synced_at`
3. **Cost within bounds** — `llm_calls_made` per run ≤ 1,000 (ADR-012 estimate: ~$15–25 at current Claude pricing); BC-035-001 must be resolved or confirmed not triggered before this ceiling is evaluated
4. **Recomputation triggers verified** — editing `combined-enrichment.md` causes affected stocks to re-enrich on the next incremental run (prompt version drift trigger)
5. **Admin routes functional** — `POST /api/admin/sync/classification-enrichment?mode=incremental|full` returns summary JSON with correct counts
6. **All story acceptance criteria met** — each of STORY-034–040 has passing unit tests

## Dependencies
- EPIC-003 (STORY-032, STORY-033 must have completed at least one run for all in-universe stocks before enrichment sync pre-filters produce correct results)
- EPIC-002 (admin auth middleware)
- External: Anthropic API key (`ANTHROPIC_API_KEY` in environment)

## Baseline References
- RFC-007: LLM provider architecture
- ADR-012: Decision to use LLM for classification enrichment
- RFC-001: ClassificationFlags amendment; ClassificationEnrichmentScores interface
- RFC-002: Schema columns for flags and 6 score columns (STORY-039 migration)
- ADR-004: Rules-first classification (LLM enriches data, not engine logic)
