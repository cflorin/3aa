-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "bank_flag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cycle_position" VARCHAR(30),
ADD COLUMN     "cyclical_confidence" VARCHAR(20),
ADD COLUMN     "structural_cyclicality_score" INTEGER;

-- AlterTable
ALTER TABLE "valuation_state" ADD COLUMN     "cycle_position_snapshot" VARCHAR(30),
ADD COLUMN     "cyclical_confidence" VARCHAR(20),
ADD COLUMN     "cyclical_overlay_applied" BOOLEAN,
ADD COLUMN     "cyclical_overlay_value" DECIMAL(5,2),
ADD COLUMN     "growth_tier" VARCHAR(20),
ADD COLUMN     "structural_cyclicality_score_snapshot" INTEGER,
ADD COLUMN     "threshold_family" VARCHAR(60),
ADD COLUMN     "valuation_regime" VARCHAR(40),
ALTER COLUMN "valuation_state_status" SET DEFAULT 'computed';

-- CreateTable
CREATE TABLE "valuation_regime_thresholds" (
    "regime" VARCHAR(40) NOT NULL,
    "primary_metric" VARCHAR(50) NOT NULL,
    "max_threshold" DECIMAL(10,2),
    "comfortable_threshold" DECIMAL(10,2),
    "very_good_threshold" DECIMAL(10,2),
    "steal_threshold" DECIMAL(10,2),
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "valuation_regime_thresholds_pkey" PRIMARY KEY ("regime")
);

-- CreateIndex
CREATE INDEX "idx_valuation_regime" ON "valuation_state"("valuation_regime");
