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

**END RFC-004**
