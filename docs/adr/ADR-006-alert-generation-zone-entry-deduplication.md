# ADR-006: Alert Generation Strategy - Zone-Entry with Deduplication

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-005 (Monitoring & Alerts Engine), ADR-002 (Nightly Batch Processing)

---

## Context

The monitoring engine must generate alerts to surface stocks of interest. The 3AA Monitoring Product tracks valuation zones:
- `steal_zone` - Panic pricing, rare dislocation
- `very_good_zone` - Meaningfully attractive gap
- `comfortable_zone` - Proper opportunity, core build zone
- `max_zone` - Upper bound
- `expensive` - Above max threshold

**The Question:** When should the system generate alerts?

### Alert Triggering Options

**Zone-Entry Only:**
- Alert when stock enters `very_good_zone` or `steal_zone`
- Alert when stock moves from `very_good_zone` → `steal_zone`
- Do NOT alert on every price tick within same zone

**Continuous Threshold Breach:**
- Alert every time stock is below threshold
- Alert on every daily refresh while in favorable zone
- High alert volume

**Price Movement Based:**
- Alert on X% price drop
- Alert on absolute price change
- Ignores framework zones

**User-Configurable Rules:**
- User defines custom alert rules
- Flexible but complex

### V1 Requirements

- Universe size: 1000 stocks
- Expected favorable zone stocks: ~50-100 at any time (5-10% of universe)
- User tolerance: ~5-10 actionable alerts/day (not 50+ noise alerts)
- Framework principle: Zone entry is meaningful, staying in zone is not newsworthy

---

## Decision

V1 shall use **zone-entry with deduplication** strategy:

1. **Generate alerts on zone entry only:**
   - Stock enters `very_good_zone` from `comfortable_zone`, `max_zone`, or `expensive`
   - Stock enters `steal_zone` from any other zone
   - Stock moves from `very_good_zone` → `steal_zone` (deeper opportunity)

2. **Do NOT generate alerts for:**
   - Staying in same zone (e.g., price drops 2% but still in `very_good_zone`)
   - Moving to less favorable zones (e.g., `steal_zone` → `very_good_zone`)
   - Entering `comfortable_zone` or `max_zone` (informational only, not alert-worthy)

3. **Deduplication with cooldown windows:**
   - Valuation alerts: 24-hour cooldown (don't re-alert if re-entered zone within 24h)
   - Classification alerts: 24-hour cooldown
   - Data quality alerts: 12-hour cooldown

4. **Priority assignment:**
   - `steal_zone` entry = CRITICAL
   - `very_good_zone` entry = HIGH
   - Classification change = HIGH
   - Data quality issue = MEDIUM

### Alert Generation Logic

```typescript
async function detectValuationAlerts(
  ticker: string,
  currentState: ValuationState,
  priorState: ValuationState | null
): Promise<Alert | null> {
  if (!priorState) return null; // First run, no prior state

  const FAVORABLE_ZONES = ['steal_zone', 'very_good_zone'];

  // Zone transition detection
  const enteredFavorableZone = (
    FAVORABLE_ZONES.includes(currentState.valuation_zone) &&
    !FAVORABLE_ZONES.includes(priorState.valuation_zone)
  );

  const movedDeeperIntoFavorable = (
    currentState.valuation_zone === 'steal_zone' &&
    priorState.valuation_zone === 'very_good_zone'
  );

  if (enteredFavorableZone || movedDeeperIntoFavorable) {
    // Check deduplication
    const recentSimilar = await db.query(`
      SELECT alert_id FROM alerts
      WHERE ticker = $1
        AND alert_family = 'valuation_opportunity'
        AND alert_type = $2
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `, [ticker, `${currentState.valuation_zone}_entry`]);

    if (recentSimilar.rows.length > 0) {
      // Suppress duplicate
      await logSuppressedAlert(ticker, 'cooldown_active');
      return null;
    }

    // Generate alert
    return {
      alert_id: generateUUID(),
      ticker,
      alert_family: 'valuation_opportunity',
      alert_type: `${currentState.valuation_zone}_entry`,
      priority: currentState.valuation_zone === 'steal_zone' ? 'critical' : 'high',
      title: `${ticker} entered ${currentState.valuation_zone.replace('_', ' ').toUpperCase()}`,
      message: buildValuationMessage(currentState, priorState),
      metadata: {
        prior_state: { zone: priorState.valuation_zone, multiple: priorState.current_multiple },
        current_state: { zone: currentState.valuation_zone, multiple: currentState.current_multiple },
        change_summary: { zone_improved: true }
      },
      status: 'active',
      created_at: new Date()
    };
  }

  return null; // No alert
}
```

---

## Rationale

### Why Zone-Entry Only?

**1. Framework Philosophy**
- Entering a favorable zone is meaningful (new opportunity)
- Staying in a zone is not newsworthy (already known)
- Framework zones are discrete categories, not continuous ranges

**2. Low-Noise Alerts**
- 1000 stocks × daily price volatility = potentially hundreds of alerts/day
- Zone-entry reduces alerts by ~90% (only on transitions)
- User can review ~5-10 actionable alerts/day

**3. Actionable Information**
- "AAPL entered steal zone" → actionable (new opportunity)
- "AAPL still in steal zone" → not actionable (already aware)
- "AAPL dropped 2% but still in same zone" → noise (not framework-relevant)

**4. User Attention Scarcity**
- User cannot process 50+ alerts/day
- High alert volume → user ignores all alerts
- Low alert volume → user pays attention

**5. Deduplication Prevents Spam**
- Stock may enter/exit zone due to price volatility
- 24-hour cooldown prevents re-alerting on short-term noise
- User sees meaningful transitions, not every tick

### Why NOT Continuous Threshold Breach?

**Alert Volume Explosion:**
- If 100 stocks in favorable zones, 100 alerts/day
- Every daily refresh generates alert (stock still below threshold)
- User drowns in alerts, misses truly new opportunities

**Not Framework-Aligned:**
- Framework defines zones as discrete states, not continuous monitoring
- Continuous alerting treats zones like dynamic ranges (not framework intent)

**Example of Bad Experience:**
```
Day 1: AAPL entered steal zone (good alert)
Day 2: AAPL still in steal zone (redundant)
Day 3: AAPL still in steal zone (noise)
Day 4: AAPL still in steal zone (user stops reading)
Day 5: MSFT entered steal zone (user misses because alert fatigue)
```

### Why NOT Price Movement Based?

**Ignores Framework:**
- 5% price drop may not change zone (still in comfortable zone)
- Framework zones are what matter, not absolute price movement

**False Positives:**
- Stock drops 10% but moves from `expensive` to `max_zone` (not opportunity)
- Stock rises 5% but stays in `steal_zone` (still opportunity)

**Framework First:**
- V1 is framework-first, not market-noise-first
- Price movement matters only if it changes framework zone

### Why NOT User-Configurable Rules?

**Complexity:**
- V1 scope is monitoring, not custom alerting platform
- User-configurable rules require UI, validation, testing
- Adds significant complexity for unclear V1 benefit

**Framework Defines Zones:**
- Framework already defines meaningful thresholds
- User-configurable rules would conflict with framework zones
- Risk: user sets arbitrary rules that don't align with framework

**V2 Feature:**
- Could add user-configurable alerts in V2
- V1 focuses on framework-based alerts only

---

## Consequences

### Positive ✅

**Low-Noise Alerts:**
- ~5-10 alerts/day vs 50-100 with continuous alerting
- User can review all alerts daily
- High signal-to-noise ratio

**Framework-Aligned:**
- Alerts correspond to meaningful zone transitions
- No alerts on intra-zone price movements
- User sees framework-relevant changes only

**Actionable Information:**
- Every alert represents new opportunity or material change
- "Entered steal zone" → actionable
- No redundant "still in steal zone" alerts

**Deduplication Prevents Spam:**
- 24-hour cooldown prevents re-alerting on volatility
- Stock that bounces in/out of zone only alerts once
- User avoids alert fatigue

**Scalable:**
- Works for 1000 stocks without overwhelming user
- Works for 10,000 stocks (just more zone entries, not exponentially more alerts)

### Negative ⚠️

**May Miss Intra-Zone Moves:**
- Stock drops 10% but stays in `very_good_zone` → no alert
- User must check current state manually
- **Mitigation:** Inspection view always shows current zone

**Cooldown May Suppress Valid Alerts:**
- Stock enters steal zone, exits next day, re-enters → suppressed within 24h
- Rare edge case (price volatility at zone boundary)
- **Mitigation:** User can check alert history for suppressed alerts

**No Continuous Monitoring Feel:**
- User doesn't get daily updates on stocks already in favorable zones
- Some users may expect "watchlist update" behavior
- **Mitigation:** Inspection view provides current state on-demand

**Priority Simplification:**
- All steal zone entries = critical (even if stock is low quality)
- Could refine: steal_zone + AA quality = critical, steal_zone + C quality = high
- **V1 Decision:** Keep simple (zone determines priority), refine in V2 if needed

---

## Alternatives Considered

### Alternative 1: Continuous Threshold Breach Alerting

**Approach:**
- Alert every day stock is in `very_good_zone` or `steal_zone`
- Every nightly batch generates alerts for all stocks below threshold

**Example:**
```
Day 1: AAPL in steal zone → alert
Day 2: AAPL in steal zone → alert
Day 3: AAPL in steal zone → alert
... (100 stocks × daily alerts = 100 alerts/day)
```

**Rejected Because:**
- ❌ Alert volume explosion (~100 alerts/day)
- ❌ Redundant alerts (user already knows stock is in steal zone)
- ❌ User ignores alerts due to fatigue
- ❌ Misses truly new opportunities in noise
- ✅ Would be appropriate for real-time trading alerts (V1 is EOD monitoring)

---

### Alternative 2: Price Movement Based Alerts

**Approach:**
- Alert on X% price drop (e.g., 5% daily decline)
- Alert on absolute price change (e.g., $10 drop)
- Ignore framework zones

**Rejected Because:**
- ❌ Not framework-aligned (price movement may not change zone)
- ❌ False positives (stock drops but not in favorable zone)
- ❌ False negatives (stock enters steal zone with 2% drop, no alert)
- ❌ V1 is framework-first, not market-noise-first
- ✅ Would be appropriate for pure technical analysis tool

---

### Alternative 3: User-Configurable Alert Rules

**Approach:**
- User defines custom rules:
  - "Alert if Forward P/E < 20"
  - "Alert if price drops >5% and in steal zone"
  - "Alert if Bucket 4 stock enters very good zone"
- Flexible alerting platform

**Rejected Because:**
- ❌ High complexity (rule UI, validation, testing)
- ❌ Out of V1 scope (monitoring, not custom alerting platform)
- ❌ Risk of user-defined rules conflicting with framework
- ❌ User can already filter inspection view by zone
- ✅ Could be added in V2 as advanced feature

---

### Alternative 4: No Deduplication (Alert on Every Zone Entry)

**Approach:**
- Alert on zone entry (same as V1)
- No cooldown window
- If stock re-enters zone next day, alert again

**Rejected Because:**
- ❌ Price volatility at zone boundary causes alert spam
- ❌ Stock bouncing in/out of steal zone = multiple alerts/week
- ❌ User sees same alert repeatedly (annoying)
- ✅ 24-hour cooldown is minimal trade-off for better UX

---

### Alternative 5: Digest-Based Alerts (Daily Summary)

**Approach:**
- Don't generate individual alerts
- Send daily digest: "5 stocks entered steal zone, 12 stocks in very good zone"
- Single notification per day

**Rejected Because:**
- ❌ Less urgent (user may miss time-sensitive opportunities)
- ❌ Harder to track individual stock transitions
- ❌ V1 inspection view already provides summary (no need for digest)
- ✅ Could be added as notification option in V2

---

## Implementation Notes

### Zone Transition Detection

```typescript
interface ZoneTransition {
  ticker: string;
  prior_zone: string;
  current_zone: string;
  transition_type: 'entered_favorable' | 'moved_deeper' | 'exited_favorable' | 'no_change';
}

function detectZoneTransition(
  currentZone: string,
  priorZone: string
): 'entered_favorable' | 'moved_deeper' | 'exited_favorable' | 'no_change' {
  const FAVORABLE_ZONES = ['steal_zone', 'very_good_zone'];

  const wasInFavorable = FAVORABLE_ZONES.includes(priorZone);
  const isInFavorable = FAVORABLE_ZONES.includes(currentZone);

  if (!wasInFavorable && isInFavorable) {
    return 'entered_favorable'; // Alert
  }

  if (currentZone === 'steal_zone' && priorZone === 'very_good_zone') {
    return 'moved_deeper'; // Alert (better opportunity)
  }

  if (wasInFavorable && !isInFavorable) {
    return 'exited_favorable'; // No alert (less interesting)
  }

  return 'no_change'; // No alert
}
```

### Deduplication Check

```typescript
async function isDuplicateAlert(
  ticker: string,
  alertFamily: string,
  alertType: string,
  cooldownHours: number
): Promise<boolean> {
  const result = await db.query(`
    SELECT alert_id FROM alerts
    WHERE ticker = $1
      AND alert_family = $2
      AND alert_type = $3
      AND created_at > NOW() - INTERVAL '${cooldownHours} hours'
    LIMIT 1
  `, [ticker, alertFamily, alertType]);

  return result.rows.length > 0;
}
```

### Priority Assignment with Quality Adjustment

```typescript
function assignPriority(
  zone: string,
  code: string
): 'critical' | 'high' | 'medium' | 'low' {
  const quality = code.slice(1); // "4AA" → "AA"

  // Base priority from zone
  let priority = zone === 'steal_zone' ? 'critical' : 'high';

  // Quality adjustment (optional refinement for V1.1)
  if (quality === 'AA' && priority === 'high') {
    priority = 'critical'; // AA-quality very_good_zone upgraded
  }

  if (quality.includes('C') && priority === 'critical') {
    priority = 'high'; // C-quality downgraded
  }

  return priority;
}
```

### Alert Message Construction

```typescript
function buildValuationMessage(
  currentState: ValuationState,
  priorState: ValuationState
): string {
  const pctChange = ((currentState.current_multiple - priorState.current_multiple) / priorState.current_multiple * 100).toFixed(1);
  const discount = ((currentState.current_multiple - currentState.steal_threshold) / currentState.steal_threshold * 100).toFixed(1);

  return `
${currentState.ticker} entered ${currentState.valuation_zone.replace('_', ' ').toUpperCase()}

Code: ${currentState.active_code}
Metric: ${currentState.primary_metric}

Current Multiple: ${currentState.current_multiple}x
Steal Threshold: ${currentState.steal_threshold}x
Discount: ${discount}% below threshold

Prior State:
  Multiple: ${priorState.current_multiple}x (${pctChange}% change)
  Zone: ${priorState.valuation_zone}

Zone transition: ${priorState.valuation_zone} → ${currentState.valuation_zone}
  `.trim();
}
```

---

## User Experience Implications

### Alert Inspection View

**Alert List (sorted by priority):**
```
╔══════════════════════════════════════════════════════════╗
║ Active Alerts (5)                                        ║
╠══════════════════════════════════════════════════════════╣
║ 🔴 CRITICAL                                              ║
║   AAPL entered STEAL ZONE (2h ago)                       ║
║   MSFT entered STEAL ZONE (5h ago)                       ║
║                                                          ║
║ 🟠 HIGH                                                  ║
║   GOOGL entered VERY GOOD ZONE (1h ago)                  ║
║   NVDA classification changed: 6BA → 5BA (3h ago)        ║
║                                                          ║
║ 🟡 MEDIUM                                                ║
║   TSLA data quality issue: forward P/E missing (4h ago)  ║
╚══════════════════════════════════════════════════════════╝
```

**Alert Detail:**
```
╔══════════════════════════════════════════════════════════╗
║ ALERT: AAPL entered STEAL ZONE                           ║
║ Priority: CRITICAL | Created: 2026-04-19 20:35 ET        ║
╠══════════════════════════════════════════════════════════╣
║ Code: 4AA (Elite Compounder - highest quality)           ║
║ Metric: Forward P/E                                      ║
║                                                          ║
║ Current State:                                           ║
║   Multiple: 18.2x                                        ║
║   Steal Threshold: 18.0x                                 ║
║   Discount: 1.1% above steal (marginal)                  ║
║                                                          ║
║ Prior State (2026-04-18):                                ║
║   Multiple: 22.8x (Comfortable Zone)                     ║
║   Zone: COMFORTABLE ZONE                                 ║
║                                                          ║
║ Change: Forward P/E dropped 4.6x (20% decline)           ║
║ Transition: Comfortable Zone → Steal Zone                ║
║                                                          ║
║ [ Acknowledge ] [ Resolve ] [ View Stock Detail ]        ║
╚══════════════════════════════════════════════════════════╝
```

---

## Future Enhancements (V2+)

**Quality-Adjusted Priority:**
- Steal zone + AA quality = critical
- Steal zone + C quality = high
- Very good zone + AA quality = critical
- Very good zone + C quality = medium

**User Alert Preferences:**
- "Only alert on steal zone" (skip very good zone alerts)
- "Alert on comfortable zone for Bucket 1-2 stocks" (defensive preference)
- "Auto-acknowledge alerts older than 7 days"

**Digest Mode:**
- Daily summary email: "5 new steal zone entries, 12 stocks in very good zone"
- User preference: immediate alerts vs daily digest

**Custom Rules (Advanced):**
- "Alert if Bucket 4 stock enters very good zone AND market cap >$100B"
- "Alert if Forward P/E drops >15% in single day"
- Advanced users only (not default V1 behavior)

---

## Related Decisions

- **RFC-005:** Defines alert families, generation logic, and deduplication strategy
- **RFC-003:** Defines valuation zones used for alert triggers
- **ADR-002:** Nightly batch processing determines alert generation timing (8:30-9pm ET)

---

## Notes

- Cooldown windows stored in alert metadata (can be adjusted per alert family)
- Suppressed alerts logged to `alert_history` with status='suppressed' for debugging
- User can view suppressed alerts in inspection view (transparency)
- Priority assignment is simple for V1 (zone-based), can be refined in V2

---

**END ADR-006**
