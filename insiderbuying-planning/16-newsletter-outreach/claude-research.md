# Research: 16-newsletter-outreach

## 1. Codebase Findings

### Current File Locations
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/weekly-newsletter.js` — newsletter module
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js` — outreach module
- `ryan_cole/insiderbuying-site/n8n/tests/weekly-newsletter.test.js`
- `ryan_cole/insiderbuying-site/n8n/tests/send-outreach.test.js`

### weekly-newsletter.js — Current State

**Implemented (but stubbed):**
- `gatherWeeklyContent(nocodbApi)` — returns empty arrays, no real queries
- `generateSummaries(content)` — builds subject (40-60 chars), preview, intro, article teasers
- `assembleNewsletter(summaries, content)` — HTML with header, article cards, alert digest, CTA, footer
- `sendViaBeehiiv(html, subject, previewText)` — returns request object (doesn't actually send)

**Missing entirely:** 6-section AI generation, Free/Pro segmentation, A/B subjects, alert performance table, word/link count gates, mobile CSS, referral block.

**Data shape expected from `gatherWeeklyContent`:**
```js
{
  articles: [{title, slug, ticker, verdict_type, meta_description, key_takeaways}],
  topAlerts: [{ticker, significance_score, insider_name, insider_title}],
  dataStudy: null,
  cutoffDate: "YYYY-MM-DD"
}
```

### send-outreach.js — Current State

**Implemented:**
- `selectProspects(prospects, limit=10)` — filters status='found' + email, sorts by priority
- `buildEmailPrompt(prospect, ourArticle)` — Claude Haiku prompt, 150-word limit, 16 banned phrases, enforces "Subject:" prefix
- `validateEmail(text)` — checks word count, banned phrases, CTA presence
- `buildSendPayload(to, subject, body, fromEmail)`
- `buildFollowUpPrompt(prospect, originalSubject)` — single follow-up, 50-75 words
- `checkForFollowUps(logs, daysSince=5)` — checks Outreach_Log for 5-day threshold only
- `logEmail(prospectId, emailType)` — creates NocoDB Outreach_Log record

**Missing:** 3-stage sequence (only 1 follow-up exists), word limit still 150 (should be 100-125), only 16/21 banned phrases, no subject "?" enforcement, no Cheerio scraping, no warm-up scaling, no bounce tracking, no email verification, no from-name, no social proof.

**⚠️ CRITICAL BUG:** Current `buildEmailPrompt` includes URL in first email. Spec says NO URLs.

### NocoDB Query Patterns

Tables referenced: `Keywords`, `Articles`, `Financial_Cache`, `Insider_Alerts`, `Outreach_Prospects`, `Outreach_Log`

Field naming: snake_case, ISO timestamps, score fields 0-100 or 1-10, status enums.

Migration status: still using Airtable API in most files. NocoDB target: `NOCODB_API_URL` + `NOCODB_API_TOKEN`.

### Resend/Email Sending Pattern (from deliver-alert.js — fully implemented reference)

```js
POST https://api.resend.com/emails/batch
Authorization: Bearer {RESEND_API_KEY}
Body: [{from, to, subject, html, text}, ...]
// Chunked at 100 emails, 200ms between chunks
```

### Testing Setup

**Two frameworks in use (mixed):**
- `package.json` has jest config: `testEnvironment: 'node'`, `testMatch: ['**/tests/**/*.test.js']`
- Some test files use `require('node:test')` + `require('node:assert/strict')` — native Node test runner
- New tests should follow the existing pattern in `weekly-newsletter.test.js` (check which framework it uses)

Test conventions: pure functions, `jest.fn()` / `mockResolvedValue()` for mocking, `describe()` → `it()` / `test()` nesting.

### Environment Variables

Already in use:
- `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`
- `RESEND_API_KEY`
- `NOCODB_API_URL`, `NOCODB_API_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Not yet referenced in code (planned):
- `DOMAIN_SETUP_DATE` — for warm-up limit calculation
- `QUICKEMAIL_API_KEY` — QuickEmailVerification free tier

---

## 2. Beehiiv API v2 Findings (Critical Discoveries)

### ⚠️ A/B Subject Testing is NOT Available via API

The spec assumes `POST /v2/publications/{id}/emails` accepts `secondary_subject` for A/B. **This is incorrect.**

- The `email_settings` object has only a single `email_subject_line` field
- A/B testing is **dashboard-only** (Scale/Max plan UI feature)
- **Workaround:** Create two separate posts with different subjects, each sent to a 50% split segment (manual A/B)

### ⚠️ Create Post Endpoint is Enterprise-Only (Beta)

`POST /v2/publications/{publicationId}/posts` is currently in beta and available only to Enterprise plan users. We need to verify the account plan before relying on this endpoint.

### Segment-Based Sending (Free vs Pro)

Two approaches work:
1. `recipients.email.tier_ids` — pass premium tier IDs to target paid subscribers only
2. `recipients.email.include_segment_ids` — use dynamic segments (fetch from `GET /v2/publications/{pubId}/segments`)

To send Free version: omit `tier_ids` (defaults to free subscribers per Beehiiv docs)
To send Pro version: pass `tier_ids` with premium tier IDs

### Referral Block

No API endpoint to embed a referral block. Must be **manually included as HTML** in `body_content`. No structured block type in the `blocks[]` schema.

### Authentication

```
Authorization: Bearer {BEEHIIV_API_KEY}
Base URL: https://api.beehiiv.com/v2/
```

Rate limits: no documented cap; handle 429 with exponential backoff.

### Create Post Payload (if Enterprise access confirmed)

```json
{
  "title": "string",
  "body_content": "string (HTML)",
  "email_settings": {
    "email_subject_line": "string",
    "email_preview_text": "string"
  },
  "recipients": {
    "email": {
      "tier_ids": ["string"],
      "include_segment_ids": ["seg_..."],
      "exclude_segment_ids": ["seg_..."]
    }
  },
  "status": "draft | confirmed"
}
```

---

## 3. Email Domain Warm-Up Best Practices (2026)

### Recommended Ramp Schedule

| Period | Emails/Day | Notes |
|--------|-----------|-------|
| Days 1–3 | 5 | Internal / clean contacts only |
| Days 4–7 | 5–10 | Business hours, consistent timing |
| Week 2 (Days 8–14) | 10–25 | Monitor bounces daily |
| Week 3 (Days 15–21) | 25–50 | Begin light cold outreach |
| Week 4+ (Days 22–30) | 50–100 | Scale toward target |
| Day 30+ | 150–500 | Only if all metrics healthy |

Rule: never more than double volume in a day; safer = +20% per day max.

### Bounce/Spam Thresholds

| Metric | Safe | Warning | Stop |
|--------|------|---------|------|
| Hard bounce rate | < 2% | 2–3% | > 3% → pause, clean list |
| Spam complaint rate | < 0.08% | 0.08–0.3% | > 0.3% → Gmail will reject |
| Inbox placement | > 90% | 80–90% | < 80% → reduce volume |

### Gmail + Outlook 2025–2026 Changes

**Both now require (enforced):**
- SPF + DKIM + DMARC must be configured BEFORE warm-up starts (not after)
- DMARC minimum: `p=none` with `rua=` reporting address
- One-click `List-Unsubscribe` header required for bulk (5k+/day) senders
- Spam complaint ceiling: **0.3%** (hard limit — exceeding triggers rejections)
- Microsoft: non-compliant messages → Junk folder (active since May 5, 2025)

### Best Sending Days/Times (B2B)

- **Best days:** Tuesday, Wednesday, Thursday (matches spec's Tue-Thu 9-11 AM constraint)
- **Best time:** 9:00–11:30 AM recipient timezone, or 1–3 PM secondary
- **Never:** Monday morning, Friday afternoon, weekends during warm-up

### Implementation Implication for Spec

The spec's `getWarmupLimit()` function uses a simplified 3-tier approach (< 14 days = 5, < 28 days = 20, max = 50). This aligns with industry practice but is conservative — real services go to 100 by day 30. The spec's approach is safer for a new domain.

---

## 4. Testing Notes

Since the spec includes explicit test requirements (unit tests for each module), tests should:
- Mock NocoDB with `jest.fn()` / `mockResolvedValue()`
- Mock Gemini/DeepSeek API calls
- Mock SMTP/Resend API
- Mock QuickEmailVerification API
- Use date-mocking for `checkFollowUpsDue()` and `isValidSendTime()` tests

Framework preference: check `weekly-newsletter.test.js` to confirm jest vs node:test before writing new tests.

---

## 5. Key Implementation Decisions

1. **A/B Subject Lines:** Cannot use Beehiiv's native A/B API. Use manual A/B: create two separate posts sent to 50/50 subscriber segments. OR: track subjectA/subjectB in NocoDB, always send subjectA, use NocoDB analytics to compare open rates manually.

2. **Beehiiv Enterprise check:** If account is not Enterprise, `POST /posts` endpoint will 403. Plan must include fallback: send via Resend directly to subscriber list if Beehiiv unavailable.

3. **DeepSeek vs Claude Haiku:** `send-outreach.js` currently prompts Claude Haiku. Spec says to rewrite email prompt for 100-125 words (not switch AI providers). Newsletter uses DeepSeek (single call for 6 sections).

4. **Follow-up tracking:** Current code tracks in `Outreach_Log`. Spec requires `followupCount` field on `Outreach_Prospects` directly. New implementation should add this field to NocoDB schema.

5. **`DOMAIN_SETUP_DATE` env var:** Used by `getWarmupLimit()`. Must be a date string (e.g. `2026-03-15`). Days since = `Date.now() - new Date(DOMAIN_SETUP_DATE)`.
