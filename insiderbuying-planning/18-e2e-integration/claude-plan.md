# Implementation Plan: E2E Integration Tests (Revised)

## Context

The EarlyInsider platform has 7 complete pipeline "chains" — groups of Node.js modules that work sequentially to produce a specific business output (an alert email, a published article, a Reddit post, etc.). Each module has solid unit tests covering its individual behavior. What does NOT exist yet is cross-chain integration testing: tests that verify the correct output of stage A actually flows into stage B and produces the correct behavior in stage C.

This plan specifies how to build a new `tests/insiderbuying/e2e/` test suite that fills this gap. The suite uses Jest (already installed at v30.3.0) and the existing `opts.fetchFn` dependency-injection pattern that all pipeline modules already support. No new test dependencies are needed.

---

## Problem Being Solved

When a module's interface changes (even slightly), existing unit tests pass but the downstream consumer of that module may silently receive the wrong data. Examples:
- `runScoreAlert` returns a different field name than `analyze` expects → analysis uses `undefined` score, no error thrown
- `deliverAlert` expects `analysis.text` but receives `analysis.content` → emails sent with blank body
- The newsletter pipeline assembles data from alerts and articles but neither alert nor article tests verify the shape that the newsletter consumer expects

The e2e tests catch these by calling real functions in sequence, asserting that the output shape of each stage matches what the next stage requires, and verifying that each stage's external I/O was invoked with the correct arguments.

---

## Architecture Overview

### The Dependency Injection Pattern

Every async module in this codebase accepts an `opts` object:

```javascript
async function enrichFiling(filing, opts)
// opts = { fetchFn, env, _sleep }
// fetchFn: injectable fetch — this is the only HTTP boundary
// env: environment variables (avoids process.env coupling)
// _sleep: injectable timer (avoids real delays in tests)
```

This means HTTP mocking requires no external libraries (no nock, no MSW). Pass a `jest.fn()` as `fetchFn` — the module calls it instead of real HTTP. Tests control exactly what each "external API" returns.

**Critical constraint**: Any module that bypasses `opts.fetchFn` and calls `global.fetch` directly would silently hit production APIs in tests. The e2e setup guards against this by overwriting `global.fetch` with a function that throws immediately.

### Test File Structure

```
ryan_cole/insiderbuying-site/tests/insiderbuying/e2e/
  setup.js                       — global hooks: fake fetch, fake timers, setTimeout
  helpers.js                     — shared factories, Response stubs, BASE_ENV
  fixtures/
    edgar-rss-response.json      — realistic EDGAR RSS JSON (1 new Form 4 filing)
    claude-score-response.json   — full Anthropic API response shape for scoring
    claude-analysis-response.json — full Anthropic API response shape for analysis
    claude-article-outline.json  — Claude tool-use response with outline JSON
  01-alert-pipeline.test.js
  02-article-pipeline.test.js
  03-reddit-pipeline.test.js
  04-x-pipeline.test.js
  05-report-pipeline.test.js
  06-newsletter-pipeline.test.js
  07-outreach-pipeline.test.js
  08-cross-chain.test.js
```

---

## Section 1: Setup File + Shared Helpers

This section is the foundation of the entire suite. Everything built in Sections 2–9 depends on it being correct.

### 1.1 setup.js (globalSetup)

This file runs once before all e2e tests via Jest's `setupFilesAfterFramework` config. It installs three global guards:

**Global fetch trap**: Overwrite `global.fetch` with a function that throws `Error('Unexpected real fetch — use opts.fetchFn')`. If any module bypasses the injection pattern, the test fails immediately with a clear message rather than silently hitting a production API.

**Fake timers**: Call `jest.useFakeTimers()` and `setSystemTime(new Date('2026-03-01T12:00:00Z'))` — a fixed date that all time-sensitive tests use. This ensures tests using "10 days ago" or "today's date" are deterministic regardless of when they run.

**Test timeout**: Call `jest.setTimeout(8000)` to enforce the < 10s budget per test as an explicit failure.

### 1.2 helpers.js

This file is imported by every test file. It exports:

**`makeFetch(body, ok = true, status = 200)`**
Returns a `jest.fn()` that resolves with a Response-like object on every call:
```
{
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: (key) => null }
}
```
The `text()` and `headers.get()` stubs prevent test crashes in modules that call those methods on the response.

**`makeRouter(routes)`**
Returns a `jest.fn(url, opts)` that inspects the URL and returns the matching response object. Routes is a plain object mapping URL substrings to response bodies:
```
{ 'anthropic.com': MOCK_SCORE_RESPONSE, 'supabase.co': MOCK_USERS }
```
Use this for happy-path tests where a module makes calls to multiple different APIs. It is order-independent and won't break if the module adds a logging call between two API calls.

**`makeFetchSeq(...bodies)`**
Returns a `jest.fn()` that uses `mockResolvedValueOnce` for each body in sequence, each wrapped in the full Response shape. A default last call throws `Error('Unexpected extra fetch call — add another response to makeFetchSeq')` to surface unexpected extra calls.

**`noSleep`**
`jest.fn().mockResolvedValue(undefined)` — always returns a resolved Promise (not `undefined`) to satisfy `await _sleep(ms)` calls.

**`expectFetchCalledTimes(mockFn, n, label = '')`**
Helper assertion that throws a descriptive error if `mockFn.mock.calls.length !== n`. Prevents silent under-fetching (where a pipeline skipped a stage but the test still passed).

**`BASE_ENV`**
A frozen object (via `Object.freeze`) containing all environment variable keys required by any of the 7 chains, with test-safe placeholder values. It is frozen to prevent any test from mutating it and leaking state to subsequent tests. Each test should spread it if per-test overrides are needed: `{ ...BASE_ENV, ANTHROPIC_API_KEY: 'custom-key' }`.

**Named mock response objects**
Pre-defined Response-compatible stubs for common API calls, exported by name so test files don't duplicate them:
- `MOCK_EDGAR_RSS` — wraps the EDGAR fixture JSON
- `MOCK_SCORE_RESPONSE` — wraps the Claude scoring fixture
- `MOCK_ANALYSIS_RESPONSE` — wraps the Claude analysis fixture
- `MOCK_SUPABASE_EMPTY`, `MOCK_SUPABASE_USERS` — common Supabase response shapes
- `MOCK_RESEND_OK`, `MOCK_ONESIGNAL_OK` — delivery API success responses
- `MOCK_AIRTABLE_RECORD` — Airtable create/update success response

### 1.3 Fixtures

Four JSON files in `fixtures/`:

**`edgar-rss-response.json`**: A valid EDGAR RSS API response JSON (the format returned after EDGAR RSS → JSON parsing in the n8n workflow). Must include all fields that `parseEdgarResponse` and `enrichFiling` read: `ticker`, `company_name`, `insider_name`, `insider_title`, `transaction_type`, `shares`, `price_per_share`, `total_value`, `filing_date`, `cik`.

**`claude-score-response.json`**: A full Anthropic API response JSON. Must include: `id` (string), `model` (string), `usage.input_tokens` (int), `usage.output_tokens` (int), and `content[0].text` containing a JSON object with `score` (number) and `reasoning` (string). The production code's `parseHaikuResponse` reads this structure.

**`claude-analysis-response.json`**: Same Anthropic API response shape. The `content[0].text` must contain at least 2 paragraphs (150+ words total) with the words "bought/purchased", "last time/previous/track record", and "earnings/watch/catalyst" — required to pass `validateAnalysis`.

**`claude-article-outline.json`**: A Claude tool-use response shape. Must include `content[0].type = 'tool_use'` and `content[0].input` containing an outline object that the article pipeline's second Claude call receives as context.

---

## Section 2: Alert Pipeline E2E (Chain 1)

**Chain**: `sec-monitor` → `score-alert` → `analyze-alert` → `deliver-alert` → `write-persistence` → `x-auto-post`

**What the test proves**: A CEO purchase of $5M flows from EDGAR ingestion through scoring, analysis writing, email delivery, and triggers an X post — all using mocked external I/O, proving data shape compatibility between all stages.

**Test 1.1 — Happy path**:

Call chain functions in sequence, each receiving a `makeRouter`-based `fetchFn`:
1. `buildEdgarUrl(lastCheckDate, today)` + `parseEdgarResponse(MOCK_EDGAR_RSS_BODY)` → raw filing object
2. `enrichFiling(rawFiling, { fetchFn: makeRouter({'financialdatasets': MOCK_FINANCIAL_DATA, 'supabase.co': MOCK_SUPABASE_DEDUP}), env: BASE_ENV, _sleep: noSleep })` → enriched filing
3. `runScoreAlert([enrichedFiling], { fetchFn: makeRouter({'anthropic': MOCK_SCORE_RESPONSE, 'supabase.co/rest': MOCK_TRACK_RECORD}), env: BASE_ENV, _sleep: noSleep })` → scored filing
4. `analyze(scoredFiling, { fetchFn: makeRouter({'anthropic': MOCK_ANALYSIS_RESPONSE}), env: BASE_ENV, _sleep: noSleep })` → analysis result
5. `deliverAlert(analysisResult, { fetchFn: makeRouter({'resend.com': MOCK_RESEND_OK, 'onesignal': MOCK_ONESIGNAL_OK, 'supabase.co': MOCK_SUPABASE_USERS}), env: BASE_ENV })` → delivery result

Assertions:
- `scoredFiling.significance_score ≥ 8`
- `analysisResult.text` matches `/bought|purchased/i`, `/last time|previous|track record/i`, `/earnings|watch|catalyst/i`
- `analysisResult.text.split(/\s+/).length > 150`
- `enrichFiling` fetchFn called ≥ 1 time (Financial Datasets API was invoked)
- `deliverAlert` fetchFn called ≥ 2 times (Resend + OneSignal)

**Test 1.2 — Gift transaction excluded**:
Call `isBuyTransaction('G')` — assert `false`. Then verify the production guard: call the chain only on a filing that passes `isBuyTransaction` — a gift filing should never reach `enrichFiling`. Assert `enrichFiling` fetchFn call count is 0 when the gift is filtered at the source.

**Test 1.3 — 10b5-1 hard cap**:
Pass an enriched filing with `is_10b5_plan: true, total_value: 10000000, insider_category: 'CEO'` to `runScoreAlert`. Assert `significance_score ≤ 5`.

**Test 1.4 — High-score triggers X auto-post**:
After obtaining a `scoredFiling` with `significance_score: 9`, call `generateAlertTweet(scoredFiling)`. Assert the returned string contains a `$[A-Z]+` cashtag pattern.

---

## Section 3: Article Pipeline E2E (Chain 2)

**Chain**: `pickKeyword` → `lockKeyword` → outline `callClaudeToolUse` → draft `callClaudeToolUse` → `qualityGate` → `writeArticle`

**What the test proves**: A keyword goes through two sequential Claude calls (outline then draft using outline as input), passes quality validation, and is persisted — verifying the outline is correctly passed to the draft call and the draft meets quality requirements.

**Test 2.1 — Happy path**:

1. `pickKeyword(mockBlogConfig, { fetchFn: makeRouter({'nocodb': MOCK_KEYWORD_ROW}), env: BASE_ENV })` → keyword object
2. `lockKeyword(keyword.id, { fetchFn: makeRouter({'nocodb': MOCK_AIRTABLE_RECORD}), env: BASE_ENV })` → success
3. First `callClaudeToolUse` call with outline system prompt, `fetchFn` returning `MOCK_ARTICLE_OUTLINE` fixture → outline JSON
4. Second `callClaudeToolUse` call whose prompt is verified to contain the outline JSON from step 3, `fetchFn` returning a valid article draft → draft HTML
5. `qualityGate(draft, keyword.primaryKeyword, targetLength, articleType)` → `{ valid: true, errors: [] }`
6. `writeArticle(article, keyword, { fetchFn: makeRouter({'nocodb': MOCK_AIRTABLE_RECORD}), env: BASE_ENV })` → persisted article

Assertions:
- The fetchFn call captured during step 3 has a body containing "outline" in the prompt
- The fetchFn call captured during step 4 has a body whose prompt contains the outline JSON string
- `qualityGate` returns `valid: true`
- `writeArticle` fetchFn called exactly once

**Test 2.2 — Quality gate fail triggers retry with error feedback**:
Make the draft fetchFn return an article that fails `qualityGate` (e.g., contains a banned phrase from `BANNED_PHRASES`). Using `makeFetchSeq`, the second Claude call returns a valid article. Assert that the second call's prompt contains the specific error string returned by `qualityGate.errors[0]`.

**Test 2.3 — Freshness check redirects article type**:
Make the NocoDB keyword fetch return a keyword whose ticker has a recent article (< 30 days). Assert `determineArticleParams` returns a non-`insider_buying` article type.

---

## Section 4: Reddit Pipeline E2E (Chain 3)

**Chain**: `buildSearchQueries` → `draftComment` → `validateComment`

**Test 3.1 — Daily thread happy path**:
Call `buildSearchQueries()` → non-empty array. Call `draftComment(mockPost)` → comment string. Call `validateComment(comment)` → `true`. Assert comment is non-empty.

**Test 3.2 — Subreddit tone difference**:
Call `draftComment` for a WSB-context post and a ValueInvesting-context post with the same underlying ticker data. Assert WSB comment word count ≤ 100, ValueInvesting word count ≥ 150.

**Test 3.3 — Daily cap enforcement**:
Mock the comment count tracker at the daily maximum. Assert the guard returns without generating a new draft (fetchFn called 0 times for any Reddit API).

---

## Section 5: X Pipeline E2E (Chain 4)

**Chain**: `filterRelevant` → `draftReply` → `sendToTelegramReview`

**Test 4.1 — Happy path**:
Construct a mock tweet mentioning `$NVDA`. Call `filterRelevant([tweet])` → returns the tweet. Call `draftReply(tweet)` → reply string. Assert reply contains `$NVDA`, word count 150-220 chars.

**Test 4.2 — No matching filing → skip**:
Construct a tweet for a ticker with no known filing. Verify `filterRelevant` excludes it or `draftReply` returns null.

**Test 4.3 — X post with media**:
Call `postToX(tweet, { fetchFn: makeRouter({'api.twitter.com': MOCK_X_OK}), env: BASE_ENV })`. Assert fetchFn called once with a body containing the tweet text. Assert result contains a posted tweet ID.

---

## Section 6: Report Pipeline E2E (Chain 5)

**Chain**: 9x `buildReportPrompt` → `buildReportHTML` → `buildReportRecord`

**Test 5.1 — Sequential context accumulation**:
Call `buildReportPrompt(filing, context)` 9 times, accumulating each section's output in the context object passed to the next call. Use a `makeRouter` that always returns a short mock section text for Anthropic calls.

Assertions:
- First call's context argument has no prior section keys
- Third call's context argument contains keys from sections 1 and 2
- Ninth call's context argument contains all 8 prior section names

This test verifies the sequential data-threading logic without actually calling Claude.

**Test 5.2 — Bear case authenticity retry**:
Mock the first bear case fetchFn to return `authenticity: 4`. Use `makeFetchSeq` to return a second response with `authenticity: 8` on the retry call. Assert the fetchFn for the bear case was called exactly twice, and the second call's prompt contains a rewrite instruction.

**Test 5.3 — Report record status after assembly**:
Call `buildReportRecord(mockReportData)`. Assert the returned object has `status: 'published'` and required fields: `headline`, `body_html`, `ticker`, `published_at`.

---

## Section 7: Newsletter Pipeline E2E (Chain 6)

**Chain**: data aggregation → 6 sections → A/B subjects → free/pro HTML segmentation → Beehiiv send

**Test 6.1 — Happy path**:
Provide mock input with 5 alerts, 3 articles, 2 performance records. Call the newsletter orchestrator.

Assertions:
- `subjectA !== subjectB` (both non-empty strings)
- Free HTML contains ≤ 3 section content blocks
- Pro HTML contains 6 section content blocks
- Free HTML contains upgrade CTA keyword
- Pro HTML contains referral block keyword
- `expectFetchCalledTimes(beehiivFetchFn, 2)` — Beehiiv called exactly twice (free + pro segments)

**Test 6.2 — Word count gate**:
Mock AI response to return < 1000 words. Assert function rejects with an error message containing "word count".

---

## Section 8: Outreach Pipeline E2E (Chain 7)

**Chain**: Cheerio article scrape → personalized email draft → send → follow-up lifecycle management

Fake timers are required for all tests in this file. Set system time to `2026-03-01T12:00:00Z` in `beforeEach` (setup.js handles the initial `useFakeTimers` call; each test can advance as needed).

**Test 7.1 — Happy path: initial email**:
Mock Cheerio fetchFn to return HTML containing an article title. Mock AI fetchFn to return an email with a subject ending in `?`.

Assertions:
- Prospect's `recent_article_title` appears in the AI prompt (captured via fetchFn args)
- Email subject ends with `?`
- Email body contains no URLs (regex check)

**Test 7.2 — Follow-up day 10: new thread angle**:
Construct prospect with `followup_count: 1`. Set fake system time to 10 days after `sent_at`. Assert follow-up uses "new thread" framing (not "Re:" subject prefix). Assert persistence fetchFn called with `followup_count: 2`.

**Test 7.3 — Replied prospect cancels all follow-ups**:
Construct prospect with `replied: true`. Assert no email send fetchFn called. Assert persistence fetchFn called with `followup_count: 99`.

**Test 7.4 — Bounce rate > 5% → Telegram alert**:
Mock metrics fetch to return `{ bounces: 6, total: 100 }`. Assert Telegram fetchFn called with message body containing "6%" or "0.06".

**Test 7.5 — Warm-up limit enforced**:
Set `DOMAIN_SETUP_DATE` to 7 days ago (via fake timers). Provide 10 prospects. Assert send fetchFn called exactly 5 times.

---

## Section 9: Cross-Chain Tests

**Goal**: Verify that the write output of one chain is compatible with the read input expected by a downstream chain.

**Pattern — capture and replay**:
1. Call Chain A's write function with a spy `fetchFn`. Capture the POST body from `fetchFn.mock.calls[N][1].body`.
2. Parse it. Verify it has the fields Chain B expects.
3. Configure Chain B's read `fetchFn` to return that exact captured object.
4. Call Chain B's read/process function and assert it handles the data correctly.

This avoids building a fake stateful database and tests the actual wire format contract.

**Test 8.1 — Alert (Chain 1) → X auto-post (Chain 4)**:
Generate a scored alert with `significance_score: 9`. Capture the NocoDB write payload. Feed it as Chain 4's alert query response. Assert `generateAlertTweet` called with the correct ticker and score data.

**Test 8.2 — Article (Chain 2) → X auto-post (Chain 4)**:
Generate a published article record. Capture the write payload. Feed it as Chain 4's article query response. Assert `generateArticleTweet` called with headline and URL.

**Test 8.3 — Alert (Chain 1) → Newsletter (Chain 6)**:
Capture the alert write payload. Feed it into Chain 6's data aggregation fetchFn. Assert the alert's `ticker`, `significance_score`, and `analysis_summary` fields appear in the aggregated newsletter data.

**Test 8.4 — Article (Chain 2) → Newsletter (Chain 6)**:
Capture the article write payload. Feed it into Chain 6's data aggregation. Assert article headline and URL appear in newsletter summary section.

**Test 8.5 — Report (Chain 5) → NocoDB published status**:
Call the report assembly function's persistence write. Capture the PATCH body. Assert it contains `status: 'published'` and the correct report ID.

---

## Jest Config Update

The existing Jest config in `package.json` is:
```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"]
}
```

Replace with:
```json
"jest": {
  "projects": [
    {
      "displayName": "unit",
      "testEnvironment": "node",
      "testMatch": ["**/tests/**/*.test.js"],
      "testPathIgnorePatterns": ["/tests/insiderbuying/e2e/"]
    },
    {
      "displayName": "e2e",
      "testEnvironment": "node",
      "testMatch": ["**/tests/insiderbuying/e2e/**/*.test.js"],
      "setupFilesAfterFramework": ["<rootDir>/tests/insiderbuying/e2e/setup.js"],
      "clearMocks": true,
      "runner": "jest-runner",
      "maxWorkers": 1
    }
  ]
}
```

Key decisions:
- `clearMocks: true` (not `resetMocks`) — clears call counts between tests but preserves `mockResolvedValue` implementations set in `beforeEach`
- `maxWorkers: 1` for e2e project — cross-chain tests share in-memory mock state; parallel workers would give each test an isolated memory space, causing cross-chain assertions to fail
- `setupFilesAfterFramework` points to `setup.js` for fake fetch, fake timers, and setTimeout
- Unit tests are explicitly excluded from the e2e project to prevent double-running

---

## Run Commands

```bash
# Run e2e tests only
npx jest --selectProjects e2e

# Run unit tests only (unchanged behavior)
npx jest --selectProjects unit

# Run both
npx jest

# Run e2e with coverage (for CI)
npx jest --selectProjects e2e --coverage --coverageDirectory coverage/e2e
```

---

## Definition of Done

- 8 test files + `setup.js` + `helpers.js` + 4 fixture JSON files created
- `npx jest --selectProjects e2e --ci` passes with 0 failures
- Zero `.skip` or `.todo` markers
- Total test count ≥ 26
- Each test completes in < 8s (enforced by `jest.setTimeout(8000)` in setup.js)
- `global.fetch` safety trap active in all e2e tests
- Fake timers initialized in all e2e tests
- All fetchFn mocks use the full `{ ok, status, json(), text(), headers }` Response shape
- All fixture JSON files include correct full API response shapes (with `id`, `model`, `usage` for Anthropic)
- Jest config updated with projects split and `clearMocks: true`
- Zero real network calls (verified by global fetch trap)

---

## What This Plan Does NOT Cover

- Changes to any existing test files (they remain untouched and run under the `unit` project)
- Changes to any production module files
- New npm dependencies
- The `n8n/tests/` directory (Node native test runner — separate concern)
- Continuous integration pipeline changes (tests slot in via `npx jest`)
