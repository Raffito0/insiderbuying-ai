# Research — 01 Infrastructure

## Current Codebase State
- Next.js 16.2.1, React 19.2.4, TypeScript, Tailwind CSS v4.2.2
- `output: "export"` in next.config.ts (static export — must remove)
- Zero backend: no Supabase, no Stripe, no API routes, no env files
- 17 files total: layout, page, globals.css, Navbar, Footer, 12 home section components
- Tailwind v4 uses `@theme` in globals.css (not tailwind.config.js)
- Path alias `@/*` → `./src/*`
- No netlify.toml exists

## @supabase/ssr with Next.js App Router
- Package: `@supabase/ssr` (replaces deprecated `@supabase/auth-helpers-nextjs`)
- 3 files: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server components), `lib/supabase/middleware.ts` (session refresh)
- Middleware pattern: `createServerClient` with cookie read/write, refresh token on every request
- **CRITICAL**: Use `supabase.auth.getUser()` not `getSession()` in server code (getSession reads cookies which can be spoofed)
- Root `middleware.ts` calls `updateSession()`, matcher excludes `_next` and `favicon.ico`
- Server components can read cookies but not write — middleware handles writes

## Stripe Webhooks on Netlify
- App Router: `app/api/webhooks/stripe/route.ts` with `request.text()` for raw body
- No `bodyParser: false` config needed (App Router uses Web API Request)
- `stripe.webhooks.constructEvent(body, sig, endpointSecret)` for verification
- Test vs Live webhook secrets are different — common error source
- Local testing: `stripe listen --forward-to localhost:8888/api/webhooks/stripe`

## Next.js SSR on Netlify
- `@netlify/plugin-nextjs` built on OpenNext — full App Router support
- Supported: SSR, ISR, PPR, Server Actions, Route Handlers, Middleware, Image Optimization
- Middleware runs as Netlify Edge Function
- SSR/ISR/Route Handlers run as serverless Netlify Functions
- No special config required — just remove `output: "export"` and deploy
- Known: `runtime: 'edge'` still runs in Node.js (no real edge SSR)
- Headers/redirects evaluated AFTER middleware (differs from standalone Next.js)

## Supabase Realtime
- Enable via SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE insider_alerts;`
- Client subscribe: `supabase.channel('name').on('postgres_changes', { event: 'INSERT', table: 'insider_alerts' }, callback).subscribe()`
- RLS respected: subscribers only receive events for rows they can SELECT
- Filter support: `filter: 'significance_score=gte.6'`
- React hook pattern: initial fetch + realtime subscription in useEffect, cleanup on unmount

## OneSignal Web Push
- Package: `react-onesignal`
- Service worker: `public/OneSignalSDKWorker.js` (download from dashboard)
- Init in `'use client'` component with `OneSignal.init({ appId })`
- Works on Netlify (client-side only, service worker served as static asset)
- React.StrictMode causes double init in dev — add useRef guard
