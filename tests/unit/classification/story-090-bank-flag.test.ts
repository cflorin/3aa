// EPIC-008: Valuation Regime Decoupling
// STORY-090: Bank Flag Derivation
// TASK-090-004: Unit tests for deriveBankFlag()

import { deriveBankFlag } from '@/domain/classification/flags/bank-flag';

describe('EPIC-008/STORY-090/TASK-090-004: deriveBankFlag()', () => {
  // ── True cases ───────────────────────────────────────────────────────────────

  test('Financial Services + Banks → true (JPM, BAC-like)', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Banks - Diversified' })).toBe(true);
  });

  test('Financial Services + Capital Markets → true (GS, MS-like)', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Capital Markets' })).toBe(true);
  });

  test('Financial Services + Credit Services → true', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Credit Services' })).toBe(true);
  });

  test('Financial Services + Diversified Financial → true', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Diversified Financial' })).toBe(true);
  });

  // ── False cases — insurer domain (non-overlap guard) ─────────────────────────

  test('Financial Services + Insurance → false (insurer_flag domain, non-overlap guard)', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Insurance - Life' })).toBe(false);
  });

  test('Financial Services + insurance (lowercase) → false', () => {
    expect(deriveBankFlag({ sector: 'financial services', industry: 'insurance - property & casualty' })).toBe(false);
  });

  // ── False cases — excluded industries ────────────────────────────────────────

  test('Financial Services + Asset Management → false', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Asset Management' })).toBe(false);
  });

  test('any sector + Real Estate Investment Trusts → false', () => {
    expect(deriveBankFlag({ sector: 'Real Estate', industry: 'Real Estate Investment Trusts' })).toBe(false);
  });

  // ── False cases — non-financial sectors ──────────────────────────────────────

  test('Technology + Semiconductors → false (NVDA-like)', () => {
    expect(deriveBankFlag({ sector: 'Technology', industry: 'Semiconductors' })).toBe(false);
  });

  test('Consumer Defensive + Grocery → false (WMT-like)', () => {
    expect(deriveBankFlag({ sector: 'Consumer Defensive', industry: 'Grocery Stores' })).toBe(false);
  });

  // ── Null handling ─────────────────────────────────────────────────────────────

  test('null sector, null industry → false', () => {
    expect(deriveBankFlag({ sector: null, industry: null })).toBe(false);
  });

  test('null sector, Banks industry → false (sector must be Financial Services)', () => {
    expect(deriveBankFlag({ sector: null, industry: 'Banks' })).toBe(false);
  });

  test('Financial Services sector, null industry → false', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: null })).toBe(false);
  });

  // ── Case-insensitivity ────────────────────────────────────────────────────────

  test('case-insensitive sector match', () => {
    expect(deriveBankFlag({ sector: 'financial services', industry: 'Banks' })).toBe(true);
  });

  test('case-insensitive industry match — BANKS uppercase', () => {
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'BANKS - GLOBAL' })).toBe(true);
  });

  // ── Non-overlap: both bank and insurer substring present ─────────────────────

  test('bancassurance (both bank + insurance in industry string) → false (insurer guard takes precedence)', () => {
    // Theoretical edge: "Insurance and Banking" contains both "bank" substring via "Banking"
    // but insurance guard fires first on "insurance" substring
    expect(deriveBankFlag({ sector: 'Financial Services', industry: 'Insurance and Banking' })).toBe(false);
  });
});
