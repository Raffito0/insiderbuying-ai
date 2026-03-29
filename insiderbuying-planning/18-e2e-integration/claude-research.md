# Research: E2E Integration Tests (18-e2e-integration)

## 1. Codebase Research

### 1.1 Pipeline Module Location

- **Source modules**: `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/`
- **Jest tests (existing)**: `ryan_cole/insiderbuying-site/tests/insiderbuying/`
- **Node native tests**: `ryan_cole/insiderbuying-site/n8n/tests/` (uses `node:test` runner, NOT Jest)
- **Target for new e2e tests**: `ryan_cole/insiderbuying-site/tests/insiderbuying/e2e/` (does not exist yet)

### 1.2 CRITICAL FINDING: Spec Assumptions vs. Reality

The spec was written with some architectural assumptions that do **not match** the actual codebase:

| Spec Assumes | Actual Codebase |
|---|---|
| `nocodb-client.js` module exists | **Does not exist** — modules use Supabase + Airtable via inline fetch |
| `ai-client.js` module exists | **Does not exist** — Claude calls are inline per module (`callHaiku`, `callClaude`) |
| `edgarParser.fetchRecentFilings()` | **Does not exist** — SEC monitoring is in `sec-monitor.js` with different exports |
| `edgarParser.parseForm4Xml()` | **Does not exist** — `sec-monitor.js` exports `buildEdgarUrl`, `parseEdgarResponse` |
| `generateArticle.run(keyword, data)` | **Does not exist** — `generate-article.js` exports many granular functions, no `.run()` |
| `tests/mocks/nocodb-mock.js` | **Does not exist** |
| `tests/mocks/ai-mock.js` | **Does not exist** |

**Implication**: The e2e tests cannot be written verbatim from the spec. The plan must map the spec's intended test scenarios to the actual module exports, OR propose creating thin adapter/orchestrator functions that the tests can call.

### 1.3 Actual Module Exports

#### sec-monitor.js (Chain 1 — EDGAR ingestion)
Key exports:
- `buildEdgarUrl(lastCheckDate, today)` — pure, URL construction
- `parseEdgarResponse(responseJson)` — pure, parses EDGAR RSS response
- `buildDedupKey(ticker, insiderName, transactionDate, shares)` — pure
- `passesDedup(dedupKey, existingDedupKeys)` — pure
- `isBuyTransaction(transactionType)` — pure
- `classifyInsider(title)` — pure, returns role string
- `fetchDedupKeys(opts)` — async, queries Supabase
- `loadCikTickerMap(opts)` — async
- `enrichFiling(filing, opts)` — async, hits Supabase + Financial Datasets API
- `detectCluster(filings, opts)` — async
- `runSecMonitor()` — async orchestrator (top-level)

**No `parseForm4Xml` exists** — EDGAR parsing goes through `parseEdgarResponse`.

#### score-alert.js (Chain 1 — scoring)
Key exports:
- `normalizeInsiderName(name)` — pure
- `computeBaseScore(filing)` — NOT exported (private), scoring done in `runScoreAlert`
- `buildHaikuPrompt(filing, trackRecord)` — pure
- `parseHaikuResponse(rawText)` — pure
- `callHaiku(prompt, apiKey, opts)` — async, calls Anthropic
- `computeTrackRecord(insiderName, url, key, opts)` — async, queries Supabase
- `runScoreAlert(filings, helpers)` — async orchestrator

**Note**: `computeBaseScore` is private/internal; tests cannot call it directly.

#### analyze-alert.js (Chain 1 — analysis)
Key exports:
- `buildAnalysisPrompt(filing)` — pure
- `validateAnalysis(text)` — pure
- `callClaude(prompt, helpers)` — async, calls Anthropic
- `analyze(filing, helpers)` — async orchestrator (gates on score >= 4)

#### deliver-alert.js (Chain 1 — delivery)
Key exports:
- `fetchEligibleUsers(alertScore, ticker, opts)` — async, Supabase queries
- `buildEmailHtml(alertData, analysisContent, isPro)` — pure
- `buildEmailObject(user, alertData)` — pure
- `sendResendBatch(emails, opts)` — async, calls Resend API
- `sendOneSignalPush(alertData, supabaseAlertId, opts)` — async
- `updateDeliveryStatus(recordId, fields, opts)` — async, PATCH Airtable
- `deliverAlert(alertData, opts)` — async orchestrator

#### generate-article.js (Chain 2 — article pipeline)
Key exports (many granular functions):
- `extractTicker(keyword)`, `qualityGate(article, primaryKeyword, ...)`, `seoScore(...)`, `aiDetectionScore(...)` — pure
- `pickKeyword(blog, nocodbOpts)`, `lockKeyword(keywordId, nocodbOpts)` — async
- `callClaudeToolUse(systemPrompt, opts)` — async
- `writeArticle(article, keyword, nocodbOpts)` — async
**No `.run()` method** — tests must call the individual async functions in sequence.

#### write-persistence.js (Chain 1 — persistence)
Key exports:
- `createAirtableRecord(filing, opts)`, `insertToSupabase(filing, opts)`, `patchAirtableRecord(recordId, fields, opts)` — async
- `writeFilingPersistence(filing, opts)`, `updateMonitorState(lastCheckDate, opts)`, `runPostProcessing(filings, opts)` — async orchestrators

#### x-auto-post.js (Chain 1 → 4 bridge)
Key exports: `generateAlertTweet(alert)`, `generateArticleTweet(article)`, `postToX(tweet, opts)`, `checkDailyLimit(opts)`, `logTweet(tweet)`

#### reddit-monitor.js (Chain 3)
Key exports: `buildSearchQueries()`, `filterByScore(posts)`, `draftComment(post)`, `validateComment(text)`

#### x-engagement.js (Chain 4)
Key exports: `filterRelevant(tweets)`, `draftReply(tweet)`, `sendToTelegramReview(reply, opts)`

#### generate-report.js (Chain 5)
Key exports: `parseWebhook(body)`, `buildReportPrompt(filing, context)`, `buildReportHTML(content)`, `buildDeliveryEmail(report, user)`, `buildReportRecord(data)`

Other modules (chains 6–7): `weekly-newsletter.js`, `send-outreach.js` — not yet fully explored but follow same dep-injection pattern.

### 1.4 Dependency Injection Pattern (Critical for Mocking)

**ALL async functions** use `opts`-based dependency injection:

```javascript
// Functions accept opts = { fetchFn, env, _sleep, ... }
const result = await enrichFiling(filing, {
  fetchFn: myMockFetch,  // injectable — this is how tests control HTTP
  env: { SUPABASE_URL: '...', FINANCIAL_DATASETS_API_KEY: 'test-key' },
  _sleep: jest.fn(),  // skip real delays
});
```

**This means**: to mock HTTP in these tests, you do NOT need nock or `jest.mock('https')`. You simply pass `mockFetch` as `fetchFn`. The existing test suite already uses this pattern extensively with `makeFetch()` and `makeFetchSeq()` factories.

For external APIs that the module calls internally using the injected `fetchFn`, you create a mock `fetchFn` that returns the right response for each URL.

### 1.5 Existing Test Patterns

#### makeFetch factory (most common)
```javascript
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status,
    json: async () => response,
  });
}
```

#### makeFetchSeq factory (multi-step flows)
```javascript
function makeFetchSeq(...calls) {
  const fn = jest.fn();
  calls.forEach(({ response, ok = true, status = 200 }) => {
    fn.mockResolvedValueOnce({ ok, status, json: async () => response });
  });
  return fn;
}
// Usage: for sequential API calls (step 1: Supabase, step 2: Anthropic, step 3: Airtable)
```

#### Standard ENV object
```javascript
const BASE_ENV = {
  AIRTABLE_API_KEY: 'at-key', AIRTABLE_BASE_ID: 'appXXX',
  SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb-key',
  ANTHROPIC_API_KEY: 'test-anthropic', FINANCIAL_DATASETS_API_KEY: 'fd-key',
  RESEND_API_KEY: 'resend-key', ONESIGNAL_APP_ID: 'os-id',
  // ...etc
};
```

### 1.6 Jest Configuration

From `package.json`:
```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"]
}
```
- Jest version: `^30.3.0`
- **nock is NOT installed**
- No shared mock directory exists
- `tests/insiderbuying/e2e/` directory does NOT yet exist

### 1.7 What Already Exists

Existing tests cover individual modules well (unit + mock-integration style). No e2e tests currently exist at the cross-chain level. The spec's goal is to add `tests/insiderbuying/e2e/` as the first cross-chain test suite.

---

## 2. Web Research: HTTP Mocking in Jest (Node.js)

### 2.1 Recommendation for This Project

**Use the existing `makeFetch` / `makeFetchSeq` pattern exclusively.**

Since all insiderbuying modules use the `opts.fetchFn` injection pattern, there is **no need for nock or MSW** in these tests. The modules never call `require('https')` or `fetch` globally — they always accept an injectable fetch. This means:

- No real HTTP will leak unless you forget to pass `fetchFn` in `opts`
- The existing pattern is already well-understood by the codebase
- Adding nock would be an unnecessary dependency

For the `jest.mock('https')` call shown in the spec — this is NOT needed given the dep-injection architecture. The plan should NOT include it.

### 2.2 jest.mock() for Module-Level Abstractions

If the plan decides to create thin `nocodb-client.js` and `ai-client.js` abstractions (to match the spec's intent), then `jest.mock()` would be appropriate:

```javascript
jest.mock('../../n8n/code/insiderbuying/nocodb-client');
const nocodbClient = require('../../n8n/code/insiderbuying/nocodb-client');
nocodbClient.create.mockResolvedValue({ id: 'rec123' });
```

The mock factory (inline in jest.mock()) must only reference variables with a `mock` prefix due to jest's hoisting behavior.

### 2.3 Key Patterns

```javascript
// Per-test return values (preferred)
mockFn.mockResolvedValue({ data: [...] });   // async
mockFn.mockReturnValue(42);                  // sync

// Sequential: different response on each call
mockFn
  .mockResolvedValueOnce({ status: 200 })  // call 1
  .mockResolvedValueOnce({ status: 429 })  // call 2
  .mockResolvedValue({ status: 200 });     // calls 3+

// Assertions
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockFn).toHaveBeenNthCalledWith(1, { table: 'users' });
expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ score: 9 }));

// Access raw args
const firstCallFirstArg = mockFn.mock.calls[0][0];
```

Reset strategy: use `jest.resetAllMocks()` in `beforeEach` or set `resetMocks: true` in jest config to prevent bleed between tests.

### 2.4 nock vs MSW (for reference, not needed here)

| | nock | MSW |
|---|---|---|
| Best for | Node-only integration tests, REST | Node+browser, GraphQL, stateful |
| Blocking HTTP | `nock.disableNetConnect()` | `onUnhandledRequest: 'error'` |
| Per-test override | `.reply()` chaining | `server.use(http.get(...))` |
| Pitfall | Can't intercept ESM fetch or undici | Heavier setup |

---

## 3. Testing Setup Recommendations

### For the new `tests/insiderbuying/e2e/` directory:
1. **Follow existing Jest patterns** — same `makeFetch`, `makeFetchSeq`, `BASE_ENV` conventions
2. **No new test dependencies needed** — Jest 30.3 already installed, no nock/MSW needed
3. **Each test file**: test a full chain by calling module functions in sequence with mocked `fetchFn`
4. **Address the spec/reality gap**: either (a) write tests against real module exports (adjusting spec test code), or (b) create thin orchestrator wrappers that match the spec's `.run()` interface

### Shared mock utilities to create:
- `tests/insiderbuying/e2e/helpers.js` — shared `makeFetch`, `makeFetchSeq`, `BASE_ENV`, `noSleep`
- These are currently copy-pasted across existing test files; e2e tests should import from one place

### Jest config addition (recommended):
```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"],
  "resetMocks": true
}
```
