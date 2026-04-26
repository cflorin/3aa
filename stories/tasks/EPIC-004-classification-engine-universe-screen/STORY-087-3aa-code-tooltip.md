# STORY-087: 3AA Code Tooltip

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Status:** done
**Priority:** P2 — UX improvement; helps users decode the 3AA code at a glance without navigating away

---

## Background

The 3AA classification code (e.g. `"4AA"`) encodes three dimensions of a stock:
- **Bucket** (character 1): business archetype 1–8 (e.g. 4 = Elite compounder)
- **EQ grade** (character 2): Earnings Quality A/B/C (A = Elite, B = Good, C = Fragile)
- **BS grade** (character 3): Balance Sheet Quality A/B/C (A = Fortress, B = Sound, C = Fragile)

New users have no way to interpret the code without consulting documentation. STORY-087 adds a hover tooltip on the `ClassificationBadge` component that shows a plain-English breakdown of all three elements. Click behavior (opens classification modal) is unchanged.

---

## Acceptance Criteria

### AC-1: Tooltip shows on hover
Given a row with a 3AA code badge, when the user hovers over it, a tooltip appears with three lines:
- `B{n}: {bucket name}` — bucket archetype
- `EQ: {grade} — {EQ description}` — earnings quality grade
- `BS: {grade} — {BS description}` — balance sheet quality grade

### AC-2: All 8 bucket labels
Each bucket maps to its PRD-defined name:
- 1 → Decline / harvest
- 2 → Defensive cash machine
- 3 → Durable stalwart
- 4 → Elite compounder
- 5 → Operating leverage grower
- 6 → High-growth emerging
- 7 → Hypergrowth / venture-like
- 8 → Lottery / binary

### AC-3: All grade labels for EQ and BS
- EQ A → Elite earnings quality | B → Good earnings quality | C → Fragile earnings
- BS A → Fortress balance sheet | B → Sound balance sheet | C → Fragile balance sheet

### AC-4: Tooltip hides on mouse-out
The tooltip disappears when the cursor leaves the badge area.

### AC-5: Null code — no tooltip
When `code` is null, the `—` fallback renders as before with no tooltip or wrapper.

### AC-6: Click behavior unchanged
The `onClick` on the parent `<button>` in `StockTable.tsx` continues to open the classification modal. The tooltip div has `pointer-events: none` to ensure zero interference.

### AC-7: Partial code — graceful render
A code with fewer than 3 characters (e.g. `"3"`) shows only the parseable line(s) with no crash.

---

## Tasks

- [x] TASK-087-001: Add hover tooltip to `ClassificationBadge.tsx` (lookup maps + hover state + tooltip div)
- [x] TASK-087-002: Unit tests — `ClassificationBadge.test.tsx` extended with 8 tooltip tests
- [x] TASK-087-003: Story file, implementation log updated

---

## Files Changed

```
src/components/universe/ClassificationBadge.tsx         [MODIFIED — tooltip added]
tests/unit/components/ClassificationBadge.test.tsx      [MODIFIED — 8 tooltip tests added]
```

---

## Tooltip Content Reference

| Code element | Symbol | Tooltip label |
|---|---|---|
| Bucket 1 | B1 | Decline / harvest |
| Bucket 2 | B2 | Defensive cash machine |
| Bucket 3 | B3 | Durable stalwart |
| Bucket 4 | B4 | Elite compounder |
| Bucket 5 | B5 | Operating leverage grower |
| Bucket 6 | B6 | High-growth emerging |
| Bucket 7 | B7 | Hypergrowth / venture-like |
| Bucket 8 | B8 | Lottery / binary |
| EQ grade A | EQ: A | Elite earnings quality |
| EQ grade B | EQ: B | Good earnings quality |
| EQ grade C | EQ: C | Fragile earnings |
| BS grade A | BS: A | Fortress balance sheet |
| BS grade B | BS: B | Sound balance sheet |
| BS grade C | BS: C | Fragile balance sheet |
