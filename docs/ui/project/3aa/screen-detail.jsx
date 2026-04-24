// Screen 4 — Alert Inspection / Stock Detail

function AlertInspectionScreen({ alert, T, onBack, onOverride, onViewStock }) {
  const stock = STOCKS.find(s => s.ticker === alert.ticker) || {};
  const thresholds = alert.thresholds || CODE_THRESHOLDS[alert.activeCode];
  const history = CLASSIFICATION_HISTORY[alert.ticker] || [];

  function fmtTime(iso) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const zoneSeq = ["steal_zone", "very_good_zone", "comfortable_zone", "max_zone", "above_max"];
  const priorIdx = zoneSeq.indexOf(alert.priorZone);
  const curIdx = zoneSeq.indexOf(alert.zone);
  const improved = curIdx < priorIdx; // lower index = better (cheaper)

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 10, background: T.headerBg,
      }}>
        <button onClick={onBack} style={{
          border: "none", background: "none", cursor: "pointer",
          color: T.accent, fontSize: 12, padding: 0, display: "flex", alignItems: "center", gap: 4,
        }}>← Back</button>
        <div style={{ width: 1, height: 14, background: T.border }} />
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: T.text }}>{alert.ticker}</span>
        <span style={{ fontSize: 12, color: T.textMuted }}>{alert.company}</span>
        {stock.price && <span style={{ fontSize: 12, color: T.textDim, fontFamily: "'DM Mono', monospace" }}>${stock.price.toFixed(2)}</span>}
        <div style={{ flex: 1 }} />
        <PriorityBadge priority={alert.priority} />
        <FamilyBadge family={alert.family} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Left column */}
        <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Alert Details */}
          <Card T={T} title="Alert Details">
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{alert.title}</div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{alert.summary}</div>
            </div>
            <InfoRow label="Alert ID" value={alert.id} T={T} mono />
            <InfoRow label="Triggered" value={fmtTime(alert.createdAt)} T={T} />
            <InfoRow label="Alert Type" value={alert.type?.replace(/_/g, " ")} T={T} />
            <InfoRow label="Status" value={
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <StatusDot status={alert.status} />
                {alert.status}
              </span>
            } T={T} />
            {alert.triggerPayload && (
              <div style={{ marginTop: 10, padding: "8px 10px", background: T.sidebarBg, borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.textDim, marginBottom: 6 }}>Trigger Payload</div>
                {Object.entries(alert.triggerPayload).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, fontSize: 11, padding: "2px 0" }}>
                    <span style={{ color: T.textDim, fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{k}</span>
                    <span style={{ color: T.text, fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Zone Transition */}
          {alert.priorZone && alert.zone && (
            <Card T={T} title="Zone Transition">
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Prior</div>
                  <ZoneBadge zone={alert.priorZone} theme={T.id} />
                  {alert.priorMultiple && (
                    <div style={{ fontSize: 11, color: T.textDim, fontFamily: "'DM Mono', monospace", marginTop: 3 }}>{alert.priorMultiple}x</div>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 18, color: improved ? "#16a34a" : "#ef4444" }}>{improved ? "↙" : "↗"}</span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current</div>
                  <ZoneBadge zone={alert.zone} theme={T.id} />
                  {alert.multiple && (
                    <div style={{ fontSize: 11, color: T.textDim, fontFamily: "'DM Mono', monospace", marginTop: 3 }}>{alert.multiple}x</div>
                  )}
                </div>
              </div>
              {thresholds && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Threshold Scale</div>
                  <ThresholdBar thresholds={thresholds} current={alert.multiple} T={T} />
                </div>
              )}
            </Card>
          )}

          {/* Data Provenance */}
          <Card T={T} title="Data Provenance">
            <InfoRow label="Primary Provider" value="Tiingo / FMP" T={T} />
            <InfoRow label="Data Freshness" value={
              <span style={{ color: "#16a34a", fontSize: 11 }}>● Fresh</span>
            } T={T} />
            <InfoRow label="Last Synced" value={fmtTime(alert.createdAt)} T={T} />
            {alert.triggerPayload?.missingFields && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>Missing Fields</div>
                {alert.triggerPayload.missingFields.map(f => (
                  <div key={f} style={{ fontSize: 11, color: "#ef4444", fontFamily: "'DM Mono', monospace" }}>✗ {f}</div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Classification Context */}
          <Card T={T} title="Classification Context">
            <InfoRow label="Active Code" value={
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: T.accent }}>{alert.activeCode}</span>
            } T={T} />
            <InfoRow label="System Suggested" value={<CodeChip code={stock.suggestedCode} T={T} dim={T.textDim} />} T={T} />
            {stock.finalCode && (
              <InfoRow label="Your Override" value={<CodeChip code={stock.finalCode} isOverride T={T} dim={T.textDim} />} T={T} />
            )}
            <InfoRow label="Confidence" value={<ConfidenceBadge confidence={alert.confidence} />} T={T} />
            <InfoRow label="Reason Codes" value={
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(stock.reasonCodes || []).map(r => (
                  <span key={r} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: T.accent + "15", color: T.accent, border: `1px solid ${T.accent}30` }}>{r.replace(/_/g, " ")}</span>
                ))}
              </div>
            } T={T} />
            {history.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.textDim, marginBottom: 6 }}>Recent History</div>
                {history.slice(0, 3).map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, fontSize: 10, padding: "3px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                    <span style={{ color: T.textDim, fontFamily: "'DM Mono', monospace", width: 76 }}>{h.date}</span>
                    <span style={{ color: T.textMuted, fontFamily: "'DM Mono', monospace" }}>{h.oldCode} → {h.newCode}</span>
                    <ConfidenceBadge confidence={h.confidence} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Valuation Context */}
          <Card T={T} title="Valuation Context">
            <InfoRow label="Valuation Zone" value={<ZoneBadge zone={alert.zone} theme={T.id} />} T={T} />
            <InfoRow label="Primary Metric" value={alert.metric} T={T} />
            <InfoRow label="Current Multiple" value={alert.multiple != null ? `${alert.multiple}x` : "—"} T={T} mono />
            <InfoRow label="Threshold Source" value={<SourceTag source={alert.thresholdSource} />} T={T} />
            <InfoRow label="Adj. TSR Hurdle" value={alert.tsrHurdle != null ? `${alert.tsrHurdle}%` : "—"} T={T} mono />
            {thresholds && (
              <>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.textDim, marginBottom: 6 }}>Threshold Grid</div>
                  {[
                    { label: "Max", v: thresholds.max, color: "#f97316" },
                    { label: "Comfortable", v: thresholds.comfortable, color: "#eab308" },
                    { label: "Very Good", v: thresholds.veryGood, color: "#84cc16" },
                    { label: "Steal", v: thresholds.steal, color: "#16a34a" },
                  ].map(({ label, v, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: T.textDim, flex: 1 }}>{label}</span>
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.text }}>{v}x</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onViewStock} style={{
              flex: 1, padding: "8px 12px", fontSize: 12, borderRadius: 4,
              border: `1px solid ${T.accent}44`, background: T.accent + "15",
              color: T.accent, cursor: "pointer", fontWeight: 600,
            }}>View Full Stock Detail →</button>
            <button onClick={onOverride} style={{
              flex: 1, padding: "8px 12px", fontSize: 12, borderRadius: 4,
              border: `1px solid ${T.border}`, background: "transparent",
              color: T.textMuted, cursor: "pointer",
            }}>Override Classification</button>
            <button onClick={onBack} style={{
              flex: 1, padding: "8px 12px", fontSize: 12, borderRadius: 4,
              border: "none", background: T.accent, color: "#fff",
              cursor: "pointer", fontWeight: 600,
            }}>Acknowledge</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AlertInspectionScreen });
