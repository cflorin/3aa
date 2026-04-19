# ADR-004: Classification Automation Strategy - Rules-First with Manual Override

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-001 (Classification Engine), RFC-002 (Data Model)

---

## Context

The classification engine must assign each stock a 3-part code: `[Bucket][Earnings Quality][Balance Sheet Quality]` (e.g., `4AA`, `5BB`).

**The Question:** What level of automation should the classification engine provide?

### Automation Spectrum

**Fully Automated:**
- System assigns classification, no user input
- User cannot override
- Fast, but risks incorrect classifications

**Rules-First with Manual Override:**
- System suggests classification with confidence level
- User reviews and can override
- Preserves both system suggestion and user decision

**Fully Manual:**
- System provides data, user classifies
- No automation
- Slow, doesn't scale to 1000 stocks

**Confidence-Gated:**
- System auto-applies high-confidence classifications
- Low-confidence classifications require manual approval
- Hybrid approach

### V1 Requirements

- Universe size: 1000 stocks
- Classification complexity: 8 buckets × 3 quality grades × 3 balance sheet grades = 72 possible codes
- Expected edge cases: Holding companies, insurers, pre-operating leverage, binary outcomes
- User trust: Framework is judgment-heavy, user needs control
- Scalability: Manual classification of 1000 stocks is not feasible

---

## Decision

V1 shall use **rules-first with manual override** approach:

1. **System generates suggestion:** Classification engine computes `suggested_code` using deterministic rules (RFC-001)
2. **System provides confidence:** Assign `confidence_level` (high/medium/low) based on data completeness and scoring ambiguity
3. **User reviews:** User sees both suggested code and confidence in inspection view
4. **User can override:** User sets `final_code` if they disagree with suggestion
5. **Preserve both values:** Database stores both `suggested_code` and `final_code`
6. **Operational code:** Valuation engine uses `active_code = final_code || suggested_code`

### Data Model Pattern (Multi-User)

**See ADR-007 for full multi-user architecture rationale.**

```sql
-- SHARED (System Suggestions) - Computed once, visible to all users
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,

  -- System-generated (never overwritten by user)
  suggested_bucket INT,
  suggested_earnings_quality CHAR(1),
  suggested_balance_sheet_quality CHAR(1),
  suggested_code VARCHAR(5), -- "4AA"
  confidence_level VARCHAR(10) CHECK (confidence_level IN ('high', 'medium', 'low')),
  reason_codes JSONB, -- ["revenue_growth_stalwart", "positive_fcf"]
  scores JSONB, -- {"bucket": {"3": 45, "4": 78}, "earnings": {"A": 85}}

  -- Metadata
  classification_last_computed_at TIMESTAMPTZ
  -- NOTE: No final_code here (moved to per-user table)
);

-- PER-USER (User Overrides) - Independent per user
CREATE TABLE user_classification_overrides (
  user_id UUID NOT NULL,
  ticker VARCHAR(10) NOT NULL,

  -- User's manual classification
  final_bucket INT,
  final_earnings_quality CHAR(1),
  final_balance_sheet_quality CHAR(1),
  final_code VARCHAR(5), -- "3AA"
  override_reason TEXT, -- "Actually a holding company, not elite compounder"
  overridden_at TIMESTAMPTZ,

  PRIMARY KEY (user_id, ticker)
);
```

### Operational Logic (Per-User)

```typescript
async function getActiveCodeForUser(
  ticker: string,
  userId: string
): Promise<string | null> {
  const result = await db.query(`
    SELECT COALESCE(uco.final_code, cs.suggested_code) AS active_code
    FROM classification_state cs
    LEFT JOIN user_classification_overrides uco
      ON cs.ticker = uco.ticker AND uco.user_id = $1
    WHERE cs.ticker = $2
  `, [userId, ticker]);

  return result.rows[0]?.active_code || null;
}
```

**Example:**
- System suggests: AAPL = 4AA
- User A overrides to: 3AA
- User B keeps system suggestion: 4AA
- Active code for User A: 3AA
- Active code for User B: 4AA

---

## Rationale

### Why Rules-First with Manual Override?

**1. Scalability**
- Cannot manually classify 1000 stocks from scratch
- System suggestions reduce manual work by ~90%
- User reviews only ambiguous cases or overrides incorrect suggestions

**2. User Trust**
- User retains final authority (critical for judgment-heavy framework)
- Can override when system misses context (e.g., "Actually a holding company")
- Preserves both system and user reasoning (audit trail)

**3. Framework Iteration**
- System suggestions improve over time (tune scoring rules)
- Can re-run classification engine and compare new suggestions to prior suggestions
- User overrides remain stable (don't get blown away by recompute)

**4. Transparency**
- User sees confidence level (high/medium/low)
- User sees reason codes (why system suggested this code)
- User sees scores (how close was bucket 3 vs 4?)
- Informed override decision

**5. Operationally Simple**
- Valuation engine doesn't care about suggested vs final
- Just uses `active_code = final_code || suggested_code`
- No complex branching logic

### Why NOT Fully Automated?

**Risks:**
- System will misclassify edge cases (holding companies, insurers, binary outcomes)
- User has no recourse if classification is wrong
- Incorrect classification → incorrect valuation thresholds → bad alerts
- User loses trust in system

**Framework is Judgment-Heavy:**
- Bucket boundaries are fuzzy (stalwart vs elite compounder)
- Quality grades require qualitative assessment (moat strength)
- Special cases require context (Berkshire = 3AA, not 4AA)

**V1 is Not ML-Based:**
- Rules-based system has known limitations
- Cannot learn from mistakes without user feedback
- User override IS the feedback mechanism

### Why NOT Fully Manual?

**Does Not Scale:**
- 1000 stocks × 3 dimensions (bucket, earnings quality, balance sheet quality)
- ~20 minutes per stock for deep analysis
- Total: 333 hours (8 weeks of full-time work)
- Not feasible for V1 timeline

**Defeats Monitoring Automation:**
- If user must classify everything manually, monitoring adds no value
- V1 goal: surface opportunities automatically, not create data entry burden

### Why NOT Confidence-Gated (Auto-Apply High Confidence)?

**Subtle but Important:**
- Auto-applying high-confidence suggestions removes user from loop
- User doesn't see classification reasoning
- Harder to build intuition for framework rules
- Risk: System becomes black box

**V1 Philosophy:**
- User should review suggestions (even high-confidence)
- Builds user understanding of framework
- User can spot systematic errors (e.g., "System always over-rates quality A")

**V2 Consideration:**
- After user trusts system (6+ months), add auto-apply for high-confidence
- Requires explicit user opt-in ("Trust high-confidence suggestions")

---

## Consequences

### Positive ✅

**Scalability:**
- System reduces manual work from 333 hours to ~10 hours (review ambiguous cases)
- User focuses on edge cases, not routine classifications

**User Control:**
- User retains final authority
- Can override any suggestion
- Override doesn't break system (valuation uses active_code)

**Transparency:**
- User sees system reasoning (scores, reason codes, confidence)
- User understands why system suggested specific code
- Informed override decisions

**Framework Evolution:**
- Can re-run classification engine after rule changes
- Compare new suggestions to old suggestions
- User overrides remain stable (preserved)

**Audit Trail:**
- Both system and user reasoning preserved
- Can answer: "Why was AAPL classified as 4AA?"
  - System suggested 4AA because [reason_codes]
  - User confirmed 4AA (no override)

**Simple Operational Model:**
- Valuation engine just uses `active_code`
- No special branching for "pending review" or "auto-applied"
- Clear semantics: final_code wins if present

### Negative ⚠️

**User Review Burden:**
- User must review all suggestions (even high-confidence)
- For 1000 stocks, ~10-20 hours of review work
- **Mitigation:** Confidence levels help prioritize (review low-confidence first)

**Override Maintenance:**
- User overrides must be revisited when fundamentals change
- E.g., AAPL overridden to 3AA, but growth accelerates → should be 4AA
- **Mitigation:** System flags when suggested_code changes (potential re-review trigger)

**Storage Overhead:**
- Storing both suggested and final codes doubles classification fields
- ~10 extra columns in classification_state
- **Mitigation:** Storage is cheap, transparency is valuable

**Initial Setup Time:**
- User must review 1000 stocks on first run
- Cannot skip review without risking incorrect classifications
- **Mitigation:** Prioritize by market cap (review largest stocks first)

---

## Alternatives Considered

### Alternative 1: Fully Automated (No Override)

**Approach:**
```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  code VARCHAR(5) NOT NULL, -- System-assigned, user cannot change
  confidence_level VARCHAR(10),
  classification_last_computed_at TIMESTAMPTZ
);
```

**Rejected Because:**
- ❌ User has no recourse for misclassifications
- ❌ Framework is judgment-heavy (edge cases require human input)
- ❌ User loses trust if system makes obvious mistakes
- ❌ No feedback mechanism to improve rules
- ✅ Would be appropriate for ML-based system with high accuracy

---

### Alternative 2: Fully Manual (No Automation)

**Approach:**
- System provides raw fundamentals
- User manually assigns bucket, earnings quality, balance sheet quality
- No system suggestions

**Rejected Because:**
- ❌ Does not scale to 1000 stocks (333 hours of manual work)
- ❌ Defeats monitoring automation goal
- ❌ User cannot leverage deterministic rules
- ✅ Would be appropriate for <50 stocks (manual portfolio)

---

### Alternative 3: Confidence-Gated (Auto-Apply High Confidence)

**Approach:**
```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  suggested_code VARCHAR(5),
  confidence_level VARCHAR(10),

  -- Auto-applied if confidence = 'high', requires review if 'low'
  active_code VARCHAR(5),
  user_reviewed BOOLEAN DEFAULT FALSE,
  review_required BOOLEAN AS (confidence_level IN ('medium', 'low'))
);
```

**Workflow:**
- High confidence (70%+ of stocks): Auto-apply `suggested_code` to `active_code`
- Medium/Low confidence (30%): Require user review before applying

**Rejected for V1 Because:**
- ❌ Removes user from loop for 70% of stocks
- ❌ User doesn't build intuition for framework rules
- ❌ Harder to spot systematic errors (e.g., quality always over-rated)
- ❌ Requires "pending review" state management (complexity)
- ✅ Could be added in V2 after user trusts system

---

### Alternative 4: Hybrid (Suggestion + Workflow States)

**Approach:**
```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  suggested_code VARCHAR(5),
  status VARCHAR(20) CHECK (status IN ('pending_review', 'user_confirmed', 'user_overridden')),
  active_code VARCHAR(5),
  -- etc.
);
```

**Workflow:**
- System generates suggestion, sets status = 'pending_review'
- User reviews:
  - Confirm suggestion: status = 'user_confirmed', active_code = suggested_code
  - Override: status = 'user_overridden', active_code = final_code
- Valuation engine only processes stocks where status != 'pending_review'

**Rejected Because:**
- ❌ Adds workflow state complexity
- ❌ Blocks valuation engine until user reviews (not suitable for V1 monitoring)
- ❌ What if user never reviews? Stocks stuck in 'pending_review'
- ✅ Would be appropriate for manual portfolio entry workflow (out of V1 scope)

---

## Implementation Notes

### Classification Engine Behavior

```typescript
async function classifyStock(ticker: string): Promise<void> {
  const fundamentals = await fetchFundamentals(ticker);
  const result = classificationEngine.classifyStock(fundamentals);

  // Always update suggested_code (never overwrite final_code)
  await db.query(`
    UPDATE classification_state
    SET suggested_bucket = $1,
        suggested_earnings_quality = $2,
        suggested_balance_sheet_quality = $3,
        suggested_code = $4,
        confidence_level = $5,
        reason_codes = $6,
        scores = $7,
        classification_last_computed_at = NOW()
    WHERE ticker = $8
  `, [
    result.suggested_bucket,
    result.suggested_earnings_quality,
    result.suggested_balance_sheet_quality,
    result.suggested_code,
    result.confidence_level,
    JSON.stringify(result.reason_codes),
    JSON.stringify(result.scores),
    ticker
  ]);

  // Note: final_code is NOT touched (preserved if user set it)
}
```

### User Override Workflow

```typescript
async function overrideClassification(
  ticker: string,
  final_code: string,
  override_reason: string,
  user: string
): Promise<void> {
  const [bucket, earnings, balanceSheet] = parseCode(final_code); // "3AA" → [3, 'A', 'A']

  await db.query(`
    UPDATE classification_state
    SET final_bucket = $1,
        final_earnings_quality = $2,
        final_balance_sheet_quality = $3,
        final_code = $4,
        override_reason = $5,
        overridden_at = NOW(),
        overridden_by = $6
    WHERE ticker = $7
  `, [bucket, earnings, balanceSheet, final_code, override_reason, user, ticker]);
}
```

### Active Code Retrieval

```typescript
function getActiveCode(state: ClassificationState): string | null {
  return state.final_code || state.suggested_code;
}

// Used by valuation engine
async function getStockForValuation(ticker: string): Promise<Stock> {
  const state = await db.query('SELECT * FROM classification_state WHERE ticker = $1', [ticker]);
  return {
    ticker,
    active_code: getActiveCode(state.rows[0]),
    confidence_level: state.rows[0].confidence_level
  };
}
```

### Suggested Code Change Detection

```typescript
// Flag for user review when suggested_code changes (potential re-review)
async function detectSuggestedCodeChange(ticker: string): Promise<boolean> {
  const current = await db.query(
    'SELECT suggested_code FROM classification_state WHERE ticker = $1',
    [ticker]
  );

  const prior = await db.query(
    'SELECT suggested_code FROM classification_history WHERE ticker = $1 ORDER BY effective_at DESC LIMIT 1',
    [ticker]
  );

  if (prior.rows.length === 0) return false; // First run

  return current.rows[0].suggested_code !== prior.rows[0].suggested_code;
}
```

---

## User Experience Implications

### Inspection View

**What User Sees:**
```
╔══════════════════════════════════════════════════════════╗
║ AAPL - Apple Inc.                                        ║
╠══════════════════════════════════════════════════════════╣
║ Classification:                                          ║
║   System Suggestion: 4AA (high confidence)               ║
║   Your Override: 3AA                                     ║
║   Active Code: 3AA (used for valuation)                  ║
║                                                          ║
║ Override Reason:                                         ║
║   "Mature business, growth slowing to stalwart range"   ║
║   Overridden on 2026-02-15 by user                      ║
║                                                          ║
║ System Reasoning:                                        ║
║   Bucket 4 Score: 78 (winner)                            ║
║   Bucket 3 Score: 65                                     ║
║   Reason: revenue_growth_elite_compounder                ║
║                                                          ║
║ [ Remove Override ] [ Update Override Reason ]           ║
╚══════════════════════════════════════════════════════════╝
```

**Key Elements:**
- Show both suggested and final codes
- Highlight which code is active (operational)
- Show override reason and timestamp
- Allow user to remove override (revert to suggestion)

---

## Migration Path

If V1 evolves toward confidence-gated automation (V2):

1. **Add user preference:** "Auto-apply high-confidence suggestions"
2. **Keep suggested/final pattern:** No schema changes
3. **Auto-populate final_code:** If confidence = 'high' and user preference enabled
4. **User can still override:** Manual override always wins

**Key:** Rules-first pattern supports evolution to confidence-gated without breaking changes.

---

## Related Decisions

- **RFC-001:** Defines classification scoring algorithm and confidence computation
- **RFC-002:** Defines classification_state schema with suggested/final fields
- **RFC-003:** Valuation engine uses `active_code = final_code || suggested_code`
- **ADR-003:** Full state snapshots preserve both suggested and final codes in history

---

## Notes

- User overrides are sticky (persist across recomputes)
- Suggested code updates on every classification engine run
- Valuation engine is agnostic to override status (just uses active_code)
- Confidence levels help prioritize review (low confidence first)

---

**END ADR-004**
