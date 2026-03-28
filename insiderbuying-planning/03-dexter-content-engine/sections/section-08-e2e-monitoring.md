# Section 8: End-to-End Testing & Monitoring

## Context

This section combines the plan's Section 8 (End-to-End Testing & Monitoring) and Section 9 (Configuration & Environment Variables). After all workflows and the blog integration are implemented, the full pipeline must be validated end-to-end and monitoring must be in place for autonomous daily operation. This includes a manual test sequence, Telegram alert setup for all success/failure paths, cost tracking, and a complete inventory of all environment variables, code files, and workflow files.

---

## Implementation

### Manual Test Sequence (9 Steps)

Execute these steps in order to validate the complete pipeline:

#### Step 1: NocoDB Setup Verification
- Verify all 4 tables exist with correct schemas: Keywords, Articles, Financial_Cache, Published_Images
- Verify composite indexes: Keywords `(status, priority_score DESC, blog)`, Articles `(status, published_at DESC, blog)`, Articles `(ticker, sector)`, Financial_Cache `(ticker, data_type)` unique
- Verify API token auth works (request without token = 401, with token = 200)
- Verify read-only token can GET but cannot POST/PATCH/DELETE

#### Step 2: Insert Test Keyword
- Manually add to NocoDB Keywords table:
  - keyword: "AAPL insider buying Q1 2026"
  - ticker: "AAPL"
  - blog: "insiderbuying"
  - article_type: "B"
  - status: "new"
  - priority_score: 999 (ensures it gets picked first)

#### Step 3: Run Dexter Standalone
- Call Dexter webhook with: `{ ticker: "AAPL", keyword: "AAPL insider buying Q1 2026", article_type: "B", blog: "insiderbuying" }`
- Verify: JSON response contains all data fields (financial_data, insider_trades, stock_prices, competitor_data, management_quotes, dexter_analysis)
- Verify: Financial_Cache table populated with AAPL entries for each data type
- Verify: `data_completeness` >= 0.5

#### Step 4: Run W2 Standalone
- Trigger W2 manually
- Verify execution order:
  1. Picks the test keyword (highest priority_score)
  2. Calls Dexter (webhook response received)
  3. Claude generates article (tool_use response)
  4. Quality gate passes all 14 checks
  5. Article written to NocoDB with status='enriching'
  6. Keyword status updated to 'used'
  7. W12 triggered and completes (images generated)
  8. W13 triggered and completes (cross-links if applicable)
  9. Article status updated to 'published'
  10. Revalidation POST to `/api/revalidate` succeeds
  11. Google Indexing API submitted
  12. Telegram notification sent with article details

#### Step 5: Check Article on Site
- Navigate to `/blog` — verify the article appears in the listing with hero image, title, verdict badge, ticker, date
- Navigate to `/blog/{slug}` — verify full article renders with:
  - Key Takeaways box
  - Article body (tables, data, citations)
  - Verdict section
  - Author card
  - Table of Contents
  - Share buttons
  - Newsletter CTA
- Verify SEO: check page source for ArticleJsonLd, OpenGraph meta tags, canonical URL

#### Step 6: Check Images
- Verify hero image exists on R2 at `earlyinsider/images/{slug}_hero.png`
- Verify OG image exists on R2 at `earlyinsider/images/{slug}_og.png`
- Verify both URLs are linked in the NocoDB Articles record (`hero_image_url`, `og_image_url`)
- Verify Published_Images table has 2 records for this article

#### Step 7: Check Cross-Links
- Generate a 2nd article on the same ticker (AAPL) by inserting another test keyword and running W2
- After 2nd article publishes, verify:
  - Article 1's `body_html` contains an `<a>` link to Article 2
  - Article 2's `body_html` contains an `<a>` link to Article 1
  - Article 2's `related_articles` JSON includes Article 1
  - Links are in text nodes only (not in headings, key takeaways, or verdict)

#### Step 8: Run W1 (Keyword Selection)
- Trigger W1 manually with DataForSEO
- Verify: 21 keywords inserted into NocoDB Keywords table for 'insiderbuying' blog
- Verify: each keyword has search_volume, difficulty, cpc, intent_multiplier, priority_score
- Verify: no duplicates with existing keywords
- Verify: all keywords have status='new'

#### Step 9: Schedule Test
- Enable all schedules: W1 (Sunday midnight EST), W2 (8AM, 1PM, 6PM EST)
- Let run for 1 full day
- Verify: 3 articles generated without overlap (no two executions picking the same keyword)
- Verify: no zombie locks (keyword stuck in 'in_progress' > 1 hour)
- Verify: all 3 articles have images and cross-links

### Telegram Monitoring Alerts

All alerts sent to `TELEGRAM_CHAT_ID` via `TELEGRAM_BOT_TOKEN`. Message types:

#### W2 Success Alert
```
Article Published
Title: {title}
Ticker: {ticker}
Verdict: {verdict_type}
Word Count: {word_count}
Quality Gate: PASS
URL: https://earlyinsider.com/blog/{slug}
Cost: ~${estimated_cost}
```

#### W2 Failure Alert
```
Article Generation FAILED
Keyword: {keyword}
Error: {error_type}
Quality Gate Failures: {failing_checks}
Retry Count: {retry_count}/2
Action: {keyword marked as 'error' / will retry}
```

#### W1 Success Alert
```
Keywords Generated
Blog: {blog}
Count: {count} new keywords
Top 3: {top_keywords_by_priority}
```

#### Dexter Failure Alert
```
Dexter Research FAILED
Ticker: {ticker}
Failed APIs: {list of failed data types}
Data Completeness: {score}
Action: {keyword skipped / partial data used}
```

#### Low Keyword Inventory Warning
```
LOW KEYWORD INVENTORY
Blog: {blog}
Remaining 'new' keywords: {count}
Days of inventory: ~{count/3}
Action: Run W1 or add keywords manually
```

Triggered when Keywords table has < 7 'new' keywords for any active blog. Check this at the start of each W2 execution.

#### Google Indexing Alert
```
Google Indexing: {SUCCESS / FAILED}
URL: https://earlyinsider.com/blog/{slug}
Response: {api_response_status}
```

### Cost Tracking

Per-article estimated costs:
- **Claude API**: $0.03-0.08 (depends on article length tier: short/medium/long)
- **Financial Datasets API**: $0.01-0.05 (depends on cache hits)
- **Dexter pre-analysis LLM** (Haiku/4o-mini): ~$0.005
- **Nano Banana Pro** (kie.ai): ~$0.01
- **DataForSEO**: depends on plan, tracked monthly

Per-week estimate (21 articles): $0.84-2.73
Per-month estimate (90 articles): $3.60-11.70

Include estimated cost in the W2 success Telegram alert. Calculate from:
- Claude input/output token counts (from API response `usage` field)
- Number of cache misses (each miss = Financial Datasets API call)

### Environment Variables

#### n8n Environment Variables (set in n8n settings or docker-compose)

```
NOCODB_BASE_URL=http://nocodb:8080/api/v1/db/data/noco/EarlyInsider/EarlyInsider
NOCODB_API_TOKEN=<generated in NocoDB settings>
FINANCIAL_DATASETS_API_KEY=<from financialdatasets.ai>
DATAFORSEO_LOGIN=<from dataforseo.com>
DATAFORSEO_PASSWORD=<from dataforseo.com>
ANTHROPIC_API_KEY=<Claude API key>
KIE_API_KEY=<Nano Banana Pro key, existing from Toxic or Nah>
GOOGLE_INDEXING_SERVICE_ACCOUNT=<JSON key, base64 encoded>
R2_ACCOUNT_ID=<existing from Toxic or Nah>
R2_ACCESS_KEY_ID=<existing from Toxic or Nah>
R2_SECRET_ACCESS_KEY=<existing from Toxic or Nah>
R2_PUBLIC_URL=https://pub-6e119e86bbae4479912db5c9a79d8fed.r2.dev
NETLIFY_REBUILD_WEBHOOK=<from Netlify build hooks>
TELEGRAM_BOT_TOKEN=<existing>
TELEGRAM_CHAT_ID=<for EarlyInsider alerts>
SCREENSHOT_SERVER_URL=http://host.docker.internal:3456
REVALIDATION_TOKEN=<random secret string, must match Netlify REVALIDATION_SECRET>
```

#### Netlify Environment Variables (for Next.js site)

```
NOCODB_API_URL=https://nocodb.earlyinsider.com/api/v1/db/data/noco/EarlyInsider/EarlyInsider
NOCODB_READONLY_TOKEN=<read-only NocoDB token, Viewer role>
REVALIDATION_SECRET=<random secret string, must match n8n REVALIDATION_TOKEN>
```

### n8n Code Files

All code files stored in `n8n/code/insiderbuying/`:

| File | Workflow | Purpose |
|------|----------|---------|
| `dexter-research.js` | Dexter | Aggregation + cache logic + price data summarization + pre-analysis LLM call |
| `select-keyword.js` | W1 | Seed generation + DataForSEO integration + intent classification + priority scoring + dedup |
| `generate-article.js` | W2 | Variable interpolation + Claude tool use response parsing + quality gate (14 checks) + HTML sanitization + slug uniqueness |
| `generate-image.js` | W12 | Nano Banana prompt construction + OG card HTML template + screenshot server call + R2 upload |
| `cross-link.js` | W13 | Cheerio-based anchor text finder + related articles query + bidirectional link injection + idempotency |

### Workflow JSON Files

All workflow files stored in `n8n/workflows/insiderbuying/`:

| File | Workflow | Trigger |
|------|----------|---------|
| `dexter-research.json` | Dexter Research Agent | Webhook (from W2) |
| `w1-keyword-selection.json` | W1 Keyword Selection | Schedule (Sunday midnight EST) |
| `w2-article-generation.json` | W2 Article Generation | Schedule (8AM, 1PM, 6PM EST) |
| `w12-image-generation.json` | W12 Image Generation | Webhook (from W2) |
| `w13-cross-linking.json` | W13 Cross-Linking | Webhook (from W2) |

---

## Tests (TDD)

### Section 8 Tests: End-to-End Testing & Monitoring

```
# Test: Full pipeline E2E — insert keyword -> Dexter runs -> Claude generates -> W12 images -> W13 cross-links -> revalidation -> Google Indexing -> article live on site
# Test: 3 articles/day — schedule fires at 8AM, 1PM, 6PM EST without overlap
# Test: Second article on same ticker — cross-links created bidirectionally
# Test: Telegram alerts — success and failure messages arrive in correct chat
# Test: Cost tracking — verify per-article cost matches estimates ($0.04-0.13)
# Test: Low keyword warning — < 7 'new' keywords triggers Telegram alert
# Test: Error recovery — W2 crash mid-execution leaves keyword recoverable (1h lock timeout)
```

### Section 9 Tests: Configuration & Environment

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

---

## Acceptance Criteria

1. Full pipeline E2E works: keyword insertion -> Dexter -> Claude -> quality gate -> NocoDB write -> W12 images -> W13 cross-links -> status='published' -> revalidation -> Google Indexing -> article visible on site
2. 3 articles per day generated on schedule (8AM, 1PM, 6PM EST) without keyword overlap or zombie locks
3. Bidirectional cross-links created when 2+ articles share the same ticker
4. Telegram alerts sent for: W2 success (with title, ticker, verdict, URL, cost), W2 failure (with error details), W1 success (with keyword count), Dexter failure (with failed APIs), low keyword inventory (< 7 remaining), Google Indexing result
5. Cost estimate included in W2 success alert, calculated from Claude token usage and cache hit/miss count
6. Error recovery works: W2 crash leaves keyword in 'in_progress' with 1-hour timeout, next execution picks it up or skips it
7. All n8n environment variables accessible from Code nodes via `$env`
8. All Netlify environment variables accessible from Next.js server components
9. NocoDB accessible from both n8n (localhost) and Next.js (public URL via Traefik)
10. All API keys validated: Anthropic, Financial Datasets, DataForSEO, Google Indexing, R2, kie.ai
11. Read-only NocoDB token confirmed: can GET, cannot POST/PATCH/DELETE
12. All 5 code files exist in `n8n/code/insiderbuying/` and all 5 workflow JSON files exist in `n8n/workflows/insiderbuying/`
