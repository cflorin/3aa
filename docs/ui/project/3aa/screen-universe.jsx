// Screen 2 — Universe / Monitor List (v2)
// Columns per STORY-048: Ticker, Company, Sector, 3AA Code, Confidence, Monitoring,
//   Rev Growth Fwd, EPS Growth Fwd, FCF Conv, Net Debt/EBITDA, Operating Margin

// ── Classification Override Modal (STORY-051) ─────────────────────────────────
function ClassificationModal({ stock, onClose, onSaved, T }) {
  const [code, setCode] = React.useState(stock.finalCode || stock.suggestedCode || "1AA");
  const [reason, setReason] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const history = CLASSIFICATION_HISTORY[stock.ticker] || [];

  const BUCKET_LIST = ["1","2","3","4","5","6","7","8"];
  const EQ_LIST = ["A","B","C"];
  const BS_LIST = ["A","B","C"];

  const bucket = code[0] || "1";
  const eq     = code[1] || "A";
  const bs     = code[2] || "A";

  function setCodePart(idx, val) {
    const parts = [bucket, eq, bs];
    parts[idx] = val;
    setCode(parts.join(""));
  }

  function handleSave() {
    if (reason.trim().length < 10) return;
    setSaved(true);
    setTimeout(() => { onSaved && onSaved(code); onClose(); }, 900);
  }

  function handleClear() {
    setClearing(true);
    setTimeout(() => { onSaved && onSaved(null); onClose(); }, 700);
  }

  // Winning bucket highlight
  const topBucket = stock.bucketScores
    ? Object.entries(stock.bucketScores).reduce((a, b) => b[1] > a[1] ? b : a, ["0", 0])[0]
    : null;
  const topEQ = stock.eqScores
    ? Object.entries(stock.eqScores).reduce((a, b) => b[1] > a[1] ? b : a, ["?", 0])[0]
    : null;
  const topBS = stock.bsScores
    ? Object.entries(stock.bsScores).reduce((a, b) => b[1] > a[1] ? b : a, ["?", 0])[0]
    : null;

  if (saved || clearing) {
    return (
      <Modal title={`${stock.ticker} — Classification`} onClose={onClose} T={T} width={520}>
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{clearing ? "↩" : "✓"}</div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>
            {clearing ? "Override cleared" : "Override saved"}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
            {clearing ? stock.suggestedCode : code}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`${stock.ticker} — Classification Override`}
      subtitle={stock.name}
      onClose={onClose} T={T} width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Active code header */}
        <div style={{
          background: T.sidebarBg, border: `1px solid ${T.border}`,
          borderRadius: 6, padding: "12px 14px",
        }}>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>System Suggested</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 800, color: T.accent }}>
                {stock.suggestedCode || "—"}
              </div>
              <div style={{ marginTop: 4 }}><ConfidenceBadge confidence={stock.confidence} /></div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                {stock.classifiedAt ? new Date(stock.classifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
              </div>
            </div>
            {stock.finalCode && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Your Override (active)</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 800, color: "#f97316" }}>
                  {stock.finalCode}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Bucket Scores", data: stock.bucketScores || {}, topKey: topBucket },
            { label: "Earnings Quality", data: stock.eqScores || {}, topKey: topEQ },
            { label: "Balance Sheet", data: stock.bsScores || {}, topKey: topBS },
          ].map(({ label, data, topKey }) => (
            <div key={label} style={{
              background: T.sidebarBg, border: `1px solid ${T.borderFaint}`,
              borderRadius: 4, padding: "10px",
            }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</div>
              {Object.entries(data).map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
                  <span style={{
                    fontSize: 9, fontFamily: "'DM Mono', monospace", width: 14,
                    color: k === topKey ? T.accent : T.textDim,
                    fontWeight: k === topKey ? 700 : 400,
                  }}>{k}</span>
                  <div style={{ flex: 1, height: 7, background: T.borderFaint, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${v}%`,
                      background: k === topKey ? T.accent + "bb" : T.textDim + "44",
                    }} />
                  </div>
                  <span style={{ fontSize: 9, color: k === topKey ? T.text : T.textDim, width: 22, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Reason codes */}
        {(stock.reasonCodes || []).length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Reason Codes</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {stock.reasonCodes.map(r => (
                <span key={r} style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 3,
                  background: T.accent + "15", color: T.accent, border: `1px solid ${T.accent}30`,
                }}>{r.replace(/_/g, " ")}</span>
              ))}
            </div>
          </div>
        )}

        {/* Override form */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.textDim, marginBottom: 10 }}>
            {stock.finalCode ? "Edit Your Override" : "Set My Classification"}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Bucket</div>
              <Select value={bucket} onChange={v => setCodePart(0, v)} T={T} style={{ width: 58 }}>
                {BUCKET_LIST.map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Earnings Quality</div>
              <Select value={eq} onChange={v => setCodePart(1, v)} T={T} style={{ width: 58 }}>
                {EQ_LIST.map(e => <option key={e}>{e}</option>)}
              </Select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Balance Sheet</div>
              <Select value={bs} onChange={v => setCodePart(2, v)} T={T} style={{ width: 58 }}>
                {BS_LIST.map(b => <option key={b}>{b}</option>)}
              </Select>
            </div>
            <div style={{ paddingTop: 14 }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 800, color: T.accent,
              }}>{code}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>
              Override Reason <span style={{ color: "#ef4444" }}>*</span>
              <span style={{ color: T.textDim, marginLeft: 6 }}>min 10 characters</span>
            </div>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Explain your classification judgment…"
              rows={3}
              style={{
                width: "100%", background: T.inputBg,
                border: `1px solid ${reason.length > 0 && reason.length < 10 ? "#ef4444" : T.border}`,
                borderRadius: 4, color: T.text, fontSize: 12, padding: "7px 10px",
                resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              }}
            />
            {reason.length > 0 && reason.length < 10 && (
              <div style={{ fontSize: 10, color: "#ef4444", marginTop: 3 }}>Minimum 10 characters required.</div>
            )}
          </div>

          {/* display-only disclaimer */}
          <div style={{
            marginTop: 10, padding: "8px 10px", background: "#3b82f618",
            border: "1px solid #3b82f630", borderRadius: 4,
            fontSize: 10, color: "#93c5fd",
            display: "flex", gap: 6, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0 }}>ℹ</span>
            <span>Your override affects display only — alerts use the system classification.</span>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Classification History</div>
            {history.slice(0, 10).map((h, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                borderBottom: `1px solid ${T.borderFaint}`, fontSize: 11,
              }}>
                <span style={{ color: T.textDim, fontFamily: "'DM Mono', monospace", fontSize: 10, width: 82 }}>{h.date}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: T.textMuted, fontSize: 11 }}>{h.oldCode || "null"}</span>
                <span style={{ color: T.textDim }}>→</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: T.text, fontWeight: 600 }}>{h.newCode}</span>
                <ConfidenceBadge confidence={h.confidence} />
                <span style={{ color: T.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{h.note}</span>
              </div>
            ))}
          </div>
        )}
        {history.length === 0 && (
          <div style={{ fontSize: 11, color: T.textDim, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
            No classification history yet.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          {stock.finalCode && (
            <button onClick={handleClear} style={{
              padding: "7px 14px", fontSize: 12, borderRadius: 4,
              border: "1px solid #ef444444", background: "#ef444412",
              color: "#ef4444", cursor: "pointer",
            }}>Clear Override</button>
          )}
          <button onClick={onClose} style={{
            padding: "7px 14px", fontSize: 12, borderRadius: 4,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.textMuted, cursor: "pointer",
          }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={reason.trim().length < 10}
            style={{
              padding: "7px 18px", fontSize: 12, borderRadius: 4, fontWeight: 600,
              border: "none",
              background: reason.trim().length >= 10 ? T.accent : T.borderFaint,
              color: reason.trim().length >= 10 ? "#fff" : T.textDim,
              cursor: reason.trim().length >= 10 ? "pointer" : "not-allowed",
              transition: "all 0.1s",
            }}>Save Override</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Universe Screen ────────────────────────────────────────────────────────────
function UniverseScreen({ T, onViewStock }) {
  const [search, setSearch] = React.useState("");
  const [sector, setSector]     = React.useState("All");
  const [codeFilter, setCodeFilter] = React.useState("");
  const [confFilter, setConfFilter] = React.useState("All");
  const [monitoring, setMonitoring] = React.useState("All");
  const [sortKey, setSortKey]   = React.useState("marketCap");
  const [sortDir, setSortDir]   = React.useState("desc");
  const [modalStock, setModalStock] = React.useState(null);
  const [deactivated, setDeactivated] = React.useState(
    new Set(STOCKS.filter(s => !s.isActive).map(s => s.ticker))
  );
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(null); // ticker
  const [togglingTicker, setTogglingTicker] = React.useState(null); // loading state
  const [overrides, setOverrides] = React.useState(
    Object.fromEntries(STOCKS.filter(s => s.finalCode).map(s => [s.ticker, s.finalCode]))
  );
  const [page, setPage] = React.useState(0);
  const PER_PAGE = 15;

  const sectors = ["All", ...Array.from(new Set(STOCKS.map(s => s.sector))).sort()];
  const confs   = ["All", "high", "medium", "low", "none"];

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  }

  function activeCode(s) { return overrides[s.ticker] || s.suggestedCode; }

  const filtered = STOCKS.filter(s => {
    const inactive = deactivated.has(s.ticker);
    if (search && !s.ticker.toLowerCase().includes(search.toLowerCase()) &&
        !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sector !== "All" && s.sector !== sector) return false;
    if (codeFilter) {
      const ac = (activeCode(s) || "").toUpperCase();
      if (!ac.startsWith(codeFilter.toUpperCase())) return false;
    }
    if (confFilter !== "All") {
      if (confFilter === "none" && s.confidence) return false;
      if (confFilter !== "none" && s.confidence !== confFilter) return false;
    }
    if (monitoring === "Active" && inactive) return false;
    if (monitoring === "Inactive" && !inactive) return false;
    return true;
  }).sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") va = va.toLowerCase(), vb = (vb || "").toLowerCase();
    return sortDir === "asc" ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const activeFilterCount = [sector !== "All", !!codeFilter, confFilter !== "All", monitoring !== "All"].filter(Boolean).length;

  function fmtVal(v, unit = "") {
    if (v == null) return null;
    return `${v}${unit}`;
  }
  function colorGrowth(v) {
    if (v == null) return T.textDim;
    return v >= 8 ? "#16a34a" : v >= 3 ? "#eab308" : "#ef4444";
  }
  function colorMargin(v) {
    if (v == null) return T.textDim;
    return v >= 15 ? "#16a34a" : v >= 5 ? "#eab308" : "#ef4444";
  }
  function colorDebt(v) {
    if (v == null) return T.textDim;
    return v <= 1 ? "#16a34a" : v <= 2.5 ? "#eab308" : "#ef4444";
  }
  function colorFCF(v) {
    if (v == null) return T.textDim;
    return v >= 80 ? "#16a34a" : v >= 50 ? "#eab308" : "#ef4444";
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        background: T.headerBg,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Universe</span>
        <span style={{ fontSize: 11, color: T.textDim }}>{filtered.length} stocks</span>
        {activeFilterCount > 0 && (
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 8,
            background: T.accent + "22", color: T.accent, fontWeight: 700,
          }}>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}</span>
        )}
        <div style={{ flex: 1 }} />
        <Input value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search ticker or name…" T={T} style={{ width: 180 }} />
        <Select value={sector} onChange={v => { setSector(v); setPage(0); }} T={T}>
          {sectors.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Input value={codeFilter} onChange={v => { setCodeFilter(v); setPage(0); }} placeholder="Code prefix (e.g. 4A)" T={T} style={{ width: 130 }} />
        <Select value={confFilter} onChange={v => { setConfFilter(v); setPage(0); }} T={T}>
          <option value="All">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">No classification</option>
        </Select>
        <Select value={monitoring} onChange={v => { setMonitoring(v); setPage(0); }} T={T}>
          <option>All</option>
          <option>Active</option>
          <option>Inactive</option>
        </Select>
        {activeFilterCount > 0 && (
          <button onClick={() => { setSearch(""); setSector("All"); setCodeFilter(""); setConfFilter("All"); setMonitoring("All"); setPage(0); }} style={{
            fontSize: 11, padding: "4px 8px", borderRadius: 4,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.textDim, cursor: "pointer",
          }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <Th sortKey="ticker" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 70 }}>Ticker</Th>
              <Th sortKey="name" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T}>Company</Th>
              <Th T={T} style={{ width: 90 }}>Sector</Th>
              <Th sortKey="suggestedCode" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 74 }}>3AA Code</Th>
              <Th sortKey="confidence" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 60 }}>Conf.</Th>
              <Th T={T} style={{ width: 68 }}>Monitor</Th>
              <Th sortKey="revGrowthFwd" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 72 }}>Rev Fwd</Th>
              <Th sortKey="epsGrowthFwd" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 72 }}>EPS Fwd</Th>
              <Th sortKey="fcfConversion" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 68 }}>FCF Conv</Th>
              <Th sortKey="netDebtEbitda" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 76 }}>ND/EBITDA</Th>
              <Th sortKey="operatingMargin" sortState={{ key: sortKey, dir: sortDir }} onSort={handleSort} T={T} style={{ width: 72 }}>Op Margin</Th>
              <Th T={T} style={{ width: 90 }}>Zone</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const inactive = deactivated.has(s.ticker);
              const hasOverride = !!overrides[s.ticker];
              const code = activeCode(s);
              return (
                <Tr key={s.ticker} T={T} onClick={() => onViewStock(s)}>
                  <Td mono T={T} style={{ fontWeight: 700, color: inactive ? T.textDim : T.accent }}>
                    {s.ticker}
                  </Td>
                  <Td T={T} style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160, color: inactive ? T.textDim : T.text }}>
                    {s.name}
                  </Td>
                  <Td T={T} muted style={{ fontSize: 10 }}>{s.sector}</Td>
                  <Td T={T}>
                    <div
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                      onClick={e => { e.stopPropagation(); setModalStock(s); }}
                      title="Click to view/override classification"
                    >
                      <span style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                        padding: "1px 6px", borderRadius: 3,
                        background: hasOverride ? "#f97316" + "20" : T.accent + "15",
                        color: hasOverride ? "#f97316" : T.accent,
                        border: `1px solid ${hasOverride ? "#f9731640" : T.accent + "30"}`,
                      }}>{code || "—"}</span>
                    </div>
                  </Td>
                  <Td T={T}><ConfidenceBadge confidence={s.confidence} /></Td>
                  <Td T={T}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      {togglingTicker === s.ticker ? (
                        <span style={{ fontSize: 10, color: T.textDim, padding: "2px 7px" }}>…</span>
                      ) : confirmDeactivate === s.ticker ? (
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: T.textMuted, whiteSpace: "nowrap" }}>Stop alerts?</span>
                          <button onClick={() => {
                            setTogglingTicker(s.ticker);
                            setConfirmDeactivate(null);
                            setTimeout(() => {
                              setDeactivated(prev => { const n = new Set(prev); n.add(s.ticker); return n; });
                              setTogglingTicker(null);
                            }, 500);
                          }} style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 3,
                            border: "1px solid #ef444444", background: "#ef444412",
                            color: "#ef4444", cursor: "pointer",
                          }}>Yes</button>
                          <button onClick={() => setConfirmDeactivate(null)} style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 3,
                            border: `1px solid ${T.border}`, background: "transparent",
                            color: T.textDim, cursor: "pointer",
                          }}>No</button>
                        </div>
                      ) : (
                        <button onClick={() => {
                          if (inactive) {
                            setTogglingTicker(s.ticker);
                            setTimeout(() => {
                              setDeactivated(prev => { const n = new Set(prev); n.delete(s.ticker); return n; });
                              setTogglingTicker(null);
                            }, 400);
                          } else {
                            setConfirmDeactivate(s.ticker);
                          }
                        }} style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 3,
                          border: `1px solid ${inactive ? "#16a34a44" : T.border}`,
                          background: "transparent",
                          color: inactive ? "#16a34a" : T.textDim,
                          cursor: "pointer",
                        }}>{inactive ? "Reactivate" : "Active ↓"}</button>
                      )}
                    </div>
                  </Td>
                  <Td mono T={T} style={{ color: colorGrowth(s.revGrowthFwd) }}>{fmtVal(s.revGrowthFwd, "%") || <span style={{ color: T.textDim }}>—</span>}</Td>
                  <Td mono T={T} style={{ color: s.epsGrowthFwd != null ? (s.epsGrowthFwd >= 0 ? colorGrowth(s.epsGrowthFwd) : "#ef4444") : T.textDim }}>{fmtVal(s.epsGrowthFwd, "%") || <span style={{ color: T.textDim }}>—</span>}</Td>
                  <Td mono T={T} style={{ color: colorFCF(s.fcfConversion) }}>{fmtVal(s.fcfConversion, "%") || <span style={{ color: T.textDim }}>—</span>}</Td>
                  <Td mono T={T} style={{ color: colorDebt(s.netDebtEbitda) }}>{s.netDebtEbitda != null ? (s.netDebtEbitda < 0 ? "net cash" : s.netDebtEbitda + "×") : <span style={{ color: T.textDim }}>—</span>}</Td>
                  <Td mono T={T} style={{ color: colorMargin(s.operatingMargin) }}>{fmtVal(s.operatingMargin, "%") || <span style={{ color: T.textDim }}>—</span>}</Td>
                  <Td T={T}><ZoneBadge zone={s.zone} theme={T.id} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="No stocks match your current filters." T={T} />}
      </div>

      {/* Pagination */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: T.headerBg,
      }}>
        <span style={{ fontSize: 11, color: T.textDim }}>
          Page {page + 1} of {pages} · {filtered.length} stocks
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
            padding: "3px 10px", fontSize: 11, borderRadius: 3, border: `1px solid ${T.border}`,
            background: "transparent", color: page === 0 ? T.textDim : T.text,
            cursor: page === 0 ? "default" : "pointer",
          }}>← Prev</button>
          {Array.from({ length: Math.min(pages, 6) }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{
              padding: "3px 8px", fontSize: 11, borderRadius: 3, minWidth: 28,
              border: `1px solid ${page === i ? T.accent : T.border}`,
              background: page === i ? T.accent + "20" : "transparent",
              color: page === i ? T.accent : T.text, cursor: "pointer", fontWeight: page === i ? 600 : 400,
            }}>{i + 1}</button>
          ))}
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} style={{
            padding: "3px 10px", fontSize: 11, borderRadius: 3, border: `1px solid ${T.border}`,
            background: "transparent", color: page >= pages - 1 ? T.textDim : T.text,
            cursor: page >= pages - 1 ? "default" : "pointer",
          }}>Next →</button>
        </div>
      </div>

      {/* Classification modal */}
      {modalStock && (
        <ClassificationModal
          stock={{ ...modalStock, finalCode: overrides[modalStock.ticker] || modalStock.finalCode }}
          T={T}
          onClose={() => setModalStock(null)}
          onSaved={(code) => {
            setOverrides(prev => {
              const n = { ...prev };
              if (code) n[modalStock.ticker] = code;
              else delete n[modalStock.ticker];
              return n;
            });
            setModalStock(null);
          }}
        />
      )}
    </div>
  );
}

Object.assign(window, { UniverseScreen, ClassificationModal });
