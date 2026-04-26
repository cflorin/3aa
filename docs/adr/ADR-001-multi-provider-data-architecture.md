# ADR-001: Multi-Provider Data Architecture for V1

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-002, RFC-003, RFC-004

---

## Context

The 3AA Monitoring Product V1 requires:
- Stock universe data (market cap, sector, industry)
- EOD prices
- Historical/reported fundamentals
- **Forward analyst estimates** (critical for Buckets 1-4 valuation)

No single data provider guarantees 100% coverage across all required fields. Forward analyst estimates in particular have variable coverage across providers.

---

## Decision

V1 shall implement a **multi-provider data architecture** supporting:

1. **Pluggable providers:** Tiingo and FMP via `VendorAdapter` abstraction
2. **Field-level provider selection:** Configurable primary/fallback per field category
3. **Provenance tracking:** All fields track `{source_provider, synced_at, fallback_used}`
4. **Forward estimate strategy:** FMP primary (superior coverage), Tiingo fallback, trailing-based computation as final fallback
5. **Explicit failure handling:** Missing data → `manual_required` state or data quality alert, never silent fabrication

---

## Rationale

### Why Multi-Provider?

| Provider | Strengths | Weaknesses |
|----------|-----------|------------|
| **Tiingo** | Comprehensive historical fundamentals, 30+ year price history, reliable EOD data | Forward estimates: ~60% coverage (partial) |
| **FMP** | Strong forward analyst estimate coverage (~85%), good fundamentals | Shorter historical depth (10 years) |

**Conclusion:** Neither provider alone satisfies V1 requirements. FMP's forward estimate coverage is critical for Bucket 1-4 valuation (depends on forward P/E).

### Why FMP Primary for Forward Estimates?

- Bucket 1-4 stocks (mature/profitable) require forward P/E for valuation thresholds
- FMP provides ~85% coverage vs Tiingo's ~60%
- Missing forward estimates force `manual_required` state (not scalable for 1000-stock universe)
- Multi-provider reduces manual intervention by ~25%

---

## Consequences

### Positive

✅ **Data quality optimization:** Use best provider per field category
✅ **Resilience:** Single provider outage doesn't halt ingestion
✅ **Future-proof:** Can add Bloomberg, FactSet, etc. without engine rewrites
✅ **Reduced manual work:** Better coverage reduces `manual_required` states

### Negative

⚠️ **Complexity:** Provider orchestration, fallback logic, provenance tracking
⚠️ **Storage overhead:** ~5% for provenance JSONB fields
⚠️ **Dual API costs:** Two provider subscriptions (acceptable for V1 scale)
⚠️ **Configuration management:** Provider strategy YAML maintenance

---

## Alternatives Considered

### 1. Single Provider (Tiingo Only)
**Rejected:** Forward estimate gaps would force excessive manual input for Bucket 1-4 stocks (~40% of universe)

### 2. Single Provider (FMP Only)
**Rejected:** Shorter historical data depth, lack of redundancy for data validation

### 3. Manual Entry for Forward Estimates
**Rejected:** Not scalable for 1000-stock universe, defeats monitoring automation goal

### 4. Delay Multi-Provider to V2
**Rejected:** Retrofitting requires data migration, engine rewrites, and schema changes (5-10x more work than designing upfront)

---

## Implementation

**Abstraction:** `VendorAdapter` interface (RFC-004)

**Orchestration:** `ProviderOrchestrator` handles field-level fallback

**Default Strategy:**

| Field | Primary | Fallback |
|-------|---------|----------|
| Forward Estimates | FMP | Tiingo → Trailing × Growth |
| Historical Fundamentals | Tiingo | FMP |
| EOD Prices | Tiingo | FMP |

**Configuration:** `/config/provider-strategy.yaml`

---

## Notes

- V1 launch requires both Tiingo and FMP API keys
- Provider strategy is configurable, not hardcoded
- Provenance enables future data quality analysis and provider evaluation

## Amendment — 2026-04-25: Quarterly Financial History Provider (RFC-008)

**Quarterly Financial History:** Tiingo primary; no FMP fallback (V1).

Tiingo's `/tiingo/fundamentals/{ticker}/statements` endpoint returns `QuarterlyReport[]` — quarterly income statement, balance sheet, and cash flow DataCodes. This is confirmed by the existing `fetchFundamentals` implementation, which already processes 16 quarters from this endpoint. The `TiingoAdapter` gains a new method `fetchQuarterlyStatements(ticker)` that exposes the raw quarterly array without aggregation. No plan tier upgrade required.

FMP uses `period=annual` for its income statement endpoint at the current plan tier and does not provide quarterly financial history. FMP is not used as a fallback for this field category.

**Updated provider selection table:**

| Field Category | Primary | Fallback | Rationale |
|---|---|---|---|
| EOD Prices | Tiingo | FMP | Either reliable |
| Historical Fundamentals | Tiingo | FMP | Tiingo comprehensive |
| Forward Estimates | FMP | Tiingo | FMP superior coverage |
| Balance Sheet | Tiingo | FMP | Either complete |
| **Quarterly Financial History** | **Tiingo** | **None (V1)** | **Confirmed available; FMP annual-only at current tier** |

**Related:** RFC-008 (full architecture), ADR-016 (cadence)

---

**END ADR-001**
