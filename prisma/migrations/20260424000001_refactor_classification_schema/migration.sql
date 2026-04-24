-- EPIC-004/STORY-044: Refactor classification_state and classification_history
-- RFC-001 §Classification State, §Classification History; ADR-007, ADR-001
--
-- classification_state: drop stale columns from RFC-002 v1 design; add input_snapshot + classified_at
-- classification_history: drop and recreate (id type change BIGSERIAL → UUID; column set reduced)
-- Both tables are empty at migration time (no persistClassification existed before STORY-044)

-- ── classification_state: drop stale columns ─────────────────────────────────

ALTER TABLE "classification_state"
  DROP COLUMN IF EXISTS "suggested_bucket",
  DROP COLUMN IF EXISTS "suggested_earnings_quality",
  DROP COLUMN IF EXISTS "suggested_balance_sheet_quality",
  DROP COLUMN IF EXISTS "classification_last_updated_at",
  DROP COLUMN IF EXISTS "classification_source",
  DROP COLUMN IF EXISTS "version",
  DROP COLUMN IF EXISTS "created_at";

-- ── classification_state: add new columns (with temporary defaults for NOT NULL) ──

ALTER TABLE "classification_state"
  ADD COLUMN "input_snapshot" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "classified_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Remove defaults — application always supplies these values
ALTER TABLE "classification_state"
  ALTER COLUMN "input_snapshot" DROP DEFAULT,
  ALTER COLUMN "classified_at" DROP DEFAULT;

-- ── classification_state: remove stale index ─────────────────────────────────

DROP INDEX IF EXISTS "idx_classification_suggested_bucket";

-- ── classification_history: drop and recreate (id type: BIGSERIAL → UUID) ────

DROP TABLE IF EXISTS "classification_history";

CREATE TABLE "classification_history" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    "ticker"              VARCHAR(10) NOT NULL,
    "old_suggested_code"  VARCHAR(5),
    "new_suggested_code"  VARCHAR(5),
    "context_snapshot"    JSONB       NOT NULL,
    "classified_at"       TIMESTAMPTZ NOT NULL,
    CONSTRAINT "classification_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "classification_history"
  ADD CONSTRAINT "classification_history_ticker_fkey"
  FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_classification_history_ticker"
  ON "classification_history"("ticker");

CREATE INDEX "idx_classification_history_classified_at"
  ON "classification_history"("classified_at" DESC);

CREATE INDEX "idx_classification_history_ticker_classified"
  ON "classification_history"("ticker", "classified_at" DESC);
