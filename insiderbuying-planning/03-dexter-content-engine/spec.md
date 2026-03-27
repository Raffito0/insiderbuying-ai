# 03 — Dexter Content Engine

## Summary
Build the complete content generation pipeline: Dexter pre-research agent + 4 n8n workflows (W1 Keyword Selection, W2 Article Generation, W12 Featured Images, W13 Cross-linking). This is the core revenue engine — articles drive SEO traffic, which drives subscriptions.

## Timeline: Days 1-3 (12-16 hours)

## Dependencies
- 01-infrastructure (Airtable base with Articles/Keywords/Financial_Cache/Published_Images tables, API keys)

## Workflows

### Dexter Research Agent (new workflow, prerequisite for W2)
**Purpose**: Automated pre-research that gathers everything Claude needs to write a high-quality article.

**Trigger**: Called by W2 before article generation (webhook or sub-workflow call)

**Input**: `{ ticker, keyword, article_type }`

**Pipeline**:
1. **Financial Datasets API** — fetch in parallel:
   - Income statement (last 4 quarters + last 3 annual)
   - Balance sheet (latest quarter)
   - Cash flow statement (last 4 quarters)
   - Key ratios (current + 3Y historical)
   - Insider trades (last 90 days)
   - Stock price history (1 year daily)
   - Competitor data (same sector, top 5 by market cap)
2. **Earnings call transcripts** — Financial Datasets API or fallback web search for recent quotes
3. **Management quotes extraction** — parse transcripts for CEO/CFO quotes with context
4. **Web search** (Google Search API or SerpAPI) — recent news, analyst ratings, controversy
5. **Cache layer** — check Airtable Financial_Cache before API calls, skip if data < 24h old
6. **Aggregation** — structure all data into the JSON format expected by FINANCIAL-ARTICLE-SYSTEM-PROMPT.md variables

**Output**: Structured JSON matching prompt variables:
```json
{
  "company_name": "string",
  "ticker": "string",
  "sector": "string",
  "market_cap": "string",
  "financial_data": { ... },
  "insider_trades": [ ... ],
  "stock_prices": { ... },
  "competitor_data": { ... },
  "management_quotes": [ ... ],
  "dexter_analysis": { "key_findings": [], "risks": [], "catalysts": [] }
}
```

**Cost per call**: ~$0.01-0.05 (Financial Datasets API pricing)

### W1 — Keyword Selection
**Schedule**: Weekly, Sunday midnight EST

**Pipeline**:
1. **DataForSEO API** — Keyword research:
   - Seed keywords: insider buying/selling patterns for trending tickers
   - Google Keyword Planner data: volume, CPC, competition
   - Related keywords expansion
   - SERP analysis for top 10 results (identify content gaps)
2. **Intent classification** — map each keyword to article type (A/B/C/D) using keyword signals:
   - Type A (data-heavy): earnings, analysis, forecast, valuation, revenue
   - Type B (narrative): why, how, signal, insider, buying, selling
   - Type C (comparative): vs, compare, best, top, alternative
   - Type D (editorial): strategy, guide, opinion, approach, should
3. **Priority scoring** — `score = volume * (1 - difficulty/100) * intent_multiplier`
   - Intent multiplier: A=1.0, B=1.2, C=0.8, D=0.9 (narrative articles convert better)
4. **Dedup** — check against existing Keywords table, skip already-used keywords
5. **Write to Airtable** — Keywords table, status='new', top 21 keywords (3/day * 7 days)

**Fallback** (DataForSEO key not yet acquired): Manual keyword input mode — accept CSV or direct Airtable entry. W2 picks from Keywords table regardless of source.

### W2 — Article Generation
**Schedule**: 3x/day (8AM, 1PM, 6PM EST)

**Pipeline**:
1. **Pick keyword** — query Airtable Keywords where status='new', ORDER BY priority_score DESC, LIMIT 1
2. **Extract ticker** — parse ticker from keyword (regex or simple NLP)
3. **Call Dexter** — webhook to Dexter workflow with `{ ticker, keyword, article_type }`
4. **Wait for Dexter** — webhook response or polling (depending on execution time)
5. **Prepare prompt** — interpolate all variables into FINANCIAL-ARTICLE-SYSTEM-PROMPT.md template:
   - `{{BLOG}}` = 'insiderbuying'
   - `{{ARTICLE_TYPE}}` from keyword intent
   - `{{TARGET_LENGTH}}` = weighted random (30% short, 50% medium, 20% long)
   - `{{AUTHOR_NAME}}` = 'Ryan Cole'
   - All financial data from Dexter output
6. **Claude API call** — Sonnet 4.6, temperature 0.6, max tokens per length tier (6K/8K/12K)
7. **Parse response** — extract JSON, validate all required fields
8. **Quality gate** — verify 14-point checklist programmatically:
   - Title length 55-65 chars
   - Meta description 140-155 chars
   - 3-4 key takeaways each with a number
   - Verdict section exists with position + threshold + metrics
   - Zero banned phrases (regex scan)
   - Word count in target range
   - Primary keyword in title + first 100 words + at least one H2
9. **If quality gate fails** — retry with feedback (max 2 retries)
10. **Write to Airtable** — Articles table, status='published', published_at=now()
11. **Trigger image gen** — call W12 with article record ID
12. **Trigger cross-linking** — call W13
13. **Update keyword status** — set keyword status='used'
14. **Trigger Netlify rebuild** — webhook to rebuild site with new article
15. **Trigger W7** — X auto-post for new article
16. **Google Indexing API submit** — call google-indexing-script to bulk-submit the new article URL for instant indexation (< 48h vs weeks for new sites)

**Cost per article**: ~$0.03-0.08 (Claude) + ~$0.01-0.05 (Dexter APIs) = ~$0.04-0.13/article

### W12 — Featured Image Generation
**Trigger**: Called by W2 after article is written

**Pipeline**:
1. **Hero image** — Nano Banana Pro API:
   - Prompt: generate from article title + ticker + verdict (e.g., "NVIDIA stock chart analysis, professional financial visualization, dark navy background")
   - Style: match site branding (navy background, clean, professional)
   - Size: 1200x630 (Open Graph standard)
2. **OG card** — Puppeteer screenshot:
   - HTML template: article title, verdict badge, ticker, key takeaway, site branding
   - Render at 1200x630
   - Save as PNG
3. **Upload both** to R2 (permanent URLs)
4. **Update Airtable** — Published_Images table + update Articles record with hero_image_url and og_image_url

**Cost per article**: ~$0.01 (Nano Banana) + $0 (Puppeteer self-hosted)

### W13 — Cross-linking
**Trigger**: Called by W2 after article is published

**Pipeline**:
1. **Find related articles** — query Airtable Articles where:
   - Same ticker (highest priority)
   - Same sector (medium priority)
   - Similar keywords (lower priority)
   - Published within last 90 days
   - LIMIT 5
2. **Generate link suggestions** — for each related article:
   - Find natural anchor text in the new article's body_html
   - Find natural anchor text in the related article's body_html
3. **Insert links** — modify body_html:
   - New article gets 2-3 internal links to related articles
   - Related articles get 1 link back to new article (if natural anchor exists)
4. **Update Airtable** — PATCH modified body_html for all affected articles
5. **Trigger Netlify rebuild** — if any existing articles were modified

**Rules from master doc**:
- Max 3-5 internal links per article
- Links must use natural anchor text (not "click here" or "read more")
- No links in Key Takeaways or Verdict sections
- Cross-links should connect related tickers, sectors, or themes

## n8n Code Files
All workflow logic in `n8n/code/insiderbuying/`:
- `dexter-research.js` — Dexter aggregation logic
- `select-keyword.js` — W1 keyword scoring + DataForSEO integration
- `generate-article.js` — W2 prompt interpolation + quality gate
- `generate-image.js` — W12 Nano Banana + Puppeteer OG
- `cross-link.js` — W13 related article finder + link inserter

## Instant Indexation (google-indexing-script, goenning/google-indexing-script, 7.6k stars)

**Purpose**: New sites take weeks to get pages crawled. With 3 articles/day, we need Google to discover and index new URLs within 48h, not 2-3 weeks.

**Integration in W2 post-publish step (step 16)**:
1. After Netlify rebuild webhook fires, wait 60s for deploy to complete
2. Call Google Indexing API via n8n Code node:
   - Endpoint: `POST https://indexing.googleapis.com/v3/urlNotifications:publish`
   - Body: `{ "url": "https://earlyinsider.com/blog/{slug}", "type": "URL_UPDATED" }`
   - Auth: Google Service Account with Indexing API enabled
3. Also submit sitemap URL to Search Console API after each batch of articles

**Setup requirements**:
- Google Cloud Console: enable "Indexing API"
- Service account with JSON key → store in n8n credentials
- Add service account email as Owner in Google Search Console (earlyinsider.com property)
- Rate limit: 200 requests/day (enough for 3 articles + re-submissions)

**Alternative**: Run `npx google-indexing-script https://earlyinsider.com` as daily cron (reads sitemap, submits all new URLs). Can run from VPS via n8n Execute Command node.

**Note**: Google Indexing API is officially for JobPosting/BroadcastEvent, but widely used for all page types (7.6k stars, no reported enforcement). Worst case: stops working, we fall back to normal sitemap-based discovery.

## Technical Notes
- Financial Datasets API rate limits: check docs, implement exponential backoff
- Claude Sonnet 4.6 API: use `claude-sonnet-4-6-20250514`, stream=false for JSON parsing
- Nano Banana Pro: check kie.ai API docs for current endpoint
- Puppeteer OG: run on VPS (same Docker host as n8n), or use a screenshot service
- Airtable rate limit: 5 requests/second — batch operations where possible
- Article body_html: sanitize before storing (no XSS vectors)

## Acceptance Criteria
- [ ] Dexter gathers complete financial data for any given ticker
- [ ] Dexter caches data in Airtable (no redundant API calls within 24h)
- [ ] W1 produces 21 scored keywords per week (or manual fallback works)
- [ ] W2 generates a valid article that passes all 14 quality gate checks
- [ ] W2 articles contain zero banned phrases
- [ ] W12 generates hero + OG images for each article
- [ ] W13 adds cross-links to new + related articles
- [ ] Full pipeline: keyword → Dexter → Claude → images → cross-links → Netlify rebuild → Google Indexing submit runs end-to-end
- [ ] Google Indexing API submits new article URL after each publish (verify in GSC)
- [ ] 3 articles/day schedule works without overlap or race conditions
