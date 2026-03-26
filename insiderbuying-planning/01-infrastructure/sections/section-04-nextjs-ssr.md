# Section 04: Next.js SSR Conversion

## Objective
Convert the existing static-export Next.js site to SSR on Netlify. Add Supabase auth middleware, Stripe webhook handler, API routes, and push notification setup.

## Context
Current state: Next.js 16.2.1 with `output: "export"`, React 19.2.4, Tailwind v4.2.2. Homepage with 12 sections works. Zero backend code.

After this section: SSR on Netlify with auth middleware, 4 API routes, Supabase client helpers, and OneSignal push init.

## Dependencies
- Section 02 (Supabase credentials for client setup)
- Section 03 (Stripe keys for webhook handler)

## Implementation

### 1. Remove static export
In `next.config.ts`, remove `output: "export"`. The file becomes:
```typescript
const nextConfig: NextConfig = {};
```

### 2. Install dependencies
```
npm install @supabase/supabase-js @supabase/ssr stripe react-onesignal
npm install -D @netlify/plugin-nextjs
```

### 3. Supabase client helpers

**`src/lib/supabase/client.ts`** — browser client:
- `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`
- Exported as a function (creates new client per call for proper cookie handling)

**`src/lib/supabase/server.ts`** — server client:
- Uses `cookies()` from `next/headers`
- `createServerClient()` with `getAll()` / `setAll()` cookie methods
- `setAll` wrapped in try/catch (Server Components have read-only cookies)

**`src/lib/supabase/middleware.ts`** — session refresh:
- Creates server client with request cookies
- Calls `supabase.auth.getUser()` to refresh token
- Sets updated cookies on both request and response objects
- Route protection: redirect to `/login` if unauthenticated on protected paths
- Protected paths: `/checkout`, `/alerts/preferences`, `/reports/download`

### 4. Root middleware

**`src/middleware.ts`**:
- Imports `updateSession` from `lib/supabase/middleware`
- Matcher: `['/((?!_next|favicon.ico|OneSignalSDKWorker.js|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']`
- Runs Supabase session refresh on every matching request

### 5. Stripe client

**`src/lib/stripe.ts`**:
- Creates Stripe instance with `STRIPE_SECRET_KEY`
- Exported for use in API routes

### 6. API Routes

**`src/app/api/auth/callback/route.ts`**:
- GET handler for OAuth callback
- Extracts `code` from URL params
- Exchanges code for session via `supabase.auth.exchangeCodeForSession(code)`
- Redirects to `/alerts` on success, `/login?error=auth` on failure

**`src/app/api/webhooks/stripe/route.ts`**:
- POST handler
- Reads raw body with `request.text()`
- Verifies signature with `stripe.webhooks.constructEvent()`
- Handles events:
  - `checkout.session.completed`: look up user by email, upsert subscription in Supabase, update profile tier
  - `customer.subscription.updated`: sync status changes
  - `customer.subscription.deleted`: set tier to 'free', update subscription status
  - `invoice.payment_failed`: set status to 'past_due'
- Returns 200 on success, 400 on bad signature

**`src/app/api/checkout/route.ts`**:
- POST handler
- Requires authenticated user (check via Supabase server client)
- Body: `{ priceId, coupon? }`
- Creates Stripe Checkout Session with:
  - `mode: 'subscription'`
  - `line_items: [{ price: priceId, quantity: 1 }]`
  - `discounts: coupon ? [{ coupon }] : undefined`
  - `success_url: /alerts?checkout=success`
  - `cancel_url: /pricing`
  - `customer_email: user.email`
  - `metadata: { userId: user.id }`
- Returns `{ url: session.url }`

**`src/app/api/alerts/subscribe/route.ts`**:
- GET: return current user's alert preferences
- POST/PUT: update user's alert preferences (email_enabled, push_enabled, min_significance_score, watched_tickers)
- Requires authenticated user

### 7. Netlify config

**`netlify.toml`**:
```toml
[build]
  command = "npm run build"
  publish = ".next"
```

### 8. OneSignal

**`public/OneSignalSDKWorker.js`**: download from OneSignal dashboard after creating app.

**`src/components/OneSignalInit.tsx`**:
- Client component (`'use client'`)
- useEffect with useRef guard (prevent double init in StrictMode)
- `OneSignal.init({ appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true })`

**`src/app/layout.tsx`**: add `<OneSignalInit />` before closing `</body>`.

### 9. Verify existing pages still work
After all changes, run `npm run dev` and verify:
- Homepage renders correctly (all 12 sections)
- No hydration errors in console
- Navbar and Footer still work

## Tests
```
# Test: next build succeeds (no static export errors)
# Test: createBrowserClient returns valid Supabase client
# Test: createServerClient reads cookies correctly
# Test: middleware redirects unauthenticated users from /checkout to /login
# Test: middleware passes through on public routes (/, /blog, /about, /pricing)
# Test: /api/auth/callback handles code exchange
# Test: /api/webhooks/stripe returns 400 for invalid signature
# Test: /api/webhooks/stripe returns 200 for valid test event
# Test: /api/checkout creates Stripe session (returns URL)
# Test: /api/checkout rejects unauthenticated requests (401)
# Test: /api/alerts/subscribe returns preferences for authenticated user
# Test: OneSignalInit renders without error
# Test: homepage still renders after SSR conversion
```

## Files Created/Modified
```
MODIFIED: next.config.ts (remove output: "export")
MODIFIED: package.json (new dependencies)
MODIFIED: src/app/layout.tsx (add OneSignalInit)
NEW: netlify.toml
NEW: src/middleware.ts
NEW: src/lib/supabase/client.ts
NEW: src/lib/supabase/server.ts
NEW: src/lib/supabase/middleware.ts
NEW: src/lib/stripe.ts
NEW: src/app/api/auth/callback/route.ts
NEW: src/app/api/webhooks/stripe/route.ts
NEW: src/app/api/checkout/route.ts
NEW: src/app/api/alerts/subscribe/route.ts
NEW: src/components/OneSignalInit.tsx
NEW: public/OneSignalSDKWorker.js
```

## Acceptance Criteria
- [ ] `npm run dev` works with SSR
- [ ] Auth middleware refreshes tokens on every request
- [ ] Protected routes redirect to /login
- [ ] Stripe webhook verifies signatures correctly
- [ ] Checkout creates valid Stripe session
- [ ] OAuth callback completes auth flow
- [ ] Homepage renders identically after conversion
- [ ] No TypeScript errors
