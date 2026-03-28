# Section 04 Review: Article Generation Workflow

**Reviewer**: Senior Code Reviewer (Opus 4.6)
**Date**: 2026-03-27
**Files reviewed**:
- `insiderbuying-site/n8n/code/insiderbuying/generate-article.js` (844 lines, new file)
- `insiderbuying-site/n8n/tests/generate-article.test.js` (366 lines, new file)

**Section plan**: `insiderbuying-planning/03-dexter-content-engine/sections/section-04-article-generation.md`

---

## What Was Done Well

- Clean modular architecture: every logical step (ticker extraction, quality gate, HTML sanitization, slug uniqueness, NocoDB helpers, Claude API, downstream triggers) is its own exported function. This makes testing straightforward and follows the same pattern as `select-keyword.js` and `dexter-research.js`.
- All external I/O is injected via `fetchFn`/`opts` parameters, never using global `fetch`. This is correct for n8n Code node compatibility where `fetch` does not exist globally.
- The quality gate is thorough: all 14 checks from the plan are implemented. The early-return on missing required fields (check #14 first) prevents null-reference crashes in subsequent checks.
- `FALSE_POSITIVE_TICKERS` is a sensible allowlist and catches the most common false positives.
- The retry loop with quality gate feedback appended to the system prompt is well-structured (attempt 0 = clean, attempts 1-2 = feedback appended).
- Good test fixture: `makeValidArticle()` is carefully crafted to pass all 14 gate checks, making it easy to mutate one field per test.

---

## Critical Issues (Must Fix)

### C1. sanitizeHtml: href attribute injection allows stored XSS

**File**: `generate-article.js`, line ~318 (sanitizeHtml, href extraction)

The href value is extracted via regex and re-inserted into the output HTML without escaping:

```js
cleanAttrs = ` href="${href}"`;
```

If Claude generates (or an attacker injects) a href containing a double-quote followed by an event handler, the sanitizer is bypassed:

```
<a href="https://example.com" onclick="alert(1)" x="y">
```

The regex `href\s*=\s*["']([^"']+)["']` would capture `https://example.com`, but the full original `attrs` string also contains `onclick`. Since the code only extracts href and ignores the rest, the `onclick` IS stripped correctly in this case.

However, the actual vulnerability is simpler: if the href value itself contains a double-quote character (e.g., via HTML entity `&quot;` which the browser decodes), the attribute can be broken out of. The fix is to HTML-entity-encode the href value before interpolation:

```js
const safeHref = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
cleanAttrs = ` href="${safeHref}"`;
```

**Severity**: Critical. The body_html is rendered via `dangerouslySetInnerHTML` on the blog page (per the plan, Step 8.5 comment). Even though Claude is unlikely to produce malicious output, defense-in-depth requires proper escaping.

### C2. sanitizeHtml: class attribute value not escaped

**File**: `generate-article.js`, line ~329

Same pattern: `classMatch[1]` is interpolated directly into `class="${classMatch[1]}"`. A class value containing `"` breaks out of the attribute. Apply the same escaping:

```js
const safeClass = classMatch[1].replace(/&/g, '&amp;').replace(/"/g, '&quot;');
cleanAttrs = ` class="${safeClass}"`;
```

### C3. sanitizeHtml misses `<script>` with whitespace or attributes between tag parts

**File**: `generate-article.js`, line ~291

The regex `<(script|iframe|style)\b[^>]*>[\s\S]*?<\/\1>` requires a matching closing tag. An unclosed `<script>` tag or a `<script/src=x>` self-closing variant with a slash-attribute would bypass it.

More importantly, the self-closing cleanup regex on line ~293 (`<(script|iframe|style)\b[^>]*\/?>`) handles the no-content case, but browsers also parse `<script>` tags split across attributes. The current approach is adequate for AI-generated content but would not survive adversarial input. Since the plan states this prevents stored XSS on `dangerouslySetInnerHTML`, consider a belt-and-suspenders final pass:

```js
// Final safety: nuke any remaining script/iframe/style that slipped through
clean = clean.replace(/<\/?(?:script|iframe|style)\b[^>]*>/gi, '');
```

This single line at the end of sanitizeHtml would catch any edge cases.

---

## Important Issues (Should Fix)

### I1. extractTicker regex misses mid-word tickers

**File**: `generate-article.js`, line ~71

The regex `\b([A-Z]{1,5}(?:\.[A-Z])?)(?=\s|$)` requires the ticker to be followed by whitespace or end-of-string. This means a ticker followed by punctuation (comma, period, colon, parenthesis) will NOT match:

- `"NVDA, MSFT comparison"` -- `NVDA` is followed by `,` and will not match
- `"Is AAPL:undervalued?"` -- misses `AAPL`
- `"(TSLA)"` -- misses `TSLA`

**Fix**: Change the lookahead to `(?=[\s,.:;!?()\-]|$)` or simply remove the lookahead and rely on word boundary `\b` on both sides:

```js
const matches = keyword.match(/\b([A-Z]{1,5}(?:\.[A-Z])?)\b/g);
```

**Test gap**: No test covers ticker followed by punctuation.

### I2. extractTicker dot notation only matches single-letter suffix

**File**: `generate-article.js`, line ~71

`(?:\.[A-Z])?` matches `BRK.B` but NOT `BRK.WS` (warrants, 2-letter suffix) or hypothetical longer suffixes. The Financial Datasets API uses tickers like `BRK.B`, `BF.B`, so single-letter is sufficient for now, but the regex should be documented as intentionally limited.

### I3. Quality gate check #9 inconsistency with checks #10/#12

**File**: `generate-article.js`, lines ~230-272

- Check #9 (keyword in title): requires `>= 50%` of significant words
- Check #10 (keyword in first 100 words): requires `>= 50%` of significant words
- Check #11 (keyword in H2): requires `any` single word match (`.some()`)
- Check #12 (keyword in meta_description): requires `>= 40%` of significant words

The inconsistency between checks #9 (50%), #11 (any word), and #12 (40%) means a keyword like "NVDA earnings analysis" can pass meta_description check with just 1/3 words ("NVDA") but fail the title check needing 2/3 words. These thresholds should either be documented as intentional or unified.

### I4. Quality gate does not verify actual word count against body_html

**File**: `generate-article.js`, line ~224

Check #8 trusts `article.word_count` as reported by Claude. Claude might self-report `1350` while the actual body_html contains 900 words. The gate should compute the real word count from the body_html text content and compare:

```js
const actualWords = (article.body_html || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
if (Math.abs(actualWords - article.word_count) > actualWords * 0.15) {
  failures.push(`Reported word count ${article.word_count} differs from actual ${actualWords}`);
}
```

### I5. nocodbGet/nocodbPost/nocodbPatch swallow errors silently

**File**: `generate-article.js`, lines ~373-408

All three NocoDB helpers return `null` on non-OK responses without logging the error status or body. In production, a 422 validation error or 500 server error would silently produce `null`, and the caller would continue with missing data. At minimum, log the error:

```js
if (!res.ok) {
  console.error(`NocoDB ${res.status} on ${path}: ${await res.text().catch(() => '')}`);
  return null;
}
```

### I6. Retry loop breaks on first quality gate pass without re-sanitizing

**File**: `generate-article.js`, line ~740

The retry loop breaks on `gate.pass`, then sanitization happens on line ~769. But the quality gate checks run against the raw (unsanitized) body_html. If sanitization strips tags that contained keyword matches (e.g., a `<div>` tag with keyword text that gets stripped), the sanitized article might no longer pass the gate. Consider either: (a) sanitizing BEFORE the quality gate, or (b) re-running the gate after sanitization. Option (a) is simpler and more correct.

### I7. Downstream trigger marks article as 'published' even if W12/W13 fail

**File**: `generate-article.js`, line ~799

The code calls `triggerDownstream()`, collects results, then unconditionally patches the article to `status: 'published'`. But `triggerDownstream` returns a results object where W12 or W13 might be `'failed'` or `'error: ...'`. The article should only be published if both succeeded:

```js
const dsResults = await triggerDownstream(articleId, article.slug, { ... });
if (dsResults.w12 === 'success' && dsResults.w13 === 'success') {
  await nocodbPatch(`/Articles/${articleId}`, { status: 'published' }, ...);
} else {
  await nocodbPatch(`/Articles/${articleId}`, { status: 'enriching_failed' }, ...);
}
```

---

## Suggestions (Nice to Have)

### S1. Race condition guard not implemented

The plan (section "Race Condition Prevention") specifies: "if an execution with the same blog is still running (`status='in_progress'` keyword exists), wait 2 minutes and retry. Max 3 waits before skipping." This guard is not present in `generateArticle()`. Currently, the keyword lock prevents double-picking of the same keyword, but two concurrent runs could both pick different keywords and run simultaneously. If this is intentional (allowed parallel for different keywords), document it. If not, add the guard.

### S2. Ticker validation API not called for keywords without extracted ticker

**File**: `generate-article.js`, lines ~660-669

If `extractTicker()` returns `null`, the code skips validation entirely and proceeds to Dexter. This is correct for generic keywords like "best dividend stocks 2026", but the plan says "Validation required: extracted string must be validated against a known ticker list." Consider whether generic (no-ticker) keywords should still proceed -- the current behavior is sensible but deviates from the plan's strict validation language.

### S3. Test coverage gaps

The test file has 39 tests covering the pure functions well. Missing coverage:

1. **No integration test for `generateArticle()` orchestrator** -- even with mocked fetch, testing the full flow through all steps would catch wiring bugs (e.g., the sanitize-after-gate ordering issue in I6).
2. **No test for `notifyTelegram()`** -- the plan specifies "Telegram notification -- success message contains title, ticker, verdict, URL."
3. **No test for `pickKeyword()` or `lockKeyword()`** -- the plan specifies keyword picker tests with pre-populated data. These are integration tests requiring NocoDB, so mocked-fetch unit tests would be valuable.
4. **No test for `validateTickerApi()`** -- at minimum a mock test verifying it returns true for 200 OK and false for 404.
5. **No test for `triggerDownstream()`** sequentiality -- the plan says "W12 completes before W13 starts."
6. **No test for the retry loop** -- the plan specifies "Mock Claude to return a failing article twice, then a passing one on 3rd call."

### S4. `BANNED_PHRASES` should include case variants

The check lowercases both sides (`bodyLower.includes(phrase.toLowerCase())`), so this works correctly. However, pre-lowercasing the `BANNED_PHRASES` array at definition time would save the `.toLowerCase()` call on each phrase per article. Minor performance improvement.

### S5. Slug query may have NocoDB syntax issue

**File**: `generate-article.js`, line ~773

```js
`/Articles?fields=slug&where=(slug,like,${article.slug}%)`
```

The `%` wildcard in a URL query parameter might need encoding. Also, NocoDB v2 API uses `like` operator differently than v1. Verify this query works against the actual NocoDB instance.

### S6. `determineArticleParams` is not seedable for testing

The function uses `Math.random()` directly, making the weighted distribution test (line ~937) probabilistic. Over 1000 runs the test is reliable, but for deterministic CI consider injecting the random value:

```js
function determineArticleParams(blog, rng = Math.random) {
  const r = rng();
  ...
```

---

## Plan Alignment Summary

| Plan Step | Status | Notes |
|-----------|--------|-------|
| Step 1: Pick Keyword | Implemented | `pickKeyword()` + `lockKeyword()` |
| Step 2: Extract & Validate Ticker | Implemented | Missing punctuation edge cases (I1) |
| Step 3: Call Dexter | Implemented | data_completeness check present |
| Step 4: Article Params | Implemented | Weighted random correct |
| Step 5: Variable Interpolation | Implemented | All 18 vars mapped |
| Step 6: Claude Tool Use | Implemented | Correct schema, model, temp |
| Step 7: Extract Tool Result | Implemented | |
| Step 8: Quality Gate (14 checks) | Implemented | Word count trust issue (I4), threshold inconsistency (I3) |
| Step 8.5: HTML Sanitization | Implemented | XSS escape needed (C1, C2, C3) |
| Step 8.6: Slug Uniqueness | Implemented | Double collision handled |
| Step 9: Write to NocoDB | Implemented | status='enriching' correct |
| Step 10: Update Keyword | Implemented | |
| Step 11: Sequential Downstream | Implemented | Missing failure check (I7) |
| Step 12: Google Indexing | Implemented | |
| Step 13: Telegram Notification | Implemented | |
| Race Condition Guard | NOT implemented | See S1 |
| Test coverage (28 plan tests) | Partial (39 tests) | Pure function tests excellent; integration/orchestrator tests missing (S3) |

---

## Verdict

The implementation is structurally sound and follows the established codebase patterns well. The architecture is clean, testable, and n8n-compatible. The three critical issues (C1-C3) around HTML sanitization must be fixed before production use since the blog renders body_html via `dangerouslySetInnerHTML`. The important issues (I4-I7) address correctness gaps that could cause silent data quality problems or premature publishing. The suggestion items are genuine improvements but non-blocking.

**Recommended action**: Fix C1-C3 and I7 before merging. I4-I6 should be addressed in the same pass if time permits. Integration test coverage (S3) should be a follow-up task.
