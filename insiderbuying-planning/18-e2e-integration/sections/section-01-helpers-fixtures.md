# Section 01 — Helpers, Fixtures & Setup

## Overview

This section is the foundation for the entire `tests/insiderbuying/e2e/` suite. Every other section depends on the files created here. Nothing in Sections 03–10 can be written or run until this section is complete.

You will create:

1. `tests/insiderbuying/e2e/setup.js` — global Jest hooks (fetch trap, fake timers, timeout)
2. `tests/insiderbuying/e2e/helpers.js` — shared mock factories and named response stubs
3. `tests/insiderbuying/e2e/fixtures/edgar-rss-response.json`
4. `tests/insiderbuying/e2e/fixtures/claude-score-response.json`
5. `tests/insiderbuying/e2e/fixtures/claude-analysis-response.json`
6. `tests/insiderbuying/e2e/fixtures/claude-article-outline.json`
7. `tests/insiderbuying/e2e/helpers.test.js` — self-verification tests for the above

All paths are relative to `ryan_cole/insiderbuying-site/`.

---

## Dependencies

None. This section has no prerequisite sections.

Sections 02–10 all depend on this section being complete and passing.

---

## Tests First

Create `tests/insiderbuying/e2e/helpers.test.js`. This file self-verifies the infrastructure before any chain test uses it.

### Test group: `makeFetch`

```js
// makeFetch returns correct shape
// makeFetch(body).ok === true, .status === 200 by default
// makeFetch(body, false, 422).ok === false, .status === 422
// makeFetch(body).json() resolves to body
// makeFetch(body).text() resolves to JSON.stringify(body)
// makeFetch(body).headers.get('any-key') returns null
```

### Test group: `makeRouter`

```js
// makeRouter({'anthropic.com': X, 'supabase.co': Y})(url) returns X when url contains 'anthropic.com'
// makeRouter({'anthropic.com': X, 'supabase.co': Y})(url) returns Y when url contains 'supabase.co'
// makeRouter({})(url) throws for an unmatched URL
// makeRouter result is a jest.fn() — tracks calls
```

### Test group: `makeFetchSeq`

```js
// makeFetchSeq(A, B): first call resolves to response wrapping A
// makeFetchSeq(A, B): second call resolves to response wrapping B
// makeFetchSeq(A): second call throws 'Unexpected extra fetch call'
```

### Test group: `expectFetchCalledTimes`

```js
// passes when mock called exactly N times
// throws a descriptive error when mock called != N times (message includes actual count and label)
```

### Test group: `BASE_ENV`

```js
// BASE_ENV is frozen — mutating any key throws a TypeError
// BASE_ENV contains at minimum: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY,
//   RESEND_API_KEY, ONESIGNAL_APP_ID, ONESIGNAL_API_KEY, BEEHIIV_API_KEY,
//   BEEHIIV_PUBLICATION_ID, NOCODB_BASE_URL, NOCODB_API_KEY, X_API_KEY,
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FAL_API_KEY, DOMAIN_SETUP_DATE
```

### Test group: `noSleep`

```js
// noSleep() returns a Promise (i.e. noSleep() instanceof Promise === true)
// await noSleep() resolves without error
```

### Test group: fixtures

One test per fixture file. Import via `require('../fixtures/filename.json')`.

```js
// edgar-rss-response.json: has fields ticker, company_name, insider_name,
//   insider_title, transaction_type, shares, price_per_share, total_value,
//   filing_date, cik
// claude-score-response.json: has id (string), model (string),
//   usage.input_tokens (number), usage.output_tokens (number),
//   content[0].text parseable as JSON with { score, reasoning }
// claude-analysis-response.json: has same Anthropic envelope shape,
//   content[0].text length >= 150 words,
//   content[0].text matches /bought|purchased/i,
//   content[0].text matches /last time|previous|track record/i,
//   content[0].text matches /earnings|watch|catalyst/i
// claude-article-outline.json: content[0].type === 'tool_use',
//   content[0].input is a non-null object
```

### Test group: setup.js environment (run inside the e2e Jest project)

These assertions verify the globals that `setup.js` installs. They are only meaningful when run via `npx jest --selectProjects e2e` (the setup file is only loaded for that project).

```js
// global.fetch throws 'Unexpected real fetch — use opts.fetchFn' when called
// Date.now() equals new Date('2026-03-01T12:00:00Z').getTime()
// jest.getTimerCount() or similar confirms fake timers are active
```

---

## Implementation Details

### `setup.js`

This file is registered under `setupFilesAfterFramework` in the e2e Jest project (configured in Section 02). It runs once before any test in the e2e project.

Three things to install:

**1. Global fetch trap**

```js
global.fetch = () => {
  throw new Error('Unexpected real fetch — use opts.fetchFn');
};
```

This must be placed at module scope (not inside a `beforeAll`), so it is active even if a module is imported before any `beforeAll` runs.

**2. Fake timers + fixed system time**

```js
jest.useFakeTimers();
jest.setSystemTime(new Date('2026-03-01T12:00:00Z'));
```

The fixed date `2026-03-01T12:00:00Z` is used by all time-sensitive tests in the suite (e.g. outreach follow-up day calculations, freshness checks). Tests that need to advance time call `jest.advanceTimersByTime(ms)` themselves.

**3. Test timeout**

```js
jest.setTimeout(8000);
```

Enforces the < 10s budget for every test in the suite.

---

### `helpers.js`

Export all of the following by name.

#### `makeFetch(body, ok = true, status = 200)`

Returns a `jest.fn()` that resolves to the same Response-like object on every call:

```js
{
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: (_key) => null }
}
```

Both `json()` and `text()` must be async functions (return a Promise), not plain values. The `headers.get` stub prevents crashes in modules that call it.

#### `makeRouter(routes)`

`routes` is a plain object mapping URL substring keys to response body values:

```js
{ 'anthropic.com': MOCK_SCORE_RESPONSE, 'supabase.co': MOCK_SUPABASE_USERS }
```

Returns a `jest.fn(url, opts)`. On each call, it iterates the keys of `routes` and returns `makeFetch(routes[key])` for the first key that appears as a substring in `url`. If no key matches, it throws:

```
Error: makeRouter: no route matched URL "<url>". Known routes: anthropic.com, supabase.co
```

This surfaces misconfigured mocks immediately rather than returning undefined and causing confusing downstream failures.

#### `makeFetchSeq(...bodies)`

Returns a `jest.fn()` configured with `mockResolvedValueOnce` for each body in `bodies`, each wrapped in the full Response shape from `makeFetch`. After all configured calls are exhausted, the default implementation throws:

```
Error: Unexpected extra fetch call — add another response to makeFetchSeq
```

Use this when call order matters and you want the test to fail loudly if an extra API call is made.

#### `noSleep`

```js
export const noSleep = jest.fn().mockResolvedValue(undefined);
```

Satisfies `await _sleep(ms)` without any real delay. It resolves (not just returns undefined), which is important for modules that `await` the result.

#### `expectFetchCalledTimes(mockFn, n, label = '')`

A helper assertion. Throws a descriptive error if `mockFn.mock.calls.length !== n`:

```
Error: [label] expected fetchFn to be called 3 times but was called 1 time(s)
```

This prevents silent under-fetching where a pipeline skipped a stage but the test still passed because it only checked the final output.

#### `BASE_ENV`

A frozen object containing all environment variable keys required by any of the 7 pipeline chains. Use `Object.freeze({...})`. Placeholder values must be non-empty strings (modules may length-check them).

Required keys:

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_KEY
RESEND_API_KEY
ONESIGNAL_APP_ID
ONESIGNAL_API_KEY
BEEHIIV_API_KEY
BEEHIIV_PUBLICATION_ID
NOCODB_BASE_URL
NOCODB_API_KEY
X_API_KEY
X_API_SECRET
X_ACCESS_TOKEN
X_ACCESS_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
FAL_API_KEY
DOMAIN_SETUP_DATE
```

`DOMAIN_SETUP_DATE` should be a date string 90 days before `2026-03-01` (`2025-12-02`) so that warm-up limit tests start from a "mature domain" baseline. Tests in Section 09 override this with a closer date via spread.

#### Named mock response objects

Pre-built objects created with `makeFetch(body)`. Export each by name so test files import rather than redefine them.

| Export name | What it wraps |
|---|---|
| `MOCK_EDGAR_RSS` | `edgar-rss-response.json` fixture |
| `MOCK_SCORE_RESPONSE` | `claude-score-response.json` fixture |
| `MOCK_ANALYSIS_RESPONSE` | `claude-analysis-response.json` fixture |
| `MOCK_SUPABASE_EMPTY` | `{ data: [], count: 0 }` |
| `MOCK_SUPABASE_USERS` | `{ data: [{ id: 'u1', email: 'test@example.com' }], count: 1 }` |
| `MOCK_RESEND_OK` | `{ id: 'resend-msg-id-001' }` |
| `MOCK_ONESIGNAL_OK` | `{ id: 'onesignal-notif-id-001', recipients: 1 }` |
| `MOCK_AIRTABLE_RECORD` | `{ id: 'rec_test_001', fields: {} }` |

These are lazy defaults. Any test that needs a different shape should construct its own `makeFetch(customBody)` rather than mutating these exports.

---

### Fixture Files

#### `fixtures/edgar-rss-response.json`

Represents a single Form 4 filing from the EDGAR RSS → JSON parsing step. The object must contain all fields that downstream modules read:

```json
{
  "ticker": "NVDA",
  "company_name": "NVIDIA Corporation",
  "insider_name": "Jensen Huang",
  "insider_title": "Chief Executive Officer",
  "insider_category": "CEO",
  "transaction_type": "P",
  "shares": 50000,
  "price_per_share": 100.00,
  "total_value": 5000000,
  "filing_date": "2026-02-15",
  "cik": "0001045810",
  "is_10b5_plan": false,
  "form_type": "4"
}
```

`transaction_type: "P"` = purchase (passes `isBuyTransaction`). `total_value: 5000000` ensures it clears any minimum threshold filter.

#### `fixtures/claude-score-response.json`

Full Anthropic API response shape as returned by the Haiku scoring model:

```json
{
  "id": "msg_score_test_001",
  "type": "message",
  "role": "assistant",
  "model": "claude-haiku-20240307",
  "usage": {
    "input_tokens": 312,
    "output_tokens": 89
  },
  "stop_reason": "end_turn",
  "content": [
    {
      "type": "text",
      "text": "{\"score\": 9, \"reasoning\": \"CEO purchase of $5M is a strong signal. No 10b5-1 plan. No prior sell pattern in 12 months.\"}"
    }
  ]
}
```

`score: 9` ensures the happy-path alert pipeline test passes the significance threshold (`>= 8`).

#### `fixtures/claude-analysis-response.json`

Full Anthropic API response shape as returned by the analysis writing model:

```json
{
  "id": "msg_analysis_test_001",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-20240229",
  "usage": {
    "input_tokens": 1024,
    "output_tokens": 512
  },
  "stop_reason": "end_turn",
  "content": [
    {
      "type": "text",
      "text": "Jensen Huang just bought $5M worth of NVIDIA shares — the largest insider purchase in 18 months.\n\nThis matters because of what happened the last time he bought this aggressively: NVDA rallied 40% in the following quarter. His track record of timing buys ahead of major product cycles is well-documented.\n\nWatch the upcoming GTC conference as the catalyst. Huang purchased directly after the earnings call in which management gave conservative guidance — a classic setup for a guidance-beat quarter. The combination of this insider signal, the valuation reset, and the upcoming product launch makes this a high-conviction watch.\n\nHe purchased 50,000 shares at $100 per share for a total of $5,000,000. The transaction was filed on February 15, 2026 with no 10b5-1 plan attached."
    }
  ]
}
```

The `content[0].text` must:
- Be >= 150 words
- Match `/bought|purchased/i`
- Match `/last time|previous|track record/i`
- Match `/earnings|watch|catalyst/i`

All four conditions are satisfied by the text above.

#### `fixtures/claude-article-outline.json`

Claude tool-use response shape as returned when requesting a structured article outline:

```json
{
  "id": "msg_outline_test_001",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-20240229",
  "usage": {
    "input_tokens": 456,
    "output_tokens": 234
  },
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_outline_001",
      "name": "generate_outline",
      "input": {
        "title": "Why Jensen Huang's $5M Buy Could Signal NVDA's Next Leg Up",
        "sections": [
          { "heading": "The Trade at a Glance", "word_target": 150 },
          { "heading": "Track Record of This Insider", "word_target": 200 },
          { "heading": "What the Timing Tells Us", "word_target": 200 },
          { "heading": "Risk Factors", "word_target": 150 },
          { "heading": "Bottom Line", "word_target": 100 }
        ],
        "primary_keyword": "NVDA insider buying",
        "target_word_count": 800
      }
    }
  ]
}
```

`content[0].type === 'tool_use'` and `content[0].input` is a non-null object — the two conditions the fixture test checks.

---

## File Map Summary

```
ryan_cole/insiderbuying-site/tests/insiderbuying/e2e/
  setup.js                              ← global fetch trap + fake timers + setTimeout
  helpers.js                            ← makeFetch, makeRouter, makeFetchSeq,
                                           expectFetchCalledTimes, BASE_ENV, noSleep,
                                           named mock responses
  helpers.test.js                       ← self-verification tests (13 test cases)
  fixtures/
    edgar-rss-response.json             ← Form 4 NVDA purchase, all required fields
    claude-score-response.json          ← Anthropic Haiku response, score: 9
    claude-analysis-response.json       ← Anthropic Sonnet response, 150+ words, 3 keywords
    claude-article-outline.json         ← Claude tool_use response, outline input object
```

---

## Acceptance Criteria

- `npx jest --selectProjects e2e tests/insiderbuying/e2e/helpers.test.js` passes with 0 failures
- All 13+ test cases in `helpers.test.js` pass
- `global.fetch` throws the expected error when called inside the e2e project
- `Date.now()` returns `2026-03-01T12:00:00Z` epoch in all e2e tests
- All 4 fixture JSON files parse without error and pass their fixture shape tests
- `BASE_ENV` is frozen (mutating it in a test throws `TypeError`)
- `noSleep()` returns a Promise
- `makeRouter` with an unmatched URL throws a clear error naming the URL and known routes
- `makeFetchSeq` extra call throws the "Unexpected extra fetch call" error
