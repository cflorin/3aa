# STORY-110 — Pipeline Integration and Fleet-Wide Migration Batch

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Wire the Earnings Path Engine (STORY-108) and updated Regime Selector (STORY-109) into the stock-add and nightly classification batch pipelines. Run the fleet-wide migration batch that reprocesses all active universe stocks with the V2 engine, sets `v2BucketAvailable = true` atomically for all stocks, and retires the V1 fallback code paths. After this story, every stock in the universe has a V2 bucket, V2 confidence score, and the regime selector runs exclusively on V2 bucket gates.

## Story
As the classification system,
I want the Earnings Path Engine integrated into the live pipeline and all existing stocks reprocessed,
so that the universe has consistent V2 bucket classifications and no stock is routed under mixed V1/V2 logic.

## Outcome
The stock-add pipeline runs the V2 bucket engine for new stocks. The nightly batch runs the V2 engine for all reclassifications. A fleet-wide migration batch reprocesses all active stocks; after it completes, all stocks have `bucketConfidence`, `expectedNormalizedEpsGrowth`, and `operatingLeverageState` populated and `v2BucketAvailable = true`. The `v2BucketAvailable` transition fallback is then removed.

## Scope In
- Wire `EarningsPathEngineService` into `ClassifierService` as the bucket computation (replacing `BucketScorer` call)
- Wire `ClassifierService` to pass `StockQuarterlyHistory` arrays to the engine (extend `ClassificationInput` loader if needed)
- Fleet-wide migration batch job: `scripts/migrate-v2-bucket-engine.ts`
  - Fetches all active stocks with their last 20 quarters of history and derived metrics
  - Runs `EarningsPathEngineService.classify()` for each stock
  - Writes output to `ClassificationState` (new fields) and updates `suggestedCode`
  - After full fleet reprocessing: sets all stocks as `v2BucketAvailable = true` (via updating ClassificationState)
  - Transaction: migration is per-stock (not one giant transaction), but the `v2BucketAvailable` flip is done atomically after all stocks processed
  - Logs: emit structured logs per-stock (ticker, old bucket, new bucket, confidence, reason codes)
  - Error handling: if a stock fails, log and continue — do not abort the whole batch
- Remove V1 fallback code paths from `RegimeSelectorService` after migration completes (or gate with a feature flag that is disabled post-migration)
- Delete (or archive) `bucket-scorer.ts` and the V1 bucket weight constants from `scoring-weights.ts` once STORY-111 regression tests confirm no regression
- Nightly classification batch already runs for all stocks; ensure it calls the V2 engine
- Stock-add pipeline (`POST /api/universe/stocks`) already triggers classification; ensure it calls V2 engine with quarterly history

## Scope Out
- Valuation recompute is NOT included in this story — buckets change but valuation recompute (new thresholds based on new buckets) is a separate admin trigger
- TSR hurdle recalibration is out of scope (EPIC-009 scope)
- No UI changes for migration status
- The `eps_fy2_avg` backfill for existing stocks is handled by the nightly sync pipeline (or a separate re-sync) — not in this migration batch

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §16.3 (backward compatibility), §21 (pipeline integration)
- ADR: ADR-017 (transition strategy)
- Framework: V2.1 §6.8 (fleet-wide cutover protocol)
- Upstream: STORY-108 (engine complete), STORY-109 (regime selector updated), STORY-100–107 (all in)

## Preconditions
- All STORY-100–109 implemented and tested
- `StockQuarterlyHistory` has 20 quarters for most universe stocks (EPIC-003 confirmed)
- Dev/staging environment migration has been run and verified before production

## Inputs
- All active stocks in universe (from `Stock` table with `isActive = true`)
- Last 20 quarters of `StockQuarterlyHistory` per stock
- `StockDerivedMetrics` per stock (for SBC and other derived fields)
- `Stock` fields: `epsFy2Avg` (from STORY-101), `epsNtm`, `gaapEpsCompletedFy`, all LLM scores, cyclicality fields

## Outputs
- All active `ClassificationState` rows updated with V2 engine outputs
- `suggestedCode` reflects V2 bucket + existing EQ/BS grades
- `classificationStatus` set to `needs_review` for all stocks (trigger user review of new bucket assignments)
- Structured migration log: per-stock old/new bucket, confidence, fallback level
- `v2BucketAvailable` = true for all stocks (enforced by non-null `expectedNormalizedEpsGrowth`)

## Acceptance Criteria
- [ ] `ClassifierService` calls `EarningsPathEngineService` (not `BucketScorer`) for bucket computation after migration
- [ ] Stock-add pipeline runs V2 engine for new stocks
- [ ] Fleet migration batch processes all active stocks without aborting on individual failures
- [ ] After migration: all active stocks have `bucketConfidence`, `expectedNormalizedEpsGrowth`, `operatingLeverageState`, `fwdEpsFallbackLevel` non-null in `ClassificationState`
- [ ] After migration: `classification_status` = `needs_review` for all stocks (prompts user review)
- [ ] V1 fallback removed: `v2BucketAvailable = false` path is inactivated
- [ ] `BucketScorer` file deleted (or archived with clear deprecation note and not compiled)
- [ ] Migration completes within acceptable time window (< 30 min for full universe)
- [ ] Structured log shows per-stock old → new bucket change summary
- [ ] All STORY-111 regression tests pass post-migration

## Test Strategy Expectations
- Unit tests:
  - `ClassifierService`: verify it calls `EarningsPathEngineService`, not `BucketScorer`
  - Migration batch: mock stock list, verify all stocks processed, error isolation
- Integration tests:
  - Stock-add pipeline: `POST /api/universe/stocks` for a test ticker → verify `ClassificationState` has V2 fields populated
  - Nightly batch: verify reclassification job uses V2 engine
  - Migration batch dry-run on 5 representative stocks (NVDA, MSFT, ABBV, DE, Ford-type)
- Contract tests:
  - Post-migration: query all active `ClassificationState` rows → verify no null `bucketConfidence`
- BDD:
  - `Given` the fleet migration batch runs; `When` it completes; `Then` all active stocks have non-null expectedNormalizedEpsGrowth and classificationStatus = needs_review
- E2E: STORY-111 runs post-migration golden-set verification

## Regression / Invariant Risks
- `final_code` MUST NOT be changed by the migration — only `suggested_code` is updated; existing user overrides must be preserved
- `classificationStatus` transitioning to `needs_review` for all stocks is intentional but impactful — confirm the user wants this behavior before running production migration
- The nightly batch must not run V1 BucketScorer after migration — verify no stale import paths

## Key Risks / Edge Cases
- Stocks with no quarterly history (< 4 quarters): engine produces null or very low confidence → `suggested_code` may change to null bucket; surface as `needs_review` not as error
- Migration batch failure partway through: must be re-runnable safely (idempotent per stock)
- Existing `suggestedCode` for user-overridden stocks: update `suggestedCode` (new engine suggestion) but leave `finalCode` untouched — user will see `needs_review` status and can re-evaluate

## Definition of Done
- [ ] V2 engine wired into ClassifierService and stock-add pipeline
- [ ] Fleet migration batch implemented and tested
- [ ] V1 BucketScorer removed from compilation
- [ ] Migration run on staging environment verified
- [ ] Implementation log updated
- [ ] STORY-111 tests commissioned (run after this story)

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` §Reclassification flow
- RFC: RFC-009 §16.3, §21
- ADR: ADR-017 (transition), ADR-016 (recompute trigger semantics)
- Framework: V2.1 §6.8
