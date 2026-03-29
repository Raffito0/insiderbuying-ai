# Spec: 14-x-engine (Synthesized)

## What We're Building

Upgrade of two n8n JavaScript modules (`x-engagement.js` and `x-auto-post.js`) plus a new shared dependency (`ai-client.js`) to transform EarlyInsider's X/Twitter presence from generic text-only content to a data-rich, multi-format presence with real filing context, 3 archetype reply rotation, media card attachments, and structured post scheduling.

---

## Context: Current State

**x-engagement.js** (118 lines): Has 3 pure utility functions — `filterRelevant()`, `draftReply()`, `sendToTelegramReview()`. The draft uses a single generic Claude Haiku prompt (no data enrichment, no archetypes). Telegram review is present.

**x-auto-post.js** (162 lines): Has 5 pure utility functions — `generateArticleTweet()`, `generateAlertTweet()`, `postToX()`, `checkDailyLimit()` (MAX=10), `logTweet()`. Single format, no LLM, no media, no threading, no quote-retweet.

**Existing tests**: Node.js native `node:test` + `node:assert/strict`, no Jest. Pure fixture-based, no mocks. 21 tests total across both files.

**ai-client.js**: Does not yet exist — will be built as a minimal stub in this unit.

---

## Architecture Principles (From Codebase)

- **JS modules are pure utilities** — they receive data as input and return payloads. They do NOT call NocoDB directly. NocoDB reads/writes happen in n8n nodes upstream/downstream.
- **Actual HTTP calls** are handled by n8n HTTP Request nodes, not JS Code nodes. JS builds the request payload and returns it.
- **LLM calls** are the exception — they happen inside JS Code nodes using `fetchFn` helper passed in via context.
- **All existing tests must still pass** after changes.

---

## What Changes

### New File: ai-client.js (stub)

Minimal shared client for LLM calls. Exports two functions:
- `claude(prompt, opts)` — calls Anthropic API (claude-sonnet-4-6)
- `deepseek(prompt, opts)` — calls DeepSeek API

Both use `fetchFn` + API key from environment. Retry on 429/500/503.

### x-engagement.js Changes

1. **Remove** `sendToTelegramReview()` — auto-post flow replaces human review
2. **Add** `buildFilingContext(tweet, filings)` — receives pre-fetched filings array, extracts filing context
3. **Add** `extractTicker(text)` — parses `$TICKER` pattern from tweet text
4. **Add** `selectArchetype(state)` — weighted random: data_bomb 40%, contrarian 30%, pattern 30%
5. **Add** `buildReplyPrompt(archetype, tweet, filingContext)` — archetype-specific Claude Sonnet prompt
6. **Add** `validateReply(text)` — char count 150-220, ≤1 emoji, no links, $CASHTAG required
7. **Add** `checkDailyReplyCap(logEntries)` — max 15 replies/day
8. **Add** `buildTimingDelay()` — returns `randomBetween(180000, 300000)` ms
9. **Add** `buildEngagementSequence(tweetId)` — builds payload to like original + 2-3 thread replies
10. **Add** `maybeAttachMedia(filingContext)` — 40% chance, returns renderTemplate stub call (visual-templates.js dependency)
11. **Modify** `filterRelevant(items)` — keep existing, raise MIN_FOLLOWERS to something meaningful for real targets
12. **Modify** `draftReply(tweet)` → replaced by `buildReplyPrompt()` (different signature)

### x-auto-post.js Changes

1. **Add** `POST_FORMATS` config — 4 formats: breaking_alert, thread, market_commentary, engagement_poll
2. **Add** `POST_SLOTS` config — 4 time slots with jitter
3. **Add** `buildBreakingAlert(data)` — DeepSeek prompt → text
4. **Add** `buildThread(data)` — returns 3-tweet array (hook, data, actionable+question)
5. **Add** `buildCommentary(data)` — market context + 2-3 insider data points
6. **Add** `buildPoll(data)` — poll text + X API v2 poll object
7. **Add** `selectNextFormat(lastUsedFormat)` — never repeats consecutive format
8. **Add** `buildQuoteRetweetJob(tweetId, ticker, filingContext)` — returns NocoDB X_Scheduled_Jobs record
9. **Add** `buildQuoteRetweetText(ticker, priceMovement)` — "Update: [$ticker] has since moved X%..."
10. **Add** `buildLinkValidation(text)` — rejects if contains `http` or `www.`
11. **Modify** `checkDailyLimit()` — MAX_DAILY_POSTS = 4 (was 10)
12. **Modify** `postToX(text)` → `postToXWithMedia(text, mediaId?)` — adds optional `media.media_ids`
13. **Remove** `generateArticleTweet()`, `generateAlertTweet()` — replaced by format-specific builders

---

## Sections

### Section 1 — x-engagement.js: Data Enrichment
Add `extractTicker(text)` and `buildFilingContext(tweet, filings)`.
- `extractTicker`: regex `\$([A-Z]{1,5})` on tweet text, return first match or null
- `buildFilingContext(tweet, filings)`: receive pre-fetched filings array (from n8n NocoDB node), return structured context object or null if no filings
- Context shape: `{ ticker, insiderName, insiderRole, transactionValue, transactionDate, priceAtPurchase, trackRecord, clusterCount }`
- If no ticker extracted OR no filings → return null → SKIP reply (never reply without data)

### Section 2 — x-engagement.js: 3 Archetype Prompts
Add `selectArchetype(state)` and `buildReplyPrompt(archetype, tweet, filingContext)`.
- Weighted random selection (40/30/30) using cumulative probability
- State tracks counts per archetype for monitoring (not used for routing)
- Each archetype has distinct system prompt, style rules, negative examples, example output
- Account tone adaptation (GAP 7.6): `ACCOUNT_TONE_MAP` inline object — maps known handles to tone adjustments
- `buildReplyPrompt` uses `ai-client.js` `claude()` function with Claude Sonnet

### Section 3 — x-engagement.js: Validation + Caps + Timing
Add `validateReply(text)`, `checkDailyReplyCap(logEntries)`, `buildTimingDelay()`, `buildEngagementSequence(tweetId)`.
- Validation: char count 150-220, emoji count ≤ 1, no links, `$CASHTAG` present
- Daily cap: count today's log entries, return `{ canReply, repliesToday }`
- Timing: return `randomBetween(180000, 300000)` — n8n uses this for a Wait node
- Engagement sequence: returns array of API payload objects for n8n to execute sequentially (like original, then like 2-3 thread replies)

### Section 4 — x-engagement.js: Media Attachment
Add `maybeAttachMedia(filingContext)` and `uploadMediaToX(buffer)`.
- `maybeAttachMedia`: 40% chance, returns `null` when visual-templates.js not yet deployed (stub behavior)
- `uploadMediaToX(buffer)`: builds multipart payload for `POST /1.1/media/upload.json` — requires OAuth 1.0a (flag as dependency)
- Note: OAuth 1.0a setup must be confirmed before media upload can go live
- Implement media attachment as gated behavior: `if (!visualTemplates) return null`

### Section 5 — x-auto-post.js: 4 Format Rotation + Media
Add `POST_FORMATS`, `selectNextFormat()`, `buildBreakingAlert()`, `buildThread()`, `buildCommentary()`, `buildPoll()`.
- `selectNextFormat(lastUsedFormat)`: filter out last used, pick randomly from remaining 3
- `buildBreakingAlert(data)`: calls DeepSeek (via ai-client.js) with CAT 8 Format 1 prompt
- `buildThread(data)`: returns `[tweet1, tweet2, tweet3]` array for n8n to post as reply chain
- `buildCommentary(data)`: DeepSeek prompt for market observation + insider angle
- `buildPoll(data)`: returns `{ text, poll: { options: [...], duration_minutes: 1440 } }` for X API v2
- Remove `generateArticleTweet()` and `generateAlertTweet()` (deprecated by new format system)
- MAX_DAILY_POSTS = 4

### Section 6 — x-auto-post.js: Timing + Threading + Quote-Retweet
Add `POST_SLOTS`, `buildQuoteRetweetJob()`, `buildQuoteRetweetText()`, `buildLinkValidation()`.
- `POST_SLOTS` config: 4 slots with jitter values (used by n8n Schedule Triggers, not the JS module)
- `buildLinkValidation(text)`: returns `{ valid, error }` — rejects if `text.includes('http') || text.includes('www.')`
- `buildQuoteRetweetJob(tweetId, ticker, filingContext)`: returns X_Scheduled_Jobs record with `execute_after = now + randomBetween(7200000, 10800000)`
- `buildQuoteRetweetText(ticker, priceAtBuy, currentPrice)`: calculates % movement, returns "Update: [$ticker] has since moved +X.X% since this buy. Here's what to watch..." — price data fetched from Finnhub/Financial Datasets API by n8n scheduler job

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| visual-templates.js | Not built (unit 11) | Implement as stub returning null. Media attachment is gated on this. |
| ai-client.js | To be built in this unit | Minimal claude() + deepseek() stub |
| OAuth 1.0a for X media upload | Setup required | Flag in implementation notes. Media upload won't work without it. |
| X_State NocoDB table | Needs to exist | Tracks last_post_format, daily_reply_count, daily_reply_date |
| X_Scheduled_Jobs NocoDB table | New table needed | For quote-retweet queue |
| Finnhub/Financial Datasets API | Already in codebase | Used for QRT price movement calculation |

---

## Test Requirements (From Spec)

All tests use Node.js native `node:test` + `node:assert/strict`. No Jest. No external mocks.

1. `extractTicker`: 10 tweet samples — cashtag extraction, no false positives, no ticker in normal text
2. `validateReply`: 150-220 enforced, >1 emoji fails, link fails, missing $CASHTAG fails, valid passes
3. Archetype selection: 100 random calls → distribution within ±5% of 40/30/30
4. Daily cap: fixture with 15 entries → `canReply: false`; fixture with 14 → `canReply: true`
5. Timing delay: `buildTimingDelay()` returns value in [180000, 300000] range over 100 calls
6. Media upload: `uploadMediaToX(buffer)` builds correct multipart payload structure (not live)
7. Quote-retweet job: `buildQuoteRetweetJob(...)` returns record with correct fields and `execute_after` in [now+7200000, now+10800000] range

---

## Definition of Done

- `validateReply` enforces 150-220 chars, $CASHTAG, ≤1 emoji, no links
- 3 archetype rotation with 40/30/30 weights
- Daily reply cap ≤ 15 checked before posting
- Timing delay 3-5 min before reply
- `buildFilingContext` returns null if no ticker or no filings → reply skipped upstream
- MAX_DAILY_POSTS = 4
- 4 formats rotating (never consecutive same)
- Quote-retweet job created after each post
- Media attachment gated on visual-templates.js availability
- ai-client.js stub exports `{claude, deepseek}`
- All 21 existing tests still pass
- New tests for all 7 requirements above pass
