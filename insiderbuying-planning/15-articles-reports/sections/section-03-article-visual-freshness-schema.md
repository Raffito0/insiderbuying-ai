# Section 03: Visual Injection, Content Freshness, and Schema.org

## Overview

This section adds three capabilities to `generate-article.js`, all running **after** the quality gate passes (section-02) and **after** the article draft is generated (section-01). They are independent of each other and can be implemented in any order within this section.

1. **Visual placeholder replacement** — swap `{{VISUAL_N}}` tokens with real chart images uploaded to R2
2. **Content freshness check** — query NocoDB for duplicate ticker coverage and reroute if needed
3. **Schema.org JSON-LD** — append structured data to `body_html` before the NocoDB write

**File modified**: `n8n/generate-article.js`
**Test file**: `n8n/tests/generate-article.test.js`
**Dependencies**: Section-01 ensures `{{VISUAL_1}}`, `{{VISUAL_2}}`, `{{VISUAL_3}}` placeholders are embedded in `body_html`. Section-02 must pass before this section runs. `visual-templates.js` and `covers.js` are assumed to exist (built by earlier sections of the wider project).

---

## Tests First

Add these test stubs to `n8n/tests/generate-article.test.js`. Each test must be individually runnable with a mocked `fetchFn` or mocked NocoDB client — no real network calls.

### 3.1 Visual Placeholder Replacement

```js
// Test: replaceVisualPlaceholders — body with {{VISUAL_1}} → replaced with <img> tag containing R2 URL
// Test: replaceVisualPlaceholders — body with all 3 placeholders → all 3 replaced
// Test: replaceVisualPlaceholders — body missing {{VISUAL_2}} → warning logged, other placeholders still replaced (no throw)
// Test: replaceVisualPlaceholders — body with no placeholders → body returned unchanged, no error
// Test: uploadChart — correct Content-Type header (image/png) sent in request
```

Key assertion patterns:
- For the "all 3 replaced" test: `body_html` must contain zero `{{VISUAL_` substrings after the call.
- For the "missing `{{VISUAL_2}}`" test: assert `console.warn` was called (or that the function did not throw), and that `{{VISUAL_1}}` and `{{VISUAL_3}}` ARE replaced if present.
- For `uploadChart`: inject a mock `fetchFn` that records headers; assert `Content-Type: image/png` is present.

### 3.2 Content Freshness Check

```js
// Test: checkContentFreshness (mock nocodbGet returns 0 records) → { fresh: true, effectiveArticleType: 'insider_buying' }
// Test: checkContentFreshness (mock nocodbGet returns 1 recent article) → { fresh: false, effectiveArticleType: 'contrarian', lastPublished: '<date string>' }
// Test: checkContentFreshness — returned effectiveArticleType is propagated into slug generation call
// Test: checkContentFreshness — returned effectiveArticleType is propagated into SEO keyword selection call
// Test: checkContentFreshness — NocoDB query uses correct 30-day date range filter
```

Key assertion patterns:
- For the propagation tests, mock the freshness function to return `{ fresh: false, effectiveArticleType: 'contrarian' }` and assert that the slug and SEO keyword functions downstream receive `'contrarian'`, not the original `articleType`.
- For the 30-day filter test, capture the `where` argument passed to `nocodbGet` and assert it contains a date 30 days prior to the test's "now".

### 3.3 Schema.org JSON-LD

```js
// Test: generateSchema — returns a string containing valid JSON-LD (parseable with JSON.parse after stripping the script tags)
// Test: generateSchema — JSON-LD contains @type "Article"
// Test: generateSchema — JSON-LD contains @type "Person" with name "Ryan Chen"
// Test: generateSchema — JSON-LD contains @type "FinancialProduct"
// Test: generateSchema — JSON-LD is wrapped in <script type="application/ld+json"> tag
// Test: generateSchema — returned string appended to article.body_html → script tag is at end of body_html
```

Key assertion patterns:
- Extract the JSON-LD string from inside the `<script>` tags, then call `JSON.parse`. It must not throw.
- The parsed object can be an array or a single object with `@graph`; assert that all three `@type` values appear somewhere in the structure.

---

## Implementation

### 3.1 Visual Placeholder Replacement

**Where to add**: after `qualityGate` returns `{ valid: true }`, before the NocoDB write.

#### `uploadChart(buffer, key)`

Wraps the existing R2 upload pattern already used in `render-pdf.js` / `generate-image.js`. Accepts a `Buffer` and an R2 object key string. Returns the public R2 URL string.

```js
/**
 * Upload a PNG chart buffer to Cloudflare R2.
 * @param {Buffer} buffer - PNG image data
 * @param {string} key - R2 object key, e.g. "charts/aapl-insider-table-1711234567.png"
 * @returns {Promise<string>} Public R2 URL
 */
async function uploadChart(buffer, key) { /* ... */ }
```

- Use `Content-Type: image/png` explicitly in the upload request headers.
- Follow the existing AWS Sig V4 pattern from the codebase (same env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`).
- Key naming convention: `charts/{ticker}-{templateId}-{timestamp}.png`.

#### `replaceVisualPlaceholders(article, filingData)`

Called with the article object (contains `body_html`) and the filing data object. Mutates `article.body_html` in place (or returns a new article object — be consistent). Returns the updated article.

```js
/**
 * Replace {{VISUAL_N}} tokens with real chart <img> tags.
 * Missing tokens are warned and skipped, not thrown.
 * @param {Object} article - Article object with body_html field
 * @param {Object} filingData - Insider filing data for chart generation
 * @returns {Promise<Object>} Updated article object
 */
async function replaceVisualPlaceholders(article, filingData) { /* ... */ }
```

Placeholder-to-template mapping:

| Token | Template ID | Description |
|-------|-------------|-------------|
| `{{VISUAL_1}}` | 4 | Insider Transaction Table |
| `{{VISUAL_2}}` | 5 | Price Chart with buy marker |
| `{{VISUAL_3}}` | 6 | Revenue Trend |

For each token:
1. Check if the token exists in `body_html`. If not, `console.warn('Missing placeholder: {{VISUAL_N}}')` and continue to the next token.
2. Call `templates.renderTemplate(templateId, data)` — `templates` is imported from `visual-templates.js`.
3. Call `uploadChart(buffer, key)` to get the public URL.
4. Replace the token with `<img src="{url}" alt="{description}" class="article-chart" />`.

The entire function must not throw if a single chart fails. Wrap each token's processing in try/catch: on failure, warn and leave the token as-is (the quality gate already confirmed 3 tokens existed, so leaving one unreplaced is acceptable degradation).

### 3.2 Content Freshness Check

**Where to add**: called at the very beginning of the article generation pipeline, **before** `generateArticleOutline`. The returned `effectiveArticleType` replaces `articleType` for all downstream calls.

#### `checkContentFreshness(ticker, nocodbOpts)`

```js
/**
 * Check if an article for this ticker was published in the last 30 days.
 * @param {string} ticker - Stock ticker symbol, e.g. "AAPL"
 * @param {Object} nocodbOpts - { token, baseId, tableId } for NocoDB access
 * @returns {Promise<FreshnessCheck>}
 *   FreshnessCheck: { fresh: boolean, effectiveArticleType: string, lastPublished?: string }
 */
async function checkContentFreshness(ticker, nocodbOpts) { /* ... */ }
```

Implementation logic:
- Build a NocoDB `where` filter: `(ticker,eq,{ticker})~and(published_at,gt,{thirtyDaysAgo})`.
  - `thirtyDaysAgo` = `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()`.
- Call `nocodbGet` with this filter against the Articles table.
- If 0 records returned: return `{ fresh: true, effectiveArticleType: 'insider_buying' }`.
- If ≥1 record returned: return `{ fresh: false, effectiveArticleType: 'contrarian', lastPublished: records[0].published_at }`.

**Propagation requirement** — the returned `effectiveArticleType` must flow into:
- Slug generation (replaces `articleType` in the slug builder)
- CTA copy selection
- SEO keyword selection
- Tags/category assignment

This means the main orchestration function must capture the return value and pass it through rather than using a locally-scoped `articleType` variable. If `effectiveArticleType` is set to `'contrarian'`, the article prompt should acknowledge this angle — the alternate type can be appended to the draft generation user message as: `"NOTE: A recent article already covered {ticker} with a standard angle. Write from a contrarian perspective."`.

### 3.3 Schema.org JSON-LD

**Where to add**: after `replaceVisualPlaceholders` completes, before the NocoDB write step. Append the returned string to `article.body_html`.

#### `generateSchema(article)`

```js
/**
 * Build a Schema.org JSON-LD <script> block for the article.
 * Contains Article, Person (Ryan Chen), and FinancialProduct entities.
 * @param {Object} article - Article object with title, body_html, slug, author_name, published_at
 * @returns {string} Full <script type="application/ld+json">...</script> string
 */
function generateSchema(article) { /* ... */ }
```

The returned string is synchronous (no async/await needed). Build a JavaScript object, call `JSON.stringify`, wrap in the script tags.

Required JSON-LD structure (use `@graph` array to include all three entities in one script block):

```js
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "name": article.title,
      "headline": article.title,
      "description": article.meta_description,
      "datePublished": article.published_at,          // ISO 8601
      "dateModified": article.published_at,
      "author": { "@id": "#ryan-chen" },
      "url": `https://earlyinsider.com/articles/${article.slug}`
    },
    {
      "@id": "#ryan-chen",
      "@type": "Person",
      "name": "Ryan Chen",
      "jobTitle": "Independent Finance Analyst",
      "description": "Former Goldman Sachs equity research analyst covering technology and financial services sectors."
    },
    {
      "@type": "FinancialProduct",
      "name": "EarlyInsider Insider Intelligence Alerts",
      "description": "Real-time insider transaction alerts and analysis for retail investors.",
      "url": "https://earlyinsider.com/alerts"
    }
  ]
}
```

Wrap the `JSON.stringify` output in:
```
`<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>`
```

Append this string to `article.body_html` using string concatenation:
```js
article.body_html = article.body_html + '\n' + generateSchema(article);
```

This must happen before the NocoDB write so the stored `body_html` already contains the schema. The Next.js frontend renders it as-is.

---

## Pipeline Integration

The three capabilities slot into the existing pipeline in this order:

```
1. checkContentFreshness(ticker, nocodbOpts)       ← NEW, runs FIRST (before outline)
   → effectiveArticleType flows into all downstream steps

2. generateArticleOutline(...)                      ← section-01
3. generateArticleDraft(...)                        ← section-01
4. qualityGate(article, opts)                       ← section-02
   → if valid: continue
   → if invalid: retry draft (section-01 retry budget)

5. replaceVisualPlaceholders(article, filingData)   ← NEW (this section)
6. generateSchema(article)                          ← NEW (this section)
   → append to article.body_html

7. nocodbWrite(article)                             ← existing, unchanged
8. downstream triggers                              ← existing, unchanged
```

Step 1 runs before the outline so that `effectiveArticleType` is available for the outline prompt. Steps 5 and 6 run after the gate so chart generation only happens for articles that will actually be published. Neither step calls the quality gate again — they do not need to, since they add structured elements (img tags, script tag) that the gate would have already accounted for via the `{{VISUAL_N}}` token count check.

---

## Error Handling Summary

| Function | On failure | Behavior |
|----------|-----------|----------|
| `uploadChart` | R2 upload fails | Throw — let `replaceVisualPlaceholders` catch it |
| `replaceVisualPlaceholders` (per token) | `renderTemplate` or `uploadChart` throws | warn + leave token unreplaced, continue |
| `checkContentFreshness` | NocoDB unreachable | Catch and return `{ fresh: true, effectiveArticleType: 'insider_buying' }` (safe default = proceed normally) |
| `generateSchema` | Synchronous, should not throw | If `article.title` or `article.slug` is undefined, use empty string fallbacks — never throw |

---

## Data Shapes

**`FreshnessCheck`**
```
{ fresh: boolean, effectiveArticleType: string, lastPublished?: string }
```
- `effectiveArticleType` is `'insider_buying'` when fresh, `'contrarian'` when not fresh.
- `lastPublished` is an ISO 8601 date string present only when `fresh === false`.

**`replaceVisualPlaceholders` input/output**
- Input: article object (must have `body_html: string`) + filing data object
- Output: same article object with `body_html` mutated — all found `{{VISUAL_N}}` tokens replaced with `<img>` tags

**`generateSchema` input/output**
- Input: article object (needs `title`, `meta_description`, `published_at`, `slug`)
- Output: `string` — the full `<script type="application/ld+json">...</script>` block

---

## NocoDB Query Reference

The freshness check uses the existing `nocodbGet` helper already present in `generate-article.js`. The call looks like:

```js
const records = await nocodbGet(
  `/api/v1/db/data/noco/${BASE_ID}/${process.env.NOCODB_TABLE_ARTICLES}`,
  process.env.NOCODB_TOKEN,
  { where: `(ticker,eq,${ticker})~and(published_at,gt,${thirtyDaysAgo})`, limit: 1 }
);
```

Return value is an array of record objects (may be empty). Access `records[0].published_at` for the `lastPublished` field.
