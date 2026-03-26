# TDD Plan — 01 Infrastructure

## Testing Approach
This split is primarily infrastructure setup (database schemas, service configuration, deployment). Traditional unit tests are limited — most verification is integration-level (can we connect? do queries work? does auth flow complete?).

**Framework**: Vitest (fast, native ESM, works with Next.js 16)
**Location**: `tests/` directory in insiderbuying-site
**Command**: `npx vitest run`

For infrastructure, we prioritize **integration tests** and **smoke tests** over unit tests.

---

## Section 1: NocoDB + PostgreSQL on VPS

### Tests
```
# Test: docker-compose up starts both nocodb and nocodb_db containers
# Test: NocoDB health endpoint responds at http://nocodb:8080/api/v1/health
# Test: NocoDB API token authentication works (GET /api/v2/meta/tables returns 200)
# Test: All 12 tables exist and have correct field types
# Test: Link fields resolve correctly (e.g., Published_Images → Articles)
# Test: CRUD operations work on each table (create, read, update, delete)
# Test: JSON fields accept and return valid JSON objects
# Test: n8n NocoDB node connects and lists tables successfully
```

### Smoke test script
A standalone script (not vitest) that hits the NocoDB API and verifies all tables + fields. Run manually after deployment.

---

## Section 2: Supabase Project + Schema

### Tests
```
# Test: Supabase client connects with anon key
# Test: Supabase client connects with service role key
# Test: signup creates user in auth.users and profile in public.profiles
# Test: login returns valid session with access_token
# Test: RLS: unauthenticated request to profiles returns 0 rows
# Test: RLS: authenticated user can read own profile only
# Test: RLS: insider_alerts readable by any authenticated user
# Test: Realtime: INSERT into insider_alerts triggers subscription callback
# Test: Google OAuth redirect URL is configured correctly
# Test: profile trigger: new auth.user automatically gets profiles row with tier='free'
```

---

## Section 3: Stripe Products + Webhooks

### Tests
```
# Test: Stripe products exist (list products, find Pro Monthly and Pro Annual)
# Test: Stripe prices match spec ($24/mo, $228/year)
# Test: Coupon SUBSCRIBER12 exists and gives $12 off first invoice
# Test: webhook route returns 400 for invalid signature
# Test: webhook route returns 200 for valid signature
# Test: checkout.session.completed event creates subscription in Supabase
# Test: checkout.session.completed event updates profile tier to 'pro'
# Test: customer.subscription.deleted event reverts profile tier to 'free'
# Test: invoice.payment_failed event sets subscription status to 'past_due'
# Test: checkout route creates valid Stripe Checkout Session with correct price
```

### Mocking strategy
- Use Stripe test mode keys for integration tests
- Stripe CLI `stripe trigger` for webhook event testing
- Mock Supabase writes in unit tests, use real Supabase in integration tests

---

## Section 4: Next.js SSR Conversion

### Tests
```
# Test: next build succeeds without output: "export" (no static export errors)
# Test: middleware runs on protected routes (check for redirect header)
# Test: middleware passes through on public routes (/, /blog, /about)
# Test: /api/auth/callback route exists and handles code exchange
# Test: /api/webhooks/stripe route exists and accepts POST
# Test: /api/checkout route exists and creates Stripe session
# Test: /api/alerts/subscribe route exists
# Test: Supabase server client can getUser() in a server component
# Test: Supabase browser client initializes without error
# Test: OneSignalInit component renders without error (client-side)
```

### SSR-specific checks
```
# Test: homepage still renders correctly after SSR conversion (visual regression)
# Test: no hydration mismatch errors in browser console
# Test: server component can fetch data from Supabase
```

---

## Section 5: Environment Variables + Deployment

### Tests
```
# Test: .env.example contains all required keys (parse and compare against known list)
# Test: all NEXT_PUBLIC_ vars are accessible in client components
# Test: all server-only vars (STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY) are NOT in client bundle
# Test: Netlify build succeeds (deploy preview)
# Test: deployed site loads homepage correctly
# Test: deployed site auth flow works end-to-end
# Test: deployed site Stripe webhook receives events
# Test: Resend domain is verified (API call to check domain status)
```

### Deployment smoke test
A manual checklist script that verifies the live deployment:
1. Homepage loads (200)
2. /login page loads (200)
3. /api/webhooks/stripe accepts POST (200 or 400, not 404)
4. Supabase auth endpoint responds
5. No console errors on homepage
