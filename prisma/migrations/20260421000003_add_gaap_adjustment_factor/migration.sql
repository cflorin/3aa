-- EPIC-003: Data Ingestion & Universe Management
-- STORY-031: GAAP / Non-GAAP EPS Reconciliation Factor
-- TASK-031-001: Add gaap_adjustment_factor column to stocks table

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "gaap_adjustment_factor" DECIMAL(5, 4);
