// EPIC-004: Classification Engine & Universe Screen
// STORY-043: Classification Result Assembly (Tie-Break, Confidence, Special Cases)
// TASK-043-002: classifyStock — orchestrates BucketScorer, EQ scorer, BS scorer; resolves ties;
//              applies overrides; computes confidence; returns ClassificationResult
// RFC-001 §ClassificationResult, §Tie-Break Rules, §Confidence Computation, §Special Cases
// ADR-013 (scoring weights); ADR-014 (confidence thresholds)

import type { ClassificationInput, ClassificationResult, ConfidenceStep, TieBreakRecord, BucketNumber } from './types';
import { BucketScorer } from './bucket-scorer';
import { EarningsQualityScorer } from './eq-scorer';
import { BalanceSheetQualityScorer } from './bs-scorer';
import {
  NULL_SUGGESTION_THRESHOLD,
  HIGH_MARGIN_THRESHOLD,
  MEDIUM_MARGIN_THRESHOLD,
} from './confidence-thresholds';

type ConfidenceBand = 'high' | 'medium' | 'low';

function degradeOnce(band: ConfidenceBand): ConfidenceBand {
  if (band === 'high') return 'medium';
  if (band === 'medium') return 'low';
  return 'low';
}

// ── Tie-break resolution ────────────────────────────────────────────────────
//
// Tie-break pairs processed in this priority order (ADR-014 §Tie-Break Rules;
// Key Risk: three-way tie — apply 4v5 before 3v4 to handle B3/B4/B5 overlap correctly):
//
//   Priority 1: 4v5 — overlapping ranges [10–15%]; most common overlap zone
//   Priority 2: 5v6 — overlapping ranges (15–20%]
//   Priority 3: 3v4 — adjacent boundary zone (3–8% vs 8–15%)
//   Priority 4: 6v7 — hypergrowth threshold (>35%)
//
// A pair (p, q) fires when BOTH buckets are within 1 point of the current topScore.
// After a pair fires, the loser is eliminated (score set to -Infinity) before checking
// the next pair. This allows a second tie-break to fire in three-way scenarios.
function resolveTieBreaks(
  scores: Record<BucketNumber, number>,
  input: ClassificationInput,
  initialMargin: number,
): { resolvedBucket: BucketNumber | null; tieBreaksFired: TieBreakRecord[]; resolvedScores: Record<number, number> } {
  // Work on a mutable copy; Bucket 8 always excluded from tie-break resolution
  // resolvedScores is returned so callers (floor search) can compute accurate post-tie-break margins
  const s: Record<number, number> = { ...scores, 8: -Infinity };
  const tieBreaksFired: TieBreakRecord[] = [];

  // Helper: current topScore among buckets 1–7
  function topScore(): number {
    return Math.max(s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
  }

  // Eliminate the loser bucket from further tie-break consideration
  function eliminate(b: number): void {
    s[b] = -Infinity;
  }

  // Pairs in priority order: [higher, lower] for readability; rule chooses between them
  type Pair = [number, number];
  const PAIRS: Pair[] = [[4, 5], [5, 6], [3, 4], [6, 7]];

  const top = topScore();
  if (top <= 0) {
    // All scores 0 — no winner, no tie-breaks
    return { resolvedBucket: null, tieBreaksFired: [], resolvedScores: { ...s } };
  }

  for (const [a, b] of PAIRS) {
    const currentTop = topScore();
    const sa = s[a];
    const sb = s[b];
    // Both must be within 1 point of the current topScore to trigger
    if (currentTop - sa > 1 || currentTop - sb > 1) continue;
    // One of them must actually be at/near the top (not already eliminated)
    if (sa === -Infinity || sb === -Infinity) continue;
    if (Math.abs(sa - sb) > 1) continue; // not within 1 of each other

    // Apply the rule for this pair
    let winner: number;
    let condition: string;
    let outcome: string;
    let values: Record<string, number | null>;

    if (a === 4 && b === 5) {
      // Prefer B5 if pre_operating_leverage_flag = true; else B4
      const flag = input.pre_operating_leverage_flag ?? false;
      winner = flag ? 5 : 4;
      condition = 'pre_operating_leverage_flag = true → B5; else B4';
      outcome = flag ? 'Bucket 5 chosen: operating leverage thesis confirmed' : 'Bucket 4 chosen: operating leverage not flagged';
      values = { pre_operating_leverage_flag: flag ? 1 : 0 };
    } else if (a === 5 && b === 6) {
      // Prefer B5 if pre_operating_leverage_flag = true; else B6
      const flag = input.pre_operating_leverage_flag ?? false;
      winner = flag ? 5 : 6;
      condition = 'pre_operating_leverage_flag = true → B5; else B6';
      outcome = flag ? 'Bucket 5 chosen: operating leverage thesis' : 'Bucket 6 chosen: high-growth without leverage thesis';
      values = { pre_operating_leverage_flag: flag ? 1 : 0 };
    } else if (a === 3 && b === 4) {
      // Prefer B4 if fcf_conversion > 0.85 AND roic > 0.20; else B3 (conservative)
      const fcf = input.fcf_conversion ?? null;
      const roic = input.roic ?? null;
      const qualifiesForB4 = fcf !== null && roic !== null && fcf > 0.85 && roic > 0.20;
      winner = qualifiesForB4 ? 4 : 3;
      condition = 'fcf_conversion > 0.85 AND roic > 0.20 → B4; else B3';
      outcome = qualifiesForB4
        ? 'Bucket 4 chosen: strong FCF conversion and ROIC'
        : 'Bucket 3 chosen: FCF or ROIC below threshold (conservative)';
      values = { fcf_conversion: fcf, roic };
    } else {
      // 6v7: Prefer B7 if revenue_growth_fwd >= 0.35; else B6
      const rev = input.revenue_growth_fwd ?? null;
      const qualifiesForB7 = rev !== null && rev >= 0.35;
      winner = qualifiesForB7 ? 7 : 6;
      condition = 'revenue_growth_fwd >= 0.35 → B7; else B6';
      outcome = qualifiesForB7
        ? 'Bucket 7 chosen: confirmed hypergrowth (revenue ≥ 35%)'
        : 'Bucket 6 chosen: revenue below hypergrowth threshold';
      values = { revenue_growth_fwd: rev };
    }

    const loser = winner === a ? b : a;
    tieBreaksFired.push({
      rule: `${Math.min(a, b)}v${Math.max(a, b)}`,
      description: `Bucket ${Math.min(a, b)} vs Bucket ${Math.max(a, b)} tie-break`,
      winner,
      condition,
      values,
      outcome,
      marginAtTrigger: initialMargin,
    });
    eliminate(loser);
  }

  // Find the final winner: highest remaining score among 1–7
  let resolvedBucket: BucketNumber | null = null;
  let bestScore = -Infinity;
  for (let bucket = 1; bucket <= 7; bucket++) {
    if (s[bucket] > bestScore) {
      bestScore = s[bucket];
      resolvedBucket = bucket as BucketNumber;
    }
  }
  if (bestScore <= 0) resolvedBucket = null;

  return { resolvedBucket, tieBreaksFired, resolvedScores: { ...s } };
}

// ── Confidence computation ──────────────────────────────────────────────────
// ADR-014 §Confidence Computation Rules (Steps 2–4; Step 1 handled in classifyStock)
// STORY-069: Step 5 trajectory quality penalty inserted between old Steps 4 and 5 (now Step 6)
function computeConfidence(
  margin: number,
  tieBreakCount: number,
  missingFieldCount: number,
  trendMetrics?: ClassificationInput['trend_metrics'],
  eq_grade?: 'A' | 'B' | 'C' | null,
): { confidence_level: ConfidenceBand; steps: ConfidenceStep[] } {
  const steps: ConfidenceStep[] = [];

  // Step 2: score margin
  let band: ConfidenceBand;
  if (margin >= HIGH_MARGIN_THRESHOLD) {
    band = 'high';
  } else if (margin >= MEDIUM_MARGIN_THRESHOLD) {
    band = 'medium';
  } else {
    band = 'low';
  }
  steps.push({ step: 2, label: 'score margin', note: `margin = ${margin}`, band, missing: missingFieldCount });

  // Step 3: tie-break penalty — each tie-break degrades one level; ≥ 2 forces low
  if (tieBreakCount >= 2) {
    band = 'low';
  } else if (tieBreakCount === 1) {
    band = degradeOnce(band);
  }
  steps.push({ step: 3, label: 'tie-break penalty', note: `${tieBreakCount} tie-break(s)`, band, tieBreaks: tieBreakCount });

  // Step 4: missing-field penalty — 5 forces low; 3–4 degrades one level
  if (missingFieldCount >= 5) {
    band = 'low';
  } else if (missingFieldCount >= 3) {
    band = degradeOnce(band);
  }
  steps.push({ step: 4, label: 'missing-field penalty', note: `missing = ${missingFieldCount}`, band, missing: missingFieldCount });

  // Step 5: trajectory quality penalty (STORY-069) — skipped entirely when trend_metrics absent
  // RFC-001 Amendment 2026-04-25: quarterly history depth and stability signals degrade confidence
  if (trendMetrics != null) {
    const qa = trendMetrics.quartersAvailable ?? 0;
    const conditionNotes: string[] = [];

    if (qa < 4) {
      // Force LOW — insufficient quarterly history to validate any confidence level
      band = 'low';
      conditionNotes.push(`quarters_available=${qa} < 4 → force LOW`);
    } else {
      // Cap at MEDIUM when 4–7 quarters (not enough history to confirm HIGH)
      if (qa < 8 && band === 'high') {
        band = 'medium';
        conditionNotes.push(`quarters_available=${qa} < 8 → cap MEDIUM`);
      }

      // Volatile operating margins → degrade one level
      const stabilityScore = trendMetrics.operatingMarginStabilityScore ?? null;
      if (stabilityScore !== null && stabilityScore < 0.40) {
        band = degradeOnce(band);
        conditionNotes.push(`stability_score=${stabilityScore.toFixed(2)} < 0.40 → degrade`);
      }

      // Deteriorating CFO + seemingly good EQ grade is contradictory → degrade
      if (trendMetrics.deterioratingCashConversionFlag === true && (eq_grade === 'A' || eq_grade === 'B')) {
        band = degradeOnce(band);
        conditionNotes.push(`deteriorating_cfo=true + eq_grade=${eq_grade} → degrade`);
      }

      // Severely negative EQ trend score → degrade
      const eqTrend = trendMetrics.earningsQualityTrendScore ?? null;
      if (eqTrend !== null && eqTrend < -0.50) {
        band = degradeOnce(band);
        conditionNotes.push(`eq_trend_score=${eqTrend.toFixed(2)} < -0.50 → degrade`);
      }
    }

    steps.push({
      step: 5,
      label: 'trajectory quality penalty',
      note: conditionNotes.length > 0 ? conditionNotes.join('; ') : 'no degradation',
      band,
    });
  }

  // Step 6 (or 5 when trend_metrics absent): final
  const finalStepNumber = trendMetrics != null ? 6 : 5;
  steps.push({ step: finalStepNumber, label: 'final', note: band, band });

  return { confidence_level: band, steps };
}

// ── classifyStock ───────────────────────────────────────────────────────────
export function classifyStock(input: ClassificationInput): ClassificationResult {
  // Step 0: Run all three scorers
  const bucketResult = BucketScorer(input);
  const eqResult     = EarningsQualityScorer(input);
  const bsResult     = BalanceSheetQualityScorer(input);
  const missing      = bucketResult.missing_field_count;

  // Step 1: Null-suggestion gate (ADR-014 §Step 1)
  // When missing > 5 critical fields → too sparse to classify
  if (missing > NULL_SUGGESTION_THRESHOLD) {
    const step1: ConfidenceStep = {
      step: 1,
      label: 'null-suggestion gate',
      note: `missing_field_count=${missing} > ${NULL_SUGGESTION_THRESHOLD} — data too sparse`,
      band: 'low',
      missing,
    };
    return {
      suggested_code: null,
      bucket: null,
      eq_grade: null,
      bs_grade: null,
      confidence_level: 'low',
      reason_codes: [...bucketResult.reason_codes],
      scores: { bucket: bucketResult.scores, eq: eqResult.scores, bs: bsResult.scores },
      missing_field_count: missing,
      confidenceBreakdown: { steps: [step1] },
      tieBreaksFired: [],
    };
  }

  // Step 2: Tie-break resolution (tieBreaksFired declared let — floor search may replace it)
  const initialTieBreakResult = resolveTieBreaks(
    bucketResult.scores,
    input,
    bucketResult.margin,
  );
  const resolvedBucket = initialTieBreakResult.resolvedBucket;
  let tieBreaksFired = initialTieBreakResult.tieBreaksFired;

  // Step 3: Special-case overrides (priority order: binary_flag highest)
  let finalBucket = resolvedBucket;
  const flagCodes: string[] = [];

  // binary_flag → force Bucket 8; overrides all other results including tie-break
  if (input.binary_flag === true) {
    finalBucket = 8;
    flagCodes.push('binary_flag_override');
  }
  // holding_company_flag → if bucket is 3 or 4, force to 3 (conservative)
  // Does NOT apply when binary_flag already set bucket = 8
  else if (input.holding_company_flag === true && (finalBucket === 3 || finalBucket === 4)) {
    finalBucket = 3;
    flagCodes.push('holding_company_flag_applied');
  }
  // cyclicality_flag: reason code only; no bucket change
  if (input.cyclicality_flag === true) {
    flagCodes.push('cyclicality_flag_applied');
  }
  // Note: insurer_flag_applied and optionality_flag_applied are already added by BucketScorer

  // Step 4: Grades (null for Bucket 8; null when scorer winner is null)
  const eq_grade = finalBucket === 8 ? null : (eqResult.winner ?? null);
  const bs_grade = finalBucket === 8 ? null : (bsResult.winner ?? null);

  // Step 5: Confidence computation (steps 2–5/6; Step 5 trajectory penalty when trend_metrics present)
  let { confidence_level, steps } = computeConfidence(
    bucketResult.margin,
    tieBreaksFired.length,
    missing,
    input.trend_metrics,
    eq_grade,
  );

  // Step 5b: Confidence-floor bucket selection (STORY-083; ADR-014 §Confidence-Floor)
  // Two-phase resolution when the winning bucket produces low confidence:
  //
  // Phase 1 — tied-competitor pre-pass (ADR-014 §Confidence-Floor Amendment 2026-04-27):
  //   When a tie-break rule fired to resolve an exact score tie, first verify the raw winner
  //   by excluding its exact tied competitors. If the raw winner achieves medium+ confidence
  //   without them, accept it — no demotion needed.
  //   Condition: a tie-break rule must have actually fired (tieBreaksFired.length > 0) so that
  //   positional wins (no rule, e.g., B1/B4 tie with no 1v4 rule) fall through to Phase 2.
  //
  // Phase 2 — downward search (original STORY-083 algorithm):
  //   Iterate downward through remaining candidate buckets (by score rank) until a bucket
  //   achieving at least medium confidence is found.
  //
  // B8 and binary_flag stocks are exempt from both phases.
  let rawSuggestedCode: string | null | undefined;
  let rawConfidenceLevel: 'low' | null | undefined;
  let confidenceFloorApplied = false;

  if (confidence_level === 'low' && finalBucket !== null && finalBucket !== 8 && !input.binary_flag && !input.holding_company_flag) {
    // Capture pre-floor code for audit trail
    rawSuggestedCode = (eq_grade && bs_grade)
      ? `${finalBucket}${eq_grade}${bs_grade}`
      : `${finalBucket}`;
    rawConfidenceLevel = 'low';

    // Phase 1: tied-competitor pre-pass
    if (tieBreaksFired.length > 0) {
      const winnerScore = bucketResult.scores[finalBucket as BucketNumber];
      const tiedCompetitors = ([1, 2, 3, 4, 5, 6, 7] as const).filter(
        b => b !== finalBucket && bucketResult.scores[b] === winnerScore,
      );

      if (tiedCompetitors.length > 0) {
        const prePassScores = { ...bucketResult.scores } as Record<BucketNumber, number>;
        for (const b of tiedCompetitors) {
          prePassScores[b] = -Infinity;
        }

        const { resolvedBucket: preB, tieBreaksFired: preTB, resolvedScores: preS } =
          resolveTieBreaks(prePassScores, input, bucketResult.margin);

        if (preB === finalBucket) {
          const secondBest = Math.max(
            0,
            ...([1, 2, 3, 4, 5, 6, 7] as const)
              .filter(b => b !== finalBucket && (preS[b] ?? -Infinity) > 0)
              .map(b => preS[b] as number),
          );
          const preMargin = Math.max(0, (preS[finalBucket] ?? 0) - secondBest);
          const { confidence_level: preConf, steps: preSteps } = computeConfidence(
            preMargin,
            preTB.length,
            missing,
            input.trend_metrics,
            eq_grade,
          );

          if (preConf !== 'low') {
            tieBreaksFired = preTB;
            confidence_level = preConf;
            steps = preSteps;
            confidenceFloorApplied = true;
          }
        }
      }
    }

    // Phase 2: downward search (only if pre-pass did not resolve)
    if (!confidenceFloorApplied) {
      const excludedBuckets = new Set<number>([finalBucket]);

      for (let attempt = 0; attempt < 6; attempt++) {
        // Build modified scores with all excluded buckets eliminated
        const searchScores = { ...bucketResult.scores } as Record<BucketNumber, number>;
        for (const b of excludedBuckets) {
          searchScores[b as BucketNumber] = -Infinity;
        }

        // Stop if no candidate with a positive score remains
        const hasCandidate = ([1, 2, 3, 4, 5, 6, 7] as const).some(
          b => !excludedBuckets.has(b) && bucketResult.scores[b] > 0,
        );
        if (!hasCandidate) break;

        const { resolvedBucket: candidate, tieBreaksFired: candidateTieBreaks, resolvedScores } =
          resolveTieBreaks(searchScores, input, bucketResult.margin);

        if (!candidate || candidate === 8) break;

        // Use post-tie-break scores for margin: tie-break losers are set to -Infinity in resolvedScores,
        // preventing them from inflating secondBest and incorrectly depressing candidateMargin
        const candidateScore = resolvedScores[candidate] ?? 0;
        const secondBest = Math.max(
          0,
          ...([1, 2, 3, 4, 5, 6, 7] as const)
            .filter(b => b !== candidate && (resolvedScores[b] ?? -Infinity) > 0)
            .map(b => resolvedScores[b] as number),
        );
        const candidateMargin = Math.max(0, candidateScore - secondBest);

        const { confidence_level: candidateConf, steps: candidateSteps } = computeConfidence(
          candidateMargin,
          candidateTieBreaks.length,
          missing,
          input.trend_metrics,
          eq_grade,
        );

        if (candidateConf !== 'low') {
          // Accept this candidate as the final classification
          finalBucket = candidate;
          tieBreaksFired = candidateTieBreaks;
          confidence_level = candidateConf;
          steps = candidateSteps;
          confidenceFloorApplied = true;
          break;
        }

        // Still low — exclude this candidate and continue downward
        excludedBuckets.add(candidate);
      }
    }
  }

  const confidenceSteps: ConfidenceStep[] = [
    { step: 1, label: 'null-suggestion gate', note: 'passed — sufficient data', band: confidence_level },
    ...steps,
  ];

  // Step 6: Code assembly (uses post-floor finalBucket)
  let suggested_code: string | null = null;
  if (finalBucket !== null) {
    if (finalBucket === 8) {
      suggested_code = '8';
    } else if (eq_grade && bs_grade) {
      suggested_code = `${finalBucket}${eq_grade}${bs_grade}`;
    } else {
      suggested_code = `${finalBucket}`;
    }
  }

  const reason_codes = [
    ...bucketResult.reason_codes,
    ...eqResult.reason_codes,
    ...bsResult.reason_codes,
    ...flagCodes,
  ];

  return {
    suggested_code,
    bucket: finalBucket,
    eq_grade,
    bs_grade,
    confidence_level,
    reason_codes,
    scores: { bucket: bucketResult.scores, eq: eqResult.scores, bs: bsResult.scores },
    missing_field_count: missing,
    confidenceBreakdown: { steps: confidenceSteps },
    tieBreaksFired,
    ...(confidenceFloorApplied && {
      rawSuggestedCode,
      rawConfidenceLevel,
      confidenceFloorApplied: true,
    }),
  };
}
