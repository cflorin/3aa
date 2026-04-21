-- EPIC-003: Data Ingestion & Universe Management
-- STORY-028: Forward Estimates Enrichment
-- TASK-028-001: Add NTM raw input columns and forward_ev_sales to stocks table

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "eps_ntm"          DECIMAL(10, 4);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "ebit_ntm"         DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "revenue_ntm"      DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "forward_ev_sales" DECIMAL(8, 2);
