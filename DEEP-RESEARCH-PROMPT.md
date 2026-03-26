# Deep Research Prompt — Automated Business Ideas for 24/7 AI Agent

> **Target**: Claude Code Opus 4.6 with WebSearch + WebFetch tools
> Paste this entire prompt into a new Claude Code session.

---

## Context (carry forward)

You have access to WebSearch and WebFetch tools. You MUST use them extensively throughout this research. Every claim about revenue, marketplace size, or "someone is doing this" MUST be backed by a real URL you fetched and verified. If you cannot find evidence, say "NO EVIDENCE FOUND" — do not fabricate.

### What I have
- VPS: 8GB RAM, 2 CPU, Ubuntu 24, running 24/7
- OpenClaw: AI agent framework that autonomously executes Python, calls APIs, navigates non-anti-bot websites, sends Telegram messages, generates files, processes data
- API keys: OpenAI (GPT-4.1 mini for cheap operations)
- Budget: max €100 setup, max €50/month until revenue positive
- My time: max 30 min/week after initial 1-2 week build

### OpenClaw operational costs — FIXED vs VARIABLE (CRITICAL DISTINCTION)

**FIXED costs** = what we pay even with ZERO customers. This is the burn rate. Must stay under €50/month.
**VARIABLE costs** = what we pay to fulfill an order AFTER a sale. Covered by the sale margin — NOT counted in the €50 budget.

**The agent brain: GPT-4.1 mini** — $0.40/1M input, $1.60/1M output → ~$0.0014 per call
**Code generation: Claude Sonnet 4.6** — $3/1M input, $15/1M output → ~$0.039 per call

Sonnet is used ONLY during the initial build (one-time, paid by me) and for order fulfillment (paid by sale margin). Day-to-day operations run on GPT-4.1 mini only.

**Monthly FIXED costs (at zero sales):**
| Activity | Model | Calls/day | Cost/month |
|---|---|---|---|
| Monitoring (check marketplaces, messages, alerts) | GPT-4.1 mini | 50-100 | $2-4 |
| Active marketing (post on Telegram, X, etc.) | GPT-4.1 mini | 20-50 | $1-2 |
| Marketing decisions (what/where/when to post) | GPT-4.1 mini | 10-20 | $0.50-1 |
| **Total AI fixed** | | **80-170** | **$3.50-7** |

| Other fixed costs | Cost/month |
|---|---|
| VPS (Hostinger) | already paid |
| Platform fees (if any) | $0-12 |
| API subscriptions (SerpApi free tier, etc.) | $0-5 |
| **TOTAL FIXED BURN** | **$4-24/month** |

**Remaining budget for variable/unexpected**: €50 - €24 = **€26+/month margin**

**For EVERY idea, separately calculate:**
1. **Fixed monthly cost** (agent operations + platform fees + API subscriptions) — must be <€50 total
2. **Variable cost per order** (Sonnet calls + API costs to fulfill) — must be covered by sale price with healthy margin
3. **Break-even**: how many sales to cover fixed costs?

### What FAILED (do NOT suggest these)
- Freelance platform automation (Fiverr/Upwork/Freelancer) — browser automation gets banned
- Cold email B2B — too expensive, requires phone calls, too slow to convert
- AI copywriting/content — AI detection catches everything
- Anything requiring manual marketing, customer support, onboarding, or phone calls from me

---

## Your task

Research and produce a comprehensive report: **20 business ideas** (10 with marketplace, 10 without) that a 24/7 AI agent can operate autonomously to generate €500-1000/month within 1-3 months.

Save the final report to: `ryan_cole/BUSINESS-IDEAS-V2.md`

---

## MARKETPLACE REALITY CHECK — research this BEFORE proposing any marketplace idea

Marketplaces have traffic, but "I list it and they come" is a lie. New listings start at page 47 with zero reviews. The real question is: how do you get the FIRST 5-10 sales that trigger the algorithm?

### Mandatory marketplace research (do ALL of these):
- WebSearch: `how long first sale RapidAPI new API listing`
- WebSearch: `how long first sale Gumroad new product`
- WebSearch: `how long first sale Etsy digital download new shop`
- WebSearch: `how long first sale CodeCanyon new plugin`
- WebSearch: `how long first sale Apify Store new actor`
- WebSearch: `how long first sale Notion template marketplace`
- WebSearch: `new seller marketplace visibility problem cold start`
- WebSearch: `drive external traffic to marketplace listing strategy`
- WebSearch: `RapidAPI new API discovery how buyers find APIs`
- WebSearch: `Etsy digital download SEO first page ranking new shop`
- WebSearch: `Gumroad sales without audience zero followers`

### For EVERY marketplace idea, you MUST answer:
1. **Organic discovery**: How many views/impressions does a NEW listing get in week 1 with zero reviews? Find real data.
2. **Time to first sale**: What is the REALISTIC time for a new seller with zero reviews? Not "top sellers" — brand new accounts.
3. **Cold start solution**: How do the first 5-10 sales happen? Specific mechanism.
4. **Ranking algorithm**: Does the marketplace boost listings with external traffic/sales? Can we game the cold start?
5. **Agent marketing combo**: Can the agent drive traffic TO the marketplace listing from external channels? Specifically how?

### The COMBO STRATEGY (marketplace + agent marketing)
The winning model is NOT "marketplace only" or "agent marketing only." It is BOTH:
1. Agent publishes product on marketplace (passive listing)
2. Agent ACTIVELY drives traffic to the listing from external channels (Telegram groups, X/Twitter, GitHub, directories, forums without anti-bot)
3. First 5-10 sales come from agent marketing → marketplace ranking improves → organic traffic kicks in
4. Agent reduces marketing effort as organic grows

For EVERY marketplace idea, specify:
- **Where the agent drives traffic FROM** (specific platform, specific action, frequency)
- **How** (post in Telegram group? Tweet with link? GitHub README? Directory submission?)
- **Volume needed** (how many external visits to get 1 sale? Based on marketplace conversion data)
- **Timeline** (when can agent stop active marketing and rely on organic?)

If an idea has NO viable combo strategy (no way for the agent to drive external traffic), it is a WEAKER idea — rank it lower.

---

## Research methodology — follow this EXACTLY

### Phase 1: Source mining (use WebSearch + WebFetch extensively)

Search each of these source categories. For EVERY search, use WebSearch first, then WebFetch on the most promising results to extract real numbers.

**Revenue-verified databases — search ALL of these:**
1. WebSearch: `site:indiehackers.com "automated" OR "passive" "$500" OR "$1000" OR "$2000" monthly`
2. WebSearch: `site:starterstory.com "automated business" OR "passive income" revenue`
3. WebSearch: `site:flippa.com "automated" OR "passive" monthly revenue` — look at WHAT is being sold and actual MRR numbers
4. WebSearch: `site:acquire.com automated SaaS MRR`

**Maker communities — search ALL of these:**
5. WebSearch: `"I make" "$500" OR "$1000" OR "$2000" "per month" "automated" OR "passive" site:twitter.com OR site:x.com`
6. WebSearch: `#buildinpublic MRR automated passive income`
7. WebSearch: `site:news.ycombinator.com "passive income" OR "automated business" OR "side project revenue"`
8. WebSearch: `Pieter Levels OR Danny Postma OR Marc Lou OR Tony Dinh automated revenue`

**Marketplace research — search ALL of these:**
9. WebSearch for EACH marketplace: `"how much do sellers make on [Apify Store / RapidAPI / Gumroad / LemonSqueezy / Etsy digital / CodeCanyon / Creative Market / Notion templates / Airtable templates]"`
10. WebSearch: `RapidAPI top earning APIs revenue`
11. WebSearch: `Apify Store actor revenue earnings developers`
12. WebSearch: `Gumroad seller earnings median revenue 2025 2026`
13. WebSearch: `Etsy digital downloads seller income realistic`
14. WebSearch: `CodeCanyon Envato author earnings realistic median`
15. WebSearch: `Telegram bot monetization paid subscription revenue`
16. WebSearch: `Discord bot premium revenue earnings`

**Non-obvious sources:**
17. WebSearch: `automated arbitrage bot profit 2025 2026`
18. WebSearch: `monitoring service alerts subscription passive income`
19. WebSearch: `API as a service small developer revenue`
20. WebSearch: `data aggregation service monetization`
21. WebSearch: `price comparison API service revenue`
22. WebSearch: `"done for you" automated service revenue`
23. WebSearch: `WhatsApp bot business revenue subscription`
24. WebSearch: `micro-SaaS solo founder automated revenue 2025 2026`
25. WebSearch: `non-English market automated business less competition`

**Unconventional angles:**
26. WebSearch: `BlackHatWorld "automated" OR "bot" "income" "per month"`
27. WebSearch: `site:producthunt.com "automated" OR "AI" launch monetize`
28. WebSearch: `Google Maps data monetization business`
29. WebSearch: `web scraping service API marketplace revenue`
30. WebSearch: `alert monitoring subscription service solo founder`

For each promising result, use WebFetch to get the actual page content and extract specific revenue numbers, seller counts, and marketplace data.

### Phase 2: Idea generation and filtering

From your research, generate candidate ideas. For EACH candidate, run it through this kill filter BEFORE including it:

**INSTANT KILL — if ANY of these are true, DISCARD the idea immediately:**
- Requires building audience/community/followers before first sale
- Requires content marketing, SEO, or brand building before revenue
- First € comes after month 3
- Requires manual customer support or onboarding
- Requires phone calls or video meetings
- Main deliverable is long-form text (AI detection risk)
- Depends on a single platform that can ban you with no backup
- A popular free tool already does the same thing with no clear differentiation
- 90%+ of sellers/operators in this space make <€100/month
- Requires browser automation on sites with Cloudflare/anti-bot protection
- Setup cost >€100 or monthly cost >€50

**PASS CRITERIA — ALL must be true:**
- Build → List → Someone buys. Within 14 days.
- Payment is DIRECT (credit card for product/service). Not indirect, not "leads," not "maybe later."
- At least ONE real person/company is verifiably doing this NOW with public revenue numbers
- Works with zero audience, zero followers, zero reputation on day 1
- Agent runs it 24/7 with <30 min/week human oversight
- Technically buildable in 1-2 weeks with Python + APIs

### Phase 3: Deep analysis per idea

For EACH idea that passes the kill filter, research and document:

```
## [RANK]. [IDEA NAME]
**Ranking Score: [1-100]** (probability of €500/month × speed to first € × low risk × low cost)

### What it does
[2-3 sentences. Specific, not vague.]

### Revenue model
- Who pays: [specific buyer persona]
- How much: [price point with justification]
- Why they pay: [the specific pain point — verified via reviews/forums/complaints]
- Model: [subscription / one-time / usage-based / per-unit]

### Customer acquisition — FULL FUNNEL (this is the most important section)
- **Primary channel**: [marketplace name OR direct sales channel]
- **Cold start plan**: How do the FIRST 5 customers find us? Be specific — not "they search on the marketplace"
- **Agent marketing combo** (for marketplace ideas): Which external channels does the agent use to drive traffic TO the listing? Specific platform, specific content type, specific frequency, ban risk
- **Agent direct marketing** (for non-marketplace ideas): exact platform(s) where agent posts, content type, frequency per day, ban risk per platform, backup channel if primary gets blocked
- **Organic flywheel**: At what point does organic/marketplace traffic replace active marketing? What triggers it? (reviews, ranking, word of mouth)
- **Channels the agent can use** (ONLY these — anything else needs justification):
  - Telegram groups (API native, zero anti-bot — post useful content, not spam)
  - X/Twitter API (verify cost: consumption-based pricing, estimate for 5-10 posts/day)
  - GitHub repos (create useful open-source tool → link to paid version)
  - Product Hunt (one-time launch, agent prepares everything)
  - Directory submissions (AlternativeTo, SaaSHub, G2, niche directories — one-time)
  - Marketplace SEO (title, description, tags optimization — one-time)
  - Discord servers (bot listing sites, relevant servers — verify anti-bot status)
- **Channels the agent CANNOT use**: Reddit, LinkedIn, Facebook, Instagram, TikTok, cold email

### Revenue projection (show your math)
- Month 1: €[X] — [specific logic: N customers × €Y, based on Z conversion rate from marketplace data]
- Month 2: €[X] — [logic]
- Month 3: €[X] — [logic]
- Assumptions stated explicitly. Optimistic AND pessimistic scenario.

### Costs (FIXED vs VARIABLE — separate them)
- **Setup (one-time)**: €[X] — [itemized, includes Sonnet costs during build]
- **Monthly FIXED (at zero sales)**: €[X] — [itemized: GPT-4.1 mini operations, platform fees, API subscriptions]
- **Variable per order**: €[X] — [itemized: Sonnet calls for fulfillment, API costs per delivery]
- **Break-even**: [N] sales/month to cover fixed costs
- **Margin per sale**: €[sale price] - €[variable cost] = €[X] ([Y]% margin)

### Agent vs Human split
- Agent does: [specific automated tasks]
- I do: [specific manual tasks, ideally "nothing after build"]
- Build time: [X days/weeks]

### Risks (real, not generic)
1. [Specific risk with specific mitigation]
2. [Specific risk with specific mitigation]
3. [Specific risk with specific mitigation]

### Evidence (MUST include real URLs)
- [URL]: [what it proves — revenue number, seller count, marketplace data]
- [URL]: [what it proves]
- Median seller/operator revenue: €[X]/month — source: [URL or "NO DATA FOUND"]

### Competitive landscape
- Free alternatives: [list them]
- Why someone pays us anyway: [specific differentiation — NOT "we're cheaper"]

### Churn & retention
- Estimated churn: [X]%/month — source: [URL or industry benchmark]
- Average customer lifetime: [X months]
- New customers needed monthly to maintain €500/month: [X]

### Prerequisite checklist
| # | Prerequisite | Pass/Fail | Notes |
|---|---|---|---|
| P1 | Zero manual work after build | | |
| P2 | €500+/month in 1-3 months | | |
| P3 | Setup <€100, monthly <€50 | | |
| P4 | Automatic customer acquisition | | |
| P5 | Buildable in 1-2 weeks | | |
| P6 | Legal and platform-safe | | |
| P7 | Verified median revenue | | |
| P8 | Sustainable marketing | | |
| P9 | No dominant free alternative | | |
| P10 | Acceptable churn | | |

### VERDICT: [VIABLE / NOT VIABLE / BORDERLINE — explain why]
```

### Phase 4: Top 6 action plans

For the top 3 marketplace ideas AND top 3 non-marketplace ideas, add:

```
### Week 1 Action Plan
- Day 1: [exact action]
- Day 2: [exact action]
- Day 3-4: [exact actions]
- Day 5-7: [exact actions — should end with product LIVE]
- Day 8-14: [first sales expected — how and from where]
```

---

## Output structure

Save to `ryan_cole/BUSINESS-IDEAS-V2.md` with this structure:

```markdown
# Automated Business Ideas V2 — Evidence-Based Research
> Generated: [date]
> Research method: 30+ targeted web searches with URL verification

## Executive Summary
[Top 3 recommendations with 1-sentence justification each]

## Research Sources Consulted
[List every URL you actually fetched with what you found]

---

## PART A: Marketplace Ideas (Built-in Traffic)
[10 ideas ranked best to worst, or fewer if you cannot find 10 that pass all filters — be honest]

---

## PART B: Non-Marketplace Ideas (Agent-Driven Acquisition)
[10 ideas ranked best to worst, or fewer if honest]

---

## PART C: Week 1 Action Plans (Top 6)
[Detailed plans for top 3 from Part A + top 3 from Part B]

---

## Appendix: Killed Ideas
[Ideas you researched but killed at the filter stage, with the specific reason — this shows thoroughness]
```

---

## CRITICAL RULES

1. **EVERY revenue claim MUST have a URL source.** If you searched and found nothing, write "NO EVIDENCE FOUND — this number is my estimate based on [reasoning]." NEVER present estimates as facts.

2. **Search BEFORE writing.** Do not write any idea section until you have searched for evidence. The research comes first, the writing second.

3. **Median, not mean, not top earner.** When you find revenue data, always look for the MEDIAN or typical seller, not the top 1%. If only top earner data exists, discount it by 90% and flag it.

4. **Be honest about what you cannot verify.** If an idea sounds good but you cannot find anyone doing it with real revenue, say so. "Theoretically viable but no evidence of anyone doing this" is a valid finding.

5. **Kill ideas aggressively.** It is better to present 5 truly viable ideas than 10 where half are wishful thinking. If you cannot find 10 viable ideas per category, present fewer and explain why.

6. **Non-English markets are valid.** Search in Italian, German, Spanish, French too. Less competition often means more opportunity.

7. **Think beyond tech.** The agent can serve ANY industry — restaurants, musicians, real estate, fitness, healthcare, legal. Search for automation opportunities in non-tech verticals too.

8. **Do NOT rehash failed approaches.** Freelance bidding, cold email, AI copywriting are DEAD for this setup. Do not suggest variants of these.

9. **Inspiration angles to explore** (but do not limit yourself to these):
   - Arbitrage (buy low, sell high — automatically)
   - Monitoring/alerts as a service
   - Digital asset generation + marketplace listing
   - Paid Telegram/Discord/WhatsApp bots
   - Automating tasks people hate
   - Information asymmetry exploitation
   - Micro-SaaS on autopilot
   - Non-English markets
   - Public data monetization
   - "Done for you" services where the client never knows it is an agent
   - Indirect physical-world services (booking, price comparison, deal finding)
   - Data products (datasets, reports, APIs)
   - Surprise me with something I have not thought of
