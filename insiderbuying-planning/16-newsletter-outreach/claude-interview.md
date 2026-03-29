# Interview Transcript: 16-newsletter-outreach

## Round 1 — Critical Blockers and Integrations

### Q1: Beehiiv A/B Subject Testing

**Question:** Research confirmed Beehiiv's A/B subject testing is dashboard-only (API only accepts a single subject_line). What's the preferred approach for the spec's A/B requirement?

**Answer:** Log both subjects, always send A.

*Clarification: Store subjectA + subjectB in NocoDB for reference/future use, but always send subjectA via API. No split-testing infra needed.*

---

### Q2: Beehiiv Account Plan

**Question:** Is the Beehiiv account on Enterprise plan? The POST /posts endpoint is beta + Enterprise-only. If not Enterprise, we need a fallback send path.

**Answer:** Not Enterprise / unsure.

*Clarification: Design Beehiiv API as primary but build Resend fallback for the send step.*

---

### Q3: Finnhub API for computeAlertPerformance()

**Question:** For computeAlertPerformance(), the spec calls for fetching 30-day returns from Finnhub. Is there an existing Finnhub client/env var already in the codebase, or is this a new integration?

**Answer:** finnhub-client.js is created in unit 12. This unit just imports it.

*Clarification: Import `finnhub-client.js` from unit 12. No new client setup needed.*

---

### Q4: Alpha Vantage Earnings Cache

**Question:** The spec's getUpcomingEarnings() reads from 'Alpha Vantage cache in NocoDB'. Does this cache already exist, or does the newsletter also need to fetch + cache earnings fresh?

**Answer:** Cache doesn't exist — fetch + cache inline.

*Clarification: Newsletter must call Alpha Vantage API, cache result in NocoDB Financial_Cache, then query.*

---

## Round 2 — Follow-up Sequencing, Bounce Tracking, Schema

### Q5: Reply Detection / cancelFollowUps()

**Question:** The spec's cancelFollowUps() detects prospect replies via 'SMTP inbox check'. What's the actual mechanism?

**Answer:** Poll Gmail/IMAP manually.

*Clarification: Separate cron job reads inbox via IMAP, matches reply emails to prospects by email thread ID, updates NocoDB `replied=true`. `cancelFollowUps()` then sets `followup_count=99` to skip all future follow-ups.*

---

### Q6: Bounce Tracking Mechanism

**Question:** The spec says listen for Resend webhook (bounce event). Is Resend already configured with a webhook endpoint?

**Answer:** Use Telegram alert only.

*Clarification: Skip Resend webhook entirely. Daily cron checks NocoDB bounce rate (bounced records / sent records for today). If > 5%, send Telegram alert. Mark bounced prospects with `status='bounced'` manually after SMTP error response.*

---

### Q7: Outreach_Prospects NocoDB Schema

**Question:** Does the Outreach_Prospects NocoDB table already have a followup_count field?

**Answer:** Schema migration needed.

*Clarification: Add to Outreach_Prospects: `followup_count` (integer, default 0), `sent_at` (datetime), `replied` (boolean, default false). These are needed for 3-stage sequence logic.*

---

### Q8: Domain Age / DOMAIN_SETUP_DATE

**Question:** What's the DOMAIN_SETUP_DATE for earlyinsider.com?

**Answer:** Domain earlyinsider.com was registered recently but email sending hasn't started yet. Use env var DOMAIN_SETUP_DATE (set at first outreach send) so getWarmupLimit() calculates dynamically. Start at 5/day, ramp automatically.

*Clarification: `DOMAIN_SETUP_DATE` is a required env var. On first outreach run, if unset, use today's date. `getWarmupLimit()` computes `daysSinceDomainSetup = (Date.now() - new Date(DOMAIN_SETUP_DATE)) / 86400000`.*
