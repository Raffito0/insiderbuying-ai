# Spec: 16-newsletter-outreach (Complete)

## Context

This unit completes two JavaScript modules in the EarlyInsider (`ryan_cole/insiderbuying-site`) codebase:

1. **`weekly-newsletter.js`** — transform from a stub with empty data arrays into a fully functional 6-section, AI-written weekly email with Free/Pro segmentation sent via Beehiiv (with Resend fallback)
2. **`send-outreach.js`** — upgrade from single-email/no-follow-up into a professional 3-stage cold outreach sequence with domain warm-up, Cheerio prospect scraping, and bounce tracking

---

## Scope

**Files modified:**
- `n8n/code/insiderbuying/weekly-newsletter.js`
- `n8n/code/insiderbuying/send-outreach.js`

**Files imported (don't modify):**
- `n8n/code/insiderbuying/finnhub-client.js` (from unit 12)

**Tests:**
- `n8n/tests/weekly-newsletter.test.js` (already exists — update)
- `n8n/tests/send-outreach.test.js` (already exists — update)

**Schema migration (NocoDB):**
Add to `Outreach_Prospects` table:
- `followup_count` INTEGER DEFAULT 0
- `sent_at` DATETIME
- `replied` BOOLEAN DEFAULT false

---

## Module 1: weekly-newsletter.js

### Section 1: Real Data Layer

Replace the stubbed `gatherWeeklyContent()` with real NocoDB queries.

**Inputs:** `nocodbApi` (client from existing NocoDB integration patterns)

**Queries:**
- `topAlerts`: `Insider_Alerts` where `filed_at > weekAgo AND score >= 7`, sort `-score`, limit 10
- `articles`: `Articles` where `published_at > weekAgo`, sort `-published_at`, limit 5
- `prevWeekAlerts`: `Insider_Alerts` where `filed_at` between `twoWeeksAgo` and `weekAgo`, sort `-score`, limit 5
- `performance`: computed via `computeAlertPerformance(prevWeekAlerts)` — uses `finnhub-client.js` to fetch 30-day price returns for each alert, returns `[{ticker, return: "+12%", winner: bool}]`
- `upcomingEarnings`: call Alpha Vantage API for next 14 days of earnings, cache result in `Financial_Cache` NocoDB table (check cache before calling API to avoid redundant calls)

**Returns:** `{ topAlerts, articles, performance, upcomingEarnings }`

### Section 2: 6-Section AI Generation

Replace `buildEmailTemplate()` with a single DeepSeek call that generates all 6 sections.

**AI model:** DeepSeek (existing client, single call for entire newsletter)

**Prompt inputs:** `topAlerts[0]` (Move of Week), `topAlerts.slice(0,5)`, `articles`, `performance`, `upcomingEarnings`

**Output schema (JSON from AI):**
```json
{
  "sections": { "s1": "", "s2": "", "s3": "", "s4": "", "s5": "", "s6_free": "", "s6_pro": "" },
  "subjectA": "",
  "subjectB": ""
}
```

**6 sections:**
- s1: Opening Hook (100-150 words) — "This week I noticed..." personal observation, no data yet
- s2: Insider Move of the Week (200-250 words) — deep dive on `topAlerts[0].ticker`
- s3: The Scorecard (150-200 words) — last week performance, winners AND losers with %
- s4: Pattern Recognition (150-200 words) — sector rotation / pre-earnings clusters
- s5: What I'm Watching (100-150 words) — 3-4 specific events with dates
- s6: The Wrap + P.S. (100-150 words) — two variants: free (upgrade P.S.) and pro (referral P.S.)

**Subject lines:**
- subjectA: specific number format (e.g. "3 CEOs Bought $15M Last Week — Here's What They Know")
- subjectB: curiosity gap format (stored in NocoDB but NOT sent — always send subjectA)

### Section 3: Quality Gate + Segmentation + Mobile

**Word count gate:** count words in all sections joined. Reject if outside 1000–1400 range (throw error).

**Link count gate:** count `<a href` occurrences in final HTML. Reject if > 7 (throw error).

**Segmentation:** build two HTML versions from same AI content:
- **Free version:** sections 1–3 only + upgrade CTA block + s6_free P.S.
- **Pro version:** all 6 sections + s6_pro referral P.S. + "5 more alerts" link block

**Mobile CSS:** include in both versions:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-size: 16px; font-family: 'Inter', sans-serif; }
  @media (max-width: 480px) { .container { padding: 16px; } }
</style>
```

**Referral block (Pro version only):** HTML-embedded (no API support):
```html
<div class="referral-block">
  <p>Share EarlyInsider and earn rewards:</p>
  <a href="{{beehiiv_referral_url}}">Share your link</a>
</div>
```

**Top 3 alerts HTML table** (both versions):
```html
<table class="alerts-table">
  <tr><th>Ticker</th><th>Insider</th><th>Amount</th><th>Score</th></tr>
  <!-- rows for topAlerts[0..2] -->
</table>
```

**Beehiiv send with Resend fallback:**

Primary: `POST /v2/publications/{pubId}/posts` with:
- `email_settings.email_subject_line`: subjectA
- `recipients.email.tier_ids`: premium tier IDs (Pro version) / omitted (Free version)
- `status: 'confirmed'`

If Beehiiv returns 403 (not Enterprise) or any 4xx/5xx: fall back to Resend batch send to subscriber list from NocoDB/Supabase.

Log `subjectA` + `subjectB` + send result to NocoDB.

---

## Module 2: send-outreach.js

### Section 4: Email Rewrite + Scraping

**Word limit:** 100–125 words (was 150)

**From name:** `"Ryan from EarlyInsider" <ryan@earlyinsider.com>`

**Social proof:** inject into all emails: "We track 1,500+ SEC insider filings per month."

**No URLs in initial email** (remove existing URL from prompt — critical deliverability rule)

**Subject must be a question:** validate `email.subject.includes('?')`, throw if not.

**Banned phrases list:** expand to 21 phrases (current 16 + add: "just wanted to reach out", "I stumbled upon", "I am a huge fan", "big fan of your work", "as per our conversation", "circle back", "synergy")

**Cheerio scraping (`scrapeRecentArticle(siteUrl)`):**
- `cheerio` is already in devDependencies
- Fetch `siteUrl + '/blog'` (or try `/rss` as fallback)
- Extract most recent article: try `article:first-of-type`, `.post:first-of-type`, `h2 a:first`
- Cache result in `Outreach_Prospects.last_article_title` (avoid re-scraping same site)
- Return `{ title, url }`

### Section 5: 3-Stage Follow-Up Sequence

**NocoDB schema:** `Outreach_Prospects` needs `followup_count` (0=initial sent, 1=FU1 sent, 2=FU2 sent, 3=FU3 sent), `sent_at`, `replied`.

**Follow-up 1 (Day 4–5, same thread, 50–75 words):**
- Subject: `Re: [original subject]`
- Body: brief check-in + one new value-add data point
- Rules: no URL, no "just following up", max 75 words

**Follow-up 2 (Day 9–10, NEW thread, 30–50 words):**
- Subject: new angle, NOT "Re:"
- Body: completely different angle from initial email
- Rules: max 50 words, force new angle in prompt

**Follow-up 3 (Day 16, 1 sentence):**
- Subject: `Re: [original subject]`
- Body: exactly 1 sentence after greeting, "last note" tone

**`checkFollowUpsDue()`:** query `Outreach_Prospects` where:
- `sent_at + followup_days <= now`
- `followup_count < 3`
- `replied = false`
- Map by `followup_count` to determine which stage (0→FU1 at day 5, 1→FU2 at day 10, 2→FU3 at day 16)

**`cancelFollowUps(prospectId)`:** set `followup_count = 99` — called by external IMAP cron when reply detected.

### Section 6: Warm-Up + Verification + Bounce

**`getWarmupLimit(daysSinceDomainSetup)`:**
```js
if (daysSinceDomainSetup < 14) return 5;
if (daysSinceDomainSetup < 28) return 20;
return 50;
```
Read `DOMAIN_SETUP_DATE` env var. Compute `daysSinceDomainSetup = (Date.now() - new Date(DOMAIN_SETUP_DATE)) / 86400000`. If `DOMAIN_SETUP_DATE` unset, use today (day 0 → limit 5).

**Daily send limit:** `Math.min(getWarmupLimit(days), 100)`.

**`isValidSendTime()`:** check `Date` in EST timezone. Return true only if `day in [2, 3, 4]` (Tue-Thu) AND `hour >= 9 AND hour <= 11`.

**`verifyEmail(email)` (QuickEmailVerification):**
- `GET https://api.quickemailverification.com/v1/verify?email={email}&apikey={key}`
- Only send if `result === 'valid'`
- `QUICKEMAIL_API_KEY` env var (100 free verifications/day)
- Skip verify (send anyway) if API returns error or unknown

**Bounce handling:**
- After SMTP send error (5xx response from Resend): update `Outreach_Prospects.status = 'bounced'`, set `followup_count = 99`
- After each send batch: compute today's bounce rate = `bounced_today / sent_today`. If > 5%: send Telegram alert (use existing `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
- No Resend webhook needed — detect bounces from SMTP send error codes only

---

## Environment Variables

Required (new):
- `DOMAIN_SETUP_DATE` — date string `YYYY-MM-DD`, set on first outreach send
- `QUICKEMAIL_API_KEY` — QuickEmailVerification API key

Already in use:
- `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`
- `RESEND_API_KEY`
- `NOCODB_API_URL`, `NOCODB_API_TOKEN`
- `FINNHUB_API_KEY` (from unit 12)
- `ALPHA_VANTAGE_API_KEY` (for earnings)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (for bounce alert)

---

## Test Requirements

**weekly-newsletter.js tests:**
- `gatherWeeklyContent`: mock NocoDB client, assert correct fields + date range queries
- AI prompt: mock DeepSeek, verify JSON response has 6 sections + subjectA + subjectB
- Word count gate: mock 800-word AI response → error thrown
- Link count gate: mock HTML with 8 links → error thrown
- Segmentation: Free version has sections 1–3 only; Pro has all 6
- A/B subjects: subjectA and subjectB are different strings

**send-outreach.js tests:**
- Follow-up day detection: mock NocoDB dates, correct follow-up tier (FU1/FU2/FU3) selected
- `isValidSendTime()`: all day/hour combos — Tue-Thu 9-11 passes, all others fail
- `getWarmupLimit()`: 3 age brackets → correct limits (5, 20, 50)
- Subject "?" validation: email without "?" throws error
- Banned phrases: each of 21 phrases causes validation failure
- Bounce rate check: mock 6 bounces out of 100 → Telegram alert triggered
- `verifyEmail()`: mock valid/invalid responses → send / skip accordingly

---

## Definition of Done

- Newsletter: real NocoDB data, 6 AI-written sections, Free/Pro HTML versions, mobile CSS, alert table
- Newsletter: word count 1000–1400 enforced, max 7 links enforced, subjectA always sent, subjectB logged
- Newsletter: Beehiiv send with Resend fallback
- Outreach: 3 follow-up stages, Cheerio blog scraping, warm-up limits, email verification, Telegram bounce alert
- Outreach: NO URL in initial email, from name "Ryan from EarlyInsider", 21 banned phrases
- NocoDB schema migration for Outreach_Prospects documented
- All existing tests pass, new tests cover all requirements above
