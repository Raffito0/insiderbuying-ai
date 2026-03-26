# 05 — Data Studies & Reports

## Summary
Build 3 n8n workflows for premium data products: W3 bi-monthly data studies, W15 on-demand premium report PDFs (Stripe-triggered), and W16 monthly lead magnet PDF. These are revenue drivers (reports) and lead generators (studies + lead magnet).

## Timeline: Days 3-5 (10-12 hours)

## Dependencies
- 01-infrastructure (Stripe webhooks, R2 storage, Airtable tables, Supabase reports table)
- 03-dexter-content-engine (Financial Datasets API integration patterns, Dexter sub-workflow)

## Workflows

### W3 — Data Studies
**Schedule**: 1st and 15th of each month (6 studies/year)

**Purpose**: Free, high-value content that establishes authority and drives SEO traffic. Each study analyzes a specific insider buying pattern or market signal.

**Pipeline**:
1. **Select study topic** — rotating list:
   - "Top 10 Insider Buys This Month by Significance Score"
   - "Cluster Buy Signals: Which Sectors Are Insiders Loading Up On?"
   - "CEO vs CFO Buying Patterns: Who Has the Better Track Record?"
   - "Small Cap Insider Buying: Hidden Gems Under $1B Market Cap"
   - "Insider Buying After Earnings Misses: Contrarian Signal Analysis"
   - "Quarterly Insider Transaction Volume: Bull or Bear Signal?"
2. **Data collection** — query Airtable Insider_Alerts + Financial_Cache:
   - Aggregate transactions by topic parameters
   - Pull price performance data for backtesting (Financial Datasets API)
   - Calculate statistics: average return after insider buy, hit rate, sector breakdown
3. **AI analysis** — Claude Sonnet 4.6:
   - Input: aggregated data, statistics, historical context
   - Output: structured study with key findings, methodology, charts data, implications
   - Tone: same as blog articles (analyst writing for sophisticated retail)
4. **Charts data** — generate chart-ready JSON:
   - Bar charts (sector breakdown, top tickers)
   - Line charts (cumulative return vs S&P 500)
   - Scatter plots (significance score vs subsequent return)
   - Charts rendered on site with a JS charting library (Recharts or Chart.js)
5. **Write to Airtable** — Data_Studies table, status='published'
6. **Site rendering** — /reports page shows new study card
7. **Trigger W6** — include in next newsletter
8. **Trigger W7** — X post about key finding

**Cost per study**: ~$0.10-0.20 (Claude) + ~$0.05 (Financial Datasets queries) = ~$0.15-0.25

### W15 — Premium Report PDF Generation
**Trigger**: Stripe webhook `checkout.session.completed` for report product

**Pipeline**:
1. **Parse webhook** — extract user_id, report_type, payment_id, customer_email
2. **Determine report** — based on product metadata:
   - Deep Dive Stock Report: single ticker, comprehensive analysis
   - Sector Insider Activity Report: full sector breakdown
   - Custom Watchlist Report: user's watched tickers
3. **Data gathering** — call Dexter sub-workflow for each ticker in report:
   - Financial data, insider trades, price history, competitor data
   - For sector reports: aggregate across all tickers in sector
4. **AI generation** — Claude Sonnet 4.6 (long form, 12K tokens):
   - Report-specific prompt (different from article prompt)
   - Structure: Executive Summary, Key Findings, Detailed Analysis per ticker, Risk Assessment, Conclusion
   - Include data for charts/tables
5. **PDF rendering** — Puppeteer on VPS:
   - HTML template with InsiderBuying.ai branding
   - Navy header, Montaga headings, Inter body, Space Mono for data
   - Charts rendered as SVG/Canvas in HTML, captured by Puppeteer
   - Page numbers, table of contents, disclaimer footer
   - Output: high-quality PDF (A4 portrait)
6. **Upload PDF** — R2 storage (permanent URL, but behind auth)
7. **Save record** — Supabase reports table: user_id, report_type, pdf_url, payment_id
8. **Deliver** — Resend email to customer with PDF attachment + download link
9. **Update Airtable** — log report generation for analytics

**Cost per report**: ~$0.10-0.30 (Claude) + ~$0.05 (Dexter APIs) + $0 (Puppeteer self-hosted) = ~$0.15-0.35
**Report sale price**: $9-29 depending on type → massive margin

### W16 — Lead Magnet PDF
**Schedule**: Last day of each month

**Purpose**: Monthly "Insider Buying Backtest Report" — free PDF that proves the value of insider signal tracking. Permanent URL at /free-report, updated monthly.

**Pipeline**:
1. **Backtest data** — query last month's insider alerts:
   - All alerts with significance_score >= 7
   - For each: calculate return since filing date (using Financial Datasets price data)
   - Overall hit rate (% of buys that led to positive returns after 30 days)
   - Best performer, worst performer
   - Cluster buy performance vs individual buys
2. **AI narrative** — Claude Sonnet 4.6:
   - Write engaging report with real data
   - Include "what would have happened if you followed these signals" scenario
   - Tone: impressive but honest (include losses too)
   - CTA: upgrade to Pro for real-time alerts
3. **PDF rendering** — same Puppeteer pipeline as W15:
   - Branded template
   - Charts: monthly returns bar chart, sector pie chart, top 5 performers table
   - 4-6 pages
4. **Upload to R2** — permanent public URL (overwrite previous month's file)
5. **Update Airtable** — Lead_Magnet_Versions table
6. **Update Beehiiv** — API call to update the lead magnet download URL in Beehiiv automation
7. **Update /free-report page** — the page always links to latest version (R2 URL is stable)

**Cost per month**: ~$0.10 (Claude) + ~$0.05 (data queries) = ~$0.15

## PDF Template Design
Shared HTML template for W15 and W16:
- **Header**: InsiderBuying.ai logo, report title, date, type badge
- **Colors**: Navy #002A5E header, white body, #00D26A for positive returns, #FF3B3B for negative
- **Fonts**: Montaga for headings, Inter for body, Space Mono for data/numbers
- **Charts**: Recharts or D3.js rendered in HTML, Puppeteer captures as-is
- **Footer**: disclaimer ("not financial advice"), page numbers, InsiderBuying.ai URL
- **Cover page**: title, period, key stat highlight, subtle background pattern
- **Page size**: US Letter (8.5x11), ~50px margins

## Technical Notes
- Puppeteer PDF: use `page.pdf()` with `format: 'Letter'`, `printBackground: true`
- R2 upload for lead magnet: use a stable key like `reports/lead-magnet-latest.pdf` so URL never changes
- Stripe webhook: verify signature with `stripe.webhooks.constructEvent()`
- Beehiiv API: check docs for automation/sequence update endpoint
- Charts in PDF: render HTML with inline data, Puppeteer captures pixel-perfect
- Data study charts on the site: return charts_data JSON from Airtable, render client-side with Recharts

## n8n Code Files
- `n8n/code/insiderbuying/data-study.js` — W3 topic selection, data aggregation, AI analysis
- `n8n/code/insiderbuying/generate-report.js` — W15 report generation pipeline
- `n8n/code/insiderbuying/generate-lead-magnet.js` — W16 backtest + PDF
- `n8n/code/insiderbuying/render-pdf.js` — shared Puppeteer PDF rendering logic
- PDF HTML templates in `ryan_cole/insiderbuying-site/pdf-templates/`

## Acceptance Criteria
- [ ] W3 generates a data study with real aggregated data + AI analysis
- [ ] W3 charts_data renders correctly on /reports page
- [ ] W15 triggers on Stripe webhook and generates PDF within 2 minutes
- [ ] W15 PDF is well-formatted (branding, charts, proper pagination)
- [ ] W15 delivers PDF via email successfully
- [ ] W16 generates monthly backtest with real performance data
- [ ] W16 PDF uploads to R2 at stable URL
- [ ] /free-report page serves the latest lead magnet
- [ ] All PDFs include proper disclaimer footer
- [ ] PDF quality: readable, professional, no layout breaks
