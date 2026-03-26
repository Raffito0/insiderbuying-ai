# Section 05: Environment Variables + Deployment

## Objective
Document all environment variables, create .env files, set up Resend email domain, configure Netlify deployment, and run end-to-end smoke tests.

## Context
This is the final section. All services are configured (NocoDB, Supabase, Stripe) and the Next.js app has SSR + API routes. This section connects everything and verifies the live deployment.

## Dependencies
- Section 01 (NocoDB API token)
- Section 02 (Supabase credentials)
- Section 03 (Stripe keys)
- Section 04 (Next.js app with API routes)

## Implementation

### 1. Environment variable documentation

**`ryan_cole/insiderbuying-site/.env.example`** — committed to repo:
```
# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=         # https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # eyJ... (safe to expose client-side)
SUPABASE_SERVICE_ROLE_KEY=        # eyJ... (server-only, never expose)

# === Stripe ===
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # pk_test_... or pk_live_...
STRIPE_SECRET_KEY=                    # sk_test_... or sk_live_... (server-only)
STRIPE_WEBHOOK_SECRET=                # whsec_... (server-only)
STRIPE_PRICE_ID_PRO_MONTHLY=         # price_...
STRIPE_PRICE_ID_PRO_ANNUAL=          # price_...
STRIPE_COUPON_ID_SUBSCRIBER=          # SUBSCRIBER12

# === NocoDB (server-only, for direct queries if needed) ===
NOCODB_API_URL=                       # http://nocodb:8080 (VPS) or http://localhost:8080 (local)
NOCODB_API_TOKEN=                     # xc-... API token from NocoDB settings

# === OneSignal ===
NEXT_PUBLIC_ONESIGNAL_APP_ID=         # UUID from OneSignal dashboard

# === Resend ===
RESEND_API_KEY=                       # re_... (server-only)

# === Site ===
NEXT_PUBLIC_SITE_URL=                 # https://insiderbuying.ai
```

### 2. Local .env.local
Create `.env.local` (gitignored) with actual values from Sections 01-03.

### 3. Resend setup
1. Create Resend account at resend.com
2. Add domain: `insiderbuying.ai`
3. Add DNS records for email deliverability:
   - SPF: TXT record `v=spf1 include:_spf.resend.com ~all`
   - DKIM: CNAME records (provided by Resend)
   - DMARC: TXT record `v=DMARC1; p=quarantine;`
4. Wait for domain verification (can take 24-48h for DNS propagation)
5. Create API key → `RESEND_API_KEY`
6. Send test email to verify delivery

### 4. .gitignore verification
Ensure `.gitignore` includes:
```
.env.local
.env*.local
```
Verify `.env.example` is NOT in .gitignore.

### 5. Netlify deployment

1. Push code to GitHub repo
2. Connect repo to Netlify:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: 20 (or latest LTS)
3. Set all environment variables in Netlify UI (Site Settings → Environment Variables):
   - All keys from `.env.example` with production values
   - Stripe keys: use live mode keys (not test)
   - Supabase: same keys (Supabase doesn't have test/live split)
4. Trigger deploy
5. Configure custom domain: `insiderbuying.ai` → Netlify
6. Enable HTTPS (automatic with Netlify)

### 6. Stripe webhook: update to live URL
After Netlify is live:
- Update Stripe webhook endpoint from test to `https://insiderbuying.ai/api/webhooks/stripe`
- Use the new live webhook signing secret

### 7. Supabase: update redirect URLs
- Add `https://insiderbuying.ai/api/auth/callback` to Supabase auth redirect URLs
- Add `https://insiderbuying.ai` to Supabase site URL

### 8. Smoke tests

Run these manually (or script them) after deployment:

```bash
# 1. Homepage loads
curl -s -o /dev/null -w "%{http_code}" https://insiderbuying.ai
# Expected: 200

# 2. API routes exist
curl -s -o /dev/null -w "%{http_code}" -X POST https://insiderbuying.ai/api/webhooks/stripe
# Expected: 400 (bad signature, but route exists)

# 3. Auth callback route exists
curl -s -o /dev/null -w "%{http_code}" https://insiderbuying.ai/api/auth/callback
# Expected: 302 or 400 (redirect or error, but not 404)

# 4. Static assets load
curl -s -o /dev/null -w "%{http_code}" https://insiderbuying.ai/OneSignalSDKWorker.js
# Expected: 200

# 5. No server errors in Netlify Functions log
# Check Netlify dashboard → Functions → Logs
```

### 9. OneSignal app creation
1. Create OneSignal app at onesignal.com
2. Platform: Web Push
3. Site URL: `https://insiderbuying.ai`
4. Download `OneSignalSDKWorker.js` → put in `public/`
5. App ID → `NEXT_PUBLIC_ONESIGNAL_APP_ID`

## Tests
```
# Test: .env.example contains all required keys (compare against known list)
# Test: NEXT_PUBLIC_ vars accessible in client bundle
# Test: server-only vars NOT in client bundle
# Test: Netlify build succeeds (deploy log shows no errors)
# Test: deployed homepage loads (HTTP 200)
# Test: Stripe webhook endpoint responds (not 404)
# Test: Auth callback route exists (not 404)
# Test: OneSignalSDKWorker.js is accessible
# Test: Resend domain verified (API check)
# Test: Resend can send test email
```

## Acceptance Criteria
- [ ] `.env.example` committed with all keys documented
- [ ] `.env.local` working for local development
- [ ] Resend domain verified and sending emails
- [ ] Netlify deployment live at insiderbuying.ai
- [ ] All API routes responding (no 404s)
- [ ] HTTPS working
- [ ] OneSignal push prompt appears on site
- [ ] Stripe webhook receives events on live URL
- [ ] Supabase auth redirect works on live domain
- [ ] No errors in Netlify Functions logs
