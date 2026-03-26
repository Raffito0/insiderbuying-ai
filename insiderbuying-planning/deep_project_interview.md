# InsiderBuying.ai — Deep Project Interview

## Date: 2026-03-26

## Requirements Sources
- `ryan_cole/DEXTER-FINANCE-BLOG.md` — Full business model, 16 workflows, stack, costs, strategies
- `ryan_cole/FINANCIAL-ARTICLE-SYSTEM-PROMPT.md` — Production Claude prompt for article generation
- `ryan_cole/insiderbuying-site/` — Existing Next.js site with homepage (12 sections)

## Interview Transcript

### Q1: Launch priority — which blog first?
**A: InsiderBuying.ai only.** The other 2 blogs (deepstockanalysis.com, dividenddeep.com) come later as separate projects. All planning focuses exclusively on insiderbuying.ai.

### Q2: Rendering strategy — static export vs SSR?
**A: Switch to SSR on Netlify.** Remove `output: 'export'` from next.config.ts. Use Netlify Functions for server routes. This enables proper auth, API routes, server-side blog rendering for SEO, and real-time alerts page.

### Q3: Scope — how many of the 16 workflows to plan?
**A: All 16 workflows.** Full scope. Everything gets planned in this decomposition.

### Q4: Design source — Figma vs existing style?
**A: Figma is gospel.** Every page must match the Figma design (file `15Wdojs2q9CdVdBugPy5M8`) pixel-perfect. Figma API token available: `FIGMA_TOKEN_REDACTED`.

### Q5: Auth + payments stack?
**A: New Supabase project.** Completely separate from Toxic or Nah. Clean isolation — own schema, own auth, own tables.

### Q6: Airtable organization?
**A: New Airtable base.** Separate from the ToxicOrNah Content Pipeline base. All InsiderBuying tables (Articles, Keywords, Alerts, etc.) in their own base.

### Q7: API keys status?
**A: Have Financial Datasets API key.** DataForSEO still needs to be acquired. Plan should account for this dependency.

### Q8: Dexter AI research agent?
**A: Needs to be built.** Dexter is part of this project — an n8n workflow or agent that does pre-research (web search, financial data aggregation, competitor analysis) before the article generation Claude call.

### Q9: Ryan Cole — who is he?
**A: Ryan Cole is the Founder & CEO of InsiderBuying.ai.** Real person. Will be used as author of blog articles. Not a pseudonym.

### Q10: Timeline?
**A: 7 days. No questions asked. Everything ready in 7 days.**

## Key Decisions Summary

| Decision | Choice | Impact |
|----------|--------|--------|
| Blog scope | InsiderBuying.ai only | Eliminates multi-blog routing complexity |
| Rendering | SSR on Netlify | Enables server routes, better SEO, real auth |
| Workflow scope | All 16 | Full ecosystem in one project |
| Design | Figma pixel-perfect | Need Figma API extraction for every page |
| Supabase | New project | Need to create + configure from scratch |
| Airtable | New base | Need to create all tables from scratch |
| Financial Datasets | Have key | Can build W2/W4 immediately |
| DataForSEO | Need key | W1 blocked until acquired |
| Dexter | Build as workflow | Adds complexity to content engine |
| Timeline | 7 days | Extreme parallelization needed |

## Existing Assets
- Next.js 16 site with homepage (12 sections, all components built)
- Navbar + Footer components
- Page directories created (empty) for: /about, /alerts, /blog, /blog/[slug], /faq, /login, /pricing, /reports, /signup
- Color system: navy #002A5E, green #00D26A, red #FF3B3B
- Fonts: Montaga (headings), Inter (body), Space Mono (data)
- Tailwind v4 with @theme config
- Package: Next.js 16.2.1, React 19.2.4, TypeScript

## Missing Assets
- No Supabase project
- No Airtable base
- No Stripe integration
- No auth system
- No blog rendering (SSG/SSR)
- No API routes
- No n8n workflows
- DataForSEO API key
- Figma designs not yet extracted
