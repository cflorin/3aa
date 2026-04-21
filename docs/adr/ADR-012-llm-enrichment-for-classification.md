# ADR-012: LLM Enrichment for Classification Flags and Qualitative Scores

**Status:** ACCEPTED
**Date:** 2026-04-21
**Deciders:** Product Team
**Related:** RFC-001 (Classification Engine), RFC-007 (LLM Provider Architecture), ADR-004 (Rules-First Classification)

---

## Context

RFC-001 requires `holding_company_flag`, `insurer_flag`, `cyclicality_flag`, and `binary_flag` for tie-break resolution. These four flags are classification blockers: with all four permanently FALSE (the current default), the engine produces systematically wrong classifications for holding companies, insurers, cyclical businesses, and binary-outcome stocks.

Additionally, V1.0 adds qualitative enrichment scores (moat_strength, pricing_power, revenue_recurrence, margin_durability, capital_intensity, qualitative_cyclicality) that RFC-001's Earnings Quality Scorer will use as classification inputs. These scores cannot be derived from financial data alone — they require business model reasoning.

Deterministic heuristics cover approximately 60–70% of flag cases cleanly (SIC codes, industry strings, sector rules). The remaining 30–40% require judgment that only a language model can reliably provide from a company's business description.

**The Question:** Should the classification pipeline use an LLM to detect flags and compute qualitative scores?

---

## Decision

**YES.** Use a pluggable LLM provider (implementing an abstract `LLMProvider` interface — RFC-007) for:

1. **Flag detection** where deterministic heuristics are insufficient:
   - `holding_company_flag`: SIC 6710–6726 handled deterministically; remaining cases via LLM
   - `cyclicality_flag`: Sector rules handle Materials/Energy/Consumer Staples; ambiguous sectors (Technology, Industrials, Consumer Discretionary) via LLM
   - `binary_flag`: Biotech/pharma pre-revenue handled deterministically; remaining cases via LLM

2. **Qualitative enrichment scores** (E1–E6): All six 1–5 scores computed via a single LLM batch call per stock (one call, six scores returned together)

**NOT used for:**
- `insurer_flag`: Fully deterministic via SIC/industry string (>99% accurate)
- `pre_operating_leverage_flag`: Fully deterministic via revenue threshold
- `material_dilution_flag`: Deterministic computation from share_count_growth_3y
- `share_count_growth_3y`: Vendor-native data from FMP historical share endpoint

---

## LLM Usage Design (summary — detail in RFC-007)

- Abstract `LLMProvider` interface with a single `structuredComplete<T>()` method; concrete `ClaudeProvider` implementation ships with V1.0; provider is swappable without changing enrichment logic
- Prompts stored in versioned `.md` files under `src/modules/classification-enrichment/prompts/`; prompt changes do not require code changes
- Confidence threshold: ≥0.60 required to write a flag or score; below threshold the existing value is retained and provenance records the null decision
- Prompt version hash stored in provenance alongside model identifier, synced_at, and confidence score
- Model version pinned per enrichment run; model upgrade triggers forced full re-enrichment
- Manual override always takes precedence over LLM-detected values

---

## Alignment with ADR-004 (Rules-First)

ADR-004 establishes that classification is "rules-first, deterministic, transparent." This decision does not conflict:

- The classification **engine** (EPIC-004) remains fully deterministic rules-based. RFC-001's Bucket Scorer, Earnings Quality Scorer, and Tie-Break Resolver are unchanged.
- LLM enrichment operates in the **data pipeline** (EPIC-003.1), not in the classification engine. It produces flag values and scores that are stored in the stocks table exactly like any other data field.
- Once written, LLM-enriched values are treated as data — the classification engine reads them as deterministic inputs, with no LLM invocation at classification time.
- The LLM's role is data enrichment, not classification decision-making.

---

## Consequences

| | Detail |
|---|---|
| **Accuracy gain** | Estimated >90% flag accuracy vs ~60–70% heuristic-only for ambiguous cases |
| **Auditability** | Every LLM decision stored with model, prompt version, confidence, reasoning_summary |
| **Cost** | ~$15–25 per full-universe run (1,000 stocks); acceptable weekly cadence |
| **Latency** | Async batch job, non-blocking for portfolio display |
| **Model dependency** | Prompt versioned; model change triggers re-enrichment run |
| **Provider lock-in** | None — abstract interface allows key/provider swap with zero enrichment logic changes |
| **Manual override** | Admin endpoint writes override flag; provenance records `provider: "manual"` |
| **Re-enrichment trigger** | Automatic: new stocks added to universe; Manual: admin endpoint; Forced: model version change |

---

## Rejected Alternatives

**Fully manual flags:** Current state. Produces all-FALSE defaults for 100% of universe. Classification engine cannot make correct decisions. Not viable.

**Deterministic heuristics only:** Covers ~70% accurately. `binary_flag` and edge-case `holding_company_flag` cannot be reliably detected without business description reasoning. Leaves 30% of universe with incorrect flags.

**Embed LLM in classification engine:** Would violate ADR-004 (rules-first determinism). Classification must be reproducible without LLM calls at engine invocation time.
