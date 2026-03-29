# Section 04: Validation, Caps, and Timing

## Overview

This section adds four pure utility functions to `n8n/code/insiderbuying/x-engagement.js`:

- `validateReply(text)` -- enforces five content rules on a generated reply
- `checkDailyReplyCap(logEntries)` -- soft cap of 15 replies per day
- `buildTimingDelay()` -- returns a random delay (3-5 min) for humanising post cadence
- `buildEngagementSequence(originalTweetId)` -- builds a single like payload for the original tweet

This section has **no dependencies** on other sections. It can be implemented in parallel with sections 01, 02, and 07.

---

## Files to Modify

- **Modify**: `n8n/code/insiderbuying/x-engagement.js` -- add four functions
- **Modify**: `n8n/tests/x-engagement.test.js` -- add tests listed below

Do not touch `x-auto-post.js` or `ai-client.js` in this section.

---

## Tests First

Add these test cases to `n8n/tests/x-engagement.test.js` **before** implementing. All tests use Node.js native `node:test` and `node:assert/strict`. No mocks -- all inputs are fixtures.

### `validateReply` tests

```javascript
// Boundary: min length
test('validateReply: 150-char text with $NVDA and 0 emojis -> valid', ...)
// build a 150-char string containing $NVDA, no URL, no refusal phrases
// assert: result.valid === true

test('validateReply: 220-char text -> valid', ...)
// build a 220-char string containing $NVDA
// assert: result.valid === true

test('validateReply: 149-char text -> invalid, error mentions "149"', ...)
// assert: result.valid === false && result.error includes "149"

test('validateReply: 221-char text -> invalid', ...)
// assert: result.valid === false

// Emoji boundary
test('validateReply: 3 emojis -> invalid, error mentions "emojis"', ...)
// assert: result.valid === false && result.error includes "emoji"

test('validateReply: 2 emojis -> valid (<=2 allowed)', ...)
// assert: result.valid === true

// URL detection
test('validateReply: contains http:// -> invalid, error mentions "link"', ...)
// assert: result.valid === false && result.error includes "link"

test('validateReply: contains www.example.com -> invalid', ...)
// assert: result.valid === false

test('validateReply: contains .com/path -> invalid', ...)
// assert: result.valid === false

test('validateReply: contains "dot-com bubble" -> valid (not a URL)', ...)
// the string ".com/" is not present; bare "dot-com" is allowed
// assert: result.valid === true

// Cashtag requirement
test('validateReply: no $CASHTAG -> invalid, error mentions "CASHTAG"', ...)
// assert: result.valid === false && result.error includes "CASHTAG"

test('validateReply: $BRK.B present -> valid (extended ticker format)', ...)
// assert: result.valid === true

// AI refusal detection
test('validateReply: contains "As an AI language model" -> invalid, error mentions "AI refusal"', ...)
// assert: result.valid === false && result.error includes "AI refusal"

test('validateReply: contains "I cannot" -> invalid', ...)
// assert: result.valid === false

// Happy path
test('validateReply: $NVDA, 180 chars, no URL, no refusal, 1 emoji -> valid', ...)
// assert: result.valid === true
```

### `checkDailyReplyCap` tests

```javascript
test('checkDailyReplyCap: 15 entries -> { canReply: false, repliesToday: 15 }', ...)
// build array of 15 objects (shape does not matter for this function)
// assert: result.canReply === false && result.repliesToday === 15

test('checkDailyReplyCap: 14 entries -> { canReply: true, repliesToday: 14 }', ...)
// assert: result.canReply === true && result.repliesToday === 14

test('checkDailyReplyCap: empty array -> { canReply: true, repliesToday: 0 }', ...)
// assert: result.canReply === true && result.repliesToday === 0
```

### `buildTimingDelay` tests

```javascript
test('buildTimingDelay: 100 calls all return values in [180000, 300000]', ...)
// run the function 100 times, collect results
// assert: every value >= 180000 && every value <= 300000

test('buildTimingDelay: calls return different values (not constant)', ...)
// run 20 times, collect into Set
// assert: Set size > 1 (values are not all identical)
```

### `buildEngagementSequence` tests

```javascript
test('buildEngagementSequence: returns array of exactly 1 payload', ...)
// const result = buildEngagementSequence("123")
// assert: Array.isArray(result) && result.length === 1

test('buildEngagementSequence: payload is a like request for the original tweet', ...)
// const result = buildEngagementSequence("123")
// assert: result[0].tweetId === "123" (or equivalent field)
// assert: result[0] contains the like endpoint structure

test('buildEngagementSequence: payload uses POST /2/users/{myId}/likes structure', ...)
// assert: result[0].method === "POST" (or url contains "/likes")
```

---

## Implementation

### `validateReply(text)`

**File:** `n8n/code/insiderbuying/x-engagement.js`

**Signature:**
```javascript
function validateReply(text) { /* -> { valid: boolean, error: string | null } */ }
```

Checks five conditions in order. Return `{ valid: false, error: '<message>' }` on the first failing condition, or `{ valid: true, error: null }` if all pass.

**Condition 1 -- Character length (150-220):**
Use `text.length`. If `< 150`, error message must include the actual character count (e.g. `"Reply is 149 chars, minimum is 150"`). If `> 220`, similar message.

**Condition 2 -- Emoji count (<= 2):**
Count emoji code points using the Unicode emoji regex `/\p{Emoji_Presentation}/gu` spread into an array and counting its length. Allow for ZWJ-composed sequences that may count as 2 code points -- the limit is `> 2` (i.e. 3+ triggers failure). Error message must include the word `"emoji"`.

**Condition 3 -- No URLs:**
Check for any of three patterns:
- `http` (covers `http://` and `https://`)
- `www.`
- `.com/` (the trailing slash distinguishes a URL path from the phrase "dot-com")

Use simple `includes()` checks. Do NOT flag bare "dot-com" as a URL. Error message must include the word `"link"`.

**Condition 4 -- At least one `$CASHTAG`:**
Use regex `/\$[A-Z]{1,6}(?:\.[A-Z]{1,2})?/` to test the text. If no match, error message must include `"CASHTAG"`.

**Condition 5 -- No AI refusal phrases:**
Use `/\b(as an AI|language model|I cannot|I apologize)\b/i`. If matched, error message must include `"AI refusal"`.

### `checkDailyReplyCap(logEntries)`

**File:** `n8n/code/insiderbuying/x-engagement.js`

**Signature:**
```javascript
function checkDailyReplyCap(logEntries) { /* -> { canReply: boolean, repliesToday: number } */ }
```

`logEntries` is an array of NocoDB records already filtered to today's replies by the upstream n8n workflow (the JS function does not filter by date). The function simply counts the array length and compares to the cap constant.

- **Cap constant:** `const DAILY_REPLY_CAP = 15`
- `repliesToday = logEntries.length`
- `canReply = repliesToday < DAILY_REPLY_CAP`

This is a **soft cap**: if two n8n executions query simultaneously, the count can exceed 15 by 1. This is acceptable and not a ban risk at these volumes.

### `buildTimingDelay()`

**File:** `n8n/code/insiderbuying/x-engagement.js`

**Signature:**
```javascript
function buildTimingDelay() { /* -> number (ms) */ }
```

Returns a random integer between `180000` (3 minutes) and `300000` (5 minutes) inclusive. Use `Math.floor(Math.random() * (300000 - 180000 + 1)) + 180000`. The n8n workflow feeds this return value into a Wait node before the HTTP Post that sends the reply.

### `buildEngagementSequence(originalTweetId)`

**File:** `n8n/code/insiderbuying/x-engagement.js`

**Signature:**
```javascript
function buildEngagementSequence(originalTweetId) { /* -> payload[] */ }
```

Returns an array of **exactly one** payload object: a like request for the original tweet.

The payload structure mirrors the X API v2 endpoint `POST /2/users/{myId}/likes`:

```javascript
{
  method: 'POST',
  url: 'https://api.twitter.com/2/users/{{myUserId}}/likes',
  body: { tweet_id: originalTweetId }
}
```

`myUserId` is a template placeholder (`{{myUserId}}`). The n8n HTTP Request node replaces it with the authenticated user's ID from the credentials context. The JS function does not need to know the real user ID.

**Rationale for exactly 1 payload:** Random thread reply likes are excluded. Liking random replies risks accidentally engaging with spam or scam content, which outweighs any engagement farming benefit at this account stage.

---

## Integration Notes for n8n Workflow

These functions integrate into the reply workflow as follows (n8n node changes, not JS):

1. **Daily cap check:** At the start of the reply flow, query `X_Engagement_Log` for today's entries, pass the results array to `checkDailyReplyCap`. If `canReply === false`, stop the execution (no LLM calls made).

2. **Timing delay:** After the reply text is validated and approved, call `buildTimingDelay()` and feed the return value (in ms) into a Wait node before the HTTP Post node that posts the reply.

3. **Engagement sequence:** Before posting the reply, execute the like payload returned by `buildEngagementSequence(originalTweetId)` via an HTTP Request node.

4. **Reply validation:** After LLM generation, call `validateReply(text)`. If `valid === false`, retry the LLM call once. If still invalid on second attempt, log the error and skip the reply for this tweet. Do not surface the skip to the user.

---

## Edge Cases and Gotchas

- **`validateReply` emoji counting:** The `\p{Emoji_Presentation}` regex requires the `/u` flag. Without it, Unicode property escapes throw a SyntaxError. A single composed emoji (e.g. (family emoji)) may count as multiple code points under `Emoji_Presentation` -- the 2-emoji limit accommodates this by design, as finance reply text should use <=1 emoji in practice.

- **`validateReply` "dot-com" case:** The check is for `.com/` (with trailing slash), not `.com` alone. This means text like "the dot-com bubble" or "CapCom's site" does not trigger the URL filter. Only an actual URL path segment (`.com/anything`) is blocked.

- **`checkDailyReplyCap` date filtering:** This function only counts array length. It is the upstream n8n NocoDB query's responsibility to filter records to today's UTC date. If the query returns all-time records, the cap will trigger incorrectly. Verify the NocoDB filter uses `created_at >= today (UTC start)`.

- **`buildTimingDelay` in testing:** The range test (100 calls within `[180000, 300000]`) is the correct approach. Do not try to mock `Math.random` for range tests -- just assert the output is always within bounds.

- **`buildEngagementSequence` user ID placeholder:** The `{{myUserId}}` template string in the URL is intentional. The n8n HTTP Request node supports expression interpolation using credentials data. Do not hardcode an actual user ID.

---

## Regression Check

After implementing, run the full test suite and confirm the existing 21 tests still pass:

```bash
node --test n8n/tests/x-engagement.test.js
node --test n8n/tests/x-auto-post.test.js
```

The functions in this section are all **pure additive** -- they add new exports without modifying any existing function signatures or behaviour. No regressions are expected, but verify anyway before marking this section done.
