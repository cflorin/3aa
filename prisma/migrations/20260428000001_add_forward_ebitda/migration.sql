-- EPIC-008/STORY-097/TASK-097-002: Add depreciation_ntm and forward_ev_ebitda columns
-- depreciation_ntm: NTM D&A estimate from FMP depreciationAvg (null when not provided by FMP)
-- forward_ev_ebitda: ev / (ebit_ntm + depreciation_ntm); null when either input is null or ebitda <= 0

ALTER TABLE "stocks"
  ADD COLUMN "depreciation_ntm"  DECIMAL(20,2),
  ADD COLUMN "forward_ev_ebitda" DECIMAL(8,4);
