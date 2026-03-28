# Section 4: W2 -- Article Generation Workflow

## Context

The core orchestration workflow. Runs 3x/day, picks the best available keyword, calls Dexter for research, generates an article via Claude, runs quality gates, publishes, and triggers downstream workflows (W12 image generation, W13 cross-linking).

This section depends on Section 1 (NocoDB tables), Section 2 (Dexter Research Agent), and Section 3 (Keywords populated in NocoDB).

## Implementation

### Workflow Design

**Trigger**: Schedule -- 8:00 AM, 1:00 PM, 6:00 PM EST daily

**Pipeline**:

### Step 1: Pick Keyword

Query NocoDB Keywords: `(status=new OR (status=in_progress AND updated_at < NOW() - 1 hour))`, sorted by `priority_score DESC`, limit 1.

If no keywords available, log warning to Telegram and exit gracefully.

Set `keyword.status = 'in_progress'` and `updated_at = NOW()` to lock the keyword. The 1-hour timeout prevents zombie locks if n8n crashes mid-execution.

**Lock timeout query**: The `status=in_progress AND updated_at < NOW() - 1 hour` condition catches keywords that were locked but never completed (e.g., n8n crash, VPS restart). These are re-eligible for picking.

### Step 2: Extract & Validate Ticker

Code node (`generate-article.js`): parse ticker from keyword string.

- **Regex**: look for 1-5 uppercase letters
- **Common false positives to filter**: "A", "THE", "CEO", "BEST", "TOP", "FOR", "ALL", "ARE", "NEW"
- **Validation required**: extracted string must be validated against a known ticker list. Either maintain a cached list of valid US tickers in NocoDB, or make a lightweight HEAD request to Financial Datasets API (`/financials/income-statements?ticker={CANDIDATE}&limit=1`). If the ticker is invalid (404 or not found), set keyword status to `invalid_ticker` and skip.

### Step 3: Call Dexter

HTTP Request node: POST to Dexter webhook with `{ ticker, keyword, article_type, blog }`.
Wait for response (Dexter typically completes in 10-30s).

If Dexter returns `data_completeness < 0.5`, set keyword status to 'skipped', exit.

### Step 4: Determine Article Parameters

Code node:
- `TARGET_LENGTH` = weighted random: 30% short, 50% medium, 20% long
- `AUTHOR_NAME` = blog-dependent (insiderbuying -> 'Dexter Research', others -> 'Ryan Cole')
- `MAX_TOKENS` = length-dependent (6K/8K/12K)
- Prepare all 18 template variables from Dexter output

### Step 5: Variable Interpolation

Code node: read FINANCIAL-ARTICLE-SYSTEM-PROMPT.md template (stored as n8n static data or as a file on VPS). Replace all `{{VARIABLE}}` placeholders with actual values from step 4.

The variable interpolation code already exists in the system prompt document. Adapt it for NocoDB (was written for Airtable).

### Step 6: Claude API Call (with Tool Use)

HTTP Request node to Anthropic API:
- POST `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body uses **Tool Use** for guaranteed JSON output:
  - Define a tool `generate_article` with the exact article schema (title, meta_description, slug, key_takeaways[], body_html, verdict_type, verdict_text, word_count, etc.)
  - Set `tool_choice: {"type": "tool", "name": "generate_article"}`
  - Claude returns structured JSON via the tool call -- no regex parsing needed
  - `model: "claude-sonnet-4-6-20250514"`, `max_tokens: MAX_TOKENS`, `temperature: 0.6`

### Step 7: Extract Tool Result

Code node: extract the tool use result from Claude's response.
- Response structure: `message.content[0].type === "tool_use"` -> `message.content[0].input` is the article JSON
- No markdown fence stripping or regex needed -- the JSON is guaranteed valid by the API
- Validate required fields exist (safety check, should always pass with tool use)

### Step 8: Quality Gate (14 checks)

Code node (`generate-article.js` -- quality gate section):

1. Title length 55-65 chars
2. Meta description 140-155 chars
3. key_takeaways has exactly 3-4 items, each contains a number
4. verdict_type is one of BUY / SELL / CAUTION / WAIT / NO_TRADE
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

### Step 8.5: Sanitize HTML

Before writing to NocoDB, sanitize `body_html` using `sanitize-html` (or equivalent in n8n Code node):

- **Allowlist tags**: `h2, h3, p, table, thead, tbody, tr, th, td, blockquote, strong, em, a, ul, ol, li, span`
- **Allowlist attrs**: `href` (on `a` only, must start with `/` or `https://`), `class` (on `p` and `section` only)
- **Strip**: `script, iframe, style, on*` attributes, `data-*` attributes
- **External links**: add `rel="nofollow noopener noreferrer"`

This prevents stored XSS since `/blog/[slug]` uses `dangerouslySetInnerHTML`.

### Step 8.6: Ensure Unique Slug

Check NocoDB for existing article with same slug. If collision, append date suffix: `{slug}-{YYMM}` (e.g., `nvda-earnings-analysis-2603`). This prevents constraint violations for recurring topics.

### Step 9: Write to NocoDB

POST to NocoDB Articles table with all fields. Set `status='enriching'` (NOT 'published' yet), `published_at=NOW()`, `quality_gate_pass=true`.

### Step 10: Update Keyword

PATCH keyword status to 'used', set `used_at=NOW()`.

### Step 11: Trigger Downstream (SEQUENTIAL -- not parallel)

**Critical**: These must run sequentially. If Netlify rebuilds before W12/W13 finish, the site deploys with broken image URLs and missing cross-links.

1. **W12 webhook** with article ID -> image generation -> **wait for completion**
2. **W13 webhook** with article ID -> cross-linking -> **wait for completion**
3. **PATCH article status** to `'published'` in NocoDB (only after images + cross-links are ready)
4. **On-demand revalidation** instead of full Netlify rebuild: POST to `https://earlyinsider.com/api/revalidate?secret=REVALIDATION_TOKEN&slug={slug}`. This updates only the specific article page + /blog index in milliseconds, without rebuilding the entire site. Create this API route in Next.js.

**W12/W13 webhook config**: Both sub-workflows MUST have "Respond to Webhook" set to "When Last Node Finishes" so W2 actually waits for completion. Otherwise n8n fires-and-forgets and Step 11 races ahead.

### Step 12: Google Indexing API Submit

After revalidation:
- POST `https://indexing.googleapis.com/v3/urlNotifications:publish`
- Body: `{ "url": "https://earlyinsider.com/blog/{slug}", "type": "URL_UPDATED" }`
- Auth: Google service account JWT

### Step 13: Notify

Telegram message with article summary: title, ticker, verdict, word count, quality gate status, article URL.

### Race Condition Prevention

The 3 daily triggers are spaced 5 hours apart. Each execution locks its keyword (`status='in_progress'`). If an execution takes longer than expected and overlaps with the next, the second execution picks a different keyword.

Add a guard: if an execution with the same blog is still running (`status='in_progress'` keyword exists), wait 2 minutes and retry. Max 3 waits before skipping.

### Code File

`n8n/code/insiderbuying/generate-article.js` -- W2 variable interpolation + quality gate + Claude response parsing

### Workflow JSON

`n8n/workflows/insiderbuying/w2-article-generation.json`

## Tests (TDD)

```
# Test: Keyword picker -- selects highest priority_score keyword with status='new'
# Test: Keyword picker -- ignores status='used' and status='skipped' keywords
# Test: Keyword picker -- selects stale in_progress keyword (updated_at > 1 hour ago)
# Test: Keyword lock -- after picking, keyword status = 'in_progress' and updated_at is fresh
# Test: Keyword lock -- two concurrent picks don't select the same keyword
# Test: Ticker extraction -- "NVDA earnings analysis Q1 2026" extracts "NVDA"
# Test: Ticker extraction -- "best dividend stocks 2026" extracts no ticker (skip or fallback)
# Test: Ticker extraction -- filters false positives: "THE", "CEO", "BEST", "FOR" are rejected
# Test: Ticker validation -- extracted ticker verified against Financial Datasets API (real AAPL = valid, ZZZZZ = invalid)
# Test: Invalid ticker -- keyword marked as 'invalid_ticker', not 'skipped'
# Test: Article type routing -- weighted random produces ~30% short, ~50% medium, ~20% long over 100 runs
# Test: Variable interpolation -- all 18 {{VARIABLE}} placeholders replaced with actual values
# Test: Claude Tool Use -- API call with tool schema returns structured JSON in tool_use content block
# Test: Claude Tool Use -- response type !== "tool_use" (safety refusal) logged and keyword marked skipped
# Test: Quality gate -- valid article passes all 14 checks
# Test: Quality gate -- missing title fails check #1, triggers retry
# Test: Quality gate -- banned phrase "it's worth noting" in body_html fails check #6
# Test: Quality gate -- paragraph density < 40% numeric fails check #7
# Test: Quality gate -- 2 failed retries saves article as status='error'
# Test: HTML sanitization -- <script> tag stripped from body_html before NocoDB write
# Test: HTML sanitization -- external link gets rel="nofollow noopener noreferrer"
# Test: Slug uniqueness -- existing slug "nvda-earnings" -> new slug becomes "nvda-earnings-2603"
# Test: Article lifecycle -- initial write sets status='enriching', not 'published'
# Test: Sequential downstream -- W12 completes before W13 starts, W13 completes before revalidation fires
# Test: Revalidation -- POST to /api/revalidate returns 200 and article appears updated on site
# Test: Google Indexing -- POST to Indexing API with valid service account returns success
# Test: Telegram notification -- success message contains title, ticker, verdict, URL
# Test: Empty keyword queue -- no keywords available -> Telegram warning, graceful exit (no crash)
```

### Test Implementation Notes

- **Keyword picker tests**: Pre-populate NocoDB Keywords table with 5 keywords: 2 with status='new' (priority 100 and 200), 1 with status='used', 1 with status='skipped', 1 with status='in_progress' and updated_at = 2 hours ago. Run the picker. Assert it selects the priority=200 'new' keyword first. Run again. Assert it selects the priority=100 'new' keyword. Run again. Assert it selects the stale 'in_progress' keyword.
- **Keyword lock test**: After picking, immediately query the keyword. Assert status='in_progress' and updated_at is within the last 5 seconds.
- **Concurrent pick test**: Fire 2 picker calls simultaneously (Promise.all or n8n parallel). Assert they pick DIFFERENT keywords (no double-pick of the same keyword).
- **Ticker extraction tests**: Create test cases: "NVDA earnings analysis Q1 2026" -> "NVDA", "best dividend stocks 2026" -> null/empty, "THE BEST CEO stocks" -> null (all words are false positives), "AAPL vs MSFT comparison" -> "AAPL" (first match).
- **Ticker validation test**: Call Financial Datasets API with "AAPL" -> expect valid response. Call with "ZZZZZ" -> expect 404 or empty. Assert the code sets keyword status to 'invalid_ticker' for the invalid case.
- **Article type routing test**: Run the weighted random function 100 times. Count occurrences. Assert: short ~25-35%, medium ~45-55%, long ~15-25% (with reasonable variance).
- **Variable interpolation test**: Create a mock template with 18 `{{VARIABLE}}` placeholders. Create a mock Dexter output with values for all 18. Run interpolation. Assert zero `{{` remain in the output.
- **Claude Tool Use test**: Make a real API call to Anthropic with the tool schema and a minimal prompt. Assert `response.content[0].type === "tool_use"` and `response.content[0].input` contains `title`, `body_html`, `verdict_type`.
- **Claude safety refusal test**: Mock a response where `content[0].type === "text"` (refusal). Assert the code logs the refusal and marks the keyword as 'skipped'.
- **Quality gate tests**: Create mock article objects that pass all 14 checks, then create variants that fail each individual check. Assert the gate correctly identifies each failure.
- **Banned phrase test**: Insert "it's worth noting" into a mock article's body_html. Assert check #6 fails.
- **Paragraph density test**: Create body_html with 10 paragraphs, only 3 containing numbers. Assert check #7 fails (30% < 40% threshold).
- **Quality gate retry test**: Mock Claude to return a failing article twice, then a passing one on 3rd call. Assert 2 retries happen. Mock Claude to fail 3 times. Assert article is saved as status='error'.
- **HTML sanitization test**: Create body_html containing `<script>alert('xss')</script>` and `<a href="https://evil.com">link</a>`. After sanitization, assert: no `<script>` tag exists, the `<a>` tag has `rel="nofollow noopener noreferrer"`.
- **Slug uniqueness test**: Pre-insert an article with slug "nvda-earnings" in NocoDB. Generate a new article that would produce the same slug. Assert the new slug is "nvda-earnings-2603" (with current year-month).
- **Article lifecycle test**: After Step 9 write, query the article. Assert status='enriching', NOT 'published'.
- **Sequential downstream test**: Mock W12 and W13 webhooks with artificial delays (e.g., 2s each). Verify W12 completes before W13 starts (check timestamps). Verify article status changes to 'published' only after both complete.
- **Revalidation test**: POST to the revalidation endpoint with the correct secret. Assert 200 response.
- **Google Indexing test**: POST to the Indexing API with a test URL. Assert the response indicates success.
- **Telegram test**: After a successful article generation, check Telegram for the notification message. Assert it contains the article title, ticker, verdict, and URL.
- **Empty queue test**: Clear all 'new' keywords from NocoDB. Trigger W2. Assert it sends a Telegram warning and exits without error.

## Acceptance Criteria

1. W2 triggers at 8:00 AM, 1:00 PM, 6:00 PM EST daily
2. Keyword picker selects the highest priority_score keyword with status='new' (or stale 'in_progress' > 1 hour)
3. Keyword is locked (status='in_progress', updated_at=NOW()) immediately after picking
4. Ticker is extracted from keyword string, false positives are filtered, and the ticker is validated against Financial Datasets API
5. Invalid tickers are marked as 'invalid_ticker' (not 'skipped')
6. Dexter is called with the correct payload and the response is used for article generation
7. If Dexter returns data_completeness < 0.5, keyword is marked 'skipped' and execution exits
8. Article parameters (length, author, max_tokens) are determined by weighted random
9. All 18 template variables are interpolated into the system prompt
10. Claude API is called with Tool Use, returning structured JSON
11. All 14 quality gate checks are applied; failures trigger retry with feedback (max 2 retries)
12. After 2 failed retries, article is saved as status='error' with quality gate notes
13. HTML is sanitized: script/iframe stripped, external links get nofollow, only allowlisted tags/attrs remain
14. Slug uniqueness is enforced with date suffix on collision
15. Article is written to NocoDB with status='enriching' (not 'published')
16. Keyword status is updated to 'used' with used_at=NOW()
17. W12 (images) completes before W13 (cross-links) starts -- sequential, not parallel
18. Article status changes to 'published' only after W12 and W13 both complete
19. On-demand revalidation fires after status='published' (not full Netlify rebuild)
20. Google Indexing API is called after revalidation
21. Telegram notification sent with title, ticker, verdict, URL
22. Empty keyword queue triggers Telegram warning and graceful exit
23. Race condition guard: concurrent executions pick different keywords
24. All 28 test stubs pass
