# STORY-039 — Enrichment Score Columns: Schema Migration + Prisma Update

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, schema_verified — prisma generate clean; 484/484 unit tests passing; migration SQL ready for deploy)

## Purpose
Before E1–E6 qualitative scores can be persisted (STORY-040), the six DB columns and their Prisma model mappings must exist. This story adds the columns via a migration and updates all affected types. Keeping schema work separate from logic work follows the established EPIC-003 pattern (each schema migration gets its own story).

## Story
As a **developer**,
I want **six new DECIMAL(3,2) columns added to the stocks table for E1–E6 qualitative enrichment scores** —
so that **STORY-040 can persist LLM-computed scores without schema changes mid-implementation**.

## Outcome
New columns (all nullable):
- `description TEXT` — company business description from FMP profile (needed by combined-enrichment.md prompt in STORY-040)
- `moat_strength_score DECIMAL(3,2)`
- `pricing_power_score DECIMAL(3,2)`
- `revenue_recurrence_score DECIMAL(3,2)`
- `margin_durability_score DECIMAL(3,2)`
- `capital_intensity_score DECIMAL(3,2)`
- `qualitative_cyclicality_score DECIMAL(3,2)`

Prisma model fields and migration SQL. Schema tests updated. No application logic in this story.

**Note on description:** The `description` column was never in the original stocks schema. FMP's `/profile` endpoint returns a `description` field which the FMP adapter already reads into `StockMetadata.description` (STORY-035). This column must exist before STORY-040 can pass meaningful company descriptions to the combined LLM prompt.

## Scope In

### Task 1 — Prisma schema update
Add the following fields to the `Stock` model in `prisma/schema.prisma`:
```prisma
// EPIC-003.1: STORY-039 — company description (for combined LLM prompt in STORY-040)
description                   String?  @db.Text

// EPIC-003.1: STORY-039 — LLM enrichment scores
moatStrengthScore             Decimal? @db.Decimal(3, 2) @map("moat_strength_score")
pricingPowerScore             Decimal? @db.Decimal(3, 2) @map("pricing_power_score")
revenueRecurrenceScore        Decimal? @db.Decimal(3, 2) @map("revenue_recurrence_score")
marginDurabilityScore         Decimal? @db.Decimal(3, 2) @map("margin_durability_score")
capitalIntensityScore         Decimal? @db.Decimal(3, 2) @map("capital_intensity_score")
qualitativeCyclicalityScore   Decimal? @db.Decimal(3, 2) @map("qualitative_cyclicality_score")
```
Placement: `description` after `country`; scores after `gaapAdjustmentFactor` (end of valuation metrics block).

### Task 2 — Migration SQL
Create `prisma/migrations/20260421000005_add_enrichment_scores/migration.sql`:
```sql
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "description"                   TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "moat_strength_score"           DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "pricing_power_score"           DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "revenue_recurrence_score"      DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "margin_durability_score"       DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "capital_intensity_score"       DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "qualitative_cyclicality_score" DECIMAL(3, 2);
```

### Task 3 — Run `prisma generate`
Regenerate Prisma client. Verify types compile.

### Task 4 — Update schema contract tests
Add the 6 new columns to `tests/integration/data-ingestion/schema-contract.test.ts` assertions.

### Task 5 — Update `ClassificationEnrichmentScores` type (RFC-001 types.ts or equivalent)
Ensure the TypeScript type used by the classification engine input matches the DB field names.

## Acceptance Criteria
- [ ] Migration SQL applies cleanly with `prisma migrate deploy`
- [ ] `prisma generate` completes without TypeScript errors
- [ ] Schema contract tests pass with new columns (including `description`)
- [ ] No existing tests broken
- [ ] `description` column present and nullable in stocks table

## Dependencies
- STORY-031 (last schema migration; sequential migration numbering)
