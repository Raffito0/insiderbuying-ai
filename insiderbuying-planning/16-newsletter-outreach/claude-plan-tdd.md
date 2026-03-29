# TDD Plan: 16-newsletter-outreach

## Testing Setup

**Framework:** Jest with Node test environment (existing project config in `package.json`)
**Test files:** `n8n/tests/weekly-newsletter.test.js` and `n8n/tests/send-outreach.test.js` (both exist — extend them)
**Mocking pattern:** `jest.fn()` / `mockResolvedValue()` / `mockRejectedValue()`
**Run:** `npm test` from `insiderbuying-site/`

Write tests BEFORE implementing each section. Each section below specifies what tests to write first.

---

## Module 1: weekly-newsletter.js

### Section 1 — Real Data Layer

Write these tests first (all mocking NocoDB client with `jest.fn()`):

- `gatherWeeklyContent` calls the correct NocoDB table (`Insider_Alerts`) with `score >= 7` filter and 7-day date range
- `gatherWeeklyContent` calls `Articles` table with 7-day filter
- `gatherWeeklyContent` calls `Insider_Alerts` for 7-14 days ago for performance data
- `computeAlertPerformance` maps alerts to `{ ticker, return, winner }` shape using mocked Finnhub responses
- `computeAlertPerformance` handles Finnhub failure for one alert gracefully (uses `Promise.allSettled` — other alerts still computed)
- `getUpcomingEarnings` returns cached data when `Financial_Cache` has a fresh entry (< 24h old)
- `getUpcomingEarnings` calls Alpha Vantage API when cache is missing or stale
- `getUpcomingEarnings` writes result to `Financial_Cache` after fetching
- `gatherWeeklyContent` returns all four fields with correct types (arrays + optional)

### Section 2 — 6-Section AI Generation

Write these tests first (mocking DeepSeek client):

- `generateNewsletter` calls DeepSeek exactly once with all 4 data inputs injected into prompt
- `generateNewsletter` strips markdown code fences (` ```json ``` `) before `JSON.parse`
- `generateNewsletter` returns an object with `sections.s1` through `sections.s6_pro` and `subjectA`, `subjectB`
- `generateNewsletter` retries on malformed AI JSON (mock first call returns invalid JSON, second returns valid) — asserts retried and resolved
- `generateNewsletter` retries on missing section keys (mock returns `{ sections: { s1: "" } }`) — asserts retried
- `generateNewsletter` sends Telegram alert and throws after 3 consecutive AI failures
- `generateNewsletter` injects empty-state prefix when `topAlerts` is an empty array
- `generateNewsletter` prunes alerts to 5 max and earnings to 10 max before sending to AI

### Section 3 — Quality Gate, Segmentation, and Send

Write these tests first:

- Word count gate: mock AI response with plain text joining to 800 words → assert error thrown containing word count
- Word count gate: 1200 words → assert no error
- Word count gate: 1500 words → assert error thrown
- Link count gate: assembled HTML with 8 `<a href` occurrences → assert error thrown
- Link count gate: 7 links → assert no error
- Free version HTML contains s1, s2, s3 content; does NOT contain s4 or s5 content
- Free version HTML contains upgrade CTA; Pro version HTML does NOT
- Pro version HTML contains `{{rp_refer_url}}` in the referral block
- Both versions include top-3 alert table with `ticker`, `insider_name`, `total_value`, `score` columns
- Both versions include `<meta name="viewport"` and `@media (max-width: 480px)` CSS
- Beehiiv send called with `email_settings.email_subject_line = subjectA` (not subjectB)
- Beehiiv `status: 'draft'` response triggers Resend fallback
- Beehiiv 403 response triggers Resend fallback
- Resend fallback called with chunked batches of max 500 recipients
- `subjectA` and `subjectB` logged to NocoDB after send

---

## Module 2: send-outreach.js

### Section 4 — Email Rewrite + Scraping

Write these tests first:

- `buildEmailPrompt` word count: result between 100–125 words
- `buildEmailPrompt` does NOT include any URL (`http://` or `https://`) in the email body
- `buildEmailPrompt` includes social proof phrase "1,500+" in the body
- `buildEmailPrompt` includes "Ryan from EarlyInsider" in the from name
- `buildEmailPrompt` includes opt-out line ("Reply 'stop'" or similar)
- `validateEmail` rejects emails where subject does not match `/\?/` regex (no question mark)
- `validateEmail` accepts subject ending with "?" or containing "?" anywhere
- `validateEmail` is case-insensitive: banned phrase "JUST WANTED TO REACH OUT" triggers failure
- All 21 banned phrases individually trigger `validateEmail` failure (parameterized test)
- `scrapeRecentArticle` returns `{ title, url }` from HTML blog with `article:first-of-type a` structure
- `scrapeRecentArticle` uses `xmlMode: true` and `item > title` selector when Content-Type is `application/xml`
- `scrapeRecentArticle` returns `null` gracefully (no throw) when scraping fails or selector finds nothing
- `buildEmailPrompt` includes article title when `last_article_title` is set on prospect
- `buildEmailPrompt` generates valid email without article when `last_article_title` is null
- AI retry loop: mock AI returning banned phrase twice, clean email third → assert sent on third attempt

### Section 5 — 3-Stage Follow-Up Sequence

Write these tests first:

- `checkFollowUpsDue` selects prospect with `sent_at` 5 days ago and `followup_count == 0` as FU1
- `checkFollowUpsDue` selects prospect with `sent_at` 10 days ago and `followup_count == 1` as FU2
- `checkFollowUpsDue` selects prospect with `sent_at` 16 days ago and `followup_count == 2` as FU3
- `checkFollowUpsDue` does NOT select prospect with `followup_count == 99` (cancelled)
- `checkFollowUpsDue` does NOT select prospect with `replied == true`
- `checkFollowUpsDue` uses threshold logic: `days >= 5` selects FU1 (not just exactly day 5)
- FU1 send payload includes `In-Reply-To: <{last_resend_id}>` header
- FU1 send payload includes `References: <{last_resend_id}>` header
- FU1 subject is `Re: {original subject}`
- FU2 send payload does NOT include `In-Reply-To` header (new thread)
- FU2 subject does NOT start with "Re:"
- FU3 send payload includes `In-Reply-To` header (same thread)
- `cancelFollowUps` sets `followup_count = 99` on the given prospect
- Initial send stores Resend response `id` in `Outreach_Prospects.last_resend_id`

### Section 6 — Warm-Up, Verification, and Bounce Monitoring

Write these tests first:

- `getWarmupLimit(0)` returns 5
- `getWarmupLimit(13)` returns 5
- `getWarmupLimit(14)` returns 20
- `getWarmupLimit(27)` returns 20
- `getWarmupLimit(28)` returns 50
- `getWarmupLimit(60)` returns 50
- Module startup throws a clear error when `DOMAIN_SETUP_DATE` env var is missing
- `isValidSendTime()`: Tuesday 10 AM Eastern → true (mock `Intl.DateTimeFormat`)
- `isValidSendTime()`: Monday 10 AM Eastern → false
- `isValidSendTime()`: Wednesday 9 AM Eastern → true
- `isValidSendTime()`: Wednesday 8 AM Eastern → false
- `isValidSendTime()`: Wednesday 12 PM Eastern → false
- `isValidSendTime()`: Saturday 10 AM Eastern → false
- `verifyEmail()`: mock API returning `result: 'valid'` → returns true, send proceeds
- `verifyEmail()`: mock API returning `result: 'invalid'` → returns false, updates prospect `status='invalid'`, skips send
- `verifyEmail()`: mock API error → returns true (proceed, don't block on unknown)
- `getDailySentCount()`: queries `Outreach_Daily_Stats` for today's UTC date, returns `sent_count`
- Send stops when `sent_count >= warmup limit` for today
- Bounce rate alert: mock `sent_count=100`, `bounced_count=6` for today → assert Telegram API called
- Bounce rate: `bounced_count=4` → Telegram NOT called
- Daily bounce polling function: mock Resend `GET /emails/{id}` returning `last_event: 'bounced'` → updates prospect `status='bounced'`, sets `followup_count=99`
