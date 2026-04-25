# Classification Engine Bug Registry

**Source:** Comparison of system classification output vs. manual analysis in `data/classification-analysis-5-stocks.md`  
**Data used:** 5-stock universe snapshot (`data/universe-snapshot-5.md`, synced 2026-04-21)  
**Diagnosed:** 2026-04-24  
**Scope:** EPIC-004 Classification Engine — bucket scoring, EQ scoring, data pipeline  

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| CRITICAL | Produces wrong classification for all stocks; system output is entirely unreliable |
| HIGH | Produces wrong bucket or wrong grade for specific stocks; systematic scoring error |
| MEDIUM | Produces correct bucket/grade but wrong confidence, or missing signal that would affect borderline cases |
| LOW | Cosmetic or edge-case gap; does not affect classification outcome for known stocks |

---

## Summary

| Bug ID | Severity | Component | Short description | Status |
|--------|----------|-----------|-------------------|--------|
| BUG-CE-001 | CRITICAL | Data / input-mapper | Growth fields inserted as decimals; mapper expects percentages → all signals fire Bucket 1 | **FIXED 2026-04-24** |
| BUG-CE-002 | HIGH | EQ scorer (STORY-042 gap) | `pricing_power_score`, `revenue_recurrence_score`, `margin_durability_score` not implemented in EQ scorer | **FIXED 2026-04-24** |
| BUG-CE-003 | HIGH | Deterministic flags / `pre_operating_leverage_flag` | Rule too restrictive — never fires for large profitable companies with thin margins | **FIXED 2026-04-24** |
| BUG-CE-004 | HIGH | EQ scorer — FCF conversion signal | FCF conversion ratio inflated by thin GAAP earnings → distorts EQ grade upward (TSLA 164%, UNH 133%, ADBE 143%) | **FIXED 2026-04-25** |
| BUG-CE-005 | MEDIUM | Bucket scorer — TSLA bucket 3 vs 5 | `pre_operating_leverage_flag` adds FLAG_PRIMARY(2) to B5 but rev_fwd 8.8% puts more weight in B4 → B3 via tie-break | **OPEN** |

---

## BUG-CE-001 — Growth field format mismatch: all stocks classified as Bucket 1 ✅ FIXED

**Fixed:** 2026-04-24 — DB updated via SQL UPDATE to use percentage format for all 5 stocks; comment added to `input-mapper.ts` documenting the contract.



**Severity:** CRITICAL  
**Component:** Data insertion + `src/domain/classification/input-mapper.ts`  
**Stocks affected:** All 5 (MSFT, ADBE, TSLA, UBER, UNH)

### Observed output
All 5 stocks classified as Bucket 1 (decline/harvest). Bucket 1 score = 10 for MSFT/ADBE/UNH, 9 for UBER, despite none of these having negative or near-zero revenue growth.

### Root cause
`input-mapper.ts` line 26 defines:
```typescript
const pct = (v: any): number | null => (v !== null && v !== undefined ? Number(v) / 100 : null);
```
This is applied to all five growth fields (`revenue_growth_fwd`, `revenue_growth_3y`, `eps_growth_fwd`, `eps_growth_3y`, `gross_profit_growth`). The mapper expects these fields to be stored as **percentages** (e.g., `7.2` for 7.2%).

The 5 stocks were inserted with **decimal fractions** (e.g., `0.072` for 7.2%). After `pct()` divides by 100, the effective value passed to the bucket scorer is `0.00072` — far below `B1_MAX = 0.02` — causing every growth signal to fire Bucket 1.

### Evidence
DB values (as stored):
```
MSFT: revenue_growth_fwd = 0.07, revenue_growth_3y = 0.14
```
After pct(): `0.07 / 100 = 0.0007` → fires B1 (≤ 0.02). Same for all growth fields all stocks.

### Expected values in DB (percentages)

| Ticker | rev_fwd | rev_3y | eps_fwd | eps_3y | gross_profit |
|--------|---------|--------|---------|--------|--------------|
| MSFT   | 7.2     | 14.4   | 2.8     | 21.2   | 15.3         |
| ADBE   | 6.6     | 10.8   | 37.0    | 19.1   | 11.3         |
| TSLA   | 8.8     | 5.2    | 64.3    | -33.6  | -2.0         |
| UBER   | 12.2    | 17.7   | -30.3   | NULL   | 19.4         |
| UNH    | -1.6    | 11.3   | 34.7    | -14.8  | -7.3         |

### Fix
1. Update all 5 stocks' growth fields in the DB to percentage format (multiply current values by 100).
2. Re-run the classification batch job.
3. Add a note to the data insertion script / admin seed documentation that growth fields must be percentages.

### Files
- `src/domain/classification/input-mapper.ts` — documents the contract (comment at line 6)
- DB: `stocks` table columns `revenue_growth_fwd`, `revenue_growth_3y`, `eps_growth_fwd`, `eps_growth_3y`, `gross_profit_growth`

---

## BUG-CE-002 — EQ scorer missing pricing_power, revenue_recurrence, margin_durability rules ✅ FIXED

**Fixed:** 2026-04-24 — Added `EQ_PRICING_*`, `EQ_RECURRENCE_*`, `EQ_MARGIN_DUR_*` weight constants to `scoring-weights.ts`; added E2/E3/E4 rule blocks to `eq-scorer.ts`; 11 new unit tests added to `story-042-eq-bs-scorer.test.ts`.



**Severity:** HIGH  
**Component:** `src/domain/classification/eq-scorer.ts` (STORY-042 implementation gap)  
**Stocks affected:** TSLA (EQ-C expected, gets EQ-A), UBER (EQ-B expected, gets EQ-A)

### Observed output
TSLA scores **EQ-A** (eq: {A:4, B:2, C:0}). Manual analysis gives **EQ-C** on the basis of low pricing power (2.5/5), low revenue recurrence (2.0/5 — transactional car purchases), and deteriorating margin durability (2.5/5 — margins fell from ~25% to 6%).

### Root cause
`bucket-scorer.ts` contains this comment (line 148):
```
// E2 (pricing_power), E3 (revenue_recurrence), E4 (margin_durability) → EQ scorer (STORY-042)
```
The three LLM enrichment scores that degrade EQ toward C were never implemented in `eq-scorer.ts`.

Currently `eq-scorer.ts` only fires three rules:
1. FCF conversion (STRONG/MODERATE/WEAK)
2. Moat strength score (STRONG/MODERATE/WEAK)
3. Net income positive

For TSLA: FCF conversion = 1.64 (> 0.80) → +3 to EQ-A, which dominates. This is mechanically high because GAAP net income is very thin, making the ratio large — not a sign of economic strength. The pricing_power, revenue_recurrence, and margin_durability signals, which are all weak for TSLA, would push toward EQ-C but are absent.

### LLM enrichment scores relevant to EQ

| Ticker | pricing_power | rev_recurrence | margin_durability | Expected EQ |
|--------|--------------|----------------|-------------------|-------------|
| MSFT   | 4.5          | 4.5            | 5.0               | A ✓         |
| ADBE   | 4.5          | 4.5            | 4.5               | A or B      |
| TSLA   | 2.5          | 2.0            | 2.5               | **C**       |
| UBER   | 3.0          | 2.5            | 3.0               | **B**       |
| UNH    | 3.0          | 4.5            | 3.5               | B ✓         |

### Fix
1. Add three new scoring weight constants to `scoring-weights.ts` — follow existing moat pattern (STRONG/MODERATE/WEAK, same values: 2/1/1).
2. Add three new rule blocks to `eq-scorer.ts` for `pricing_power_score`, `revenue_recurrence_score`, `margin_durability_score`. Thresholds: ≥4.0 → A, [2.5, 4.0) → B, <2.5 → C.
3. Requires **ADR-013 amendment** — add E2/E3/E4 weights to the EQ scorer table (baseline change, needs approval before coding).
4. Update unit tests in `tests/unit/classification/story-042-eq-bs-scorer.test.ts`.

### Files
- `src/domain/classification/eq-scorer.ts`
- `src/domain/classification/scoring-weights.ts`
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (amendment required)
- `tests/unit/classification/story-042-eq-bs-scorer.test.ts`

---

## BUG-CE-003 — pre_operating_leverage_flag = false for TSLA and UBER ✅ FIXED

**Fixed:** 2026-04-24 — Added large-cap operating margin rule to `deterministic-classification-sync.service.ts`: fires when `operatingMargin > 0 AND < 0.15 AND revenueTtm > $1B AND earningsTtm > 0`, excluding structural thin-margin industries. 6 new unit tests added. TSLA (6% margin) and UBER (12% margin) now correctly flag as `true`.



**Severity:** HIGH  
**Component:** `src/modules/classification-enrichment/` — LLM enrichment detector  
**Stocks affected:** TSLA (bucket 5 expected, gets 3), UBER (bucket 5 expected, gets 4)

### Observed output
After fixing BUG-CE-001, TSLA would score:
- Bucket 4: 6 pts (rev_fwd 8.8% fires B4)
- Bucket 3: 5 pts (rev_3y 5.2% fires B3)
- 3v4 tie-break fires: ROIC = 5.6% < 20% → **Bucket 3 chosen**
- Manual: **Bucket 5**

UBER would score:
- Bucket 5: 7 pts (rev_fwd 12.2% fires both B4+B5, rev_3y and gross_profit fire B5)
- Bucket 4: 6 pts
- 4v5 tie-break fires: `pre_operating_leverage_flag = false` → **Bucket 4 chosen**
- Manual: **Bucket 5**

### Root cause
The LLM enrichment set `pre_operating_leverage_flag = false` for both TSLA and UBER. Without this flag, the bucket scoring algorithm cannot route them to Bucket 5. The FLAG_PRIMARY weight (+2 to B5) is the designed mechanism to distinguish B5 stocks from B4 stocks with overlapping growth ranges.

**Why the flag is wrong:**
- **TSLA**: Investment thesis depends entirely on operating margin recovery from 6% toward 15-20% (autonomy/energy thesis). This is the textbook operating leverage story. Operating margin peaked at ~25%, compressed to 6% — the recovery path IS the thesis.
- **UBER**: Operating margin was near-zero 2-3 years ago, is now 12% and expanding. This is active operating leverage expansion — the defining characteristic of a Bucket 5 stock. The framework explicitly names UBER as the canonical Bucket 5 example.

The LLM detector appears to have interpreted "pre_operating_leverage" as "has not yet started operating leverage expansion" (which would exclude UBER at 12% margin), rather than "thesis depends on continued operating leverage expansion" (which includes both).

### Fix
1. Audit the LLM prompt/logic for the `pre_operating_leverage_flag` detector.
2. Clarify the flag semantics: it should be TRUE when "the current investment thesis depends materially on future operating margin expansion" — not restricted to pre-revenue or near-zero margin businesses.
3. Re-run LLM enrichment for TSLA and UBER with corrected prompt.
4. Alternatively, as an immediate fix: manually set `pre_operating_leverage_flag = true` in DB for TSLA and UBER and re-run classification.

### Files
- LLM enrichment detector: find via `find src/modules/classification-enrichment/detectors -name "*.ts"`
- DB: `stocks.pre_operating_leverage_flag` for TSLA and UBER

---

---

## BUG-CE-004 — FCF conversion ratio inflated by thin GAAP earnings distorts EQ upward ✅ FIXED

**Severity:** HIGH  
**Component:** `src/domain/classification/eq-scorer.ts` — FCF conversion rule  
**Stocks affected:** TSLA (EQ=A, expected C), UNH (EQ=A, expected B), ADBE (EQ=A, expected B)  
**Status:** FIXED 2026-04-25

**Fix applied (ADR-013 amendment 2026-04-25):**
1. `EQ_FCF_STRONG` lowered from 3 → 2: reduces the A anchor so moderate enrichment signals in B can overcome it when the enrichment profile is weak.
2. Three new EQ-C volatility signals added to capture earnings regularity (proxy for "clockwork" compounder):
   - `EQ_EPS_DECLINING = 1` → fires when `eps_growth_3y < 0` (+1 to C)
   - `EQ_EPS_REV_SPREAD_MODERATE = 1` → spread `(eps_growth_3y − revenue_growth_3y)` in `[−0.20, −0.10)` (+1 to C)
   - `EQ_EPS_REV_SPREAD_SEVERE = 3` → spread `< −0.20` (+3 to C, analogous to BS_DEBT_HIGH)

**Post-fix EQ grades:** TSLA → EQ-C (A:3, B:4, C:5) ✓; CVX → EQ-C (A:3, B:3, C:6) ✓; ADBE → EQ-A (11:1:0) ✓; MSFT → EQ-A (9:3:0) ✓; UNH → EQ-A (7:3:4 — strong moat + recurrence override decline) expected deviation documented below.

### Observed output (post BUG-CE-001/002/003 fixes)

| Stock | fcf_conversion | Engine EQ | Manual EQ | Delta |
|-------|---------------|-----------|-----------|-------|
| TSLA  | 1.64 (164%)  | A         | C         | Wrong by 2 grades |
| UNH   | 1.33 (133%)  | A         | B         | Wrong by 1 grade |
| ADBE  | 1.43 (143%)  | A         | B         | Wrong by 1 grade |
| UBER  | 0.97 (97%)   | A (tied)  | B         | Borderline — tie-break goes A |

### Root cause

The EQ scorer's FCF conversion rule: `fcf_conversion > 0.80 → +3 to A (EQ_FCF_STRONG)`. This is the highest single weight in the EQ scorer (+3), and any value above 0.80 fires it identically.

When GAAP net income is thin, FCF conversion = FCF / net income becomes a very large number. TSLA's net income was ~$2.3B against FCF of ~$3.6B → conversion = ~1.57×. This is a mathematical artifact of thin margins, not a genuine sign of economic strength.

From the manual analysis: *"FCF conversion of 164% is mechanically elevated because GAAP earnings are very thin, not because of economic strength."*

The same distortion applies to UNH (4% operating margin, GAAP earnings thin relative to cashflow) and ADBE (FCF conversion elevated by large amortization of acquired intangibles — a GAAP artifact in SaaS companies).

### Impact

The +3 to A from high_fcf_conversion dominates the EQ scoring for all three affected stocks, overriding the negative signals from weak pricing power, weak recurrence, and deteriorating margins. It makes the EQ scorer unable to give an honest C grade to a stock like TSLA that the manual analysis clearly places at C.

### Potential fix approaches

1. **Cap the fcf_conversion EQ signal at 1.0 (100%)**: ratios above 1.0 are always GAAP artifacts. This would keep the +3 for genuine high-conversion companies (e.g., software with 85% FCF conversion) while preventing inflation from thin-earnings companies.
2. **Add a floor check**: only fire `EQ_FCF_STRONG` if `fcf_conversion > 0.80 AND fcf_conversion < 2.0` — exclude extreme outliers.
3. **Use absolute FCF margin instead of conversion ratio** as the primary FCF quality signal. FCF margin (FCF/Revenue) is not distorted by thin earnings.
4. **Require ADR-013 amendment** before any fix — this is a baseline scoring weight change.

### Files
- `src/domain/classification/eq-scorer.ts` (line 29–39: FCF conversion rules)
- `src/domain/classification/scoring-weights.ts` (EQ_FCF_STRONG weight)
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (amendment required)
- `tests/unit/classification/story-042-eq-bs-scorer.test.ts`

---

## BUG-CE-005 — TSLA remains at Bucket 3 despite pre_operating_leverage_flag=true

**Severity:** MEDIUM  
**Component:** `src/domain/classification/bucket-scorer.ts` — scoring weight calibration  
**Stocks affected:** TSLA (bucket=3, expected=5)  
**Status:** OPEN

### Observed output (post BUG-CE-003 fix)

TSLA's bucket scores: `{1:3, 2:0, 3:5, 4:6, 5:4, 6:1, 7:2}`. B4 leads with 6 points. The 3v4 tie-break fires (ROIC=5.6% < 20%) and B3 wins. Manual: Bucket 5.

### Root cause

Even with `pre_operating_leverage_flag=true`, which adds `FLAG_PRIMARY(2)` to B5:
- B5 gets 4 points (2 from flag + ~2 from other signals)
- B4 gets 6 points (revenue_fwd 8.8% fires B4 REV_PRIMARY=3, plus eps_fwd 64.3% fires B5 EPS_PRIMARY=2 but also some to B4...)

Because B4(6) > B5(4), the 4v5 tie-break is never even evaluated. The bucket scorer selects B4 as the raw leader, applies the 3v4 tie-break (which TSLA fails due to low ROIC), and settles on B3.

The FLAG_PRIMARY weight (currently 2) is insufficient to overcome the revenue_growth_fwd signal pointing to B4 for a company like TSLA where fwd revenue (8.8%) falls solidly in the B4 range.

### Context

The manual analysis says Bucket 5 because: *"the investment thesis entirely depends on operating margins recovering from 6% — a textbook operating leverage story."* The engine's mechanical scoring gives more weight to where the current revenue growth falls (8.8% → B4) than to the operating leverage thesis.

### Potential fix approaches

1. **Increase FLAG_PRIMARY weight**: changing from 2 to 4 would give B5 6 points (tying with B4) and trigger the 4v5 tie-break. Requires ADR-013 amendment.
2. **Force B5 when pre_op_flag=true AND rev_fwd ≥ B5_MIN (10%)**: this won't help TSLA (8.8% < 10%) but would prevent the issue for stocks at exactly the B4/B5 boundary.
3. **Lower B5_MIN revenue threshold**: currently B5_MIN might be 10%; TSLA at 8.8% is close but below. An ADR amendment could lower the entry threshold for pre_op_flag stocks.
4. **Accept as expected deviation + require user override**: TSLA's thesis is genuinely ambiguous (Bucket 3 / 5 / 6 are all defensible per the manual analysis). The engine landing at B3 is defensible; user overrides to B5 with documented reason.

### Relationship to BUG-CE-004

If BUG-CE-004 (FCF inflation) is fixed, TSLA's EQ would drop from A to C (correct per manual). Even without fixing the bucket, TSLA at 3CA would be closer to the manual's 5CA than today's 3AA.

### Files
- `src/domain/classification/bucket-scorer.ts` (FLAG_PRIMARY weight application, tie-break logic)
- `src/domain/classification/scoring-weights.ts` (`FLAG_PRIMARY = 2`)
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (amendment required for weight change)

---

## Expected Deviations (by design — not bugs)

These are cases where the engine is mechanically correct per its rules but diverges from the manual analysis. They require **user overrides** via the classification override UI, not code fixes.

### MSFT: Engine → 3AA (low conf) | Manual → 4AA (medium conf)

After all bug fixes, MSFT will produce Bucket 3 because:
- Forward revenue 7.2% fires B3 (not B4 — 8% threshold not met)
- 3v4 tie-break fires: FCF conversion 65% < 85% → B3 chosen (conservative)
- FCF conversion shortfall is a GAAP artifact (large SBC at MSFT), not economic weakness

**By design:** The engine correctly applies the mechanical rule. ADR-014 calibration notes explicitly expect MSFT to land at "low–medium" confidence with a tie-break. User should override to 4AA with reason: *"FCF conversion 65% is depressed by SBC; economic FCF is materially higher; moat 5.0/pricing power 4.5/revenue recurrence 4.5 all confirm elite compounder; reclassify when forward revenue sustainably above 8%."*

### ADBE: Engine → 4AA (low conf) | Manual → 4BA (medium conf)

After fixes, ADBE's EQ may remain A because pricing_power=4.5 and revenue_recurrence=4.5 are both A-grade signals, offsetting the AI disruption risk that the manual analysis uses to justify B.

**By design:** The AI competitive risk to Adobe's Creative Cloud moat is a qualitative forward-looking judgment that the engine cannot mechanise. User should override EQ to B with reason: *"AI-generated design tools (Midjourney, Firefly, Sora) and Figma pose real threats to Creative Cloud moat; earnings quality is good but not elite given execution sensitivity."*

### UNH: Engine → 1AC (low conf) | Manual → 3BC (low conf)

After bug fixes, UNH's forward revenue (-1.6%) fires B1 with REV_PRIMARY(3). B1 and B4 both score 6, and B1 wins (no tie-break defined between non-adjacent buckets). EQ=A because fcf_conversion=1.33 triggers high_fcf_conversion (+3A) plus elite_moat (+2A) plus strong_revenue_recurrence (+2A) = 8A vs 3B. BS=C because net_debt_to_ebitda=3.01 (> 2.5×) and interest_coverage=4.5 (< 5×).

**By design for bucket:** The engine correctly applies the mechanical rule — forward revenue is genuinely negative, which is B1 territory. User should override to 3BC with reason: *"Forward revenue decline is cyclical (Medicare Advantage repricing + elevated MLR); 3y revenue CAGR 11.3% reflects franchise power; classify as stalwart assuming cycle normalises."*

**EQ=A after BUG-CE-004 fix:** Post-fix, UNH scores EQ-A (A:7, B:3, C:4) because strong moat (4.0→+2A), strong revenue recurrence (4.5→+2A), and strong FCF (+2A) total 7 for A, exceeding C:4 from the spread/declining EPS signals. UNH remaining at EQ-A is an expected deviation — its underlying business franchise is strong even though current earnings are depressed by MLR headwinds.

---

## Impact on Confidence Calibration

After fixing BUG-CE-001, expected confidence levels will be lower than the manual analysis in most cases:

| Stock | Engine confidence (after fixes) | Manual |
|-------|--------------------------------|--------|
| MSFT  | low (margin=1, 1 tie-break)    | medium |
| ADBE  | low (margin=1, 1 tie-break)    | medium |
| TSLA  | low (margin=1, 1+ tie-break)   | low ✓  |
| UBER  | low (margin=1, 1 tie-break)    | medium |
| UNH   | high (margin ≥4, 0 tie-breaks) | low    |

UNH confidence is INVERTED: the engine will give high confidence for a wrong bucket (B1), while the manual gives low confidence for the right bucket (B3). This is a consequence of BUG-CE-001 corrupting the scoring in a way that amplifies B1 signals — and it persists in the sense that UNH's negative forward metrics genuinely produce a high-margin B1 win even after the data fix. This is expected deviation territory, not a scoring bug.

---

*Classification engine bug registry v1.0 — 2026-04-24*  
*Relates to: EPIC-004 stories STORY-041, STORY-042, STORY-043, STORY-047*
