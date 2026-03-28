# 03 — Dexter Content Engine: TDD Plan

## Testing Approach

This project spans two environments:
1. **n8n workflows** (JavaScript Code nodes on VPS) — tested via mock data + manual execution + Telegram verification
2. **Next.js site** (TypeScript on Netlify) — tested via vitest for unit tests, manual E2E for SSR

n8n Code nodes don't have a standard test runner. The approach:
- Each `.js` code file is developed locally with mock input data
- Functions are tested standalone with `node` before embedding in n8n
- Integration tests = manual n8n execution with Telegram alert verification
- Acceptance = end-to-end pipeline run with real API data

For Next.js: vitest (already compatible with Vite-based setup), with mock NocoDB responses.

---

## Section 1: NocoDB Setup & Table Schema

### Tests Before Implementation
```
# Test: NocoDB Docker container starts and API responds at http://nocodb:8080/api/v1/health
# Test: Create Keywords table via API, verify all 15 fields exist with correct types
# Test: Create Articles table via API, verify all 25 fields exist
# Test: Create Financial_Cache table with composite unique index on (ticker, data_type)
# Test: Upsert to Financial_Cache: insert then update same (ticker, data_type) — verify update replaces, doesn't duplicate
# Test: Keywords composite index exists: query with status + priority_score sort + blog filter returns results in <50ms
# Test: Articles composite index exists: query with status + published_at sort + blog filter returns results in <50ms
# Test: NocoDB API token auth: request without token returns 401, with token returns 200
# Test: Read-only token: can GET but cannot POST/PATCH/DELETE
```

---

## Section 2: Dexter Research Agent

### Tests Before Implementation
```
# Test: Cache check — given cached AAPL income_stmt with expires_at > NOW(), Dexter skips API call and uses cache
# Test: Cache miss — given expired cache entry, Dexter calls Financial Datasets API and writes fresh cache
# Test: Financial Datasets API — income statements endpoint returns valid JSON for AAPL (real API call)
# Test: Financial Datasets API — insider trades endpoint returns array of transactions for AAPL
# Test: Financial Datasets API — 404 for invalid ticker "ZZZZZ" handled gracefully (not crash)
# Test: Price data aggregation — given 252-day OHLCV array, output contains only: 52w_high, 52w_low, current_price, ma_50, ma_200, returns_1m/6m/1y, avg_volume_30d
# Test: Parallel fetch — all 7 data types fetched concurrently (measure wall time < sequential time)
# Test: Dexter pre-analysis LLM call — given aggregated financial JSON, returns key_findings (3-5), risks (2-3), catalysts (2-3)
# Test: Data completeness score — missing income_stmt + prices = score < 0.5, triggers abort
# Test: Data completeness score — all 7 types present = score 1.0
# Test: Cache upsert — writing same (ticker, data_type) updates row, doesn't create duplicate
# Test: Webhook response — returns complete JSON matching FINANCIAL-ARTICLE-SYSTEM-PROMPT.md variable structure
# Test: Rate limit handling — simulated 429 response triggers retry with exponential backoff (1s, 2s, 4s)
```

---

## Section 3: W1 — Keyword Selection

### Tests Before Implementation
```
# Test: DataForSEO keyword suggestions — real API call returns volume, difficulty, CPC for seed "insider buying AAPL"
# Test: Intent classification — "NVDA earnings analysis" maps to type A, "why insiders are buying" maps to type B
# Test: Intent classification — keyword with no signal words defaults to type A
# Test: Priority scoring — volume=1000, difficulty=30, multiplier=1.2 → score = 1000 * 0.7 * 1.2 = 840
# Test: Dedup — keyword already in NocoDB (exact match, case-insensitive) is skipped
# Test: Dedup — keyword NOT in NocoDB is inserted
# Test: Batch output — produces exactly 21 keywords per active blog
# Test: Multi-blog — with 2 active blogs, produces 42 total keywords (21 each)
# Test: Fallback mode — when DataForSEO unavailable, manual keyword entry in NocoDB works and W2 picks it up
# Test: Seed generation — insiderbuying blog seeds contain "insider buying" / "Form 4" / "insider trading" patterns
# Test: Schedule timezone — verify n8n schedule fires at Sunday midnight EST (not UTC)
```

---

## Section 4: W2 — Article Generation

### Tests Before Implementation
```
# Test: Keyword picker — selects highest priority_score keyword with status='new'
# Test: Keyword picker — ignores status='used' and status='skipped' keywords
# Test: Keyword picker — selects stale in_progress keyword (updated_at > 1 hour ago)
# Test: Keyword lock — after picking, keyword status = 'in_progress' and updated_at is fresh
# Test: Keyword lock — two concurrent picks don't select the same keyword
# Test: Ticker extraction — "NVDA earnings analysis Q1 2026" extracts "NVDA"
# Test: Ticker extraction — "best dividend stocks 2026" extracts no ticker (skip or fallback)
# Test: Ticker extraction — filters false positives: "THE", "CEO", "BEST", "FOR" are rejected
# Test: Ticker validation — extracted ticker verified against Financial Datasets API (real AAPL = valid, ZZZZZ = invalid)
# Test: Invalid ticker — keyword marked as 'invalid_ticker', not 'skipped'
# Test: Article type routing — weighted random produces ~30% short, ~50% medium, ~20% long over 100 runs
# Test: Variable interpolation — all 18 {{VARIABLE}} placeholders replaced with actual values
# Test: Claude Tool Use — API call with tool schema returns structured JSON in tool_use content block
# Test: Claude Tool Use — response type !== "tool_use" (safety refusal) logged and keyword marked skipped
# Test: Quality gate — valid article passes all 14 checks
# Test: Quality gate — missing title fails check #1, triggers retry
# Test: Quality gate — banned phrase "it's worth noting" in body_html fails check #6
# Test: Quality gate — paragraph density < 40% numeric fails check #7
# Test: Quality gate — 2 failed retries saves article as status='error'
# Test: HTML sanitization — <script> tag stripped from body_html before NocoDB write
# Test: HTML sanitization — external link gets rel="nofollow noopener noreferrer"
# Test: Slug uniqueness — existing slug "nvda-earnings" → new slug becomes "nvda-earnings-2603"
# Test: Article lifecycle — initial write sets status='enriching', not 'published'
# Test: Sequential downstream — W12 completes before W13 starts, W13 completes before revalidation fires
# Test: Revalidation — POST to /api/revalidate returns 200 and article appears updated on site
# Test: Google Indexing — POST to Indexing API with valid service account returns success
# Test: Telegram notification — success message contains title, ticker, verdict, URL
# Test: Empty keyword queue — no keywords available → Telegram warning, graceful exit (no crash)
```

---

## Section 5: W12 — Featured Image Generation

### Tests Before Implementation
```
# Test: Article fetch — GET article by ID returns title, ticker, verdict_type, slug, key_takeaways
# Test: Nano Banana Pro — API call with prompt returns image binary (real API call with test prompt)
# Test: Nano Banana Pro failure — graceful fallback to generic verdict-colored placeholder image
# Test: OG card template — HTML renders correctly with title, ticker, verdict badge, key takeaway
# Test: OG card — screenshot server returns 1200x630 PNG
# Test: Screenshot server failure — retry once, then skip OG card (use next-seo default)
# Test: R2 upload — image uploaded to earlyinsider/images/{slug}_hero.png, returns public URL
# Test: R2 upload — image uploaded to earlyinsider/images/{slug}_og.png, returns public URL
# Test: NocoDB update — Articles record patched with hero_image_url and og_image_url
# Test: NocoDB update — Published_Images table gets 2 new records (hero + og)
# Test: HTML escape in OG template — company name "AT&T" doesn't break the template
# Test: Webhook response — W12 returns success JSON so W2 knows it completed
```

---

## Section 6: W13 — Cross-Linking

### Tests Before Implementation
```
# Test: Related articles query — same ticker articles ranked first, then same sector
# Test: Related articles query — filters to same blog only
# Test: Related articles query — max 5 results, published within 90 days
# Test: Related articles query — excludes the article itself
# Test: Cheerio link injection — anchor tag inserted around matching phrase in text node
# Test: Cheerio link injection — does NOT inject inside existing <a> tag (no nesting)
# Test: Cheerio link injection — does NOT inject inside <img alt> attribute
# Test: Cheerio link injection — does NOT inject inside <h2> tags in Key Takeaways section
# Test: Cheerio link injection — does NOT inject inside verdict section
# Test: Cheerio idempotency — re-running on already-linked article doesn't create duplicate links
# Test: Max 3 outbound links per article enforced
# Test: Max 1 inbound link added per related article
# Test: related_articles JSON field populated with array of related article IDs (not HTML)
# Test: NocoDB PATCH — both new article and modified related articles updated correctly
# Test: Webhook response — W13 returns success JSON so W2 knows it completed
# Test: No related articles found — graceful return (empty related_articles, no links added)
```

---

## Section 7: Blog Integration (Next.js)

### Tests Before Implementation
```
# Test: /api/articles proxy — returns list of articles from NocoDB with correct fields (no body_html)
# Test: /api/articles proxy — filters by blog, status=published, sorted by published_at DESC
# Test: /api/articles proxy — pagination with limit=12 and offset
# Test: /api/articles/[slug] proxy — returns single article with body_html
# Test: /api/articles/[slug] proxy — 404 for non-existent slug
# Test: /api/revalidate — valid secret token triggers revalidation, returns 200
# Test: /api/revalidate — invalid/missing secret returns 401
# Test: /blog page — renders article cards with title, verdict badge, ticker, date
# Test: /blog page — filter by verdict type returns filtered results
# Test: /blog/[slug] page — renders article body_html, key takeaways, verdict, author card
# Test: /blog/[slug] page — Related Articles section rendered from related_articles JSON
# Test: /blog/[slug] page — ArticleJsonLd present with correct author, datePublished, publisher
# Test: /blog/[slug] page — OG meta tags match article title, meta_description, og_image_url
# Test: NocoDB read-only token — cannot POST/PATCH via the proxy routes
# Test: Input validation — ticker search filter sanitized (no NocoDB query injection)
```

---

## Section 8: End-to-End Testing & Monitoring

### Tests Before Implementation
```
# Test: Full pipeline E2E — insert keyword → Dexter runs → Claude generates → W12 images → W13 cross-links → revalidation → Google Indexing → article live on site
# Test: 3 articles/day — schedule fires at 8AM, 1PM, 6PM EST without overlap
# Test: Second article on same ticker — cross-links created bidirectionally
# Test: Telegram alerts — success and failure messages arrive in correct chat
# Test: Cost tracking — verify per-article cost matches estimates ($0.04-0.13)
# Test: Low keyword warning — < 7 'new' keywords triggers Telegram alert
# Test: Error recovery — W2 crash mid-execution leaves keyword recoverable (1h lock timeout)
```

---

## Section 9: Configuration & Environment

### Tests Before Implementation
```
# Test: All n8n env vars accessible from Code nodes via $env
# Test: All Netlify env vars accessible from Next.js server components
# Test: NocoDB API responds on both localhost (from n8n) and public URL (from Netlify)
# Test: R2 credentials work for upload (test file upload + verify public URL)
# Test: Anthropic API key valid (test ping with minimal prompt)
# Test: Financial Datasets API key valid (test GET for AAPL income statements)
# Test: DataForSEO credentials valid (test POST for keyword volume)
# Test: Google Indexing service account valid (test URL_UPDATED for test URL)
```
