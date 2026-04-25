-- DropForeignKey
ALTER TABLE "stock_derived_metrics" DROP CONSTRAINT "stock_derived_metrics_ticker_fkey";

-- DropForeignKey
ALTER TABLE "stock_quarterly_history" DROP CONSTRAINT "stock_quarterly_history_ticker_fkey";

-- DropForeignKey
ALTER TABLE "user_deactivated_stocks" DROP CONSTRAINT "user_deactivated_stocks_ticker_fkey";

-- DropForeignKey
ALTER TABLE "user_deactivated_stocks" DROP CONSTRAINT "user_deactivated_stocks_user_id_fkey";

-- AlterTable
ALTER TABLE "classification_history" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_valuation_overrides" ADD COLUMN     "forward_operating_earnings_ex_excess_cash" DECIMAL(15,4),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "primary_metric_override" VARCHAR(50);

-- AddForeignKey
ALTER TABLE "stock_derived_metrics" ADD CONSTRAINT "stock_derived_metrics_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quarterly_history" ADD CONSTRAINT "stock_quarterly_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_deactivated_stocks" ADD CONSTRAINT "user_deactivated_stocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_deactivated_stocks" ADD CONSTRAINT "user_deactivated_stocks_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uq_sqh_ticker_period_provider" RENAME TO "stock_quarterly_history_ticker_fiscal_year_fiscal_quarter_s_key";
