-- BUG-DI-002: Add revenue_previous_fy for FY-aligned revenue growth computation.
-- Stores actual revenue from FMP income statement for the most recently completed fiscal year.
-- Used as period-consistent denominator for revenue_growth_fwd instead of the stale revenue_ttm.

ALTER TABLE "stocks" ADD COLUMN "revenue_previous_fy" DECIMAL(20,2);
