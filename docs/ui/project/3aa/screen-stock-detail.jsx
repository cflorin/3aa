// Screen — Full Stock Detail View
// Shows all classification engine output, fundamentals, enrichment, valuation, history

function ScoreBar({ label, value, max = 100, highlight, color, T }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
      <span style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: highlight ? T.accent : T.textDim,
        width: 18, textAlign: "right", fontWeight: highlight ? 700 : 400,
      }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: T.borderFaint, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: highlight ? (color || T.accent) : T.textDim + "55",
          borderRadius: 2,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: highlight ? T.text : T.textDim,
        width: 26, textAlign: "right", fontWeight: highlight ? 700 : 400,
      }}>{value}</span>
    </div>
  );
}

function StarScore({ value, max = 5, T }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const pct = (value / max) * 100;
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#eab308" : pct >= 40 ? "#f97316" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 1 }}>
        {Array.from({ length: max }, (_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 1,
            background: i < full ? color : (i === full && half ? color + "70" : T.borderFaint),
          }} />
        ))}
      </div>
      <span style={{
        fontSize: 10, fontFamily: "'DM Mono', monospace",
        color: color, fontWeight: 600,
      }}>{value.toFixed(1)}</span>
    </div>
  );
}

function MetricCell({ label, value, unit = "", good, bad, T, mono = true, note }) {
  let color = T.text;
  if (value != null && good != null && bad != null) {
    if (good > bad) color = value >= good ? "#16a34a" : value >= bad ? "#eab308" : "#ef4444";
    else color = value <= good ? "#16a34a" : value <= bad ? "#eab308" : "#ef4444";
  }
  return (
    <div style={{
      padding: "8px 12px", borderBottom: `1px solid ${T.borderFaint}`,
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 11, color: T.textDim }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{note}</div>}
      </div>
      <span style={{
        fontSize: 12, color: value != null ? color : T.textDim,
        fontFamily: mono ? "'DM Mono', monospace" : "inherit",
        fontWeight: 600,
      }}>
        {value != null ? `${value}${unit}` : "—"}
      </span>
    </div>
  );
}

function SectionHeader({ label, T }) {
  return (
    <div style={{
      padding: "6px 12px",
      fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase",
      color: T.textDim, background: T.sidebarBg,
      borderBottom: `1px solid ${T.border}`,
      borderTop: `1px solid ${T.border}`,
    }}>{label}</div>
  );
}

function StockDetailScreen({ stock, T, onBack, onOverride, onViewAlert, relatedAlert }) {
  const history = CLASSIFICATION_HISTORY[stock.ticker] || [];
  const [activeTab, setActiveTab] = React.useState("classification");

  const tabs = [
    { id: "classification", label: "Classification" },
    { id: "fundamentals", label: "Fundamentals" },
    { id: "valuation", label: "Valuation" },
    { id: "history", label: "History" },
  ];

  // Winning bucket
  const bucketEntries = Object.entries(stock.bucketScores || {});
  const topBucket = bucketEntries.reduce((a, b) => (b[1] > a[1] ? b : a), ["0", 0]);

  // EQ/BS winners
  const topEQ = Object.entries(stock.eqScores || {}).reduce((a, b) => (b[1] > a[1] ? b : a), ["?", 0]);
  const topBS = Object.entries(stock.bsScores || {}).reduce((a, b) => (b[1] > a[1] ? b : a), ["?", 0]);

  function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const flagsActive = ["holdingCompanyFlag","insurerFlag","binaryFlag","cyclicalityFlag",
    "preOperatingLeverageFlag","optionalityFlag","materialDilutionFlag"]
    .filter(f => stock[f])
    .map(f => f.replace(/Flag$/, "").replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ""));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
        background: T.headerBg, display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onBack} style={{
          border: "none", background: "none", cursor: "pointer",
          color: T.accent, fontSize: 12, padding: 0,
        }}>← Back</button>
        <div style={{ width: 1, height: 14, background: T.border }} />

        {/* Ticker + name */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color: T.text }}>{stock.ticker}</span>
          <span style={{ fontSize: 12, color: T.textMuted }}>{stock.name}</span>
          <span style={{ fontSize: 11, color: T.textDim }}>{stock.sector}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Key stats strip */}
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {stock.price && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'DM Mono', monospace" }}>${stock.price.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{stock.priceDate}</div>
            </div>
          )}
          <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>Active Code</div>
              <span
                onClick={onOverride}
                title="Click to override classification"
                style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 800,
                  color: stock.finalCode ? "#f97316" : T.accent,
                  cursor: "pointer", borderBottom: `1px dashed ${stock.finalCode ? "#f9731660" : T.accent + "60"}`,
                  paddingBottom: 1,
                }}>{stock.finalCode || stock.suggestedCode || "—"}</span>
              {stock.finalCode && <span style={{ fontSize: 9, color: "#f97316", display: "block", marginTop: 1 }}>override ↗</span>}
            </div>
          <ZoneBadge zone={stock.zone} theme={T.id} />
          <ConfidenceBadge confidence={stock.confidence} />
          {relatedAlert && <PriorityBadge priority={relatedAlert.priority} />}
        </div>
      </div>

      {/* Watch Signal Banner */}
      {stock.watchSignal && (
        <div style={{
          padding: "8px 16px", background: "#a16207" + "18",
          borderBottom: `1px solid #eab30830`,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <span style={{ color: "#eab308", fontSize: 12, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 11, color: "#d4a40a", lineHeight: 1.5 }}>{stock.watchSignal}</span>
        </div>
      )}

      {/* Flags strip */}
      {flagsActive.length > 0 && (
        <div style={{
          padding: "6px 16px", borderBottom: `1px solid ${T.borderFaint}`,
          display: "flex", gap: 6, alignItems: "center",
          background: T.sidebarBg,
        }}>
          <span style={{ fontSize: 10, color: T.textDim, marginRight: 4 }}>Flags:</span>
          {flagsActive.map(f => (
            <span key={f} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 3,
              background: "#f97316" + "18", color: "#f97316", border: "1px solid #f9731630",
              fontWeight: 500,
            }}>{f.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${T.border}`,
        background: T.headerBg, paddingLeft: 16,
      }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "8px 16px", fontSize: 12, border: "none", background: "none",
            cursor: "pointer", color: activeTab === tab.id ? T.accent : T.textMuted,
            borderBottom: `2px solid ${activeTab === tab.id ? T.accent : "transparent"}`,
            fontWeight: activeTab === tab.id ? 600 : 400, marginBottom: -1,
            fontFamily: "inherit",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── CLASSIFICATION TAB ──────────────────────────────────── */}
        {activeTab === "classification" && (
          <div style={{ display: "flex", gap: 0 }}>

            {/* Left: Scores */}
            <div style={{ flex: "0 0 320px", borderRight: `1px solid ${T.border}` }}>

              {/* Active code block */}
              <div style={{ padding: "16px 14px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>Active Code</div>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>System Suggested</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 800, color: T.accent }}>{stock.suggestedCode || "—"}</div>
                    <div style={{ marginTop: 4 }}><ConfidenceBadge confidence={stock.confidence} /></div>
                  </div>
                  {stock.finalCode && (
                    <div>
                      <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Your Override</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 800, color: "#f97316" }}>{stock.finalCode}</div>
                      <div style={{ fontSize: 9, color: T.textDim, marginTop: 4 }}>display only — alerts use system</div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: T.textDim }}>
                  Classified {fmtTime(stock.classifiedAt)} · Provider: Tiingo / FMP + LLM enrichment
                </div>
              </div>

              {/* Bucket scores */}
              <div style={{ padding: "14px 14px 10px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>Bucket Scores</div>
                {Object.entries(stock.bucketScores || {}).map(([bucket, score]) => (
                  <ScoreBar
                    key={bucket}
                    label={bucket}
                    value={score}
                    highlight={bucket === topBucket[0]}
                    color={T.accent}
                    T={T}
                  />
                ))}
              </div>

              {/* EQ scores */}
              <div style={{ padding: "12px 14px 10px", borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Earnings Quality Scores</div>
                {Object.entries(stock.eqScores || {}).map(([grade, score]) => (
                  <ScoreBar key={grade} label={grade} value={score} highlight={grade === topEQ[0]} T={T} />
                ))}
              </div>

              {/* BS scores */}
              <div style={{ padding: "12px 14px 10px", borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Balance Sheet Quality Scores</div>
                {Object.entries(stock.bsScores || {}).map(([grade, score]) => (
                  <ScoreBar key={grade} label={grade} value={score} highlight={grade === topBS[0]} T={T} />
                ))}
              </div>
            </div>

            {/* Right: Enrichment + Reason codes + Override */}
            <div style={{ flex: 1 }}>
              {/* Confidence Breakdown (ADR-014) */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>Confidence Derivation (ADR-014)</div>
                {stock.confidenceBreakdown ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {stock.confidenceBreakdown.steps.map((step, i) => {
                      const isLast = i === stock.confidenceBreakdown.steps.length - 1;
                      const degrades = step.label.includes("penalty") || step.label.includes("Tie-break");
                      const bad = (step.tieBreaks > 0 || step.missing >= 3);
                      return (
                        <div key={i} style={{
                          display: "flex", gap: 10, padding: "7px 0",
                          borderBottom: `1px solid ${T.borderFaint}`,
                          alignItems: "flex-start",
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            background: bad ? "#ef4444" + "22" : T.accent + "22",
                            border: `1px solid ${bad ? "#ef444444" : T.accent + "44"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, color: bad ? "#ef4444" : T.accent,
                          }}>{step.step}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{step.label}</div>
                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{step.note}</div>
                          </div>
                          {step.band && (
                            <ConfidenceBadge confidence={step.band} />
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8 }}>
                      <span style={{ fontSize: 10, color: T.textDim }}>Final confidence:</span>
                      <ConfidenceBadge confidence={stock.confidenceBreakdown.final} />
                      {stock.confidenceBreakdown.note && (
                        <span style={{ fontSize: 10, color: "#eab308", flex: 1 }}>{stock.confidenceBreakdown.note}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.textDim }}>Confidence breakdown not available for this stock.</div>
                )}
              </div>

              {/* Tie-break Analysis (STORY-043) */}
              {(stock.tieBreaksFired || []).length > 0 && (
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>Tie-Break Rules Fired</div>
                  {stock.tieBreaksFired.map((tb, i) => (
                    <div key={i} style={{
                      padding: "10px 12px", marginBottom: 8,
                      background: T.sidebarBg, border: `1px solid ${T.borderFaint}`,
                      borderRadius: 4,
                    }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                          background: T.accent + "20", color: T.accent,
                          border: `1px solid ${T.accent}40`, fontFamily: "'DM Mono', monospace",
                        }}>{tb.rule}</span>
                        <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{tb.description}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: T.textDim }}>
                          Winner: <span style={{ fontFamily: "'DM Mono', monospace", color: T.accent, fontWeight: 700 }}>Bucket {tb.winner}</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Condition: <span style={{ fontFamily: "'DM Mono', monospace", color: T.textMuted }}>{tb.condition}</span></div>
                      {tb.values && (
                        <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                          {Object.entries(tb.values).map(([k, v]) => (
                            <span key={k} style={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
                              <span style={{ color: T.textDim }}>{k.replace(/_/g, " ")}: </span>
                              <span style={{ color: T.text, fontWeight: 600 }}>{typeof v === "boolean" ? String(v) : v}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>{tb.outcome}</div>
                      {tb.marginAtTrigger != null && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#eab308" }}>
                          ⚠ Score margin at trigger: {tb.marginAtTrigger}pt (≤ 1pt threshold)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* input_snapshot (STORY-044) */}
              {stock.inputSnapshot && (
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Input Snapshot (classification_state)</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8 }}>Fields used in last classification run — source for shouldRecompute() delta detection.</div>
                  <div style={{
                    background: T.sidebarBg, border: `1px solid ${T.borderFaint}`,
                    borderRadius: 4, padding: "10px 12px",
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2,
                    maxHeight: 200, overflowY: "auto",
                  }}>
                    {Object.entries(stock.inputSnapshot).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 6, padding: "2px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                        <span style={{ fontSize: 9, color: T.textDim, fontFamily: "'DM Mono', monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
                        <span style={{
                          fontSize: 9, fontFamily: "'DM Mono', monospace",
                          color: v === null ? T.textDim : v === true ? "#16a34a" : v === false ? "#ef4444" : T.text,
                          fontWeight: v !== null ? 600 : 400, flexShrink: 0,
                        }}>{v === null ? "null" : v === true ? "true" : v === false ? "false" : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LLM Enrichment */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>LLM Enrichment Scores (E1–E6)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { label: "Moat Strength", key: "moatScore" },
                    { label: "Pricing Power", key: "pricingPowerScore" },
                    { label: "Revenue Recurrence", key: "revenueRecurrenceScore" },
                    { label: "Margin Durability", key: "marginDurabilityScore" },
                    { label: "Qualitative Cyclicality", key: "qualitativeCyclicalityScore" },
                    { label: "Capital Intensity", key: "capitalIntensityScore" },
                  ].map(({ label, key }) => (
                    <div key={key} style={{
                      padding: "8px 10px", background: T.sidebarBg, borderRadius: 4,
                      border: `1px solid ${T.borderFaint}`,
                    }}>
                      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 5 }}>{label}</div>
                      {stock[key] != null
                        ? <StarScore value={stock[key]} T={T} />
                        : <span style={{ fontSize: 10, color: T.textDim }}>—</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason codes */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Reason Codes</div>
                {(stock.reasonCodes || []).length === 0
                  ? <span style={{ fontSize: 11, color: T.textDim }}>No reason codes available.</span>
                  : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(stock.reasonCodes || []).map(r => (
                        <span key={r} style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4,
                          background: T.accent + "18", color: T.accent,
                          border: `1px solid ${T.accent}30`, fontWeight: 500,
                        }}>{r.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  )}
              </div>

              {/* Data sufficiency */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Data Provenance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { label: "Primary Provider", value: "Tiingo / FMP" },
                    { label: "LLM Enrichment", value: "claude-sonnet-4-6" },
                    { label: "Data Freshness", value: stock.ticker === "INTC" ? "STALE" : "Fresh", warn: stock.ticker === "INTC" },
                    { label: "Last Synced", value: fmtTime(stock.classifiedAt) },
                    { label: "net_income_positive", value: stock.netIncomePositive != null ? (stock.netIncomePositive ? "true" : "false") : "—" },
                    { label: "fcf_positive", value: stock.fcfPositive != null ? (stock.fcfPositive ? "true" : "false") : "—" },
                  ].map(({ label, value, warn }) => (
                    <div key={label} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderFaint}`, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: T.textDim }}>{label}</span>
                      <span style={{ fontSize: 10, color: warn ? "#ef4444" : T.text, fontFamily: "'DM Mono', monospace", fontWeight: warn ? 700 : 400 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Override section */}
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 8 }}>Classification Override</div>
                <div style={{
                  padding: "10px 12px", background: T.sidebarBg, borderRadius: 4,
                  border: `1px solid ${T.border}`, marginBottom: 10, fontSize: 11, color: T.textDim,
                  display: "flex", gap: 6, alignItems: "flex-start",
                }}>
                  <span style={{ color: "#3b82f6", flexShrink: 0 }}>ℹ</span>
                  Your override affects display only — alerts use the system classification.
                </div>
                {stock.finalCode ? (
                  <div style={{
                    padding: "10px 12px", background: "#f97316" + "10",
                    border: `1px solid #f9731630`, borderRadius: 4, marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Current Override</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: "#f97316" }}>{stock.finalCode}</div>
                  </div>
                ) : null}
                <button onClick={onOverride} style={{
                  padding: "8px 16px", fontSize: 12, fontWeight: 600, borderRadius: 4,
                  border: `1px solid ${T.accent}44`, background: T.accent + "15",
                  color: T.accent, cursor: "pointer",
                }}>
                  {stock.finalCode ? "Edit Override" : "Set My Classification"}
                </button>
                {stock.finalCode && (
                  <button onClick={onOverride} style={{
                    marginLeft: 8, padding: "8px 12px", fontSize: 12, borderRadius: 4,
                    border: `1px solid #ef444440`, background: "#ef444412",
                    color: "#ef4444", cursor: "pointer",
                  }}>Clear Override</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── FUNDAMENTALS TAB ────────────────────────────────────── */}
        {activeTab === "fundamentals" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
            {/* Growth */}
            <div style={{ borderRight: `1px solid ${T.border}` }}>
              <SectionHeader label="Growth" T={T} />
              <MetricCell label="Rev Growth 3Y CAGR" value={stock.revGrowth3y} unit="%" good={10} bad={3} T={T} />
              <MetricCell label="Rev Growth (Fwd)" value={stock.revGrowthFwd} unit="%" good={8} bad={3} T={T} />
              <MetricCell label="EPS Growth 3Y CAGR" value={stock.epsGrowth3y} unit="%" good={12} bad={5} T={T} />
              <MetricCell label="EPS Growth (Fwd)" value={stock.epsGrowthFwd} unit="%" good={10} bad={0} T={T} />
              <MetricCell label="Gross Profit Growth" value={stock.grossProfitGrowth} unit="%" good={10} bad={5} T={T} />
              <SectionHeader label="Margins" T={T} />
              <MetricCell label="Gross Margin" value={stock.grossMargin} unit="%" good={60} bad={30} T={T} />
              <MetricCell label="Operating Margin" value={stock.operatingMargin} unit="%" good={20} bad={5} T={T} />
              <MetricCell label="FCF Margin" value={stock.fcfMargin} unit="%" good={20} bad={8} T={T} />
            </div>
            {/* Quality */}
            <div style={{ borderRight: `1px solid ${T.border}` }}>
              <SectionHeader label="Returns & Quality" T={T} />
              <MetricCell label="FCF Conversion" value={stock.fcfConversion} unit="%" good={80} bad={50} T={T} />
              <MetricCell label="ROIC" value={stock.roic} unit="%" good={15} bad={8} T={T} />
              <MetricCell label="Net Income Positive" value={stock.netIncomePositive != null ? (stock.netIncomePositive ? "Yes" : "No") : null} mono={false} T={T} />
              <MetricCell label="FCF Positive" value={stock.fcfPositive != null ? (stock.fcfPositive ? "Yes" : "No") : null} mono={false} T={T} />
              <SectionHeader label="Balance Sheet" T={T} />
              <MetricCell label="Net Debt / EBITDA" value={stock.netDebtEbitda} unit="×"
                good={1} bad={2.5} T={T}
                note={stock.netDebtEbitda != null && stock.netDebtEbitda < 0 ? "Net cash position" : undefined} />
              <MetricCell label="Interest Coverage" value={stock.interestCoverage} unit="×" good={12} bad={5} T={T} />
              <MetricCell label="Share Count Growth 3Y" value={stock.shareCountGrowth3y} unit="%" good={-1} bad={2} T={T} />
            </div>
            {/* Flags & Context */}
            <div>
              <SectionHeader label="Classification Flags" T={T} />
              {[
                ["Holding Company", "holdingCompanyFlag"],
                ["Insurer", "insurerFlag"],
                ["Binary / Lottery", "binaryFlag"],
                ["Cyclicality", "cyclicalityFlag"],
                ["Pre-Operating Leverage", "preOperatingLeverageFlag"],
                ["Optionality Dominant", "optionalityFlag"],
                ["Material Dilution", "materialDilutionFlag"],
              ].map(([label, key]) => (
                <div key={key} style={{
                  padding: "7px 12px", borderBottom: `1px solid ${T.borderFaint}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: stock[key] ? "#f97316" : T.textDim,
                    fontFamily: "'DM Mono', monospace",
                  }}>{stock[key] != null ? (stock[key] ? "true" : "false") : "—"}</span>
                </div>
              ))}
              <SectionHeader label="Market Context" T={T} />
              <MetricCell label="Market Cap" value={stock.marketCap != null ? (stock.marketCap >= 1000 ? (stock.marketCap / 1000).toFixed(1) + "T" : stock.marketCap + "B") : null} mono={true} T={T} />
              <MetricCell label="Sector" value={stock.sector} mono={false} T={T} />
              <MetricCell label="Current Price" value={stock.price != null ? "$" + stock.price.toFixed(2) : null} mono={true} T={T} />
            </div>
          </div>
        )}

        {/* ── VALUATION TAB ───────────────────────────────────────── */}
        {activeTab === "valuation" && (
          <div style={{ display: "flex", gap: 0 }}>
            <div style={{ flex: "0 0 340px", borderRight: `1px solid ${T.border}` }}>
              <SectionHeader label="Active Valuation State" T={T} />
              <MetricCell label="Active Code" value={stock.finalCode || stock.suggestedCode} mono T={T} />
              <MetricCell label="Primary Metric" value={stock.metric} mono={false} T={T} />
              <MetricCell label="Current Multiple" value={stock.multiple != null ? stock.multiple + "×" : null} mono T={T} />
              <MetricCell label="Valuation Zone" value={ZONE_META[stock.zone]?.label} mono={false} T={T} />
              <MetricCell label="Threshold Source" value={stock.thresholdSource} mono={false} T={T} />
              <MetricCell label="Adj. TSR Hurdle" value={stock.tsrHurdle != null ? stock.tsrHurdle + "%" : null} mono T={T} />
              <SectionHeader label="Threshold Grid" T={T} />
              {stock.thresholds ? (
                <>
                  {[
                    { label: "Max", v: stock.thresholds.max, color: "#f97316" },
                    { label: "Comfortable", v: stock.thresholds.comfortable, color: "#eab308" },
                    { label: "Very Good", v: stock.thresholds.veryGood, color: "#84cc16" },
                    { label: "Steal", v: stock.thresholds.steal, color: "#16a34a" },
                  ].map(({ label, v, color }) => (
                    <div key={label} style={{
                      padding: "8px 12px", borderBottom: `1px solid ${T.borderFaint}`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: T.textMuted, flex: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: T.text, fontWeight: 600 }}>{v}×</span>
                      {stock.multiple != null && Math.abs(stock.multiple - v) < 0.5 && (
                        <span style={{ fontSize: 9, color: "#eab308" }}>← current</span>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ padding: "16px 12px", fontSize: 11, color: T.textDim }}>
                  Thresholds not available — stock is in manual_required state.
                </div>
              )}
            </div>
            <div style={{ flex: 1, padding: "14px 16px" }}>
              {stock.thresholds && stock.multiple != null && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 12 }}>Zone Position</div>
                  <ThresholdBar thresholds={stock.thresholds} current={stock.multiple} T={T} />
                  <div style={{ marginTop: 16, padding: "10px 12px", background: T.sidebarBg, borderRadius: 4, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>Current: <span style={{ fontFamily: "'DM Mono', monospace", color: T.text, fontWeight: 700 }}>{stock.multiple}×</span></div>
                    <div style={{ fontSize: 11, color: T.textDim }}>Zone: <ZoneBadge zone={stock.zone} theme={T.id} /></div>
                  </div>
                </>
              )}
              {(!stock.thresholds || stock.multiple == null) && (
                <div style={{ padding: "32px 0", textAlign: "center", color: T.textDim, fontSize: 12 }}>
                  Valuation zone not applicable — metric unavailable or stock in manual_required state.
                  {stock.watchSignal && <div style={{ marginTop: 12, fontSize: 11, color: "#eab308", maxWidth: 400, margin: "12px auto 0" }}>{stock.watchSignal}</div>}
                </div>
              )}

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 10 }}>TSR Hurdle Derivation</div>
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.7 }}>
                  {stock.suggestedCode ? (
                    <>
                      <div>Base TSR hurdle: Bucket {stock.suggestedCode[0]} baseline</div>
                      <div>EQ adjustment: Grade {stock.suggestedCode[1]} → {stock.suggestedCode[1] === "A" ? "no adjustment" : stock.suggestedCode[1] === "B" ? "+1%" : "+2%"}</div>
                      <div>BS adjustment: Grade {stock.suggestedCode[2]} → {stock.suggestedCode[2] === "A" ? "no adjustment" : stock.suggestedCode[2] === "B" ? "+0.5%" : "+1.5%"}</div>
                      {stock.cyclicalityFlag && <div style={{ color: "#eab308" }}>Cyclicality context: mid-cycle basis recommended</div>}
                      {stock.materialDilutionFlag && <div style={{ color: "#f97316" }}>Dilution adjustment applied</div>}
                      <div style={{ marginTop: 8, fontWeight: 600, color: T.text }}>Adjusted TSR Hurdle: {stock.tsrHurdle != null ? stock.tsrHurdle + "%" : "—"}</div>
                    </>
                  ) : <span style={{ color: T.textDim }}>Classification required before TSR hurdle can be computed.</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ─────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div style={{ padding: "16px" }}>
            <div style={{ maxWidth: 700 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 12 }}>Classification History</div>
              {history.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textDim, padding: "24px 0" }}>No classification history yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {history.map((h, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 12, padding: "10px 0",
                      borderBottom: `1px solid ${T.borderFaint}`,
                      alignItems: "flex-start",
                    }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                        background: i === 0 ? T.accent : T.textDim,
                      }} />
                      <div style={{ width: 86, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: T.textDim, fontFamily: "'DM Mono', monospace" }}>{h.date}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: h.oldCode ? T.textMuted : T.textDim }}>{h.oldCode || "null"}</span>
                        <span style={{ color: T.textDim, fontSize: 12 }}>→</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: i === 0 ? T.accent : T.text }}>{h.newCode}</span>
                        <ConfidenceBadge confidence={h.confidence} />
                      </div>
                      <div style={{ flex: 1, fontSize: 11, color: T.textMuted }}>{h.note}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Related alerts */}
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.textDim, marginBottom: 12 }}>Related Alerts</div>
                {ALERTS.filter(a => a.ticker === stock.ticker).length === 0 ? (
                  <div style={{ fontSize: 12, color: T.textDim }}>No recent alerts for this stock.</div>
                ) : ALERTS.filter(a => a.ticker === stock.ticker).map(alert => (
                  <div key={alert.id} style={{
                    padding: "10px 12px", marginBottom: 8,
                    background: T.sidebarBg, border: `1px solid ${T.border}`, borderRadius: 4,
                  }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <PriorityBadge priority={alert.priority} />
                      <FamilyBadge family={alert.family} />
                      <StatusDot status={alert.status} />
                      <span style={{ fontSize: 10, color: T.textDim }}>
                        {new Date(alert.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{alert.title}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{alert.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { StockDetailScreen });
