# Interview Transcript — 12-scoring-analysis

## Q1: Score Range

**Q:** The spec uses a 1-10 score range with base 5. Should we stick with 1-10 as specified, or use a wider 0-100 range internally for finer granularity?

**A:** 1-10 as in spec. Simple, human-readable. Matches what users see on the alerts page.

---

## Q2: Data Source — Missing Fields

**Q:** The spec references enriched fields like `marketCapUsd`, `historicalAvgReturn`, `clusterCount7Days` from the filing object. These come from unit 09 (data-pipeline). How should we handle missing fields?

**A:** Both — graceful now, strict later. Null checks and defaults for initial deployment. Add strict validation (throw errors) once unit 09 is stable.

---

## Q3: AI Fallback — DeepSeek Down

**Q:** When DeepSeek is down or returns garbage for the AI refinement (+/-1 adjustment), what should happen?

**A:** Retry once with 2s backoff. If still fails, `final_score = base_score`. Log the failure.

---

## Q4: Calibration + Critical Spec Update

**Q:** The weekly calibration detects score distribution drift and sends a Telegram alert. Who handles this and what action do they take?

**A:** Informational only. Telegram alert with weekly stats and PSI score. Human reviews and manually adjusts formula.

**Important spec update delivered in this answer:**

The `/alerts` page on earlyinsider.com already shows both BUY and SELL alerts. The spec has been updated with the following changes:

- **Sales (S transactions) are scored** — same `computeBaseScore()` formula applies. Score represents conviction of the sell signal (high score = significant insider sale).
- **`direction` field** (`A` = acquisition, `D` = disposal) must be passed through to the NocoDB alert record so the frontend displays BUY/SELL correctly.
- **AI analysis prompt must be direction-aware** — for sells, tone changes: "CFO sold $3M — tax-minimization plan or bearish signal?" instead of bullish framing.
- **Only G (gift) and F (tax withholding) are excluded** — NOT sales.
- **Volume is 30-100/day** — because both buys and sells are processed.
- **`filterScorable()` in edgar-parser should only exclude G and F**, not S.

---

## Q5: API Helpers — Finnhub Functions

**Q:** `analyze-alert.js` calls `getQuote()` and `getNextEarningsDate()`. Should these be in a shared file or inline in `analyze-alert.js`?

**A:** Create a shared `finnhub-client.js`. Reusable module — other units (newsletter, articles) can also use it. Lives in `n8n/code/insiderbuying/`.

---

## Q6: Same-Day Sell Detection

**Q:** `detectSameDaySell()` needs to check if an option exercise (transaction type M) was accompanied by a same-day sale. Where does this data come from?

**A:** Query NocoDB — same insider + same date. `score-alert.js` interrogates the NocoDB alerts table to find correlated transactions.

---

## Q7: Validation Failure Fallback

**Q:** If analysis validation fails on both attempts (DeepSeek returns banned phrases twice), what do we deliver?

**A:** Minimal template fallback: `"[INSIDER] [bought/sold] [SHARES] at $[PRICE]. Score: [X]/10."` — short, safe, always valid.

---

## Q8: Volume

**Q:** Now that we process both BUY and SELL alerts — what daily volume should we design for?

**A:** 50/day baseline, configurable. Use `MAX_ALERTS_PER_DAY` env var so it's easy to raise.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Score range | 1-10 integer, clamped |
| Missing fields | Graceful now (nulls/defaults), strict later |
| DeepSeek failure | 1 retry → base score fallback |
| Calibration | Informational Telegram alert, human action |
| BUY + SELL | Both scored. `direction` field stored. Direction-aware prompts. |
| Excluded types | G (gift) and F (tax withholding) only. Sales scored. |
| API helpers | Shared `finnhub-client.js` |
| Same-day sell | NocoDB query for same insider + same date |
| Validation fail | Minimal template fallback |
| Volume baseline | 50/day via `MAX_ALERTS_PER_DAY` env var |
