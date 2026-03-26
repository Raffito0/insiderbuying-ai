<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-nocodb-vps
section-02-supabase-schema
section-03-stripe-setup
section-04-nextjs-ssr
section-05-env-deploy
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-nocodb-vps | - | section-05 | Yes |
| section-02-supabase-schema | - | section-04, section-05 | Yes |
| section-03-stripe-setup | - | section-04, section-05 | Yes |
| section-04-nextjs-ssr | section-02, section-03 | section-05 | No |
| section-05-env-deploy | section-01, section-02, section-03, section-04 | - | No |

## Execution Order

1. section-01-nocodb-vps, section-02-supabase-schema, section-03-stripe-setup (parallel — all independent)
2. section-04-nextjs-ssr (after Supabase + Stripe are ready)
3. section-05-env-deploy (final — needs everything)

## Section Summaries

### section-01-nocodb-vps
Deploy NocoDB + PostgreSQL on VPS via docker-compose. Create 12 tables with correct field types and link fields. Verify n8n connectivity.

### section-02-supabase-schema
Create Supabase project. Apply schema migration (profiles, subscriptions, insider_alerts, etc.). Configure RLS, Realtime, auth providers, profile creation trigger.

### section-03-stripe-setup
Create Stripe products (Pro Monthly $24, Annual $228), coupon SUBSCRIBER12. No code yet — just Stripe dashboard/API setup and key collection.

### section-04-nextjs-ssr
Convert Next.js to SSR. Add Supabase client files, auth middleware, API routes (webhook, checkout, callback, alert subscribe). Add Netlify config. Install dependencies.

### section-05-env-deploy
Create .env.example, .env.local, configure Netlify env vars. Set up Resend domain. Deploy to Netlify. Run smoke tests.
