# Section 04: Article Pipeline E2E

## Overview

Create `tests/insiderbuying/e2e/02-article-pipeline.test.js` — 3 tests covering Chain 2 end-to-end.

**Chain**: `pickKeyword` → `lockKeyword` → outline `callClaudeToolUse` → draft `callClaudeToolUse` → `qualityGate` → `writeArticle`

**What the tests prove**:
1. A keyword flows through two sequential Claude calls (outline then draft, with outline passed as input to draft), passes quality validation, and is persisted.
2. When the draft fails `qualityGate`, the retry call receives the specific error message in its prompt.
3. When the same ticker already has a recent article (< 30 days), `determineArticleParams` returns a different article type than `insider_buying`.

---

## Dependencies

- **section-01-helpers-fixtures** must be complete: `helpers.js`, `setup.js`, and `fixtures/claude-article-outline.json` must exist.
- **section-02-jest-config** must be complete: the e2e Jest project must be registered in `package.json`.

Do not duplicate anything from those sections here.

---

## File to Create

```
ryan_cole/insiderbuying-site/tests/insiderbuying/e2e/02-article-pipeline.test.js
```

---

## Tests

### Test 2.1 — Happy path: keyword → outline → draft → quality gate → write

**What it proves**: The outline JSON produced by the first Claude call is present in the prompt body of the second Claude call. The draft passes `qualityGate`. The write fetchFn is called exactly once.

**Setup**:
- Import `pickKeyword`, `lockKeyword`, `callClaudeToolUse`, `qualityGate`, `writeArticle`, `determineArticleParams` from their respective production modules.
- Import `makeRouter`, `makeFetch`, `BASE_ENV`, `MOCK_AIRTABLE_RECORD` from `helpers.js`.
- Load `fixtures/claude-article-outline.json` — this is the Claude tool-use response shape that the first Claude call returns.
- Prepare a valid draft response object for the second Claude call. The `content[0].text` must be a well-formed article HTML string that passes `qualityGate` (no banned phrases, sufficient length).
- Prepare a NocoDB mock response representing a single unlocked keyword row.

**Test body (prose)**:

1. Call `pickKeyword(mockBlogConfig, { fetchFn: makeRouter({'nocodb': MOCK_KEYWORD_ROW}), env: BASE_ENV })` → `keyword`
2. Call `lockKeyword(keyword.id, { fetchFn: makeRouter({'nocodb': MOCK_AIRTABLE_RECORD}), env: BASE_ENV })` → success
3. Call `callClaudeToolUse` with the outline system prompt. Use a dedicated `jest.fn()` (not `makeRouter`) as `fetchFn` so call arguments can be inspected. It returns the `claude-article-outline.json` fixture.
4. Extract `outline` from the result.
5. Call `callClaudeToolUse` again with the draft system prompt. Use another dedicated `jest.fn()` as `fetchFn` so call arguments can be inspected. It returns the valid draft response.
6. Call `qualityGate(draft, keyword.primaryKeyword, targetLength, articleType)` → `{ valid: true, errors: [] }`
7. Call `writeArticle(article, keyword, { fetchFn: writeArticleFetch, env: BASE_ENV })` → persisted article

**Assertions**:
```
// The first Claude call contained "outline" in its prompt
const firstCallBody = JSON.parse(outlineFetch.mock.calls[0][1].body);
expect(firstCallBody.system || firstCallBody.messages[0].content).toMatch(/outline/i);

// The second Claude call contained the outline JSON in its prompt
const secondCallBody = JSON.parse(draftFetch.mock.calls[0][1].body);
const outlineStr = JSON.stringify(outline);
expect(JSON.stringify(secondCallBody)).toContain(outlineStr.slice(0, 40)); // key substring

// qualityGate passed
expect(qualityResult.valid).toBe(true);
expect(qualityResult.errors).toHaveLength(0);

// writeArticle made exactly one HTTP call
expect(writeArticleFetch.mock.calls).toHaveLength(1);
```

---

### Test 2.2 — Quality gate fail triggers retry with error in prompt

**What it proves**: When `qualityGate` returns errors, the retry call to `callClaudeToolUse` includes the specific error string in its prompt. The final result comes from the passing second call.

**Setup**:
- Use `makeFetchSeq` to make the draft fetchFn return a failing draft on the first call and a valid draft on the second call.
- A failing draft is one that contains a phrase present in the production `BANNED_PHRASES` array (or is below minimum length — check the actual list in the production module before choosing which failure to simulate).
- The valid second draft must pass `qualityGate`.

**Test body (prose)**:

1. Run the draft step (step 5 from Test 2.1) but with `makeFetchSeq(failingDraftResponse, passingDraftResponse)` as `fetchFn`. Capture the fetchFn mock.
2. Check `qualityGate` on the first response — it must return `{ valid: false, errors: [someError] }`.
3. Call `callClaudeToolUse` again (the retry), passing the error from `errors[0]` in the prompt. Use the same `makeFetchSeq` mock (second call in sequence).
4. Assert the second call succeeds and `qualityGate` returns `valid: true`.

**Assertions**:
```
// fetchFn was called twice total (first attempt + retry)
expect(draftFetch.mock.calls).toHaveLength(2);

// The retry call's prompt body contains the quality error string
const retryBody = JSON.parse(draftFetch.mock.calls[1][1].body);
expect(JSON.stringify(retryBody)).toContain(firstErrorMessage);
```

---

### Test 2.3 — Freshness check redirects article type for duplicate ticker

**What it proves**: `determineArticleParams` returns an article type other than `insider_buying` when a recent article already exists for the same ticker (< 30 days old).

**Setup**:
- Mock the NocoDB keyword response to include a ticker with a `last_article_date` within the last 30 days (relative to the fixed test date `2026-03-01T12:00:00Z` set in `setup.js` — use a date like `2026-02-20` which is 9 days prior).
- No Anthropic calls are needed for this test.

**Test body (prose)**:

1. Call `pickKeyword` with the recency-aware mock.
2. Call `determineArticleParams(keyword, recentArticleDate)` (or equivalent entry point — check the production module signature).
3. Capture the returned `articleType`.

**Assertions**:
```
expect(articleType).not.toBe('insider_buying');
expect(articleType).toBeTruthy(); // must be a non-empty string
```

---

## Fixture Reference: `claude-article-outline.json`

This fixture must be present (created in section-01-helpers-fixtures). Its shape must match the Claude tool-use response format:

```json
{
  "id": "msg_abc123",
  "model": "claude-haiku-20240307",
  "usage": { "input_tokens": 350, "output_tokens": 120 },
  "content": [
    {
      "type": "tool_use",
      "id": "tool_abc123",
      "name": "generate_outline",
      "input": {
        "sections": ["Introduction", "Why This Buy Matters", "Track Record", "Risk Factors", "Conclusion"],
        "primaryKeyword": "NVDA insider buying",
        "targetLength": 1200
      }
    }
  ]
}
```

If the production `callClaudeToolUse` expects a different field name inside `content[0].input`, check the actual module before finalising the fixture. The shape above is the canonical Anthropic tool-use response format.

---

## Key Production Modules (locations to verify before implementing)

These are the modules called in this test file. Confirm their import paths before writing the test:

| Function | Expected location |
|----------|------------------|
| `pickKeyword` | `src/insiderbuying/article-pipeline/pickKeyword.js` or similar |
| `lockKeyword` | same directory |
| `callClaudeToolUse` | `src/insiderbuying/shared/callClaude.js` or similar |
| `qualityGate` | `src/insiderbuying/article-pipeline/qualityGate.js` |
| `writeArticle` | `src/insiderbuying/article-pipeline/writeArticle.js` |
| `determineArticleParams` | `src/insiderbuying/article-pipeline/determineArticleParams.js` or inside `pickKeyword.js` |
| `BANNED_PHRASES` | exported from `qualityGate.js` or a constants file |

Run a quick `grep -r "pickKeyword" ryan_cole/insiderbuying-site/src` before writing imports.

---

## Stub Skeleton

```javascript
// tests/insiderbuying/e2e/02-article-pipeline.test.js

const { makeRouter, makeFetch, makeFetchSeq, BASE_ENV, MOCK_AIRTABLE_RECORD, noSleep } = require('./helpers');

// TODO: confirm actual import paths
const { pickKeyword } = require('../../src/insiderbuying/article-pipeline/pickKeyword');
const { lockKeyword } = require('../../src/insiderbuying/article-pipeline/lockKeyword');
const { callClaudeToolUse } = require('../../src/insiderbuying/shared/callClaude');
const { qualityGate, BANNED_PHRASES } = require('../../src/insiderbuying/article-pipeline/qualityGate');
const { writeArticle } = require('../../src/insiderbuying/article-pipeline/writeArticle');
const { determineArticleParams } = require('../../src/insiderbuying/article-pipeline/determineArticleParams');

const OUTLINE_FIXTURE = require('./fixtures/claude-article-outline.json');

const MOCK_KEYWORD_ROW = { /* NocoDB row with id, primaryKeyword, ticker, last_article_date: null */ };
const MOCK_VALID_DRAFT_RESPONSE = { /* Anthropic response with passing article HTML in content[0].text */ };
const MOCK_FAILING_DRAFT_RESPONSE = { /* Anthropic response with BANNED_PHRASES[0] in content[0].text */ };

describe('Article Pipeline E2E (Chain 2)', () => {
  test('2.1 — happy path: keyword → outline → draft → qualityGate → write', async () => {
    // ...
  });

  test('2.2 — quality gate fail triggers retry with error in prompt', async () => {
    // ...
  });

  test('2.3 — freshness check redirects article type for duplicate ticker', async () => {
    // ...
  });
});
```

---

## Acceptance Criteria

- [ ] File `tests/insiderbuying/e2e/02-article-pipeline.test.js` exists
- [ ] 3 tests, 0 `.skip` or `.todo` markers
- [ ] Test 2.1: second Claude call prompt contains outline JSON substring
- [ ] Test 2.1: `qualityGate` returns `valid: true`
- [ ] Test 2.1: `writeArticle` fetchFn called exactly once
- [ ] Test 2.2: draft fetchFn called exactly twice
- [ ] Test 2.2: retry prompt body contains the `errors[0]` string from the first quality failure
- [ ] Test 2.3: returned `articleType` is not `'insider_buying'`
- [ ] All fetchFns use the full `{ ok, status, json(), text(), headers }` Response shape (via `makeFetch`/`makeRouter`/`makeFetchSeq`)
- [ ] No real HTTP calls (global fetch trap in `setup.js` enforces this)
- [ ] Each test completes in < 8s
- [ ] `npx jest --selectProjects e2e 02-article-pipeline` passes with 0 failures
