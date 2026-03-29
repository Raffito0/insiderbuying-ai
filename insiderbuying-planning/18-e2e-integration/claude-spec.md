# Synthesized Spec: 18-e2e-integration

## Origin Documents
- `spec.md` — original intent: 7 pipeline chain e2e tests with 28+ scenarios
- `claude-research.md` — codebase reality: dep-injection pattern, no nocodb-client or ai-client abstractions
- `claude-interview.md` — user decisions on approach, coverage, helpers, fixtures

---

## What We're Building

A new `tests/insiderbuying/e2e/` directory containing Jest integration tests that verify each of the 7 complete pipeline chains works end-to-end. These are not unit tests — they call real module functions in sequence across module boundaries, with all external I/O replaced by mock `fetchFn` factories (following the existing `opts.fetchFn` dependency-injection pattern).

The goal is to catch integration bugs that pass unit tests but break at chain handoffs: wrong function call order, wrong output shape passed to the next stage, missing fields that a downstream stage requires, etc.

---

## Architecture Decisions (from research + interview)

### 1. Use real module exports, not spec's fictional abstractions

The spec's mock setup (`jest.mock('../../n8n/code/insiderbuying/nocodb-client')`) does not match the actual codebase. None of the spec's assumed abstractions (`nocodb-client`, `ai-client`, `edgarParser`) exist. The actual modules use `opts.fetchFn` injection.

**Decision**: Tests use actual module functions with mocked `fetchFn` in `opts`. No new abstraction layers are created.

### 2. Shared helpers file

Create `tests/insiderbuying/e2e/helpers.js` with:
- `makeFetch(response, ok, status)` — mock for a single fetch call
- `makeFetchSeq(...calls)` — mock for sequential fetch calls with different responses
- `BASE_ENV` — standard test environment variables object
- `noSleep` — `jest.fn().mockResolvedValue(undefined)` for `_sleep` param
- Standard mock API response objects (EDGAR RSS, Anthropic score, Anthropic analysis, Resend, etc.)

### 3. Coverage: happy path + 1-2 error cases per chain

7 chains × ~3 tests each = ~21-24 tests, plus ~5 cross-chain tests = ~26-29 total.

Each test file (one per chain):
- **Happy path**: full data flow from entry function to final side-effect mock, verifying output shape AND mock call counts at key stages
- **Error path(s)**: at minimum 1 error boundary test (e.g. score too low → analysis skipped, gift transaction → excluded, quality gate fail → retry, etc.)

### 4. Fixtures for EDGAR and Claude responses

Create `tests/insiderbuying/e2e/fixtures/`:
- `edgar-rss-response.json` — realistic EDGAR RSS JSON (1 new filing)
- `claude-score-response.json` — realistic Anthropic Haiku response for scoring
- `claude-analysis-response.json` — realistic Claude Sonnet analysis text
- `claude-article-outline.json` — realistic outline response for article generation

All other mock responses defined inline.

### 5. Cross-chain validation: automated

5 cross-chain tests, each verifying NocoDB/Supabase write state transitions that bridge chains:
1. Alert (Chain 1) score ≥ 9 → x-auto-post (Chain 4) called
2. New article (Chain 2) published → x-auto-post tweet triggered
3. Alert data (Chain 1) → newsletter (Chain 6) data aggregation
4. Article (Chain 2) → newsletter (Chain 6) summary
5. Report (Chain 5) → NocoDB status = 'published'

These go in a dedicated `08-cross-chain.test.js`.

### 6. Assertion strategy

Every happy-path test asserts two things:
1. **Output shape** — the final return value has the expected fields with the expected types/values
2. **Mock call counts** — the fetch mock (or specific stage's mock) was called the right number of times with the right arguments at the right points in the chain

This proves the data actually flowed through all stages, not just that the entry function returned something.

---

## Files to Create

```
tests/insiderbuying/e2e/
  helpers.js                     — shared factories + fixtures
  fixtures/
    edgar-rss-response.json
    claude-score-response.json
    claude-analysis-response.json
    claude-article-outline.json
  01-alert-pipeline.test.js      — Chain 1: EDGAR→score→analyze→deliver
  02-article-pipeline.test.js    — Chain 2: keyword→outline→draft→quality→publish
  03-reddit-pipeline.test.js     — Chain 3: thread posting→reply generation→DD post
  04-x-pipeline.test.js          — Chain 4: list poll→archetype→media→post
  05-report-pipeline.test.js     — Chain 5: data gather→9 sections→chart→PDF→publish
  06-newsletter-pipeline.test.js — Chain 6: data→6 sections→A/B subjects→segmented send
  07-outreach-pipeline.test.js   — Chain 7: scrape→personalize→send→follow-up lifecycle
  08-cross-chain.test.js         — 5 inter-chain state-transition assertions
```

---

## Chain Coverage Detail

### Chain 1: Alert Pipeline
Functions called in sequence: `buildEdgarUrl` → `parseEdgarResponse` → `passesDedup` → `classifyInsider` → `enrichFiling` → `runScoreAlert` → `analyze` → `deliverAlert`

**Test 1.1 (happy path)**: CEO $5M buy flows EDGAR → score ≥ 8 → analysis written → delivery called
- Assert: final score ≥ 8, analysis has 3 sections, deliverAlert fetchFn called with correct user segment data
- Assert: `enrichFiling` fetchFn called (Financial Datasets API), `callHaiku` fetchFn called once

**Test 1.2 (error)**: Gift transaction code 'G' → scoring returns null, no analysis, no delivery called

**Test 1.3 (error)**: 10b5-1 plan → score hard-capped ≤ 5

**Test 1.4**: Score ≥ 9 → `generateAlertTweet` called (x-auto-post integration)

### Chain 2: Article Pipeline
Functions called: `pickKeyword` → `callClaudeToolUse` (outline) → `callClaudeToolUse` (draft) → `qualityGate` → `writeArticle`

**Test 2.1 (happy path)**: keyword selected → outline requested first (Claude call #1) → draft uses outline (Claude call #2) → quality gate passed → article written to NocoDB
- Assert: first Claude call contains "outline", second call contains outline JSON, output has `body_html` with no `{{VISUAL_` placeholders

**Test 2.2 (error)**: Quality gate fails → second Claude call includes error feedback message

**Test 2.3**: Freshness check detects duplicate ticker < 30 days → different article type selected

### Chain 3: Reddit Pipeline
Functions called: `buildSearchQueries` → `draftComment` → `validateComment`

**Test 3.1 (happy path)**: Daily thread comment built with correct template, posted to r/stocks
- Assert: comment contains expected keywords, post API mock called with correct subreddit

**Test 3.2**: Subreddit tone difference — WSB reply shorter than ValueInvesting reply

**Test 3.3 (error)**: Daily cap (10 comments) enforced → no new reply sent

### Chain 4: X Pipeline
Functions called: `filterRelevant` → `draftReply` → `sendToTelegramReview`

**Test 4.1 (happy path)**: Tweet with $TICKER → relevant filing fetched → reply drafted with cashtag → sent to Telegram review
- Assert: reply contains `$CASHTAG`, reply length 150-220 chars

**Test 4.2 (error)**: No filing for tweet's ticker → reply skipped, logged

**Test 4.3**: Quote-retweet scheduled after post

### Chain 5: Report Pipeline
Functions called: `buildReportPrompt` (×9) → `buildReportHTML` → `buildReportRecord`

**Test 5.1 (happy path)**: 9 sections generated sequentially, each receives growing context
- Assert: section 3 prompt contains sections 1 and 2 content, executive summary contains all 9 sections

**Test 5.2 (error)**: Bear case authenticity < 7 → retry with rewrite instruction (called twice)

**Test 5.3**: Report record has `status: 'published'` after successful assembly

### Chain 6: Newsletter Pipeline
Functions called: `weekly-newsletter.js` internals

**Test 6.1 (happy path)**: 6 sections generated, A/B subjects different, Free HTML has 3 sections, Pro HTML has 6, Beehiiv API called twice
- Assert: `subjectA !== subjectB`, free HTML contains upgrade CTA, pro HTML contains referral block

**Test 6.2 (error)**: Word count < 1000 → error thrown

### Chain 7: Outreach Pipeline
Functions called: `send-outreach.js` internals

**Test 7.1 (happy path)**: Article scraped → personalized email with `?` subject, no URL in body

**Test 7.2**: Follow-up day 10 → new thread angle used

**Test 7.3 (error)**: Replied prospect → all follow-ups cancelled, `followup_count = 99`

**Test 7.4**: Bounce rate > 5% → Telegram alert sent

**Test 7.5**: Warm-up limit enforced (domain day 7 → max 5/day)

### Chain 8 (cross-chain): NocoDB State Transitions
5 tests verifying inter-chain state written to NocoDB/Supabase triggers downstream chain entry points.

---

## Definition of Done

- All 8 test files exist and `npx jest tests/insiderbuying/e2e/ --ci` passes
- Zero `.skip` or `.todo`
- Total test count ≥ 26
- Each test completes in < 10s
- Zero real network calls (opts.fetchFn pattern guarantees this)
- `tests/insiderbuying/e2e/helpers.js` exported and imported by all 8 files
- `tests/insiderbuying/e2e/fixtures/` has 4 JSON fixture files

---

## Constraints

- Jest 30.3 (already installed), testEnvironment: node
- Follow `opts = { fetchFn, env, _sleep }` injection pattern for ALL async calls
- No new npm packages (no nock, no MSW)
- Jest config addition recommended: `"resetMocks": true`
- n8n/tests/ (Node native runner) is separate; do not modify
