-- EPIC-003/STORY-027/TASK-027-001: Add TTM absolute value columns to stocks table
-- Stores TTM financial values in absolute USD for trailing multiple computation.
-- earnings_ttm, revenue_ttm, ebit_ttm: from fundamentals sync (Tiingo primary)
-- shares_outstanding: from FMP profile endpoint
-- eps_ttm: TTM EPS per diluted share (from Tiingo eps DataCode TTM sum)

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "earnings_ttm" DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "revenue_ttm" DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "ebit_ttm" DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "shares_outstanding" DECIMAL(20, 0);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "eps_ttm" DECIMAL(10, 4);
