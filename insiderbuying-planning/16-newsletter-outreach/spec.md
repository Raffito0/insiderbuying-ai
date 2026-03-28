# Spec: 16-newsletter-outreach

## Purpose
Complete the newsletter from a stub with empty data arrays into a full 6-section, AI-written weekly email with A/B subject lines and Free/Pro segmentation. Upgrade outreach from a single-email, no-follow-up approach into a professional 3-stage sequence with domain warm-up, Cheerio prospect scraping, and bounce tracking.

## Scope
**Files modified**: weekly-newsletter.js, send-outreach.js
**Reference**: WORKFLOW-CHANGES.md CAT 11 (gaps 11.1-11.16), CAT 12 (gaps 12.1-12.15), PROMPT-WORKFLOW-FRAMEWORK.md CAT 11/12

## Sections

### Section 1: weekly-newsletter.js — Real Data Layer
Fix GAP 11.1: implement `gatherWeeklyContent()` with real NocoDB + Supabase queries:

```javascript
async function gatherWeeklyContent() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();

  // Top scored alerts (for Move of the Week + Alert Table)
  const topAlerts = await nocodb.list('Insider_Alerts', {
    where: `(filed_at,gt,${weekAgo})~and(score,gte,7)`,
    sort: '-score', limit: 10
  });

  // Published articles this week
  const articles = await nocodb.list('Articles', {
    where: `(published_at,gt,${weekAgo})`,
    sort: '-published_at', limit: 5
  });

  // Alert performance (30-day returns for alerts sent last week)
  const prevWeekAlerts = await nocodb.list('Insider_Alerts', {
    where: `(filed_at,gt,${twoWeeksAgo})~and(filed_at,lt,${weekAgo})`,
    sort: '-score', limit: 5
  });
  const performance = await computeAlertPerformance(prevWeekAlerts);

  // Upcoming earnings from Alpha Vantage cache
  const upcomingEarnings = await getUpcomingEarnings(14); // next 14 days

  return { topAlerts, articles, performance, upcomingEarnings };
}
```

`computeAlertPerformance(alerts)`: for each alert, fetch 30-day return from Finnhub, compute: `{ ticker, return: "+12%", winner: true }`.

### Section 2: weekly-newsletter.js — 6-Section AI Generation
Fix gaps 11.2-11.8: rewrite `buildEmailTemplate()` to use AI for all 6 sections.

Single DeepSeek call with all data injected (efficient — one AI call for entire newsletter):

**Prompt** (from PROMPT-WORKFLOW-FRAMEWORK.md CAT 11):
```
Write a weekly insider trading newsletter. Data context:
- Best alert this week: {{topAlerts[0]}}
- Top 5 alerts: {{topAlerts.slice(0,5)}}
- Published articles: {{articles}}
- Last week's performance: {{performance}}
- Upcoming earnings: {{upcomingEarnings}}

Write ALL 6 SECTIONS:

SECTION 1 — OPENING HOOK (100-150 words):
Personal observation. "This week I noticed..." Tell a story. First-person. Don't list data yet.

SECTION 2 — INSIDER MOVE OF THE WEEK (200-250 words):
Deep dive on {{topAlerts[0].ticker}}. Setup, the buy, track record, what to watch. Make it feel exclusive.

SECTION 3 — THE SCORECARD (150-200 words):
Last week's alert performance. Brutally honest: winners AND losers. "Best: $TICKER +12%. Worst: $TICKER -8%."
Explain why the loser failed — don't hide it.

SECTION 4 — PATTERN RECOGNITION (150-200 words):
Patterns across this week's data. Sector rotation? Pre-earnings cluster? Repeat buyers?

SECTION 5 — WHAT I'M WATCHING (100-150 words):
3-4 SPECIFIC events with dates. "NVDA earnings March 28", "Fed meeting April 2", "$MDGL lockup expires April 5".

SECTION 6 — THE WRAP + P.S. (100-150 words):
Main takeaway. Then P.S. (CRITICAL):
{{#if is_pro_version}}
P.S. — Share this newsletter with one person who tracks insider buying. They'll thank you. [Referral link]
{{else}}
P.S. — Pro members saw the ${{topTicker}} alert 3 hours before this email. [Try Pro free for 7 days]
{{/if}}

ALSO GENERATE:
SUBJECT_A: Specific number — e.g. "3 CEOs Bought $15M Last Week — Here's What They Know"
SUBJECT_B: Curiosity gap — e.g. "The Insider Pattern Everyone Missed This Week"

Format response as JSON: {sections: {s1,s2,s3,s4,s5,s6}, subjectA, subjectB}
```

### Section 3: weekly-newsletter.js — Quality Gate + Segmentation + Mobile
Fix GAP 11.10: segmentation — generate TWO HTML versions from same AI content:
- **Free version**: sections 1-3 only + upgrade CTA block + P.S. with upgrade link
- **Pro version**: all 6 sections + referral P.S. + "5 more alerts" link block
- Both sent via Beehiiv API with `segment` tag

Fix GAP 11.11: word count check:
```javascript
const totalWords = countWords(Object.values(sections).join(' '));
if (totalWords < 1000 || totalWords > 1400) throw new Error(`word count ${totalWords} out of 900-1400 range`);
```

Fix GAP 11.12: link count check — count `<a href` occurrences → reject if > 7.

Fix GAP 11.13: mobile CSS:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-size: 16px; font-family: 'Inter', sans-serif; }
  @media (max-width: 480px) { .container { padding: 16px; } }
</style>
```

Fix GAP 11.14: Beehiiv referral section:
```html
<div class="referral-block">
  <p>📤 Share EarlyInsider and earn rewards:</p>
  <a href="{{beehiiv_referral_url}}">Share your link → {{subscriber.referrals}} referrals so far</a>
</div>
```

Fix GAP 11.15: Beehiiv A/B subject test — Beehiiv API `POST /v2/publications/{id}/emails` accepts `subject` and `secondary_subject` for split test.

Fix GAP 11.16: top 3 alerts HTML table:
```html
<table class="alerts-table">
  <tr><th>Ticker</th><th>Insider</th><th>Amount</th><th>Score</th></tr>
  {{#each topAlerts.slice(0,3)}}
  <tr><td>${{ticker}}</td><td>{{insiderName}}</td><td>{{valueFormatted}}</td><td>{{score}}/10</td></tr>
  {{/each}}
</table>
```

### Section 4: send-outreach.js — Email Rewrite + Scraping
Fix GAP 12.1: prompt now enforces 100-125 words (was 150).
Fix GAP 12.4: from name: `"Ryan from EarlyInsider" <ryan@earlyinsider.com>`.
Fix GAP 12.15: inject social proof: "We track 1,500+ SEC insider filings per month."

Fix GAP 12.5 — Cheerio prospect blog scraping:
```javascript
const cheerio = require('cheerio');
async function scrapeRecentArticle(siteUrl) {
  const html = await fetchUrl(siteUrl + '/blog'); // or RSS
  const $ = cheerio.load(html);
  // Find most recent article title + URL
  const firstArticle = $('article:first-of-type, .post:first-of-type, h2 a:first').first();
  return {
    title: firstArticle.text().trim(),
    url: firstArticle.attr('href')
  };
}
```
Cache result in NocoDB `Outreach_Prospects.last_article_title` to avoid re-scraping.

Fix GAP 12.3: validate subject has `?`:
```javascript
if (!email.subject.includes('?')) throw new Error('Subject must be a question');
```

Fix GAP 12.2: expand banned phrases to 21+ (add: "just wanted to reach out", "I stumbled upon", "I am a huge fan", "big fan of your work", "as per our conversation", "circle back", "synergy").

Fix GAP 12.14: confirmed in unit 08 (already removed URL from first email prompt).

### Section 5: send-outreach.js — 3-Stage Follow-Up Sequence
Fix GAP 12.6-12.9: implement 3 follow-up prompts.

`followupCount` field in NocoDB `Outreach_Prospects`: 0=sent initial, 1=follow-up 1 sent, 2=follow-up 2 sent, 3=follow-up 3 sent.

**Follow-up 1 (Day 4-5, same thread, 50-75 words)**:
```
Subject: Re: [original subject]
Body prompt: "Brief check-in on previous note about {{topic}}. One small data point they may find useful: {{new_value_add}}. Happy to chat if interested."
Max 75 words. No URL. No "just following up".
```

**Follow-up 2 (Day 9-10, NEW thread, new angle, 30-50 words)**:
```
Subject: NEW subject line — different angle from original.
Body: "Hi {{name}}, different topic — {{new_angle_about_their_content}}. Would this be useful for your readers?"
Max 50 words. Force new angle (not repeat of initial email).
```

**Follow-up 3 (Day 16, 1 sentence)**:
```
Subject: Re: [original subject]
Body: "Last note from me on this, {{name}} — if timing isn't right, completely understand. The data offer stands whenever you need insider trading coverage."
Exactly 1 sentence after greeting.
```

`checkFollowUpsDue()`: query NocoDB for prospects where `sent_at + followup_days <= now AND followup_count < 3 AND replied = false`.

`cancelFollowUps(prospectId)`: if prospect replies (detected via SMTP inbox check), set `followup_count = 99` (skip all future).

### Section 6: send-outreach.js — Warm-Up + Verification + Bounce
Fix GAP 12.13 — domain warm-up:
```javascript
function getWarmupLimit(domainAge) {
  const daysSinceDomainSetup = domainAge;
  if (daysSinceDomainSetup < 14) return 5;
  if (daysSinceDomainSetup < 28) return 20;
  return 50; // max
}
// Read domain setup date from env var DOMAIN_SETUP_DATE
```

Fix GAP 12.11: daily send limit = min(getWarmupLimit(), 100).

Fix GAP 12.10: day/time filter:
```javascript
function isValidSendTime() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const hour = now.getHours(); // EST
  return [2, 3, 4].includes(day) && hour >= 9 && hour <= 11; // Tue-Thu 9-11 AM
}
```

Fix GAP 12.12 — bounce tracking:
```javascript
// After SMTP send, listen for bounces via Resend webhook (bounce event)
// OR check SMTP mailbox for NDR (Non-Delivery Report) responses
// If bounce: update NocoDB prospect.status = 'bounced', cancel all follow-ups
// Alert if bounce rate for today > 5%: Telegram message
```

Fix GAP 12.4 — email verification before send (QuickEmailVerification free tier):
```javascript
async function verifyEmail(email) {
  // GET https://api.quickemailverification.com/v1/verify?email={email}&apikey={key}
  // Response: {result: 'valid' | 'invalid' | 'unknown'}
  // Only send if result === 'valid'
}
```
`QUICKEMAIL_API_KEY` env var. 100 free verifications/day.

## Test Requirements
- gatherWeeklyContent: mock NocoDB, verify correct fields returned
- AI prompt: verify JSON structure of response (6 sections + 2 subjects)
- Segmentation: verify Free version has only 3 sections, Pro has 6
- Word count gate: mock 800-word response → error thrown
- Link count gate: mock 8-link HTML → error thrown
- A/B subject: verify both subjectA and subjectB different
- Follow-up day detection: mock NocoDB dates, correct follow-up tier selected
- isValidSendTime: all days/hours tested (Tue-Thu 9-11 passes, others fail)
- getWarmupLimit: 3 age brackets produce correct limits
- Bounce rate check: mock 6 bounces out of 100 → Telegram alert triggered

## Definition of Done
- Newsletter: real data from NocoDB, 6 sections AI-written, A/B subjects, Free/Pro segmentation, mobile CSS
- Newsletter word count 1000-1400 enforced, max 7 links enforced
- Outreach: 3 follow-up stages, Cheerio scraping, warm-up limits, email verification, bounce tracking
- No URLs in initial outreach email (confirmed from unit 08)
- All existing tests pass
