# Section 05 Code Review: Environment Variables + Deployment

## Summary
- Updated .env.example: header EarlyInsider → InsiderBuying.ai, site URL → insiderbuying.ai
- Added 43 validation tests covering:
  - All 14 required env vars documented
  - .gitignore protects .env.local
  - NEXT_PUBLIC_ vs server-only separation enforced
  - No hardcoded API keys in 6 source files
  - Netlify config correct
  - OneSignal worker exists
  - Build scripts present

## Manual steps remaining (not automatable)
- Resend domain setup (DNS records + verification)
- Netlify deployment + env vars in dashboard
- Stripe webhook URL update to live domain
- Supabase auth redirect URL update
- OneSignal app creation
- Smoke tests on live deployment
