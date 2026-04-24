// 3AA Monitoring — Shared Components

// ── Zone helpers ─────────────────────────────────────────────────────────────
const ZONE_META = {
  steal_zone:       { label: "Steal",       bg: "#15803d", text: "#fff", dot: "#16a34a" },
  very_good_zone:   { label: "Very Good",   bg: "#4d7c0f", text: "#fff", dot: "#84cc16" },
  comfortable_zone: { label: "Comfortable", bg: "#a16207", text: "#fff", dot: "#eab308" },
  max_zone:         { label: "Max",         bg: "#c2410c", text: "#fff", dot: "#f97316" },
  above_max:        { label: "Above Max",   bg: "#b91c1c", text: "#fff", dot: "#ef4444" },
  not_applicable:   { label: "N/A",         bg: "#374151", text: "#9ca3af", dot: "#6b7280" },
};

const PRIORITY_META = {
  critical: { label: "Critical", color: "#ef4444" },
  high:     { label: "High",     color: "#f97316" },
  medium:   { label: "Medium",   color: "#eab308" },
  low:      { label: "Low",      color: "#6b7280" },
};

const FAMILY_META = {
  valuation:    { label: "Valuation",    color: "#3b82f6" },
  classification: { label: "Classification", color: "#8b5cf6" },
  data_quality: { label: "Data Quality", color: "#6b7280" },
};

const CONFIDENCE_META = {
  high:   { label: "High",   color: "#16a34a" },
  medium: { label: "Med",    color: "#eab308" },
  low:    { label: "Low",    color: "#ef4444" },
};

// ── Zone Badge ────────────────────────────────────────────────────────────────
function ZoneBadge({ zone, theme }) {
  const m = ZONE_META[zone] || ZONE_META.not_applicable;
  const isDark = theme !== "light";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
      textTransform: "uppercase", whiteSpace: "nowrap",
      padding: "1px 6px", borderRadius: 3,
      background: isDark ? "transparent" : m.bg + "22",
      color: isDark ? m.dot : m.bg,
      border: `1px solid ${isDark ? m.dot + "55" : m.bg + "66"}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

// ── Priority Badge ────────────────────────────────────────────────────────────
function PriorityBadge({ priority, theme }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.low;
  const isDark = theme !== "light";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
      textTransform: "uppercase", padding: "1px 6px", borderRadius: 3,
      background: isDark ? m.color + "22" : m.color + "18",
      color: m.color, border: `1px solid ${m.color}44`,
    }}>{m.label}</span>
  );
}

// ── Family Badge ──────────────────────────────────────────────────────────────
function FamilyBadge({ family }) {
  const m = FAMILY_META[family] || FAMILY_META.data_quality;
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3,
      background: m.color + "18", color: m.color, border: `1px solid ${m.color}33`,
    }}>{m.label}</span>
  );
}

// ── Confidence Badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }) {
  const m = CONFIDENCE_META[confidence] || CONFIDENCE_META.low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
      background: m.color + "15", color: m.color, border: `1px solid ${m.color}33`,
    }}>{m.label}</span>
  );
}

// ── Source Tag ────────────────────────────────────────────────────────────────
function SourceTag({ source }) {
  const colors = {
    anchored: "#3b82f6",
    derived: "#8b5cf6",
    "manual override": "#f97316",
  };
  const c = colors[source] || "#6b7280";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
      textTransform: "uppercase", padding: "1px 5px", borderRadius: 2,
      background: c + "18", color: c, border: `1px solid ${c}33`,
    }}>{source || "—"}</span>
  );
}

// ── Code Chip ─────────────────────────────────────────────────────────────────
function CodeChip({ code, isOverride, dim, theme }) {
  if (!code) return <span style={{ color: dim }}>—</span>;
  return (
    <span style={{
      fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600,
      padding: "1px 6px", borderRadius: 3,
      background: isOverride ? "#f97316" + "20" : "transparent",
      color: isOverride ? "#f97316" : "inherit",
      border: isOverride ? "1px solid #f9731640" : "none",
    }}>{code}</span>
  );
}

// ── Sidebar Nav ───────────────────────────────────────────────────────────────
function Sidebar({ screen, setScreen, alertCount, T }) {
  const items = [
    { id: "universe",    label: "Universe",    icon: "⬡" },
    { id: "alerts",      label: "Alerts",      icon: "◈", badge: alertCount },
    { id: "settings",    label: "Settings",    icon: "⊙" },
  ];
  return (
    <div style={{
      width: 200, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: `1px solid ${T.border}`,
      background: T.sidebarBg,
    }}>
      {/* Logo */}
      <div style={{
        padding: "16px 16px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: 4,
          background: T.accent, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "#fff", fontFamily: "'DM Mono', monospace",
          flexShrink: 0,
        }}>3A</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "-0.01em" }}>3AA Monitor</span>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {items.map(item => {
          const active = screen === item.id;
          return (
            <button key={item.id} onClick={() => setScreen(item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "7px 16px", border: "none", cursor: "pointer", textAlign: "left",
              background: active ? T.accent + "18" : "transparent",
              color: active ? T.accent : T.textMuted,
              borderLeft: `2px solid ${active ? T.accent : "transparent"}`,
              fontSize: 13, fontWeight: active ? 600 : 400,
              transition: "all 0.1s",
            }}>
              <span style={{ fontSize: 13 }}>{item.icon}</span>
              {item.label}
              {item.badge > 0 && (
                <span style={{
                  marginLeft: "auto", fontSize: 10, fontWeight: 700,
                  background: "#ef4444", color: "#fff",
                  borderRadius: 8, padding: "1px 5px", minWidth: 16, textAlign: "center",
                }}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div style={{
        padding: "10px 16px", borderTop: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: T.accent + "33", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: T.accent, flexShrink: 0,
        }}>JD</div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>john@3aa.io</div>
        </div>
        <button onClick={() => {}} style={{
          border: "none", background: "none", cursor: "pointer",
          fontSize: 10, color: T.textMuted, padding: 0,
        }}>↩</button>
      </div>
    </div>
  );
}

// ── Table Header Cell ─────────────────────────────────────────────────────────
function Th({ children, sortKey, sortState, onSort, T, style = {} }) {
  const active = sortState?.key === sortKey;
  const dir = sortState?.dir;
  return (
    <th onClick={() => sortKey && onSort && onSort(sortKey)} style={{
      padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap",
      fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase",
      color: active ? T.accent : T.textDim,
      background: T.tableHead,
      borderBottom: `1px solid ${T.border}`,
      cursor: sortKey ? "pointer" : "default",
      userSelect: "none",
      position: "sticky", top: 0, zIndex: 1,
      ...style,
    }}>
      {children}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function Tr({ children, onClick, selected, hover, T }) {
  const [hov, setHov] = React.useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? T.accent + "12" : hov && onClick ? T.rowHover : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.1s",
        borderBottom: `1px solid ${T.borderFaint}`,
      }}>
      {children}
    </tr>
  );
}

function Td({ children, mono, dim, T, style = {}, muted }) {
  return (
    <td style={{
      padding: "5px 10px", fontSize: 12,
      fontFamily: mono ? "'DM Mono', monospace" : "inherit",
      color: muted ? T.textDim : T.text,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</td>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, T, width = 560 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        width, maxWidth: "100%", maxHeight: "85vh",
        background: T.cardBg, border: `1px solid ${T.border}`,
        borderRadius: 8, display: "flex", flexDirection: "column",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          padding: "14px 18px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            color: T.textDim, fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0,
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Info Row (key: value) ─────────────────────────────────────────────────────
function InfoRow({ label, value, T, mono }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: 12, padding: "5px 0", borderBottom: `1px solid ${T.borderFaint}`,
    }}>
      <span style={{ fontSize: 11, color: T.textDim, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{
        fontSize: 12, color: T.text, textAlign: "right",
        fontFamily: mono ? "'DM Mono', monospace" : "inherit",
      }}>{value ?? "—"}</span>
    </div>
  );
}

// ── Threshold Bar ─────────────────────────────────────────────────────────────
function ThresholdBar({ thresholds, current, T }) {
  if (!thresholds || current == null) return (
    <div style={{ fontSize: 11, color: T.textDim }}>Thresholds not available</div>
  );
  const { steal, veryGood, comfortable, max } = thresholds;
  const absMax = max * 1.4;
  const pct = v => Math.min(100, (v / absMax) * 100);
  const zones = [
    { label: "Steal", to: steal, color: "#16a34a" },
    { label: "V.Good", from: steal, to: veryGood, color: "#84cc16" },
    { label: "Comfortable", from: veryGood, to: comfortable, color: "#eab308" },
    { label: "Max", from: comfortable, to: max, color: "#f97316" },
    { label: "Above", from: max, to: absMax, color: "#ef4444" },
  ];
  const curPct = pct(current);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ position: "relative", height: 12, borderRadius: 3, overflow: "hidden", background: T.borderFaint }}>
        <div style={{ display: "flex", height: "100%", width: "100%" }}>
          {zones.map((z, i) => (
            <div key={i} style={{
              flex: `${pct(z.to) - pct(z.from || 0)}`,
              background: z.color + "aa",
            }} />
          ))}
        </div>
        <div style={{
          position: "absolute", top: -1, bottom: -1, width: 2,
          left: `${curPct}%`, background: "#fff",
          boxShadow: "0 0 4px rgba(255,255,255,0.8)",
          borderRadius: 1,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        {[steal, veryGood, comfortable, max].map((v, i) => (
          <span key={i} style={{ fontSize: 9, color: T.textDim, fontFamily: "'DM Mono', monospace" }}>{v}x</span>
        ))}
      </div>
    </div>
  );
}

// ── Filter Button ─────────────────────────────────────────────────────────────
function FilterBtn({ active, onClick, children, T }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", fontSize: 11, borderRadius: 4, border: `1px solid ${active ? T.accent : T.border}`,
      background: active ? T.accent + "20" : "transparent",
      color: active ? T.accent : T.textMuted, cursor: "pointer", fontWeight: active ? 600 : 400,
      transition: "all 0.1s",
    }}>{children}</button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, T, style = {} }) {
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 4,
        color: T.text, fontSize: 12, padding: "5px 10px", outline: "none",
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
function Select({ value, onChange, children, T, style = {} }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 4,
        color: T.text, fontSize: 12, padding: "5px 8px", outline: "none",
        cursor: "pointer",
        ...style,
      }}>
      {children}
    </select>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function Card({ children, T, style = {}, title }) {
  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6,
      overflow: "hidden", ...style,
    }}>
      {title && (
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${T.border}`,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: T.textDim,
        }}>{title}</div>
      )}
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const colors = { active: "#16a34a", acknowledged: "#eab308", resolved: "#6b7280", suppressed: "#3b82f6" };
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors[status] || "#6b7280", display: "inline-block" }} />;
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState({ message, T }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: T.textDim, fontSize: 13 }}>
      {message}
    </div>
  );
}

Object.assign(window, {
  ZONE_META, PRIORITY_META, FAMILY_META, CONFIDENCE_META,
  ZoneBadge, PriorityBadge, FamilyBadge, ConfidenceBadge, SourceTag, CodeChip,
  Sidebar, Th, Tr, Td, Modal, InfoRow, ThresholdBar,
  FilterBtn, Input, Select, Card, StatusDot, EmptyState,
});
