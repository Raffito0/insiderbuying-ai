# 03 — Dexter Content Engine: Implementation Plan

## Overview

This plan describes a fully automated content generation pipeline for EarlyInsider.com (and future finance blogs). The system generates 3 publication-quality financial analysis articles per day, each backed by real financial data, insider trading records, and AI-powered research.

The pipeline consists of 5 n8n workflows:
- **Dexter Research Agent** — automated financial data aggregation per ticker
- **W1 Keyword Selection** — weekly keyword research via DataForSEO
- **W2 Article Generation** — orchestrates Dexter → Claude → publish → index
- **W12 Featured Image Generation** — hero images + OG cards
- **W13 Cross-Linking** — bidirectional internal links between related articles

All content data lives in NocoDB (self-hosted PostgreSQL on the same VPS as n8n). The site (Next.js on Netlify) reads articles via NocoDB's REST API.

---

## Section 1: NocoDB Setup & Table Schema

### Context
NocoDB replaces Airtable (1000 API calls/month too restrictive). Docker compose exists on VPS but is not started. NocoDB runs on the same Docker network as n8n — localhost access, zero latency, no rate limits.

### What to Do

**Start NocoDB**: `docker-compose up -d` on VPS. Create a project called `EarlyInsider`.

**Create 4 tables** with the following schemas:

#### Keywords Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| keyword | Text | Target keyword |
| ticker | Text | Extracted ticker symbol |
| blog | Text | 'insiderbuying' / 'deepstockanalysis' / 'dividenddeep' |
| article_type | SingleSelect | A / B / C / D |
| search_volume | Number | Monthly search volume |
| difficulty | Number | 0-100 keyword difficulty |
| cpc | Decimal | Cost per click |
| intent_multiplier | Decimal | A=1.0, B=1.2, C=0.8, D=0.9 |
| priority_score | Decimal | Computed: volume * (1 - difficulty/100) * intent_multiplier |
| secondary_keywords | LongText | JSON array of related keywords |
| status | SingleSelect | new / used / skipped / in_progress / invalid_ticker |
| updated_at | DateTime | Auto-updated on every write (for lock timeout) |
| created_at | DateTime | Auto |
| used_at | DateTime | Set when W2 picks this keyword |

#### Articles Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| slug | Text | URL-friendly, unique index |
| title | Text | 55-65 chars |
| meta_description | Text | 140-155 chars |
| body_html | LongText | Full article HTML |
| verdict_type | SingleSelect | BUY / SELL / CAUTION / WAIT / NO_TRADE |
| verdict_text | LongText | Verdict paragraph |
| key_takeaways | LongText | JSON array of 3-4 strings |
| word_count | Number | |
| primary_keyword | Text | |
| secondary_keywords_used | LongText | JSON array |
| data_tables_count | Number | |
| filing_citations_count | Number | |
| confidence_notes | LongText | |
| ticker | Text | |
| sector | Text | |
| company_name | Text | |
| blog | Text | insiderbuying / deepstockanalysis / dividenddeep |
| hero_image_url | URL | R2 permanent URL |
| og_image_url | URL | R2 permanent URL |
| author_name | Text | |
| status | SingleSelect | published / draft / error |
| quality_gate_pass | Checkbox | |
| related_articles | LongText | JSON array of linked article IDs |
| published_at | DateTime | |
| created_at | DateTime | Auto |

#### Financial_Cache Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| ticker | Text | Indexed |
| data_type | SingleSelect | income_stmt / balance_sheet / cash_flow / ratios / insider_trades / prices / competitors / transcripts / news |
| data_json | LongText | Raw API response JSON |
| fetched_at | DateTime | |
| expires_at | DateTime | fetched_at + 24h |

Composite unique index on `(ticker, data_type)` — upsert on refresh.

#### Published_Images Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| article_id | Link to Articles | |
| image_type | SingleSelect | hero / og |
| r2_url | URL | Permanent CDN URL |
| prompt_used | LongText | For hero images |
| created_at | DateTime | Auto |

### NocoDB API Pattern for n8n Code Nodes

All n8n Code nodes access NocoDB via REST:
- Base URL: `http://nocodb:8080/api/v1/db/data/noco/EarlyInsider/EarlyInsider`
- Auth header: `xc-auth: <NOCODB_API_TOKEN>`
- CRUD: standard REST (GET list, GET by ID, POST create, PATCH update)
- Filter: `?where=(status,eq,new)~and(blog,eq,insiderbuying)`
- Sort: `?sort=-priority_score`
- Limit: `?limit=1`

Store `NOCODB_API_TOKEN` and `NOCODB_BASE_URL` as n8n environment variables.

### Database Indexes
Add these indexes after table creation for query performance:
- `Keywords`: composite index on `(status, priority_score DESC, blog)` — used by W2 keyword picker
- `Articles`: composite index on `(status, published_at DESC, blog)` — used by /blog listing
- `Articles`: composite index on `(ticker, sector)` — used by W13 related articles finder
- `Financial_Cache`: composite unique index on `(ticker, data_type)` — for upsert operations

---

## Section 2: Dexter Research Agent (n8n Sub-Workflow)

### Context
Dexter is the "brain" that gathers everything Claude needs to write a high-quality article. It takes a ticker and returns structured financial data matching the 18 template variables in FINANCIAL-ARTICLE-SYSTEM-PROMPT.md.

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ ticker, keyword, article_type, blog }`)

**Pipeline** (all data fetches run in parallel where possible):

#### Step 1: Check Cache
Before any API call, query NocoDB Financial_Cache for each data type where `ticker = input.ticker AND expires_at > NOW()`. If found, use cached data. If not, proceed to API call.

#### Step 2: Financial Datasets API Calls (parallel)
7 concurrent HTTP Request nodes:

1. **Income Statements**: GET `/api/v1/financial-statements/income-statements?ticker={TICKER}&period=quarterly&limit=4` + annual limit=3
2. **Balance Sheet**: GET `/api/v1/financial-statements/balance-sheets?ticker={TICKER}&period=quarterly&limit=1`
3. **Cash Flow**: GET `/api/v1/financial-statements/cash-flow-statements?ticker={TICKER}&period=quarterly&limit=4`
4. **Key Ratios**: GET `/api/v1/financial-ratios?ticker={TICKER}&period=quarterly&limit=12` (3Y)
5. **Insider Trades**: GET `/api/v1/insider-trades?ticker={TICKER}&limit=50` (filter last 90 days in code)
6. **Stock Prices**: GET `/api/v1/stock-prices?ticker={TICKER}&interval=day&limit=252` (1Y trading days)
7. **Competitors**: Use sector from income statement response → query top 5 by market cap in same sector

Auth: `X-API-Key: <FINANCIAL_DATASETS_API_KEY>` header on all requests.

#### Step 3: Web Search for News
HTTP Request node to Google Custom Search API (or SerpAPI):
- Query: `"{company_name}" OR "{ticker}" stock analysis news {current_month} {current_year}`
- Extract: top 5 results with title, snippet, date
- Purpose: recent news, analyst ratings, controversies

#### Step 4: Earnings Call Transcripts
Financial Datasets API endpoint for transcripts (if available), or web search fallback:
- Query: `"{company_name}" earnings call transcript Q{quarter} {year}`
- Extract CEO/CFO quotes with surrounding context

#### Step 5: Cache Write
For each data type fetched from API (not cache), upsert into NocoDB Financial_Cache:
- `ticker`, `data_type`, `data_json` (full response), `fetched_at = NOW()`, `expires_at = NOW() + 24h`

#### Step 6: Aggregation (Code Node — `dexter-research.js`)
Combine all data into the structured JSON matching FINANCIAL-ARTICLE-SYSTEM-PROMPT.md variables:

```javascript
// Function signature — implementation in deep-implement
function aggregateDexterData(financialData, insiderTrades, stockPrices, competitorData, managementQuotes, newsResults) {
  // Returns: { company_name, ticker, sector, market_cap, financial_data, insider_trades, stock_prices, competitor_data, management_quotes, dexter_analysis }
}
```

**Price data aggregation**: Do NOT send raw 252-day OHLCV array to Claude. In `dexter-research.js`, compute and send only: 52-week high/low, current price, 50-day and 200-day moving averages, 1-month/6-month/1-year returns, and 30-day avg volume. This reduces input tokens by ~80% and improves Claude's focus.

The `dexter_analysis` field is a pre-analysis summary:
- `key_findings[]`: 3-5 notable data points (e.g., "Revenue grew 34% YoY but 22 points came from a single contract")
- `risks[]`: 2-3 identified risks from the data
- `catalysts[]`: 2-3 potential catalysts

This pre-analysis helps Claude write more focused articles by highlighting what matters most in the data.

**Dexter pre-analysis via LLM**: The `dexter_analysis` summary (key_findings, risks, catalysts) requires semantic understanding — a Code node can't do this. Insert a lightweight LLM call (Claude Haiku or GPT-4o-mini) inside Dexter to process the aggregated financial JSON and extract the 3-5 key findings, 2-3 risks, and 2-3 catalysts. This costs ~$0.005 per article.

**Output**: Return aggregated JSON via webhook response to W2.

### Error Handling
- Individual API failures: log warning, continue with available data. Dexter returns partial data with a `data_completeness` score (0-1).
- If `data_completeness < 0.5` (e.g., no income statement and no prices), abort and set keyword status to 'skipped' with reason.
- Rate limit errors: exponential backoff (1s, 2s, 4s, max 3 retries).

---

## Section 3: W1 — Keyword Selection Workflow

### Context
Weekly workflow that uses DataForSEO to find the best keywords for each active blog. Produces 21 keywords per blog (3/day * 7 days).

### Workflow Design

**Trigger**: Schedule — every Sunday at midnight EST

**Pipeline**:

#### Step 1: Determine Active Blogs
Query NocoDB or config: which blogs are currently active? Day 1: only `insiderbuying`. Future: all 3 blogs.

For each active blog, run the keyword pipeline:

#### Step 2: Generate Seed Keywords (Code Node — `select-keyword.js`)
Per blog, generate seed keyword list:
- **insiderbuying**: "insider buying {trending_tickers}", "insider selling {sector}", "Form 4 filing {ticker}", "insider trading signal {ticker}"
- **deepstockanalysis**: "{ticker} earnings analysis", "{ticker} stock forecast", "{sector} stock comparison"
- **dividenddeep**: "{ticker} dividend safety", "best dividend stocks {sector}", "{ticker} payout ratio"

Trending tickers: query NocoDB Financial_Cache for tickers with recent insider activity (last 7 days), or use a static watchlist initially.

#### Step 3: DataForSEO API Calls
For each seed keyword, call DataForSEO:

**Endpoint**: POST `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`
- Auth: Basic auth (login:password base64)
- Body: `{ "keywords": [array of seeds], "location_code": 2840, "language_code": "en" }`
- Returns: search_volume, competition, cpc, monthly_searches[]

**Endpoint**: POST `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live`
- Body: `{ "keywords": [array of seeds], "location_code": 2840 }`
- Returns: related keywords with volume/difficulty

**Endpoint**: POST `https://api.dataforseo.com/v3/serp/google/organic/live/regular`
- Body: `{ "keyword": "seed", "location_code": 2840 }`
- Returns: top 10 SERP results (for gap analysis)

#### Step 4: Intent Classification (Code Node)
Map each keyword to article type using signal words:
```
TYPE_MAP = {
  A (data-heavy): earnings, analysis, forecast, valuation, revenue, results, financials
  B (narrative): why, how, signal, insider, buying, selling, pattern, meaning
  C (comparative): vs, compare, best, top, alternative, which
  D (editorial): strategy, guide, opinion, approach, should, when
}
```
Default to type A if no signal word matches. Set `intent_multiplier` accordingly.

#### Step 5: Priority Scoring + Dedup
```
priority_score = search_volume * (1 - keyword_difficulty/100) * intent_multiplier
```

Check NocoDB Keywords table: skip any keyword already present (by exact match or fuzzy similarity > 0.8).

#### Step 6: Write to NocoDB
Insert top 21 keywords per blog into Keywords table, status='new'.

### Fallback (if DataForSEO unavailable)
Manual mode: user enters keywords directly into NocoDB Keywords table (via NocoDB UI or CSV import). W2 reads from the same table regardless of source. Log a warning if Keywords table has < 7 'new' keywords for any active blog.

---

## Section 4: W2 — Article Generation Workflow

### Context
The core orchestration workflow. Runs 3x/day, picks the best available keyword, calls Dexter for research, generates an article via Claude, runs quality gates, publishes, and triggers downstream workflows.

### Workflow Design

**Trigger**: Schedule — 8:00 AM, 1:00 PM, 6:00 PM EST daily

**Pipeline**:

#### Step 1: Pick Keyword
Query NocoDB Keywords: `(status=new OR (status=in_progress AND updated_at < NOW() - 1 hour))`, sorted by `priority_score DESC`, limit 1.
If no keywords available, log warning to Telegram and exit gracefully.

Set `keyword.status = 'in_progress'` and `updated_at = NOW()` to lock the keyword. The 1-hour timeout prevents zombie locks if n8n crashes mid-execution.

#### Step 2: Extract & Validate Ticker
Code node (`generate-article.js`): parse ticker from keyword string.
- Regex: look for 1-5 uppercase letters
- **Validation required**: extracted string must be validated against a known ticker list. Either maintain a cached list of valid US tickers in NocoDB, or make a lightweight HEAD request to Financial Datasets API (`/financials/income-statements?ticker={CANDIDATE}&limit=1`). If the ticker is invalid (404 or not found), set keyword status to `invalid_ticker` and skip.
- Common false positives to filter: "A", "THE", "CEO", "BEST", "TOP", "FOR", "ALL", "ARE", "NEW"

#### Step 3: Call Dexter
HTTP Request node: POST to Dexter webhook with `{ ticker, keyword, article_type, blog }`.
Wait for response (Dexter typically completes in 10-30s).

If Dexter returns `data_completeness < 0.5`, set keyword status to 'skipped', exit.

#### Step 4: Determine Article Parameters
Code node:
- `TARGET_LENGTH` = weighted random: 30% short, 50% medium, 20% long
- `AUTHOR_NAME` = blog-dependent (insiderbuying → 'Dexter Research', others → 'Ryan Cole')
- `MAX_TOKENS` = length-dependent (6K/8K/12K)
- Prepare all 18 template variables from Dexter output

#### Step 5: Variable Interpolation
Code node: read FINANCIAL-ARTICLE-SYSTEM-PROMPT.md template (stored as n8n static data or as a file on VPS). Replace all `{{VARIABLE}}` placeholders with actual values from step 4.

The variable interpolation code already exists in the system prompt document. Adapt it for NocoDB (was written for Airtable).

#### Step 6: Claude API Call (with Tool Use)
HTTP Request node to Anthropic API:
- POST `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body uses **Tool Use** for guaranteed JSON output:
  - Define a tool `generate_article` with the exact article schema (title, meta_description, slug, key_takeaways[], body_html, verdict_type, verdict_text, word_count, etc.)
  - Set `tool_choice: {"type": "tool", "name": "generate_article"}`
  - Claude returns structured JSON via the tool call — no regex parsing needed
  - `model: "claude-sonnet-4-6-20250514"`, `max_tokens: MAX_TOKENS`, `temperature: 0.6`

#### Step 7: Extract Tool Result
Code node: extract the tool use result from Claude's response.
- Response structure: `message.content[0].type === "tool_use"` → `message.content[0].input` is the article JSON
- No markdown fence stripping or regex needed — the JSON is guaranteed valid by the API
- Validate required fields exist (safety check, should always pass with tool use)

#### Step 8: Quality Gate (14 checks)
Code node (`generate-article.js` — quality gate section):

1. Title length 55-65 chars
2. Meta description 140-155 chars
3. key_takeaways has exactly 3-4 items, each contains a number
4. verdict_type is one of BUY/SELL/CAUTION/WAIT/NO_TRADE
5. verdict_text exists, contains a numeric threshold
6. Zero banned phrases (regex scan against 25+ patterns)
7. At least 40% of paragraphs contain a numeric metric, date, or specific data point (density check, not absolute)
8. Word count in target range for chosen length tier
9. Primary keyword in title
10. Primary keyword in first 100 words of body_html
11. Primary keyword in at least one H2
12. Primary keyword in meta_description
13. data_tables_count >= 1 (for type A articles)
14. All required JSON fields present

**If gate fails**: retry with feedback message appended to user prompt: `"Quality gate failed on: {failing_checks}. Fix these specific issues and regenerate."` Max 2 retries.

**If still fails after 2 retries**: save article as status='error' with quality_gate notes, alert via Telegram, move to next keyword.

#### Step 8.5: Sanitize HTML
Before writing to NocoDB, sanitize `body_html` using `sanitize-html` (or equivalent in n8n Code node):
- Allowlist tags: `h2, h3, p, table, thead, tbody, tr, th, td, blockquote, strong, em, a, ul, ol, li, span`
- Allowlist attrs: `href` (on `a` only, must start with `/` or `https://`), `class` (on `p` and `section` only)
- Strip: `script, iframe, style, on*` attributes, `data-*` attributes
- External links: add `rel="nofollow noopener noreferrer"`
This prevents stored XSS since `/blog/[slug]` uses `dangerouslySetInnerHTML`.

#### Step 8.6: Ensure Unique Slug
Check NocoDB for existing article with same slug. If collision, append date suffix: `{slug}-{YYMM}` (e.g., `nvda-earnings-analysis-2603`). This prevents constraint violations for recurring topics.

#### Step 9: Write to NocoDB
POST to NocoDB Articles table with all fields. Set `status='enriching'` (NOT 'published' yet), `published_at=NOW()`, `quality_gate_pass=true`.

#### Step 10: Update Keyword
PATCH keyword status to 'used', set `used_at=NOW()`.

#### Step 11: Trigger Downstream (SEQUENTIAL — not parallel)
**Critical**: These must run sequentially. If Netlify rebuilds before W12/W13 finish, the site deploys with broken image URLs and missing cross-links.

1. **W12 webhook** with article ID → image generation → **wait for completion**
2. **W13 webhook** with article ID → cross-linking → **wait for completion**
3. **PATCH article status** to `'published'` in NocoDB (only after images + cross-links are ready)
4. **On-demand revalidation** instead of full Netlify rebuild: POST to `https://earlyinsider.com/api/revalidate?secret=REVALIDATION_TOKEN&slug={slug}`. This updates only the specific article page + /blog index in milliseconds, without rebuilding the entire site. Create this API route in Next.js.

**W12/W13 webhook config**: Both sub-workflows MUST have "Respond to Webhook" set to "When Last Node Finishes" so W2 actually waits for completion. Otherwise n8n fires-and-forgets and Step 11 races ahead.

#### Step 12: Google Indexing API Submit
After revalidation:
- POST `https://indexing.googleapis.com/v3/urlNotifications:publish`
- Body: `{ "url": "https://earlyinsider.com/blog/{slug}", "type": "URL_UPDATED" }`
- Auth: Google service account JWT

#### Step 13: Notify
Telegram message with article summary: title, ticker, verdict, word count, quality gate status, article URL.

### Race Condition Prevention
The 3 daily triggers are spaced 5 hours apart. Each execution locks its keyword (`status='in_progress'`). If an execution takes longer than expected and overlaps with the next, the second execution picks a different keyword.

Add a guard: if an execution with the same blog is still running (`status='in_progress'` keyword exists), wait 2 minutes and retry. Max 3 waits before skipping.

---

## Section 5: W12 — Featured Image Generation

### Context
Each article needs two images: a hero image (AI-generated financial visualization) and an OG card (branded card for social sharing). Both stored permanently on R2.

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ article_id }`)

#### Step 1: Fetch Article
GET article from NocoDB by ID. Extract: title, ticker, verdict_type, key_takeaways[0], blog.

#### Step 2: Generate Hero Image
POST to Nano Banana Pro (kie.ai) API:
- Prompt: `"Professional financial data visualization for {ticker} {company_name}, showing {verdict_type.toLowerCase()} sentiment. Navy blue background (#002A5E), clean modern style, stock chart elements, no text overlay. 1200x630."`
- Use existing kie.ai API key
- Wait for generation (poll if async)

#### Step 3: Generate OG Card
POST to screenshot server (`http://host.docker.internal:3456`):
- HTML template with:
  - EarlyInsider logo (top left)
  - Verdict badge (color-coded: BUY=green, SELL=red, CAUTION=amber, WAIT=blue, NO_TRADE=gray)
  - Article title (Montaga font, white on navy)
  - Ticker symbol (large, Space Mono)
  - First key takeaway (truncated to 1 line)
  - URL: earlyinsider.com
- Viewport: 1200x630
- Output: PNG

#### Step 4: Upload to R2
Upload both images to Cloudflare R2:
- Hero: `earlyinsider/images/{slug}_hero.png`
- OG: `earlyinsider/images/{slug}_og.png`
- Public URLs via R2 public bucket URL

Use the same R2 upload pattern as the Toxic or Nah content library (S3 API with AWS Sig V4 via `require('crypto')`).

#### Step 5: Update NocoDB
- PATCH Articles record: `hero_image_url`, `og_image_url`
- POST Published_Images: two records (hero + og) linked to article

### Error Handling
- Nano Banana failure: skip hero image, use a generic fallback image per verdict_type (pre-generated, stored on R2)
- Screenshot server failure: retry once, then skip OG card (Next.js generates a basic one via next-seo defaults)

---

## Section 6: W13 — Cross-Linking Workflow

### Context
After each new article publishes, find related articles and create bidirectional links. Two types: inline anchor text links (SEO value) and a Related Articles HTML section (user navigation).

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ article_id }`)

#### Step 1: Fetch New Article
GET article from NocoDB by ID. Extract: ticker, sector, primary_keyword, body_html, blog.

#### Step 2: Find Related Articles
Query NocoDB Articles where:
1. `ticker = new_article.ticker AND id != new_article.id` (same ticker, highest priority)
2. `sector = new_article.sector AND blog = new_article.blog` (same sector)
3. Published within last 90 days
4. status = 'published'
5. LIMIT 5, ordered by relevance (same ticker first, then sector, then date)

#### Step 3: Generate Inline Links (Code Node — `cross-link.js`)
For each related article:
- Scan new article's body_html for natural phrases that could link to the related article (e.g., if related article is about NVDA earnings and new article mentions "NVIDIA's Q1 results", link that phrase)
- Scan related article's body_html for natural phrases that could link back to new article
- Rules:
  - Max 3 outbound links in new article
  - Max 1 inbound link added to each related article
  - No links inside `<h2>`, `key-takeaways` div, or `verdict` div
  - Anchor text must be natural (3-8 words)
  - No duplicate links (same target article)

**HTML parsing**: Use `cheerio` (lightweight jQuery-like HTML parser) in the n8n Code node. Do NOT use regex on HTML — it will inject links inside existing `<a>` tags, `<img>` alt attributes, or other attributes. With cheerio: parse HTML → extract text nodes → match phrases → wrap in `<a>` → serialize back. This is the ONLY safe approach.

Install cheerio: add to n8n's Docker image or use `require('cheerio')` if available in the sandbox.

#### Step 4: Generate Related Articles Section
Build HTML block:
```html
<section class="related-articles">
  <h2>Related Analysis</h2>
  <div class="related-grid">
    <!-- For each related article (max 4): -->
    <a href="/blog/{slug}" class="related-card">
      <span class="verdict-badge {verdict_type}">{verdict_type}</span>
      <h3>{title}</h3>
      <p>{meta_description}</p>
    </a>
  </div>
</section>
```

Do NOT append this HTML to `body_html`. Instead, populate the `related_articles` JSON field in NocoDB with the array of related article IDs. The Next.js frontend renders the Related Articles section dynamically from this field. This keeps presentation separate from content — if the UI changes, no database migration needed.

**Idempotency**: Before inserting inline links, check if an `<a href="/blog/{slug}">` already exists in the HTML to avoid duplicate links on re-runs. For related_articles, overwrite the entire array.

#### Step 5: Write Updates to NocoDB
- PATCH new article: updated `body_html` (with inline links + Related Articles section), updated `related_articles` JSON
- PATCH each modified related article: updated `body_html` (with inbound link)

#### Step 6: Return Success
W13 does NOT trigger Netlify rebuild — the calling workflow (W2) handles the single rebuild after both W12 and W13 complete. This prevents deployment thrashing from multiple rebuilds.

---

## Section 7: Blog Integration (Next.js Site)

### Context
The EarlyInsider site has empty /blog and /blog/[slug] routes. They need to fetch articles from NocoDB and render them with proper SEO.

### What to Do

#### /blog Page (Article Listing)
- SSR with ISR (revalidate every 5 minutes)
- Fetch from NocoDB: `GET /Articles?where=(blog,eq,insiderbuying)~and(status,eq,published)&sort=-published_at&limit=12&offset={page*12}`
- **Important**: use `?fields=id,title,slug,hero_image_url,verdict_type,ticker,meta_description,published_at,word_count,key_takeaways` — do NOT fetch `body_html` for the listing page (it's massive and not needed for cards)
- Display: article card grid with hero image, title, verdict badge, ticker, date, word count, first key takeaway
- Filter bar: verdict type dropdown, sector dropdown, ticker search input
- Pagination: page numbers with Previous/Next

#### /blog/[slug] Page (Article Detail)
- SSR with ISR (revalidate every 10 minutes)
- Fetch single article by slug from NocoDB
- Render body_html as dangerouslySetInnerHTML (pre-sanitized at write time)
- Components around the article:
  - Key Takeaways box (styled, above article)
  - Author card (Ryan Cole or Dexter Research, depending on author_name)
  - Table of Contents (generated from H2 headings in body_html)
  - Reading time estimate (word_count / 200)
  - Share buttons (X, LinkedIn, copy link)
  - Newsletter signup CTA (bottom, non-intrusive)

#### SEO (using next-seo)
- `<ArticleJsonLd>` on /blog/[slug]: author, datePublished, publisher (EarlyInsider), images
- `<NextSeo>` with title, meta_description, canonical URL, og:image
- next-sitemap generates sitemap including all article slugs

#### NocoDB Access from Netlify
The Next.js site runs on Netlify, not on the VPS. To access NocoDB:
- **Option A**: Expose NocoDB via Traefik reverse proxy (e.g., `nocodb.earlyinsider.com`) — simple but security risk
- **Option B**: Create Next.js API routes `/api/articles` and `/api/articles/[slug]` that proxy to NocoDB — keeps NocoDB URL server-side only
- **Recommended**: Option B — more secure, allows input validation and caching, NocoDB stays unexposed

Create a **read-only NocoDB API token** (Viewer role) specifically for Next.js. Do NOT reuse the n8n write token.

**Revalidation API route**: Create `/api/revalidate` with a secret token. n8n calls this after article publish to trigger on-demand ISR for the specific article + blog index page. This replaces full Netlify rebuilds.

Add `NOCODB_API_URL`, `NOCODB_READONLY_TOKEN`, and `REVALIDATION_SECRET` to Netlify environment variables.

---

## Section 8: End-to-End Testing & Monitoring

### Manual Test Sequence
1. **NocoDB setup**: verify all 4 tables exist with correct schemas
2. **Insert test keyword**: manually add "AAPL insider buying Q1 2026" with status='new', blog='insiderbuying'
3. **Run Dexter standalone**: call webhook with `{ ticker: "AAPL", keyword: "AAPL insider buying Q1 2026", article_type: "B", blog: "insiderbuying" }`. Verify: JSON response with all data fields, Financial_Cache populated
4. **Run W2 standalone**: trigger manually. Verify: picks keyword, calls Dexter, generates article, passes quality gate, writes to NocoDB, triggers W12 + W13
5. **Check article on site**: verify /blog lists the article, /blog/{slug} renders correctly with proper SEO
6. **Check images**: verify hero + OG images on R2, linked in NocoDB
7. **Check cross-links**: after 2nd article on same ticker, verify bidirectional links
8. **Run W1**: trigger manually with DataForSEO. Verify: 21 keywords in NocoDB
9. **Schedule test**: enable all schedules, verify 3 articles generated next day without overlap

### Monitoring (Telegram Alerts)
- W2 success: article title, ticker, verdict, URL
- W2 failure: keyword, error type, quality gate details
- W1 success: N keywords generated per blog
- Dexter failure: ticker, which API calls failed
- Low keyword inventory: < 7 'new' keywords warning
- Google Indexing: submission confirmation or failure

### Cost Tracking
Per article: ~$0.04-0.13 (Claude $0.03-0.08 + Financial Datasets $0.01-0.05)
Per week: ~$0.84-2.73 (21 articles)
Per month: ~$3.60-11.70 (90 articles)
Image gen: ~$0.01/article (Nano Banana)
DataForSEO: depends on plan, check monthly usage

---

## Section 9: Configuration & Environment Variables

### n8n Environment Variables
```
NOCODB_BASE_URL=http://nocodb:8080/api/v1/db/data/noco/EarlyInsider/EarlyInsider
NOCODB_API_TOKEN=<generated in NocoDB settings>
FINANCIAL_DATASETS_API_KEY=<from financialdatasets.ai>
DATAFORSEO_LOGIN=<from dataforseo.com>
DATAFORSEO_PASSWORD=<from dataforseo.com>
ANTHROPIC_API_KEY=<Claude API key>
KIE_API_KEY=<Nano Banana Pro key, existing>
GOOGLE_INDEXING_SERVICE_ACCOUNT=<JSON key, base64 encoded>
R2_ACCOUNT_ID=<existing from Toxic or Nah>
R2_ACCESS_KEY_ID=<existing>
R2_SECRET_ACCESS_KEY=<existing>
R2_PUBLIC_URL=https://pub-6e119e86bbae4479912db5c9a79d8fed.r2.dev
NETLIFY_REBUILD_WEBHOOK=<from Netlify build hooks>
TELEGRAM_BOT_TOKEN=<existing>
TELEGRAM_CHAT_ID=<for EarlyInsider alerts>
SCREENSHOT_SERVER_URL=http://host.docker.internal:3456
```

### Netlify Environment Variables (for Next.js site)
```
NOCODB_API_URL=https://nocodb.earlyinsider.com/api/v1/db/data/noco/EarlyInsider/EarlyInsider
NOCODB_API_TOKEN=<same token>
```

### n8n Code Files
All code in `n8n/code/insiderbuying/`:
- `dexter-research.js` — Dexter aggregation + cache logic
- `select-keyword.js` — W1 seed generation + DataForSEO integration + scoring
- `generate-article.js` — W2 variable interpolation + quality gate + Claude response parsing
- `generate-image.js` — W12 Nano Banana prompt + screenshot server template + R2 upload
- `cross-link.js` — W13 anchor text finder + Related Articles HTML builder

### Workflow JSON Files
- `n8n/workflows/insiderbuying/dexter-research.json`
- `n8n/workflows/insiderbuying/w1-keyword-selection.json`
- `n8n/workflows/insiderbuying/w2-article-generation.json`
- `n8n/workflows/insiderbuying/w12-image-generation.json`
- `n8n/workflows/insiderbuying/w13-cross-linking.json`

---

## Implementation Order

The sections should be implemented in this order (each builds on the previous):

1. **Section 1**: NocoDB setup — foundation for everything
2. **Section 2**: Dexter Research Agent — data pipeline
3. **Section 3**: W1 Keyword Selection — feed the pipeline
4. **Section 4**: W2 Article Generation — the core workflow
5. **Section 5**: W12 Image Generation — visual assets
6. **Section 6**: W13 Cross-Linking — SEO optimization
7. **Section 7**: Blog Integration — make articles visible
8. **Section 8**: Testing & monitoring — verify everything works
9. **Section 9**: Configuration — env vars and file organization (setup incrementally as needed)

Sections 5, 6, and 7 can be parallelized after section 4 is complete.
