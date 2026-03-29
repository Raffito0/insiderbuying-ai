# Code Review: reddit-monitor.js — Sections 01-03

**Reviewer:** Senior Code Reviewer (Claude Sonnet 4.6)
**Date:** 2026-03-29
**Diff:** sections-01-03-diff.md
**Scope:** SUBREDDIT_TONE_MAP, getRedditToken, getRedditLog, REPLY_STRUCTURES, validateReply, validateDDPost, checkDailyCommentLimit, shouldSkipToday, upvoteContext, insertJob, scheduleDDReplies, processScheduledJobs, runCAT4Comments

---

## What Was Done Well

The implementation shows solid architectural thinking. The `_skipCache` test seam is clean and the rationale (skip both read and write to avoid polluting test-captured state) is correct and consistently applied. The dual grant-type path in `getRedditToken` (refresh_token vs password ROPC fallback) is a genuine improvement that makes the auth flow resilient to credential type changes. `validateReply` with proportional tolerance bands (0.9x min, 1.1x max) is a practical approach for LLM output that can be slightly over/under the target. The `processScheduledJobs` executor-with-status-update pattern is clean and the per-type dispatch is easy to extend. Test coverage is broad across the happy path and covers the key shape contracts.

---

## Critical Issues

### 1. `insertJob` silently produces a broken URL when `NOCODB_API_URL` is unset

**Location:** `reddit-monitor.js:1071-1074`

```js
var base = process.env.NOCODB_API_URL;        // undefined if not set
var url = base + '/api/v1/db/data/noco/reddit/Scheduled_Jobs';
// url = "undefined/api/v1/db/data/noco/reddit/Scheduled_Jobs"
```

The `catch (_) {}` swallows the resulting network error silently. Every call to `scheduleThreadReply`, `scheduleDDReplies`, `scheduleEditUpdate`, and `runCAT4Comments` depends on `insertJob`. If `NOCODB_API_URL` is not set in the n8n environment, all job scheduling fails with no log output, no error surfaced, and no indication to the operator.

The same pattern appears in `processScheduledJobs` at line 1387 and `getRedditLog` at line 175 (though `getRedditLog` at least has `|| NOCODB_BASE_URL` as fallback). `insertJob` and `processScheduledJobs` do not have that fallback.

**Fix required:** Add `|| NOCODB_BASE_URL` as a fallback, and add at minimum a `console.warn` before swallowing the error in the catch block so failures are visible in n8n execution logs.

### 2. `getRedditLog` calls `res.json()` without first checking `res.status`

**Location:** `reddit-monitor.js:179-181`

```js
var res = await _deps.fetch(url, { headers: { 'xc-token': tok } });
var data = res.json();     // called unconditionally
return data.list || [];
```

If NocoDB returns a non-200 (e.g., auth failure, rate limit, table not found), `res.json()` still runs and the response body may be an error object without a `list` property. The function returns `[]` rather than propagating the error, but more importantly there is no log of the failure. Since `checkDailyCommentLimit` calls `getRedditLog` to decide whether posting is allowed, a NocoDB outage would silently allow unlimited posting (returns empty list, all limits appear unmet).

**Fix required:** Add `if (res.status !== 200)` guard before calling `res.json()`, log the status, and return `[]` explicitly after the guard.

---

## Important Issues

### 3. `Insider_filings` table name casing inconsistency

**Location:** `reddit-monitor.js:1444`

The URL in `_fetchInsiderData` uses `Insider_filings` (lowercase f):
```
/Insider_filings?where=(ticker,eq,...
```

All other references in the file use `Insider_Filings` (capital F, lines 308, 1010). NocoDB table names are case-sensitive in the URL path. If the production table is named `Insider_Filings`, `_fetchInsiderData` will return 404 responses for every ticker lookup in `runCAT4Comments`, silently producing no job insertions.

**Fix required:** Standardize to `Insider_Filings` to match all other usages.

### 4. `upvoteContext` has no error handling and will propagate exceptions into `runCAT4Comments`

**Location:** `reddit-monitor.js:1289-1305`

```js
async function upvoteContext(postId, comment1Id, comment2Id) {
  var token = await getRedditToken();
  var vote = async function(id) {
    await _deps.fetch('https://oauth.reddit.com/api/vote', { ... });
  };
  await vote(postId);
  await vote(comment1Id);
  await vote(comment2Id);
}
```

There is no try/catch. If `getRedditToken` returns an empty string (auth failure) or the vote API returns a non-200, the unhandled rejection propagates up through `runCAT4Comments` where it is caught by the outer `catch (err)` — but that stops the entire subreddit loop. A single vote API failure will cause all subsequent subreddits to be skipped for that run.

Additionally, `upvoteContext` is called inside `runCAT4Comments` before `insertJob` — so a vote failure prevents the comment from being scheduled at all, rather than simply skipping the upvote.

**Fix required:** Wrap the vote calls in a try/catch. Vote failures should be logged and ignored, not allowed to interrupt the scheduling loop. Also consider moving `upvoteContext` to after `insertJob` so scheduling is not blocked by vote errors.

### 5. `checkDailyCommentLimit` double-filters on `status === 'posted'`

**Location:** `reddit-monitor.js:1278-1286`

`getRedditLog` already filters by `status=posted` in its NocoDB WHERE clause (line 177). Then `checkDailyCommentLimit` applies `.filter(function(l) { return l.status === 'posted'; })` again on the returned list. This is redundant but harmless. However, it creates a maintenance trap: if the NocoDB query filter is changed (e.g., to fetch all statuses for other purposes), the in-memory filter becomes the only safety net, without any indication this is intentional.

**Suggestion:** Either remove the in-memory filter (trust the query) or add a comment noting that it is a defensive double-check.

### 6. `_processRedditReplyDeferred` does not check the Reddit API response status after posting

**Location:** `reddit-monitor.js:1323-1330`

```js
var postRes = await _deps.fetch('https://oauth.reddit.com/api/comment', { ... });
var postData = postRes.json();
// ...
await _logToRedditLog('', payload.subreddit, comment, 'posted');
```

The comment is logged as `'posted'` regardless of whether the Reddit API call succeeded. If the API returns 429 (rate limit), 403 (banned), or any other error, the log will incorrectly record a successful post, corrupting the `checkDailyCommentLimit` count for the day.

**Fix required:** Check `postRes.status === 200` before calling `_logToRedditLog`. If the post fails, log as `'failed'` or skip logging.

### 7. `shouldSkipToday` uses `_now()` for day-of-week but the day-of-week is UTC, not EST

**Location:** `reddit-monitor.js:249-251`

```js
var now = _now();
var dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
```

`now.getDay()` returns the day of week in the local timezone of the Node.js process, which on the n8n VPS is UTC. Around midnight UTC (8PM EST), `getDay()` will return the next calendar day while EST is still on the previous day. This means the skip-day check operates on a UTC date while all other time-of-day logic in the file uses EST. A skip day set for "Monday" (day 1 in UTC) will fire at 8PM Sunday EST.

The fix used in `shouldPostDailyThread` — deriving day-of-week from `getESTDateString` — should be applied consistently here.

**Fix required:** Replace `now.getDay()` with the same EST-derived day-of-week calculation used in `shouldPostDailyThread` (lines 469-472).

---

## Suggestions

### 8. `SUBREDDIT_TONE_MAP` is not in sync with `SUBREDDITS` and `CAT5_SUBREDDITS`

The `SUBREDDITS` array (line 12) lists `wallstreetbets, stocks, investing, SecurityAnalysis, stockmarket`. The new `SUBREDDIT_TONE_MAP` covers `wallstreetbets, ValueInvesting, stocks, Dividends, InsiderTrades`. There is no overlap for `investing`, `SecurityAnalysis`, or `stockmarket`. The old `SUBREDDIT_TONE_MAP` included `investing` and `SecurityAnalysis`.

`runCAT4Comments` iterates over `Object.keys(SUBREDDIT_TONE_MAP)`, so `investing`, `SecurityAnalysis`, and `stockmarket` will never receive CAT4 comments. This may be intentional (new narrower targeting), but there is no comment explaining the omission. If unintentional, the missing subreddits represent dead coverage.

**Suggestion:** Add a comment above `SUBREDDIT_TONE_MAP` confirming this is the complete active CAT4 target list and that the `SUBREDDITS` constant is used only for search/scan purposes.

### 9. `validateReply` brand name list is narrower than `validateComment`

`validateReply` checks `['EarlyInsider', 'earlyinsider.com']`. The older `validateComment` function checks `['InsiderBuying', 'EarlyInsider', 'earlyinsider.com', 'insiderbuying.ai']`. The new function misses `InsiderBuying` and `insiderbuying.ai`. If Claude generates text containing either of those strings, `validateReply` will pass it while `validateComment` would not.

**Suggestion:** Consolidate the brand name list into a single shared constant and reference it from both validation functions.

### 10. `processScheduledJobs` has no test that verifies the status PATCH actually fires

The existing tests for `processScheduledJobs` use `expect(true).toBe(true)` as their assertion (lines 1221-1253), which means they verify the function does not throw but do not assert on any behavior. In particular, there is no test verifying that after a job executes, a PATCH to `Scheduled_Jobs/{Id}` is issued with `status: 'done'`. If the PATCH logic were accidentally removed, all current tests would still pass.

**Suggestion:** Add one test that captures PATCH calls and asserts `{ status: 'done' }` is sent for a successfully processed job.

### 11. `getNextReplyStructure` hardcodes `% 3` instead of `% REPLY_STRUCTURES.length`

**Location:** `reddit-monitor.js:769-770`

```js
var structure = REPLY_STRUCTURES[index % 3];
await setState(key, (index + 1) % 3);
```

If `REPLY_STRUCTURES` is ever extended to 4 structures, this will silently skip the 4th entry. The constant `3` should be `REPLY_STRUCTURES.length`.

### 12. `_processRedditEdit` appends a static edit message instead of a data-driven one

**Location:** `reddit-monitor.js:467`

```js
var editText = (commentData && commentData.body ? commentData.body : '')
  + '\n\n---\n*Edit: price has moved since this was posted.*';
```

The `payload` includes `priceAtPost` and `ticker`, but these are not used in the edit text. The edit always reads "price has moved" with no actual price data. Since the purpose of the edit is to provide a concrete price update, this is a missed opportunity and will read as low-quality to readers who check the edit.

**Suggestion:** Include `payload.ticker` and actual current price (fetched from Finnhub or the NocoDB filings table) in the edit text.

---

## Test Coverage Gaps

1. **No test for `insertJob` when `NOCODB_API_URL` is undefined.** The critical null-URL bug (Issue 1) is not exercised by any test.

2. **No test for `getRedditLog` when NocoDB returns non-200.** There is no test verifying that a 500/403 response returns `[]` without throwing.

3. **No test for `_processRedditReplyDeferred` when Reddit returns non-200.** The logging-as-posted-on-failure bug (Issue 6) has no test coverage.

4. **`processScheduledJobs` tests assert only that the function does not throw,** not that status PATCHes are issued. See Suggestion 10.

5. **No test for `upvoteContext` when the vote API returns non-200 or when `getRedditToken` returns empty string.** The error propagation bug (Issue 4) is not covered.

6. **`shouldSkipToday` tests use `new Date()` directly** rather than `_setNow()` to control the date, making them timezone-dependent. A test running at 11PM UTC on a weekday will behave differently from one running at 9AM UTC. The UTC vs EST bug (Issue 7) is not caught because the tests do not control the clock.

---

## n8n Compatibility

No issues found. The file correctly avoids top-level await, uses `require()` for built-ins, polyfills `fetch`, `URL`, and avoids ES module syntax. The `module.exports` block at the end is complete and all new functions are exported.

---

## Summary Table

| # | Severity | Issue |
|---|----------|-------|
| 1 | Critical | `insertJob`/`processScheduledJobs` silently break when `NOCODB_API_URL` is unset |
| 2 | Critical | `getRedditLog` calls `res.json()` without status check; outage allows unlimited posting |
| 3 | Important | `Insider_filings` casing mismatch — all `_fetchInsiderData` lookups will 404 in production |
| 4 | Important | `upvoteContext` has no error handling; vote failure aborts the subreddit loop |
| 5 | Important | `_processRedditReplyDeferred` logs `'posted'` even on Reddit API failure |
| 6 | Important | `shouldSkipToday` uses UTC `getDay()`, not EST — skip days fire 8h early |
| 7 | Suggestion | `SUBREDDITS`/`SUBREDDIT_TONE_MAP` mismatch needs a clarifying comment |
| 8 | Suggestion | `validateReply` brand name list is narrower than `validateComment` |
| 9 | Suggestion | `processScheduledJobs` tests assert only no-crash, not correct PATCH behavior |
| 10 | Suggestion | `getNextReplyStructure` hardcodes `% 3` instead of `% REPLY_STRUCTURES.length` |
| 11 | Suggestion | Edit text in `_processRedditEdit` is static, ignores `priceAtPost`/`ticker` payload |
