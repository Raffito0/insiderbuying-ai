# Implementation Plan: 16-newsletter-outreach

## What We're Building

This unit completes two JavaScript modules in the EarlyInsider content engine:

1. **`weekly-newsletter.js`** — a stub that returns empty arrays and sends nothing gets replaced with a real data-fetching, AI-writing, quality-gated newsletter pipeline that sends two segmented versions (Free and Pro) via Beehiiv
2. **`send-outreach.js`** — a single-email stub with no follow-up gets upgraded into a professional 3-stage cold outreach sequence with domain warm-up ramp, per-prospect blog scraping, and bounce-rate monitoring

Both modules live in `n8n/code/insiderbuying/` and are invoked as n8n Code nodes. They follow the module's established pattern: pure exported functions, CommonJS, no npm modules except those already in devDependencies (`cheerio` is already installed).

---

## Context and Constraints

**Why this matters now:**
- The newsletter pipeline cannot produce real weekly emails until `gatherWeeklyContent()` is wired to NocoDB
- The outreach module currently sends emails with a URL in the first message — a deliverability violation that must be fixed before any real outreach begins
- The domain `earlyinsider.com` is new and hasn't started sending yet, making the warm-up logic high-priority

**Key API constraint:** Beehiiv's A/B subject testing is dashboard-only — the v2 API only accepts a single `email_subject_line`. The plan generates both subject variants (subjectA as the curiosity-gap line to send, subjectB as the number-specific line for future reference) and logs both to NocoDB, but always sends subjectA.

**Beehiiv plan risk:** The Create Post endpoint returns 201 (draft created) on non-Enterprise plans without actually sending. The implementation must check the response body for `status: 'confirmed'` and trigger Resend fallback if the post was only drafted.

**Critical bug in existing code:** The existing `buildEmailPrompt()` in `send-outreach.js` includes a URL in the first email. This must be removed before the module is considered functional — a URL in the initial outreach email is a deliverability violation.

**Imports from other units:** `finnhub-client.js` (built in unit 12) is imported for stock return calculations. No new external clients needed beyond Alpha Vantage (earnings) and QuickEmailVerification (email validation).

---

## Module 1: weekly-newsletter.js

### Section 1 — Real Data Layer

The existing `gatherWeeklyContent(nocodbApi)` is a stub that returns empty arrays. It needs to be replaced with four real NocoDB queries.

The function accepts a NocoDB API client and returns `{ topAlerts, articles, performance, upcomingEarnings }`.

**Top alerts:** Query `Insider_Alerts` for the past 7 days (using UTC timestamps throughout), filter on `score >= 7`, sort by score descending, limit 10. Return the full record including `ticker`, `insider_name`, `total_value`, and `score` fields — these feed the alert table HTML.

**Articles:** Query `Articles` for the past 7 days, sort by `published_at` descending, limit 5.

**Alert performance:** Query `Insider_Alerts` for the previous week (7–14 days ago), limit 5. For each alert, import and use `finnhub-client.js` to fetch the current price and compute the percentage return since filing date. Add 250ms delay between calls to respect Finnhub's free-tier rate limits. Use `Promise.allSettled` so a single failed price lookup doesn't abort the rest. Each alert returns `{ ticker, return: "+12%", winner: bool }`.

**Upcoming earnings:** Check `Financial_Cache` in NocoDB first (cache key: `earnings_next14_YYYY-MM-DD`). If cached and under 24 hours old, return the cached data. Otherwise, call Alpha Vantage's earnings calendar endpoint for the next 14 days, write the result to `Financial_Cache`, then return it.

**Empty state handling:** If `topAlerts` returns an empty array (slow market week), the AI prompt must be told: inject a prefix instruction "No major insider moves this week — focus section 2 on macro trends and market context instead of a specific ticker." Never pass an empty alerts array silently to the AI — it will hallucinate tickers.

### Section 2 — 6-Section AI Generation

The existing `buildEmailTemplate()` assembles hardcoded HTML. Replace it with a single DeepSeek call that generates all content in one shot.

The function receives the data object from Section 1 and sends a single prompt to DeepSeek with all context injected. Before calling, enforce token budget: truncate alerts to 5 max, truncate earnings to 10 events max, to avoid exceeding the model's context window.

The expected response shape is:
```
{
  sections: { s1, s2, s3, s4, s5, s6_free, s6_pro },
  subjectA: string,  // curiosity gap — always sent
  subjectB: string   // specific number — logged only
}
```

**Section descriptions:**
- s1 (Opening Hook): personal first-person observation, 100–150 words, no data yet
- s2 (Move of the Week): deep dive on `topAlerts[0]`, 200–250 words (or macro context if no alerts)
- s3 (Scorecard): last week's performance, winners AND losers with %, 150–200 words
- s4 (Pattern Recognition): sector rotation / pre-earnings patterns, 150–200 words
- s5 (What I'm Watching): 3–4 specific upcoming events with dates, 100–150 words
- s6_free: The Wrap P.S. — invite free subscribers to upgrade
- s6_pro: The Wrap P.S. — referral ask with `{{rp_refer_url}}` merge tag (Beehiiv replaces per-subscriber)

**AI retry loop:** wrap the DeepSeek call in a `maxRetries = 3` loop. Before `JSON.parse()`, strip any markdown code fences (` ```json ``` `) using a regex. If parse fails or the response is missing required section keys, append the error to the prompt and retry. After 3 failures, send a Telegram alert and throw a descriptive error.

### Section 3 — Quality Gate, Segmentation, and Send

**Word count gate:** join all section strings (plain text, not HTML), count words. Throw if outside 1000–1400. Running this on plain text (before HTML wrapping) avoids tag inflation.

**Link count gate:** count `<a href` occurrences in the assembled HTML. Throw if count exceeds 7. Evaluate each variant separately — Free and Pro versions may have different link counts.

After passing gates, assemble two HTML documents from the same AI content:

**Free version:** sections s1–s3 only, plus an upgrade CTA block, plus s6_free P.S. Must include a `List-Unsubscribe` header and a visible unsubscribe link (required for CAN-SPAM compliance when using Resend fallback).

**Pro version:** all 6 sections (s1–s6_pro), plus a referral block using `{{rp_refer_url}}` merge tag (Beehiiv handles per-subscriber replacement), plus a "5 more alerts" link block.

Both versions include mobile-responsive CSS with the Inter font and a 480px media query for container padding. Both versions include the top-3 alert HTML table using `ticker`, `insider_name`, `total_value` (formatted as currency), and `score/10`.

**Sending:** Try `POST https://api.beehiiv.com/v2/publications/{pubId}/posts` for each version:
- Free version: omit `tier_ids`
- Pro version: pass `tier_ids` with premium tier IDs from env (`BEEHIIV_PREMIUM_TIER_IDS`)
- Both use `email_settings.email_subject_line: subjectA`

After a 201 response, check the response body: if `data.status !== 'confirmed'`, the post was drafted only (non-Enterprise plan behavior). In this case, trigger the Resend fallback.

**Resend fallback:** send via Resend batch against subscriber list from NocoDB/Supabase filtered by tier. Chunk at 500 recipients per request (Resend batch limit). Include `List-Unsubscribe` headers. Log which send path was used (Beehiiv vs Resend) and why.

Log `subjectA`, `subjectB`, send path, and send timestamp to NocoDB after sending.

---

## Module 2: send-outreach.js

### Section 4 — Email Rewrite + Prospect Scraping

**Word limit:** reduce from 150 to 100–125 words. Shorter emails have higher reply rates.

**From name:** `"Ryan from EarlyInsider" <ryan@earlyinsider.com>`.

**Social proof line:** inject "We track 1,500+ SEC insider filings per month." into the email body.

**No URLs in initial email:** remove the existing URL from the prompt entirely.

**CAN-SPAM compliance:** the initial email must include a one-line opt-out: "Reply 'stop' to never hear from me again." This is the minimal compliance footer for cold outreach.

**Subject must be a question:** after AI generation, validate with `email.subject.trim().match(/\?/)`. Use regex, not `includes('?')`, to handle trailing whitespace and Unicode question marks. Throw if no match.

**Banned phrases:** expand to 21 phrases. Run check on `email.body.toLowerCase()` (case-insensitive). The 5 additions: "just wanted to reach out", "I stumbled upon", "I am a huge fan", "big fan of your work", "as per our conversation", "circle back", "synergy".

**Cheerio scraping (`scrapeRecentArticle(siteUrl)`):**
Before generating the email, scrape the prospect's blog for their most recent article. Fetch `siteUrl + '/blog'` with a 5-second timeout. Use `cheerio` to try selectors in priority order: `article:first-of-type a`, `.post:first-of-type a`, `h2 a:first-of-type`.

If the response Content-Type is `application/xml` or `text/xml`, load with `cheerio.load(data, { xmlMode: true })` and use the selector `item > title` for RSS feeds.

Return `{ title, url }`. Store the title in `Outreach_Prospects.last_article_title` (cache, avoid re-scraping the same site). If scraping fails entirely, fall back to generating without article personalization — do not skip the prospect.

The article title feeds the email prompt: "I just read your piece: '{title}'. That's exactly the kind of audience we want to reach."

**AI retry loop for outreach emails:** same pattern as newsletter — up to 3 retries with constraint feedback appended. Subject "?" validation, word count check, and banned phrase check all trigger retries before throwing.

### Section 5 — 3-Stage Follow-Up Sequence

The current code has a single follow-up at day 5. Three follow-ups needed at days 5, 10, and 16.

**Schema fields needed (NocoDB migration):**
- `followup_count` INT DEFAULT 0
- `sent_at` DATETIME — timestamp of initial send
- `replied` BOOLEAN DEFAULT false
- `last_resend_id` VARCHAR — Resend email ID of initial send (for threading + bounce polling)
- `last_article_title` VARCHAR — cached from scraping

**Email threading:** when sending the initial email via Resend, store the returned `id` in `Outreach_Prospects.last_resend_id`. When sending FU1 and FU3 (same-thread follow-ups), include these headers in the Resend payload:
```
In-Reply-To: <{last_resend_id}>
References: <{last_resend_id}>
```
Without these headers, "Re:" in the subject is cosmetic only — Gmail and Outlook will not thread the messages.

**`checkFollowUpsDue()`:** query `Outreach_Prospects` where `followup_count < 3 AND replied = false AND sent_at IS NOT NULL`. For each prospect, compute days since `sent_at`. Map to stage using threshold logic (resilient to cron downtime):
- FU1: `days >= 5 AND followup_count == 0`
- FU2: `days >= 10 AND followup_count == 1`
- FU3: `days >= 16 AND followup_count == 2`

**Follow-up 1 (same thread, 50–75 words):**
Subject `Re: {original subject}`. Content: soft check-in with one new small data point. No URL. No "just following up." Includes `In-Reply-To` + `References` headers.

**Follow-up 2 (new thread, 30–50 words):**
Subject is a completely different angle — not "Re:". The prompt instructs the AI: "Write about a completely different angle than the first email. Do not reference it." No threading headers (new thread by design).

**Follow-up 3 (1 sentence, ~25 words):**
Subject `Re: {original subject}`. Body: one sentence after greeting. "Last note from me on this, {name} — the data offer stands whenever insider trading coverage is relevant for your readers." Includes `In-Reply-To` + `References` headers.

**`cancelFollowUps(prospectId)`:** sets `followup_count = 99`. Called by the IMAP polling cron when a reply is detected.

### Section 6 — Warm-Up, Email Verification, and Bounce Monitoring

**`getWarmupLimit(daysSinceDomainSetup)`:**
Returns 5 if days < 14, 20 if days < 28, 50 otherwise. Read `DOMAIN_SETUP_DATE` from env. If the env var is missing, **throw a startup error** — do not default to today, as this would reset the warm-up counter on container restart.

**Daily send limit with cross-run tracking:** check a `Outreach_Daily_Stats` record in NocoDB (key: today's UTC date) for `sent_count`. Compute `remaining = Math.min(getWarmupLimit(days), 100) - sent_count`. If remaining <= 0, skip sending for today. After the send batch, increment `sent_count` by the actual number sent.

**`isValidSendTime()`:** use `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'narrow', hour: 'numeric', hour12: false })` to get the current day and hour in Eastern Time (correctly handling DST). Return true only if day is Tue/Wed/Thu AND hour is 9, 10, or 11.

**`verifyEmail(email)`:** call QuickEmailVerification's free-tier endpoint. Send only if `result === 'valid'`. Mark prospect `status='invalid'` and skip if result is `'invalid'`. If the API returns an error or `'unknown'`, proceed (don't block on uncertainty). `QUICKEMAIL_API_KEY` must be set — throw at startup if missing.

**Bounce handling (asynchronous polling):** email bounces are asynchronous — the Resend API send response only confirms the message is queued, not delivered. Do not attempt synchronous bounce detection from the send response.

Instead: after each send, store the Resend `email_id` in `Outreach_Prospects.last_resend_id`. A **separate daily cron job** (outside this module) polls `GET https://api.resend.com/emails/{id}` for emails sent 24–48 hours ago. If `last_event === 'bounced'`, it updates `status='bounced'` and `followup_count=99` to cancel follow-ups.

**Bounce rate Telegram alert:** the daily cron computes `bounced_count / sent_count` for the past 24 hours using `Outreach_Daily_Stats`. If ratio exceeds 0.05 (5%), send a Telegram message via `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` with the count, ratio, and a recommendation to pause sending.

---

## NocoDB Schema Migration

The following fields must be added to `Outreach_Prospects` before deployment:

```sql
ALTER TABLE Outreach_Prospects
  ADD COLUMN followup_count INTEGER DEFAULT 0,
  ADD COLUMN sent_at DATETIME,
  ADD COLUMN replied BOOLEAN DEFAULT FALSE,
  ADD COLUMN last_resend_id VARCHAR(255),
  ADD COLUMN last_article_title TEXT;
```

New table for daily send tracking:

```sql
CREATE TABLE Outreach_Daily_Stats (
  date DATE PRIMARY KEY,
  sent_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  updated_at DATETIME
);
```

---

## Dependency Notes

No new npm dependencies beyond existing:
- `cheerio` already in devDependencies
- `finnhub-client.js` imported from `../finnhub-client` (unit 12)
- Alpha Vantage, QuickEmailVerification, Resend: plain HTTPS calls with `require('https')`
- DeepSeek: same pattern as existing AI client in `analyze-alert.js`

New env vars to add to `.env.example`:
- `DOMAIN_SETUP_DATE` — required, date string `YYYY-MM-DD`, set to date of first outreach send
- `QUICKEMAIL_API_KEY` — required for email verification
- `BEEHIIV_PREMIUM_TIER_IDS` — comma-separated Beehiiv premium tier IDs for Pro sends

All other vars already in use: `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`, `RESEND_API_KEY`, `NOCODB_API_URL`, `NOCODB_API_TOKEN`, `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

## Testing Strategy

Tests in `n8n/tests/` follow the Jest pattern. Both existing test files have coverage for the old stubs — new tests extend them.

**weekly-newsletter.js tests:**
- `gatherWeeklyContent`: mock NocoDB client, assert query table names and filter parameters; assert return shape includes `topAlerts`, `articles`, `performance`, `upcomingEarnings`
- Empty alerts handling: mock `topAlerts = []` → assert AI prompt contains empty-state prefix instruction
- AI retry loop: mock DeepSeek to return malformed JSON first, then valid — assert it retried and succeeded
- Word count gate: mock AI response with 800 words → assert error thrown with count in message
- Link count gate: mock assembled HTML with 8 links → assert error thrown
- Segmentation: assert Free HTML contains sections 1–3 and upgrade CTA, omits s4/s5; assert Pro HTML contains all 6 sections and `{{rp_refer_url}}`
- A/B subjects: assert subjectA and subjectB are distinct non-empty strings
- Beehiiv draft-only response: mock Beehiiv returning `status: 'draft'` → assert Resend fallback called

**send-outreach.js tests:**
- Follow-up threshold logic: mock prospects at days 5, 10, 16 → assert correct FU stage (1, 2, 3) detected
- `isValidSendTime()`: test all 7 days × representative hours; mock EST timezone; confirm Tue-Thu 9–11 AM returns true, all others false
- `getWarmupLimit()`: days 0, 13, 14, 27, 28, 60 → assert correct limits (5, 5, 20, 20, 50, 50)
- Missing `DOMAIN_SETUP_DATE`: assert startup error thrown
- Subject "?" validation: assert throws on email subject without "?"; passes on subject ending with "?"
- Banned phrases (case-insensitive): each of 21 phrases in mixed case → assert `validateEmail()` failure
- Word count gate: >125 words → assert error
- `verifyEmail()`: mock valid / invalid / unknown responses → send / skip / send respectively
- Bounce rate > 5%: mock `sent_count=100` and `bounced_count=6` in daily stats → assert Telegram alert sent
- Email threading: assert initial send stores Resend ID; assert FU1 and FU3 payloads include `In-Reply-To` header; assert FU2 does NOT include it
- AI retry loop: mock AI returning banned phrase twice, clean email third → assert sent on third attempt

---

## Section Summary

| # | File | Focus |
|---|------|-------|
| 1 | weekly-newsletter.js | Real data layer (NocoDB queries + Alpha Vantage cache + Finnhub performance) |
| 2 | weekly-newsletter.js | 6-section DeepSeek generation with retry loop |
| 3 | weekly-newsletter.js | Quality gates + segmentation + Beehiiv/Resend send |
| 4 | send-outreach.js | Email rewrite (word limit, from name, no URL, Cheerio scraping, retry loop) |
| 5 | send-outreach.js | 3-stage follow-up sequence with SMTP threading headers |
| 6 | send-outreach.js | Warm-up limits + email verification + async bounce polling |
