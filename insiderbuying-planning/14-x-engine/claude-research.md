# Claude Research: 14-x-engine

## Sources
- Codebase exploration: x-engagement.js, x-auto-post.js, tests, shared patterns
- research-results/04-perplexity-deep.md — CAT 7 deep-dive (best source for X replies)
- research-results-r2/05-claude-opus.md — CAT 7 + CAT 8 workflow architecture + prompt designs
- research-results/05-claude-opus.md — CAT 7 algorithm, best-in-class, errori fatali
- research-results/02-gemini-flash.md, 03-openai.md — supporting data

---

## 1. Codebase: Current State

### x-engagement.js (118 lines, 3 functions)

**`filterRelevant(items)`** — filters tweet array by:
- `MIN_FOLLOWERS = 10`, `MIN_FOLLOWING = 10`, `MIN_ACCOUNT_AGE_DAYS = 30`
- Returns filtered array of "legitimate" accounts
- Input shape: `{ id, text, user: { followers_count, following_count, created_at }, in_reply_to_status_id }`

**`draftReply(originalTweet)`** — builds Claude Haiku prompt:
- Role: "knowledgeable retail trader who follows SEC insider filings"
- Rules: NO links, NO brand names, NO website promotion, max 240 chars
- Returns `{ prompt: string, maxTokens: 100 }` — does NOT call the API

**`sendToTelegramReview(original, draft, chatId)`** — builds Telegram inline keyboard message:
- Buttons: Approve / Edit / Skip
- Callback data: `x:approve:{tweetId}`, `x:edit:{tweetId}`, `x:skip:{tweetId}`

**What's NOT in the module:**
- No actual API calls — n8n HTTP Request nodes handle those
- No NocoDB reads or writes — n8n NocoDB nodes handle those
- No media upload logic
- No state tracking
- No twitterapi.io polling (lives in n8n workflow)
- No error handling (n8n handles it)

### x-auto-post.js (162 lines, 5 functions)

**`generateArticleTweet(article)`** — text-only tweet from article:
- Input: `{ ticker, verdict_type, key_takeaways }`
- Verdict map: bullish/bearish/mixed/neutral → string fragments
- Truncates to 280 chars with ellipsis
- No LLM, no media

**`generateAlertTweet(alert)`** — from significance-scored alert:
- Gate: `significance_score >= 8` required
- Input: `{ ticker, insider_name, transaction_type, shares, value_usd, significance_score }`
- Value format: `$X.XM` / `$XXK` / `$X,XXX`
- Returns null if score < 8

**`postToX(text)`** — builds payload for n8n HTTP node:
```js
{ method: 'POST', url: 'https://api.twitter.com/2/tweets',
  headers: { 'Content-Type': 'application/json' }, body: { text } }
```
No media_ids, no threading support.

**`checkDailyLimit(logEntries)`** — `MAX_DAILY_POSTS = 10` (changing to 4)

**`logTweet(tweetId, text, sourceType, sourceId)`** — builds NocoDB record for X_Engagement_Log

**What's NOT in the module:**
- No DeepSeek / LLM calls (was all data transformation)
- No media upload
- No thread/reply-chain posting
- No quote-retweet scheduling
- No 4 format rotation
- No time slot handling

### Test Framework (IMPORTANT)
- **Framework:** Node.js native `node:test` + `node:assert/strict` — NO Jest, no Mocha
- **Pattern:** Pure fixture-based testing. No mocks, no stubs. All functions are pure utilities.
- Tests import directly: `require('../code/insiderbuying/x-engagement.js')`
- x-engagement.test.js: 11 tests across 3 functions
- x-auto-post.test.js: 10 tests across 4 functions
- All tests pass currently — must not regress

### LLM Call Pattern (from analyze-alert.js)
```js
const resp = await fetchFn('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1536,
    messages: [{ role: 'user', content: prompt }] })
});
const text = resp.content[0].text;
```
Retry pattern: catch 429 → sleep 5s → retry; catch 500/503 → sleep 2s → retry.

### NocoDB Query Pattern (from blog-helpers.js)
```js
// WHERE clause with tilde-separated filters
let where = `(ticker,eq,${ticker})~and(filed_at,gt,${sevenDaysAgo})`;
// Injection prevention: /[~()]/ pattern check before including user input
// GET: ?where=ENCODED&sort=-filed_at&limit=3
```
NocoDB uses its own REST API syntax distinct from Supabase PostgREST. `nocodb.list()` is likely an n8n NocoDB node operation called from upstream, NOT a direct HTTP call within the JS module.

### X API Patterns (from code)
The actual `POST /2/tweets` is built as a payload and returned for n8n to execute.
Media upload (`POST /1.1/media/upload.json`) is not currently implemented anywhere in the codebase.

### DeepSeek Integration
Not yet present in x-auto-post.js (it was all pure data transformation). New implementation needs to add it for CAT 8 post generation.

---

## 2. X Reply Best Practices (CAT 7)

### Best-in-Class Accounts
- @unusual_whales, @TrungTPhan, @CharlieBilello — reply within 3-5 minutes
- Mid-size accounts (10K-100K followers) dominate "reply guy" strategy more than large brands
- Sweet spot format: specific data point + brief interpretation + optional question

### Example Replies by Archetype

**Data Bomb:**
```
"CEO bought $5M just 2 weeks ago. His last 5 buys averaged +23%. Watching for $200 📈"
"CFO's last 5 buys: +23%, +45%, +12%, +67%, -5%. Pretty solid hit rate."
"3 insiders bought $8M combined last month. All are green."
```

**Contrarian:**
```
"Interesting take. Worth noting the CEO just bought $5M worth at these levels 🤔"
"The sentiment is bearish but 3 insiders disagree - $12M in buys last week"
"Actually, insider selling stopped 2 months ago. Now seeing small buys."
```

**Pattern:**
```
"Classic pre-earnings positioning. Same pattern in NVDA, AMD before their beats 📊"
"This fits the pattern - tech insiders have bought $45M across 12 companies this month"
"Seeing this across fintech. SOFI, SQ, PYPL all have CEO buys recently"
```

### Algorithm / Reach Factors
1. **Engagement speed**: Reply within 10-15 min of tweet = visibility. First 10 replies get 90% of visibility.
2. **Follower ratio** of replier: 5K followers → reply must be excellent to rank
3. **Link penalty**: Replies with http/www are deprioritized by X algorithm
4. **Length sweet spot**: 150-220 chars (2-3 sentences). Not 280. Not < 100.
5. **Visual boost**: Screenshot of SEC data → +35-50% engagement
6. **Best image type**: Raw SEC EDGAR screenshot or simple data table (NOT polished branded card)

### Anti-Bot / Humanization
Patterns that trigger X detection:
- Metronomic timing (exactly 3:15pm every day, 45-second intervals)
- Same reply format every time
- No own tweet history, 100% replies
- Like pattern: liking EVERYTHING from one account in 2 minutes
- Responding to the SAME account 10+ times/week

Safe patterns:
- Vary format wildly (data dump → question only → contrarian → emoji + 1 sentence)
- Timing: 2-8 minutes after tweet (human-like), NOT 45 seconds
- 15-20 replies/day max (spec says 15-20)
- Mix target accounts (don't always reply to same 2-3 accounts)
- Account must have some own-post history (not 100% reply guy)

### Conversion Path
X Reply → profile visit → bio click → blog post → email signup → Pro upgrade
- Reply to profile click: 0.5-2% (depends on bio clarity)
- Website → email signup: 15-30% (if landing page is good)
- Psychology driver: **"edge" / information advantage**, not profit promise

---

## 3. X Post Best Practices (CAT 8)

### 4 Format Performance

**Breaking Alert (9:30 AM)**:
- Start with 🚨 or "BREAKING:"
- Lead with most impressive fact ($amount)
- 200-250 chars
- End with forward-looking statement ("Earnings in 3 weeks 👀")

**Thread Starter (12:00 PM)**:
- Hook that promises value
- 220-280 chars for tweet 1
- End with "🧵" or "Thread:"
- Use numbered insight ("3 patterns that beat the market by 2-3x")
- Threading: POST tweet 1 → reply tweet 2 to tweet1_id → reply tweet 3 to tweet2_id

**Market Commentary (15:30 PM)**:
- Start with market observation (macro, price action)
- Pivot to insider behavior
- 180-240 chars
- Timely, data-backed

**Engagement Poll (18:00 PM)**:
- Genuine question (not obvious answer)
- Include data context before poll
- 150-220 chars
- X API v2 poll: `{ poll: { options: [{label: "Rally"}, {label: "Crash"}, ...], duration_minutes: 1440 } }`

### Visual Templates by Format
- breaking_alert → Data Card (Template 1)
- market_commentary → Market Movers card (Template 9)
- thread → no media
- poll → no media

### Timing + Jitter
- 4 Schedule Triggers in n8n (one per slot)
- Each trigger passes slotIndex to JS module
- Jitter: ±15-30 min in real execution so not metronomic

### Quote-Retweet Strategy
- After each post: schedule quote-retweet 2-3 hours later
- Queue in NocoDB `X_Scheduled_Jobs`: `{ tweet_id, type: 'quote_retweet', execute_after }`
- Separate n8n Schedule (every 15 min) processes queue
- Gate: check original tweet got > 20 likes before QRT (skip if too low)
- QRT text: "Update: [$ticker] has since moved X% since this buy. Here's what to watch..."

### Anti-Bot for Posts
- No two consecutive posts with identical structure
- Rotate formats (track last used in NocoDB X_State)
- Never post exactly on the hour (use jitter)
- Max 4 posts/day (from 10 → major reduction per spec)
- Reject posts containing `http` or `www.`

---

## 4. Media Upload: X API v1.1

The X media upload API is separate from v2 tweets:
- **Endpoint**: `POST https://upload.twitter.com/1.1/media/upload.json`
- **Auth**: OAuth 1.0a (not Bearer token — different auth than v2 tweets)
- **Content-Type**: `multipart/form-data`
- **Body**: `media` field (raw bytes or base64), `media_type` field (e.g. `image/png`)
- **Response**: `{ media_id_string: "12345..." }` — use this in v2 tweet

Then in `POST /2/tweets` body:
```json
{ "text": "...", "media": { "media_ids": ["12345..."] } }
```

**Important caveats:**
- The upload endpoint requires OAuth 1.0a (consumer key/secret + access token/secret), NOT the Bearer token used for v2 tweet reads
- PNG is the right format for data cards
- File size limit: 5MB for images
- `media_id_string` must be used (not `media_id` number — JavaScript loses precision on large integers)

---

## 5. Weighted Random Selection Pattern

For 40/30/30 archetype distribution:
```js
function weightedRandom(archetypes) {
  const rand = Math.random();
  let cumulative = 0;
  for (const [key, cfg] of Object.entries(archetypes)) {
    cumulative += cfg.weight;
    if (rand < cumulative) return key;
  }
  return Object.keys(archetypes)[0]; // fallback
}
```

For "always different" format rotation (not pure random):
```js
// Track lastUsedFormat in NocoDB X_State
// Filter out lastUsedFormat before selecting
const available = formats.filter(f => f !== lastUsed);
const next = available[Math.floor(Math.random() * available.length)];
```

State persistence in NocoDB `X_State`: single record with `{ archetype_counts, last_post_format, daily_reply_count, daily_reply_date }`.

---

## 6. Testing Approach for New Functions

Following existing test patterns:
- **Framework**: Node.js native `node:test` + `node:assert/strict` only
- **No mocks needed**: design new functions as pure utilities that return payloads
- Functions that build API payloads (like `postToX()`) are easily testable without mocking
- Functions that take NocoDB data as input can be tested with fixture objects
- For async functions: use `test('...', async (t) => { ... })`

Tests required per spec:
1. `extractTicker(text)` — 10 samples, correct $CASHTAG extraction
2. `validateReply(text)` — char count 150-220, emoji > 1 fails, links fail, $CASHTAG required
3. Archetype selection — 100 random calls, check 40/30/30 distribution (within ±5%)
4. Daily cap — mock NocoDB returns 15 posts → new reply skipped
5. Timing delay — verify `randomBetween(180000, 300000)` called (check return range)
6. Media upload — verify correct multipart payload built
7. Quote-retweet scheduler — verify correct job object created after post

---

## 7. NocoDB Tables Required

**`X_State`** (single record, per account or global):
- `last_post_format` — last used format name
- `daily_reply_count` — count resets daily
- `daily_reply_date` — date of last count
- `archetype_counts` — JSON `{data_bomb: N, contrarian: N, pattern: N}`

**`X_Engagement_Log`** (existing, extended):
- Existing fields: `tweet_id`, `text`, `source_type`, `source_id`, `posted_at`, `status`
- May need: `archetype` field for replies, `format_type` for posts

**`X_Scheduled_Jobs`** (new):
- `tweet_id`, `type` ('quote_retweet'), `execute_after` (ISO timestamp), `status` ('pending'/'done'/'skipped')

**`X_Account_Tones`** (optional, per spec GAP 7.6):
- `account_handle`, `tone_profile` — e.g. 'formal', 'casual', 'balanced'
- Alternative: inline `ACCOUNT_TONE_MAP` object in module (simpler)

---

## 8. Key Gotchas

1. **NocoDB in n8n modules**: `nocodb.list()` in the spec is pseudocode — the actual pattern is to receive filing data as input (from n8n NocoDB node upstream), not call NocoDB directly from JS. The JS module should receive pre-fetched data.

2. **Thread posting**: n8n has no native "thread" node. Must post tweet 1, capture response `data.id`, then post tweet 2 with `{ reply: { in_reply_to_tweet_id: tweet1Id } }`, then tweet 3 replying to tweet 2.

3. **X API auth**: Media upload (v1.1) needs OAuth 1.0a. Tweet posting (v2) needs Bearer or OAuth 2.0. Credentials must be stored separately.

4. **visual-templates.js**: The spec references `templates.renderTemplate(2, filingContext)` from unit 11. This module may not be deployed yet — the implementation must handle the case where it's unavailable (graceful skip of media attachment).

5. **`randomBetween` in n8n**: n8n Code node sandbox has `Math.random()` available. `setTimeout` equivalent is NOT available — timing delay must be implemented as `await new Promise(resolve => setTimeout(resolve, ms))` which works in n8n's async context.

6. **Character counting for emojis**: `text.length` counts emoji code units (multi-codepoint emoji = 2+). The regex `/\p{Emoji}/gu` correctly matches emoji graphemes but the X platform counts emoji as 1-2 weighted chars (some count as 2). Use `.length` for simplicity; the 150-220 range has enough headroom.

7. **`media_id_string` vs `media_id`**: Always use the string variant from media upload response. JavaScript's Number type loses precision for IDs > 2^53.
