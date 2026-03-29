# Section 06: Format Rotation (x-auto-post.js)

## Overview

This section adds a four-format post rotation system to `x-auto-post.js`, replacing the existing `generateArticleTweet` and `generateAlertTweet` functions. Posts are generated via DeepSeek (through `ai-client.js`) and scheduled across four daily time slots. The daily cap drops from 10 to 4 posts (one per slot).

**Depends on:** section-01 (ai-client.js must exist and export `deepseek()`)

**Blocks:** nothing

**File to modify:** `n8n/code/insiderbuying/x-auto-post.js`

**Test file to modify:** `n8n/tests/x-auto-post.test.js`

---

## Tests First

Add the following test cases to `n8n/tests/x-auto-post.test.js` before implementing. All tests use Node.js native `node:test` + `node:assert/strict`.

### selectNextFormat

```
- Given last used = "breaking_alert" → never returns "breaking_alert" (run 50 times)
- Given last used = null → returns any of the 4 valid format keys
- Returns only valid format key names from: breaking_alert, thread, market_commentary, engagement_poll
```

### buildBreakingAlert

```
- With mock fetchFn returning fixture text of 220 chars and valid $NVDA cashtag → returns that exact text
- Passes correct prompt to DeepSeek containing the filing ticker and transaction value
```

### buildThread

```
- With mock fetchFn returning 3 valid tweet texts (each ≤280 chars, no links, first ends with 🧵)
  → returns array of exactly 3 strings
- With mock fetchFn returning a tweet 2 that exceeds 280 chars
  → retries once → returns null after both attempts fail
- With mock fetchFn returning a tweet containing "http://" link
  → retries → returns null after 2 failures
- Successful return: no element in the array exceeds 280 chars
- Successful return: first element ends with the 🧵 emoji
```

### buildCommentary

```
- With mock fetchFn → returns a string
- Passes filing ticker and transaction data to DeepSeek in the prompt
```

### buildPoll

```
- With mock fetchFn returning a valid poll JSON → returns object with shape { text: string, poll: PollObject }
- Returned poll.options contains 2–4 entries
- Returned poll.duration_minutes is 1440
```

### validatePoll

```
- Poll with 2 options, each label ≤25 chars → { valid: true }
- Poll with 4 options, each label ≤25 chars → { valid: true }
- Poll with 1 option → { valid: false }
- Poll with 5 options → { valid: false }
- Poll with one option label of exactly 26 chars → { valid: false, error includes "25 characters" }
- Poll with one option label of exactly 25 chars → { valid: true }
```

### Regression

```
Run: node --test n8n/tests/x-auto-post.test.js
All existing tests for generateArticleTweet and generateAlertTweet must be removed or updated
(these functions are being deleted). All other existing tests must continue passing.
```

---

## Implementation

### 1. Remove old functions

Delete `generateArticleTweet` and `generateAlertTweet` from `x-auto-post.js`. Remove their corresponding test cases from `x-auto-post.test.js`.

### 2. Update MAX_DAILY_POSTS

```javascript
const MAX_DAILY_POSTS = 4;
```

The existing `checkDailyLimit(logEntries)` function uses this constant — no other changes needed there.

### 3. Add POST_FORMATS config

At the top of `x-auto-post.js` (after imports), add a config object:

```javascript
const POST_FORMATS = {
  breaking_alert:      { generate: buildBreakingAlert,  mediaTemplate: 2,    slot: { hour: 9,  minute: 30 } },
  thread:              { generate: buildThread,          mediaTemplate: null, slot: { hour: 12, minute: 0  } },
  market_commentary:   { generate: buildCommentary,      mediaTemplate: 2,    slot: { hour: 15, minute: 30 } },
  engagement_poll:     { generate: buildPoll,            mediaTemplate: null, slot: { hour: 18, minute: 0  } },
};
```

`mediaTemplate: 2` means this format attempts media attachment (handled by section-05's `maybeAttachMedia`). `mediaTemplate: null` means text-only — never attempt media.

### 4. selectNextFormat(lastUsedFormat)

Accepts the last-used format key (string or null). Returns a format key string chosen randomly from the formats that are NOT the last-used one. If `lastUsedFormat` is null, returns any of the four.

```javascript
function selectNextFormat(lastUsedFormat) { /* → format key string */ }
```

- Get all keys from `POST_FORMATS`
- If `lastUsedFormat` is a valid key, filter it out
- Pick randomly from the remaining keys using `Math.random()`
- Return the chosen key

### 5. buildBreakingAlert(data, helpers)

Calls `deepseek()` from `ai-client.js`. Returns the response text string.

```javascript
async function buildBreakingAlert(data, helpers) { /* → string */ }
```

Prompt instructions to pass to DeepSeek:
- Urgency tone, no greeting, lead with the ticker and action
- 200–250 characters
- Include a forward-looking statement ("watch for…" or "key level is…")
- Must include the `$TICKER` cashtag
- No URLs

`maxTokens`: 400

`data` shape (what the n8n workflow passes):
```javascript
{
  ticker: string,
  insiderName: string,
  insiderRole: string,
  transactionValue: string,   // e.g. "$2.4M"
  transactionDate: string,
  priceAtPurchase: number,
  trackRecord: string | null,
  clusterCount: number
}
```

### 6. buildThread(data, helpers)

Calls `deepseek()` and returns an array of three tweet texts, or null if validation fails after retry.

```javascript
async function buildThread(data, helpers) { /* → [string, string, string] | null */ }
```

Prompt instructions:
- Tweet 1: hook tweet, 220–280 chars, must end with 🧵
- Tweet 2: data tweet — specific numbers, dollar amounts, dates from the filing
- Tweet 3: actionable tweet — what to watch + one question for engagement
- No URLs in any tweet

**Internal validation (before returning):**
- Each tweet must be ≤280 characters
- No tweet may contain a link (check with `buildLinkValidation` from section-07 — if that section is not yet merged, inline the same check: reject `http`, `www.`, `.com/`)

**Retry logic:** If any tweet fails validation, call `deepseek()` once more with the same prompt. If the second attempt also fails, return `null`. The n8n workflow skips thread posting when `null` is returned.

`maxTokens`: 500

### 7. buildCommentary(data, helpers)

Calls `deepseek()` and returns the response text string.

```javascript
async function buildCommentary(data, helpers) { /* → string */ }
```

Prompt instructions:
- Market observation framing: what this filing means in broader market context
- Include the insider angle (role, transaction size, cluster if >1)
- 180–240 characters
- No URLs

`maxTokens`: 400

### 8. buildPoll(data, helpers)

Calls `deepseek()` and returns `{ text: string, poll: PollObject }`.

```javascript
async function buildPoll(data, helpers) { /* → { text: string, poll: PollObject } */ }
```

Prompt instructions to DeepSeek:
- Write a poll question about the filing (150–220 chars for `text`)
- Provide 2–4 answer options
- **Each poll option must be 25 characters or fewer** (state this explicitly in the prompt)
- The poll question should prompt engagement ("Do you think…?", "Would you…?")

Returned shape:
```javascript
{
  text: string,      // the tweet text introducing the poll
  poll: {
    options: [{ label: string }, ...],  // 2–4 options, each label ≤25 chars
    duration_minutes: 1440              // always 24 hours — hardcode this, do not ask DeepSeek
  }
}
```

`maxTokens`: 300

After receiving the DeepSeek response, call `validatePoll` on the poll object before returning. If validation fails, the n8n workflow (not this function) handles retry — `buildPoll` itself does not retry.

### 9. validatePoll(pollObject)

Pure validation function. No LLM calls.

```javascript
function validatePoll(pollObject) { /* → { valid: boolean, error: string | null } */ }
```

Rules:
- `pollObject.options` must be an array
- Length must be 2–4 (inclusive)
- Each `option.label` must be ≤25 characters

Returns `{ valid: true, error: null }` on pass. Returns `{ valid: false, error: '<reason>' }` on failure. The error string must mention "25 characters" when a label is too long.

---

## n8n Workflow Changes (not in JS)

These changes are made in the n8n workflow editor after the JS code is deployed:

1. Change the Schedule Trigger from a single trigger to 4 separate triggers — one per time slot (9:30, 12:00, 15:30, 18:00)
2. Add a NocoDB query for `X_State.last_post_format` at workflow start → pass to `selectNextFormat`
3. Replace calls to `generateArticleTweet`/`generateAlertTweet` with the appropriate format-specific builder based on the key returned by `selectNextFormat`
4. After generating content: call `validatePoll` when format is `engagement_poll`; retry generation if invalid
5. For formats with `mediaTemplate: 2` (`breaking_alert`, `market_commentary`): call `maybeAttachMedia` (section-05). For `thread` and `engagement_poll`: skip media entirely
6. After a successful post: update `X_State.last_post_format` in NocoDB

---

## Dependencies and External Setup

| Item | Status | Notes |
|------|--------|-------|
| `ai-client.js` — `deepseek()` export | Required | section-01 must be merged first |
| `X_State` NocoDB table | Required | Must have `last_post_format` field (text, nullable) |
| DeepSeek API key | Required | Add `DEEPSEEK_API_KEY` env var in n8n settings |
| `buildLinkValidation` (section-07) | Optional | If not yet available, inline the same check in `buildThread` |

`helpers` object passed from n8n must contain:
- `fetchFn` — the fetch implementation (polyfilled in n8n Code node)
- `deepseekApiKey` — read from env var `DEEPSEEK_API_KEY`

---

## File Summary

**Modify:** `n8n/code/insiderbuying/x-auto-post.js`
- Delete: `generateArticleTweet`, `generateAlertTweet`
- Add: `POST_FORMATS`, `selectNextFormat`, `buildBreakingAlert`, `buildThread`, `buildCommentary`, `buildPoll`, `validatePoll`
- Update: `MAX_DAILY_POSTS = 4`

**Modify:** `n8n/tests/x-auto-post.test.js`
- Remove: tests for `generateArticleTweet`, `generateAlertTweet`
- Add: tests listed above in the Tests First section
