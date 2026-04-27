-- EPIC-008/STORY-097/TASK-097-002: Add ebitda_ntm and forward_ev_ebitda columns
-- Correction: FMP /analyst-estimates provides ebitdaAvg directly (not depreciationAvg).
-- ebitda_ntm: NTM EBITDA consensus from FMP ebitdaAvg
-- forward_ev_ebitda: ev / ebitda_ntm; null when ebitda_ntm is null or <= 0

ALTER TABLE "stocks"
  ADD COLUMN "ebitda_ntm"        DECIMAL(20,2),
  ADD COLUMN "forward_ev_ebitda" DECIMAL(8,4);
