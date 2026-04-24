-- STORY-031/BUG-DI-001: Store GAAP epsDiluted from FMP income statement for the completed FY.
-- This is the source input used to compute gaap_adjustment_factor and must be stored
-- independently so it can be audited and displayed alongside the factor.
ALTER TABLE "stocks" ADD COLUMN "gaap_eps_completed_fy" DECIMAL(10,4);
