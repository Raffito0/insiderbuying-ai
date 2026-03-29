<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-newsletter-data-layer
section-02-newsletter-ai-generation
section-03-newsletter-gates-and-send
section-04-outreach-email-rewrite
section-05-outreach-followup-sequence
section-06-outreach-warmup-and-bounce
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-newsletter-data-layer | - | 02 | Yes (with 04) |
| section-02-newsletter-ai-generation | 01 | 03 | No |
| section-03-newsletter-gates-and-send | 02 | - | No |
| section-04-outreach-email-rewrite | - | 05, 06 | Yes (with 01) |
| section-05-outreach-followup-sequence | 04 | - | No |
| section-06-outreach-warmup-and-bounce | 04 | - | Yes (with 05) |

## Execution Order

1. **section-01-newsletter-data-layer** + **section-04-outreach-email-rewrite** in parallel (independent files)
2. **section-02-newsletter-ai-generation** (after 01)
3. **section-03-newsletter-gates-and-send** (after 02)
4. **section-05-outreach-followup-sequence** + **section-06-outreach-warmup-and-bounce** in parallel (after 04)

## Section Summaries

### section-01-newsletter-data-layer

Replace the stubbed `gatherWeeklyContent()` with real NocoDB queries for top alerts, articles, and previous-week alert performance. Add `computeAlertPerformance()` that imports `finnhub-client.js` and fetches 30-day price returns with rate limiting. Add `getUpcomingEarnings()` that fetches from Alpha Vantage and caches results in NocoDB `Financial_Cache`. Handle empty-state gracefully. Tests use mocked NocoDB client.

**File:** `n8n/code/insiderbuying/weekly-newsletter.js`
**Test file:** `n8n/tests/weekly-newsletter.test.js`

### section-02-newsletter-ai-generation

Replace `buildEmailTemplate()` with a single DeepSeek call generating all 6 sections plus two subject lines. Implement retry loop (max 3 attempts) with constraint feedback appended on failure. Strip markdown code fences before JSON.parse. Inject empty-state prefix when alerts array is empty. Enforce token budget (max 5 alerts, 10 earnings events). Tests mock DeepSeek client.

**File:** `n8n/code/insiderbuying/weekly-newsletter.js`
**Test file:** `n8n/tests/weekly-newsletter.test.js`

### section-03-newsletter-gates-and-send

Add word count gate (1000–1400 words on plain text) and link count gate (max 7 `<a href` per variant). Assemble two HTML versions (Free: sections 1–3 + upgrade CTA; Pro: all 6 + referral block with `{{rp_refer_url}}` merge tag). Both versions include mobile CSS and top-3 alert table. Send via Beehiiv; detect draft-only response and fall back to Resend batch (chunked at 500). Log subjectA + subjectB to NocoDB.

**File:** `n8n/code/insiderbuying/weekly-newsletter.js`
**Test file:** `n8n/tests/weekly-newsletter.test.js`

### section-04-outreach-email-rewrite

Fix the critical deliverability bug (remove URL from initial email prompt). Reduce word limit to 100–125. Add from name, social proof line, and CAN-SPAM opt-out footer. Add subject "?" regex validation. Expand banned phrases to 21 (case-insensitive check). Implement `scrapeRecentArticle()` with Cheerio (HTML + XML/RSS modes, graceful fallback). Add AI retry loop for outreach email generation.

**File:** `n8n/code/insiderbuying/send-outreach.js`
**Test file:** `n8n/tests/send-outreach.test.js`

### section-05-outreach-followup-sequence

Add `followup_count`, `sent_at`, `replied`, `last_resend_id`, `last_article_title` fields to NocoDB schema (document migration SQL). Implement `checkFollowUpsDue()` with threshold logic (`days >= 5/10/16 AND followup_count == 0/1/2`). Generate three follow-up copy variants (same thread with `In-Reply-To` headers for FU1/FU3; new thread for FU2). Store Resend `email_id` on initial send. Implement `cancelFollowUps()`.

**File:** `n8n/code/insiderbuying/send-outreach.js`
**Test file:** `n8n/tests/send-outreach.test.js`

### section-06-outreach-warmup-and-bounce

Implement `getWarmupLimit()` (throw if `DOMAIN_SETUP_DATE` missing, tiered limits 5/20/50). Add `Outreach_Daily_Stats` NocoDB table for cross-run daily send counter. Implement `isValidSendTime()` using `Intl.DateTimeFormat` for DST-correct EST. Implement `verifyEmail()` via QuickEmailVerification. Implement async bounce polling (`last_resend_id` → Resend GET → update status). Add Telegram alert when daily bounce rate > 5%.

**File:** `n8n/code/insiderbuying/send-outreach.js`
**Test file:** `n8n/tests/send-outreach.test.js`
