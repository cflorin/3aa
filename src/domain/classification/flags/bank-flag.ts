// EPIC-008: Valuation Regime Decoupling
// STORY-090: Bank Flag Derivation (Deterministic Classification Flag)
// TASK-090-001: deriveBankFlag() pure function
// TASK-090-002: Non-overlap guard (insurer_flag takes precedence per ADR-017 Step 0B/0C ordering)

// Industries within "Financial Services" sector that map to bank_flag = true.
// Case-insensitive substring matching — FMP/Tiingo industry strings may vary.
const BANK_INDUSTRIES = ['banks', 'capital markets', 'credit services', 'diversified financial'];

// Industries within "Financial Services" that must NOT set bank_flag (insurer_flag domain, ADR-017 Step 0C).
// Also used as the non-overlap guard: if industry contains "insurance", bank_flag = false.
const INSURER_INDUSTRY_SUBSTRING = 'insurance';

export interface BankFlagInput {
  sector: string | null;
  industry: string | null;
}

/**
 * Deterministic bank_flag derivation from sector + industry strings (V1: no SIC code in schema).
 * Returns true for banks and capital-markets firms routed to manual_required (ADR-017 Step 0B).
 * Insurer overlap guard: if industry contains "insurance", returns false (Step 0C fires instead).
 *
 * Future upgrade: when sic_code is added, extend to SIC ranges 6020–6036, 6200–6211 as primary.
 */
export function deriveBankFlag(input: BankFlagInput): boolean {
  const sector = (input.sector ?? '').toLowerCase();
  const industry = (input.industry ?? '').toLowerCase();

  if (sector !== 'financial services') return false;

  // Non-overlap guard: insurance industry belongs to insurer_flag domain (ADR-017 Step 0C precedence)
  if (industry.includes(INSURER_INDUSTRY_SUBSTRING)) return false;

  return BANK_INDUSTRIES.some((bankIndustry) => industry.includes(bankIndustry));
}
