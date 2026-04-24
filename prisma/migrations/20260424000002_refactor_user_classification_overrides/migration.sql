-- EPIC-004/STORY-045: Refactor user_classification_overrides
-- RFC-001 §User Override API; ADR-007 (per-user override, active code resolution)
--
-- Remove stale columns from RFC-002 v1 design; make override_reason NOT NULL.
-- Table is empty at migration time (no override API existed before STORY-045).

-- Drop FK for overridden_by before dropping the column
ALTER TABLE "user_classification_overrides"
  DROP CONSTRAINT IF EXISTS "user_classification_overrides_overridden_by_fkey";

-- Drop stale columns
ALTER TABLE "user_classification_overrides"
  DROP COLUMN IF EXISTS "final_bucket",
  DROP COLUMN IF EXISTS "final_earnings_quality",
  DROP COLUMN IF EXISTS "final_balance_sheet_quality",
  DROP COLUMN IF EXISTS "overridden_by",
  DROP COLUMN IF EXISTS "created_at",
  DROP COLUMN IF EXISTS "updated_at";

-- Make override_reason NOT NULL (table is empty; no rows to backfill)
ALTER TABLE "user_classification_overrides"
  ALTER COLUMN "override_reason" SET NOT NULL;
