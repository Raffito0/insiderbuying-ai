# Section 02: Data Enrichment

## Overview

This section adds two new functions to `n8n/code/insiderbuying/x-engagement.js`:

- `extractTicker(tweetText)` — extracts the first `$CASHTAG` from a tweet that has matching filing data
- `buildFilingContext(tweet, filings)` — constructs a structured `FilingContext` object from the tweet and a pre-fetched array of filing records

These two functions are the foundation for everything the reply pipeline does. When `buildFilingContext` returns `null`, the upstream n8n workflow skips the reply entirely — no LLM call, no posting.

**Dependencies:** None. This section is fully independent and can be implemented in Batch 1 alongside section-01, section-04, and section-07.

**Blocked by this section:** section-03 (archetype system) and section-05 (media attachment) both require `FilingContext` to exist before they can be implemented.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `n8n/code/insiderbuying/x-engagement.js` | Add `extractTicker` and `buildFilingContext` |
| `n8n/tests/x-engagement.test.js` | Add new test cases (see below) |

---

## Tests — Write These First

These tests live in `n8n/tests/x-engagement.test.js` and use the existing `node:test` + `node:assert/strict` pattern. All tests are pure fixture-based — no mocks, no live API calls.

### `extractTicker` tests

```javascript
// Standard cashtag
// input: '$NVDA is buying heavily this quarter'
// expected: "NVDA"

// Extended ticker format ($BRK.B)
// input: 'Big move in $BRK.B today'
// Note: the regex \$[A-Z]{1,6}(?:\.[A-Z]{1,2})? matches "$BRK.B"
// Validate exact output (the suffix ".B" is captured as part of the match, so returned
// value will include the suffix — confirm whether extractTicker strips it or returns "BRK.B")

// Multiple cashtags — returns first one that has filing data
// input: '$NVDA $AMD both moving'
// filings array has entry for AMD but not NVDA
// expected: "AMD"

// No cashtags
// input: 'The market is up today'
// expected: null

// Dollar-amount context (no letter pattern)
// input: 'Insider bought $1.2M worth of shares'
// expected: null ($ followed by digit, not letter)

// Lowercase — cashtags are uppercase only
// input: 'the $nvda trade is interesting'
// expected: null

// Trailing period — sentence-ending punctuation not captured
// input: 'Loading up on $NVDA.'
// expected: "NVDA" (the trailing period is not part of the ticker)

// 10 diverse tweet samples covering all patterns above
```

All `extractTicker` tests use a filings fixture array to simulate what the upstream NocoDB query would return. When testing "first match with filing data", pass a filings array that only contains the second ticker — the function must check each cashtag in order until it finds one with a matching entry.

### `buildFilingContext` tests

```javascript
// Single filing match → FilingContext with all fields populated
// tweet: { text: 'Big $NVDA buy' }
// filings: [{ ticker: 'NVDA', insider_name: 'Jensen Huang', insider_role: 'CEO',
//             transaction_value: 2400000, transaction_date: '2024-11-15',
//             price_at_purchase: 142.50, historical_return: '+23% avg' }]
// expected: FilingContext with all 8 fields populated

// clusterCount capped at 3 even when filings has 4 entries
// filings: array of 4 records all with ticker "NVDA"
// expected: context.clusterCount === 3

// No cashtag in tweet → null
// tweet: { text: 'Market is interesting today' }
// expected: null

// Cashtag present but empty filings array → null
// tweet: { text: '$NVDA is moving' }, filings: []
// expected: null

// priceAtPurchase is a number, not a string
// assert typeof context.priceAtPurchase === 'number'

// trackRecord is null when filing has no historical_return field
// filings[0] has no historical_return property
// expected: context.trackRecord === null
```

---

## Implementation

### `extractTicker(tweetText)`

**Location:** Add to `n8n/code/insiderbuying/x-engagement.js`

**Signature:** `function extractTicker(tweetText) { /* → string | null */ }`

**Logic:**
1. Use the regex `\$[A-Z]{1,6}(?:\.[A-Z]{1,2})?` to find all cashtag matches in `tweetText`
2. Return the first match (stripping the leading `$`), or `null` if no matches

Note: in isolation, `extractTicker` returns the first cashtag found in the text. The "first one with filing data" behavior lives in `buildFilingContext` — that function calls `extractTicker` and then cross-references against the filings array.

**Regex notes:**
- `\$` — literal dollar sign
- `[A-Z]{1,6}` — 1–6 uppercase letters (standard ticker)
- `(?:\.[A-Z]{1,2})?` — optional `.B` or `.A` suffix for share class tickers like `$BRK.B`, `$RDS.A`
- This correctly excludes `$1.2M` (digit after `$`) and `$nvda` (lowercase)
- Trailing sentence period `$NVDA.` does not match because `.` followed by a lowercase or end-of-string does not satisfy `[A-Z]{1,2}`

The function returns the matched string minus the `$` prefix. For `$BRK.B` the returned value is `"BRK.B"`. Downstream consumers (including `buildFilingContext`) compare against the `ticker` field in filing records — make sure filing records store `"BRK.B"` if that is the ticker, not `"BRK"`.

### `buildFilingContext(tweet, filings)`

**Location:** Add to `n8n/code/insiderbuying/x-engagement.js`

**Signature:** `function buildFilingContext(tweet, filings) { /* → FilingContext | null */ }`

**Arguments:**
- `tweet` — the tweet object from twitterapi.io. The text is in `tweet.text`
- `filings` — array of filing records fetched from NocoDB by an upstream n8n node (filtered to recent filings; may be empty)

**Logic:**
1. Extract all cashtags from `tweet.text` using the regex from `extractTicker`
2. For each cashtag (in order), check if any entry in `filings` has a matching `ticker` field
3. If no match found after checking all cashtags, return `null`
4. From the matched filing records, construct and return a `FilingContext` object

**FilingContext shape:**

```javascript
{
  ticker: string,           // e.g. "NVDA"
  insiderName: string,      // e.g. "Jensen Huang"
  insiderRole: string,      // e.g. "CEO"
  transactionValue: string, // pre-formatted: "$2.4M" — see formatting note below
  transactionDate: string,  // ISO date string
  priceAtPurchase: number,  // decimal number e.g. 142.50 — NOT a string
  trackRecord: string|null, // e.g. "+23% avg" or null if field absent
  clusterCount: number      // 1–3, capped at 3
}
```

**`transactionValue` formatting:** Convert the raw number from NocoDB (stored in dollars) to a human-readable abbreviated string: values ≥ 1,000,000 → `"$X.XM"`, values ≥ 1,000 → `"$X.XK"`, otherwise `"$X"`. Round to one decimal place.

**`clusterCount`:** Count the number of filing records that match the resolved ticker. If the count exceeds 3, return 3. This prevents the reply prompt from implying more cluster buying than is contextually useful.

**`trackRecord`:** Read from `filing.historical_return`. If the field is `undefined`, `null`, or an empty string, return `null` in the context object.

**Null returns:** Return `null` in these cases:
- `tweet.text` contains no cashtags matching the regex
- No filing record matches any cashtag found in the tweet
- `filings` is empty or not an array

---

## Data Flow in n8n Workflow

This context is informational — no JS changes needed for this, but it explains how the data arrives.

1. An upstream NocoDB node queries the `Insider_Filings` table for recent records (e.g. last 30 days)
2. The result array is passed as the `filings` argument to `buildFilingContext`
3. If `buildFilingContext` returns `null`, the n8n workflow has an IF node that routes to "skip reply" — no LLM call is made
4. If it returns a `FilingContext`, execution continues to section-03 (archetype selection and prompt building)

The n8n workflow, not the JS module, is responsible for querying NocoDB and handling the null-skip branch. The JS functions are pure utilities.

---

## Exports

Both functions must be added to `module.exports` at the bottom of `x-engagement.js`:

```javascript
module.exports = {
  // ... existing exports ...
  extractTicker,
  buildFilingContext,
};
```

---

## Implementation Notes

**Actual changes from plan:**
- `trackRecord` uses explicit `!= null && !== ''` check instead of `||` — preserves `"0%"` historical return
- `_formatValue` sub-$1K uses `.toFixed(0)` for consistent integer formatting
- `extractTicker` uses non-global regex (no lastIndex issues); `_extractAllTickers` internal helper uses global regex for `buildFilingContext`

**Tests: 11 new tests in 2 describe blocks (extractTicker + buildFilingContext), all passing. 21 previous tests still pass. 32/32 total.**

## Regression Check

After implementing, run the existing test suite to confirm no regressions:

```bash
node --test n8n/tests/x-engagement.test.js
```

All 21 existing tests must continue passing. The new functions are purely additive — they do not modify any existing function logic.
