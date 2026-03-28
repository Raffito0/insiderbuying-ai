# Spec: 14-x-engine

## Purpose
Upgrade X/Twitter from text-only, generic content to a data-rich multimedia presence. x-engagement.js gets 3-archetype rotation, real filing data injection, media cards, and engagement farming. x-auto-post.js gets 4 format rotation, media always attached, 4 daily time slots, and quote-retweet scheduling.

## Scope
**Files modified**: x-engagement.js, x-auto-post.js
**Reference**: WORKFLOW-CHANGES.md CAT 7 (gaps 7.1-7.11), CAT 8 (gaps 8.1-8.11), PROMPT-WORKFLOW-FRAMEWORK.md CAT 7/8

## Constraints
- Claude Sonnet for CAT 7 (x-engagement.js) — replies to high-follower accounts, tone matters
- DeepSeek for CAT 8 (x-auto-post.js) — own posts, data does the work
- X API v2: `POST /2/tweets` for posting, `POST /1.1/media/upload` for media upload
- twitterapi.io List polling: `GET /1.1/lists/statuses.json?list_id={id}&count=200`
- Character limits: replies 150-220 chars (validated), posts 280 chars max
- Max emojis: 1 per reply, 2 per post
- Daily caps: replies ≤ 15-20/day, posts = exactly 4/day (reduced from 10)

## Sections

### Section 1: x-engagement.js — Data Enrichment
Fix GAP 7.2: inject full filing context into prompt.

Add `buildFilingContext(tweet)` — extract ticker from tweet → query NocoDB for recent filings:
```javascript
async function buildFilingContext(tweet) {
  const ticker = extractTicker(tweet.text); // $TICKER pattern
  if (!ticker) return null;
  const filings = await nocodb.list('Insider_Alerts', {
    where: `(ticker,eq,${ticker})~and(filed_at,gt,${sevenDaysAgo})`,
    sort: '-filed_at', limit: 3
  });
  if (!filings.length) return null;
  return {
    ticker,
    insiderName: filings[0].insider_name,
    insiderRole: filings[0].role,
    transactionValue: filings[0].value_formatted, // "$2.4M"
    transactionDate: filings[0].filed_at,
    priceAtPurchase: filings[0].price_per_share,
    trackRecord: filings[0].historical_return ?? null, // "+23% avg"
    clusterCount: filings.length // 1-3
  };
}
```

If no filing data found for tweet's ticker → SKIP reply (never reply without data).

### Section 2: x-engagement.js — 3 Archetype Prompts
Replace single generic prompt with rotation. Track archetype counter in NocoDB `X_State` table.

```javascript
const REPLY_ARCHETYPES = {
  data_bomb: {
    weight: 0.4,
    systemPrompt: `You are a data analyst who drops precise insider trading data with minimal commentary.
Style: Lead with data immediately. No greeting. Specific numbers always. End with 1 brief interpretation or prediction.
${NEGATIVE_EXAMPLES}`,
    example: '$NVDA CEO bought $5M just 2 weeks ago. His last 5 buys averaged +23%. Watching for $200 📈'
  },
  contrarian: {
    weight: 0.3,
    systemPrompt: `You are a data-driven contrarian who politely challenges conventional takes with insider data.
Style: "Interesting, but..." or "Worth noting..." — respectful disagreement. Data speaks louder than opinion.
${NEGATIVE_EXAMPLES}`,
    example: 'Interesting take. Worth noting the CEO just bought $5M at these exact levels 🤔'
  },
  pattern: {
    weight: 0.3,
    systemPrompt: `You are a pattern recognition trader who identifies recurring insider buying setups.
Style: "This fits a pattern..." → historical comparison → forward-looking watch.
${NEGATIVE_EXAMPLES}`,
    example: 'Classic pre-earnings positioning. Same pattern in NVDA, AMD before their beats 📊'
  }
};
```

Weighted random selection (not pure rotation — weights ensure 40/30/30 distribution over time).

Account tone adaptation (GAP 7.6): `ACCOUNT_TONE_MAP` — for known accounts (e.g., @stocktwits, @tradingview), adjust formality. Store in NocoDB `X_Account_Tones` or inline config object. Default: balanced.

### Section 3: x-engagement.js — Validation + Caps + Timing
Fix GAP 7.1 — character enforcement:
```javascript
function validateReply(text) {
  const len = text.length;
  if (len < 150 || len > 220) return { valid: false, error: `${len} chars, need 150-220` };
  const emojiCount = (text.match(/\p{Emoji}/gu) || []).length;
  if (emojiCount > 1) return { valid: false, error: `${emojiCount} emojis, max 1` };
  if (text.includes('http') || text.includes('www.') || text.includes('.com')) {
    return { valid: false, error: 'no links allowed in replies' };
  }
  if (!text.match(/\$[A-Z]{1,5}/)) return { valid: false, error: 'no $CASHTAG' }; // GAP 7.3
  return { valid: true };
}
```

Daily cap (GAP 7.7): query NocoDB `X_Engagement_Log` for today → skip if ≥ 15 replies.

Timing delay (GAP 7.8): after tweet selection, sleep `randomBetween(180000, 300000)` ms (3-5 min) before posting.

Engagement farming (GAP 7.10): before posting reply:
1. Like original tweet: `POST /2/users/{my_id}/likes` with `{tweet_id}`
2. Like 2-3 other replies on the thread (random selection from thread replies)
3. Wait 30-60s
4. Then post own reply

### Section 4: x-engagement.js — Media Attachment
Fix GAP 7.4: attach SEC filing screenshot 40% of the time.

```javascript
async function maybeAttachMedia(filingContext) {
  if (Math.random() > 0.4) return null;
  // Generate Template 2 (Filing Mini Card) from visual-templates.js
  const { templates } = require('./visual-templates'); // built in unit 11
  const pngBuffer = await templates.renderTemplate(2, filingContext);
  // Upload to X media
  const mediaId = await uploadMediaToX(pngBuffer);
  return mediaId;
}

async function uploadMediaToX(buffer) {
  // POST https://upload.twitter.com/1.1/media/upload.json
  // Multipart: media = base64(buffer), media_type = 'image/png'
  // Returns: media_id_string
}
```

Pass `media_ids: [mediaId]` in `POST /2/tweets` body when mediaId is non-null.

### Section 5: x-auto-post.js — 4 Format Rotation + Media
Fix GAP 8.1: replace single template with 4 formats.

```javascript
const POST_FORMATS = {
  breaking_alert: { // 9:30 AM slot
    generate: (data) => buildBreakingAlert(data), // DeepSeek
    mediaTemplate: 1, // Data Card
  },
  thread: { // 12:00 PM slot — 3-tweet thread
    generate: (data) => buildThread(data),
    mediaTemplate: null,
  },
  market_commentary: { // 15:30 PM slot
    generate: (data) => buildCommentary(data),
    mediaTemplate: 9, // Market Movers card
  },
  engagement_poll: { // 18:00 PM slot
    generate: (data) => buildPoll(data),
    mediaTemplate: null,
  }
};
```

`buildBreakingAlert(data)` — DeepSeek prompt from PROMPT-WORKFLOW-FRAMEWORK.md CAT 8 Format 1.
`buildThread(data)` — 3-tweet array: hook → data → actionable + question. Thread posting: post tweet 1, reply tweet 2 to tweet1, reply tweet 3 to tweet2.
`buildCommentary(data)` — market context + 2-3 insider data points.
`buildPoll(data)` — use X API v2 `poll` object: `{options: [{label: "Rally"}, {label: "Crash"}, {label: "Sideways"}, {label: "Buy the dip"}], duration_minutes: 1440}`

Fix GAP 8.4: `MAX_DAILY_POSTS = 4` (was 10).
Fix GAP 8.10: remove "significance X/10 signal" jargon from all prompts.
Fix GAP 8.11: rotate templates — track last used format, always pick different.

### Section 6: x-auto-post.js — Timing + Threading + Quote-Retweet
Fix GAP 8.5 — 4 time slots with jitter:
```javascript
const POST_SLOTS = [
  { hour: 9,  minute: 30, jitter: 15 }, // market open
  { hour: 12, minute: 0,  jitter: 20 }, // midday
  { hour: 15, minute: 30, jitter: 15 }, // pre-close
  { hour: 18, minute: 0,  jitter: 30 }, // after-hours
];
// n8n: 4 separate Schedule Triggers, one per slot
// Each trigger passes slotIndex (0-3) to determine format
```

Fix GAP 8.7 — quote-retweet scheduling:
After posting any tweet, add to NocoDB `X_Scheduled_Jobs`:
`{tweet_id, type: 'quote_retweet', execute_after: now + randomBetween(7200000, 10800000)}` (2-3h)

Separate n8n Schedule (every 15 min): process `X_Scheduled_Jobs` queue:
- Find due jobs
- For quote-retweet: check if original tweet got > 20 likes (skip if too low engagement)
- Build quote: "Update: [$ticker] has since moved X% since this buy. Here's what to watch..."
- POST `/2/tweets` with `quote_tweet_id`

Fix GAP 8.6 — link validation: before posting, reject if text contains `http` or `www.`. Log error, retry without link.

Media always attached for breaking_alert and market_commentary (GAP 8.2):
```javascript
const pngBuffer = await templates.renderTemplate(formatConfig.mediaTemplate, postData);
const mediaId = await uploadMediaToX(pngBuffer);
// Include in tweet body
```

## Test Requirements
- extractTicker: 10 tweet samples, correct $CASHTAG extraction
- validateReply: char count 150-220 enforced, >1 emoji fails, no link enforced, $CASHTAG required
- archetype selection: weighted distribution (40/30/30) over 100 random calls
- daily cap: mock NocoDB returns 15 posts → new reply skipped
- timing delay: mock sleep, verify called with correct range
- media upload: mock X API, verify correct multipart format
- quote-retweet scheduler: mock NocoDB, verify correct job created after post

## Definition of Done
- Replies: 150-220 chars enforced, $CASHTAG always present, filing data always injected or skip
- 3 archetype rotation with correct weights
- Daily reply cap ≤ 15-20
- Timing delay 3-5 min before reply
- Posts: MAX_DAILY = 4, 4 formats rotating, media for breaking+commentary
- Quote-retweet jobs created after each post
- All existing x-engagement.test.js and x-auto-post.test.js pass
