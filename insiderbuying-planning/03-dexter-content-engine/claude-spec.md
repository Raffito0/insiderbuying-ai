# 03 — Dexter Content Engine: Combined Specification

## What We're Building
A fully automated content generation pipeline for EarlyInsider.com (and future blogs). The pipeline takes a keyword, researches the associated company/ticker via financial APIs, generates a publication-quality article via Claude Sonnet 4.6, creates images, adds cross-links, publishes to the site, and submits to Google for instant indexation.

The pipeline runs 3x/day and produces articles indistinguishable from those written by a senior equity analyst.

## System Architecture

```
Weekly (Sunday):
  W1: DataForSEO → 21 ranked keywords → NocoDB Keywords table

3x/day (8AM, 1PM, 6PM EST):
  W2 orchestrates:
    1. Pick top keyword from NocoDB
    2. Call Dexter (sub-workflow):
       → Financial Datasets API (income, balance, cash flow, ratios, insider trades, prices, competitors)
       → Web search (news, analyst ratings)
       → Earnings call transcripts
       → Cache in NocoDB Financial_Cache
       → Output: structured JSON for prompt variables
    3. Interpolate variables into FINANCIAL-ARTICLE-SYSTEM-PROMPT.md
    4. Claude Sonnet 4.6 API call → JSON article
    5. 14-point quality gate → retry if fail (max 2)
    6. Write to NocoDB Articles table
    7. Trigger W12 (images) + W13 (cross-links)
    8. Trigger Netlify rebuild
    9. Google Indexing API submit

After each article:
  W12: Nano Banana Pro hero image + screenshot server OG card → R2 → NocoDB
  W13: Claude finds anchor text in related articles → inline links + Related Articles section → NocoDB PATCH
```

## Data Layer: NocoDB (PostgreSQL-backed)

### Tables Required

**Keywords**
- id, keyword, ticker, article_type (A/B/C/D), search_volume, difficulty, cpc, intent_multiplier, priority_score, secondary_keywords[], status (new/used/skipped), blog (insiderbuying/deepstockanalysis/dividenddeep), created_at, used_at

**Articles**
- id, slug, title, meta_description, body_html, verdict_type, verdict_text, key_takeaways[], word_count, primary_keyword, secondary_keywords_used[], data_tables_count, filing_citations_count, confidence_notes, ticker, sector, company_name, blog, hero_image_url, og_image_url, author_name, status (published/draft/error), published_at, created_at

**Financial_Cache**
- id, ticker, data_type (income_stmt/balance_sheet/cash_flow/ratios/insider_trades/prices/competitors/transcripts), data_json, fetched_at, expires_at

**Published_Images**
- id, article_id, image_type (hero/og), r2_url, prompt_used, created_at

### NocoDB API
- REST API at `http://localhost:8080/api/v1/` (same Docker network as n8n)
- Auth: API token in header `xc-auth: <token>`
- CRUD: GET/POST/PATCH/DELETE on `/db/data/noco/{org}/{project}/{table}`
- No rate limits (self-hosted)

## Multi-Blog Routing
The system prompt's `{{BLOG}}` variable controls:
- Voice calibration (analyst style per blog)
- Author name (Ryan Cole vs Dexter Research)
- Keyword seed strategy (insider patterns vs earnings vs dividends)
- Article type distribution weights

W1 generates keywords per blog. W2 picks from the correct blog's keyword queue.

Blogs:
1. **insiderbuying** (EarlyInsider.com) — insider trading signals, Form 4 analysis
2. **deepstockanalysis** — full-spectrum equity analysis, earnings deep dives
3. **dividenddeep** — dividend sustainability, income strategy

Day 1: only insiderbuying is active. Others activate when their sites are ready.

## External APIs

### Financial Datasets API (financialdatasets.ai)
- Income statements, balance sheets, cash flow, ratios, insider trades, stock prices, competitor data
- API key auth
- Cache layer: check NocoDB Financial_Cache before each API call, skip if data < 24h old
- Parallel fetching: all 7 data types fetched concurrently per ticker

### DataForSEO API (dataforseo.com)
- Keyword research: volume, difficulty, CPC, related keywords
- SERP analysis: top 10 results for gap identification
- Weekly run produces 21 keywords (3/day * 7 days)
- Priority scoring: `volume * (1 - difficulty/100) * intent_multiplier`

### Claude Sonnet 4.6 API (Anthropic)
- Model: `claude-sonnet-4-6-20250514`
- Temperature: 0.6
- Max tokens: 6K (short), 8K (medium), 12K (long)
- System prompt: 225-line FINANCIAL-ARTICLE-SYSTEM-PROMPT.md with 18 interpolated variables
- Output: JSON with 14 required fields
- Quality gate: 14 programmatic checks, 2 retries on failure

### Nano Banana Pro (kie.ai)
- Hero image generation from article title + ticker + verdict
- 1200x630 output
- Existing API key from Toxic or Nah project

### Screenshot Server (VPS localhost:3456)
- HTML → PNG rendering for OG cards
- Already running on VPS for Toxic or Nah
- Template: article title, verdict badge, ticker, key takeaway, site branding

### Google Indexing API
- POST URL_UPDATED notification after each article publish
- Service account auth (JSON key)
- 200 requests/day limit (enough for 3 articles + buffer)
- Fallback: daily cron with google-indexing-script reading sitemap

### Cloudflare R2
- Permanent storage for hero images + OG cards
- Same bucket as Toxic or Nah: `toxic-or-nah` (or create separate `earlyinsider`)
- Public URL for CDN delivery

## n8n Implementation Notes
- All code in `n8n/code/insiderbuying/` directory
- n8n sandbox: no global fetch — polyfill with `require('https')`
- n8n Code nodes handle all business logic
- Sub-workflow pattern: W2 calls Dexter via webhook
- Error handling: catch at each step, log to NocoDB, alert via Telegram on failure
- Schedule triggers: cron expressions in n8n UI

## Blog Integration (Next.js site)
- `/blog` page: SSR, fetches from NocoDB Articles where blog='insiderbuying', status='published'
- `/blog/[slug]` page: SSR, fetches single article by slug
- Next.js API route `/api/revalidate` for on-demand ISR after article publish
- NocoDB accessed from Next.js via API (VPS IP, not localhost — site runs on Netlify)

## Cross-Linking Strategy (W13)
Two types:
1. **Inline links** (2-3 per article): Claude analyzes body_html of new + related articles, finds natural anchor text phrases, inserts `<a>` tags. No links in Key Takeaways or Verdict sections.
2. **Related Articles section**: HTML block appended to body_html with 3-5 related article cards (title, verdict badge, excerpt).

Bidirectional: new article links to old, old articles get 1 link back to new.

## Quality & Safety
- 14-point quality gate catches: missing fields, banned phrases, wrong length, missing keyword placement, fabricated numbers (cross-check vs Financial_Cache)
- Max 2 retries with specific feedback to Claude
- Articles with quality_gate_pass=false are saved as status='error' for manual review
- No financial advice disclaimers needed in article body (handled by site footer/legal pages)
- body_html sanitized before NocoDB write (strip script tags, event handlers)

## Acceptance Criteria
1. Dexter gathers complete financial data for any ticker
2. Dexter caches in NocoDB (no redundant API calls within 24h)
3. W1 produces 21 scored keywords per week per blog
4. W2 generates articles passing all 14 quality gate checks
5. Zero banned phrases in output
6. W12 generates hero + OG images
7. W13 adds inline cross-links + Related Articles section
8. Full pipeline runs end-to-end: keyword → Dexter → Claude → images → cross-links → Netlify rebuild → Google Indexing
9. 3 articles/day schedule with no overlap or race conditions
10. Multi-blog routing works (different voice/author per blog)
