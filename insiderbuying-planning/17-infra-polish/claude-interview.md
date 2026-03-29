# Interview Transcript: Unit 17 — Infrastructure Polish

*(Combined from two interview rounds — 2026-03-28/29)*

---

## Q1: SEO Tool Swap (A5) — Ahrefs + Google KP approach

**Question:** The spec mentions "Ahrefs Free API" and "Google KP" but research found: (a) no free Ahrefs API for production, endpoint in spec doesn't exist; (b) Google KP requires OAuth2 + MCC + developer token approval, and the new Explorer tier (Feb 2026) blocks KP entirely. How should the SEO swap be handled?

**Answer:** Research all free and low-cost (max €10/month) SEO keyword tools available in 2026 with API access. Compare Ubersuggest free, Keywords Everywhere ($10/10K credits), Serpstat free tier, Keyword Surfer free, WhatsMySERP free, and others. Requirements: must have API or automation endpoint, budget max €10/month, must provide KD + search volume. Recommend best option for a finance blog publishing 1.5 articles/day. If no single tool covers everything, propose a combo of free tools.

Google KP is dropped entirely — no credentials, no MCC account. Ubersuggest 3/day covers the top keywords; the rest uses DataForSEO as fallback (already cached).

**Implication:**
- Pending SEO tool research to determine primary KD + volume source
- DataForSEO kept as fallback for keywords it has cached
- Ubersuggest (3 free queries/day) for top-3 priority keywords only
- Google KP completely out of scope

---

## Q2: Hero Image Swap (A7) — fal.ai vs kie.ai

**Question:** The spec says remove kie.ai, but codebase shows generate-image.js already uses fal.ai Flux for hero images (not kie.ai). kie.ai was removed in a prior unit.

**Answer:** Yes — fal.ai is the current hero generator. Replace fal.ai Flux with Puppeteer Template 13.

**Implication:**
- Target: fal.ai Flux → visual-templates.js Template 13 (in new file)
- DoD grep for `KIEAI_API_KEY` will likely already pass
- DoD updated: check absence of fal.ai hero generation, replaced by Template 13
- Remove `FAL_KEY` env var reference from hero path (check if used elsewhere first)
- Template 13 reuses OG card HTML structure, adapted for hero layout (confirmed Q6)

---

## Q3: visual-templates.js — does it exist?

**Question:** visual-templates.js was not found in the codebase. Should it be created, or does it exist at a different path?

**Answer:** Create it fresh. Section 4 creates visual-templates.js with Template 13. Rendered by existing screenshot server at `host.docker.internal:3456`.

---

## Q4: Template 13 design — reuse OG card structure?

**Question:** The current OG card template in generate-image.js has a similar design (dark navy, ticker badge, verdict color). Should Template 13 reuse this structure?

**Answer:** Reuse OG card HTML structure — adapt for hero. Same dark navy + ticker badge + verdict color, different element sizing/positioning for hero use.

---

## Q5: Alpha Vantage Earnings Integration (D7.3)

**Question:** Does a working Alpha Vantage earnings fetcher exist from unit 09, or does content-calendar.js implement it from scratch?

**Answer:** Call existing helper from unit 09 — no duplication.

**Implication:**
- content-calendar.js imports from `dexter-research.js` (located via grep):
  - `fetchEarningsCalendar(nocoClient)` — fetches from Alpha Vantage, caches in NocoDB under `ticker='__all__', data_type='earnings_calendar'`, 1 API call/day max
  - `getNextEarningsDate(calendarMap, ticker)` — pure function, returns `calendarMap.get(ticker)?.reportDate ?? null`
- `ALPHA_VANTAGE_API_KEY` env var already defined (added in unit 09)
- No new Alpha Vantage HTTP calls in content-calendar.js

---

## Q6: NocoDB base ID for report-catalog.js

**Question:** Does report-catalog.js use the same NocoDB env vars as other insiderbuying workflows?

**Answer:** Yes — use existing `NOCODB_BASE_URL` + `NOCODB_API_TOKEN` env vars.

---

## Q7: RSS Competitor Monitoring — failure handling

**Question:** Should failing RSS feeds (404, parse error) silently skip or trigger Telegram alert?

**Answer:** Telegram alert on feed failure — notify when a feed is consistently failing (3+ consecutive failures). Log each individual failure to NocoDB in the meantime.

**Implication:**
- NocoDB `Competitor_Intel` table tracks per-feed consecutive failure count
- After 3 consecutive failures for a specific feed: send Telegram ops alert
- Single failure: log to NocoDB, continue with other feeds silently
- On success: reset consecutive failure count

---

## Q8: TF-IDF cosine similarity (D4.2)

**Question:** Implement fully in unit 17, or stub?

**Answer:** Implement fully — ~50 lines pure JS TF-IDF. Threshold 0.85. No npm packages.

---

## Q9: X Polling — n8n node spec level of detail

**Question:** Code-only with documented manual step, or full n8n node specification?

**Answer:** Full n8n node spec included in plan — specify the exact Expression node configuration and NocoDB X_State.polling_interval state write.

**Implication:**
- Implementation: 1-minute n8n cron loop (Code node)
  - Each tick: read `getCurrentPollingInterval(new Date())` → check X_State.last_run timestamp
  - If elapsed >= interval: run x-engagement logic, update X_State.last_run + polling_interval
  - If not: skip
- `getCurrentPollingInterval(now)` accepts injectable Date for testability
- X_State NocoDB table already exists from unit 08

---

## Q10: Sitemap deletion (A11)

**Question:** Is next-sitemap.config.js sufficient to replace sitemap.ts entirely?

**Answer:** Yes — next-sitemap crawls all routes automatically. sitemap.ts is redundant and safe to delete. Also check next.config.ts for conflicting sitemap settings.

---

## Q11: Report Catalog Telegram chat ID

**Question:** Which Telegram chat to use for the catalog summary message?

**Answer:** Same `TELEGRAM_CHAT_ID` env var used in all other insiderbuying workflow alerts.

---

## Q12: Reddit daily cap enforcement (A10)

**Question:** Verify only (doc check), or add runtime assertion?

**Answer:** Add runtime assertion — throw at startup if SUBREDDIT_TONE_MAP total daily limits exceed 10.

---

## Q13: EST timezone in getCurrentPollingInterval() tests

**Question:** How to handle timezone in tests?

**Answer:** Inject mock clock — `getCurrentPollingInterval(now)` accepts a date parameter. Tests pass specific Date objects for each time/day combination.

---

## Q14: Insider_Alerts table existence

*(From previous session — confirmed)*

The `Insider_Alerts` NocoDB table already exists from prior units. report-catalog.js queries it directly. If query returns 0 results: write empty catalog, send Telegram "Report catalog updated: 0 candidates". No guard for table-not-found needed.

---

## Summary of Key Decisions

| Decision | Choice |
|---|---|
| SEO tool (primary KD + volume) | Pending research — max €10/month, free tools preferred |
| Ahrefs | Not used (no paid plan) |
| Google KP | Dropped entirely |
| DataForSEO | Kept as fallback/cache layer |
| Ubersuggest | 3 free queries/day for top-3 keywords |
| Hero image | fal.ai Flux → Puppeteer Template 13 |
| visual-templates.js | Create new file with Template 13 |
| Template 13 design | Adapt OG card HTML structure |
| Alpha Vantage | Import from dexter-research.js (unit 09) |
| NocoDB credentials | Existing NOCODB_BASE_URL + NOCODB_API_TOKEN |
| Sitemap | Delete sitemap.ts, verify single sitemap.xml in build |
| RSS failures | Telegram after 3 consecutive per-feed failures |
| TF-IDF | Implement fully, ~50 lines pure JS, threshold 0.85 |
| X polling n8n spec | Full node spec with 1-min cron Code node |
| Reddit cap | Runtime assertion (throw if total > 10) |
| Telegram chat | Same TELEGRAM_CHAT_ID as other ops alerts |
| Test EST timezone | Injectable date parameter (getCurrentPollingInterval(now)) |
