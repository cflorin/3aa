# 3AA V1 Docs — Adversarial Review Memo for Claude

## Mandate
This memo is intentionally adversarial.

Its job is to surface risks, contradictions, ambiguities, overengineering, and likely implementation traps in the current **PRD + RFC + ADR** set.

**Claude remains the final decision-maker.**
Nothing in this memo is binding. Every item below should be treated as something **for Claude to consider, validate, accept, reject, or explicitly defer**.

---

## Executive Summary
The overall architecture is strong and much more operational than a typical draft set. The biggest risks are not about missing intent; they are about **cross-document consistency** and one major architectural tension:

> **Per-user classification overrides appear to change the user’s active code, while valuation remains largely shared/system-computed.**

That creates a real risk that user-visible valuation state and alerts are inconsistent with the user’s active classification.

The second major class of issues is **traceability drift**:
- ADR numbering / references appear inconsistent in several places
- some documents still carry earlier single-user assumptions
- some accepted ADRs and RFCs appear to reflect different generations of the design

This memo focuses on the highest-value points for Claude to reconcile before implementation.

---

## Highest-Priority Issues for Claude to Validate

### 1. Per-user active code vs shared valuation state is the biggest unresolved architectural tension

The docs currently imply all of the following:

- classification suggestions are **shared**
- classification overrides are **per-user**
- `active_code = final_code || suggested_code` is resolved **per user**
- valuation computation is largely **shared/system-computed**
- monitoring uses the **user’s active code**

That combination is dangerous unless the design explicitly answers this question:

> If User A overrides AAPL from `4AA` to `3AA`, does that user get a different valuation metric / thresholds / zone than User B?

Right now the docs appear to say both:
- valuation is shared and visible to all users,
- but monitoring uses each user’s active code.

That is not trivially compatible.

#### Why this matters
If user-specific classification overrides change the active code, then:
- metric selection may change,
- threshold family may change,
- valuation zone may change,
- alerts may change.

A shared `valuation_state` keyed only by `ticker` cannot fully represent per-user divergence unless one of these is true:

1. **User overrides do not affect valuation/alerts** (only display)
2. **Per-user valuation overlays** exist
3. **Valuation is computed on demand per user from shared base state + user override**
4. **User overrides are constrained so they do not change operational valuation**

The current docs do not clearly freeze one of those paths.

#### What Claude should consider
Claude should decide explicitly whether V1 means:
- **shared valuation only**, with user classification overrides affecting display/review but not system valuation, or
- **user-specific active valuation semantics**, which would require a per-user valuation resolution path.

If the second is intended, the current architecture likely needs either:
- a per-user effective valuation view,
- or explicit on-the-fly valuation recomputation at inspection/alert time,
- or a new persisted per-user effective valuation layer.

This is the single most important issue to resolve before implementation starts.

---

### 2. Multi-user assumptions are still inconsistent across the document set

The docs have clearly evolved from single-user to multi-user, but not all assumptions were cleaned up.

Examples of likely drift:
- the PRD still says the **primary user is a single long-term investor**
- ADR-002 includes a **single-user / not multi-tenant** characterization in one place while later sections describe **multi-user nightly processing**
- several design choices look like they were originally single-user and later adapted

#### Why this matters
This kind of drift creates subtle implementation mistakes:
- wrong default indexes
- incorrect alert ownership assumptions
- wrong performance planning
- missing auth / tenancy rules in stories

#### What Claude should consider
Claude should make the document set fully consistent on one point:

> V1 is either truly multi-user from day 1, or it is a single-user app with future-proofing.

The current set mostly leans **multi-user from day 1**, so that should likely be made explicit and cleaned everywhere.

---

### 3. ADR and reference-number drift is a real traceability problem

The current docs appear to contain at least two numbering generations.

Examples:
- RFC-004 references **ADR-015 / ADR-016 / ADR-017**
- accepted ADR files are numbered **ADR-001 through ADR-007**
- RFC-001 “required ADRs” appear to use numbering that conflicts with the accepted ADR set
- RFC-003 references future ADR numbering that may no longer map cleanly

#### Why this matters
This is not cosmetic. It breaks:
- traceability
- implementation prompts
- later audits
- automated linking
- machine-enforced architecture checks

#### What Claude should consider
Claude should do a final **reference normalization pass** across:
- RFC dependency lists
- Required ADR sections
- cross-links in ADRs
- any future story/task templates

This should be treated as mandatory cleanup, not optional polish.

---

### 4. Audit model may be incomplete for the user-specific override path

ADR-003 establishes **full-state snapshots** for shared history. That is strong.

But once the design becomes multi-user, Claude should verify whether the history model fully covers:
- per-user classification overrides
- per-user valuation overrides
- per-user alert acknowledgement / mute state
- user-effective active code at alert generation time

#### Risk
If alerts are generated from a user-specific effective state, but only shared `classification_history` / `valuation_history` are stored, then later audit/reconstruction may be incomplete.

Example question:
- Can the system reconstruct **why User A received a steal alert on date X** if User A had a personal override that changed the active code/zone?

If not, the audit model is incomplete for a multi-user architecture.

#### What Claude should consider
Claude should validate whether alert payload/history stores enough context to reconstruct:
- user-specific active code
- effective thresholds used
- effective valuation zone used
- override provenance used at alert time

If not, either:
- alert payload snapshots need to be richer,
- or a user-effective history layer is needed.

---

### 5. User valuation overrides are architecturally expensive relative to V1 scope

The current docs include **user_valuation_overrides**.

That is defensible, but it may be one of the easiest places for hidden complexity to creep in:
- per-user threshold resolution
- per-user valuation zone resolution
- per-user monitoring semantics
- complicated audit payloads

#### Why this matters
The product is supposed to be monitoring-first V1, not a deep decision workspace yet.

User-specific valuation overrides may force a lot of additional logic for limited near-term benefit.

#### What Claude should consider
Claude should explicitly decide whether user valuation overrides are truly required in V1, or whether they should be:
- deferred,
- limited to inspection-only notes,
- or implemented but excluded from alert generation.

This is a scope-control decision worth making explicitly.

---

## Important Issues for Claude to Reconcile

### 6. The product-level alert philosophy and RFC-level alert philosophy may not be fully aligned

The PRD frames monitoring in broad terms around valuation-zone transitions and stocks of interest.

RFC-005 makes a stronger narrowing choice:
- alerts only for **very_good** and **steal**
- not for `comfortable` / `max`

That may be the right choice, but it should be explicitly treated as a **product decision**, not just an engine detail.

#### What Claude should consider
Claude should confirm whether:
- `comfortable_zone` is intentionally informational-only in V1,
- or whether the PRD language should be tightened to reflect the narrower alert policy.

---

### 7. Provider assumptions may be too concrete for unvalidated inputs

The current docs treat several provider assumptions as settled facts, e.g.:
- Tiingo forward-estimate partial coverage
- FMP stronger forward-estimate coverage
- specific percentages like ~60% / ~85%
- Tiingo/FMP role split

Those may be directionally reasonable, but unless they were actually benchmarked against the intended universe, they risk ossifying unvalidated assumptions.

#### What Claude should consider
Claude should decide whether those numbers should remain:
- hard architecture assumptions,
- provisional planning assumptions,
- or implementation-time validation tasks.

The safest version is often:
- architecture supports both providers,
- field-level provenance is mandatory,
- exact provider strategy is tunable/configurable,
- coverage claims are documented as assumptions until empirically validated.

---

### 8. Fallback logic for forward metrics needs tighter guardrails

Examples like:
- trailing P/E × (1 + growth)
- trailing EV/EBIT × growth-based fallback

may be useful as emergency fallbacks, but they can produce misleading values in edge cases.

#### Risk cases
- negative or unstable earnings
- cyclicals at peak or trough margins
- low-quality forward growth estimates
- holding-company / insurer special cases

#### What Claude should consider
Claude should ensure fallback rules are bounded by explicit guardrails such as:
- do not use fallback when denominator is unstable/negative,
- do not use fallback for flagged cyclicals without extra context,
- route to `manual_required` sooner rather than later for unsafe cases.

---

### 9. Refresh schedule and orchestration details appear to have some small inconsistencies

At least one visible inconsistency exists between RFC-004 and ADR-002 around scheduling detail (for example, universe sync timing and batch framing).

#### Why this matters
These are small individually, but they create confusion during implementation.

#### What Claude should consider
Claude should do a final “single source of truth” pass for:
- schedule
- batch cadence
- stale-data windows
- recompute times
- dependency order between stages

---

### 10. Security model may be underspecified for a multi-user app

ADR-007 references application-layer filtering and highlights the risk of leakage.
That is good, but Claude should consider whether the security boundary is strong enough for implementation guidance.

#### Questions to validate
- Is application-layer filtering enough for V1?
- Should row-level security be deferred explicitly rather than implied?
- Are there required tests that prove user isolation?
- Are admin operations clearly bounded?

This may not require major architecture changes, but it should be crisp before implementation.

---

## Lower-Priority but Worth Tightening

### 11. PRD persona and deployment persona should be reconciled
The PRD still reads partly like a product for one investor, partly like a multi-user app.
Claude should decide whether this is:
- a personal product that happens to support multiple users,
- or a true multi-user SaaS-style architecture from day 1.

### 12. “Manual required” semantics should be explicit in UX
The backend uses `manual_required` states in several places, but the UX consequence is not yet fully obvious from the doc set.
Claude should ensure users see a clear explanation of:
- why the stock is manual-required,
- what field is missing,
- whether alerts are suppressed or downgraded.

### 13. Batch runtime estimates should be treated as assumptions
Several runtime estimates are probably fine, but Claude should label them as planning assumptions unless benchmarked.

---

## Cross-Document Inconsistencies for Claude to Reconcile

### A. Multi-user vs single-user
- PRD says primary user is a single long-term investor
- ADR-002 still mentions single-user characteristics in one section
- PRD and ADR-007 otherwise clearly say multi-user

### B. Shared valuation vs per-user active code
- ADR-007: valuation is shared
- ADR-004: active code is per-user override || suggestion
- RFC-005: monitoring uses the user’s active code
- RFC-003: valuation persistence is shared/system-active-code based

This is the most important inconsistency.

### C. ADR numbering drift
- RFC-004 references ADR-015/016/017
- accepted ADR files are 001–007
- RFC-001 required ADRs also appear out of sync with the accepted set

### D. Scope of alert-worthy transitions
- PRD is broad about valuation transitions
- RFC-005 narrows to very_good/steal only

### E. Required ADR lists vs actual accepted ADR set
Several RFCs still contain “Required ADRs” sections that likely no longer match the accepted ADR inventory.

---

## Questions Claude Should Explicitly Answer Before Implementation

1. **Does a user classification override change operational valuation/alerts for that user, or only display/inspection state?**
2. **If user valuation overrides remain in V1, do they affect alerts or only inspection?**
3. **What is the canonical interpretation of `valuation_state`: shared system truth or merely base/default valuation?**
4. **What exact data is snapshotted in alerts to support per-user audit reconstruction?**
5. **Is V1 definitively multi-user from day 1, and should all documents be normalized to that assumption?**
6. **Should provider coverage percentages remain architecture facts or be downgraded to implementation assumptions?**
7. **Should `comfortable_zone` transitions be surfaced anywhere user-visible even if not alert-worthy?**
8. **Which current ADR references are obsolete and must be renumbered/remapped?**

---

## Suggested Patch Areas for Claude to Consider

### Patch Area 1 — Clarify valuation semantics under user overrides
Claude should decide one of these paths and make it explicit everywhere:
- **Path A:** Shared valuation is authoritative; user classification overrides do not change monitoring math in V1
- **Path B:** User overrides affect effective valuation/alerts via on-demand per-user valuation resolution
- **Path C:** User overrides affect inspection only in V1; fully user-scoped valuation is deferred

### Patch Area 2 — Normalize the multi-user assumption everywhere
Claude should reconcile all lingering single-user language in:
- PRD persona/target user sections
- ADR-002 characteristics section
- any capacity estimates or flow assumptions

### Patch Area 3 — Normalize all RFC↔ADR references
Claude should perform a full reference pass to ensure:
- no stale ADR IDs remain,
- Required ADR sections reflect reality,
- all accepted ADRs are linked consistently.

### Patch Area 4 — Decide whether user valuation overrides belong in V1
Claude should explicitly validate whether they are worth the complexity now.
If yes, their operational scope should be made precise.
If no, they should be deferred or narrowed.

### Patch Area 5 — Tighten fallback and `manual_required` rules
Claude should ensure fallback formulas have strict guardrails and clear UX consequences.

---

## Proposed Review Stance Going Forward
This memo should not be treated as “the architecture is wrong.”
The architecture is actually quite strong.

The right interpretation is:

- the **core model is good**,
- the **main remaining risk is semantic inconsistency between user-specific overrides and shared system valuation**,
- and there is a **cleanup pass needed for references, assumptions, and traceability**.

If Claude resolves those explicitly, the document set should be in strong shape for implementation.

---

## Final Note
Again: **Claude is the final decision-maker.**

This memo is a red-team review only.
Its purpose is to help Claude tighten the architecture before implementation, not to override Claude’s design authority.

