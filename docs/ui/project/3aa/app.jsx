// 3AA Monitoring — Main App (v2)
// Dark Terminal theme locked. Routing: universe → stock detail, alerts → alert detail.

const T = {
  id: "dark",
  bg: "#0b0d11",
  sidebarBg: "#0e1016",
  headerBg: "#0e1016",
  cardBg: "#131620",
  tableHead: "#0e1016",
  inputBg: "#0b0d11",
  text: "#d4d8e0",
  textMuted: "#8b92a5",
  textDim: "#4a5068",
  border: "#1e2230",
  borderFaint: "#181c27",
  rowHover: "#161a25",
  accent: "#2dd4bf",
};

function App() {
  const [authed, setAuthed]           = React.useState(false);
  const [screen, setScreen]           = React.useState("universe");
  const [selectedStock, setSelectedStock] = React.useState(null);
  const [selectedAlert, setSelectedAlert] = React.useState(null);
  const [overrideStock, setOverrideStock] = React.useState(null);
  const [showTweaks, setShowTweaks]   = React.useState(false);
  const [tweakScreen, setTweakScreen] = React.useState("universe");

  // Tweaks protocol
  React.useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === "__activate_edit_mode")   setShowTweaks(true);
      if (e.data?.type === "__deactivate_edit_mode") setShowTweaks(false);
    }
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const activeAlerts = ALERTS.filter(a => a.status === "active").length;

  if (!authed) {
    return (
      <div style={{ height: "100vh", display: "flex", fontFamily: "'DM Sans', sans-serif", background: T.bg }}>
        <SignInScreen T={T} onSignIn={() => setAuthed(true)} />
      </div>
    );
  }

  function navTo(s) {
    setScreen(s);
    setSelectedStock(null);
    setSelectedAlert(null);
  }

  function openStock(stock) {
    setSelectedStock(stock);
    setScreen("stock_detail");
  }

  function openAlert(alert) {
    setSelectedAlert(alert);
    setScreen("alert_detail");
  }

  // Which nav item is "active"
  const navActive = screen === "stock_detail" ? "universe"
    : screen === "alert_detail" ? "alerts"
    : screen;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif",
      background: T.bg, color: T.text, fontSize: 13,
    }}>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <Sidebar
          screen={navActive}
          setScreen={navTo}
          alertCount={activeAlerts}
          T={T}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {screen === "universe" && (
            <UniverseScreen T={T} onViewStock={openStock} />
          )}

          {screen === "stock_detail" && selectedStock && (
            <StockDetailScreen
              stock={selectedStock}
              T={T}
              onBack={() => navTo("universe")}
              onOverride={() => setOverrideStock(selectedStock)}
              relatedAlert={ALERTS.find(a => a.ticker === selectedStock.ticker)}
            />
          )}

          {screen === "alerts" && (
            <AlertsScreen T={T} onInspect={openAlert} />
          )}

          {screen === "alert_detail" && selectedAlert && (
            <AlertInspectionScreen
              alert={selectedAlert}
              T={T}
              onBack={() => navTo("alerts")}
              onViewStock={() => {
                const stock = STOCKS.find(s => s.ticker === selectedAlert.ticker);
                if (stock) openStock(stock);
              }}
              onOverride={() => {
                const stock = STOCKS.find(s => s.ticker === selectedAlert?.ticker);
                if (stock) setOverrideStock(stock);
              }}
            />
          )}

          {screen === "settings" && <SettingsScreen T={T} />}
        </div>
      </div>

      {/* Tweaks Panel — navigate to any screen for demo */}
      {showTweaks && (
        <TweaksPanel onClose={() => {
          setShowTweaks(false);
          window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
        }}>
          <TweakSection label="Jump to Screen">
            <TweakRadio
              value={tweakScreen}
              options={[
                { value: "universe",     label: "Universe table" },
                { value: "stock_msft",   label: "Stock detail — MSFT" },
                { value: "stock_unh",    label: "Stock detail — UNH (low conf)" },
                { value: "stock_tsla",   label: "Stock detail — TSLA (flags)" },
                { value: "alerts",       label: "Alerts feed" },
                { value: "alert_jnj",    label: "Alert detail — JNJ steal zone" },
                { value: "settings",     label: "Settings" },
                { value: "signin",       label: "Sign-in screen" },
              ]}
              onChange={v => {
                setTweakScreen(v);
                if (v === "universe") { navTo("universe"); }
                else if (v === "alerts") { navTo("alerts"); }
                else if (v === "settings") { navTo("settings"); }
                else if (v === "signin") { setAuthed(false); }
                else if (v === "stock_msft") { openStock(STOCKS.find(s => s.ticker === "MSFT")); }
                else if (v === "stock_unh")  { openStock(STOCKS.find(s => s.ticker === "UNH")); }
                else if (v === "stock_tsla") { openStock(STOCKS.find(s => s.ticker === "TSLA")); }
                else if (v === "alert_jnj")  { openAlert(ALERTS.find(a => a.id === "ALT-001")); }
              }}
            />
          </TweakSection>
          <TweakSection label="Density">
            <TweakRadio
              value="compact"
              options={[
                { value: "compact",     label: "Compact (current)" },
                { value: "comfortable", label: "Comfortable" },
              ]}
              onChange={() => {}}
            />
          </TweakSection>
        </TweaksPanel>
      )}

      {/* Global override modal */}
      {overrideStock && (
        <ClassificationModal
          stock={overrideStock}
          T={T}
          onClose={() => setOverrideStock(null)}
          onSaved={() => setOverrideStock(null)}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
