# Implementation Plan: 13-reddit-engine

## Overview

`reddit-monitor.js` currently exists as a collection of non-functional stubs — it builds prompts and creates record objects, but makes no actual API calls to Reddit, NocoDB, or Claude. This plan transforms it into a fully operational Reddit automation engine with three distinct content categories (CAT 4, 5, and 6), running under n8n as a set of exported functions called by schedule-triggered Code nodes.

The work is organized into 7 sections plus a prerequisite infrastructure step:

- **Section 0**: Create 3 NocoDB tables (with indexes) and the `visual-templates.js` stub file
- **Section 1**: Reddit OAuth authentication (refresh token + ROPC fallback, token persisted to NocoDB), `SUBREDDIT_TONE_MAP`, and NocoDB state helpers
- **Section 2**: Reply structure rotation + word-count validation fix (markdown-stripped)
- **Section 3**: Daily cap enforcement, deferred posting via Scheduled_Jobs (no sleep()), upvoting, and full job queue with `runCAT4Comments()` entry point
- **Section 4**: CAT 5 — pre-market daily thread comments (sticky-first thread detection, EST-aware dates)
- **Section 5**: CAT 6 — long-form DD posts with 4-step Claude pipeline, per-subreddit variants, NFA disclaimer, char limit
- **Section 6**: Anti-AI detection: negative few-shot examples and authenticity review (brand-name rule scoped to CAT 4/5 only)

Everything is CommonJS. All Reddit content generation uses Claude Sonnet 4.6. No URLs or brand names appear in CAT 4/5 output; CAT 6 DD posts use ticker symbols and company names freely. All date operations use timezone-aware EST conversion.

---

## Background: Current State

The file lives at `n8n/code/insiderbuying/reddit-monitor.js`. It currently:
- Defines 5 hardcoded subreddits and 11 search keywords
- Has a `draftComment()` that builds a prompt string but never calls Claude
- Has a `validateComment()` that checks sentence count (not word count) and rejects URLs/brand names
- Has a `logComment()` that builds a record object but never writes to NocoDB

Reddit OAuth, daily caps, per-subreddit tone matching, structure rotation, timing delays, upvoting, the daily thread feature (CAT 5), and the DD post feature (CAT 6) do not exist anywhere in the codebase.

---

## Section 0: Prerequisites — NocoDB Tables + visual-templates.js Stub

### Why this comes first

Every subsequent section depends on NocoDB state persistence. Without the tables, nothing can run. This section has no code logic — it is purely infrastructure setup.

### Three new NocoDB tables

**Reddit_State** — a generic key/value store for all per-subreddit counters and weekly state. Using a flexible key/value schema (instead of dedicated columns) means new state keys can be added without schema migrations.

Fields: `key` (unique text, **unique index**), `value` (longtext, JSON-serialized), `updated_at` (datetime).

Keys used at runtime:
- `{subreddit}_structure_index` — integer 0-2, reply structure rotation counter per subreddit
- `week_skip_days` — JSON: `{ week: "2026-W13", days: [1, 3] }` where days are ISO weekday numbers (1=Mon, 7=Sun)
- `daily_thread_sub_index` — integer 0-2, which of the 3 CAT 5 target subreddits to use today
- `daily_thread_template_index` — integer 0-2, which of the 3 CAT 5 templates to use today
- `reddit_auth` — JSON: `{ token: "...", expires_at: "<ISO timestamp>" }` — OAuth token cache

**Scheduled_Jobs** — unified queue for all delayed actions: deferred CAT 4 replies (10-30 min), edit updates (2h), reply-to-thread-replies (1-2h), AMA comments (5-10 min after DD), and DD follow-up replies (1h and 6h).

Fields: `type` (text), `payload` (json), `execute_after` (datetime), `status` (text: pending/done/skipped), `created_at` (datetime). **Composite index on `(status, execute_after)`** — required for efficient 15-min sweep queries.

Job types: `reddit_reply_deferred`, `reddit_edit`, `reddit_thread_reply`, `reddit_ama`, `reddit_dd_reply`.

**Reddit_DD_Posts** — tracks posted DD posts for frequency limiting (max 1 per 3 days, max 8/month).

Fields: `ticker` (text), `post_url` (text), `subreddit` (text), `authenticity_score` (decimal), `posted_at` (datetime), `status` (text: draft/posted).

### visual-templates.js stub

A new file at `n8n/code/insiderbuying/visual-templates.js` with three exported functions that currently return `null`:

```javascript
// visual-templates.js
module.exports = {
  generateInsiderTable: (filings) => null,
  generatePriceChart: (ticker, priceData) => null,
  generatePeerRadar: (ticker, peers) => null,
};
```

The CAT 6 Imgur upload logic skips any visual that returns `null`, so DD posts will work without images until these stubs are implemented.

---

## Section 1: SUBREDDIT_TONE_MAP + Reddit Auth + State Helpers

### Purpose

This section establishes the three foundational pieces that all subsequent sections depend on: the per-subreddit configuration table, the Reddit API authentication layer, and the NocoDB state read/write helpers.

### SUBREDDIT_TONE_MAP

Replace the current hardcoded `SUBREDDITS` array with a map that also carries tone, word limits, style instructions, an example, and a daily comment cap per subreddit.

The five configured subreddits and their daily caps (all summing to 10, the global daily maximum):
- `wallstreetbets`: tone=casual_degen, wordLimit 50-100, dailyCap=3
- `ValueInvesting`: tone=academic_analytical, wordLimit 150-200, dailyCap=2
- `stocks`: tone=balanced_informed, wordLimit 100-150, dailyCap=2
- `Dividends`: tone=conservative_yield, wordLimit 100-150, dailyCap=1
- `InsiderTrades`: tone=technical_filing, wordLimit 100-200, dailyCap=2

Each entry includes a `style` string (passed directly into the Claude system prompt) and an `example` string (used as a positive few-shot example alongside the negative few-shot in Section 6).

### Reddit OAuth — getRedditToken()

Reddit requires OAuth for all write operations. The function supports two auth modes:

**Primary (if `REDDIT_REFRESH_TOKEN` env var is set)**: Refresh token flow. Posts `grant_type=refresh_token` to `https://www.reddit.com/api/v1/access_token` with Basic auth. This is the recommended mode for cloud-hosted n8n, where Reddit's ROPC flow may be blocked by IP reputation filters.

**Fallback (if no refresh token)**: ROPC flow — `grant_type=password` with `REDDIT_USERNAME` and `REDDIT_PASSWORD`. Works reliably on residential/local IPs.

**Token persistence**: Tokens are NOT cached at module scope (module-level variables reset between n8n executions). Instead, the token and its expiry are persisted to NocoDB Reddit_State under the key `reddit_auth`. On each call, `getRedditToken()` reads the stored value first and only calls Reddit's auth endpoint if the stored token is missing or expired.

Required env vars: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`. Plus either `REDDIT_REFRESH_TOKEN` (preferred) or `REDDIT_USERNAME` + `REDDIT_PASSWORD`.

### NocoDB State Helpers — getState() / setState()

Two thin wrappers around NocoDB's REST API for the `Reddit_State` table. `getState(key)` queries by key and JSON-parses the value. `setState(key, value)` upserts (creates if missing, updates if present). Both use `NOCODB_API_URL` and `NOCODB_API_TOKEN` env vars.

### getRedditLog(date)

Queries `Reddit_Log` for all records where `posted_at` is on the given date and `status = 'posted'`. Returns an array of records. Used by the daily cap check in Section 3.

---

## Section 2: Reply Structure Rotation + validateReply Fix

### Purpose

Two independent fixes: (1) rotate reply formats to avoid repetitive patterns that signal bot behavior, and (2) fix the validation logic to check word count (what the spec requires) instead of sentence count (what the current code does).

### REPLY_STRUCTURES and getNextReplyStructure(subreddit)

Three structures are defined as constants:
- `Q_A_DATA`: open with observation/question → answer with data → forward-looking angle
- `AGREEMENT_BUT`: agree with OP → "but worth noting..." → insider data point
- `DATA_INTERPRET`: lead with data → interpret → engagement question or prediction

Each structure maps to a system prompt instruction paragraph that is prepended to the Claude prompt alongside the subreddit tone config. The instruction tells Claude which narrative arc to follow without dictating exact wording.

`getNextReplyStructure(subreddit)` reads `{subreddit}_structure_index` from NocoDB, returns `REPLY_STRUCTURES[index % 3]`, increments the counter, and saves it back. The rotation is per-subreddit so that e.g. wallstreetbets and stocks don't rotate in lockstep.

### validateReply(text, subreddit)

Replaces the current sentence-count check with word-count validation. Uses the `wordLimit` from `SUBREDDIT_TONE_MAP[subreddit]`. Before counting, strips markdown syntax (bold/italic markers, link syntax like `[text](url)`, header characters) to avoid counting formatting tokens as words. A ±10% tolerance is applied to the min/max bounds to avoid excessive retry loops from borderline counts. Returns `{ valid, words, min, max }`.

Preserves the existing URL and brand name rejection logic (regex for URLs, explicit brand name check). **This function is used for CAT 4/5 output only.** CAT 6 DD posts have a separate `validateDDPost()` that does NOT apply brand name checking, since DD posts must reference company names and tickers freely.

---

## Section 3: Daily Cap + Timing + Engagement

### Purpose

This section wires up the behavioral controls that make the Reddit presence look human: it won't post more than a set number of times per day, it waits before posting, it upvotes the thread before replying, and it queues follow-up actions for later execution.

### checkDailyCommentLimit(subreddit)

Calls `getRedditLog(today)`, counts total posted comments (global cap: 10) and per-subreddit comments (cap from `SUBREDDIT_TONE_MAP[subreddit].dailyCap`). Returns `{ allowed, reason }`. When `allowed` is false, the caller skips the current subreddit but continues to others.

### shouldSkipToday()

Reads `week_skip_days` from NocoDB. The stored value is `{ week: "<ISO week string>", days: [<weekday number>, ...] }` where weekday numbers follow JS `Date.getDay()` (0=Sun, 1=Mon, ..., 6=Sat).

If the stored week doesn't match the current ISO week, the function generates 1-2 random weekdays for this week (Mon-Fri only, i.e. values 1-5), stores them, and then checks. This is the auto-generation on Monday behavior — the first time any CAT 4/5/6 function runs each week, skip days get set.

Returns `{ skip: true/false }`.

### upvoteContext(postId, comment1Id, comment2Id)

Calls Reddit API (`POST /api/vote`) three times: upvotes the original post and two randomly selected top comments in the thread. Called immediately before posting the reply in the main CAT 4 flow. The two comment IDs are selected from the top 10 comments in the thread (fetched before calling this function).

### Deferred posting for CAT 4 (replaces sleep())

When a viable CAT 4 reply opportunity is found (post passes filters + cap check), the function does NOT post immediately. Instead it inserts a `reddit_reply_deferred` job into `Scheduled_Jobs` with `execute_after = now + randomBetween(10, 30) minutes`. The job payload includes: post ID, subreddit, ticker, insider data snapshot, and the selected reply structure. `processScheduledJobs()` handles the actual Claude call + Reddit post when the job fires.

This avoids blocking the n8n worker thread for 10-30 minutes (n8n execution timeout is typically 5 minutes).

### scheduleEditUpdate(commentId, ticker, subreddit, priceAtPost)

Inserts a `reddit_edit` job into `Scheduled_Jobs` with `execute_after = now + 2 hours`. The payload contains the comment ID, ticker, subreddit, and `priceAtPost` (the ticker's price at post time, captured from the data already in scope during posting). The processor uses `priceAtPost` to compute the percentage change — no separate historical API call needed.

### scheduleThreadReply(commentId, subreddit, threadId)

Inserts a `reddit_thread_reply` job with `execute_after = now + randomBetween(3600000, 7200000)` (1-2h). Used by CAT 5 after posting the daily thread comment.

### scheduleDDReplies(postId, subreddit, ticker)

Inserts two jobs: one `reddit_dd_reply` at 1h, another at 6h. Used by CAT 6 after posting the DD.

### processScheduledJobs()

Exported function, called by a dedicated n8n schedule node (e.g. every 15 minutes). Queries `Scheduled_Jobs` where `status = 'pending'` and `execute_after <= now`. Processes each job by type:

- **reddit_reply_deferred**: execute the deferred CAT 4 reply. Retrieve payload (post ID, subreddit, ticker, insider data, structure), run `buildCommentPrompt()` → Claude call → `validateReply()` → post to Reddit → log to `Reddit_Log`. Then enqueue `reddit_edit` for 2h out. If the post has since been deleted (Reddit 403/404), mark job `skipped`.
- **reddit_edit**: fetch the comment's current upvote count via Reddit API. If upvotes > 3: use `priceAtPost` from the job payload and current price (fetched from any free market API) to compute percentage change; append `\n\nEdit: $TICKER has moved +X.X% since this was posted.` by calling Reddit's edit endpoint. Mark job done.
- **reddit_thread_reply**: fetch replies to the daily thread comment; select 1-2 questions or substantive replies; generate response using Claude with subreddit tone config; post replies. Mark job done.
- **reddit_ama**: post the CAT 6 AMA comment ("Happy to answer questions on the bear case or valuation assumptions — AMA.") to the Reddit DD post. Mark job done.
- **reddit_dd_reply**: fetch the top new comments on the DD post; select 2-3 substantive ones (ignore low-effort replies); generate targeted responses with Claude; post. Mark job done.

If any job fails (API error, missing token, deleted post), mark it `skipped` with error context — do not crash the processor. Continue to next job.

### runCAT4Comments() — exported CAT 4 entry point

Called by the n8n every-60-min schedule trigger. Flow:
1. `shouldSkipToday()` → return if skip
2. For each subreddit in `SUBREDDIT_TONE_MAP`:
   - `checkDailyCommentLimit(subreddit)` → skip if not allowed
   - Fetch recent posts via Reddit search API (keywords + subreddit filter, score >= 7, < 50 comments)
   - For each post: extract ticker, fetch insider data from NocoDB, skip if no data
   - `getNextReplyStructure(subreddit)` → get structure
   - Optionally upvote context (50% probability to avoid detectable pattern)
   - Insert `reddit_reply_deferred` job into `Scheduled_Jobs`
3. Log queued count, return

---

## Section 4: CAT 5 — Reddit Daily Thread

### Purpose

Post a comment in the daily discussion thread of one target subreddit each weekday morning (7:00-8:30 AM EST), using one of three templates on a rotating basis. On Monday mornings, also post a weekend recap. This is the low-effort, high-frequency community presence play — template-driven, no AI generation needed for the comment body itself.

### Target subreddit rotation

Three target subreddits: `stocks`, `investing`, `ValueInvesting`. Rotate daily using `daily_thread_sub_index` from NocoDB. Monday = index 0, Tuesday = index 1, etc. — the index increments on each run regardless of whether the daily thread was found or not, so the rotation stays consistent with the calendar.

### shouldPostDailyThread()

Combines two checks: `shouldSkipToday()` (returns false if it's a skip day) and a day-of-week check (returns false on Saturday and Sunday). On Mondays, sets an internal flag `isWeekendRecap = true` that causes the comment builder to use the `confidence_index` template with aggregated Fri-Sun data.

### findDailyDiscussionThread(subreddit)

Reddit's `/search` endpoint can lag 2+ hours after a post is created; daily threads are almost always stickied. The function uses a layered approach to find the thread:

1. `GET /r/{subreddit}/about/sticky?num=1` — if title contains "Daily" and the post was created today (EST), return it
2. `GET /r/{subreddit}/about/sticky?num=2` — same check for the second sticky
3. `GET /r/{subreddit}/hot?limit=5` — title regex: `/daily\s*(discussion|thread)/i` + created today
4. Last resort: `GET /r/{subreddit}/search?q=Daily+Discussion&sort=new&restrict_sr=1&limit=10`

All `created_utc` (Unix seconds) comparisons convert to `America/New_York` timezone (DST-aware) before comparing to "today's" date. If no thread found by any method: return `null`. Caller logs "no daily thread found for {subreddit}" and moves on — does not create a new post.

### buildDailyThreadComment(data)

Three templates (no AI generation — pure JavaScript template strings):
- `notable_buys`: lists yesterday's notable buys with formatted values, inferred pattern, calls-to-action
- `confidence_index`: shows a confidence sentiment metric, stats summary, top filing of the week
- `unusual_activity`: highlights unusual Form 4 patterns, sector context

Template selection uses `daily_thread_template_index` from NocoDB, rotating 0→1→2→0. The template index increments on each successful post.

For weekend recap (Monday), the same `confidence_index` template is used with `data.period = 'Fri-Sun'` and aggregated data from Friday through Sunday's filings.

### Data fetching for CAT 5

Uses the same NocoDB filings table already used by CAT 4. For the regular weekday comment: query filings from yesterday (or the closest prior trading day). For the weekend recap: query from Friday to Sunday. Select the top 3-5 by significance score.

### postDailyThread() — exported CAT 5 entry point

1. `shouldPostDailyThread()` → return early if false
2. `getDailyThreadTarget()` → get today's subreddit + increment rotation
3. `findDailyDiscussionThread(subreddit)` → return early if null
4. Fetch insider filings data from NocoDB
5. Select template, `buildDailyThreadComment(data)`
6. Post comment to the daily thread via Reddit API
7. Log to `Reddit_Log`
8. `scheduleThreadReply(commentId, subreddit, threadId)` — queue reply-to-replies job

The time window (7:00-8:30 AM EST with ±30 min jitter) is enforced by the n8n schedule trigger configuration, not by logic inside this function.

---

## Section 5: CAT 6 — Reddit DD Posts

### Purpose

Produce high-quality, human-sounding due-diligence posts about stocks with strong insider buying signals. These are long-form (1500-2500 word) posts structured like a passionate retail investor's research write-up. The pipeline uses 4 sequential Claude calls to generate, review the bear case, check human-likeness, and produce a TLDR. Imgur hosts the visuals (or skips them if the visual stub returns null).

### checkDDPostLimit()

Queries `Reddit_DD_Posts` for posted records:
- Any post with `posted_at > now - 3 days` → `{ allowed: false, reason: 'too_recent' }`
- Count of posts this calendar month >= 8 → `{ allowed: false, reason: 'monthly_limit' }`
- Otherwise → `{ allowed: true }`

### Ticker selection

Queries the existing NocoDB filings/alerts table for clusters with score >= 8 that haven't been covered in a DD post recently (cross-reference with `Reddit_DD_Posts.ticker`). Selects the highest-scoring one.

### buildDDPost(ticker, data) — 4-step Claude pipeline

Each step is a sequential Claude call (no parallelism — each depends on the previous output):

**Step 1 — Outline** (200 tokens): generates section headers and 2-3 bullet points per section. The prompt names all required sections: Discovery, Company Brief, Insider Activity Table, Fundamentals, Bull Case (5 catalysts), Bear Case (3 genuine risks), Valuation, What I'm Watching, Positions, TLDR.

**Step 2 — Full draft** (3000 tokens): receives the outline and all data. The system prompt includes `NEGATIVE_EXAMPLES` (Section 6) and the anti-pump rule. Key tone direction: "You are a passionate retail investor who discovered this while screening Form 4s. Write 'I was screening Form 4s last week when I noticed...' — make it a story." The Bear Case must be genuinely skeptical and >= 400 words.

**Step 3 — Bear case review** (separate Claude call): extracts the Bear Case section from the Step 2 output, sends it to Claude with a focused prompt: "Rate this bear case authenticity 1-10. If < 7, provide a rewritten version with real risks, not token acknowledgment." If score < 7, the rewritten version replaces the Bear Case in the draft.

**Step 4 — TLDR** (Claude call): receives the complete draft, generates a 3-4 bullet TLDR where each bullet is specific (ticker, dollar amounts, dates). TLDR is prepended to the post after the title.

### Quality gate — validateDDPost(text)

Checks: total word count 1500-2500, Bear Case section word count >= 400, TLDR block present, and character count <= 38,000 (Reddit's hard limit is 40,000 chars — the 2,000-char margin accounts for markdown formatting overhead). Returns `{ valid, wordCount, bearWordCount, hasTLDR, charCount }`. If validation fails after initial generation, retry Step 2 once with the failure reason in the prompt (e.g. "Bear case was only 280 words — expand with genuine risks."). If still failing after retry, abort and log.

Note: `validateDDPost()` does NOT check for URLs or brand names. That check is only in `validateReply()` for CAT 4/5.

### Human-likeness check

After quality gate passes, send the full draft to Claude: "Rate this post's human-likeness 1-10. If < 7, identify 3 specific phrases that sound AI-generated and provide rewritten versions." Parse the rating and apply the suggested rewrites if rating < 7. Only proceed to post if the rating (or post-rewrite rating) is >= 7. If after one rewrite cycle it's still < 7, abort.

### Imgur visual upload

Call `visual-templates.js` for three visuals: `generateInsiderTable(filings)`, `generatePriceChart(ticker, priceData)`, `generatePeerRadar(ticker, peers)`. Each returns base64 PNG or `null` (stub). For any non-null result, call `uploadToImgur(base64)` which POSTs to `https://api.imgur.com/3/image` with `Authorization: Client-ID {IMGUR_CLIENT_ID}` and returns `data.link`. Insert each returned URL as a markdown image link at the appropriate point in the post body. Skip any visual where the stub or upload returns null.

### Target subreddit selection

- If score >= 8 AND the ticker is a mid/large cap (marketCap field in data >= $5B): include `wallstreetbets` in the target list
- If the DD has >= 3 fundamental metrics cited (PE ratio, margins, revenue growth): include `ValueInvesting`
- Always include `stocks`

Post to each target subreddit as **separate Reddit posts with subreddit-specific intro variants**:
- `stocks` post: use the full DD body as-is
- `wallstreetbets` post (if applicable): prepend a 1-2 sentence WSB-toned opener (casual, degen energy, emoji OK). Generate via a brief Claude call (~50-100 tokens): `"Write a 1-2 sentence WSB-style intro for a DD post on $TICKER. Casual degen energy, brief, no hype."` Then append the main DD body.
- `ValueInvesting` post (if applicable): prepend a 1-2 sentence analytical opener (measured, fundamental focus). Generate via a brief Claude call (~50-100 tokens): `"Write a 1-2 sentence ValueInvesting-style intro for a DD post on $TICKER. Analytical, measured, cite one key ratio."` Then append the main DD body.
- Append NFA disclaimer to ALL variants: `"\n\nNot financial advice. Do your own research."`
- Cap all variants at 38,000 chars (under Reddit's 40,000 char hard limit)

### Post + AMA + follow-up scheduling

1. Post to Reddit (each target subreddit with its variant)
2. Log to `Reddit_DD_Posts` with `status: 'posted'`, including `price_at_post` for each
3. Insert `reddit_ama` job into `Scheduled_Jobs` with `execute_after = now + randomBetween(300000, 600000)` (5-10 min). Payload: `{ postId, subreddit, ticker }`. AMA comment text: `"Happy to answer questions on the bear case or valuation assumptions — AMA."`
4. `scheduleDDReplies(postId, subreddit, ticker)` inserts two `reddit_dd_reply` jobs: one at 1h, one at 6h
5. `processScheduledJobs()` handles `reddit_ama` and `reddit_dd_reply` types alongside other job types

### postDDPost() — exported CAT 6 entry point

1. `checkDDPostLimit()` → return early if not allowed
2. Day/time check: Tue-Thu only; current time within 10AM-2PM EST window
3. Select ticker from NocoDB
4. `buildDDPost(ticker, data)` — 4 Claude calls
5. Quality gate → retry or abort
6. Human-likeness check → abort if < 7 after rewrite
7. `uploadDDVisuals()` → insert image links
8. Determine target subreddits, generate per-sub intro variants, post each (cap at 38k chars, append NFA)
9. Log to Reddit_DD_Posts, insert `reddit_ama` + `reddit_dd_reply` Scheduled_Jobs

The n8n schedule trigger fires weekly on Wednesday at 9 AM EST with ±45 min jitter controlled by the trigger config.

---

## Section 6: Anti-AI Detection + Negative Few-Shot

### Purpose

Ensure all Claude-generated Reddit content sounds like a real retail investor, not an AI analyst. Two mechanisms: (1) `NEGATIVE_EXAMPLES` constant injected into every Claude system prompt, (2) a dedicated human-likeness review call for DD posts.

### NEGATIVE_EXAMPLES constant

A module-level constant containing one bad example and one good example, formatted as part of the system prompt:

The bad example demonstrates the patterns to avoid: passive voice ("it's worth noting that"), hedge stacking ("could potentially indicate"), corporate language ("positive sentiment from company leadership regarding future prospects").

The good example demonstrates the target voice: direct, specific dollar amounts and timeframes, personality ("Make of that what you will"), no hedging.

This constant is injected into:
- `buildCommentPrompt()` in the main CAT 4 comment generation
- `buildDDSystemPrompt()` in Steps 2 and 3 of the DD pipeline
- Any CAT 5 Claude calls (if a story-format variant is used instead of the template)

### buildCommentPrompt(post, insiderData, subreddit, structure) — refactored CAT 4 entry

Replaces the current `draftComment()` stub. Assembles the full Claude API call payload:

- System: `NEGATIVE_EXAMPLES` + anti-pump rule + subreddit tone from `SUBREDDIT_TONE_MAP[subreddit]` + structure instruction from `REPLY_STRUCTURES[structure]` + subreddit example (if non-empty)
- User: post title, post body, insider data (ticker, insider name, role, amount, date, track record)
- Parameters: model = `claude-sonnet-4-6`, maxTokens = 300, temperature = 0.7

This function makes the actual Claude API call and returns the generated text.

### Anti-pump rule

The rule is added as a constant: `"NEVER explicitly recommend buying or say a stock will go up. Present data only. Let the data speak."` Injected into every Claude system prompt in this file alongside `NEGATIVE_EXAMPLES`.

---

## File Structure

The plan touches two files and creates one new one:

```
n8n/code/insiderbuying/
  reddit-monitor.js        (modified — the main file)
  visual-templates.js      (new — 3 stub functions)
n8n/tests/
  reddit-monitor.test.js   (modified — new test cases added)
```

All new exported functions from `reddit-monitor.js`:
- `getRedditToken()` — OAuth token (with caching)
- `getNextReplyStructure(subreddit)` — rotation + NocoDB write
- `validateReply(text, subreddit)` — word count + URL/brand check
- `checkDailyCommentLimit(subreddit)` — global + per-sub cap
- `shouldSkipToday()` — weekly skip day logic
- `upvoteContext(postId, comment1Id, comment2Id)` — Reddit vote API
- `scheduleEditUpdate(commentId, ticker, subreddit, priceAtPost)` — NocoDB insert
- `processScheduledJobs()` — processes deferred_reply, edit, thread_reply, ama, dd_reply jobs
- `runCAT4Comments()` — CAT 4 entry point (scans posts, enqueues deferred reply jobs)
- `postDailyThread()` — CAT 5 entry point
- `postDDPost()` — CAT 6 entry point
- `buildDDPost(ticker, data)` — 4-step Claude pipeline
- `checkDDPostLimit()` — frequency gate

---

## Implementation Order

Sections must be implemented in order — each builds on the previous:

1. **Section 0** — infrastructure (NocoDB tables, visual stub). Nothing else works without this.
2. **Section 1** — auth + tone map + state helpers. All other sections call `getRedditToken()` and `getState()`.
3. **Section 2** — rotation + validation. The CAT 4 main flow (Section 3+) depends on these.
4. **Section 3** — cap + timing + job queue. CAT 5 and 6 both call `shouldSkipToday()` and scheduling functions.
5. **Section 4** — CAT 5. Self-contained once Section 0-3 are in place.
6. **Section 5** — CAT 6. Depends on Section 0-3; visual-templates.js stub from Section 0.
7. **Section 6** — anti-AI detection. Refactors prompts across all sections; must be applied last to avoid rework.

---

## Key Decisions and Rationale

**ROPC OAuth vs. n8n credential injection**: Using ROPC directly in reddit-monitor.js keeps the file self-contained and testable without n8n. The token cache prevents redundant token fetches within a single execution.

**Unified Scheduled_Jobs queue**: Rather than separate tables or setTimeout chains, all delayed actions (edit updates, thread replies, DD replies) share one table with a `type` field and a `processScheduledJobs()` processor called every 15 minutes by n8n. This is simpler to maintain and easier to inspect/debug in NocoDB.

**Template-driven CAT 5 (no AI)**: The daily thread comment uses JavaScript template strings, not Claude. This keeps CAT 5 cheap (no API cost), fast (no generation latency), and deterministic. The template content is factual and data-driven, not persuasive — no AI detection risk.

**Telegram approval removed from CAT 6**: The spec explicitly removes the approval gate that PROMPT-WORKFLOW-FRAMEWORK.md suggested. The quality gate (word count + bear case length) and human-likeness score >= 7 serve as automated gatekeepers.

**visual-templates.js as a stub**: The Imgur integration is fully wired up, but the actual visual generation (Puppeteer/Chart.js) is deferred. DD posts work without images — the upload logic simply skips null returns. This avoids blocking the entire CAT 6 feature on visual implementation.

**Skip day auto-generation on Monday**: Rather than requiring a separate n8n workflow to set skip days, `shouldSkipToday()` generates them on first run of the week. The check is idempotent — running it multiple times Monday won't regenerate skip days if they're already set for this week.

**Per-subreddit structure rotation (not global)**: Each subreddit has its own counter in NocoDB. If wallstreetbets hits its daily cap early and doesn't post, ValueInvesting's counter still rotates independently. This prevents one subreddit's skip days from affecting another's structural variety.
