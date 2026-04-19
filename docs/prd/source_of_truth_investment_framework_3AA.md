# 3AA Investment Classification and Monitoring Framework

## Purpose
This document formalizes a complete stock-classification, valuation-threshold, and monitoring framework for an independent investor who invests primarily in public equities, with a strong preference for quality businesses bought only at quantitatively attractive prices.

This framework is designed to be self-contained and usable by an external system such as Claude Code / Claude Cowork without any prior context from the original conversation.

The framework has five objectives:
1. Classify businesses by **earnings state and earnings-growth structure**, not by story alone.
2. Separate **earnings quality** from **balance-sheet quality**.
3. Link each class of stock to an appropriate **valuation metric**.
4. Define practical **entry thresholds**: `max`, `comfortable`, `very good`, and `steal`.
5. Support a rules-based monitoring system that can surface actionable opportunities.

---

## Core philosophy behind the framework

### 1. Opportunity must be quantitative
A stock is not an investment opportunity merely because it is down, popular, high-quality, or exciting. It is an opportunity only when the expected return clears a defined hurdle for its business type.

### 2. Stocks are different species
Different types of businesses require different valuation metrics, different hurdle rates, and different entry styles. A Microsoft-type business should not be evaluated like Figma, Amazon, Berkshire, tobacco, or a biotech lottery ticket.

### 3. Temporary volatility and permanent impairment are different
The framework distinguishes sharply between:
- temporary volatility in elite businesses, which can create alpha, and
- permanent capital impairment, which must be avoided.

### 4. Macro, business trend, and short-term fluctuations are separate layers
This framework is not designed for reacting to daily price fluctuations. It is designed for medium-term investing where:
- macro shapes aggression and portfolio construction,
- stock-level business quality shapes selection,
- technical stabilization shapes execution.

### 5. Binary decisions are usually wrong
The market is too noisy for all-or-nothing behaviour. The framework is meant to support probability-weighted deployment, staging, and sizing rather than heroic precision.

---

## The 3AA structure
Each investable name is described using a 3-part code:

**[Bucket][Earnings Quality][Balance Sheet Quality]**

Examples:
- **3AA** = durable stalwart, elite earnings quality, fortress balance sheet
- **4AA** = elite compounder, elite earnings quality, fortress balance sheet
- **4BA** = high-quality compounder, but lower earnings durability than 4AA, with fortress balance sheet
- **5BB** = operating-leverage grower with good-but-not-elite earnings quality and a merely sound balance sheet
- **6BA** = high-growth emerging compounder with good earnings quality and a fortress balance sheet

The three layers mean:
1. **Bucket** = business stage and earnings-growth structure
2. **First letter** = earnings quality / durability / moat quality
3. **Second letter** = balance-sheet resilience and financing quality

---

# Part I. Bucket system

## Important interpretation note
The buckets are **not** a simple risk ranking from safe to dangerous.

They are best understood as a **business-stage and earnings-structure taxonomy**:
- low-growth / mature / declining at the low-number end,
- durable compounders in the middle,
- increasingly speculative growth and optionality toward the high-number end.

Different buckets can have different kinds of risk:
- Bucket 1 can have terminal decline risk,
- Bucket 2 can be low volatility but low growth,
- Bucket 6 or 7 can have much higher execution risk and valuation risk,
- Bucket 8 is pure speculation.

So bucket number is not a pure volatility scale. It is a framework for understanding what kind of business and earnings engine is being analyzed.

---

## Bucket 1 - Decline / harvest
**Definition:** shrinking or structurally impaired business where the main question is harvesting value, not growth.

**Typical features**
- Revenue growth: approximately **-10% to +2%**
- EPS growth: **negative to flat**
- Reinvestment opportunities: weak
- Payout may be high
- Main thesis: liquidation value, asset harvest, income extraction, or deep mispricing

**Examples**
- coal
- structurally declining legacy assets

**How to invest**
- only at deep discount
- usually not a core hunting ground
- only if valuation is extremely attractive and downside is controlled

**Base TSR hurdle**
- **14-16%+**, or avoid

---

## Bucket 2 - Defensive cash machine
**Definition:** flat to low-growth business, highly cash-generative, often recession-resistant, with limited reinvestment runway.

**Typical features**
- Revenue growth: **0-4%**
- EPS growth: **0-6%**
- Free cash flow conversion: usually high
- Margins: stable
- Low dependence on market excitement

**Examples**
- tobacco
- mature payments / ATM-type networks
- some mature regulated assets

**How to invest**
- valuation matters a lot
- often income + mild compounding
- opportunity usually comes after dislocation, not through enthusiasm

**Base TSR hurdle**
- **10-11%**

---

## Bucket 3 - Durable stalwart
**Definition:** blue-chip compounder with durable moderate earnings growth over a long period.

**Typical features**
- Revenue growth: **3-8%**
- EPS growth: **6-10%**
- Strong free cash flow
- Low impairment risk
- Good but not explosive growth

**Examples**
- Berkshire Hathaway
- UnitedHealth (depending on regulatory view)

**How to invest**
- buy after real dislocation
- usually stage entry
- suitable for multi-year holds if valuation remains sensible

**Base TSR hurdle**
- **11-12%**

---

## Bucket 4 - Elite compounder
**Definition:** very high-quality business compounding earnings at mid-teens with exceptional durability.

**Typical features**
- Revenue growth: **8-15%**
- EPS growth: **12-18%**
- High free cash flow conversion
- Elite moat quality
- Rare discount windows
- Mispricings tend to be brief

**Examples**
- Microsoft
- Google, depending on view of Search durability and AI disruption risk

**How to invest**
- valuation still matters; never pay any price
- quality deserves a premium versus lower-quality businesses
- some execution imperfection is acceptable in truly rare windows

**Base TSR hurdle**
- **12-13%**
- for true **4AA**, around **12%** is enough

---

## Bucket 5 - Operating leverage grower
**Definition:** business where a large part of the earnings thesis comes from operating leverage on top of decent topline growth.

**Typical features**
- Revenue growth: **10-20%**
- Gross profit growth: often **15-25%+**
- EPS growth: often **mid-teens to 30%**, but less stable
- Operating margin still expanding materially
- Key question: **pre- or post-operating leverage phase?**

**Examples**
- Amazon
- Uber, depending on conviction and cyclicality

**How to invest**
- more tactical than Bucket 4
- stronger confirmation needed
- smaller starting size
- trend matters more because failed operating leverage narratives can rerate brutally

**Base TSR hurdle**
- **14-16%**

---

## Bucket 6 - High-growth emerging compounder
**Definition:** high topline growth, lower current profit base, substantial future earnings optionality.

**Typical features**
- Revenue growth: **20-35%+**
- EPS / net income: low, emerging, inconsistent, or not yet mature
- FCF: breakeven to improving
- Future value depends on scaling into durable earnings power

**Examples**
- AMD
- Figma

**How to invest**
- very high hurdle
- small starting size
- respect trend and execution risk much more than in Buckets 3-4
- do not average down lazily just because a stock is red

**Base TSR hurdle**
- **18-20%+**

---

## Bucket 7 - Hypergrowth / venture-like
**Definition:** extreme topline growth, little earnings anchor, valuation mostly driven by future optionality.

**Typical features**
- Revenue growth: **40-100%+**
- Earnings: negligible or negative
- External capital or strategic optionality matters heavily
- The thesis is highly sensitive to future assumptions

**Examples**
- Anthropic-type private assets

**How to invest**
- not suitable as a core public-market allocation style
- only if the optionality is deeply understood

**Base TSR hurdle**
- **25%+**

---

## Bucket 8 - Lottery / binary
**Definition:** highly binary outcome business where a standard earnings framework is not appropriate.

**Typical features**
- stable earnings framework largely useless
- value depends on a few key events or approvals
- capital loss risk is very high

**Examples**
- speculative biotech

**How to invest**
- tiny size only
- speculative sleeve only
- not part of the core compounding framework

**Base TSR hurdle**
- no normal hurdle; this is speculation

---

# Part II. Earnings Quality grade
This is the **first letter**.

It answers:
**How durable, trustworthy, and defensible are the earnings and the earnings growth?**

## A - Elite earnings quality
**Characteristics**
- strong moat / near-irreplaceable product / mission-critical workflow / regulatory monopoly
- visible pricing power
- recurring or deeply embedded revenue
- low customer churn risk
- long runway for durable growth
- margins stable or improving
- earnings not overly dependent on a narrow temporary factor

**Typical markers**
- free cash flow conversion usually **>80%**
- gross margin stable or rising over time
- ROIC usually high
- growth durability visible across a cycle

**Examples**
- Microsoft
- Berkshire
- dominant workflow software or natural monopoly assets

---

## B - Good earnings quality
**Characteristics**
- real business, real earnings, good franchise
- but more cyclical, more competitive, more execution-sensitive, or less irreplaceable than A
- good durability, not elite durability
- some skepticism is structurally justified

**Typical markers**
- free cash flow conversion approximately **50-80%**
- margins can wobble more
- growth may be more vulnerable to cycle or competition

**Examples**
- Adobe
- Google if one applies a durability haircut to Search
- Uber if the model is believed but not with full confidence

---

## C - Fragile / lower-quality earnings
**Characteristics**
- weak moat
- commodity or narrative-sensitive
- earnings rely heavily on favorable conditions rather than durable strength
- execution dependence is high
- long-term durability confidence is weak

**Typical markers**
- free cash flow weak or inconsistent
- margin volatility high
- earnings revision risk high

**Examples**
- many speculative growers
- marginal cyclicals
- story stocks

---

# Part III. Balance Sheet Quality grade
This is the **second letter**.

It answers:
**Can the business survive stress, self-fund, and exploit downturns?**

## A - Fortress
**Characteristics**
- net cash or very low leverage
- no meaningful refinancing dependence
- large liquidity buffer
- dilution unlikely
- can continue to invest through a downturn

**Typical markers**
- Net debt / EBITDA: **<1x** or net cash
- Interest coverage: **>12x**
- Liquidity runway: **2+ years**
- Share count flat/down; no habitual dilution

**Examples**
- Microsoft
- Berkshire
- many elite mega-cap platform businesses

---

## B - Sound
**Characteristics**
- leverage manageable
- balance sheet not a problem, but not fortress-level
- can handle stress but has less optionality than A

**Typical markers**
- Net debt / EBITDA: **1-2.5x**
- Interest coverage: **5-12x**
- refinancing needs manageable
- dilution limited

---

## C - Fragile
**Characteristics**
- meaningful leverage
- refinancing matters
- dilution or capital raises possible
- downturn can materially damage the equity story

**Typical markers**
- Net debt / EBITDA: **>2.5x**
- Interest coverage: **<5x**
- liquidity tight
- share count rising materially

**Examples**
- leveraged cyclicals
- speculative growers needing external capital

---

# Part IV. How the code is used in practice

## Example mappings
- **3AA** - durable stalwart, elite earnings quality, fortress balance sheet: **Berkshire Hathaway**
- **4AA** - elite compounder, elite earnings quality, fortress balance sheet: **Microsoft**
- **4BA** - strong compounder, but lower durability than 4AA, fortress balance sheet: **Adobe**
- **5BA** - operating leverage grower, good earnings quality, fortress balance sheet: **Amazon**
- **5BB / 5BC** - operating leverage grower, moderate quality, sound or fragile balance sheet: **Uber**, depending on conviction
- **6BA** - high-growth emerging compounder, good earnings quality, fortress balance sheet: **AMD**
- **6AA** - high-growth emerging compounder, elite product adoption plus fortress balance sheet: **Figma**, if that remains the view
- **7?** - hypergrowth venture-like optionality: **Anthropic**
- **8C** - lottery / binary: speculative biotech-style names

---

# Part V. Entry style by bucket

## Buckets 1-2
- valuation must be clearly attractive
- no paying up for story
- often income / defensive sleeve logic
- small or moderate sizing

## Bucket 3
- buy after structural dislocation
- require at least minimal stabilization
- staged entry
- comfortable holding through noise if thesis intact

## Bucket 4
- rare windows matter
- valuation still matters, but elite quality allows some execution imperfection
- can start earlier than in weaker buckets
- do not chase vertical moves with full size

## Bucket 5
- stronger confirmation needed
- operating leverage can disappoint
- start smaller
- trend matters more
- more sensitive to broken tape

## Bucket 6
- very high hurdle
- small start, slower scale
- need business insight plus market confirmation
- do not average down just because it is red

## Buckets 7-8
- not core positions
- speculative sleeve only
- tiny size
- separate mental accounting from the core portfolio

---

# Part VI. TSR hurdle grid

## Base hurdle by bucket
| Bucket | Base TSR hurdle |
|---|---:|
| Bucket 1 | 14-16%+ |
| Bucket 2 | 10-11% |
| Bucket 3 | 11-12% |
| Bucket 4 | 12-13% |
| Bucket 5 | 14-16% |
| Bucket 6 | 18-20%+ |
| Bucket 7 | 25%+ |
| Bucket 8 | No normal hurdle; speculation only |

## Adjustments by quality grade
### Earnings quality adjustment
- **A:** reduce hurdle by approximately **1%**
- **B:** no change
- **C:** add approximately **2-3%**

### Balance sheet adjustment
- **A:** no change, or reduce by approximately **0.5%**
- **B:** no change
- **C:** add approximately **1.5-2%**

## Worked examples
- **4AA Microsoft** -> base 12-13%, minus quality/balance-sheet adjustment -> approximately **12%**
- **4BA Adobe** -> base 12-13%, no quality reduction, strong balance sheet -> approximately **13-14%**
- **3AA Berkshire** -> base 11-12%, adjusted for fortress profile -> approximately **10.5-11.5%**
- **5BB Uber** -> base 14-16%, likely no reduction -> approximately **15-16%**
- **6BA AMD** -> base 18-20%, slight help from strong balance sheet -> approximately **17.5-19.5%**

---

# Part VII. Valuation metric by bucket

## Metric selection rules
- **Buckets 1-4:** use **forward P/E**
- **Exception:** **3AA Berkshire-type / holding-company / insurer-type stalwarts** -> use **forward operating earnings ex excess cash**
- **Bucket 5:** use **forward EV/EBIT** if the business is post-operating-leverage enough for EBIT to be meaningful; if still clearly pre-leverage, use **EV/Sales**
- **Buckets 6-7:** use **EV/Sales**
- **Bucket 8:** no normal multiple; speculation only

## Why the metric changes
The metric must reflect the business reality:
- Mature earnings-rich companies should be assessed on earnings.
- Berkshire-type businesses should be normalized for excess cash.
- Operating-leverage names need EBIT or Sales depending on maturity of profit structure.
- Early high-growth names often cannot be sensibly judged on P/E.

---

# Part VIII. Core live anchors already defined
These are the anchor valuation levels explicitly established in prior analysis and used to derive the broader proxy system.

## 3AA - Berkshire-type stalwart, fortress balance sheet
**Primary metric:** forward operating earnings ex excess cash
- **Max:** **18.5x**
- **Comfortable:** **17.0x**
- **Very good:** **15.5x**
- **Steal:** **14.0x**

## 4AA - Elite compounder, rare misprint
**Primary metric:** forward P/E
- **Max:** **22.0x**
- **Comfortable:** **20.0x**
- **Very good:** **18.0x**
- **Steal:** **16.0x**

## 4BA - High-quality but lower-durability compounder
**Primary metric:** forward P/E
- **Max:** **14.5x**
- **Comfortable:** **13.0x**
- **Very good:** **11.5x**
- **Steal:** **10.0x**

Interpretation:
- Microsoft receives the highest comfort multiple because of elite quality, moat, balance sheet, and rarity of true discount windows.
- Berkshire sits between Microsoft and Adobe: lower growth than Microsoft, but exceptional resilience and anti-cyclical stability.
- Adobe receives a large discount versus Microsoft because of lower durability / lower moat confidence and because market pessimism can be structurally harsher.

---

# Part IX. Proxy valuation grid for monitoring
This is the practical table to power a monitoring tool.

## Profitable / earnings-anchored buckets
| Code | Archetype | Primary metric | Max | Comfortable | Very good | Steal |
|---|---|---|---:|---:|---:|---:|
| 1AA | Decline/harvest, unusually strong asset/BS | Fwd P/E | 10.0x | 8.5x | 7.0x | 5.5x |
| 1BA | Decline/harvest, decent business but not elite | Fwd P/E | 8.5x | 7.0x | 5.5x | 4.0x |
| 2AA | Defensive cash machine, superb quality | Fwd P/E | 16.0x | 14.0x | 12.5x | 11.0x |
| 2BA | Defensive cash machine, good not elite | Fwd P/E | 13.5x | 12.0x | 10.5x | 9.0x |
| 3AA | Durable stalwart, fortress | Fwd op earnings ex excess cash | 18.5x | 17.0x | 15.5x | 14.0x |
| 3BA | Durable stalwart, good not elite | Fwd P/E | 15.0x | 13.5x | 12.0x | 10.5x |
| 4AA | Elite compounder | Fwd P/E | 22.0x | 20.0x | 18.0x | 16.0x |
| 4BA | Strong compounder, lower durability / market more skeptical | Fwd P/E | 14.5x | 13.0x | 11.5x | 10.0x |

## Operating leverage / transition growers
| Code | Archetype | Primary metric | Max | Comfortable | Very good | Steal |
|---|---|---|---:|---:|---:|---:|
| 5AA | Operating leverage grower, elite quality/BS | Fwd EV/EBIT | 20.0x | 17.0x | 14.5x | 12.0x |
| 5BA | Operating leverage grower, good quality | Fwd EV/EBIT | 17.0x | 15.0x | 13.0x | 11.0x |
| 5BB | Same, but less resilient | Fwd EV/EBIT | 15.0x | 13.0x | 11.0x | 9.0x |

## High-growth / low-profit buckets
| Code | Archetype | Primary metric | Max | Comfortable | Very good | Steal |
|---|---|---|---:|---:|---:|---:|
| 6AA | High-growth emerging compounder, elite product + fortress BS | EV/Sales | 12.0x | 10.0x | 8.0x | 6.0x |
| 6BA | High-growth, good quality | EV/Sales | 9.0x | 7.0x | 5.5x | 4.0x |
| 6BB | High-growth but more fragile | EV/Sales | 7.0x | 5.5x | 4.5x | 3.0x |
| 7AA | Hypergrowth, elite optionality | EV/Sales | 18.0x | 15.0x | 11.0x | 8.0x |
| 7BA | Hypergrowth, good not elite | EV/Sales | 14.0x | 11.0x | 8.5x | 6.0x |
| 8X | Lottery / binary | No stable metric | n/a | n/a | n/a | n/a |

---

# Part X. Mechanical rules for missing C-cases
The full matrix does not need to explicitly list every possible C-case to be usable.
These can be derived mechanically.

## For P/E buckets (1-4)
- Earnings quality **A -> B**: subtract approximately **2-3 turns**
- Balance sheet **A -> B**: subtract approximately **1 turn**
- Any **C** on either axis: subtract another approximately **2 turns**, and usually flag as speculative / avoid for core

## For EV/EBIT bucket 5
- Earnings quality **A -> B**: subtract approximately **2 turns**
- Balance sheet **A -> B**: subtract approximately **1-1.5 turns**
- Any **C**: subtract another approximately **2 turns**

## For EV/Sales buckets 6-7
- Earnings quality **A -> B**: subtract approximately **2.0x sales**
- Balance sheet **A -> B**: subtract approximately **1.0x sales**
- Any **C**: subtract another approximately **1.5-2.0x sales**

Purpose:
This avoids false precision while still making the framework fully expandable.

---

# Part XI. Important metric adjustments and overrides

## 1. Gross margin adjustment for EV/Sales names
For Buckets 6-7:
- Gross margin **>80%** -> can justify **+1.0x sales**
- Gross margin **60-80%** -> no change
- Gross margin **<60%** -> subtract approximately **1.0-2.0x sales**

## 2. Cyclicality adjustment
If earnings are cyclically inflated:
- use **mid-cycle** earnings
- do not anchor on spot EPS or peak margins

## 3. Dilution / SBC adjustment
For Buckets 5-7:
- if dilution is material, haircut valuation by approximately **1 turn P/E / EV-EBIT** or approximately **1.0x sales**

## 4. Market pessimism override
Some businesses may trade below their quality-adjusted fair zone because the market is especially pessimistic.
Adobe is the key example from the discussion:
- its comfort level can already look cheap, not just neutral,
- because market skepticism is unusually strong.

The monitoring system should allow two separate interpretations:
- **cheap because structurally lower quality**, versus
- **cheap because market is unusually pessimistic**.

This distinction matters.

---

# Part XII. How to interpret the four threshold levels
Each code has four valuation zones.

## 1. Max
Upper bound for a final increment. Not cheap. Acceptable only when:
- quality is high,
- the opportunity is still valid,
- and a rare window may be closing.

## 2. Comfortable
Core build zone. The investor should be comfortable building the position here.
This is not necessarily a bargain, but it is a proper opportunity.

## 3. Very good
At this level, the investor should lean in more confidently.
The gap between price and fair value is meaningfully attractive.

## 4. Steal
Gift zone / panic pricing / rare dislocation.
This is the level where the market is likely offering unusually asymmetric upside if the thesis remains intact.

Important note:
This threshold grid is **not** a full fair-value model.
It is a **decision architecture** to support monitoring, alerting, and staged deployment.

---

# Part XIII. Monitoring-tool implementation guidance

## Minimal schema
A monitoring tool using this framework should track at least:
- `ticker`
- `company_name`
- `bucket_code` (e.g. 4AA)
- `primary_metric` (Fwd P/E, Fwd EV/EBIT, EV/Sales, Fwd op earnings ex excess cash)
- `current_multiple`
- `max_threshold`
- `comfortable_threshold`
- `very_good_threshold`
- `steal_threshold`
- `base_tsr_hurdle`
- `adjusted_tsr_hurdle`
- `notes`

## Recommended output columns
| ticker | company | code | primary metric | current multiple | max | comfortable | very good | steal | TSR hurdle | note |

## Optional advanced fields
- gross margin
- FCF margin
- dilution / SBC trend
- net debt / EBITDA
- interest coverage
- cyclicality flag
- market-pessimism flag
- moat notes
- key dislocation notes

---

# Part XIV. High-level investment rules that sit around the framework
These rules were part of the underlying philosophy and are important context for any system using this framework.

## Meta-market rules
1. Market behaviour contains too much randomness for binary decisions. Everything should be treated as a probability distribution updated in real time.
2. Permanent capital impairment matters much more than temporary volatility in elite cash-generative businesses.
3. Macro, stock-level medium/long-term trend, and short-term fluctuations are different things. Always know what is actually being traded.

## Portfolio-construction rules
1. Portfolio construction is the primary tool for managing macro, geopolitical, and sector risk.
2. The first job of the portfolio is to keep losses inside true personal tolerance.
3. The second job is diversification across asset classes and risk exposures of interest.

## Stock-picking and entry rules
1. Classify first; each stock type requires its own approach.
2. Never invest unless the price is a real quantitative opportunity.
3. In quality businesses, opportunity usually comes after structural dislocation.
4. Drawdowns can last months or years; low can go lower for a long time.
5. Enter only when there is opportunity and the stock is no longer clearly a falling knife, with at least minimal confirmation.
6. Sizing and staging are the key tools for managing risk.
7. Use passive investing as the baseline comparator; active investing must clear a sufficient hurdle above that.
8. Trend means different things in different buckets.
9. Do not demand perfect timing.
10. Technicals are permission, not prophecy.
11. Rare elite-quality names may justify limited execution imperfection.
12. Temporary hedges can be used as deployment bridges during uncertain periods.
13. Emotion must not be allowed to redefine the framework in real time.

---

# Part XV. Summary of the framework in one page
- Use **bucket classification** to identify the business stage and earnings-growth structure.
- Use **earnings quality** and **balance-sheet quality** to refine the classification.
- Use the appropriate valuation metric by bucket.
- Use the four-level threshold grid (`max`, `comfortable`, `very good`, `steal`) to monitor opportunity.
- Use the TSR hurdle grid to ensure opportunities are quantitatively attractive relative to passive alternatives and risk.
- Use technical stabilization and staging for execution.
- Use portfolio construction and, when necessary, temporary hedges to control macro and behavioural risk.
- Treat the framework as a **decision architecture**, not as a substitute for judgment.

---

# Final practical interpretation
The core idea is simple:

**Same growth does not deserve the same multiple.**

A fuller multiple is justified only when:
- growth is more durable,
- moat is stronger,
- the balance sheet is better,
- permanent impairment risk is lower,
- and true discount windows are rarer.

That is why:
- Microsoft deserves a fuller price than Adobe,
- Berkshire deserves a middle multiple despite lower growth,
- Amazon/Uber-type names need stronger proof and higher hurdles,
- and Figma/AMD-type names require EV/Sales-style monitoring and much more caution.

This document should be used as a starting operating manual for building a monitoring tool, not as a final substitute for business analysis.
