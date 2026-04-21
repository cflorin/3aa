-- Add non-GAAP earnings fields (FMP netIncomeAvg consensus for NTM and most recent completed FY)
-- Add non-GAAP EPS for most recent completed FY (direct store of nonGaapEpsMostRecentFy)
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "non_gaap_earnings_ntm" DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "non_gaap_earnings_fy"  DECIMAL(20, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS "non_gaap_eps_fy"       DECIMAL(10, 4);
