# STORY-089 — Schema Migration: Regime Decoupling + ValuationRegimeThreshold Seed

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Lay the database foundation for EPIC-008. This story creates all new columns and the new `valuation_regime_thresholds` table, seeds it with the 9 base rows (A/A quality), and updates `valuation_state_status` default. Nothing in the application logic changes; this story is pure schema + seed.

## Story
As the system,
I want the database schema extended with regime, cyclicality, and bank-flag fields,
so that EPIC-008 domain services have a stable persistence target from the first story onward.

## Outcome
Prisma schema updated, migration applied, `valuation_regime_thresholds` seeded, all downstream stories can reference new fields.

## Scope In

### New columns on `stock` table
- `bank_flag` (boolean, not null, default false)
- `structural_cyclicality_score` (int, nullable, range 0–3)
- `cycle_position` (varchar(30), nullable — depressed/normal/elevated/peak/insufficient_data)
- `cyclical_confidence` (varchar(20), nullable — high/medium/low/insufficient_data)

> **Rationale for stock-level storage:** CyclicalScoreService computes confidence from quarterly history count and signal clarity. It must persist this to `stock` so that `loadValuationInput()` can include it in `ValuationInput` without re-reading quarterly history. ThresholdAssigner receives it as an input and passes it through to `ValuationResult` → `valuation_state`.

### New table: `valuation_regime_thresholds`
Replaces code-keyed `anchored_thresholds` as the base source for regime-driven threshold computation.

| Column | Type | Description |
|---|---|---|
| `regime` | varchar(40) PK | One of 9 ValuationRegime values |
| `primary_metric` | varchar(50) | Metric for this regime |
| `max_threshold` | decimal(10,2) nullable | A/A base max |
| `comfortable_threshold` | decimal(10,2) nullable | A/A base comfortable |
| `very_good_threshold` | decimal(10,2) nullable | A/A base very good |
| `steal_threshold` | decimal(10,2) nullable | A/A base steal |
| `effective_from` | timestamptz | When this row became active |
| `effective_until` | timestamptz nullable | For future versioning (null = current) |
| `notes` | text nullable | Human-readable annotation |

### New columns on `valuation_state`
- `valuation_regime` (varchar(40), nullable — null until first EPIC-008 compute run)
- `threshold_family` (varchar(60), nullable — e.g. `profitable_growth_pe_mid_BA`)
- `structural_cyclicality_score_snapshot` (int, nullable)
- `cycle_position_snapshot` (varchar(30), nullable)
- `cyclical_overlay_applied` (boolean, nullable)
- `cyclical_overlay_value` (decimal(5,2), nullable)
- `cyclical_confidence` (varchar(20), nullable — high/medium/low/insufficient_data)
- `growth_tier` (varchar(20), nullable — high/mid/standard/null)

### `valuation_state_status` default update
Change column default from `'ready'` to `'computed'`. Existing `'ready'` records treated as `'computed'` by application logic (backward-compatible read: `status === 'ready' || status === 'computed'` → computed).

### TypeScript types
- Add `ValuationRegime` union type to `src/domain/valuation/types.ts`
- Add `CyclePosition` union type
- Add `GrowthTier` type
- Update `ValuationStateStatus` union to 5 canonical states: `'classification_required' | 'not_applicable' | 'manual_required' | 'computed' | 'stale'`
- Add `ValuationRegimeThresholdRow` interface (mirrors DB row)

## Scope Out
- Application logic (regime selector, cyclical score, threshold assigner) — STORY-091–093
- `bank_flag` population logic — STORY-090
- UI changes — STORY-095
- Deletion of `anchored_thresholds` table — out of scope for V1 (backward compat)

## Dependencies
- EPIC-005 complete ✅ (`valuation_state` table exists, `anchored_thresholds` seeded)
- STORY-004 ✅ (Prisma migrations infrastructure in place)
- STORY-005 ✅ (`anchored_thresholds` seed script pattern established)

## Preconditions
- `anchored_thresholds` table exists with 18 seeded rows (STORY-005 confirmed)
- Prisma migration CLI operational

## Seed Data: `valuation_regime_thresholds` (9 rows, A/A quality)

| Regime | Metric | Max | Comfortable | Very Good | Steal |
|---|---|---|---|---|---|
| `mature_pe` | forward_pe | 22.0 | 20.0 | 18.0 | 16.0 |
| `profitable_growth_pe` | forward_pe | 36.0 | 30.0 | 24.0 | 18.0 |
| `profitable_growth_ev_ebit` | forward_ev_ebit | 24.0 | 20.0 | 16.0 | 12.0 |
| `cyclical_earnings` | forward_ev_ebit | 16.0 | 13.0 | 10.0 | 7.0 |
| `sales_growth_standard` | ev_sales | 12.0 | 10.0 | 8.0 | 6.0 |
| `sales_growth_hyper` | ev_sales | 18.0 | 15.0 | 11.0 | 8.0 |
| `financial_special_case` | forward_operating_earnings_ex_excess_cash | null | null | null | null |
| `not_applicable` | no_stable_metric | null | null | null | null |
| `manual_required` | no_stable_metric | null | null | null | null |

> Note: `profitable_growth_pe` base row represents the **high tier** (≥35% growth). Growth tier config (mid, standard) is a runtime constant in domain code, not additional DB rows.

## Tasks

### TASK-089-001: Prisma schema — `stock` new columns
- Add `bankFlag`, `structuralCyclicalityScore`, `cyclePosition`, `cyclicalConfidence` to `Stock` model in `prisma/schema.prisma`
- `bankFlag Boolean @default(false) @map("bank_flag")`
- `structuralCyclicalityScore Int? @map("structural_cyclicality_score")`
- `cyclePosition String? @db.VarChar(30) @map("cycle_position")`
- `cyclicalConfidence String? @db.VarChar(20) @map("cyclical_confidence")`

### TASK-089-002: Prisma schema — `ValuationRegimeThreshold` model
- New Prisma model: `ValuationRegimeThreshold`
- PK: `regime` string
- All columns from the seed data table above
- `@@map("valuation_regime_thresholds")`

### TASK-089-003: Prisma schema — `valuation_state` new columns + status default
- Add all 8 new columns to `ValuationState` model
- Change `valuationStateStatus` default from `"ready"` to `"computed"`
- Add index on `valuationRegime`

### TASK-089-004: Migration SQL + seed data
- Generate Prisma migration: `npx prisma migrate dev --name epic008_regime_decoupling`
- Write seed function `seedValuationRegimeThresholds()` in `prisma/seed.ts`
- 9 rows per table above; idempotent (`upsert` by `regime`)
- Run seed in development; verify all 9 rows present

### TASK-089-005: TypeScript types update
- In `src/domain/valuation/types.ts`:
  - Add `ValuationRegime` union (9 values)
  - Add `CyclePosition` union (5 values)
  - Add `GrowthTier` union (`'high' | 'mid' | 'standard'`)
  - Replace `ValuationStateStatus` union with 5-state canonical version
  - Add `ValuationRegimeThresholdRow` interface
  - Annotate breaking change: `'ready'` → `'computed'`; `'missing_data'` → `'manual_required'`; `'manual_required_insurer'` → `'manual_required'`

### TASK-089-006: Schema contract tests
- Test: all 9 `valuation_regime_thresholds` rows present after seed
- Test: `bank_flag`, `structural_cyclicality_score`, `cycle_position` columns exist on `stock`
- Test: all 8 new columns exist on `valuation_state`
- Test: `ValuationStateStatus` type covers exactly 5 values

## Acceptance Criteria
- [ ] Migration applies cleanly from current schema with no data loss
- [ ] `valuation_regime_thresholds` seeded with exactly 9 rows; all numeric values match spec
- [ ] `bank_flag` defaults false on all existing stock rows after migration
- [ ] `structural_cyclicality_score` and `cycle_position` are nullable; existing rows have null values
- [ ] All 8 new `valuation_state` columns are nullable; existing rows unaffected (null values)
- [ ] `valuationStateStatus` default is `'computed'` on new rows; `'ready'` rows still readable
- [ ] `ValuationStateStatus` TypeScript union is `'classification_required' | 'not_applicable' | 'manual_required' | 'computed' | 'stale'`
- [ ] Schema contract tests pass

## Test Strategy
- Contract tests: assert new columns exist via Prisma introspection or raw SQL `information_schema`
- Seed idempotency test: run seed twice; verify row count stays at 9, values unchanged
- Type tests: TypeScript compile-time check that `ValuationStateStatus` accepts all 5 values and rejects `'ready'`
