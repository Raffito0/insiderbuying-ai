# Research: SEC Alerts System (W4 + W5)

## 1. Financial Datasets API — Form 4 / Insider Transactions

### Endpoint
```
GET https://api.financialdatasets.ai/insider-trades
Authorization: X-API-KEY: <key>
```

### Key Query Parameters
| Parameter | Notes |
|---|---|
| `ticker` | **Required** — single ticker symbol |
| `filing_date_gte` | Filter filings >= date (YYYY-MM-DD). Use this for "new since last check" |
| `filing_date_gt` | Strictly greater than (avoids boundary duplicates) |
| `limit` | Max results (default 10) |

**CRITICAL: No bulk endpoint without ticker.** You must either: (a) query per ticker from a watchlist, or (b) investigate if there's an undocumented "all tickers" endpoint. This is a significant architecture decision — see W4 design section.

### Response Fields Available
```json
{
  "insider_trades": [{
    "ticker": "AAPL",
    "issuer": "Apple Inc.",
    "name": "Tim Cook",
    "title": "CEO",
    "is_board_director": false,
    "transaction_date": "2025-03-01",
    "transaction_shares": 50000,
    "transaction_price_per_share": 175.50,
    "transaction_value": 8775000,
    "shares_owned_before_transaction": 3200000,
    "shares_owned_after_transaction": 3150000,
    "security_title": "Common Stock",
    "transaction_type": "P - Purchase",
    "filing_date": "2025-03-03"
  }]
}
```

### IMPORTANT: No filing_reference_number
The API response does **not** include `filing_reference_number` (SEC accession number). Dedup key must be constructed from: `ticker + name + transaction_date + transaction_shares + transaction_price_per_share` composite key. Or use `ticker + name + filing_date + transaction_value`.

### transaction_type Values
- `"P - Purchase"` = insider BUY (what we want)
- `"S - Sale"` = insider SELL
- `"A - Grant"` = stock option grant (less meaningful)
- `"D - Disposition"` = usually option exercise

### Ticker Coverage
Available tickers endpoint: `GET /insider-trades/tickers/` — returns all covered tickers. Can use this to build watchlist.

### Rate Limits
Not publicly documented. Test empirically. Likely 60–600 req/min on paid plan.

---

## 2. Alert Delivery Channel Recommendations

### Benchmark Data (2025)
| Channel | Open/View Rate | Speed | Cost | Notes |
|---|---|---|---|---|
| Mobile push | 50–90% | ~1-2s | Low | Highest visibility |
| Web push | 10–20% click rate | ~2-5s | Free (OneSignal) | No app install needed |
| Email | 20–25% | Minutes | Low | Standard for financial |
| Telegram bot | ~70-80% read | ~1-3s | Free | Top choice for traders |
| SMS | ~98% open | ~10s | ~$0.03/msg | Too expensive for MVP |

### Recommended Stack for MVP
1. **Email via Resend** — professional standard, compliance-friendly, free tier 3k/month
2. **Web push via OneSignal** — real-time, no app install, free 10k subscribers
3. **Telegram bot** (future) — highest engagement for power users, free
4. **Skip SMS** for MVP — cost prohibitive at scale

### Why Telegram > SMS
- No carrier filtering, no per-message cost, instant delivery
- Traders already on Telegram
- Bot API is free and has no documented rate limits
- Should be added as V2 feature (after MVP)

### Multi-channel Orchestration (future)
If delivery complexity grows: consider **Novu** (open source, self-hostable) or **Knock** for unified routing. For MVP, direct Resend + OneSignal API calls are sufficient.

---

## 3. OneSignal Web Push (2025)

### Requirements
- **HTTPS mandatory** (localhost exempt for dev)
- Service worker `OneSignalSDKWorker.js` at site root (download from dashboard)
- Works in: Chrome, Firefox, Edge, Safari (iOS 16.4+)
- Does NOT work in: incognito/private mode

### Client Setup (Next.js)
```html
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({ appId: "YOUR_APP_ID" });
  });
</script>
```

### User Tagging for Segmentation
```javascript
OneSignal.User.addTag("plan", "pro");
OneSignal.User.addTag("min_score", "6");
OneSignal.User.login("supabase_user_id"); // Link to your user system
```

### Server-Side Push (REST API)
```javascript
// Send to users who have AAPL in watchlist
POST https://onesignal.com/api/v1/notifications
Authorization: Basic REST_API_KEY
{
  "app_id": "APP_ID",
  "filters": [
    { "field": "tag", "key": "ticker_watchlist", "relation": "contains", "value": "AAPL" }
  ],
  "contents": { "en": "Tim Cook bought $2.3M of AAPL" },
  "data": { "alert_id": "uuid", "ticker": "AAPL" }
}
```

### Free Tier
- 10,000 push subscribers free
- 20,000 free emails/month (separate from Resend)
- Push beyond 10k: $0.012/MAU

---

## 4. Supabase Realtime

### Enable on Table
```sql
-- Via SQL (also doable in Dashboard → Database → Replication)
ALTER PUBLICATION supabase_realtime ADD TABLE insider_alerts;

-- Enable RLS
ALTER TABLE insider_alerts ENABLE ROW LEVEL SECURITY;

-- RLS SELECT policy required for Realtime to work
CREATE POLICY "users see own alerts"
ON insider_alerts FOR SELECT
USING ( auth.uid() = user_id );
```

### Client Subscription (Next.js/React)
```typescript
const channel = supabase
  .channel('insider-alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'insider_alerts'
  }, (payload) => {
    // New alert received - update UI
    setAlerts(prev => [payload.new, ...prev]);
  })
  .subscribe();
```

### RLS Gotcha with Realtime
- RLS policies are **required** even for Realtime (server checks before sending events)
- If RLS blocks a row, the event is dropped silently — no error sent to client
- JWT must be fresh; `auth.uid()` only updates when new JWT is sent

### Scale Warning
Supabase docs say Postgres Changes is suitable for "quick testing and low connected users." For >1000 concurrent users on the alerts page, switch to Broadcast channel pattern. Plan for this in architecture.

---

## 5. Resend Batch Email API

### Endpoint
```
POST https://api.resend.com/emails/batch
Authorization: Bearer re_xxx
Content-Type: application/json

Body: Array of up to 100 email objects
```

### Limits
| Plan | Daily | Monthly | Cost |
|---|---|---|---|
| Free | 100/day | 3,000/month | $0 |
| Pro | Unlimited | 50,000/month | $20/mo |

**Rate limit: 5 requests/second** (not 5 emails — 1 batch call = 1 request, can contain 100 emails)

### Code Pattern (n8n Code node)
```javascript
async function sendAlertEmails(recipients, alertData) {
  const batch = recipients.map(user => ({
    from: "Insider Alerts <alerts@earlyinsider.com>",
    to: [user.email],
    subject: `[INSIDER ${alertData.transaction_type}] ${alertData.name} buys $${formatMoney(alertData.transaction_value)} of ${alertData.ticker}`,
    html: buildEmailHtml(user, alertData)  // user.is_pro controls blur/full
  }));

  // Send in chunks of 100
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend batch failed: ${res.status} ${err}`);
    }
    // Respect rate limit: 1 batch/200ms if sending multiple batches
    if (i + 100 < batch.length) await new Promise(r => setTimeout(r, 200));
  }
}
```

---

## 6. Existing Codebase Patterns (n8n)

### Mandatory Fetch Polyfill
Every n8n Code node MUST include this boilerplate:
```javascript
const _https = require('https');
const _http = require('http');
const { URL } = require('url');

function fetch(url, opts = {}, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (_redirectCount > 5) return reject(new Error('Too many redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? _https : _http;
    // ... full implementation ...
  });
}
```

### Return Format
```javascript
// Single output
return [{ json: { success: true, data: result } }];

// Empty (stop branch)
return [];

// Multiple outputs
return [{ json: { item1 } }, { json: { item2 } }];
```

### Airtable API Helper Pattern
```javascript
async function airtableGet(tableId, { filterByFormula } = {}) {
  let url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}`;
  if (filterByFormula) url += `?filterByFormula=${encodeURIComponent(filterByFormula)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + AIRTABLE_API_KEY }
  });
  if (!res.ok) throw new Error(`Airtable GET failed: ${res.status}`);
  return res.json();
}

async function airtableCreate(tableId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`Airtable POST failed: ${res.status}`);
  return res.json();
}

async function airtableUpdate(tableId, recordId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}/${recordId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`Airtable PATCH failed: ${res.status}`);
  return res.json();
}
```

### Supabase REST Pattern (in n8n context)
```javascript
async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
  return res.json();
}
```

### Error Handling Standard
```javascript
try {
  const result = await doSomething();
  return [{ json: { success: true, result } }];
} catch (e) {
  return [{ json: { success: false, error: e.message } }];
}
```

### Idempotency Pattern (for dedup)
```javascript
// Pre-load existing records into Set/Map before processing
const existingData = await airtableGet(TABLE_ID, {
  filterByFormula: "AND({status}!='failed')"
});
const existingKeys = new Set(
  existingData.records.map(r => r.fields.dedup_key)
);

// Then filter new items
const newItems = fetchedItems.filter(item => !existingKeys.has(buildDedupKey(item)));
```

### n8n Gotchas
- No `list` operation in Airtable node → use `search` with filterByFormula
- Linked record fields → always arrays: `[recordId]` not `recordId`
- Smart quotes from LLM (`""''`) → must be sanitized: `.replace(/[\u201C\u201D]/g, '"')`
- Trailing commas in JSON → `.replace(/,\s*([\]}])/g, '$1')`
- `CLAUDE_CODE_TASK_LIST_ID` env var for task tracking (unrelated to workflow)

---

## 7. InsiderBuying.ai Site Architecture (existing)

### Tech Stack
- Next.js 16 + TypeScript + Tailwind 4
- Supabase (Auth + PostgreSQL)
- Stripe (subscriptions)
- OneSignal (env var: `NEXT_PUBLIC_ONESIGNAL_APP_ID` — already in env)
- Resend (`RESEND_API_KEY` — already in env)
- NocoDB (articles/blog CMS)
- Netlify deployment

### Existing Alert Infrastructure (partial)
- `src/app/api/alerts/subscribe/route.ts` — subscription to alerts (Resend + OneSignal)
- `src/app/alerts/page.tsx` — real-time alert feed (uses Supabase)
- Supabase table `alerts` exists with: `id`, `created_at`, `title`, `content`, `metadata`, `significance_score`, `source`

### What's Missing (to build in W4/W5)
- `insider_alerts` table (or rename/extend `alerts` table)
- `user_alert_preferences` table (min_score, watched_tickers, email_enabled, push_enabled)
- Airtable `Insider_Alerts` table (for workflow state + dedup)
- W4 n8n workflow (SEC monitor)
- W5 n8n workflow (delivery)
- OneSignal subscription flow (service worker on site)
- Realtime enabled on the alerts table

### Environment Variables Already Configured
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_ONESIGNAL_APP_ID
RESEND_API_KEY
```

---

## 8. Testing Approach

No formal test suite exists in n8n codebase. Testing is done:
1. **Inline validation** — validate-scenario.js style JSON repair + business logic gates
2. **Manual via Telegram** — human approves/rejects outputs
3. **Integration testing** — run workflow with real API keys, observe Airtable output

**For W4/W5 testing:**
- Unit: test significance scoring logic with mock filing data (pure function, no API needed)
- Integration: run W4 with a known ticker (e.g. AAPL) and verify Airtable record is created correctly
- End-to-end: verify email arrives + push shows in browser for a test user
- Manual spot-check: run 20 sample filings through significance scorer, verify scores are reasonable
