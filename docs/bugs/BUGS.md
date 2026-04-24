# Bug Registry Index

All bugs are tracked in per-domain registry files below.
Each bug has a unique ID that is referenced in the relevant source file as `// [BUG-ID]`.

## Registries

| Registry | Domain | Bugs |
|----------|--------|------|
| [CLASSIFICATION-ENGINE-BUG-REGISTRY.md](CLASSIFICATION-ENGINE-BUG-REGISTRY.md) | Classification scoring, EQ/BS scorers, deterministic flags | BUG-CE-001 · BUG-CE-002 · BUG-CE-003 · BUG-CE-004 · BUG-CE-005 |
| [UI-BUG-REGISTRY.md](UI-BUG-REGISTRY.md) | UI components, theme compliance | BUG-001 through BUG-009 |
| [DATA-INGESTION-BUG-REGISTRY.md](DATA-INGESTION-BUG-REGISTRY.md) | Forward estimates sync, metric computation, data quality | BUG-DI-001 |

## Open Bugs

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| BUG-CE-001 | CRITICAL | **FIXED 2026-04-24** | Growth fields inserted as decimals; mapper expects percentages → all Bucket 1 |
| BUG-CE-002 | HIGH | **FIXED 2026-04-24** | EQ scorer missing pricing_power / revenue_recurrence / margin_durability rules |
| BUG-CE-003 | HIGH | **FIXED 2026-04-24** | pre_operating_leverage_flag deterministic rule too restrictive; TSLA/UBER not flagged |
| BUG-CE-004 | HIGH | **OPEN** | FCF conversion ratio inflated by thin GAAP earnings → EQ grade too high (TSLA A→C, UNH/ADBE A→B) |
| BUG-CE-005 | MEDIUM | **OPEN** | TSLA bucket 3 not 5 — FLAG_PRIMARY(2) insufficient to overcome rev_fwd pointing to B4 |
| BUG-DI-001 | HIGH | **FIXED 2026-04-24** | Non-GAAP NTM EPS vs GAAP TTM EPS without reconciliation factor → inflates eps_growth_fwd (ADBE: 37% → 13%) |
