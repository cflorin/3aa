-- EPIC-003.1: Classification LLM Enrichment
-- STORY-039: Add description column and E1–E6 enrichment score columns to stocks table
-- description: company business description from FMP profile; used by combined-enrichment.md prompt (STORY-040)
-- E1–E6 scores: LLM qualitative scores, half-integer precision 1.0–5.0; populated by STORY-040 enrichment sync

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "description"                   TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "moat_strength_score"           DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "pricing_power_score"           DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "revenue_recurrence_score"      DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "margin_durability_score"       DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "capital_intensity_score"       DECIMAL(3, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "qualitative_cyclicality_score" DECIMAL(3, 2);
