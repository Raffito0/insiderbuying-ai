# Section 6: W13 — Cross-Linking Workflow

## Context

After each new article publishes, W13 finds related articles and creates bidirectional links for SEO value and user navigation. Two types of links are created: inline anchor text links within the article body (SEO value) and a `related_articles` JSON field for the frontend to render a Related Articles section (user navigation). W13 is called by W2 after W12 (image generation) completes. W2 waits for W13 to finish before marking the article as 'published' and triggering revalidation.

Critical design decision: the Related Articles section is NOT appended as HTML to `body_html`. Instead, the `related_articles` field stores a JSON array of related article IDs, and the Next.js frontend renders the section dynamically. This keeps presentation separate from content — if the UI changes, no database migration needed.

Code file: `n8n/code/insiderbuying/cross-link.js`
Workflow file: `n8n/workflows/insiderbuying/w13-cross-linking.json`

---

## Implementation

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ article_id }`)

**Critical**: The webhook MUST have "Respond to Webhook" set to "When Last Node Finishes" so W2 actually waits for completion. Otherwise n8n fires-and-forgets and W2's Step 11 races ahead.

### Step 1: Fetch New Article

GET article from NocoDB by ID. Extract: `ticker`, `sector`, `primary_keyword`, `body_html`, `blog`, `slug`, `id`.

NocoDB API pattern:
- `GET {NOCODB_BASE_URL}/Articles/{article_id}`
- Auth header: `xc-auth: {NOCODB_API_TOKEN}`

### Step 2: Find Related Articles

Query NocoDB Articles with the following priority-ordered logic:

1. **Same ticker** (highest priority): `ticker = new_article.ticker AND id != new_article.id`
2. **Same sector**: `sector = new_article.sector AND blog = new_article.blog`
3. **Recency**: Published within last 90 days
4. **Status filter**: `status = 'published'` only
5. **Limit**: 5 results maximum
6. **Ordering**: Same ticker first, then same sector, then by date (most recent first)

NocoDB query:
- `GET {NOCODB_BASE_URL}/Articles?where=(status,eq,published)~and(blog,eq,{blog})~and(id,ne,{article_id})&sort=-published_at&limit=5`
- Then sort in code: same ticker first, then same sector, then by published_at

If no related articles found, return gracefully with empty `related_articles` and no links added.

### Step 3: Generate Inline Links (Code Node — `cross-link.js`)

For each related article, perform bidirectional link injection:

**Forward links** (new article -> related articles):
- Scan new article's `body_html` for natural phrases that could link to each related article
- Example: if related article is about NVDA earnings and new article mentions "NVIDIA's Q1 results", wrap that phrase in an `<a>` tag

**Backward links** (related articles -> new article):
- Scan each related article's `body_html` for natural phrases that could link back to the new article
- Same matching logic as forward links

#### Link injection safety rules (MANDATORY):

1. **Max 3 outbound links** in the new article
2. **Max 1 inbound link** added to each related article (to avoid spamming old articles on every new publish)
3. **No links inside `<h2>` tags**
4. **No links inside the Key Takeaways section** (`key-takeaways` div)
5. **No links inside the Verdict section** (`verdict` div)
6. **Anchor text must be natural**: 3-8 words
7. **No duplicate links**: same target article cannot be linked twice
8. **No nested links**: never inject an `<a>` inside an existing `<a>` tag

#### HTML parsing with Cheerio (MANDATORY approach):

Use `cheerio` (lightweight jQuery-like HTML parser) in the n8n Code node. Do NOT use regex on HTML — regex will inject links inside existing `<a>` tags, `<img>` alt attributes, or other attributes.

Correct approach with cheerio:
1. Parse HTML with `cheerio.load(body_html)`
2. Extract text nodes only (skip elements inside `<a>`, `<h2>`, `<img>`, restricted sections)
3. Match phrases against related article titles/keywords
4. Wrap matched text in `<a href="/blog/{slug}">` tag
5. Serialize back to HTML string

Install cheerio: add to n8n's Docker image or use `require('cheerio')` if available in the sandbox.

#### Idempotency checks:

Before inserting any inline link, check if an `<a href="/blog/{slug}">` already exists in the HTML. This prevents duplicate links on re-runs of W13 (e.g., if W2 retries after a partial failure).

For the `related_articles` JSON field: overwrite the entire array on each run (idempotent by design).

### Step 4: Build Related Articles Data

Populate the `related_articles` JSON field in NocoDB with the array of related article IDs:

```json
[
  { "id": 45, "slug": "nvda-earnings-q1-2026", "title": "...", "verdict_type": "BUY", "meta_description": "..." },
  { "id": 32, "slug": "nvda-insider-buying-signal", "title": "...", "verdict_type": "CAUTION", "meta_description": "..." }
]
```

This is stored as a JSON string in the `related_articles` LongText field. The Next.js frontend parses this JSON and renders the Related Articles section dynamically. Max 4 articles in the related section (even though up to 5 are queried — the 5th is used for inline links only).

Do NOT append Related Articles HTML to `body_html`. The frontend handles rendering.

### Step 5: Write Updates to NocoDB

Two types of PATCH operations:

1. **PATCH new article**:
   - Updated `body_html` (with inline outbound links injected)
   - Updated `related_articles` JSON field
   - `PATCH {NOCODB_BASE_URL}/Articles/{article_id}`

2. **PATCH each modified related article**:
   - Updated `body_html` (with inbound link to new article injected)
   - `PATCH {NOCODB_BASE_URL}/Articles/{related_article_id}`
   - Only PATCH articles whose `body_html` actually changed (i.e., a link was successfully injected)

### Step 6: Return Success

W13 returns a success JSON response via webhook so W2 knows it completed:

```json
{
  "success": true,
  "article_id": 123,
  "related_count": 3,
  "outbound_links_added": 2,
  "inbound_links_added": 2
}
```

W13 does NOT trigger Netlify rebuild or revalidation — the calling workflow (W2) handles the single rebuild/revalidation after both W12 and W13 complete. This prevents deployment thrashing from multiple rebuilds.

---

## Tests (TDD)

All tests for W13. n8n Code node tests run via `node` with mock HTML data before embedding.

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

## Acceptance Criteria

1. W13 webhook accepts `{ article_id }` and returns success JSON after all steps complete
2. Related articles query finds up to 5 published articles from the same blog, prioritizing same ticker, then same sector, then recency (90-day window)
3. Query excludes the new article itself from results
4. Inline links injected via cheerio (NOT regex) — only in text nodes, never inside existing `<a>`, `<h2>`, Key Takeaways, or Verdict sections
5. Max 3 outbound links in the new article
6. Max 1 inbound link added per related article
7. Anchor text is natural (3-8 words), no duplicate target links
8. Idempotent: re-running W13 on the same article does not create duplicate links
9. `related_articles` field stores JSON array of related article data (IDs, slugs, titles, verdicts, meta_descriptions) — NOT HTML in body_html
10. NocoDB PATCH updates both the new article and any modified related articles
11. W13 does NOT trigger rebuilds — W2 handles that after W13 returns
12. Graceful handling when no related articles exist (empty array, no links, no crash)
