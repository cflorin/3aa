# STORY-085: FMP Quarterly History Sync (Tiingo Replacement)

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Status:** in_progress
**Priority:** high

## Problem

Tiingo's quarterly history endpoint is rate-limited (1,000 req/hr) and unreliable for batch
operations. FMP is already used for fundamentals, estimates, and market cap. FMP quarterly data
has been validated against Tiingo for NVDA, MSFT, and CVX:

- Revenue, gross profit, net income, FCF, CFO: exact match
- Operating income: FMP's `ebit` field = Tiingo's `operatingIncome` DataCode (both = EBIT)
- CVX revenue: ~2% diff (excise-tax reporting convention, acceptable)

FMP provides a `fiscalYear` field directly in the income statement response. Fiscal year labels
may differ for off-calendar companies (e.g., NVDA Jan 2026 = FY2026 in FMP, FY2025 in Tiingo).

## Acceptance Criteria

1. FMPAdapter exposes `fetchQuarterlyStatements(ticker)` returning `NormalizedQuarterlyReport[]`
2. Both adapters implement a `QuarterlyAdapter` interface (provider-agnostic duck type)
3. `syncQuarterlyHistory` accepts `QuarterlyAdapter` (not TiingoAdapter-specific)
4. `computeDerivedMetrics` prefers FMP rows; falls back to Tiingo rows for un-migrated tickers
5. Quarterly history cron and stock-add pipeline use FMPAdapter
6. All existing tests updated; new tests for FMPAdapter.fetchQuarterlyStatements

## Field Mapping (FMP → DB column)

| FMP income statement | FMP cash flow | DB column |
|---|---|---|
| `ebit` | — | `operatingIncome` |
| `revenue` | — | `revenue` |
| `grossProfit` | — | `grossProfit` |
| `netIncome` | — | `netIncome` |
| `depreciationAndAmortization` | — | `depreciationAndAmortization` |
| `weightedAverageShsOutDil` | — | `dilutedSharesOutstanding` |
| — | `capitalExpenditure` | `capex` |
| — | `operatingCashFlow` | `cashFromOperations` |
| — | `freeCashFlow` | `freeCashFlow` |
| — | `stockBasedCompensation` | `shareBasedCompensation` |

## Tasks

- [x] TASK-085-001: Add `NormalizedQuarterlyReport` to types.ts; add `QuarterlyAdapter` to sync service
- [x] TASK-085-002: Update TiingoAdapter.fetchQuarterlyStatements → returns NormalizedQuarterlyReport[]
- [x] TASK-085-003: Add FMPAdapter.fetchQuarterlyStatements (parallel income + cash flow calls)
- [x] TASK-085-004: Refactor syncQuarterlyHistory to accept QuarterlyAdapter
- [x] TASK-085-005: Update computeDerivedMetrics — FMP-first, Tiingo fallback
- [x] TASK-085-006: Update routes (cron + stock-add) to use FMPAdapter
- [x] TASK-085-007: Update existing tests; add story-085 FMP adapter tests
