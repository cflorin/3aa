# STORY-107 — Qualitative Visibility Modifier Service

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Qualitative Visibility Modifier as a standalone pure-function service. This service computes a bounded ±2% modifier from existing LLM enrichment scores (E1–E5). The hard cap is absolute — the service must enforce it. This is the only place in the bucket engine where LLM qualitative judgment contributes numerically to the growth path.

## Story
As the Earnings Path Engine,
I want a Qualitative Visibility Modifier service that translates LLM enrichment scores into a bounded earnings path modifier,
so that high-quality, high-visibility businesses receive a modest positive signal and low-quality businesses receive a modest penalty.

## Outcome
`QualitativeVisibilityModifierService.compute(scores)` returns exactly +2%, 0%, or −2% per the three-case logic in §3.7 of the V2.1 framework. The ±2% cap is absolute and enforced in this service. The service is pure and fully unit-tested across all scoring scenarios.

## Scope In
- Service: `src/domain/classification/engines/qualitative-visibility-modifier.service.ts`
- Inputs: `moat_strength_score`, `pricing_power_score`, `revenue_recurrence_score`, `margin_durability_score`, `capital_intensity_score` (all from existing LLM enrichment)
- Logic:
  - +2% when ALL of: moat ≥ 4 AND pricing_power ≥ 4 AND revenue_recurrence ≥ 4 AND margin_durability ≥ 4 (and none are null)
  - −2% when ANY of: moat ≤ 2 OR margin_durability ≤ 2 OR capital_intensity ≤ 2
  - 0% otherwise (mixed signals, or any qualifying score is missing)
- Null score treatment: null → 0% (no evidence → neutral; NOT positive)
- Hard cap: output must always be in {−0.02, 0, +0.02} — never any other value
- `capital_intensity` direction note: score ≤ 2 means HIGH capex / LOW margin durability, which is the negative signal

## Scope Out
- Not responsible for LLM score computation (existing enrichment pipeline)
- Not responsible for EQ/BS scorer integration (those use the same scores independently — documented as intentional in V2.1 §4.3)
- No DB writes
- No modifier larger than ±2% under any circumstance — no extension point

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §12 (Qualitative Visibility Modifier)
- ADR: ADR-012 (LLM enrichment, hard cap established)
- Framework: V2.1 §3.7 (three-case logic) and §4.3 (multi-use documentation)
- Upstream: STORY-100 (types); enrichment scores already on Stock

## Preconditions
- LLM enrichment has run for the stock (EPIC-003.1); scores may be null for unenriched stocks

## Inputs
```typescript
interface QualitativeModifierInput {
  moatStrengthScore: number | null;
  pricingPowerScore: number | null;
  revenueRecurrenceScore: number | null;
  marginDurabilityScore: number | null;
  capitalIntensityScore: number | null;
}
```

## Outputs
```typescript
interface QualitativeModifierResult {
  qualitativeVisibilityModifier: 0.02 | 0 | -0.02;  // TypeScript literal type
  reasonCode: string | null;  // e.g. 'QUAL_STRONG_ALL', 'QUAL_WEAK_MOAT', null if 0
}
```

## Acceptance Criteria
- [ ] All four scores ≥ 4 → +2%
- [ ] All four scores ≥ 4 but one is null → 0% (null kills the positive signal)
- [ ] Moat score = 2 (any other scores high) → −2%
- [ ] Margin durability = 2 (any other scores high) → −2%
- [ ] Capital intensity = 2 (low score = high capex → negative signal) → −2%
- [ ] Mixed signals (some high, some medium, none below 2) → 0%
- [ ] All scores null → 0%
- [ ] Output is strictly in {−0.02, 0, +0.02} — no other value possible
- [ ] Unit test coverage = 100% (small decision table)

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/qualitative-visibility-modifier.service.test.ts`):
  - All strong (all ≥ 4) → +2%
  - All strong but moat null → 0%
  - Moat = 2 → −2% (even if all others are 5)
  - Margin durability = 2 → −2%
  - Capital intensity = 2 → −2% (high capex company)
  - All scores = 3 (medium) → 0%
  - All null → 0%
  - Negative direction note: capital_intensity high score (5 = low capex / high durability) is POSITIVE; score ≤ 2 = bad
- BDD:
  - `Given` moat=5, pricing=4, recurrence=4, margin=4, capex=4; `When` modifier computed; `Then` result = +0.02
  - `Given` moat=2, all others = 5; `When` modifier computed; `Then` result = -0.02
- E2E: N/A

## Regression / Invariant Risks
- The hard cap (+0.02/−0.02/0) must be enforced at the service level — STORY-108 must not be able to bypass it by passing a raw LLM score
- Capital intensity score direction: score ≤ 2 = high capex burden = negative signal (counterintuitive naming — document in code comment)

## Key Risks / Edge Cases
- All four positive scores exactly = 4.0: boundary case → +2% (≥ 4 is inclusive)
- moat_strength_score = 2.0 exactly: boundary case → −2% (≤ 2 is inclusive)
- If moat score is missing but all other three are ≥ 4: return 0% (not +2%) — null kills the positive signal

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/qualitative-visibility-modifier.service.ts`
- [ ] 100% unit test coverage
- [ ] No regression on existing classifier tests
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-009
- RFC: RFC-009 §12
- ADR: ADR-012 (LLM hard cap)
- Framework: V2.1 §3.7, §4.3
