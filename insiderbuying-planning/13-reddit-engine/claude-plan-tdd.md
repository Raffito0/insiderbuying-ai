# TDD Plan: 13-reddit-engine

## Test Framework

- **Runner**: Node built-in test runner (`node:test` + `node:assert/strict`) — same as existing test file
- **Module format**: CommonJS only (`require` / `module.exports`)
- **Target file**: `n8n/tests/reddit-monitor.test.js` (extend, do not replace — existing tests must still pass)
- **New stub file**: `n8n/tests/visual-templates.test.js` (separate, small)

### Mock strategy

All external I/O is mocked. `reddit-monitor.js` exports pure functions where possible; all network calls are injected via a thin `_http` wrapper that can be overridden in tests. The pattern used throughout:

```javascript
// In reddit-monitor.js:
const _deps = { fetch: require('./http-fetch') };  // real
module.exports._setDeps = (d) => Object.assign(_deps, d); // test seam

// In test:
const mod = require('../code/insiderbuying/reddit-monitor.js');
mod._setDeps({ fetch: async (url, opts) => mockFetchImpl(url, opts) });
```

Alternatively, for simpler unit isolation: pass mock functions as arguments directly where the spec allows.

---

## Section 0: NocoDB Tables + visual-templates.js Stub

### visual-templates.test.js

**What to test**: The three exported stubs return `null` and accept the expected argument shapes without throwing.

```
describe('visual-templates stubs', () => {
  it('generateInsiderTable(filings) returns null')
  it('generatePriceChart(ticker, priceData) returns null')
  it('generatePeerRadar(ticker, peers) returns null')
  it('all three accept undefined args without throwing')
})
```

**No mocks needed** — stubs have no I/O.

### NocoDB table setup (infrastructure — no unit test)

No code is written for this section — it is a manual NocoDB setup step. Document the expected table schemas as comments in a `fixtures/nocodb-schema.json` file for reference, but do not write tests for infrastructure.

---

## Section 1: OAuth + SUBREDDIT_TONE_MAP + State Helpers

### Mocks required

| Dependency | Mock |
|---|---|
| Reddit `/api/v1/access_token` | `mockRedditAuth(grantType, response)` — returns `{ access_token, expires_in }` |
| NocoDB GET `/api/v1/db/data/noco/...` | `mockNocoDB(key, storedValue)` — returns row or 404 |
| NocoDB PATCH/POST | `mockNocoDBWrite()` — captures written value, returns 200 |

### Test cases

```
describe('SUBREDDIT_TONE_MAP', () => {
  it('has exactly 5 subreddits')
  it('each entry has tone, wordLimit [min, max], style, example, dailyCap')
  it('dailyCaps sum to 10')
  it('wordLimit is [min, max] with min < max for all entries')
})

describe('getRedditToken — refresh token mode', () => {
  it('uses grant_type=refresh_token when REDDIT_REFRESH_TOKEN is set')
  it('returns token string from auth response')
  it('reads cached token from NocoDB if not expired — no HTTP call')
  it('calls auth endpoint when cached token is expired')
  it('writes new token + expires_at back to NocoDB after fresh fetch')
})

describe('getRedditToken — ROPC fallback', () => {
  it('uses grant_type=password when REDDIT_REFRESH_TOKEN is absent')
  it('sends username + password in request body')
})

describe('getState / setState', () => {
  it('getState returns JSON-parsed value for existing key')
  it('getState returns null for missing key (404 response)')
  it('setState upserts — creates record if key absent')
  it('setState upserts — updates record if key exists')
  it('setState JSON-serializes non-string values')
})

describe('getRedditLog', () => {
  it('returns array of records for given date')
  it('returns empty array when no posts on that date')
  it('filters by status = posted only')
})
```

**Edge cases**:
- `getRedditToken` with expired token (expiry = past timestamp) → triggers fresh fetch
- NocoDB returns malformed JSON in `value` field → `getState` returns `null` (safe default)
- Reddit auth returns non-200 → `getRedditToken` throws with meaningful message

---

## Section 2: Reply Structure Rotation + validateReply

### Mocks required

| Dependency | Mock |
|---|---|
| NocoDB `getState` / `setState` | In-memory state object, no HTTP |

### Test cases

```
describe('REPLY_STRUCTURES', () => {
  it('defines exactly 3 structures: Q_A_DATA, AGREEMENT_BUT, DATA_INTERPRET')
  it('each structure has an id and a systemPromptInstruction string')
})

describe('getNextReplyStructure', () => {
  it('returns REPLY_STRUCTURES[0] when index is 0')
  it('returns REPLY_STRUCTURES[1] on second call (increments counter)')
  it('wraps around to 0 after index 2')
  it('rotates independently per subreddit (wallstreetbets vs stocks)')
})

describe('validateReply — word count', () => {
  it('rejects text below wordLimit[0] for wallstreetbets (min 50)')
  it('rejects text above wordLimit[1] for ValueInvesting (max 200)')
  it('accepts text within range for stocks (100-150 words)')
  it('applies ±10% tolerance: 45-word text passes for wsb min=50')
  it('returns { valid, words, min, max } shape')
})

describe('validateReply — markdown stripping', () => {
  it('strips **bold** markers before counting words')
  it('strips [link text](url) to just "link text" before counting')
  it('strips # header markers before counting')
})

describe('validateReply — URL and brand name check', () => {
  it('rejects text containing http:// or https://')
  it('rejects text containing EarlyInsider')
  it('rejects text containing earlyinsider.com')
  it('accepts text with ticker symbols like $AAPL')
  it('accepts company names in free text (Apple, Tesla) — brand check is site names only')
})

describe('validateDDPost', () => {
  it('accepts post with 1800 words, bear case 450 words, TLDR present')
  it('rejects post with word count < 1500')
  it('rejects post with word count > 2500')
  it('rejects post with bear case < 400 words')
  it('rejects post without TLDR block')
  it('rejects post with charCount > 38000')
  it('does NOT reject post containing company name "Apple" or ticker "$AAPL"')
  it('returns { valid, wordCount, bearWordCount, hasTLDR, charCount }')
})
```

**Edge cases**:
- Empty string → `validateReply` returns `{ valid: false }`
- Text with only whitespace/markdown syntax → word count 0 → invalid
- `validateDDPost` on text exactly 38000 chars → valid (on text 38001 chars → invalid)

---

## Section 3: Daily Cap + Timing + Job Queue

### Mocks required

| Dependency | Mock |
|---|---|
| `getRedditLog(date)` | Returns array of `{ subreddit, status }` records |
| NocoDB `getState` / `setState` | In-memory |
| NocoDB Scheduled_Jobs INSERT | Capture inserted rows in array |
| Reddit vote API | `mockVoteApi()` — records calls, returns 200 |
| Claude API | Not called in Section 3 (job enqueue only) |
| Reddit post API (in processScheduledJobs) | `mockRedditPost()` — returns `{ id: 'abc123' }` |
| Reddit comments fetch | `mockRedditComments()` — returns array of comment objects |
| Current time | Injectable `_now()` function |

### Test cases

```
describe('checkDailyCommentLimit', () => {
  it('returns allowed=true when 0 posts today')
  it('returns allowed=false when global total >= 10')
  it('returns allowed=false when per-sub count >= dailyCap for wallstreetbets (cap=3)')
  it('counts only posted status — not skipped/failed')
  it('includes reason field when not allowed')
})

describe('shouldSkipToday', () => {
  it('returns skip=false on non-skip weekday')
  it('returns skip=true on a designated skip day')
  it('returns skip=false on Saturday (weekend — different path, not skip day)')
  it('auto-generates skip days if week_skip_days missing from NocoDB')
  it('generated skip days are weekdays only (Mon-Fri, JS day 1-5)')
  it('generates 1 or 2 skip days (never 0 or 3+)')
  it('does not regenerate skip days if already set for current week')
  it('idempotent: calling twice Monday produces same skip days')
})

describe('upvoteContext', () => {
  it('calls Reddit vote API exactly 3 times')
  it('upvotes postId, comment1Id, comment2Id')
  it('sends dir=1 (upvote) for all three')
})

describe('deferred posting — insertDeferredReplyJob', () => {
  it('inserts a reddit_reply_deferred row into Scheduled_Jobs')
  it('execute_after is between 10 and 30 minutes from now')
  it('payload includes postId, subreddit, ticker, insiderData, structure')
  it('status is "pending"')
})

describe('scheduleEditUpdate', () => {
  it('inserts a reddit_edit job with execute_after = now + 2 hours')
  it('payload includes commentId, ticker, subreddit, priceAtPost')
})

describe('scheduleThreadReply', () => {
  it('inserts reddit_thread_reply job with execute_after between 1h and 2h')
  it('payload includes commentId, subreddit, threadId')
})

describe('scheduleDDReplies', () => {
  it('inserts exactly 2 jobs: one reddit_dd_reply at ~1h, one at ~6h')
  it('both payloads include postId, subreddit, ticker')
})

describe('processScheduledJobs — reddit_edit', () => {
  it('skips job if comment upvotes <= 3')
  it('appends Edit line with correct percentage change when upvotes > 3')
  it('marks job done after successful edit')
  it('marks job skipped (not crashed) if Reddit returns 404')
})

describe('processScheduledJobs — reddit_reply_deferred', () => {
  it('calls buildCommentPrompt with payload data')
  it('posts reply to Reddit')
  it('logs to Reddit_Log after posting')
  it('enqueues reddit_edit job after posting')
  it('marks job skipped if post was deleted (404)')
})

describe('processScheduledJobs — only processes pending jobs past execute_after', () => {
  it('ignores jobs with execute_after in the future')
  it('ignores jobs with status = done')
  it('processes multiple jobs in a single run')
})

describe('runCAT4Comments', () => {
  it('returns early if shouldSkipToday() is true')
  it('skips subreddit when checkDailyCommentLimit returns allowed=false')
  it('skips post when no insider data found in NocoDB')
  it('inserts deferred reply job for each valid post found')
  it('upvotes context for ~50% of posts (probabilistic — mock random)')
  it('processes all 5 subreddits in SUBREDDIT_TONE_MAP')
})
```

**Edge cases**:
- `processScheduledJobs` with empty queue → no-op, no error
- `runCAT4Comments` with all caps hit → inserts 0 jobs
- `scheduleEditUpdate` with `priceAtPost = null` → still inserts job (processor handles null gracefully)

---

## Section 4: CAT 5 — Daily Thread

### Mocks required

| Dependency | Mock |
|---|---|
| Reddit sticky API (`/about/sticky`) | `mockSticky(num, response)` |
| Reddit hot API | `mockHotPosts(posts)` |
| Reddit search API | `mockSearch(results)` |
| Reddit POST comment | `mockPostComment()` — returns `{ id }` |
| NocoDB filings query | `mockFilingsQuery(rows)` |
| NocoDB `getState` / `setState` | In-memory |
| `_now()` | Injectable, returns fake EST timestamp |

### Test cases

```
describe('shouldPostDailyThread', () => {
  it('returns false on Saturday')
  it('returns false on Sunday')
  it('returns false on a skip day')
  it('returns true on a regular weekday')
  it('sets isWeekendRecap=true on Monday')
})

describe('findDailyDiscussionThread — sticky-first', () => {
  it('returns sticky 1 if title contains "Daily" and created today (EST)')
  it('returns sticky 2 if sticky 1 is not a daily thread')
  it('falls back to hot posts if both stickies fail')
  it('falls back to search as last resort')
  it('returns null if no daily thread found by any method')
  it('uses EST (America/New_York) for today comparison — not UTC')
})

describe('findDailyDiscussionThread — EST boundary', () => {
  it('post created at 23:30 UTC (7:30 PM EST same day) is "today" in EST')
  it('post created at 02:00 UTC next day (10 PM EST) is still "today" in EST')
})

describe('buildDailyThreadComment — template selection', () => {
  it('uses template_index 0 for notable_buys template')
  it('uses template_index 1 for confidence_index template')
  it('uses template_index 2 for unusual_activity template')
  it('rotates index on each call')
  it('returns non-empty string for all 3 templates with mock data')
})

describe('buildDailyThreadComment — weekend recap', () => {
  it('uses confidence_index template on Monday recap')
  it('includes aggregated Fri-Sun period label')
})

describe('buildDailyThreadComment — content', () => {
  it('includes ticker symbol in output')
  it('includes formatted dollar amount')
  it('does not contain URLs')
})

describe('postDailyThread', () => {
  it('returns early when shouldPostDailyThread() is false')
  it('returns early when findDailyDiscussionThread() returns null — logs warning')
  it('posts comment to the correct thread ID')
  it('logs to Reddit_Log after posting')
  it('calls scheduleThreadReply after posting')
  it('increments daily_thread_sub_index in NocoDB')
})
```

**Edge cases**:
- `findDailyDiscussionThread` when all 4 methods return nothing → returns null (not throw)
- `buildDailyThreadComment` with empty filings array → returns graceful "no notable activity" string (not crash)
- DST transition day → EST comparison still works (using DST-aware library)

---

## Section 5: CAT 6 — DD Posts

### Mocks required

| Dependency | Mock |
|---|---|
| NocoDB `Reddit_DD_Posts` query | `mockDDPostsQuery(rows)` |
| NocoDB filings query for ticker selection | `mockFilingsQuery(rows)` |
| Claude API | `mockClaude(responseByStep)` — keyed by call number or prompt keyword |
| Imgur API | `mockImgur(returnUrl)` — returns URL or throws |
| `visual-templates.js` | Import real stubs (all return null) |
| Reddit POST (new post) | `mockRedditNewPost()` — returns `{ id, url }` |
| NocoDB Scheduled_Jobs INSERT | Capture array |
| `_now()` | Injectable |

### Test cases

```
describe('checkDDPostLimit', () => {
  it('returns allowed=true when no recent posts')
  it('returns allowed=false + reason=too_recent when last post < 3 days ago')
  it('returns allowed=false + reason=monthly_limit when 8+ posts this month')
  it('counts only status=posted records')
})

describe('buildDDPost — 4-step pipeline', () => {
  it('makes exactly 4 Claude calls in sequence')
  it('Step 1 output (outline) is passed into Step 2 prompt')
  it('Step 2 output (full draft) is passed into Step 3 for bear case review')
  it('Step 3 replaces Bear Case section in draft when authenticity score < 7')
  it('Step 3 does NOT replace Bear Case when score >= 7')
  it('Step 4 TLDR is prepended to the post (not appended)')
  it('final output includes NEGATIVE_EXAMPLES in Step 2 system prompt')
  it('final output includes anti-pump rule in Step 2 system prompt')
})

describe('buildDDPost — bear case review', () => {
  it('mock Claude returns score=4 → rewrites bear case')
  it('mock Claude returns score=8 → keeps original bear case')
  it('rewritten bear case replaces original in final draft')
})

describe('validateDDPost integration with buildDDPost', () => {
  it('retries Step 2 once if validation fails on first attempt')
  it('includes failure reason in retry prompt (e.g. "Bear case was only 280 words")')
  it('aborts (returns null) if validation still fails after retry')
})

describe('human-likeness check', () => {
  it('aborts if rating < 7 after one rewrite cycle')
  it('applies suggested phrase rewrites when rating < 7')
  it('proceeds to post when rating >= 7')
})

describe('Imgur visual upload', () => {
  it('skips visual if generateInsiderTable returns null (stub behavior)')
  it('calls uploadToImgur when a visual returns base64 data')
  it('inserts Imgur URL as markdown image link in post body')
  it('skips silently if Imgur upload throws (graceful degradation)')
})

describe('target subreddit selection', () => {
  it('always includes stocks')
  it('includes wallstreetbets when score >= 8 and marketCap >= $5B')
  it('excludes wallstreetbets when score < 8')
  it('includes ValueInvesting when >= 3 fundamental metrics cited')
  it('excludes ValueInvesting when < 3 metrics')
})

describe('per-subreddit intro variants', () => {
  it('stocks variant uses main DD body unchanged')
  it('wallstreetbets variant has a 1-2 sentence opener prepended (mock Claude call)')
  it('ValueInvesting variant has analytical opener prepended (mock Claude call)')
  it('all variants have NFA disclaimer appended')
  it('all variants are <= 38000 chars after adding opener + disclaimer')
  it('variant > 38000 chars before disclaimer is truncated then disclaimer appended')
})

describe('postDDPost', () => {
  it('returns early when checkDDPostLimit() not allowed')
  it('returns early when day is not Tue-Thu')
  it('returns early when time is outside 10AM-2PM EST window')
  it('logs to Reddit_DD_Posts with status=posted + price_at_post')
  it('inserts reddit_ama Scheduled_Job 5-10 min out')
  it('inserts 2 reddit_dd_reply jobs (1h and 6h)')
})
```

**Edge cases**:
- `buildDDPost` where all visuals are null → DD posts successfully without images
- Post to 3 subreddits: first succeeds, second fails → continue to third, log first failure
- TLDR generation (Step 4) returns empty string → abort (not post empty TLDR)

---

## Section 6: Anti-AI Detection

### Mocks required

None — `NEGATIVE_EXAMPLES` and `ANTI_PUMP_RULE` are pure constants.

### Test cases

```
describe('NEGATIVE_EXAMPLES', () => {
  it('is a non-empty string')
  it('contains a bad example (passive voice pattern)')
  it('contains a good example (direct, specific)')
  it('does not contain any URLs')
  it('does not contain brand names like EarlyInsider')
})

describe('ANTI_PUMP_RULE', () => {
  it('is a non-empty string')
  it('contains "NEVER" or "never"')
  it('contains "recommend" or "buying"')
})

describe('buildCommentPrompt', () => {
  it('includes NEGATIVE_EXAMPLES in system prompt')
  it('includes ANTI_PUMP_RULE in system prompt')
  it('includes subreddit tone string from SUBREDDIT_TONE_MAP')
  it('includes structure instruction from REPLY_STRUCTURES')
  it('includes post title and body in user prompt')
  it('includes insider data (ticker, name, role, amount, date) in user prompt')
  it('sets model to claude-sonnet-4-6')
  it('sets maxTokens to 300')
  it('sets temperature to 0.7')
  it('makes the actual Claude API call and returns generated text string')
})
```

**Edge cases**:
- Claude API returns empty string → `buildCommentPrompt` throws or returns null (caller handles retry)
- Claude API returns text > 200 words for wallstreetbets (wordLimit 50-100) → `validateReply` catches it

---

## Full Test Suite Summary

| Section | describe blocks | it cases (approx) |
|---|---|---|
| Section 0 | 1 (visual stubs) | 4 |
| Section 1 | 7 | 21 |
| Section 2 | 6 | 22 |
| Section 3 | 10 | 32 |
| Section 4 | 7 | 22 |
| Section 5 | 9 | 32 |
| Section 6 | 3 | 12 |
| **Total** | **43** | **~145** |

Existing tests: 6 describe blocks, 17 it cases (must remain passing).

---

## Test File Layout

```
n8n/tests/
  reddit-monitor.test.js      (extended — all sections, single file)
  visual-templates.test.js    (new — 4 cases only)
  fixtures/
    mock-filings.json         (sample insider filing rows)
    mock-reddit-posts.json    (sample Reddit post objects)
    nocodb-schema.json        (table schema reference — not executable)
```

---

## TDD Implementation Order

Write tests **before** implementing each section. Red → Green → (no refactor needed at this stage).

1. Write all Section 0 tests → implement visual-templates.js → all pass
2. Write all Section 1 tests → implement auth + tone map + helpers → all pass
3. Write all Section 2 tests → implement rotation + validation → all pass
4. Write all Section 3 tests → implement cap + jobs → all pass
5. Write all Section 4 tests → implement CAT 5 → all pass
6. Write all Section 5 tests → implement CAT 6 → all pass
7. Write all Section 6 tests → implement anti-AI detection → all pass
8. Run full suite: all 145 new + 17 existing = ~162 tests green

**Run command**: `node --test n8n/tests/reddit-monitor.test.js`
