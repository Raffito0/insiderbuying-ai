# Integration Notes: External LLM Review Feedback

## Reviewers
- Gemini 3 Pro Preview
- o3

---

## Changes I'm Integrating

### 1. Replace sleep() with Scheduled_Jobs entries (CRITICAL)
**Both reviewers flagged this.** A 10-30 min `sleep()` inside an n8n Code node will hold the worker thread and likely hit the execution timeout (default 5 min). CAT 5's 5-10 min AMA comment sleep also hits this.

**Change**: Add two new job types to Scheduled_Jobs:
- `reddit_reply_deferred` — CAT 4: when a reply opportunity is found, don't post immediately. Insert a deferred job with `execute_after = now + random(10-30 min)`. The payload includes post ID, ticker, subreddit, insider data, selected structure.
- `reddit_ama` — CAT 6: insert AMA comment job with `execute_after = now + random(5-10 min)`.

`processScheduledJobs()` handles both types alongside existing ones.

### 2. Reddit OAuth: Add refresh token flow path (CRITICAL)
**Both reviewers flagged ROPC as fragile on cloud IPs.** Reddit increasingly blocks ROPC from datacenter IPs with 401s.

**Change**: Update `getRedditToken()` to support two modes:
- If `REDDIT_REFRESH_TOKEN` env var is present: use refresh token flow (`grant_type=refresh_token`)
- Fallback: ROPC flow (`grant_type=password`)

This future-proofs the auth layer. The plan documents that users on cloud-hosted n8n should generate a refresh token locally and store it as env var.

### 3. OAuth token: persist to NocoDB, not module scope (HIGH)
**Both reviewers flagged** that module-level token caching doesn't survive between n8n workflow executions.

**Change**: `getRedditToken()` reads `reddit_oauth_token` from NocoDB Reddit_State (key = `reddit_auth`, value = `{ token, expires_at }`). Only calls the Reddit auth endpoint if expired. Writes back on refresh.

### 4. Daily thread search → use /about/sticky (CRITICAL - CAT 5)
**Gemini flagged** that Reddit's `/search` API can lag 2+ hours. Daily threads posted at 7 AM might not appear until 9 AM.

**Change**: `findDailyDiscussionThread()` uses stickied posts first:
1. Try `GET /r/{subreddit}/about/sticky?num=1` — check title contains "Daily" and `created_utc` is today in EST
2. Try `GET /r/{subreddit}/about/sticky?num=2` — same check
3. Fallback: `GET /r/{subreddit}/hot?limit=5` — regex match titles
4. Only fall back to `/search` as last resort

### 5. Brand name validation scoped to CAT 4/5 only — exempt CAT 6 (CRITICAL)
**Gemini caught a clear bug**: the "no brand names" rule blocks CAT 6 DD generation, since a 2000-word DD on $AAPL must mention "Apple." The existing `validateComment()` regex would reject the entire DD post.

**Change**: `validateReply()` is used only for CAT 4/5 output. A new `validateDDPost()` function for CAT 6 does NOT include the brand name check — only word count, bear case length, and TLDR presence.

### 6. Timezone-aware EST date handling (HIGH)
**Both reviewers flagged** that `new Date()` on a UTC n8n server produces wrong "today" calculations for EST. DST makes this worse.

**Change**: All date calculations that need EST context use explicit UTC-to-EST conversion. The plan specifies using `date-fns-tz` or equivalent (already likely available in the n8n Node.js environment) rather than manual offset arithmetic.

Key functions affected: `shouldSkipToday()`, `findDailyDiscussionThread()` (created_utc comparison), CAT 6 posting window check, `processScheduledJobs()`.

### 7. NocoDB indexes on Scheduled_Jobs and Reddit_State (MEDIUM)
**Both reviewers noted** that without indexes, the 15-min `processScheduledJobs()` sweep will do full table scans as the table grows.

**Change**: Section 0 NocoDB setup explicitly calls for indexes on:
- `Scheduled_Jobs`: composite index on `(status, execute_after)`
- `Reddit_DD_Posts`: index on `posted_at`
- `Reddit_State`: unique index on `key`

### 8. Vary DD post intro/tone per subreddit, add NFA disclaimer (MEDIUM)
**Both reviewers flagged** that posting identical 2000-word bodies to 3 subreddits triggers Reddit's spam filter. o3 also noted finance subs require "Not financial advice."

**Change**:
- CAT 6 generates subreddit-specific variants: same core body but different opening paragraph tailored to each subreddit's SUBREDDIT_TONE_MAP style
- NFA disclaimer appended automatically at end of every DD post: "Not financial advice. Do your own research."
- Reddit post length capped at 38,000 chars (under Reddit's 40,000 char hard limit)

### 9. Price-at-post-time captured in Reddit_Log (MEDIUM)
**o3 noted** the Edit job processor needs price-at-post-time to compute the change, but this isn't specified anywhere.

**Change**: When a CAT 4 reply is posted, include `price_at_post` in the `Reddit_Log` record (fetch current price from data already in hand at post time). `processScheduledJobs()` reads this field from the log record.

### 10. CAT 4 entry point function documented explicitly (LOW)
**o3 noted** the plan mentions CAT 4 but has no exported entry point function analogous to `postDailyThread()` and `postDDPost()`.

**Change**: Plan explicitly documents `runCAT4Comments()` as the exported CAT 4 entry point, called by the n8n every-60-min schedule trigger.

---

## Changes I'm NOT Integrating

### Upvoting ToS concerns
Both reviewers raised Reddit ToS concern about upvoting before commenting. However, upvoting is explicitly in the spec (GAP 4.7) and is a deliberate design decision. I'll note a randomization improvement (50% chance to skip upvoting) but keep the feature.

### Rate limiting leaky-bucket wrapper
Good practice recommendation but out of scope for this plan. The comment caps (max 10/day) already make the call volume low enough that a formal rate limiter isn't necessary at this stage. Can be added later.

### NocoDB counter race conditions
For a bot posting max 10 comments/day across multiple workflows, the race window is negligibly small. Adding optimistic locking would complicate the implementation significantly for minimal benefit. Accepted risk.

### Secrets in n8n credential nodes
Good security practice but an n8n configuration concern, not a code concern. Out of scope for reddit-monitor.js.

### MNPI concern
Out of scope — the broader EarlyInsider system handles what data is publicly available.

### Claude token budget for Step 2
o3 noted Claude Sonnet 4.6 context limits. Sonnet 4.6 has a 200k context window — the 3000 token output limit is fine. Accepted as-is.
