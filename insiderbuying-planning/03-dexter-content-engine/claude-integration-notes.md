# Integration Notes — Gemini Review Feedback

## INTEGRATING (9 suggestions)

### 1. Sequential downstream pipeline (Critical)
**Issue**: W12, W13, Netlify rebuild fire in parallel — site deploys with broken image URLs and missing cross-links. W13 triggers another rebuild causing deployment thrashing.
**Fix**: Make sequential: W2 → W12 (wait) → W13 (wait) → Netlify rebuild → Google Indexing. Single rebuild at the end.

### 2. Keyword lock timeout (Critical)
**Issue**: `status='in_progress'` keyword stays locked forever if n8n crashes.
**Fix**: Query includes: `status='new' OR (status='in_progress' AND updated_at < NOW() - 1 hour)`.

### 3. Use Cheerio for cross-linking HTML (Critical)
**Issue**: Regex on HTML will inject links inside `<a>`, `<img alt>`, or `<script>` tags.
**Fix**: Use `cheerio` in n8n Code node. Extract text nodes only, match, inject `<a>`, serialize back.

### 4. Aggregate price data before Claude (Performance)
**Issue**: 252 days of OHLCV bloats context window and increases cost.
**Fix**: In `dexter-research.js`, compute 52-week high/low, current price, 50/200 DMA, 1m/6m/1Y returns. Send summary, not raw array.

### 5. Use Claude Tool Use for JSON output (Quality)
**Issue**: Regex JSON extraction is fragile.
**Fix**: Define article schema as a tool, use `tool_choice: {"type": "tool", "name": "generate_article"}`. Guarantees valid JSON structure.

### 6. Relax quality gate check #7 (Quality)
**Issue**: "Zero sentences without a number" is impossible — articles need transitional sentences.
**Fix**: Change to density check: "At least 40% of paragraphs must contain a numeric metric or date."

### 7. Add database indexes (Performance)
**Issue**: Table scans will slow down as data grows.
**Fix**: Add indexes on Keywords(status, priority_score, blog), Articles(status, published_at, blog), Articles(ticker, sector).

### 8. Ticker validation against known list (Data Quality)
**Issue**: Regex ticker extraction will grab "A", "THE", "CEO", "BEST" as tickers.
**Fix**: Validate extracted ticker against Financial Datasets API (HEAD request or cached ticker list). Mark keyword as `invalid_ticker` if ticker not found.

### 9. Exclude body_html from blog listing query (Performance)
**Issue**: /blog page fetches all fields including massive body_html for card rendering.
**Fix**: Use `?fields=id,title,slug,hero_image_url,verdict_type,ticker,meta_description,published_at,word_count,key_takeaways` on listing queries.

## NOT INTEGRATING (5 suggestions)

### 10. Concurrent API rate limit check (Suggestion #5)
**Why not**: Financial Datasets API docs show 1000 req/min on Developer tier. 7 concurrent requests is well within limits. Will add note to check if issues arise.

### 11. Fuzzy keyword dedup crash (Suggestion #6)
**Why not**: Agree with the problem but disagree with the solution. Instead of dropping fuzzy match entirely, I'll use Postgres trigram similarity (`pg_trgm`) which runs server-side in NocoDB's PostgreSQL. No memory issue, still catches near-duplicates.

### 12. Screenshot server memory (Suggestion #10)
**Why not**: The screenshot server is already running for Toxic or Nah with no issues. OG cards are simple HTML (no JS, no complex rendering). Memory concern is theoretical for this workload.

### 13. Database backups (Suggestion #11)
**Why not**: Valid but out of scope for this split. This belongs in 01-infrastructure as a general VPS maintenance task.

### 14. Delisted/OTC stocks (Suggestion #13)
**Why not**: Already partially handled — Dexter returns `data_completeness < 0.5` when API returns 404, and keyword gets status='skipped'. The `invalid_ticker` distinction is nice but not critical for MVP.

---

## ITERATION 2 — Gemini + GPT-5.2 Review (post-integration)

### INTEGRATING (8 additional suggestions)

### 15. Dexter pre-analysis needs LLM call (Gemini)
**Issue**: `dexter_analysis` (key_findings, risks, catalysts) requires semantic understanding. A Code node can't do this.
**Fix**: Added lightweight Haiku/GPT-4o-mini call inside Dexter to generate the pre-analysis from aggregated data.

### 16. Don't embed Related Articles HTML in body_html (Gemini)
**Issue**: Hardcoding presentation HTML in the database is an anti-pattern — redesigns require DB migrations.
**Fix**: Store only `related_articles` JSON array. Next.js renders the UI component dynamically.

### 17. W12/W13 webhook "Respond to Webhook" config (Gemini)
**Issue**: n8n webhooks fire-and-forget by default. W2 won't actually wait for completion.
**Fix**: Set "Respond to Webhook" to "When Last Node Finishes" in W12 and W13 workflows.

### 18. Replace Netlify rebuild with on-demand ISR (GPT-5.2 + Gemini)
**Issue**: Full site rebuilds per article burn build minutes and don't scale.
**Fix**: Next.js `/api/revalidate` endpoint with secret token. Revalidates only the article page + blog index.

### 19. Sanitize body_html before DB write (GPT-5.2)
**Issue**: LLM-generated HTML + dangerouslySetInnerHTML = stored XSS vector.
**Fix**: Added sanitization step with tag/attr allowlist before NocoDB write.

### 20. Slug uniqueness with date suffix (GPT-5.2)
**Issue**: Claude will generate duplicate slugs for recurring topics (e.g., `nvda-earnings-analysis`).
**Fix**: Check for collision, append `-YYMM` suffix if needed.

### 21. Article lifecycle states (GPT-5.2)
**Issue**: Setting status='published' before images/cross-links exist creates inconsistent state.
**Fix**: `draft → enriching → published`. Only mark published after W12+W13 complete.

### 22. Read-only NocoDB token for Next.js (GPT-5.2)
**Issue**: Using the same write token for n8n and Next.js is a security risk.
**Fix**: Create separate Viewer role token for Next.js, proxy via API routes.

### NOT INTEGRATING (iteration 2)

### Claude output token limit (Gemini)
**Why not**: Gemini claimed Claude 3.5 Sonnet has 8192 output limit. This is wrong — Claude Sonnet 4.6 supports much higher output. Not an issue.

### Cache cleanup workflow (GPT-5.2)
**Why not**: Valid but out of scope for this split. Would be a simple daily cron DELETE — add during infrastructure maintenance.

### Atomic keyword claiming via Postgres (GPT-5.2)
**Why not**: The 1-hour lock timeout already handles this. True atomic UPDATE RETURNING requires raw SQL which NocoDB API doesn't support directly. The race window is <1 second at 3 executions/day spaced 5 hours apart — practically zero risk.
