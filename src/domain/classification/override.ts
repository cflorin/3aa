// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-003: resolveActiveCode — active code with provenance for a given user + ticker
// RFC-001 §User Override API; RFC-003 §Override Semantics; ADR-007 (active code resolution)
//
// Active code resolution: COALESCE(user_override.final_code, system.suggested_code)
// Override scope is display_only in V1 — alert generation always uses system suggested_code.

import { prisma } from '@/infrastructure/database/prisma';
import { getClassificationState } from './persistence';

export interface ActiveCodeResult {
  active_code: string | null;
  system_suggested_code: string | null;
  system_confidence: string | null;
  user_override_code: string | null;
  user_override_reason: string | null;
  source: 'override' | 'system' | 'none';
  override_scope: 'display_only';
}

export async function resolveActiveCode(
  userId: string,
  ticker: string,
): Promise<ActiveCodeResult> {
  const [state, override] = await Promise.all([
    getClassificationState(ticker),
    prisma.userClassificationOverride.findUnique({
      where: { userId_ticker: { userId, ticker } },
    }),
  ]);

  const systemCode = state?.suggested_code ?? null;
  const overrideCode = override?.finalCode ?? null;
  const activeCode = overrideCode ?? systemCode;

  const source = overrideCode !== null ? 'override'
    : systemCode !== null ? 'system'
    : 'none';

  return {
    active_code: activeCode,
    system_suggested_code: systemCode,
    system_confidence: state?.confidence_level ?? null,
    user_override_code: overrideCode,
    user_override_reason: override?.overrideReason ?? null,
    source,
    override_scope: 'display_only',
  };
}
