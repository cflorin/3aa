// Screen 3 — Alerts Feed

function AlertsScreen({ T, onInspect }) {
  const [priorityFilter, setPriorityFilter] = React.useState("All");
  const [familyFilter, setFamilyFilter] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [statuses, setStatuses] = React.useState(() => {
    const m = {};
    ALERTS.forEach(a => { m[a.id] = a.status; });
    return m;
  });
  const [hovRow, setHovRow] = React.useState(null);

  const priorities = ["All", "critical", "high", "medium", "low"];
  const families = ["All", "valuation", "classification", "data_quality"];
  const statusOpts = ["All", "active", "acknowledged", "resolved"];

  const filtered = ALERTS.filter(a => {
    const s = statuses[a.id] || a.status;
    if (priorityFilter !== "All" && a.priority !== priorityFilter) return false;
    if (familyFilter !== "All" && a.family !== familyFilter) return false;
    if (statusFilter !== "All" && s !== statusFilter) return false;
    return true;
  }).sort((a, b) => {
    const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  function ack(id) { setStatuses(s => ({ ...s, [id]: "acknowledged" })); }
  function resolve(id) { setStatuses(s => ({ ...s, [id]: "resolved" })); }

  const activeCnt = Object.values(statuses).filter(s => s === "active").length;

  function fmtTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        background: T.headerBg,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Alerts</div>
        {activeCnt > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
            background: "#ef4444", color: "#fff",
          }}>{activeCnt} active</span>
        )}
        <div style={{ flex: 1 }} />
        {/* Priority filter */}
        <div style={{ display: "flex", gap: 4 }}>
          {priorities.map(p => (
            <FilterBtn key={p} active={priorityFilter === p} onClick={() => setPriorityFilter(p)} T={T}>
              {p === "All" ? "All" : <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_META[p]?.color }} />
                {PRIORITY_META[p]?.label}
              </span>}
            </FilterBtn>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: T.border }} />
        <Select value={familyFilter} onChange={setFamilyFilter} T={T}>
          {families.map(f => <option key={f} value={f}>{f === "All" ? "All Families" : FAMILY_META[f]?.label || f}</option>)}
        </Select>
        <Select value={statusFilter} onChange={setStatusFilter} T={T}>
          {statusOpts.map(s => <option key={s} value={s}>{s === "All" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </Select>
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0
          ? <EmptyState message="No alerts match your filters." T={T} />
          : filtered.map(alert => {
            const st = statuses[alert.id] || alert.status;
            const dim = st === "resolved";
            return (
              <div key={alert.id}
                onClick={() => onInspect(alert)}
                onMouseEnter={() => setHovRow(alert.id)}
                onMouseLeave={() => setHovRow(null)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px 80px 1fr auto auto auto 120px",
                  alignItems: "center", gap: 10,
                  padding: "8px 16px",
                  borderBottom: `1px solid ${T.borderFaint}`,
                  background: hovRow === alert.id ? T.rowHover : "transparent",
                  cursor: "pointer",
                  opacity: dim ? 0.5 : 1,
                  transition: "all 0.1s",
                }}>
                {/* status dot */}
                <StatusDot status={st} />

                {/* ticker */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: "'DM Mono', monospace" }}>{alert.ticker}</div>
                  <div style={{ fontSize: 10, color: T.textDim }}>{fmtTime(alert.createdAt)}</div>
                </div>

                {/* title + summary */}
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {alert.title}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                    {alert.summary}
                  </div>
                </div>

                {/* priority */}
                <PriorityBadge priority={alert.priority} theme={T.id} />

                {/* family */}
                <FamilyBadge family={alert.family} />

                {/* zone */}
                <ZoneBadge zone={alert.zone} theme={T.id} />

                {/* actions */}
                <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                  {st === "active" && (
                    <button onClick={() => ack(alert.id)} style={{
                      fontSize: 10, padding: "3px 7px", borderRadius: 3,
                      border: `1px solid ${T.border}`, background: "transparent",
                      color: T.textMuted, cursor: "pointer",
                    }}>Ack</button>
                  )}
                  {st !== "resolved" && (
                    <button onClick={() => resolve(alert.id)} style={{
                      fontSize: 10, padding: "3px 7px", borderRadius: 3,
                      border: `1px solid ${T.border}`, background: "transparent",
                      color: T.textDim, cursor: "pointer",
                    }}>Resolve</button>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Footer count */}
      <div style={{
        padding: "6px 16px", borderTop: `1px solid ${T.border}`,
        fontSize: 11, color: T.textDim, background: T.headerBg,
      }}>
        {filtered.length} alert{filtered.length !== 1 ? "s" : ""} shown
      </div>
    </div>
  );
}

Object.assign(window, { AlertsScreen });
