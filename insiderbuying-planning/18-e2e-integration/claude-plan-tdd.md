# TDD Plan: E2E Integration Tests

## Testing Framework & Conventions

- **Framework**: Jest 30.3 (`testEnvironment: node`)
- **Pattern**: All async functions tested via `opts.fetchFn` injection (no nock, no MSW)
- **Mock factories**: `makeFetch`, `makeRouter`, `makeFetchSeq` from `helpers.js`
- **Run command**: `npx jest --selectProjects e2e`
- **Conventions from existing test suite**: `makeFetch`, `makeFetchSeq`, `BASE_ENV`, `noSleep` inline factories

---

## Section 1: Setup File + Shared Helpers

Since `helpers.js` is infrastructure used by every other test file, write self-tests for it first. Create `tests/insiderbuying/e2e/helpers.test.js`:

**Test stubs for helpers.js self-verification:**
- `makeFetch` returns an object with `ok`, `status`, `json()`, `text()`, `headers.get()`
- `makeFetch(body)` default `ok = true`, `status = 200`
- `makeFetch(body, false, 422)` returns `ok: false, status: 422`
- `makeFetch().json()` resolves to the provided body
- `makeRouter({'anthropic': X, 'supabase': Y})` returns X for URL containing 'anthropic'
- `makeRouter({'anthropic': X, 'supabase': Y})` returns Y for URL containing 'supabase'
- `makeRouter({})` throws for an unmatched URL
- `makeFetchSeq(A, B)` resolves to A on first call, B on second call
- `makeFetchSeq(A)` throws on second call (unexpected extra fetch guard)
- `expectFetchCalledTimes(mockFn, 2)` passes when mock called exactly 2 times
- `expectFetchCalledTimes(mockFn, 2)` throws descriptive error when mock called 1 time
- `BASE_ENV` is frozen (mutating throws)
- `noSleep()` returns a resolved Promise (not `undefined`)

**For setup.js — verify in e2e environment:**
- `global.fetch` is overwritten (calling it throws "Unexpected real fetch")
- `Date.now()` returns the fixed test epoch after `setSystemTime`
- `jest.setTimeout` is 8000

**For fixtures — verify each JSON file:**
- `edgar-rss-response.json` parses and contains required fields: `ticker`, `company_name`, `insider_name`, `transaction_type`, `total_value`
- `claude-score-response.json` has `id`, `model`, `usage.input_tokens`, `usage.output_tokens`, `content[0].text` with valid JSON score
- `claude-analysis-response.json` has full Anthropic shape and `content[0].text` passes `validateAnalysis`
- `claude-article-outline.json` has `content[0].type === 'tool_use'` and `content[0].input` is an object

---

## Section 2: Alert Pipeline E2E (Chain 1)

**Test stubs for `01-alert-pipeline.test.js`:**

**Test 1.1 (happy path)**: Full chain flows from EDGAR to delivery
- Before: set up `makeRouter` covering Financial Datasets, Anthropic, Supabase, Resend, OneSignal URLs
- Test: call `parseEdgarResponse` → `enrichFiling` → `runScoreAlert` → `analyze` → `deliverAlert` in sequence
- Assert: `significance_score ≥ 8`, analysis text matches 3 required keyword patterns, delivery fetchFn called ≥ 2 times

**Test 1.2 (error path)**: Gift transaction excluded
- Before: no fetchFn setup needed for enrichFiling/scoring
- Test: verify `isBuyTransaction('G')` returns `false`
- Assert: pipeline guard prevents `enrichFiling` from receiving gift filings

**Test 1.3 (error path)**: 10b5-1 hard cap at ≤ 5
- Before: mock Anthropic fetchFn to return a high base score
- Test: call `runScoreAlert` with `is_10b5_plan: true` filing
- Assert: `significance_score ≤ 5` regardless of base score

**Test 1.4 (bridge test)**: High-score → X auto-post
- Before: have a scored filing with `significance_score: 9`
- Test: call `generateAlertTweet`
- Assert: result contains `$[A-Z]+` cashtag

---

## Section 3: Article Pipeline E2E (Chain 2)

**Test stubs for `02-article-pipeline.test.js`:**

**Test 2.1 (happy path)**: Keyword → outline → draft → quality gate → write
- Before: `makeRouter` for NocoDB and Anthropic; Anthropic router returns outline JSON on first call, draft HTML on second call
- Test: call `pickKeyword` → `lockKeyword` → `callClaudeToolUse` (outline) → `callClaudeToolUse` (draft) → `qualityGate` → `writeArticle`
- Assert: second Claude call prompt contains outline JSON, `qualityGate` returns `valid: true`, write fetchFn called once

**Test 2.2 (error path)**: Quality gate fail → retry with error in prompt
- Before: `makeFetchSeq` returning failing draft then passing draft
- Test: run draft step with quality-gate-failing content, then retry
- Assert: retry call's prompt contains the quality error message

**Test 2.3 (freshness check)**: Duplicate ticker → different article type
- Before: mock NocoDB to return keyword with recent article for same ticker
- Test: call `determineArticleParams`
- Assert: article type is not `insider_buying`

---

## Section 4: Reddit Pipeline E2E (Chain 3)

**Test stubs for `03-reddit-pipeline.test.js`:**

**Test 3.1 (happy path)**: Search → draft → validate chain
- Before: mock post data object
- Test: `buildSearchQueries` → `draftComment` → `validateComment`
- Assert: each step returns non-null/non-empty, `validateComment` returns true

**Test 3.2 (tone difference)**: WSB shorter than ValueInvesting
- Before: same ticker data, different subreddit context
- Test: call `draftComment` twice with different subreddit targets
- Assert: WSB word count ≤ 100, ValueInvesting word count ≥ 150

**Test 3.3 (cap enforcement)**: Daily limit blocks new comment
- Before: mock comment count tracker at maximum
- Test: attempt to draft a new comment
- Assert: no new draft generated (fetchFn call count = 0 for Reddit API)

---

## Section 5: X Pipeline E2E (Chain 4)

**Test stubs for `04-x-pipeline.test.js`:**

**Test 4.1 (happy path)**: Filter → draft → reply with cashtag
- Before: mock tweet with `$NVDA` mention
- Test: `filterRelevant` → `draftReply`
- Assert: reply contains `$NVDA`, length 150-220 chars

**Test 4.2 (no data)**: Ticker without filing → skip
- Before: mock empty filing data
- Test: verify reply is null/skipped
- Assert: no send fetchFn called

**Test 4.3 (post)**: X API called once with tweet body
- Before: `makeRouter` for api.twitter.com
- Test: `postToX`
- Assert: fetchFn called exactly once, result contains tweet ID

---

## Section 6: Report Pipeline E2E (Chain 5)

**Test stubs for `05-report-pipeline.test.js`:**

**Test 5.1 (context accumulation)**: Each section receives prior sections
- Before: `makeRouter` returning short mock text for Anthropic calls
- Test: call `buildReportPrompt` 9 times, accumulating context
- Assert: section 3 prompt contains section 1 and 2 content by name, section 9 prompt contains all 8 prior names

**Test 5.2 (bear case retry)**: Authenticity below threshold → second call
- Before: `makeFetchSeq` — first returns `authenticity: 4`, second returns `authenticity: 8`
- Test: run bear case review step
- Assert: fetchFn called exactly twice, second call prompt contains rewrite instruction

**Test 5.3 (record status)**: Published status after assembly
- Before: mock report data
- Test: call `buildReportRecord`
- Assert: returned object has `status: 'published'`, `headline`, `body_html`, `ticker`, `published_at`

---

## Section 7: Newsletter Pipeline E2E (Chain 6)

**Test stubs for `06-newsletter-pipeline.test.js`:**

**Test 6.1 (happy path)**: Aggregation → segmentation → Beehiiv called twice
- Before: `makeRouter` for AI and Beehiiv endpoints; fake timers fixed
- Test: call newsletter orchestrator with 5 alerts, 3 articles, 2 performance records
- Assert: `subjectA !== subjectB`, free HTML section count ≤ 3, pro HTML section count = 6, Beehiiv fetchFn called exactly twice

**Test 6.2 (word count gate)**: Short AI response → error thrown
- Before: Anthropic mock returns < 1000 word newsletter body
- Test: call newsletter orchestrator
- Assert: Promise rejects with error message containing "word count"

---

## Section 8: Outreach Pipeline E2E (Chain 7)

**Test stubs for `07-outreach-pipeline.test.js`:**

**Note**: All tests in this file call `jest.setSystemTime(new Date('2026-03-01T12:00:00Z'))` in `beforeEach`.

**Test 7.1 (happy path)**: Scrape → personalize → subject ends with `?`
- Before: mock Cheerio fetch returning HTML with article title; AI mock returning email with `?` subject
- Test: call outreach send function
- Assert: article title in AI prompt args, subject ends with `?`, email body contains no URLs

**Test 7.2 (follow-up day 10)**: New thread angle, followup_count updated to 2
- Before: prospect with `followup_count: 1`; advance fake timers 10 days from `sent_at`
- Test: call follow-up function
- Assert: prompt uses "new thread" framing, persistence fetchFn called with `followup_count: 2`

**Test 7.3 (replied prospect)**: All follow-ups cancelled
- Before: prospect with `replied: true`
- Test: call follow-up scheduler
- Assert: no email send fetchFn called, persistence called with `followup_count: 99`

**Test 7.4 (bounce rate)**: Rate > 5% → Telegram alert
- Before: metrics mock returns `{ bounces: 6, total: 100 }`
- Test: call monitoring check
- Assert: Telegram fetchFn called with message containing bounce rate value

**Test 7.5 (warm-up limit)**: Day-7 domain → max 5 sends
- Before: fake timer 7 days after `DOMAIN_SETUP_DATE`; 10 prospects queued
- Test: run send loop
- Assert: send fetchFn called exactly 5 times

---

## Section 9: Cross-Chain Tests

**Test stubs for `08-cross-chain.test.js`:**

**Note**: This file requires `--runInBand` (enforced by `maxWorkers: 1` in Jest e2e project config). Each test uses the capture-and-replay pattern.

**Test 8.1**: Alert write payload compatible with Chain 4 read
- Before: run Chain 1 write with spy fetchFn; capture POST body
- Test: feed captured payload as Chain 4's query response
- Assert: `generateAlertTweet` called with `ticker` and `significance_score` from capture

**Test 8.2**: Article write payload compatible with Chain 4 read
- Before: run Chain 2 write with spy fetchFn; capture POST body
- Test: feed captured payload as Chain 4's article query response
- Assert: `generateArticleTweet` called with `headline` and `url` from capture

**Test 8.3**: Alert write payload compatible with Chain 6 newsletter aggregation
- Before: capture Chain 1 write payload
- Test: feed as Chain 6's alert data response
- Assert: aggregated newsletter data contains `ticker`, `significance_score`, `analysis_summary`

**Test 8.4**: Article write payload compatible with Chain 6 newsletter
- Before: capture Chain 2 write payload
- Test: feed as Chain 6's article data response
- Assert: newsletter summary section contains `headline` and `url`

**Test 8.5**: Report assembly writes `status: 'published'` to NocoDB
- Before: spy fetchFn on report record persistence call
- Test: run report assembly and persistence
- Assert: captured PATCH body contains `status: 'published'` and report ID

---

## Test Execution Order Recommendation

1. Run `helpers.test.js` first — it verifies the infrastructure everything else depends on
2. Run chain files 01–07 independently (each is self-contained)
3. Run `08-cross-chain.test.js` last, with `--runInBand` enforced

The Jest e2e project config with `maxWorkers: 1` handles this automatically for all files.
