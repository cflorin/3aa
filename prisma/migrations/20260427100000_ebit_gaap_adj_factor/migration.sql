-- BUG-DI-002: Add ebit_gaap_adj_factor for GAAP-equivalent EV/EBIT computation.
-- Factor = GAAP operatingIncome (completed FY) / NonGAAP ebitAvg (completed FY).
-- Applied to ebit_ntm to produce GAAP-equivalent forward EBIT before EV/EBIT division.
ALTER TABLE "stocks" ADD COLUMN "ebit_gaap_adj_factor" DECIMAL(5,4);
