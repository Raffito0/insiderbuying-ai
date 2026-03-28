# Spec: 13-reddit-engine

## Purpose
Transform reddit-monitor.js from a single-tone, unlimited-frequency commenting bot into a subreddit-native presence with 5 distinct tones, structured reply rotation, daily caps, and two entirely new content types: daily pre-market threads (CAT 5) and full due-diligence posts (CAT 6).

## Scope
**Files modified**: reddit-monitor.js
**Files created**: None (all in reddit-monitor.js)
**Reference**: WORKFLOW-CHANGES.md CAT 4 (gaps 4.1-4.11), CAT 5 (gaps 5.1-5.6), CAT 6 (gaps 6.1-6.6), PROMPT-WORKFLOW-FRAMEWORK.md CAT 4/5/6

## Constraints
- Claude Sonnet 4.6 for all Reddit content (tone authenticity critical for AI detection)
- CommonJS only
- Reddit API: OAuth tokens via `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`
- Imgur API: free, endpoint `https://api.imgur.com/3/image`, `Authorization: Client-ID {IMGUR_CLIENT_ID}`
- Daily total comment cap: max 8-10 across ALL subreddits (A10: was 17, now reduced)
- Never use "EarlyInsider", "earlyinsider.com", or any URL in Reddit posts/replies

## Sections

### Section 1: SUBREDDIT_TONE_MAP + Word Limits
Add to reddit-monitor.js:

```javascript
const SUBREDDIT_TONE_MAP = {
  wallstreetbets: {
    tone: 'casual_degen',
    wordLimit: { min: 50, max: 100 },
    style: 'WSB lingo (tendies, regarded, YOLO). Self-deprecating humor. Emojis OK (🚀💎). Contrarian is valued.',
    example: 'The CEO literally bought $2M worth last Tuesday. Either he knows something or he\'s more regarded than us 🚀'
  },
  ValueInvesting: {
    tone: 'academic_analytical',
    wordLimit: { min: 150, max: 200 },
    style: 'Measured, fundamental. Reference P/E multiples, moat, margin of safety. No emojis, no hype. Graham/Buffett framing.',
    example: 'Worth noting the CFO purchased $2.8M at a P/E of 14.2, well below the 5-year average of 18.7...'
  },
  stocks: {
    tone: 'balanced_informed',
    wordLimit: { min: 100, max: 150 },
    style: 'Conversational but informed. Balance data with readability. Middle ground between WSB and ValueInvesting.',
    example: 'FWIW, I noticed the CFO bought $1.5M last week. Their track record is solid — 5 of 7 buys were green within 6 months.'
  },
  Dividends: {
    tone: 'conservative_yield',
    wordLimit: { min: 100, max: 150 },
    style: 'Conservative, yield-focused, payout sustainability. Focus on dividend safety, coverage ratio, history.',
    example: ''
  },
  InsiderTrades: {
    tone: 'technical_filing',
    wordLimit: { min: 100, max: 200 },
    style: 'Technical, filing-detail focused. Historical pattern comparison. Mention filing date, form type, amendment if any.',
    example: ''
  }
};
```

Tests: verify each subreddit returns correct tone config.

### Section 2: Reply Structure Rotation + Validation Fixes
Add `getNextReplyStructure(subreddit)` — rotates through 3 structures per subreddit:

```javascript
const REPLY_STRUCTURES = [
  'Q_A_DATA',        // Open with observation/question → answer with data → forward-looking
  'AGREEMENT_BUT',   // Agree with OP → "but, worth noting..." → data point
  'DATA_INTERPRET'   // Lead with data → interpret → engagement question or prediction
];
```

Track rotation counter in NocoDB `Reddit_State` table (per subreddit, persists across runs).

Fix GAP 4.11 — validation now checks WORD count, not sentence count:
```javascript
function validateReply(text, subreddit) {
  const { min, max } = SUBREDDIT_TONE_MAP[subreddit].wordLimit;
  const words = text.split(/\s+/).length;
  return words >= min && words <= max;
}
```

Add GAP 4.10 — anti-pump rule in all prompts: "NEVER explicitly recommend buying or say a stock will go up. Present data only. Let data speak."

### Section 3: Daily Cap + Timing + Engagement
`checkDailyCommentLimit()`:
- Query NocoDB `Reddit_Log` for today's comments (date = today, status = 'posted')
- Per-subreddit limits: wallstreetbets=3, ValueInvesting=2, stocks=2, Dividends=1, InsiderTrades=2
- Total daily cap: max 10 across all subreddits (GAP 4.5, A10 reduced volume)
- If limit reached for a sub: skip that sub's posts, don't skip others

Timing delay (GAP 4.6): after selecting post to reply to, `await sleep(randomBetween(600000, 1800000))` (10-30 min in ms)

Upvoting (GAP 4.7): `upvoteContext(postId, comment1Id, comment2Id)` — upvote original post + 2 random comments before posting own reply.

"Edit: update" job (GAP 4.8): after posting, schedule in NocoDB `Scheduled_Jobs` table: `{type: 'reddit_edit', commentId, executeAfter: now + 2h}`. Separate n8n schedule node processes this queue: if comment has >3 upvotes after 2h, append "\n\nEdit: [stock] has since moved X%."

Day skipping (GAP 4.9): `shouldSkipToday()` — each week, randomly designate 1-2 days as skip days. Store skip days in NocoDB `Reddit_State`. If today is a skip day, return `{skip: true}` immediately.

### Section 4: CAT 5 — Reddit Daily Thread (NEW)
New function `buildDailyThreadComment(data)`:

**3 Templates** (rotate weekly — template index stored in NocoDB):
```javascript
const DAILY_THREAD_TEMPLATES = {
  notable_buys: (data) => `🔍 **Yesterday's Notable Insider Buys:**\n\n${data.filings.map(f =>
    `• **$${f.ticker}** — ${f.insiderName} (${f.role}) bought $${f.valueFormatted} at $${f.price}`
  ).join('\n')}\n\nPattern I'm noticing: ${data.pattern}\n\nAnything here on your watchlist?`,

  confidence_index: (data) => `📊 **Insider Confidence Index: ${data.sentiment}**\n\n${data.stats}\n\nTop move: ${data.topFiling}\n\nWhat's your read on this week's insider activity?`,

  unusual_activity: (data) => `⚡ **Unusual Form 4 Activity — ${data.date}:**\n\n${data.unusualItems.join('\n')}\n\nFirst time seeing this pattern in ${data.sector}. Anyone else tracking this?`
};
```

Scheduling logic:
- `shouldPostDailyThread()` — returns true Mon-Fri, excludes 2 random days/week (designated in NocoDB `Reddit_State.skip_days`)
- Post time: 7:00-8:30 AM EST (jitter ±30 min)
- Target subreddits: r/stocks, r/investing, r/ValueInvesting (rotate through daily discussion threads)
- Find daily discussion thread: search subreddit for "Daily Discussion" or "Daily Thread" posted today, get its ID
- Weekend recap (Sat/Mon): aggregate Fri-Sun activity, use confidence_index template with week summary

Reply-to-replies (GAP 5.6): `checkAndReplyToThreadReplies(commentId)` — 1-2h after posting, check replies, respond to 1-2 questions with data.

### Section 5: CAT 6 — Reddit DD Posts (NEW)
New function `buildDDPost(ticker, data)` — multi-step Claude generation:

**Step 1 — Outline** (Claude, 200 tokens):
```
Write a DD outline for ${{ticker}} on Reddit. You're a retail investor who noticed something unusual in insider data.
Sections: Discovery, Company Brief, Insider Activity Table, Fundamentals, Bull Case (5 catalysts), Bear Case (3 genuine risks), Valuation, What I'm Watching, Positions, TLDR.
```

**Step 2 — Full DD** (Claude, receives outline + data, 3000 tokens):
```
Write the full DD based on the outline. TONE: passionate retail investor discovering something, NOT AI analyst report.
"I was screening Form 4s last week when I noticed..." — make it a story.
The Bear Case (400+ words) must be GENUINELY skeptical, not token.
```

**Step 3 — Bear Case Review** (Claude, separate call):
```
Review this bear case section: [bear_case_text]
Is it genuine skepticism or token acknowledgment? If token, rewrite with real risks.
Rate authenticity 1-10. If < 7, provide rewritten version.
```

**Step 4 — TLDR Generation** (Claude, receives full draft):
```
Write a 3-4 bullet TLDR for this DD post. Each bullet must be specific (ticker, numbers, dates). No vague statements.
```

Quality gate (before posting):
- Word count: 1500-2500 total
- Bear case: > 400 words
- TLDR: present, specific
- AI detection: Claude rates authenticity 1-10, retry if < 7

Imgur image upload:
- Generate 3-5 visuals via `visual-templates.js` (insider transaction table, price chart, peer radar)
- Upload each to Imgur: `POST https://api.imgur.com/3/image` with `Authorization: Client-ID {id}`
- Get `data.link` URLs, embed in post markdown: `[Insider Transactions](https://i.imgur.com/abc123.png)`

AMA comment (GAP 6.2 D5.2): 5-10 min after posting: "Happy to answer questions on the bear case or valuation assumptions — AMA."

Frequency limiter: `checkDDPostLimit()` — query NocoDB `Reddit_DD_Posts`, last DD post date. Skip if < 3 days ago. Max 8/month.

Scheduling: Tuesday-Thursday, 10:00 AM - 2:00 PM EST window (jitter ±45 min).
Target subreddits: r/wallstreetbets (if score ≥ 8 + high conviction), r/stocks (general), r/ValueInvesting (if fundamental-heavy).

Reply-to-replies (GAP 6.6): check 1h and 6h after posting, reply to 2-3 substantive comments.

### Section 6: Anti-AI Detection + Negative Few-Shot
For all Claude calls in reddit-monitor.js, add `NEGATIVE_EXAMPLES` to system prompt (GAP D3.6):

```
BAD EXAMPLE (do NOT write like this):
"It's worth noting that insider buying activity has increased significantly, which could potentially indicate positive sentiment from company leadership regarding future prospects."
— This is AI-sounding: passive voice, hedge stacking, corporate language.

GOOD EXAMPLE:
"CEO just dropped $2M on this at these prices. Last 3 times he bought, stock was up 20%+ within 6 months. Make of that what you will."
— Human: direct, specific, has personality.
```

Add to CAT 4 + CAT 5 + CAT 6 prompts.

Second AI review call (D4.3) for DD posts only:
- After full draft: "Rate this post's human-likeness 1-10. If < 7, identify 3 specific phrases that sound AI-generated and rewrite them."
- Only proceed to post if rating >= 7.

## Test Requirements
- SUBREDDIT_TONE_MAP: all 5 subs have required fields
- Reply word count validation: enforce correct range per subreddit
- Daily cap: returns false when limit reached
- buildDailyThreadComment: all 3 templates produce valid output with mock data
- buildDDPost: mock Claude, verify 4-step flow runs in sequence
- Bear case review: mock Claude returning "authenticity: 4" triggers rewrite
- Imgur upload: mock Imgur API returns expected URL format

## Definition of Done
- 5 subreddit tone configs, each producing tonally correct prompts
- Daily cap enforced (mock NocoDB returns 10 posts → new post skipped)
- Daily thread: 3 templates, 5-day schedule, weekend recap
- DD post: multi-step generation, bear case review, Imgur upload, AMA comment, frequency limiter
- A10: total daily cap is 8-10 (not 17)
- No URLs, no brand names in any Reddit output
