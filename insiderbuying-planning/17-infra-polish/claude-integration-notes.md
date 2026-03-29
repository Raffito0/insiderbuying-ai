# Integration Notes: External Review Feedback

## Integrating

### 1. NocoDB Table Auto-Creation Is Wrong (Both reviewers — HIGH)
The plan incorrectly stated "NocoDB creates the table automatically on first POST." This is false. NocoDB Data API returns 404 on POST to a non-existent table.
**Fix:** Replace with explicit instruction: tables must be manually created in NocoDB UI before code runs. Plan now includes a "Pre-flight: Create NocoDB tables" step in Section 6.

### 2. X Polling Race Condition — Update last_run BEFORE engagement (Both — HIGH)
The plan had last_run updated at the END of the workflow. If engagement takes 3+ minutes, the next 1-minute tick would trigger again, read stale last_run, and launch parallel engagement.
**Fix:** Update `X_State.last_run = Date.now()` immediately after bypassing the skip check, BEFORE calling engagement logic. Also add a recommendation to set the n8n workflow to "Single execution mode" (n8n 1.8+ feature) to prevent overlapping runs as a belt-and-suspenders.

### 3. RSS XML Parsing — Use fast-xml-parser, Not Regex (Both — HIGH)
Regex for XML parsing is brittle: CDATA blocks, HTML entities, namespace variants all break naive regex. `fast-xml-parser` (17 kB, MIT) is available in n8n Code nodes.
**Fix:** Plan updated to use `fast-xml-parser` instead of regex. Document that n8n's `NODE_FUNCTION_ALLOW_BUILTIN=*` + npm module access must be enabled (already required from prior units).

### 4. Report Catalog Deduplication (Both — HIGH)
W17 runs twice a week over a 30-day window. Without deduplication, the same ticker would accumulate multiple `pending` Report_Catalog entries.
**Fix:** Add a pre-flight step to W17: query Report_Catalog for last 30 days and extract existing tickers/sectors. Filter these out from the Insider_Alerts candidate array before any scoring passes.

### 5. DST-Safe EST Conversion (Both — MEDIUM)
Manual UTC-5/UTC-4 offset calculation is fragile around DST switch dates.
**Fix:** Use `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(date)` for safe EST/EDT conversion.

### 6. Bundle Pass Heuristic — Define Concrete Algorithm (Gemini — MEDIUM)
"Complementary narratives" is too vague for an implementer. Need a programmatic rule.
**Fix:** Define bundle heuristic: same sector AND different market_cap_tier (one >= $10B, one < $10B) AND both score >= 8. Cap at 5 bundle candidates. If no complementary pairs found, skip bundle section entirely (0 bundles in Telegram message).

### 7. Sector String Normalization (OpenAI — MEDIUM)
Insider_Alerts `sector` field may have inconsistent strings ("Tech", "Technology", "Information Technology").
**Fix:** Before grouping by sector in Pass 2, normalize via a `normalizeSector(s)` lookup table mapping known variants to canonical names.

### 8. Telegram Summary Bug — Recompute N After Insert (OpenAI — MEDIUM)
The summary message said "5 single, 1 sector, 1 bundle" hardcoded, but if < 5 candidates exist, counts would be wrong.
**Fix:** Count actual inserted records per type and use those counts in the Telegram message.

### 9. Sitemap 301 Redirect (OpenAI — MEDIUM)
Deleting `sitemap.ts` will 404 any existing links that Google crawled at `/sitemap`.
**Fix:** Add a redirect in `next.config.ts`: `{ source: '/sitemap', destination: '/sitemap.xml', permanent: true }`.

### 10. Ubersuggest Quota Guard — NocoDB Only, Not In-Memory (Gemini — MEDIUM)
In-memory counter doesn't persist across n8n executions. Also: gracefully return `{exactVolume: null}` when quota is exhausted, so Ahrefs data still completes.
**Fix:** Store daily counter in NocoDB (`{ date: 'YYYY-MM-DD', count: int }` in a `SEO_State` row). On quota reached or 429: log, return `{exactVolume: null}`, continue.

### 11. Template 13 Existence Guard (OpenAI — MEDIUM)
If visual-templates.js ships without Template 13, generate-image.js will throw at runtime with no helpful error.
**Fix:** Add guard: `if (!templates.exists || !templates.exists(13)) throw new Error('Template 13 not found in visual-templates.js — add it before deploying A7')`.

### 12. Alpha Vantage Rate Limit — Add Delay (Gemini — MEDIUM)
Alpha Vantage free tier: 5 calls/min. D7.3 loops through tickers for earnings cross-reference. Without a delay, calls will 429.
**Fix:** Add 12-second delay between Alpha Vantage calls in the earnings calendar loop.

### 13. Ticker Extraction Whitelist for RSS (OpenAI — LOW)
Naive regex for tickers (e.g., `/\b[A-Z]{1,5}\b/`) will match common words ("CAT", "AI", "IT").
**Fix:** Add word-boundary regex with length constraint (2–5 chars, all caps, not in a stop-words list). Or limit to known S&P 500 ticker set if available.

### 14. All content-calendar.js Functions Must Be Async (OpenAI — LOW)
All exported functions involve I/O (NocoDB, HTTP). Plan now explicitly states all functions return Promises.
**Fix:** Add explicit async/await note to each function description.

---

## Not Integrating (Round 1)

**Redis for X_State caching** — Overkill. 1,728 NocoDB reads/day is manageable. Redis adds infrastructure complexity without meaningful benefit at this scale.

**Optimistic locking / version columns** — Ubersuggest quota NocoDB writes are not high-concurrency. A simple date-keyed row is sufficient.

**R2 filename collision** — Hero images use `hero-${article.slug}.png` as the key. Slugs are unique per article. No collision risk.

**TF-IDF stop-words / threshold tuning** — Plan already says TF-IDF is optional (D4.2). Threshold tuning is an implementation-time concern, not a planning concern.

**CI linter for NocoDB schema drift** — Valid but out of scope for this unit. Noted as a future improvement.

**Ahrefs authorization header format** — Reviewer suggested verifying "token param vs header". Ahrefs v3 docs confirm `Authorization: Bearer` is correct. No change needed.

**Ahrefs pagination with offset** — `limit=100` is intentional first pass. Full pagination loop is a future enhancement if coverage proves insufficient.

**`/sitemap.ts` redirect already covered** — integrated as #9 above.

---

## Integrating (Round 2 — Gemini gemini-3-pro-preview + OpenAI o3)

### 15. Timezone Bug in getCurrentPollingInterval — Day-of-Week Uses Wrong TZ (Both — CRITICAL)
The existing `getESTHour()` correctly converts the hour to America/New_York via Intl.DateTimeFormat, but `now.getDay()` uses the JavaScript Date object which reflects the **server's timezone (UTC)**. On a UTC server at 00:30 UTC Monday (19:30 EST Sunday), `now.getDay()` returns 1 (Monday) but the EST hour is 19 (Sunday night) — the function would classify this as "weekday after hours" (15-min interval) instead of "overnight/weekend" (60-min interval).

**Fix:** Compute both hour AND day-of-week in America/New_York by normalizing the date first: `const dt = new Date(now.toLocaleString('en-US', {timeZone:'America/New_York'})); const h = dt.getHours(); const day = dt.getDay();` — both derived from the same TZ-normalized date.

### 16. NODE_FUNCTION_ALLOW_EXTERNAL for fast-xml-parser (Gemini — CRITICAL)
The plan's Section 6 mentions enabling `fast-xml-parser` via `NODE_FUNCTION_ALLOW_BUILTIN`. This is incorrect: `NODE_FUNCTION_ALLOW_BUILTIN` governs Node.js native built-in modules (fs, crypto, etc.). npm packages require `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`.

**Fix:** Replace all references to `NODE_FUNCTION_ALLOW_BUILTIN` for fast-xml-parser with `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`. Update the A9 VPS docs block to include this env var in the n8n container restart checklist.

### 17. Ubersuggest Quota Race Condition — Must Be Sequential (Gemini — CRITICAL)
If top-3 keyword processing uses `Promise.all`, all three can read `count = 0` simultaneously from NocoDB, all increment, and 3+ Ubersuggest calls fire — exceeding the daily quota and triggering 429s/bans.

**Fix:** Process top-3 keywords with a `for...of` loop. Read quota → call Ubersuggest → PATCH count in NocoDB → move to next keyword. Explicitly note in the plan that this is intentionally sequential (not a performance oversight).

### 18. Feed_Health as Separate NocoDB Table (Both — HIGH)
The plan says "track consecutive failure count on the feed's Competitor_Intel tracker row." But Competitor_Intel tracks individual article items — there is no per-feed row to store health state.

**Fix:** Add a `Feed_Health` table to the pre-flight NocoDB schema: `id, feed_url (unique text), consecutive_failures (number), last_failure_date (datetime), last_success_date (datetime)`. Update `checkCompetitorFeeds()` to read/write this table for failure tracking. On success: reset `consecutive_failures = 0` and update `last_success_date`.

### 19. Ticker Whitelist from Insider_Alerts (Both — HIGH)
Regex `\b[A-Z]{2,5}\b` + stop-words list still passes through "SEC", "GDP", "ETF", "NYSE", "CEO", "IPO", "QTR", "YTD" — especially problematic in financial RSS feeds where these appear constantly.

**Fix:** At the start of `checkCompetitorFeeds()`, query Insider_Alerts for all distinct `ticker` values and build an in-memory Set. After regex extraction, only keep candidates that exist in this whitelist Set. The stop-words list becomes a secondary reject-list for performance (avoid NocoDB lookup for obvious non-tickers).

### 20. Bundle Ticker Pair Alphabetical Sort (OpenAI — MEDIUM)
If W17 runs twice and processes the same pair in different order, 'AAPL+SMCI' and 'SMCI+AAPL' are treated as two distinct keys — bypassing the deduplication Set and creating duplicate bundle entries.

**Fix:** Sort both tickers alphabetically before joining: `[ticker1, ticker2].sort().join('+')`. This ensures 'AAPL+SMCI' is always the canonical form regardless of processing order.

### 21. Reddit Runtime Assertion — Log+Telegram Instead of Throw (OpenAI — MEDIUM)
A module-level `throw` means that if someone bumps a SUBREDDIT_TONE_MAP limit in production, n8n will crash every execution permanently until manually fixed (no partial recovery, no Telegram alert visible). The unit test should fail in CI, but the runtime behavior should be resilient.

**Fix:** Replace `throw new Error(...)` with `console.error(...)` + `sendTelegramAlert(...)` (fire-and-forget) — and return early from the affected workflow logic. This preserves the CI guard (unit test asserts bad state) while avoiding a silent production outage.

### 22. n8n "Do Not Save Successful Executions" for 1-Minute Cron (Gemini — MEDIUM)
Running a skip-logic workflow every 1 minute generates 1,440 execution log entries per day in n8n's SQLite/PostgreSQL database. On a shared 4 GB VPS, this bloats the database and slows the n8n UI over time — even if each run completes in < 100ms.

**Fix:** Set the W8 workflow's "Save execution data" setting to **"For failed executions only"** (or "Do not save"). State observability comes from X_State in NocoDB, not n8n's execution history.

### 23. NocoDB Explicit limit=1000 on Dedup Query (Gemini — MEDIUM)
The pre-flight dedup query "query Report_Catalog for last 30 days" uses default NocoDB pagination (25 rows). If more than 25 catalog records exist in the last 30 days, the dedup Set is silently incomplete, allowing duplicates to accumulate.

**Fix:** Add `limit=1000` to the dedup pre-flight nocodbGet call. Also document in the nocodbGet helper usage: "always pass explicit limit for queries that may return > 25 rows."

---

## Not Integrating (Round 2)

**Schema bootstrap.js** — Overkill at current scale. Manual pre-flight NocoDB table creation is documented clearly and executed once per deployment.

**UNIQUE composite DB indices** — NocoDB doesn't expose programmatic UNIQUE constraint creation via its API. The Set-based dedup in code is sufficient; strict DB constraints are a future hardening step.

**Retention policy cron** — Scope creep for this unit. Noted as a future improvement.

**Ahrefs pagination + cost guard** — SEO stack is pending tool research. If Ahrefs is used, pagination is addressed at implementation time. Cost guard is an operational concern for post-deployment.

**Hero image cache-busting** — R2 slugs are unique per article; no re-generation flow exists in scope. Not needed.

**Market cap source clarification** — Spec explicitly says "if market_cap not available, skip bundles." This is sufficient for implementation.

**last_run watchdog / last_run_started field** — Plan already addresses the race condition by writing last_run BEFORE engagement logic, and single execution mode prevents overlapping runs. Adding a separate watchdog is belt-and-suspenders beyond what's warranted.

**External meta-cron for X polling** — The 1-minute n8n cron is fine on 4 GB VPS (100ms skip run, 1,440/day). Introducing an external cron adds infra complexity without meaningful benefit.

**node --max-old-space-size** — VPS memory tuning, out of scope for this unit.

**R2 cache-control headers** — Out of scope. Future CDN hardening step.

**CI integration smoke test** — Out of scope for this unit.

**Telegram markdown escaping for RSS text** — n8n's sendMessage handles basic text; Telegram's HTML parse mode risks are low for ops channel messages. Noted as defensive improvement for future polish.

**TF-IDF CPU budget short-circuit** — D4.2 is optional. CPU timing is an implementation-time concern.

**EXECUTIONS_PROCESS_TIMEOUT documentation** — The Alpha Vantage earnings helper adds 12s delays; n8n's default execution timeout is 120s. For 20 tickers × 12s = 240s, this IS relevant. However, this is documented in the "Rate limit handling" note in Section 6 — implementation team must set `EXECUTIONS_PROCESS_TIMEOUT=600` or disable it. Adding it to A9 VPS docs is sufficient.

**Ubersuggest quota UTC alignment** — Good point but low risk; NocoDB date strings formatted as YYYY-MM-DD are compared as strings. Using UTC consistently for all persisted dates (already implicit) is the correct approach and doesn't need an explicit plan note.
