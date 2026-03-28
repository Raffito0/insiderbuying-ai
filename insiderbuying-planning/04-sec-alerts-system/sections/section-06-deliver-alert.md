# Section 06 — `deliver-alert.js` — W5 Alert Delivery

## Overview

This is the W5 alert delivery node. It is triggered by W4 (via HTTP call or n8n sub-workflow) when `significance_score >= 6`. It sends email via Resend and a push notification via OneSignal to eligible subscribers, then updates Airtable with delivery tracking.

**File to create**: `n8n/code/insiderbuying/deliver-alert.js`

**Depends on**:
- Section 00 (schema migration) — `emails_sent`, `push_sent`, `delivered_at`, `error_log`, `status` columns must exist on `insider_alerts`
- Section 01 (Airtable setup) — `Insider_Alerts` table must exist for delivery tracking PATCH
- Section 05 (write persistence) — provides the `airtable_record_id` and `supabase_alert_id` that this node patches/references

---

## Tests First

**Test file**: `ryan_cole/insiderbuying-site/tests/insiderbuying/deliver-alert.test.js`

### 6.1 Fetch Eligible Users

```
# Test: users with email_enabled=false are excluded
# Test: user with min_significance_score=7 receives alert with score=8 (7 <= 8)
# Test: user with min_significance_score=9 does NOT receive alert with score=8 (9 > 8)
# Test: user with watched_tickers=['AAPL'] receives alert for AAPL even if score=3 (below min)
# Test: Pro user gets full ai_analysis text
# Test: Free user gets first 150 chars of ai_analysis + upgrade CTA
# Test: error in getUserById does NOT log user.email (only logs user_id UUID)
```

### 6.2 Resend Email

```
# Test: each email object has exactly one recipient in 'to' field (not array of 100)
# Test: 250 recipients → Resend called 3 times with [100, 100, 50] items
# Test: 200ms delay between batch calls
# Test: email HTML includes unsubscribe link (/preferences?unsubscribe=1)
# Test: email HTML includes postal address in footer
# Test: regular alert subject matches '[INSIDER BUY] {name} ({title}) buys ${amount} of {ticker}'
# Test: cluster subject matches '🔥 CLUSTER BUY: {N} insiders buying {ticker}'
# Test: Resend failure does not block push notification delivery
```

### 6.3 OneSignal Push

```
# Test: filter uses tag alert_score_min <= alert_score
# Test: notification URL deep-links to /alerts#{supabase_alert_id}
# Test: push_sent count is extracted from OneSignal response.recipients field
# Test: OneSignal failure does not block email delivery
```

### 6.4 Delivery Tracking

```
# Test: on full success → Airtable status='delivered', emails_sent and push_sent populated
# Test: on email failure → status='delivery_failed', error_log contains error detail
# Test: on push failure → status='delivery_failed', error_log contains error detail
```

---

## Input

The node receives the output from the upstream `analyze-alert.js` node via `$input.first().json`. Expected fields on the input object:

| Field | Type | Description |
|-------|------|-------------|
| `airtable_record_id` | string | Airtable record ID from Section 05 — used to PATCH delivery tracking |
| `supabase_alert_id` | string (UUID) | Supabase row ID — used for push notification deep-link URL |
| `ticker` | string | Stock ticker (e.g. `"AAPL"`) |
| `insider_name` | string | Full name of the insider |
| `insider_title` | string | Title/role of the insider |
| `total_value` | number | Dollar value of the transaction |
| `significance_score` | number | Score 1–10 from Section 03 |
| `ai_analysis` | string or null | Full analysis prose from Section 04 |
| `transaction_type` | string | `"buy"` or `"cluster"` |
| `cluster_size` | number | Number of insiders in cluster (relevant when `transaction_type === 'cluster'`) |

---

## 6.1 Fetch Eligible Users

Query Supabase using the service role key. Three-step process:

**Step 1 — Get eligible user IDs** from `public.user_alert_preferences`:

```sql
SELECT user_id
FROM user_alert_preferences
WHERE email_enabled = true
  AND (
    min_significance_score <= {alert_score}
    OR '{ticker}' = ANY(watched_tickers)
  )
```

This returns the list of `user_id` values who should receive this alert. Users with `watched_tickers` that include this ticker are always eligible regardless of `min_significance_score`.

**Step 2 — Get subscription tiers** from `public.profiles` for those user IDs:

```sql
SELECT user_id, subscription_tier
FROM profiles
WHERE user_id = ANY('{user_id_list}')
```

**Step 3 — Get email addresses** using the Supabase Admin API for each eligible user:

```javascript
// For each userId:
const { data, error } = await supabase.auth.admin.getUserById(userId);
const email = data?.user?.email;
```

**Log safety rule**: If `getUserById` throws or returns an error, log only `user_id` (UUID string), never `user.email` or the full user object. n8n execution logs are plain-text and visible in the n8n UI — exposing emails here is a privacy violation.

**Alternative view approach**: Instead of Step 3 above, create a Supabase database view that JOINs `auth.users`, `public.profiles`, and `public.user_alert_preferences`. The service role can query this view in a single REST call. This is simpler but requires schema setup outside this section.

**Pro vs Free content**:
- Pro (`subscription_tier = 'pro'`): send full `ai_analysis` text
- Free (`subscription_tier = 'free'` or any other value): send first 150 characters of `ai_analysis` + `"... [upgrade to Pro to read full analysis]"`

---

## 6.2 Build Email Batch (Resend)

Build an array of email objects. Each object has exactly one recipient in `to` (a single email string, not an array):

```javascript
{
  from: 'EarlyInsider <alerts@earlyinsider.com>',
  to: userEmail,             // one email string per object
  subject: subjectLine,
  html: htmlBody
}
```

**Subject line format**:
- Regular buy: `[INSIDER BUY] {insider_name} ({insider_title}) buys $${formatMoney(total_value)} of {ticker}`
- Cluster alert: `🔥 CLUSTER BUY: {cluster_size} insiders buying {ticker}`

**HTML body** — build as a string directly in the Code node (no external template engine). The template must include:
1. Filing metadata table: ticker, insider name, title, transaction value, significance score badge
2. AI analysis section — full for Pro, truncated + upgrade CTA for Free
3. Footer with CAN-SPAM mandatory elements (see below)

**CAN-SPAM compliance** — both elements are required or Resend will suspend the account:
- Unsubscribe link: `<a href="https://earlyinsider.com/preferences?unsubscribe=1">Unsubscribe</a>`
- Physical postal address of the company in the footer

**Chunking and delivery**:
1. Split the recipients array into batches of 100
2. For each batch, POST to `https://api.resend.com/emails/batch` with the array of email objects
3. Wait 200ms between batches (rate limit: 5 req/sec)
4. Accumulate the count of successfully sent emails into `totalEmailsSent`

**Error isolation**: wrap the entire Resend block in try/catch. If Resend fails, record the error but do NOT throw — allow the push notification step (6.3) to proceed regardless.

**Budget note**: Resend free tier = 100 emails/day / 3,000/month. Sufficient for < 10 users. At 50+ users × 10 alerts/day, the free tier is exhausted immediately — budget Resend Pro ($20/month) from launch.

---

## 6.3 Push Notification (OneSignal)

Send a **single** push notification that OneSignal fans out to all matching subscribers. Use filter-based targeting so W5 does not need to enumerate individual push subscriber IDs.

**OneSignal filter**:
```javascript
filters: [
  { field: 'tag', key: 'alert_score_min', relation: '<=', value: significance_score }
]
```

The `alert_score_min` tag is set per-user by Section 09 (OneSignal frontend tagging). The comparison `alert_score_min <= significance_score` must use a numeric value — if tags are stored as strings, OneSignal uses lexicographic comparison which is incorrect (e.g., `"10" <= "6"` would be true).

**Notification body**:
```
{ticker}: {insider_title} {transaction_type_label} ${formatMoney(total_value)}
```

Where `transaction_type_label` is `"buys"` for regular buys, and `"cluster buy"` for cluster alerts. For cluster alerts, include `"CLUSTER"` in the heading.

**Notification URL**: deep-links to `/alerts#{supabase_alert_id}` — e.g., `https://earlyinsider.com/alerts#3fa85f64-...`

**Track push_sent**: extract from the OneSignal API response's `recipients` field.

**Error isolation**: wrap OneSignal call in try/catch. If push fails, record the error but do NOT throw — email delivery (step 6.2) already ran; the error is captured in delivery tracking.

**OneSignal REST API endpoint**:
```
POST https://onesignal.com/api/v1/notifications
Authorization: Basic {ONESIGNAL_REST_API_KEY}
Content-Type: application/json
Body: { app_id, filters, headings, contents, url }
```

Environment variables needed: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`.

---

## 6.4 Delivery Tracking

After both email (6.2) and push (6.3) complete (or fail), PATCH the Airtable `Insider_Alerts` record using `airtable_record_id`.

**On full success** (both channels succeeded):
```javascript
{
  status: 'delivered',
  delivered_at: new Date().toISOString(),
  emails_sent: totalEmailsSent,
  push_sent: pushSentCount
}
```

**On any channel failure** (email or push threw an error):
```javascript
{
  status: 'delivery_failed',
  error_log: errorDetail   // string with which channel failed and why
}
```

Both `emails_sent` and `push_sent` should still be populated even on partial failure if one channel succeeded.

---

## Environment Variables Required

Access in Code node using the existing project pattern:
```javascript
const RESEND_API_KEY = (typeof $env !== 'undefined' && $env.RESEND_API_KEY) || '';
const ONESIGNAL_APP_ID = (typeof $env !== 'undefined' && $env.ONESIGNAL_APP_ID) || '';
const ONESIGNAL_REST_API_KEY = (typeof $env !== 'undefined' && $env.ONESIGNAL_REST_API_KEY) || '';
const SUPABASE_URL = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || '';
const SUPABASE_SERVICE_KEY = (typeof $env !== 'undefined' && $env.SUPABASE_SERVICE_KEY) || '';
const AIRTABLE_API_KEY = (typeof $env !== 'undefined' && $env.AIRTABLE_API_KEY) || '';
const AIRTABLE_INSIDERBUYING_BASE_ID = (typeof $env !== 'undefined' && $env.AIRTABLE_INSIDERBUYING_BASE_ID) || '';
```

All must be set in `docker-compose.yml` env section. The node should fail fast at startup with a clear error if any are missing.

---

## Function Signatures (stubs)

```javascript
// Fetch all eligible users with email + subscription tier
async function fetchEligibleUsers(supabase, alertScore, ticker) {
  // Returns: [{ userId, email, subscriptionTier }]
}

// Build a single email object for one user
function buildEmailObject(user, alertData, aiAnalysis) {
  // Returns: { from, to, subject, html }
}

// Build the HTML body string (includes CAN-SPAM footer)
function buildEmailHtml(alertData, analysisContent, isPro) {
  // Returns: HTML string
}

// Chunk array into sub-arrays of maxSize
function chunkArray(arr, maxSize) {
  // Returns: array of arrays
}

// Format dollar value to human-readable string (e.g. 1234567 → "$1.2M")
function formatMoney(value) {
  // Returns: string
}

// Send one batch to Resend /emails/batch endpoint
async function sendResendBatch(batch, apiKey) {
  // Returns: number of emails sent in this batch
}

// Send OneSignal push notification with filter targeting
async function sendOneSignalPush(alertData, supabaseAlertId, appId, restApiKey) {
  // Returns: number of recipients (push_sent)
}

// PATCH Airtable record with delivery outcome
async function updateDeliveryStatus(recordId, status, emailsSent, pushSent, deliveredAt, errorLog, apiKey, baseId) {
  // Returns: void
}
```

---

## n8n Sandbox Notes

The n8n Code node sandbox does not have a global `fetch` or global `URL`. Use the fetch polyfill pattern already established in other Code nodes in this project:

```javascript
const _https = require('https');
const _http = require('http');
const { URL } = require('url');

function fetchPolyfill(url, options = {}) {
  // existing polyfill pattern from other nodes in n8n/code/
}
```

Do not use `node-fetch` or any third-party HTTP library — only built-in Node.js modules are available in the sandbox.

---

## Output

The node should return a summary object for n8n logging purposes:

```javascript
return [{
  json: {
    airtable_record_id,
    supabase_alert_id,
    ticker,
    emails_sent: totalEmailsSent,
    push_sent: pushSentCount,
    status: finalStatus,       // 'delivered' or 'delivery_failed'
    delivered_at: new Date().toISOString()
  }
}];
```
