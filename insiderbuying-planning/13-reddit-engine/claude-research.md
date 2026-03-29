# Research: 13-reddit-engine

## Sources
- Codebase: `reddit-monitor.js`, `WORKFLOW-CHANGES.md`, `PROMPT-WORKFLOW-FRAMEWORK.md`, NocoDB schema
- Prior research: `research-results/` and `research-results-r2/` (10 files, 5 LLM models)

---

## 1. Current State of reddit-monitor.js

**File**: `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js`

### What exists (stubs only — nothing actually runs):
- `SUBREDDITS`: 5 hardcoded (`wallstreetbets`, `stocks`, `investing`, `SecurityAnalysis`, `stockmarket`)
- `SEARCH_KEYWORDS`: 11 keywords (insider buying, Form 4, CEO bought, etc.)
- `buildSearchQueries()`: combines keywords + tickers
- `filterByScore()`: filters posts by minimum score threshold
- `draftComment()`: builds Claude Sonnet prompt + returns `{ prompt, maxTokens: 200 }` — does NOT call Claude
- `validateComment()`: checks sentence count (3-5), no URLs, no brand names — word count NOT checked
- `logComment()`: creates a log record object — does NOT persist to NocoDB

### What does NOT exist (all gaps):
- No Reddit OAuth implementation (no token fetch, no API calls)
- No NocoDB integration (logComment is a stub)
- No Claude API calls (draftComment builds prompt only)
- No rate limiting / daily caps
- No tone matching per subreddit
- No reply structure rotation
- No timing delays
- No upvoting
- No "Edit: update" scheduled jobs
- No day skipping
- No `buildDailyThreadComment()` (CAT 5)
- No `buildDDPost()` (CAT 6)
- No Imgur integration

### Existing test file:
`ryan_cole/insiderbuying-site/n8n/tests/reddit-monitor.test.js` — exists, likely testing stubs

### How invoked:
n8n Code node or HTTP Request node — NOT running currently. Module exports only.

---

## 2. Gap Analysis from WORKFLOW-CHANGES.md

**File**: `ryan_cole/insiderbuying-planning/WORKFLOW-CHANGES.md`

### CAT 4 — Reddit Replies (11 gaps):

| Gap | Problem | Fix |
|-----|---------|-----|
| 4.1 | Tone identical for all subs | SUBREDDIT_TONE_MAP with per-sub tone + style |
| 4.2 | Word limit wrong (sentences) | Per-sub word limits (50-200) |
| 4.3 | Missing 3 subreddits | Add ValueInvesting, Dividends, InsiderTrades |
| 4.4 | No structure rotation | 3-structure rotation per sub (stored in NocoDB) |
| 4.5 | No daily cap | Max 10/day total; per-sub limits |
| 4.6 | No reply timing delay | 10-30 min random delay before posting |
| 4.7 | No upvoting | Upvote OP + 2 random comments before reply |
| 4.8 | No "Edit: update" | Schedule edit 2h after post in NocoDB `Scheduled_Jobs` |
| 4.9 | No day skipping | Randomly designate 1-2 skip days/week |
| 4.10 | No anti-pump rule | "Present data only, never recommend buying" |
| 4.11 | Sentence count validation | Replace with word count validation |

### CAT 5 — Reddit Daily Thread (6 gaps): **DOES NOT EXIST**
- 5.1: No `buildDailyThreadComment()`
- 5.2: No pre-market scheduling (7:00-8:30 AM EST)
- 5.3: No template rotation (3 templates)
- 5.4: No weekend recap logic
- 5.5: No 4-5 day/week schedule
- 5.6: No reply-to-replies logic

### CAT 6 — Reddit DD Posts (6 gaps): **DOES NOT EXIST**
- 6.1: No `buildDDPost()`
- 6.2: No Imgur visual upload
- 6.3: No frequency limiter (max 1/3-4 days)
- 6.4: No scheduling (Tue-Thu 10AM-2PM EST)
- 6.5: No follow-up post logic
- 6.6: No crosspost tracking

---

## 3. Framework Design from PROMPT-WORKFLOW-FRAMEWORK.md

**File**: `ryan_cole/insiderbuying-planning/PROMPT-WORKFLOW-FRAMEWORK.md`

### CAT 4 — SUBREDDIT_CONFIG (authoritative design):

```javascript
SUBREDDIT_CONFIG = {
  wallstreetbets: {
    tone: "Casual degen energy. WSB lingo: tendies, regarded, YOLO. Self-deprecating humor. Emoji OK. 50-100 words.",
    wordLimit: [50, 100],
    structures: ['data-then-WSB-conclusion', 'agreement-plus-fun-fact', 'question-about-post-plus-BTW-data']
  },
  ValueInvesting: {
    tone: "Analytical, measured, fundamental focus. P/E multiples, moat, margin of safety. No emojis. 150-200 words.",
    wordLimit: [150, 200],
    structures: ['observation-data-question', 'agreement-however-insight', 'historical-comparison']
  },
  stocks: {
    tone: "Balanced, conversational but informed. 100-150 words.",
    wordLimit: [100, 150],
    structures: ['I-noticed-data-interpretation', 'FWIW-data-take-it-as-you-will', 'context-plus-insider-angle']
  },
  Dividends: { tone: "Conservative, yield-focused.", wordLimit: [100, 150] },
  InsiderTrades: { tone: "Technical, filing-detail focused.", wordLimit: [100, 200] }
}
```

### CAT 4 n8n Workflow (intended):
```
[Every 60 min] → [Fetch new posts from 5 subs]
  → [Filter: keyword match, score>=7, <50 comments, not already replied]
  → [Daily cap check (max 5-7/day)]
  → [FOR EACH post]:
      → [Extract ticker] → [Fetch insider data (NocoDB)]
      → [IF no insider data: SKIP]
      → [Select subreddit config + rotate structure]
      → [Generate reply (Claude Sonnet)]
      → [Validate (word count per sub, no links, no brand)]
      → [Random delay 10-30 min]
      → [Post reply (Reddit API)] → [Upvote OP + 2 others]
      → [Log to NocoDB]
  → [Schedule "Edit: update" job 2h later]
```

### CAT 5 n8n Workflow (intended):
```
[Schedule weekdays 7:00 AM EST] → [shouldPostToday()]
  → [Fetch yesterday's filings score>=6 from NocoDB]
  → [Select top 2-4 filings (mix large+small cap, sectors)]
  → [Rotate template (cycle through 3)]
  → [Generate comment (Code Node template, not AI)]
  → [Find daily discussion thread ID on target sub]
  → [Post to 3-5 daily threads]
  → [Log to NocoDB]
  → [Weekend: aggregate Fri-Sun for Monday recap]
  → [checkAndReplyToThreadReplies 1-2h later]
```

### CAT 6 n8n Workflow (intended):
```
[Weekly: Wed 9 AM] → [Query NocoDB: cluster buys score>=8, not recently covered]
  → [Select best ticker]
  → [Fetch comprehensive data]
  → [Step 1: Generate outline (Claude, 200 tokens)]
  → [Step 2: Generate full DD (Claude, 3000 tokens)]
  → [Step 3: Bear case review (Claude, separate call)]
  → [Step 4: Generate TLDR (Claude)]
  → [Quality gate: 1500-2500 words, bear >400 words]
  → [AI tone check: rate human-likeness 1-10]
  → [Generate visuals (Puppeteer): insider table, price chart, peer radar]
  → [Upload to Imgur (5-8 images)]
  → [Insert image links in markdown]
  → [Post to Reddit]
  → [Post AMA comment 5-10 min after]
  → [Reply-to-replies at 1h and 6h]
```

---

## 4. NocoDB Schema (Relevant Tables)

### Existing: `Reddit_Log`
- `post_url` (TEXT)
- `subreddit` (TEXT)
- `comment_text` (LONGTEXT)
- `status` (SINGLE SELECT: posted/skipped/failed)
- `posted_at` (DATETIME)

### Needed: `Reddit_State` (for Section 2 + 3 + 4)
- `subreddit` (TEXT)
- `reply_structure_index` (INTEGER 0-2) — rotation counter per subreddit
- `skip_days` (JSON) — ["2026-03-24", "2026-03-26"] skip days this week
- `daily_thread_template_index` (INTEGER 0-2)
- `last_daily_thread_date` (DATE)

### Needed: `Scheduled_Jobs` (for "Edit: update" job)
- `type` (TEXT: 'reddit_edit')
- `commentId` (TEXT)
- `subreddit` (TEXT)
- `executeAfter` (DATETIME)
- `status` (TEXT: pending/done/skipped)

### Needed: `Reddit_DD_Posts` (for CAT 6 frequency limiter)
- `ticker` (TEXT)
- `post_url` (TEXT)
- `posted_at` (DATETIME)
- `authenticity_score` (DECIMAL)
- `status` (TEXT: draft/posted)

---

## 5. Reddit API + Anti-Detection Patterns (from prior research)

### Anti-bot key rules from research:
- **Timing between replies**: variable, 10-30 min (not metronomic)
- **Daily cap**: max 17/day soft limit, 25/day before visibility tanks, 50 hard limit. Spec says max 10 total — well within safe zone
- **Format variation**: rotate between data dump / question / contrarian / 1-sentence
- **No identical replies**: never 2+ identical texts in 24h
- **Account hygiene**: mixed activity, not 100% reply-only

### Tone rules for authentic Reddit posts (from research CAT 4 analysis):
- Conversational but informed, never salesman tone
- NEVER: "check my site", "link in bio", "subscribe"
- NEVER: "this is bullish" / "this is bearish" — let reader conclude
- Rhetorical questions OK ("what do insiders know we don't?")
- Confidence tone: "interesting" / "worth noting" not "guaranteed"
- Specific numbers with context ($2.4M at $142, not "significant amount")

### Anti-pump rule (GAP 4.10 — from spec):
Must be added to ALL prompts: "NEVER explicitly recommend buying or say a stock will go up. Present data only. Let data speak."

### Negative few-shot examples (Section 6 from spec):
BAD: "It's worth noting that insider buying activity has increased significantly, which could potentially indicate positive sentiment..." (passive voice, hedge stacking, corporate language)
GOOD: "CEO just dropped $2M on this at these prices. Last 3 times he bought, stock was up 20%+ within 6 months. Make of that what you will." (direct, specific, has personality)

### Anti-AI detection for DD posts:
- After full draft: rate human-likeness 1-10 (second Claude call)
- If < 7: identify 3 specific AI-sounding phrases, rewrite them
- Only post if ≥ 7

---

## 6. Imgur API (from spec + research)

- **Endpoint**: `POST https://api.imgur.com/3/image`
- **Auth**: `Authorization: Client-ID {IMGUR_CLIENT_ID}`
- **Input**: base64-encoded image or URL
- **Response**: `data.link` = direct image URL (e.g., `https://i.imgur.com/abc123.png`)
- **Rate limit**: free tier ~1250 uploads/day per client ID
- **Embed in Reddit markdown**: `[Label](https://i.imgur.com/abc123.png)`
- For CAT 6 only (3-5 visuals: insider transaction table, price chart, peer radar)

---

## 7. Testing Setup (existing)

- Test file: `ryan_cole/insiderbuying-site/n8n/tests/reddit-monitor.test.js`
- Framework: likely Jest (standard for n8n code node testing)
- CommonJS only (per spec constraint)
- Need to mock: Claude API, Reddit API, NocoDB API, Imgur API

### Tests required per spec:
1. `SUBREDDIT_TONE_MAP`: all 5 subs have required fields (tone, wordLimit, style)
2. Word count validation: enforce correct range per subreddit
3. Daily cap: returns false when limit reached (mock NocoDB 10 posts)
4. `buildDailyThreadComment()`: all 3 templates produce valid output with mock data
5. `buildDDPost()`: mock Claude, verify 4-step flow runs in sequence
6. Bear case review: mock Claude returning `authenticity: 4` triggers rewrite
7. Imgur upload: mock Imgur API returns expected URL format

---

## 8. Key Implementation Constraints

- **CommonJS only** — no ES modules, no import/export
- **Claude Sonnet 4.6** for all Reddit content (tone authenticity critical)
- **No URLs in Reddit posts** — strict regex check + prompt instruction
- **No brand names** — no EarlyInsider, earlyinsider.com, any website
- **Daily total cap**: max 10 across ALL subreddits (A10 reduced from 17)
- **Per-subreddit caps**: wallstreetbets=3, ValueInvesting=2, stocks=2, Dividends=1, InsiderTrades=2
- **Reddit OAuth**: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
- **Imgur**: IMGUR_CLIENT_ID (free, Client-ID only)
- **NocoDB**: tables need to exist before code runs (Reddit_State, Scheduled_Jobs, Reddit_DD_Posts)
