// EPIC-004: Classification Engine & Universe Screen
// STORY-044: Classification State Persistence and History
// TASK-044-004: persistClassification, getClassificationState, getClassificationHistory
// RFC-001 §Classification State, §Classification History, §Data Model
// ADR-007 (hybrid shared/per-user classification state); ADR-001 (Prisma/Cloud SQL data layer)

import { PrismaClient } from '@prisma/client';
import type {
  ClassificationResult,
  ClassificationInput,
  ClassificationState,
  ClassificationHistoryRow,
  ClassificationScoresPayload,
} from './types';

const prisma = new PrismaClient();

// ── persistClassification ────────────────────────────────────────────────────
// Upserts classification_state and conditionally appends classification_history.
// All three operations (read + upsert + conditional insert) execute in a single
// DB transaction — rollback on any error leaves both tables unchanged.
//
// History insert rule: fires when old_suggested_code !== new_suggested_code.
// This correctly skips null→null (null !== null = false) while capturing all
// real transitions: first code, code change, and code → null.
export async function persistClassification(
  ticker: string,
  result: ClassificationResult,
  input: ClassificationInput,
): Promise<void> {
  const classifiedAt = new Date();

  // Combine scores + audit trail into the single `scores` JSONB column
  const scoresPayload: ClassificationScoresPayload = {
    bucket: result.scores.bucket,
    eq: result.scores.eq,
    bs: result.scores.bs,
    confidenceBreakdown: result.confidenceBreakdown,
    tieBreaksFired: result.tieBreaksFired,
  };

  await prisma.$transaction(async (tx) => {
    const current = await tx.classificationState.findUnique({
      where: { ticker },
      select: { suggestedCode: true },
    });

    await tx.classificationState.upsert({
      where: { ticker },
      create: {
        ticker,
        suggestedCode: result.suggested_code,
        confidenceLevel: result.confidence_level,
        reasonCodes: result.reason_codes,
        scores: scoresPayload as object,
        inputSnapshot: input as object,
        classifiedAt,
      },
      update: {
        suggestedCode: result.suggested_code,
        confidenceLevel: result.confidence_level,
        reasonCodes: result.reason_codes,
        scores: scoresPayload as object,
        inputSnapshot: input as object,
        classifiedAt,
      },
    });

    const oldCode = current?.suggestedCode ?? null;
    if (oldCode !== result.suggested_code) {
      await tx.classificationHistory.create({
        data: {
          ticker,
          oldSuggestedCode: oldCode,
          newSuggestedCode: result.suggested_code,
          contextSnapshot: {
            input_snapshot: input,
            scores: result.scores,
            reason_codes: result.reason_codes,
          } as object,
          classifiedAt,
        },
      });
    }
  });
}

// ── getClassificationState ───────────────────────────────────────────────────
export async function getClassificationState(
  ticker: string,
): Promise<ClassificationState | null> {
  const row = await prisma.classificationState.findUnique({ where: { ticker } });
  if (!row) return null;
  return {
    ticker: row.ticker,
    suggested_code: row.suggestedCode ?? null,
    confidence_level: row.confidenceLevel as 'high' | 'medium' | 'low',
    reason_codes: row.reasonCodes as string[],
    scores: row.scores as unknown as ClassificationScoresPayload,
    input_snapshot: row.inputSnapshot as unknown as ClassificationInput,
    classified_at: row.classifiedAt,
    updated_at: row.updatedAt,
  };
}

// ── getClassificationHistory ─────────────────────────────────────────────────
export async function getClassificationHistory(
  ticker: string,
  limit = 50,
): Promise<ClassificationHistoryRow[]> {
  const rows = await prisma.classificationHistory.findMany({
    where: { ticker },
    orderBy: { classifiedAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    old_suggested_code: row.oldSuggestedCode ?? null,
    new_suggested_code: row.newSuggestedCode ?? null,
    context_snapshot: row.contextSnapshot as unknown as ClassificationHistoryRow['context_snapshot'],
    classified_at: row.classifiedAt,
  }));
}
