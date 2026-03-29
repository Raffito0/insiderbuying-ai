# Spec (Synthesized): 13-reddit-engine

## What We're Building

Transform `reddit-monitor.js` from a non-functional stub into a fully working Reddit automation engine with three content categories:

- **CAT 4**: Subreddit-native comment replies with 5 distinct tones, structure rotation, daily caps, timing delays, upvoting, and scheduled follow-up edits
- **CAT 5**: Pre-market daily thread comments posted Mon-Fri (with rotation + skip days), using 3 structural templates, rotating across 3 subreddits one-per-day
- **CAT 6**: Long-form due-diligence posts generated via 4-step Claude pipeline, with Imgur image embedding, authenticity gating, and AMA follow-up comment

A prerequisite `visual-templates.js` stub file and 3 NocoDB tables must be created as part of this plan.

---

## Constraints

- **CommonJS only** — no ES modules, no import/export
- **Claude Sonnet 4.6** for all Reddit-generated content
- **Reddit OAuth**: ROPC flow — reddit-monitor.js fetches its own access token via `POST https://www.reddit.com/api/v1/access_token` using `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`
- **Imgur API**: `POST https://api.imgur.com/3/image`, auth `Authorization: Client-ID {IMGUR_CLIENT_ID}`, free tier
- **Daily total comment cap**: max 10 across ALL subreddits (A10 reduced from 17)
- **No URLs in any Reddit output** — regex enforced + prompt instruction
- **No brand names** in any Reddit output — no EarlyInsider, earlyinsider.com, any website
- **Anti-pump rule** in ALL prompts: "Never explicitly recommend buying or say a stock will go up. Present data only."
- **NocoDB**: 3 new tables (Reddit_State, Scheduled_Jobs, Reddit_DD_Posts) — must be created before code runs
- **Data source** for CAT 5/6 insider filings: same NocoDB table already used in CAT 4 flow
- **Invocation**: n8n Code nodes / schedule nodes. Not a standalone script.

---

## Section 0: NocoDB Table Setup (Prerequisite)

Create three NocoDB tables via NocoDB API before deploying the code.

### Reddit_State
Tracks per-subreddit rotation counters, weekly skip days, and daily thread rotation.

Fields:
- `id` (auto)
- `key` (TEXT, unique) — e.g. "wallstreetbets_structure_index", "week_skip_days", "daily_thread_sub_index"
- `value` (TEXT) — JSON-serialized value
- `updated_at` (DATETIME)

Usage: `getState(key)` / `setState(key, value)` helper functions that read/write this table via NocoDB REST API.

### Scheduled_Jobs
Unified queue for all delayed actions: edit updates, reply-to-replies.

Fields:
- `id` (auto)
- `type` (TEXT) — 'reddit_edit' | 'reddit_thread_reply' | 'reddit_dd_reply'
- `payload` (JSON) — all data needed to execute the job
- `execute_after` (DATETIME)
- `status` (TEXT) — 'pending' | 'done' | 'skipped'
- `created_at` (DATETIME)

### Reddit_DD_Posts
Tracks posted DD posts for frequency limiting.

Fields:
- `id` (auto)
- `ticker` (TEXT)
- `post_url` (TEXT)
- `subreddit` (TEXT)
- `authenticity_score` (DECIMAL)
- `posted_at` (DATETIME)
- `status` (TEXT) — 'draft' | 'posted'

---

## Section 1: SUBREDDIT_TONE_MAP + Reddit Auth + State Helpers

### SUBREDDIT_TONE_MAP
The authoritative per-subreddit configuration:

```javascript
const SUBREDDIT_TONE_MAP = {
  wallstreetbets: {
    tone: 'casual_degen',
    wordLimit: { min: 50, max: 100 },
    style: 'WSB lingo (tendies, regarded, YOLO). Self-deprecating humor. Emojis OK (🚀💎). Contrarian is valued.',
    example: 'The CEO literally bought $2M worth last Tuesday. Either he knows something or he\'s more regarded than us 🚀',
    dailyCap: 3
  },
  ValueInvesting: {
    tone: 'academic_analytical',
    wordLimit: { min: 150, max: 200 },
    style: 'Measured, fundamental. Reference P/E multiples, moat, margin of safety. No emojis, no hype. Graham/Buffett framing.',
    example: 'Worth noting the CFO purchased $2.8M at a P/E of 14.2, well below the 5-year average of 18.7...',
    dailyCap: 2
  },
  stocks: {
    tone: 'balanced_informed',
    wordLimit: { min: 100, max: 150 },
    style: 'Conversational but informed. Balance data with readability. Middle ground between WSB and ValueInvesting.',
    example: 'FWIW, I noticed the CFO bought $1.5M last week. Their track record is solid — 5 of 7 buys were green within 6 months.',
    dailyCap: 2
  },
  Dividends: {
    tone: 'conservative_yield',
    wordLimit: { min: 100, max: 150 },
    style: 'Conservative, yield-focused, payout sustainability. Focus on dividend safety, coverage ratio, history.',
    example: '',
    dailyCap: 1
  },
  InsiderTrades: {
    tone: 'technical_filing',
    wordLimit: { min: 100, max: 200 },
    style: 'Technical, filing-detail focused. Historical pattern comparison. Mention filing date, form type, amendment if any.',
    example: '',
    dailyCap: 2
  }
};
```

Total per-subreddit caps sum to 10, matching the overall daily cap.

### Reddit OAuth (ROPC flow)
`getRedditToken()` — fetches access token:
- POST to `https://www.reddit.com/api/v1/access_token`
- Basic auth: `REDDIT_CLIENT_ID:REDDIT_CLIENT_SECRET`
- Body: `grant_type=password&username={REDDIT_USERNAME}&password={REDDIT_PASSWORD}`
- Returns `access_token` string
- Token valid for 1 hour; cache in module-level variable with expiry check

### NocoDB State Helpers
`getState(key)` and `setState(key, value)` — thin wrappers around NocoDB REST API for `Reddit_State` table.
`getRedditLog(date)` — queries `Reddit_Log` for today's posted comments by subreddit.

---

## Section 2: Reply Structure Rotation + validateReply Fix

### REPLY_STRUCTURES constant
```javascript
const REPLY_STRUCTURES = ['Q_A_DATA', 'AGREEMENT_BUT', 'DATA_INTERPRET'];
```

Each structure has a system prompt instruction:
- `Q_A_DATA`: "Open with a question or observation about the post → answer with specific insider data → close with forward-looking angle"
- `AGREEMENT_BUT`: "Start by agreeing with something in the post → pivot with 'but worth noting...' → add the insider data point"
- `DATA_INTERPRET`: "Lead directly with the data point → interpret what it means → close with an engagement question or prediction"

### getNextReplyStructure(subreddit)
- Read `{subreddit}_structure_index` from NocoDB Reddit_State
- Return `REPLY_STRUCTURES[index % 3]`
- Increment and save index back to NocoDB

### validateReply(text, subreddit) — fixes GAP 4.11
```javascript
function validateReply(text, subreddit) {
  const { min, max } = SUBREDDIT_TONE_MAP[subreddit].wordLimit;
  const words = text.trim().split(/\s+/).length;
  return { valid: words >= min && words <= max, words, min, max };
}
```
Also checks: no URLs, no brand names (existing logic from current stub).

---

## Section 3: Daily Cap + Timing + Engagement

### checkDailyCommentLimit(subreddit)
- Query `Reddit_Log` for today's posts: `{date: today, status: 'posted'}`
- Check `totalToday >= 10` (global cap) → return `{ allowed: false, reason: 'global_cap' }`
- Check `subCount >= SUBREDDIT_TONE_MAP[subreddit].dailyCap` → return `{ allowed: false, reason: 'sub_cap' }`
- Otherwise return `{ allowed: true }`

### shouldSkipToday()
- Read `week_skip_days` from NocoDB Reddit_State
- If key is missing OR week has changed (stored week !== current ISO week):
  - Generate 1-2 random weekdays for this week (Mon=0 to Fri=4)
  - Store as `{ week: isoWeek, days: [dayIndex, dayIndex] }` in NocoDB
- Check if today's day index is in the skip list
- Return `{ skip: true/false }`

### upvoteContext(postId, comment1Id, comment2Id)
- Call Reddit API to upvote: `POST /api/vote` with `{ id: fullname, dir: 1 }`
- Upvote original post + 2 random top comments in the thread
- Called immediately before posting own reply

### scheduleEditUpdate(commentId, ticker, subreddit)
- Insert into NocoDB `Scheduled_Jobs`:
  ```json
  {
    "type": "reddit_edit",
    "payload": { "commentId": "t1_xxx", "ticker": "AAPL", "subreddit": "stocks" },
    "execute_after": "<now + 2h ISO>",
    "status": "pending"
  }
  ```

### processScheduledJobs()
Exported function — processes ALL pending jobs whose `execute_after <= now`:
- **reddit_edit**: fetch comment upvotes, if > 3: fetch price change since post time, append `\n\nEdit: $TICKER has moved +X.X% since this was posted.`, call Reddit API to edit comment
- **reddit_thread_reply**: fetch replies to original daily thread comment, generate 1-2 reply responses using Claude, post them
- **reddit_dd_reply**: fetch top-N new comments on DD post, generate substantive replies for 2-3 of them, post

Timing delay (GAP 4.6): before posting any reply in the main CAT 4 flow, `await sleep(randomBetween(600000, 1800000))` (10-30 min).

---

## Section 4: CAT 5 — Reddit Daily Thread

### shouldPostDailyThread()
- Call `shouldSkipToday()` — if skip, return false
- Check day of week — if weekend (Sat/Sun), check if it's Monday (weekend recap mode)
- Weekday Mon-Fri (excluding skip days): return true
- Saturday/Sunday: return false (recap posted Monday morning)

### getDailyThreadTarget()
Subreddit rotation for the daily thread post:
- CAT 5 target list: `['stocks', 'investing', 'ValueInvesting']`
- Read `daily_thread_sub_index` from NocoDB Reddit_State
- Return `targets[index % 3]`, then increment and save index

### findDailyDiscussionThread(subreddit)
- Reddit API: `GET /r/{subreddit}/search?q=Daily+Discussion&sort=new&restrict_sr=1&limit=10`
- Filter for posts created today (check `created_utc`)
- If found: return `{ id: post.id, title: post.title }`
- If not found: return `null` (caller skips this subreddit)

### buildDailyThreadComment(data)
Three templates, rotated via NocoDB `daily_thread_template_index`:

```javascript
const DAILY_THREAD_TEMPLATES = {
  notable_buys: (data) => `🔍 **Yesterday's Notable Insider Buys:**\n\n${data.filings.map(f =>
    `• **$${f.ticker}** — ${f.insiderName} (${f.role}) bought $${f.valueFormatted} at $${f.price}`
  ).join('\n')}\n\nPattern I'm noticing: ${data.pattern}\n\nAnything here on your watchlist?`,

  confidence_index: (data) => `📊 **Insider Confidence Index: ${data.sentiment}**\n\n${data.stats}\n\nTop move: ${data.topFiling}\n\nWhat's your read on this week's insider activity?`,

  unusual_activity: (data) => `⚡ **Unusual Form 4 Activity — ${data.date}:**\n\n${data.unusualItems.join('\n')}\n\nFirst time seeing this pattern in ${data.sector}. Anyone else tracking this?`
};
```

Weekend recap (Saturday's data, posted Monday): uses `confidence_index` template with `data.period = 'Fri-Sun'` aggregation.

### postDailyThread() — main CAT 5 entry point
1. `shouldPostDailyThread()` → false → return early
2. `getDailyThreadTarget()` → get today's target subreddit
3. `findDailyDiscussionThread(subreddit)` → null → log + return (skip)
4. Fetch yesterday's insider filings from NocoDB (same table as CAT 4)
5. Select template via `daily_thread_template_index`, increment counter
6. `buildDailyThreadComment(data)` → comment text
7. Post comment to daily thread via Reddit API
8. Log to `Reddit_Log`
9. Schedule `reddit_thread_reply` job in `Scheduled_Jobs` (executeAfter = now + randomBetween(3600000, 7200000))

---

## Section 5: CAT 6 — Reddit DD Posts

### checkDDPostLimit()
- Query `Reddit_DD_Posts` for posts where `status = 'posted'`
- If any post within last 3 days: return `{ allowed: false, reason: 'too_recent' }`
- Count posts this month: if >= 8, return `{ allowed: false, reason: 'monthly_limit' }`
- Return `{ allowed: true }`

### buildDDPost(ticker, data) — 4-step Claude pipeline

**Step 1 — Outline** (Claude Sonnet 4.6, 200 tokens):
- Prompt: "Write a DD outline for ${ticker} on Reddit. You're a retail investor who noticed something unusual in insider data. Sections: Discovery, Company Brief, Insider Activity Table, Fundamentals, Bull Case (5 catalysts), Bear Case (3 genuine risks), Valuation, What I'm Watching, Positions, TLDR."
- Returns outline text

**Step 2 — Full DD** (Claude Sonnet 4.6, 3000 tokens):
- System: includes NEGATIVE_EXAMPLES (bad/good format)
- System: anti-pump rule
- Prompt: outline + insider data → "Write the full DD. TONE: passionate retail investor discovering something, NOT AI analyst report. 'I was screening Form 4s last week when I noticed...' — make it a story. The Bear Case (400+ words) must be GENUINELY skeptical, not token."
- Returns full markdown draft

**Step 3 — Bear Case Review** (Claude Sonnet 4.6, separate call):
- Prompt: "Review this bear case section: [bear_case_text]. Is it genuine skepticism or token acknowledgment? Rate authenticity 1-10. If < 7, provide rewritten version."
- Parse `authenticity` score from response
- If score < 7: replace bear case section in draft with rewritten version

**Step 4 — TLDR Generation** (Claude Sonnet 4.6):
- Prompt: "Write a 3-4 bullet TLDR for this DD post. Each bullet must be specific (ticker, numbers, dates). No vague statements."
- Insert TLDR at top of post

### Quality Gate (before posting)
```javascript
function validateDDPost(text) {
  const words = text.split(/\s+/).length;
  const bearCaseMatch = text.match(/## The Bear Case[\s\S]*?(?=##|$)/);
  const bearWords = bearCaseMatch ? bearCaseMatch[0].split(/\s+/).length : 0;
  const hasTLDR = /\*\*TLDR\*\*/.test(text);
  return {
    valid: words >= 1500 && words <= 2500 && bearWords >= 400 && hasTLDR,
    wordCount: words,
    bearWordCount: bearWords,
    hasTLDR
  };
}
```

### Human-Likeness Check
After full draft: second Claude call — "Rate this post's human-likeness 1-10. If < 7, identify 3 specific phrases that sound AI-generated and rewrite them."
Parse rating. If < 7: apply rewrites and re-check once. Only proceed if rating >= 7.

### Imgur Upload
`uploadToImgur(base64Image)`:
- POST to `https://api.imgur.com/3/image`
- Header: `Authorization: Client-ID {IMGUR_CLIENT_ID}`
- Body: `{ image: base64String, type: 'base64' }`
- Return `data.link`

`uploadDDVisuals(ticker, data)`:
- Call `visual-templates.js` stub for 3 visuals: insiderTable, priceChart, peerRadar
- Upload each via `uploadToImgur()`
- Return `{ insiderTableUrl, priceChartUrl, peerRadarUrl }`
- Insert image markdown links into DD post body

### AMA Comment
5-10 min after posting DD: post follow-up comment: "Happy to answer questions on the bear case or valuation assumptions — AMA."
Scheduled via `Scheduled_Jobs` with type `reddit_dd_ama` (or just do directly with setTimeout — this is a direct 5-10 min delay, not a 2h+ delay, so can be done inline).

### postDDPost() — main CAT 6 entry point
1. `checkDDPostLimit()` → not allowed → return early
2. Day/time check: Tue-Thu, 10AM-2PM EST window (±45 min jitter)
3. Query NocoDB for high-score ticker cluster buy (score >= 8, not recently covered)
4. `buildDDPost(ticker, data)` → draft
5. Quality gate + human-likeness check → if fails after 1 retry, abort
6. `uploadDDVisuals()` → insert image links
7. Determine target subreddit (score >= 8 + high conviction → include wsb; otherwise stocks + ValueInvesting if fundamental-heavy)
8. Post to Reddit
9. Log to `Reddit_DD_Posts` with `status: 'posted'`
10. Schedule AMA comment (sleep 5-10 min, then post)
11. Schedule reply-to-replies in `Scheduled_Jobs` at 1h and 6h

---

## Section 6: Anti-AI Detection + Negative Few-Shot

### NEGATIVE_EXAMPLES constant
Added to system prompt for ALL Claude calls in reddit-monitor.js:

```
BAD EXAMPLE (do NOT write like this):
"It's worth noting that insider buying activity has increased significantly, which could potentially indicate positive sentiment from company leadership regarding future prospects."
— AI-sounding: passive voice, hedge stacking, corporate language.

GOOD EXAMPLE:
"CEO just dropped $2M on this at these prices. Last 3 times he bought, stock was up 20%+ within 6 months. Make of that what you will."
— Human: direct, specific, has personality.
```

Applied to: CAT 4 reply prompt, CAT 5 (if AI-generated text), CAT 6 full DD prompt.

### Injection points
`buildCommentPrompt(post, insiderData, subreddit, structure)` — CAT 4 main prompt builder:
- System: NEGATIVE_EXAMPLES + anti-pump rule + subreddit tone config + structure instruction
- User: post title, post body, insider data

`buildDailyThreadPrompt()` — CAT 5 (only if using AI for story format):
- Same NEGATIVE_EXAMPLES injection

`buildDDSystemPrompt()` — CAT 6:
- NEGATIVE_EXAMPLES + anti-pump rule
- "You are a passionate retail investor, NOT an AI analyst. Write as if you discovered this yourself."

### visual-templates.js stub
New file: `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/visual-templates.js`

Exports:
```javascript
module.exports = {
  generateInsiderTable: (filings) => null,   // TODO: returns base64 PNG
  generatePriceChart: (ticker, priceData) => null,  // TODO: returns base64 PNG
  generatePeerRadar: (ticker, peers) => null  // TODO: returns base64 PNG
};
```
These return `null` until implemented; `uploadDDVisuals()` skips Imgur upload for any `null` result.

---

## NocoDB Table Setup (API commands)

Each table created via NocoDB REST: `POST /api/v1/db/meta/projects/{projectId}/tables`

Example Reddit_State:
```json
{
  "title": "Reddit_State",
  "columns": [
    { "title": "key", "uidt": "SingleLineText" },
    { "title": "value", "uidt": "LongText" },
    { "title": "updated_at", "uidt": "DateTime" }
  ]
}
```

(Full field definitions for all 3 tables in Section 0 implementation.)

---

## Testing Requirements

All tests in `reddit-monitor.test.js`, CommonJS, Jest:

1. **SUBREDDIT_TONE_MAP**: all 5 subs have `tone`, `wordLimit.min`, `wordLimit.max`, `style`, `dailyCap`
2. **validateReply word count**: wallstreetbets 49-word text fails, 75-word passes; ValueInvesting 149-word fails, 175-word passes
3. **checkDailyCommentLimit**: mock NocoDB returning 10 total posts → returns `{ allowed: false, reason: 'global_cap' }`; mock returning 3 wsb posts → returns `{ allowed: false, reason: 'sub_cap' }` for wallstreetbets
4. **shouldSkipToday**: mock NocoDB with today as skip day → returns `{ skip: true }`; mock with today not in skip days → `{ skip: false }`; mock with no skip_days for this week → generates + stores + returns
5. **buildDailyThreadComment**: all 3 templates produce output string with correct structure given mock data; no URLs, no brand names in output
6. **buildDDPost**: mock Claude with fixed responses; verify 4 Claude calls made in order (outline → full → bear_case → tldr); verify bear case rewrite triggered when mock authenticity = 4; verify TLDR present in final output
7. **validateDDPost**: 1400-word draft fails; 1800-word draft with 400+ word bear case + TLDR passes
8. **uploadToImgur**: mock Imgur API returning `{ data: { link: 'https://i.imgur.com/test.png' } }` → returns URL correctly
9. **getRedditToken**: mock Reddit auth endpoint → returns token; subsequent call before expiry returns cached token
10. **processScheduledJobs**: mock NocoDB with pending `reddit_edit` job with 4 upvotes → Reddit edit call made; job with 2 upvotes → no edit; job type `reddit_thread_reply` → reply call made

---

## Definition of Done

- 5 subreddit tone configs with per-sub caps summing to 10
- Daily cap enforced (mock 10 posts → new post skipped)
- Reply word count validated per subreddit (not sentence count)
- Reply structure rotates per subreddit (NocoDB counter)
- Anti-pump rule in all prompts
- NEGATIVE_EXAMPLES in all Claude prompts
- Skip day logic: auto-generates on Monday, reads on subsequent days
- Daily thread: 3 templates, 1-subreddit-per-day rotation, skip fallback, weekend recap structure
- DD post: 4-step Claude pipeline, bear case review, human-likeness gate >= 7, Imgur upload (or skip if stub returns null), AMA comment, frequency limiter
- processScheduledJobs handles: reddit_edit, reddit_thread_reply, reddit_dd_reply
- visual-templates.js stub created with 3 null-returning functions
- 3 NocoDB tables created
- All 10 test cases pass
