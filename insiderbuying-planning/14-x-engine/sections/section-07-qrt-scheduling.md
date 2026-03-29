# Section 07: QRT Scheduling

## Overview

This section adds quote-retweet (QRT) scheduling, link validation, and an updated post-with-media function to `x-auto-post.js`. These are independent utilities with no dependency on other sections — they can be implemented in Batch 1 in parallel with sections 01, 02, and 04.

**Files modified:** `n8n/code/insiderbuying/x-auto-post.js`
**Test file:** `n8n/tests/x-auto-post.test.js` (add new tests, do not break existing 21)
**NocoDB table to create:** `X_Scheduled_Jobs`

---

## Dependencies

None. This section is self-contained and does not require `ai-client.js` or any other section to be completed first.

---

## Tests First

Add these tests to `n8n/tests/x-auto-post.test.js` before implementing the functions. All tests follow the existing `node:test` + `node:assert/strict` pattern. No mocks, no live API calls — pure fixture inputs.

### buildLinkValidation

```javascript
// Text containing `http://` → { valid: false }
// Text containing `https://` → { valid: false }
// Text containing `www.example.com` → { valid: false }
// Text containing `.com/path` → { valid: false }
// Text containing "dot-com bubble" → { valid: true }  (bare phrase, not a URL)
// Text containing "TechCorp's .com domain" → { valid: false }  (.com/ check)
// Clean text with no URL patterns → { valid: true }
```

Key nuance: the `.com/` check uses the slash suffix to distinguish actual URLs from legitimate finance phrases like "dot-com bubble". A bare `.com` without a trailing slash is allowed.

### buildQuoteRetweetJob

```javascript
// Given tweetId="123", ticker="NVDA", priceAtPurchase=142.50
// → record has: tweet_id="123", ticker="NVDA", priceAtPurchase=142.50 (number),
//               type="quote_retweet", status="pending"
// → execute_after is an ISO timestamp string (UTC)
// → execute_after is between [Date.now() + 7200000, Date.now() + 10800000]
//
// priceAtPurchase in returned record is a number, not a string
// status is "pending"
// type is "quote_retweet"
```

### buildQuoteRetweetText

```javascript
// buildQuoteRetweetText("NVDA", 100, 108.3) → contains "$NVDA" and "+8.3%"
// buildQuoteRetweetText("NVDA", 100, 92)    → contains "-8.0%"
// buildQuoteRetweetText("NVDA", 100, 100)   → contains "0.0%"
// All results include "Here's what to watch"
// No result contains a URL (http, www., .com/)
```

The percentage is computed as `((currentPrice - priceAtBuy) / priceAtBuy * 100)`, formatted to one decimal place with explicit `+` or `-` sign prefix.

### Regression Check

Before marking this section done, run:

```bash
node --test n8n/tests/x-auto-post.test.js
```

All 21 existing tests across `generateArticleTweet`, `generateAlertTweet`, `postToX`, `checkDailyLimit`, and `logTweet` must still pass. The new functions are additive — do not modify existing functions.

---

## Implementation Details

### buildLinkValidation(text)

**File:** `n8n/code/insiderbuying/x-auto-post.js`

Returns `{ valid: boolean, error: string | null }`.

Rejects text that contains any of:
- `http` (covers both `http://` and `https://`)
- `www.`
- `.com/` (the slash suffix — this is the key discriminator from legitimate phrases)

Returns `{ valid: true, error: null }` when none of those patterns are found.

The reason for the `.com/` (with slash) pattern rather than bare `.com` is to allow phrases like "dot-com bubble" or "the dot-com era" that are common in finance writing, while still blocking actual URLs like `earnings.com/report`.

This function is called by the n8n workflow before posting. On failure, the workflow logs the error and retries generation. This function does not call any LLM — it is a pure synchronous check.

**Signature:**
```javascript
function buildLinkValidation(text) { /* → { valid: boolean, error: string | null } */ }
```

---

### buildQuoteRetweetJob(tweetId, ticker, priceAtPurchase)

**File:** `n8n/code/insiderbuying/x-auto-post.js`

Constructs a NocoDB record for the `X_Scheduled_Jobs` table. Called immediately after a post goes live — the n8n workflow inserts this record into NocoDB right after the tweet HTTP Request node succeeds.

**Returned record shape:**
```javascript
{
  tweet_id: string,             // the ID of the just-posted tweet
  ticker: string,               // e.g. "NVDA"
  priceAtPurchase: number,      // DECIMAL — must be a number, not a string
  type: 'quote_retweet',
  execute_after: string,        // ISO 8601 UTC timestamp
  status: 'pending'
}
```

`execute_after` is computed as `new Date(Date.now() + delay).toISOString()` where `delay` is a random value between 7,200,000 ms (2 hours) and 10,800,000 ms (3 hours).

**Valid status enum** (for reference — the full lifecycle is managed by the n8n QRT scheduler workflow, not this function):
`pending` → `processing` → `done` / `skipped` / `expired`

**Important:** `priceAtPurchase` must be stored as a JavaScript `number` (not a string). NocoDB field type is `DECIMAL(10,2)`. Passing a string would silently fail on some NocoDB versions.

**Signature:**
```javascript
function buildQuoteRetweetJob(tweetId, ticker, priceAtPurchase) { /* → X_Scheduled_Jobs record */ }
```

---

### buildQuoteRetweetText(ticker, priceAtBuy, currentPrice)

**File:** `n8n/code/insiderbuying/x-auto-post.js`

Returns a ready-to-post QRT string. Called by the QRT scheduler workflow when it picks up a `pending` job with >= 20 likes and fetches the current price.

**Output format:**
```
Update: $NVDA has moved +8.3% since this insider buy. Here's what to watch...
```

Rules:
- Percentage computed as `((currentPrice - priceAtBuy) / priceAtBuy) * 100`, rounded to one decimal place
- Always show explicit sign: `+8.3%` or `-8.0%` or `+0.0%`
- Must include `$TICKER` with the dollar sign prefix
- Must include "Here's what to watch"
- Must not contain any URL pattern (will be validated by `buildLinkValidation` before posting)

Note in implementation comments: when posting happens outside market hours, the 2–3 hour execution window may show near-zero movement. This is expected and not a bug.

**Signature:**
```javascript
function buildQuoteRetweetText(ticker, priceAtBuy, currentPrice) { /* → string */ }
```

---

### postToXWithMedia(text, mediaId)

**File:** `n8n/code/insiderbuying/x-auto-post.js`

Updated version of the existing `postToX` function. When `mediaId` is non-null, the returned request payload includes the media attachment block.

**Payload structure (with media):**
```javascript
{
  method: 'POST',
  url: 'https://api.twitter.com/2/tweets',
  body: {
    text: text,
    media: { media_ids: [mediaId] }
  }
}
```

**Payload structure (without media):**
```javascript
{
  method: 'POST',
  url: 'https://api.twitter.com/2/tweets',
  body: {
    text: text
  }
}
```

When `mediaId` is `null` or `undefined`, the `media` key is omitted entirely (not set to null). This is important because the X API v2 rejects requests where `media.media_ids` is an empty array or null.

Per the plan, which format types attach media:
- `breaking_alert`: always attempts media attachment
- `market_commentary`: always attempts media attachment
- `thread`: never attaches media
- `engagement_poll`: never attaches media

This function is a pure payload builder — it does not make any HTTP requests. The n8n HTTP Request node executes the payload.

**Signature:**
```javascript
function postToXWithMedia(text, mediaId) { /* → request payload object */ }
```

---

## NocoDB Setup Required

Before this section's QRT flow can run end-to-end, the `X_Scheduled_Jobs` table must exist in NocoDB.

**Table name:** `X_Scheduled_Jobs`

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| `tweet_id` | Text | ID of the original posted tweet |
| `ticker` | Text | e.g. "NVDA" |
| `price_at_purchase` | Decimal (10,2) | Price at the time of insider buy |
| `type` | Text | Always `"quote_retweet"` for now |
| `execute_after` | DateTime (UTC) | When the scheduler is allowed to process |
| `status` | Text | `pending` / `processing` / `done` / `skipped` / `expired` |

Create this table before the first post run. The n8n Insert node writes to it; the QRT scheduler workflow reads from it.

---

## QRT Scheduler Workflow (n8n — not JS code)

This is documented here for the implementer but lives in the n8n workflow editor, not in JS modules.

**Schedule:** every 15 minutes.

**Logic:**
1. Query `X_Scheduled_Jobs` WHERE `status = 'pending'` AND `execute_after <= now()`
2. For each job: atomically set `status = 'processing'` before any further checks — this prevents two concurrent scheduler executions from double-posting
3. Check original tweet likes: `GET /2/tweets/{tweet_id}?tweet.fields=public_metrics`
4. If `public_metrics.like_count < 20` AND job age < 24h: reset `status = 'pending'` (skip this run, will retry in 15 min)
5. If `public_metrics.like_count < 20` AND job age >= 24h: set `status = 'expired'` (zombie expiry — prevents dead records accumulating)
6. If `like_count >= 20`: fetch current price → call `buildQuoteRetweetText(ticker, priceAtPurchase, currentPrice)` → post QRT via `postToXWithMedia` → set `status = 'done'`

**Zombie expiry rule:** If `now > execute_after + 86400000` (24 hours past window) and still `pending`, mark `expired`. This ensures low-engagement posts that never reach 20 likes don't accumulate forever in the table.

**Concurrency note:** Two scheduler executions could theoretically pick up the same job. The atomic `status = 'processing'` update in step 2 prevents double-posting — whichever execution sets `processing` first "wins". NocoDB does not provide true transactions, so this is a soft guarantee acceptable at these volumes.

---

## Context: Where This Fits

The QRT scheduling loop adds a second engagement touch for posts that gain traction. The full lifecycle for a post is:

1. Post goes live (via `buildBreakingAlert` / `buildCommentary` etc. in section-06)
2. `buildQuoteRetweetJob` record inserted to `X_Scheduled_Jobs` with `status=pending`
3. 2–3 hours later, QRT scheduler picks it up
4. If >= 20 likes: `buildQuoteRetweetText` generates the update text, QRT is posted
5. If never reaches 20 likes within 24h: record expires silently

`buildLinkValidation` is a shared utility also used in the format rotation flow (section-06) — it is defined here but called from both QRT text and format builders.

`postToXWithMedia` replaces the existing `postToX` function. If section-06 is being implemented in parallel, coordinate to ensure `postToX` is only renamed once and callers are updated together.
