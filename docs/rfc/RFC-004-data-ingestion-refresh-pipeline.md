# RFC-004: Data Ingestion & Refresh Pipeline

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** RFC-002 (Data Model)
**Creates New Decisions:** YES
**Refines Existing:** NO

---

## Context / Problem

V1 requires continuous ingestion of stock data: universe eligibility, prices, fundamentals, forward estimates. Without fresh data, classification and valuation engines cannot operate.

**V1 Multi-Provider Strategy:** Support Tiingo and FMP via abstraction layer (ADR-001).

---

## Goals

1. Design provider-agnostic data interface
2. Define refresh scheduling (daily EOD batch)
3. Establish change detection for recompute triggers
4. Specify data validation and quality checks
5. Define universe eligibility filtering ($5bn+ market cap, US)
6. Handle forward estimate gaps with fallback logic
7. Track data provenance per field

---

## Non-Goals

1. Specific provider API implementation (implementation detail)
2. Real-time intraday data (V1 is EOD-based)
3. Alternative vendor integrations beyond Tiingo/FMP (V2+)

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────┐
│         Data Ingestion Pipeline                  │
│                                                  │
│  ┌─────────────────────────────────┐             │
│  │  Provider Orchestrator          │             │
│  │  - Multi-provider coordination  │             │
│  │  - Fallback logic               │             │
│  │  - Provenance tracking          │             │
│  └────────┬────────────────────────┘             │
│           │                                      │
│           ├──→ TiingoAdapter                    │
│           │                                      │
│           └──→ FMPAdapter                        │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │  Universe Sync                   │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Price Sync (EOD)                │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Fundamentals Sync               │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Forward Estimates Sync          │            │
│  │  (FMP primary, Tiingo fallback)  │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Deterministic Classification    │            │
│  │  Sync (EPIC-003 STORY-033)       │            │
│  │  insurer_flag, material_dilution │            │
│  │  pre_operating_leverage          │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Classification Enrichment Sync  │            │
│  │  (EPIC-003.1 STORY-038)          │            │
│  │  LLM flags + E1-E6 scores        │            │
│  │  Weekly cadence; see RFC-007     │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Quarterly History Sync          │            │
│  │  (RFC-008 / ADR-016)             │            │
│  │  Tiingo quarterly statements;    │            │
│  │  earnings-triggered + Sun scan   │            │
│  └──────────────────────────────────┘            │
│  ┌──────────────────────────────────┐            │
│  │  Derived Metrics Computation     │            │
│  │  (RFC-008 / ADR-015)             │            │
│  │  TTM rollups, trend slopes,      │            │
│  │  stability scores, flags         │            │
│  │  → stock_derived_metrics         │            │
│  └──────────────────────────────────┘            │
│           ↓                                      │
│  ┌──────────────────────────────────┐            │
│  │  Data Validator                  │            │
│  └──────────────────────────────────┘            │
│           ↓                                      │
│  ┌──────────────────────────────────┐            │
│  │  Change Detector                 │            │
│  └──────────────────────────────────┘            │
│           ↓                                      │
│  ┌──────────────────────────────────┐            │
│  │  Database Writer (with provenance)│           │
│  └──────────────────────────────────┘            │
│           ↓                                      │
│  ┌──────────────────────────────────┐            │
│  │  Recompute Trigger (batch)       │            │
│  └──────────────────────────────────┘            │
└──────────────────────────────────────────────────┘
```

---

## Provider Abstraction Layer

### VendorAdapter Interface

```typescript
interface VendorAdapter {
  readonly providerName: 'tiingo' | 'fmp';
  readonly capabilities: {
    forwardEstimateCoverage: 'full' | 'partial' | 'none';
    rateLimit: { requestsPerHour: number };
  };

  fetchUniverse(minMarketCapMillions: number): Promise<UniverseStock[]>;
  fetchEODPrice(ticker: string, date?: Date): Promise<PriceData | null>;
  fetchFundamentals(ticker: string): Promise<FundamentalData | null>;
  fetchForwardEstimates(ticker: string): Promise<ForwardEstimates | null>;
  fetchMetadata(ticker: string): Promise<StockMetadata | null>;
}
```

### ProviderOrchestrator

```typescript
interface ProviderOrchestrator {
  fetchFieldWithFallback<T>(
    ticker: string,
    fieldName: string,
    providers: VendorAdapter[]
  ): Promise<FieldResult<T>>;
}

interface FieldResult<T> {
  value: T | null;
  source_provider: string;
  synced_at: Date;
  fallback_used: boolean;
}
```

### Provider Selection Strategy

**Default V1 Configuration:**

| Field Category | Primary | Fallback | Rationale |
|----------------|---------|----------|-----------|
| EOD Prices | Tiingo | FMP | Either reliable |
| Historical Fundamentals | Tiingo | FMP | Tiingo comprehensive |
| **Forward Estimates** | **FMP** | **Tiingo** | **FMP superior coverage** |
| Balance Sheet | Tiingo | FMP | Either complete |

---

## Universe Sync

```typescript
async function syncUniverse(orchestrator: ProviderOrchestrator): Promise<void> {
  const MIN_MARKET_CAP = 5000; // $5bn

  const tiingoUniverse = await tiingoAdapter.fetchUniverse(MIN_MARKET_CAP);
  const fmpUniverse = await fmpAdapter.fetchUniverse(MIN_MARKET_CAP);

  // Merge: union of both providers
  const merged = [...tiingoUniverse, ...fmpUniverse].filter(s => s.country === 'US');
  const unique = Array.from(new Map(merged.map(s => [s.ticker, s])).values());

  for (const stock of unique) {
    await db.query(`
      INSERT INTO stocks (ticker, company_name, market_cap, country, sector, industry, in_universe)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      ON CONFLICT (ticker) DO UPDATE SET
        market_cap = EXCLUDED.market_cap,
        in_universe = TRUE,
        updated_at = NOW()
    `, [stock.ticker, stock.company_name, stock.market_cap_millions, stock.country, stock.sector, stock.industry]);
  }

  // Mark dropped stocks
  await db.query(`
    UPDATE stocks SET in_universe = FALSE
    WHERE ticker NOT IN (${unique.map(s => `'${s.ticker}'`).join(',')})
      AND in_universe = TRUE
  `);
}
```

**Frequency:** Weekly

---

## Price Sync

```typescript
async function syncPrices(orchestrator: ProviderOrchestrator): Promise<void> {
  const stocks = await db.query('SELECT ticker FROM stocks WHERE in_universe = TRUE');

  for (const stock of stocks.rows) {
    const price = await orchestrator.fetchFieldWithFallback(
      stock.ticker,
      'eod_price',
      [tiingoAdapter, fmpAdapter]
    );

    if (price.value) {
      await db.query(`
        UPDATE stocks
        SET current_price = $1,
            price_last_updated_at = NOW(),
            data_provider_provenance = jsonb_set(
              data_provider_provenance,
              '{current_price}',
              $2::jsonb
            )
        WHERE ticker = $3
      `, [
        price.value,
        JSON.stringify({ provider: price.source_provider, synced_at: price.synced_at }),
        stock.ticker
      ]);
    } else {
      await logDataQualityIssue(stock.ticker, 'missing_eod_price');
    }
  }
}
```

**Frequency:** Daily (after market close)

---

## Forward Estimates Sync

**Critical:** FMP primary, Tiingo fallback, trailing-based computation as final fallback

```typescript
async function syncForwardEstimates(orchestrator: ProviderOrchestrator): Promise<void> {
  const stocks = await db.query('SELECT ticker FROM stocks WHERE in_universe = TRUE');

  for (const stock of stocks.rows) {
    // FMP primary, Tiingo fallback
    const forwardPE = await orchestrator.fetchFieldWithFallback(
      stock.ticker,
      'forward_pe',
      [fmpAdapter, tiingoAdapter]
    );

    const forwardEVEBIT = await orchestrator.fetchFieldWithFallback(
      stock.ticker,
      'forward_ev_ebit',
      [fmpAdapter, tiingoAdapter]
    );

    // Fallback to computed if both providers fail
    let forward_pe_value = forwardPE.value;
    let forward_pe_source = forwardPE.source_provider;

    if (!forward_pe_value) {
      const trailing_pe = stock.trailing_pe;
      const eps_growth_fwd = stock.eps_growth_fwd;
      if (trailing_pe && eps_growth_fwd) {
        forward_pe_value = trailing_pe / (1 + eps_growth_fwd / 100);
        forward_pe_source = 'computed_trailing';
      } else {
        forward_pe_source = 'missing';
      }
    }

    await db.query(`
      UPDATE stocks
      SET forward_pe = $1,
          forward_pe_source = $2,
          forward_ev_ebit = $3,
          forward_ev_ebit_source = $4,
          data_provider_provenance = jsonb_set(
            jsonb_set(
              data_provider_provenance,
              '{forward_pe}',
              $5::jsonb
            ),
            '{forward_ev_ebit}',
            $6::jsonb
          )
      WHERE ticker = $7
    `, [
      forward_pe_value,
      forward_pe_source,
      forwardEVEBIT.value,
      forwardEVEBIT.value ? forwardEVEBIT.source_provider : 'missing',
      JSON.stringify({ provider: forward_pe_source, synced_at: new Date(), fallback_used: forwardPE.fallback_used }),
      JSON.stringify({ provider: forwardEVEBIT.source_provider, synced_at: forwardEVEBIT.synced_at, fallback_used: forwardEVEBIT.fallback_used }),
      stock.ticker
    ]);
  }
}
```

**Frequency:** Daily

---

## Change Detection

```typescript
const MATERIAL_CHANGE_THRESHOLDS = [
  { field: 'revenue_growth_fwd', threshold: 5.0, type: 'absolute', triggers: ['classification'] },
  { field: 'current_price', threshold: 0.01, type: 'percentage', triggers: ['valuation'] },
  { field: 'forward_pe', threshold: 0.05, type: 'percentage', triggers: ['valuation'] },
];

async function detectChanges(ticker: string): Promise<{
  classification_recompute: boolean;
  valuation_recompute: boolean;
}> {
  // Compare current vs prior snapshot
  // Emit recompute if material change detected
}
```

---

## Data Freshness

| Data Category | Stale After | Missing After |
|---------------|-------------|---------------|
| EOD Prices | 2 days | 5 days |
| Fundamentals | 90 days | 180 days |
| Forward Estimates | 90 days | 180 days |

---

## Refresh Schedule (V1 Batch)

**See ADR-002 for full orchestration details.**

| Task | Frequency | Time | Stage |
|------|-----------|------|-------|
| Universe Sync | Weekly | Sunday 5pm ET | [SHARED] |
| Price Sync | Daily | 5pm ET (Mon-Fri) | [SHARED] |
| Fundamentals Sync | Daily | 6pm ET | [SHARED] |
| Forward Estimates Sync | Daily | 7pm ET | [SHARED] |
| Classification Recompute | Daily | 8pm ET | [SHARED] |
| Valuation Recompute | Daily | 8:15pm ET | [SHARED] |
| Alert Generation | Daily | 8:30-9pm ET | [PER-USER] |

**Total Window:** 5:00pm - 9:00pm ET (4 hours)

---

## Provider Implementation Notes

### TiingoAdapter
- Auth: `TIINGO_API_KEY` env var
- Rate limit: 1000 req/hour
- Forward estimates: ~60% coverage **(assumed, requires validation against V1 universe)**

### FMPAdapter
- Auth: `FMP_API_KEY` env var
- Rate limit: 250 req/min (free), 750 req/min (paid)
- Forward estimates: ~85% coverage (strong) **(assumed, requires validation against V1 universe)**

**Note:** Provider coverage percentages are provisional planning assumptions. Actual coverage must be validated empirically during V1 implementation.

---

## Required ADRs

1. **ADR-001: Multi-Provider Data Architecture** (PRIMARY)
2. **ADR-002: V1 Orchestration - Nightly Batch**

---

## Amendment — 2026-04-21: Classification Enrichment Sync Jobs

### New Job: Deterministic Classification Sync (EPIC-003 STORY-033)

Runs after Forward Estimates Sync. Computes and persists deterministic classification inputs:

| Field | Source | Rule |
|-------|--------|------|
| `share_count_growth_3y` | FMP historical share data | 3-year CAGR from historical endpoint |
| `material_dilution_flag` | Derived from share_count_growth_3y | > 0.05 threshold |
| `insurer_flag` | FMP profile sector/industry | SIC 6311–6399 or industry contains "Insurance" |
| `pre_operating_leverage_flag` | DB revenue_ttm | `revenue_ttm < 50_000_000 OR (revenue_ttm < 200_000_000 AND earningsTtm < 0)` |

Schedule: Daily (same cadence as other sync jobs). No LLM calls.

### New Job: Classification Enrichment Sync (EPIC-003.1 STORY-038)

Runs weekly (Sunday 02:00 UTC). Uses abstract `LLMProvider` interface (RFC-007). Produces:

| Field | Method |
|-------|--------|
| `holding_company_flag` | SIC 6710–6726 heuristic; else Claude `holding-company-flag.md` prompt |
| `cyclicality_flag` | Sector rules (Materials/Energy → TRUE, Staples/Healthcare → FALSE); Claude `cyclicality-flag.md` for ambiguous sectors |
| `binary_flag` | Pre-revenue biotech heuristic; else Claude `binary-flag.md` prompt |
| E1–E6 scores | Single Claude `classification-scores.md` batch call returning all 6 scores |

Incremental mode (default): only enriches stocks added/modified in last 30 days.
Full mode: admin-triggered or forced on LLM_MODEL env var change.

All decisions recorded in `data_provider_provenance` with model, prompt_version, confidence, method.

### Related
RFC-007 (LLM Provider Architecture), ADR-012 (LLM Enrichment Decision)

---

## Amendment — 2026-04-25: Quarterly History Sync and Derived Metrics Computation (RFC-008)

Two new pipeline stages added. Full architecture in RFC-008; storage model in ADR-015; cadence in ADR-016.

### New Job: Quarterly History Sync

**Source:** Tiingo `/tiingo/fundamentals/{ticker}/statements` — same endpoint used by Fundamentals Sync but via a new `fetchQuarterlyStatements(ticker)` adapter method that returns raw `QuarterlyReport[]` without aggregation.

**VendorAdapter addition:**
```typescript
// TiingoAdapter gains:
async fetchQuarterlyStatements(ticker: string): Promise<QuarterlyReport[] | null>;
// Returns newest-first quarterly rows (quarter ≠ 0); same endpoint as fetchFundamentals
```

**Important:** `fetchQuarterlyStatements` is NOT added to the `VendorAdapter` interface. It is a `TiingoAdapter`-specific method. Quarterly history is Tiingo-only in V1; no FMP fallback. The `ProviderOrchestrator` abstraction is not used for this field category — the sync service calls `TiingoAdapter` directly.

**Provider selection:** Tiingo primary only (V1). FMP does not provide quarterly history at current plan tier.

**Cadence:** Earnings-triggered (see ADR-016). For each in-universe stock, compares the `reported_date` of the most recent Tiingo quarter against the most recent stored row in `stock_quarterly_history`. If newer, upserts all returned quarters. Weekly full scan (Sunday) serves as backstop.

**Schedule position:** 6:45 PM ET, after Market Cap Sync, before Forward Estimates Sync. (ADR-002 amended.)

**Recompute flag:** When any quarter is upserted, sets `quarterly_data_updated = true` for that ticker to trigger classification recompute at 8:00 PM ET.

### New Job: Derived Metrics Computation

Runs immediately after Quarterly History Sync (same pipeline stage, sequential). For all tickers where `quarterly_data_updated = true`:

1. Load all stored rows from `stock_quarterly_history` for the ticker (newest first)
2. Compute TTM rollups from latest 4 quarters
3. Compute fiscal-year rollups for each completed FY in the retention window
4. Compute margin trajectory slopes (4q and 8q windows)
5. Compute stability scores (normalized dispersion over 8 quarters)
6. Compute operating leverage ratios and boolean emergence flags
7. Compute earnings quality trend score and deterioration flags
8. Compute dilution/SBC metrics
9. Compute capital intensity metrics
10. Upsert `stock_derived_metrics` row with provenance

**Missing-data handling:** If fewer than 4 quarters are available, TTM and trend fields are NULL. If fewer than 8, 8q trend fields are NULL. NULL fields propagate to ClassificationInput as absent enrichment — scorers do not error.

### Provider Selection Table (updated)

| Field Category | Primary | Fallback | Rationale |
|---|---|---|---|
| EOD Prices | Tiingo | FMP | Either reliable |
| Historical Fundamentals | Tiingo | FMP | Tiingo comprehensive |
| **Forward Estimates** | **FMP** | **Tiingo** | **FMP superior coverage** |
| Balance Sheet | Tiingo | FMP | Either complete |
| **Quarterly Financial History** | **Tiingo** | **None (V1)** | **Tiingo already provides quarterly statements** |

### Related
RFC-008 (full architecture), ADR-015 (storage model), ADR-016 (refresh cadence), RFC-002 Amendment 2026-04-25

---

**END RFC-004**
