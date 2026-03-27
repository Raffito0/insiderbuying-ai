# 02 — Figma Site Pages

## Summary
Build all missing site pages pixel-perfect from the Figma design file. 11 pages total, each matching the Figma spec exactly. Includes auth flows, Stripe checkout integration, blog CMS rendering, and responsive design.

## Timeline: Days 1-3 (16-20 hours)

## Dependencies
- 01-infrastructure (Supabase auth, Stripe products, Airtable base, SSR deployment)

## Design Source
- Figma file: `15Wdojs2q9CdVdBugPy5M8`
- Figma API token: `FIGMA_TOKEN_REDACTED`
- Extract designs via Figma API before building each page
- Design system: Navy #002A5E, Green #00D26A, Red #FF3B3B, Montaga headings, Inter body, Space Mono data

## Existing Assets
- Homepage with 12 sections (complete)
- Navbar component (with mobile hamburger)
- Footer component (3-column links)
- globals.css with @theme color tokens
- Empty page directories already created

## Deliverables

### Page 1: /signup
- Email/password signup form
- Google OAuth button
- Supabase auth integration (`@supabase/ssr` for server-side session)
- Redirect to /alerts after signup
- Link to /login

### Page 2: /login
- Email/password login form
- Google OAuth button
- "Forgot password" flow (Supabase magic link)
- Redirect to /alerts after login
- Link to /signup

### Page 3: /alerts
- **Hero**: Real-time insider alert feed
- **Free users**: see all alerts with basic data (ticker, insider name, transaction type, shares, value, date). AI Analysis section visible but blurred with CSS `filter: blur(8px)` + overlay "Upgrade to Pro to unlock AI Analysis" CTA
- **Pro users**: see full AI analysis (significance score, pattern context, cluster info, historical track record)
- Real-time updates via Supabase Realtime subscription (new alerts appear at top without refresh)
- Filter controls: ticker search, transaction type (buy/sell), min significance score, sector
- Alert preference settings (email/push toggle, watched tickers, min score)
- Pagination or infinite scroll for historical alerts
- Each alert card: ticker badge, insider name + title, transaction details, filing date, significance indicator (color-coded 1-10)

### Page 4: /reports
- Grid of available reports
- Two categories: Data Studies (free, from W3) + Premium Reports (paid, from W15)
- Data Study cards: title, study period, key finding teaser, "Read Study" CTA
- Premium Report cards: title, description, price, "Buy Report" CTA → Stripe Checkout
- Lead Magnet banner: "Free Monthly Insider Buying Backtest" → links to /free-report
- Responsive grid: 3 columns desktop, 2 tablet, 1 mobile

### Page 5: /blog
- Article listing page with SSR (Airtable query at request time, ISR with 5min revalidate)
- Article cards: hero image, title, verdict badge (color-coded), ticker, date, word count, key takeaway excerpt
- Filter bar: verdict type, sector, ticker search
- Pagination (12 articles per page)
- SEO: proper meta tags, canonical URLs

### Page 6: /blog/[slug]
- Dynamic SSR article page
- Full article render from Airtable `body_html`
- Components:
  - Key Takeaways box (styled, top of article)
  - Article body with proper table styling, blockquote styling, management quote translations
  - Verdict section (styled box with verdict badge + text)
  - Author card (Ryan Cole, bio, social links)
  - Related articles sidebar (3-4 articles, same sector or ticker)
  - Share buttons (X, LinkedIn, copy link)
  - Newsletter signup CTA (bottom of article, non-intrusive — NO popup, NO mid-article gate)
- SEO: title tag, meta description, Open Graph image, structured data (Article schema)
- Reading time estimate
- Table of contents (generated from H2 headings)

### Page 7: /pricing
- Free vs Pro comparison table
- Feature comparison grid with checkmarks/x marks
- Free tier: real-time alerts (basic), blog articles, monthly lead magnet
- Pro tier: full AI analysis, priority alerts, premium reports, newsletter, all Free features
- Pricing: monthly + annual toggle (annual shows savings)
- CTA buttons: "Get Started Free" (→ /signup) and "Start Pro Trial" (→ Stripe Checkout)
- FAQ section specific to pricing
- Trust signals: money-back guarantee, cancel anytime

### Page 8: /about
- Ryan Cole bio section with photo
- Company mission: democratize insider trading intelligence
- Methodology overview (how data is collected, analyzed, scored)
- Data sources list (SEC EDGAR, Financial Datasets API)
- Trust metrics (same as homepage: $4.2B tracked, 2,847 companies, etc.)
- Team section (if applicable)
- Contact info

### Page 9: /faq
- Expandable FAQ sections (grouped by category)
- Categories: General, Alerts, Pricing & Billing, Data & Methodology, Account
- Smooth expand/collapse animation
- SEO: FAQ structured data (JSON-LD)

### Page 10: /methodology
- Detailed explanation of insider signal scoring
- How cluster detection works (multiple insiders buying within 7 days)
- Historical backtest results (chart showing insider signal vs S&P 500)
- Data pipeline explanation (SEC → parsing → AI scoring → delivery)
- Limitations and disclaimers (not financial advice)

### Page 11: /free-report
- Lead magnet landing page
- Headline: "Free Monthly Insider Buying Report"
- Description of what's inside (top insider buys, cluster analysis, backtest results)
- Email capture form (→ Beehiiv subscriber + Supabase newsletter_subscribers)
- Sample preview image/pages
- Permanent URL — updated monthly with latest report (W16)
- After submit: thank you + PDF download link (from R2)

## SEO Foundation (site-wide, installed here because this split owns the Next.js app)

### next-seo (garmeeh/next-seo, 8.3k stars)
- `npm install next-seo`
- Global `<DefaultSeo>` in `layout.tsx` — site-wide OG tags, Twitter cards, site name, default image
- Per-page `<NextSeo>` overrides for title, description, canonical URL
- `<ArticleJsonLd>` on `/blog/[slug]` — author, datePublished, dateModified, publisher, images
- `<FAQPageJsonLd>` on `/faq`
- `<WebPageJsonLd>` on `/about`, `/methodology`
- `<ProductJsonLd>` on `/pricing` for Pro subscription
- This replaces manual `<Head>` meta tag management across all pages

### next-sitemap (iamvishnusankar/next-sitemap, 3.7k stars)
- `npm install next-sitemap`
- `next-sitemap.config.js` at project root:
  - `siteUrl: 'https://earlyinsider.com'`
  - `changefreq: 'daily'` for article pages, `'weekly'` for static pages
  - `priority: 1.0` for homepage, `0.8` for articles, `0.6` for static
  - `generateRobotsTxt: true` (replaces manual `robots.txt`)
  - Auto-splits sitemap at 5000 URLs (critical as articles grow)
  - Google News sitemap support (finance articles qualify)
- `getServerSideSitemap` for dynamic `/blog/[slug]` routes (queries article DB at request time)
- Add `postbuild` script: `"postbuild": "next-sitemap"` in `package.json`
- Netlify build command: `npm run build && npm run postbuild`

### SEO Checklist Validation (marcobiedermann/search-engine-optimization, 2.7k stars)
One-time checklist applied to the article template during build:
- [ ] Proper `<title>` (55-65 chars, keyword in first half)
- [ ] Meta description (140-155 chars)
- [ ] Canonical URL on every page
- [ ] Open Graph: og:title, og:description, og:image, og:url, og:type
- [ ] Twitter Card: twitter:card=summary_large_image
- [ ] Heading hierarchy: single H1, H2/H3 structure
- [ ] Image alt text on all images
- [ ] Schema markup (Article, FAQ, WebPage as appropriate)
- [ ] Internal links (handled by W13 cross-linking)
- [ ] Mobile-friendly (responsive, no horizontal scroll)
- [ ] Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1

## Technical Approach
- All pages use Figma API extraction for exact specs (spacing, typography, colors)
- Server components by default, client components only where interactivity needed
- Supabase SSR helpers for auth state in server components
- Stripe.js for client-side checkout
- Airtable queries wrapped in helper functions with caching (ISR where appropriate)
- Mobile-first responsive design (Tailwind breakpoints: sm/md/lg/xl)

## Acceptance Criteria
- [ ] All 11 pages render correctly on desktop + mobile
- [ ] Design matches Figma spec (spacing, typography, colors within 2px tolerance)
- [ ] Auth flow: signup → login → protected pages → logout works end-to-end
- [ ] /alerts shows real-time updates via Supabase Realtime
- [ ] /alerts AI analysis blurred for free users, visible for Pro
- [ ] /blog/[slug] renders articles from Airtable with proper styling
- [ ] /pricing Stripe checkout creates subscription
- [ ] /free-report captures email and delivers PDF
- [ ] All pages have proper SEO meta tags
- [ ] Lighthouse performance score > 90 on all pages
