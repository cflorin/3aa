// Screen 1 — Sign In  |  Screen 5 — Settings

function SignInScreen({ T, onSignIn }) {
  const [email, setEmail] = React.useState("john@3aa.io");
  const [password, setPassword] = React.useState("••••••••••");
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError("Email and password are required."); return; }
    setError(""); setLoading(true);
    setTimeout(() => { setLoading(false); onSignIn(); }, 900);
  }

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg,
    }}>
      <div style={{ width: 360 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: T.accent, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'DM Mono', monospace",
          }}>3A</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>3AA Monitor</div>
            <div style={{ fontSize: 11, color: T.textDim }}>Stock monitoring platform</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: "24px 24px 20px",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 18 }}>Sign in to your account</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Email address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{
                width: "100%", background: T.inputBg, border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.text, fontSize: 13, padding: "8px 10px",
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{
                width: "100%", background: T.inputBg, border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.text, fontSize: 13, padding: "8px 10px",
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ accentColor: T.accent }} />
              <span style={{ fontSize: 12, color: T.textMuted }}>Remember me</span>
            </label>
            <button type="button" style={{
              border: "none", background: "none", color: T.accent, fontSize: 12, cursor: "pointer", padding: 0,
            }}>Forgot password?</button>
          </div>
          {error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>{error}</div>}
          <button type="submit" style={{
            width: "100%", padding: "9px", fontSize: 13, fontWeight: 600, borderRadius: 4,
            border: "none", background: T.accent, color: "#fff", cursor: "pointer",
            opacity: loading ? 0.7 : 1, transition: "opacity 0.1s",
          }}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: T.textDim }}>
          Access is provisioned by your administrator.
        </div>
      </div>
    </div>
  );
}

function SettingsScreen({ T }) {
  const [tab, setTab] = React.useState("alerts");
  const [muteVal, setMuteVal] = React.useState(false);
  const [muteClass, setMuteClass] = React.useState(false);
  const [muteData, setMuteData] = React.useState(false);
  const [minPriority, setMinPriority] = React.useState("all");
  const [defaultSort, setDefaultSort] = React.useState("zone_asc");
  const [density, setDensity] = React.useState("compact");
  const [saved, setSaved] = React.useState(false);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const tabs = [
    { id: "alerts", label: "Alert Preferences" },
    { id: "ui", label: "UI Preferences" },
    { id: "account", label: "Account" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.headerBg }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Settings</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ maxWidth: 560 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "7px 16px", fontSize: 12, border: "none", background: "none", cursor: "pointer",
                color: tab === t.id ? T.accent : T.textMuted,
                borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}`,
                fontWeight: tab === t.id ? 600 : 400, marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>

          {tab === "alerts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card T={T} title="Mute Alert Families">
                {[
                  { label: "Valuation alerts", checked: muteVal, set: setMuteVal },
                  { label: "Classification alerts", checked: muteClass, set: setMuteClass },
                  { label: "Data quality alerts", checked: muteData, set: setMuteData },
                ].map(({ label, checked, set }) => (
                  <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", borderBottom: `1px solid ${T.borderFaint}` }}>
                    <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} style={{ accentColor: T.accent }} />
                    <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                    {checked && <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>Muted</span>}
                  </label>
                ))}
              </Card>
              <Card T={T} title="Priority Threshold">
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>Only generate alerts at or above this priority level</div>
                <Select value={minPriority} onChange={setMinPriority} T={T} style={{ width: "100%" }}>
                  <option value="all">All priorities</option>
                  <option value="medium">Medium and above</option>
                  <option value="high">High and above</option>
                  <option value="critical">Critical only</option>
                </Select>
              </Card>
            </div>
          )}

          {tab === "ui" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card T={T} title="Default Sort Order">
                <Select value={defaultSort} onChange={setDefaultSort} T={T} style={{ width: "100%" }}>
                  <option value="zone_asc">Zone — best opportunities first</option>
                  <option value="marketCap_desc">Market cap — largest first</option>
                  <option value="ticker_asc">Ticker — A to Z</option>
                  <option value="tsr_asc">TSR hurdle — lowest first</option>
                </Select>
              </Card>
              <Card T={T} title="Display Density">
                {["compact", "comfortable", "spacious"].map(d => (
                  <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", borderBottom: `1px solid ${T.borderFaint}` }}>
                    <input type="radio" name="density" checked={density === d} onChange={() => setDensity(d)} style={{ accentColor: T.accent }} />
                    <span style={{ fontSize: 13, color: T.text, textTransform: "capitalize" }}>{d}</span>
                  </label>
                ))}
              </Card>
            </div>
          )}

          {tab === "account" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card T={T} title="Account Information">
                <InfoRow label="Email" value="john@3aa.io" T={T} />
                <InfoRow label="Last login" value="Apr 24, 2026 — 09:14 AM" T={T} />
                <InfoRow label="Session expires" value="May 1, 2026" T={T} />
              </Card>
              <Card T={T} title="Change Password">
                {["Current password", "New password", "Confirm new password"].map(label => (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 3 }}>{label}</div>
                    <input type="password" placeholder="••••••••" style={{
                      width: "100%", background: T.inputBg, border: `1px solid ${T.border}`,
                      borderRadius: 4, color: T.text, fontSize: 12, padding: "6px 10px",
                      outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                    }} />
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={save} style={{
              padding: "8px 20px", fontSize: 12, fontWeight: 600, borderRadius: 4,
              border: "none", background: T.accent, color: "#fff", cursor: "pointer",
            }}>Save Preferences</button>
            {saved && <span style={{ fontSize: 12, color: "#16a34a" }}>✓ Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SignInScreen, SettingsScreen });
