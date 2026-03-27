# 07 — Outreach & SEO Monitoring

## Summary
Build 3 n8n workflows for link building outreach (W10 prospect finder, W11 email sender) and search performance tracking (W14 SEO monitoring). This is the long-term organic growth engine — backlinks + rank tracking.

## Timeline: Days 5-7 (8-10 hours)

## Dependencies
- 03-dexter-content-engine (published articles for outreach pitches and SEO tracking)
- External: Gmail account for SMTP, Hunter.io/Snov.io/Apollo free tier accounts, Google Search Console verified property

## Workflows

### W10 — Outreach Prospect Finder
**Schedule**: Weekly, Tuesday (after newsletter goes out Monday, fresh content to pitch)

**Pipeline**:
1. **Search for prospects** — Google Search API (or SerpAPI):
   - Queries:
     - "insider trading blog" / "insider buying analysis"
     - "stock market newsletter" / "investing newsletter"
     - "finance podcast guests" / "stock market podcast"
     - "best investing blogs" / "financial analysis blogs"
     - "{ticker} analysis" for tickers from this week's articles
   - Extract: domain, page title, contact page URL
   - Filter: domain authority > 20 (check via free DA checker), English language, active (published in last 90 days)
2. **Email discovery** — try in order (all free tiers):
   - Hunter.io: 25 free searches/month → find email by domain
   - Snov.io: 50 free credits/month → email finder
   - Apollo.io: 60 free credits/month → people search
   - Fallback: check /about, /contact pages for email
3. **Scoring** — for each prospect:
   - Domain authority (0-100)
   - Relevance to insider trading / stock analysis (1-10, AI-scored)
   - Contact quality (verified email = 10, guess = 5, none = 0)
   - Recency (posted in last 30 days = 10, 90 days = 5, older = 2)
   - `priority = DA * 0.3 + relevance * 0.3 + contact * 0.2 + recency * 0.2`
4. **Dedup** — check Airtable Outreach_Prospects by domain (no double-contacting)
5. **Write to Airtable** — Outreach_Prospects table, status='found'
6. **Target**: 50 new prospects/week (enough for W11's 50 emails/week)

**Cost**: ~$0 (free tier APIs) + potential $10/mo if Google Search API needed (100 queries/day free)

### W11 — Outreach Email Sender
**Schedule**: Daily, Mon-Fri, 9:00 AM EST (10 emails/day = 50/week)

**Pipeline**:
1. **Select prospects** — query Airtable Outreach_Prospects:
   - status='found', has verified email
   - ORDER BY priority DESC
   - LIMIT 10 per day
2. **Generate personalized email** — Claude Haiku:
   - Input: prospect name, website, recent article of theirs, our relevant article
   - Template structure (NOT a template — each email is unique):
     - Subject: specific reference to their work (NOT "Guest post opportunity")
     - Opening: genuine comment on their recent article (prove you read it)
     - Value prop: "I published [specific analysis] that your readers might find useful" — reference our article by topic, not by link
     - Ask: guest post / data contribution / resource mention (match what fits their site)
     - Sign-off: short, professional, Ryan Cole
   - Rules:
     - Max 150 words (short emails get replies)
     - Zero templates language ("I hope this email finds you well" = instant delete)
     - One CTA only
     - Include 1 specific data point from our article
3. **Send via Gmail SMTP**:
   - From: ryan@insiderbuying.ai (or whatever the domain email is)
   - SMTP: Gmail with app password
   - Rate: 10/day (well under Gmail's 500/day limit)
   - Random delay between sends (30s-5min) to avoid burst patterns
4. **Log** — Airtable Outreach_Log: prospect, email_type='initial', sent_at
5. **Update prospect** — status='contacted'

**Follow-up** (Day 5 after initial):
1. **Check for reply** — query Outreach_Log where email_type='initial' AND sent_at <= 5 days ago AND no corresponding 'reply' entry
2. **Generate follow-up** — Claude Haiku:
   - Short (2-3 sentences max)
   - Add new value: mention a new article or data point published since initial email
   - NOT "just checking in" or "bumping this"
3. **Send follow-up** — same Gmail SMTP
4. **Log** — email_type='followup'
5. **If no reply after follow-up** — status='no_reply', don't contact again for 90 days

**Cost**: ~$0.001/email (Haiku) * 50/week = ~$0.05/week

### W14 — SEO Monitoring
**Schedule**: Daily, 6:00 AM EST

**Pipeline**:
1. **Google Search Console API** — fetch last 7 days of data:
   - Queries: all queries where site appeared in search results
   - Metrics per query: position, clicks, impressions, CTR
   - Filter by pages (article URLs)
2. **Map to keywords** — match GSC queries to Airtable Keywords table
3. **Write to Airtable** — SEO_Rankings table: keyword, date, position, clicks, impressions, CTR
4. **Detect changes** — compare today vs 7 days ago:
   - Improvements: any keyword moved up 5+ positions
   - Drops: any keyword dropped 5+ positions
   - New rankings: keywords appearing in top 100 for first time
   - Top 10 entries: keywords entering first page
5. **Alert on significant changes** — Telegram message:
   - Green alerts: "NVDA earnings analysis" moved from #23 → #8 (+15 positions, 47 clicks this week)
   - Red alerts: "insider buying signals" dropped from #12 → #24 (-12 positions)
   - Celebrate top 10 entries
6. **Weekly summary** — every Monday:
   - Total organic traffic (clicks)
   - Top 10 keywords by clicks
   - Biggest movers (up and down)
   - Keywords close to page 1 (positions 11-20 = opportunity)

**Cost**: $0 (GSC API is free)

## Gmail SMTP Setup
- Create Gmail account for outreach (or use custom domain email)
- Enable 2FA + generate App Password
- SMTP settings: smtp.gmail.com, port 587, TLS
- n8n: use built-in "Send Email" node with SMTP credentials
- **Warmup**: first 2 weeks send max 5/day, gradually increase to 10/day
- Monitor deliverability (check for bounces in Outreach_Log)

## Google Search Console Setup
- Verify earlyinsider.com property in GSC
- Generate API credentials (service account or OAuth)
- Store credentials securely in n8n

## claude-seo Integration (AgriciDaniel/claude-seo, 3.3k stars)

**Purpose**: Ongoing automated SEO quality monitoring. 16 sub-skills for site audits, schema validation, E-E-A-T scoring, and AI search optimization (GEO/AEO for Google AI Overviews, ChatGPT Search, Perplexity).

**Install**: Clone repo into Claude Code skills directory. Provides `/seo` command with sub-commands.

**Recurring audit schedule** (run manually or via Claude Code scheduled tasks):
- **Weekly**: `/seo audit earlyinsider.com` — full technical SEO audit (broken links, missing meta, schema errors, Core Web Vitals)
- **After each article template change**: `/seo schema` — validate ArticleJsonLd, FAQPageJsonLd, and other structured data
- **Monthly**: `/seo content-quality` — E-E-A-T audit across published articles (critical for finance/YMYL content)
- **Monthly**: `/seo geo` — AI search optimization check (are our articles appearing in Google AI Overviews?)

**Programmatic SEO quality gates** (integrate into W2 article pipeline):
- claude-seo has built-in quality gates for content-at-scale detection
- After W2 generates an article, run `/seo content-check` on the output
- Flags: thin content, keyword stuffing, missing E-E-A-T signals, duplicate patterns
- This prevents Google from seeing 3 articles/day as "AI spam farm"

**GEO/AEO optimization** (Google AI Overviews, Perplexity, ChatGPT Search):
- Finance queries increasingly show AI Overviews
- claude-seo `/seo geo` analyzes how to structure content for AI citation
- Key tactics: clear data tables, definitive statements with sources, FAQ sections, structured data
- This is a competitive advantage — most finance blogs don't optimize for AI search yet

**DataForSEO MCP integration**: claude-seo can connect to DataForSEO via MCP for live keyword data during audits. Same API key as W1.

## Technical Notes
- Hunter.io free tier: 25 searches/month + 50 verifications. May need to rotate between Hunter/Snov/Apollo
- Gmail daily limit: 500 emails/day (we use 10, well within limits)
- Gmail may block sending if pattern looks automated — random delays essential
- GSC API returns data with 2-3 day delay (today's data available ~2 days later)
- GSC API quota: 25,000 requests/day (more than enough)
- For DA checking: use free tools like Website Authority Checker by Ahrefs (limited free queries)

## n8n Code Files
- `n8n/code/insiderbuying/find-prospects.js` — W10 Google search + email discovery + scoring
- `n8n/code/insiderbuying/send-outreach.js` — W11 email generation + Gmail SMTP + follow-up logic
- `n8n/code/insiderbuying/seo-monitor.js` — W14 GSC data pull + change detection + alerts

## Acceptance Criteria
- [ ] W10 finds 50+ prospects/week with emails from free tier tools
- [ ] W10 correctly deduplicates against existing prospects
- [ ] W10 priority scoring produces reasonable rankings (manual spot-check)
- [ ] W11 generates personalized emails that don't sound templated (spot-check 10)
- [ ] W11 sends emails via Gmail SMTP with random delays
- [ ] W11 sends follow-up on day 5 if no reply
- [ ] W11 respects 10/day rate limit
- [ ] W14 pulls GSC data and writes to Airtable daily
- [ ] W14 detects 5+ position changes and sends Telegram alerts
- [ ] W14 weekly summary is accurate and actionable
- [ ] All email sending respects warmup schedule (5/day first 2 weeks, then 10/day)
- [ ] claude-seo installed and `/seo audit earlyinsider.com` runs successfully
- [ ] claude-seo schema validation passes for all page types (Article, FAQ, WebPage, Product)
- [ ] claude-seo E-E-A-T audit on 10 sample articles scores acceptable for YMYL finance content
