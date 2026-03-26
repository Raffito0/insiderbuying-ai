# SkillEdge.ai — Complete Project Plan

**Version**: 1.0
**Status**: Ready for Implementation
**Date**: 2026-03-24
**Project Lead**: openclaw

---

## Executive Summary

**SkillEdge.ai** is a premium Claude Code skills marketplace targeting professional developers, solopreneurs, and agencies. Unlike generic GitHub skills (3/10 quality), SkillEdge ships only 10/10 quality skills — production-ready, thoroughly tested, battle-hardened solutions to real developer pain points.

**Core Value Proposition**:
- **For Developers**: Skip 30+ hours of research/testing. Buy one €9/month skill that's already been stress-tested across 9 scenarios (3 project sizes × 3 Claude models, 80/100 minimum score)
- **For SkillEdge**: 3 revenue streams (lead capture, affiliate commissions, premium subscription), minimal COGS (~$45/month), profitable at 50-100 paying subscribers
- **Competitive Moat**: Only platform focused on *quality* + *real pain points* + *4-phase engineering workflow* = 10-20x higher value density than GitHub

**30-Day Launch Timeline**:
- Week 1: Platform setup + account creation (landing page, X automation, Telegram bot)
- Week 2-3: Develop 5 flagship skills in parallel using the 4-phase workflow
- Week 4: Launch + marketing blitz + iterate based on feedback

---

## Market Analysis

### Why Premium Skills Win

**The Problem**: Existing skill ecosystems are broken.
- GitHub: Free skills, 0 quality control, developers waste time filtering garbage
- Gumroad/Giddy: "Skills" are random how-tos, not production-ready tools
- Anthropic: Didn't build a marketplace (opportunity gap)

**The Opportunity**: Developers will pay for *proven* quality.
- Senior developers: €9/month is irrelevant. They pay for solutions that save 10+ hours
- Teams: 10-person startup pays €180/month (20 people × €9) for ONE best-in-class skill
- Agencies: Bundle 10 skills for clients (€90/month = 10% of a single contract)

### Competitive Landscape

| Platform | Quality | Testing | Support | Cost | Our Edge |
|----------|---------|---------|---------|------|----------|
| GitHub | 2/10 | None | Community | Free | We test everything |
| Anthropic Docs | 6/10 | Manual | Docs only | Free | We add context |
| Gumroad "Skills" | 3/10 | None | None | €10-50 | We guarantee results |
| **SkillEdge** | **10/10** | **9-test matrix** | **Email** | **€9/month** | **Only reliable source** |

### Target Customer Segments

**Tier 1 (Primary)**: Freelance developers & solopreneurs
- Pain: Repetitive tasks, unclear Claude patterns, wasted API money
- Budget: €9-50/month
- Acquisition: X marketing (reply to pain point tweets)
- LTV: €50-150 (5-16 month retention)

**Tier 2 (Secondary)**: Small dev teams (5-15 people)
- Pain: Onboarding Claude, quality inconsistency, training costs
- Budget: €180-500/month (team subscriptions)
- Acquisition: Content marketing, referral partnerships
- LTV: €500-2000 (year+ retention)

**Tier 3 (Enterprise)**: Agencies building Claude products
- Pain: Client SLA/quality requirements, debugging Claude responses
- Budget: €2000+/month (custom skills)
- Acquisition: Direct outreach, partnerships
- LTV: €10k+ (multi-year contracts)

---

## Product Strategy

### Skills Catalog Approach

**Year 1 Goal**: 25-30 production-ready skills covering the most painful developer workflows.

**First 5 Skills** (Month 1 launches):
1. **DB Guardian** — Query optimization + schema analysis (saves 10+ hours per sprint)
2. **Code Reviewer Pro** — Comprehensive multi-file code review with risk detection
3. **API Contract Builder** — OpenAPI spec generator from chat descriptions
4. **RegEx Wizard** — Convert plain English to regex with test cases
5. **Prompt Optimizer** — Improve existing Claude prompts for cost/quality

**Future Skills** (Month 2-3):
- Error Debugger (stack trace → root cause → fix)
- Data Migration Helper (schema transform + validation)
- Security Auditor (OWASP Top 10 checks)
- Performance Profiler (bottleneck detection + optimization)
- Test Generator (unit/integration test scaffolding)
- [+15 more based on Reddit/GitHub/X feedback]

### Quality Standards (The 10/10 Guarantee)

Every skill shipped must pass **3 criteria**:

**1. Engineering Quality** (80/100 minimum on 9-test matrix):
- 3 project sizes: tiny (1-5 files), medium (10-30 files), large (50+ files)
- 3 Claude models: Haiku (cost-optimized), Sonnet (balanced), Opus (premium)
- 27 total tests. Minimum 80/100 = ≥21.6 tests pass at target quality level
- Test rubric: Does the skill solve the actual problem? Is the output production-ready? Did it fail gracefully when pushed?

**2. Documentation** (every skill ships with):
- Problem statement + examples (1 page)
- Before/after screenshots (2-3 images)
- Video demo (2-3 minutes)
- Troubleshooting guide (common failures + workarounds)
- API cost breakdown (estimated tokens per use case)

**3. Real-World Validation** (collected before launch):
- Used internally by the team for 1-2 weeks
- Tested by 5-10 beta users (collected feedback)
- Documented at least 1 "oh shit" moment (the skill solved something unexpected)

### 4-Phase Skill Creation Workflow

#### Phase 1: Pain Discovery (4 hours)

**Goal**: Identify a real, repeatable pain point worth €9/month to solve.

**Process**:
1. Search Reddit (r/learnprogramming, r/webdev, r/python) for common problems
2. Search X for pain-point tweets from developers (@dabit3, @echan00, @tjholowaychuk)
3. Search GitHub issues for "how do I..." questions in popular repos
4. Rank by: frequency (how often does this come up?) × severity (how much does it hurt?)

**Output**: Pain statement + 3 real-world examples. Example:
```
Pain: "I have a 200-line regexes in my codebase and I can't remember
       why each one exists. New team members are confused."

Examples:
1. Email validation regex — 47 character monstrosity
2. URL parsing regex — breaks on edge cases
3. Phone number validation — hardcoded for US only
```

#### Phase 2: Skill Engineering (8-10 hours)

**Goal**: Build a Claude prompt/tool that solves the pain consistently.

**The 7 Rules of Skill Engineering**:
1. **Problem-First Prompting**: Describe the PROBLEM, not the format. ("Help me understand why this regex breaks" not "Output a JSON object")
2. **Guardrails Over Freedom**: Give Claude constraints. (Max output tokens, required output format, banned patterns)
3. **Checklist Pattern**: Structure prompts as step-by-step checklists. Claude follows structure better than freeform instructions
4. **Output Formatting**: Always specify exact output format (JSON schema, markdown sections, code blocks)
5. **Failure Modes**: Test what happens when input is invalid/edge case. Build recovery into prompt
6. **Cost Awareness**: Estimate tokens. Optimize expensive calls (vision API, long context windows)
7. **Feedback Loop**: Ask Claude to explain its reasoning. Build in self-verification steps

**Example: RegEx Wizard Skill Prompt**:
```
You are a regex expert. Your job: convert plain English descriptions into
production-ready regex patterns.

INPUT: User description of what they want to match
OUTPUT: JSON { pattern: "...", tests: [...], explanation: "..." }

GUARDRAILS:
- Never output untested patterns
- Always include 5 test cases (3 positive, 2 negative)
- Explain why each character matters (group, quantifier, anchor, etc.)

FAILURE MODES:
- User asks for ambiguous pattern? Ask clarifying questions
- Edge case found in tests? Refine pattern iteratively
- Too complex? Suggest breaking into multiple regexes
```

**Process**:
1. Draft initial prompt (based on pain statement)
2. Test with 5 example inputs (tiny → medium → large)
3. Refine based on failures
4. Measure tokens + cost
5. Build error handling
6. Document internal testing results

**Output**: Tested skill prompt + internal test logs + token cost estimate

#### Phase 3: Stress Test (9-test matrix, 6-8 hours)

**Goal**: Ensure the skill works consistently across project sizes and Claude models.

**The 9-Test Matrix**:
```
                  Haiku (Fast)  Sonnet (Balanced)  Opus (Premium)
Tiny (1-5 files)     ✓ Test 1        ✓ Test 2          ✓ Test 3
Medium (10-30)       ✓ Test 4        ✓ Test 5          ✓ Test 6
Large (50+)          ✓ Test 7        ✓ Test 8          ✓ Test 9
```

**Scoring Rubric** (per test):
- 10/10: Perfect output, no issues, production-ready
- 8/10: Output works but has minor quirks (edge case not covered)
- 6/10: Output solves the problem but needs manual cleanup
- 4/10: Output is 50% useful (needs major rework)
- 0/10: Complete failure (wrong approach, didn't understand)

**Pass Criteria**: Average score ≥ 80/100 (i.e., ≥21.6 of 27 points)

**Example Test (RegEx Wizard, Haiku, Tiny)**:
```
Input: "Email validation - should accept gmail.com but reject gmail@com"
Expected: Valid regex, 5 test cases, clear explanation
Actual Score: 9/10 (worked perfectly, minor formatting preference)

Result: PASS ✓
```

**Process**:
1. Create 9 test inputs (real-world examples from Reddit/GitHub)
2. Run each through Claude via API (track tokens + cost)
3. Score each output
4. Document failures
5. If ≥80: Move to Phase 4
6. If <80: Fix prompt + re-test Phase 2 + Phase 3

**Output**: Test matrix spreadsheet + scoring breakdown + cost analysis

#### Phase 4: Package (2-3 hours)

**Goal**: Create launch-ready marketing assets + documentation.

**Deliverables**:

1. **Documentation** (1 markdown page):
   - What problem does this solve?
   - Who is it for?
   - How much does it cost? (€9/month)
   - How do I use it? (3 concrete examples)
   - Troubleshooting guide

2. **Before/After Screenshots** (3-4 images):
   - Screenshot 1: The problem (raw regex, messy code, confusion)
   - Screenshot 2: After using skill (clean output, clear explanation)
   - Screenshot 3: Edge case handling (graceful failure, clarification)
   - Screenshot 4: Cost breakdown (tokens used, API cost)

3. **Video Demo** (2-3 minutes):
   - Problem setup (30s)
   - Using the skill (1m)
   - Results + walkthrough (30s)
   - Bonus: Cost analysis (15s)

4. **Social Content** (for X launch):
   - Hook tweet (problem statement)
   - Follow-up tweets (3-4 examples)
   - Testimonial (internal team or beta user)
   - FAQ thread (common questions)

5. **Beta Feedback Summary**:
   - 5-10 beta user responses
   - Common requests
   - Iterations planned

**Timeline Per Skill**: ~25 hours total
- Phase 1: 4 hours (pain discovery)
- Phase 2: 8-10 hours (engineering)
- Phase 3: 6-8 hours (testing)
- Phase 4: 2-3 hours (packaging)

**Throughput**: ~1 skill per business day = 5/week = 25/month

---

## Go-to-Market Strategy

### X (Twitter) Marketing — Hybrid Approach

**Goal**: Find viral tech tweets early, reply with SkillEdge skills before the post gets 10k+ engagement.

#### Tier 1: Real-Time Monitoring (Tasker + X Push)

**Setup**: 10-40 second latency (your phone gets notified before most people)

**How It Works**:
1. Enable X push notifications on secondary account (SkillEdge brand account)
2. Tasker on Android phone: listen for "notification from X" event
3. Trigger: Check if notification matches keywords (regex on notification text)
4. Action: Open URL in browser immediately
5. You reply within 60 seconds (first 20 replies get 90% of engagement)

**Tier 1 Targets** (20-30 accounts):
- @dabit3, @echan00, @tjholowaychuk, @jacksonwrites (major dev influencers)
- @OpenAI, @anthropic (official announcements)
- #claudecoding, #devtools hashtag posters with 10k+ followers

**Tasker + X Push Automation Script** (pseudocode):
```
TRIGGER: X notification received
IF notification_text contains {
  "claude", "regex", "database", "api",
  "debug", "error", "help", "how"
}
THEN:
  - Extract notification content
  - Open X in browser
  - Pre-fill reply with relevant skill + link
  - Send me Telegram alert (so I know to check)
```

**Cost**: Free (Tasker is free, X push is built-in)

#### Tier 2: Scheduled API Polling (10-15 min intervals)

**Setup**: Every 10-15 minutes, check trending dev topics on X

**How It Works**:
1. X API v2: `GET /2/tweets/search/recent` with filters
2. Keywords: "database" OR "api" OR "regex" OR "debug" OR "claude"
3. Min engagement: 100+ likes
4. Recent: last 24 hours
5. Filter out: news, promotions, spam

**Search Query**:
```
(database OR api OR regex OR debug OR claude)
-is:retweet -is:reply
lang:en
min_faves:100
```

**Tier 2 Targets** (long tail):
- 5k-50k follower developers
- Specific hashtags (#devtools, #webdev, #pythondeveloper)
- Keyword-based (whenever someone mentions pain points)

**Cost**: X API v2 Pay-Per-Use
- 1 search request = $0.01
- 30 searches/month = $0.30
- ~100 likes per request = $0.0001 per engagement check

#### Tier 3: Keyword Catch-All (30 min polling)

**Setup**: Once per 30 minutes, catch new discussions

**How It Works**:
1. Same API polling, broader keywords
2. Lower engagement threshold (50+ likes)
3. Respond within 2-3 hours
4. Focus on high-quality accounts (verified, 10k+ followers)

**Tier 3 Targets** (everything else):
- Communities, subreddits, HN (via RSS search)
- Longer tail of developers

**Cost**: Negligible ($0.10-0.20/month)

### Reply Template (Copy-Paste, Customize)

```
Solving this exact problem is why we built SkillEdge.

[Skill Name] handles [specific pain point] in ~2 min.

Before: [messy code/confusion]
After: [clean solution]

Try it free → [link]
```

**Real Examples**:

Example 1 (Regex pain):
```
Regex debugged regex problems > 100 times this week.

RegEx Wizard converts English to production-ready patterns.

"Email validation fails on .uk domains" → [regex] + test cases

€9/month. Save 10+ hours. Link: [skilledge.ai/regex]
```

Example 2 (API design):
```
API design is hard. Standards are confusing.

API Contract Builder generates OpenAPI specs from descriptions.

"Build a REST API for saas payment webhook" → [full spec]

€9/month. Production-ready. Link: [skilledge.ai/api]
```

### X Engagement Strategy

**Goal**: Establish credibility, build audience, get link clicks.

**Phase 1 (Weeks 1-2)**: "Teaching mode"
- Post 3-5 free tips per day (no skill plugging)
- Show problems (screenshots of real bugs, confused developers)
- Build audience to 500-1000 followers

**Phase 2 (Weeks 3-4)**: "Conversion mode"
- Post 2 free tips, 1-2 skill promotions per day
- Reply to threads with skill solutions
- Launch product via tweet thread (story of why SkillEdge exists)

**Phase 3 (Month 2+)**: "Community mode"
- Retweet user wins (people using skills successfully)
- Host weekly "Pain Point" threads
- Launch referral program (free month for 5 referrals)

### Landing Page + Telegram + Affiliate

**Landing Page** (1:1 replica of monoai.framer.website design):
- Header: Hero image + hook ("The only production-ready skills marketplace")
- Section 2: Problem statement (GitHub skills suck, here's why)
- Section 3: 3-col grid (Free Telegram, Pro Subscription, Affiliate)
- Section 4: Featured 5 skills (with before/after videos)
- Section 5: Pricing (€0 Telegram, €9/mo Pro, 20% affiliate commission)
- Footer: Social links (X, GitHub, email)

**Design Reference**: [monoai.framer.website](https://monoai.framer.website)
- Dark mode (dark blue/black background)
- Glassmorphism (frosted glass cards)
- Smooth animations (scroll parallax, hover effects)
- Mobile-first responsive

**Telegram Bot** (Free lead capture):
- Send `/skills` → get list of available skills + brief description
- Send `/demo` → get free 48-hour access to one skill
- Auto-message after 7 days: "Like it? Subscribe for €9/month"
- Referral link: `skilledge.ai/ref?code=USERNAME`

**Affiliate Program** (20% commission):
- Tools/SaaS that complement SkillEdge (Cursor IDE, Anthropic API, Claude paid plan)
- Copy: "These tools pair perfectly with SkillEdge skills"
- Commission structure: 20% of referred revenue (split between SkillEdge + you)

---

## Business Model

### Revenue Streams

#### Stream 1: Free Telegram (Lead Capture)
- Cost: €0
- Value to user: 5-10 free tips per week
- Goal: Convert 10-20% to Pro subscription
- Timeline: Day 1 (setup bot, add to bio)
- Expected: 50-100 subscribers by week 2

#### Stream 2: Pro Subscription (€9/month)
- Cost per skill: €1.50-2 (API cost for user queries)
- Margin: €7-7.50 per subscriber per month
- Target: 50 subscribers month 1 → 150 month 2 → 300 month 3
- Expected revenue: €450 month 1 → €1350 month 2 → €2700 month 3
- Churn assumption: 5-10% monthly (typical SaaS)

#### Stream 3: Affiliate Commissions (20% of partner revenue)
- Partners: Anthropic API credits, Cursor IDE lifetime, Claude Pro upgrade links
- Commission: 20% of referred revenue (split with partner)
- Conservative assumption: 5-10 referrals/month at month 1
- Expected: €50-100 month 1 → €200-400 month 2

### Pricing Tiers

| Tier | Price | Skills | Support | Users |
|------|-------|--------|---------|-------|
| Free (Telegram) | €0 | 5 free tips/week | Community | 100-500 |
| Pro | €9/month | All skills + updates | Email | 50-300 |
| Team | €25/month (5 seats) | All skills + SSO | Email + chat | TBD |
| Enterprise | Custom | Custom skills | Dedicated | TBD |

### Operational Costs

**Fixed Costs** (~€45/month):
- Domain: skilledge.ai (@domains.google or Namecheap) — €12/year (~€1/month)
- Landing page hosting (Framer/Vercel) — €0-10/month
- Telegram bot hosting (Heroku/AWS free tier) — €0-5/month
- Email (SendGrid/Mailgun free tier) — €0/month for <1000 emails
- Analytics (Plausible) — €9/month
- Storage (Supabase free tier) — €0/month

**Variable Costs**:
- Claude API: ~€2-3 per user per month (estimated)
- Affiliate payouts: 20% of referred revenue
- Customer support: ~5 hours/month (your time)

**Break-Even Analysis**:
- 50 Pro subscribers × €9 = €450/month revenue
- 50 × €2.50 (API cost) = €125 variable cost
- €450 - €125 - €45 (fixed) = **€280/month profit** at 50 subscribers

**Profitability**: Break-even at ~15-20 subscribers (€135-180 revenue covers costs)

---

## Financial Projections

### Month 1: Launch Phase

**Activities**:
- Week 1: Setup (domain, landing page, Telegram, X automation)
- Week 2-3: Develop 5 flagship skills
- Week 4: Launch marketing blitz

**Metrics**:
- X followers: 100-200
- Telegram subscribers: 50-100
- Pro subscribers: 10-20
- Skills created: 5
- Cost: €45/month + ~€50 (skill dev time @ freelance rate... but you're doing it)

**Revenue**:
- Telegram ads: €0 (too small)
- Pro subscriptions: 10-20 × €9 = €90-180
- Affiliate: €0-50 (too early)
- **Total: €90-230**

**Net Result**: -€45 to +€185 (not profitable, but testing market fit)

### Month 2: Growth Phase

**Activities**:
- Develop 10-15 new skills (parallel work)
- Optimize X marketing based on month 1 feedback
- Launch referral program

**Metrics**:
- X followers: 500-1000
- Telegram subscribers: 200-400
- Pro subscribers: 50-100 (5x growth)
- Skills created: 15 total
- Cost: €45/month

**Revenue**:
- Pro subscriptions: 50-100 × €9 = €450-900
- Affiliate: €100-200 (growing)
- **Total: €550-1100**

**Net Result**: €505-1055 profit (break-even achieved, now scaling)

### Month 3: Scale Phase

**Activities**:
- Develop 10+ new skills (targeting specific Reddit/X pain points)
- Launch team tier (€25/month, 5 seats)
- Build brand partnerships

**Metrics**:
- X followers: 2000-5000
- Telegram subscribers: 500-1000
- Pro subscribers: 150-300 (3x growth from month 2)
- Team subscribers: 10-20
- Skills created: 30 total
- Cost: €45/month + €100 (customer support contractor if needed)

**Revenue**:
- Pro subscriptions: 150-300 × €9 = €1350-2700
- Team subscriptions: 10-20 × €25 = €250-500
- Affiliate: €300-500
- **Total: €1900-3700**

**Net Result**: €1755-3555 profit (sustainable, self-funding next phase)

### 3-Month Summary

| Metric | M1 | M2 | M3 | Total |
|--------|-----|------|-------|---------|
| **Revenue** | €90-230 | €550-1100 | €1900-3700 | €2540-5030 |
| **Costs** | €45 | €45 | €145 | €235 |
| **Profit** | -€45-185 | €505-1055 | €1755-3555 | €2215-4795 |
| **Pro Subs** | 10-20 | 50-100 | 150-300 | 210-420 |
| **Skills** | 5 | 15 | 30 | — |

---

## Technical Architecture

### Landing Page (Framer-Based Design)

**Design Reference**: [monoai.framer.website](https://monoai.framer.website)

**Sections**:
1. **Header** (navigation + hero)
   - Logo (SkillEdge)
   - Nav: Skills | Pricing | Docs | GitHub | X
   - Hero: "Production-Ready Claude Skills"
   - CTA: "Subscribe" (to Pro) + "Free Demo" (to Telegram)

2. **Problem Statement**
   - Screenshot comparison: GitHub skills (messy) vs SkillEdge (polished)
   - Copy: "GitHub skills are broken. Here's why."
   - Stat cards: "27 hours saved per skill", "80/100 quality guarantee", "10/10 user satisfaction"

3. **3-Column Grid** (revenue streams)
   - Column 1: Free Telegram
     - Icon: Chat bubble
     - Copy: 5 free tips/week
     - CTA: "Join Telegram"
   - Column 2: Pro Subscription
     - Icon: Lightning
     - Copy: All skills + updates
     - CTA: "€9/month"
   - Column 3: Affiliate Program
     - Icon: Share
     - Copy: 20% commission
     - CTA: "Refer & Earn"

4. **Featured Skills** (showcase top 5)
   - Card per skill (name, problem, before/after screenshot, video embed)
   - Example: RegEx Wizard
     - Before: Raw regex monstrosity
     - After: Clean pattern + test cases
     - Video: 60s demo

5. **Pricing Section**
   - 3 tiers: Free (€0), Pro (€9/mo), Team (€25/mo)
   - Feature comparison table
   - FAQ (most common questions)

6. **Footer**
   - Links: X, GitHub, Email, Telegram
   - Legal: ToS, Privacy
   - Copyright

**Implementation**:
- Clone monoai.framer.website design (Framer exports to code automatically)
- Replace text/images with SkillEdge content
- Add payment integration (Stripe for Pro subscription)
- Deploy on Vercel (free tier)
- Custom domain: skilledge.ai (via Namecheap or Cloudflare)

**Cost**: €0-10/month (Framer free tier or Vercel)

### Database Schema (Supabase)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  telegram_id INT UNIQUE,
  x_handle VARCHAR,
  email VARCHAR UNIQUE,
  tier VARCHAR DEFAULT 'free', -- free, pro, team, enterprise
  subscribed_at TIMESTAMP,
  churn_risk_score FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Skills table
CREATE TABLE skills (
  id UUID PRIMARY KEY,
  name VARCHAR,
  description TEXT,
  problem_statement TEXT,
  phase_completed INT DEFAULT 0, -- 1-4 (discovery/engineering/testing/packaging)
  quality_score FLOAT, -- 0-100 from 9-test matrix
  api_cost_per_use FLOAT,
  launch_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Skill Access table
CREATE TABLE user_skill_access (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  skill_id UUID REFERENCES skills(id),
  accessed_at TIMESTAMP,
  result_cached JSONB,
  tokens_used INT,
  cost_incurred FLOAT
);

-- Analytics table
CREATE TABLE analytics (
  id UUID PRIMARY KEY,
  event VARCHAR, -- "view_skill", "use_skill", "subscribe", "churn"
  user_id UUID REFERENCES users(id),
  skill_id UUID REFERENCES skills(id),
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- X Replies table (for tracking viral posts we replied to)
CREATE TABLE x_replies (
  id UUID PRIMARY KEY,
  tweet_id VARCHAR,
  original_author VARCHAR,
  skill_promoted VARCHAR,
  reply_timestamp TIMESTAMP,
  engagement_count INT,
  click_through_rate FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Telegram Bot (Node.js + Telegraf)

```javascript
// Pseudo-code
import TelegramBot from 'telegraf';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);

bot.command('skills', (ctx) => {
  const skillsList = getAvailableSkills();
  ctx.reply(`📚 Available Skills:\n${skillsList}`);
});

bot.command('demo', (ctx) => {
  const demoSkill = getRandomSkill();
  ctx.reply(`🎁 48-hour free access to ${demoSkill.name}`);
  // Set demo_expires_at in DB
});

bot.on('message', (ctx) => {
  if (ctx.message.text.includes('subscribe')) {
    ctx.reply(`💎 Subscribe to Pro for €9/month: [link]`);
  }
});

// Auto-message after 7 days
setInterval(async () => {
  const inactiveDemoUsers = await getInactiveDemoUsers(7);
  inactiveDemoUsers.forEach(user => {
    bot.telegram.sendMessage(
      user.telegram_id,
      '❤️ Like SkillEdge? Subscribe for €9/month'
    );
  });
}, 1000 * 60 * 60 * 24); // Daily
```

### X Automation (Tasker + API)

**Tasker Script** (Android phone automation):
```
TRIGGER: Notification from X app
CONDITIONS:
  - Text contains "claude" OR "regex" OR "database" OR "api"
  - Text does NOT contain "spam keywords"
THEN:
  - Send Telegram message to self (alert)
  - Open X in browser
  - Show notification popup ("Found viral post!")
```

**X API Poller** (Node.js, runs every 10-15 min):
```javascript
const xClient = new TwitterApi(process.env.X_BEARER_TOKEN);

async function findViralposts() {
  const tweets = await xClient.v2.search.recent(
    '(database OR api OR regex OR debug OR claude) -is:retweet',
    { max_results: 100, sort_order: 'recency' }
  );

  for (const tweet of tweets.data) {
    if (tweet.public_metrics.like_count > 100) {
      const relevantSkill = matchSkillToTweet(tweet.text);
      if (relevantSkill) {
        // Send Telegram alert + draft reply
        alertAndDraft(tweet, relevantSkill);
      }
    }
  }
}

setInterval(findViralposts, 1000 * 60 * 10); // Every 10 min
```

---

## Operational Timeline

### Week 1: Setup Phase

**Monday-Tuesday**:
- [ ] Register domain: skilledge.ai (Namecheap or Google Domains)
- [ ] Design landing page (Framer, 1:1 clone of monoai)
- [ ] Deploy landing page to Vercel
- [ ] Add Stripe payment integration

**Wednesday**:
- [ ] Create X account (@skilledge_ai) with verified blue checkmark (€8)
- [ ] Set up Tasker + X push notifications on Android phone
- [ ] Build X API poller (Python or Node.js)

**Thursday-Friday**:
- [ ] Create Telegram bot (@SkillEdgeBot)
- [ ] Deploy bot to Heroku or AWS Lambda
- [ ] Set up Supabase database (free tier)
- [ ] Create initial analytics dashboard

**Deliverable**: Live landing page + X account + Telegram bot, ready for skill uploads

### Week 2-3: Skill Development Phase

**Parallel Development** (you work on multiple skills at once):

**Skill 1: RegEx Wizard** (by Wed week 2)
- Phase 1: Pain discovery (4h)
- Phase 2: Engineering (8h)
- Phase 3: Testing (8h)
- Phase 4: Packaging (3h)
- **Total: 23h** → Estimate completion **Wed 3pm**

**Skill 2: DB Guardian** (by Thu week 2)
- Parallel to Skill 1, start Wed
- **Total: 23h** → Estimate completion **Thu 3pm**

**Skill 3: Code Reviewer Pro** (by Fri week 2)
- **Total: 23h** → Estimate completion **Fri 3pm**

**Skill 4: API Contract Builder** (by Mon week 3)
- **Total: 23h** → Estimate completion **Mon 3pm**

**Skill 5: Prompt Optimizer** (by Tue week 3)
- **Total: 23h** → Estimate completion **Tue 3pm**

**Buffer**: Wed-Thu week 3 (fix bugs, improve low-scoring skills, refine messaging)

**Deliverable**: 5 production-ready skills with documentation + video demos

### Week 4: Launch Phase

**Monday**:
- [ ] Final QA on all 5 skills
- [ ] Create launch tweet thread (story of SkillEdge)
- [ ] Write 10 reply templates (for Tier 1 posts)
- [ ] Schedule 5 free tip tweets (Mon-Fri)

**Tuesday**:
- [ ] Launch thread on X (tag 10-20 major dev influencers)
- [ ] Monitor mentions + engagement
- [ ] Reply to high-engagement posts immediately

**Wed-Fri**:
- [ ] Track signups, conversions, feedback
- [ ] Adjust messaging based on what works
- [ ] Start Tier 2 API polling (more targeted)
- [ ] Iterate on landing page (A/B test CTA buttons)

**Deliverable**: 50-100 Telegram subscribers, 10-20 Pro subscribers, established X presence

### Month 2-3: Growth & Iteration

**Week 5-6**: Develop 5-10 more skills (based on Month 1 feedback)

**Week 7-8**: Launch Team tier (€25/month)

**Week 9-10**: Build brand partnerships, launch referral program

**Week 11-12**: Scale — target 300+ Pro subscribers, 30+ skills

---

## Competitive Advantages

### 1. Quality Obsession

**Why It Matters**: Other platforms ship garbage. We guarantee 10/10 or don't ship.

**The Moat**: 9-test matrix (80/100 minimum) = only reliable source of production-ready skills

**Proof**: Every skill comes with test results, before/after screenshots, cost breakdown

### 2. Real Pain Points

**Why It Matters**: Generic "how-to" skills don't solve problems. Ours do.

**The Moat**: Pain discovery process (Reddit, GitHub, X) = we build what developers actually need

**Proof**: Each skill has documented pain statement + 3 real-world examples

### 3. Production-Ready First

**Why It Matters**: Developers need solutions they can deploy TODAY, not "learn how to build your own"

**The Moat**: 4-phase workflow (discovery → engineering → testing → packaging) = zero fluff

**Proof**: Every skill ships with code examples, error handling, cost analysis

### 4. Transparency

**Why It Matters**: Developers distrust black boxes. We show our work.

**The Moat**: Open cost breakdown (tokens per use, API costs, time savings)

**Proof**: Each skill lists exact cost per execution, estimated monthly spend, time saved

### 5. Aggressive Marketing

**Why It Matters**: Good products die if nobody knows about them.

**The Moat**: Hybrid X strategy (Tier 1 real-time + Tier 2 API polling) = 10x faster discovery

**Proof**: Reply to viral posts within 60 seconds, first-mover advantage on engagement

---

## Risk Mitigation

### Risk 1: X Account Suspension

**Likelihood**: Low (we're not spamming, just replying helpfully)
**Impact**: High (lost marketing channel, brand damage)
**Mitigation**:
- Create backup X accounts immediately (2-3 secondary accounts)
- Keep email/password offline (encrypted backup)
- Vary reply timing + style (not robotic)
- Follow X guidelines strictly (no follow/unfollow automation, no unsolicited DMs)
- Build Telegram subscriber base as primary channel (less risk of ban)

### Risk 2: API Costs Exceed Revenue

**Likelihood**: Medium (Gemini is cheap but can add up)
**Impact**: Medium (cuts into margins, forces price increase)
**Mitigation**:
- Implement request rate limiting (pro users: 10 requests/day, reset daily)
- Cache common queries (regex patterns, API templates often repeat)
- Use cheaper Claude model for simple tasks (Haiku costs 1/4 of Opus)
- Monitor API spend closely (daily alerts if >€5)
- Pass through cost increases transparently to users

### Risk 3: Skill Quality Regression

**Likelihood**: Low (9-test matrix catches most issues)
**Impact**: High (reputation damage, churn)
**Mitigation**:
- Mandatory testing on ALL 3 models + ALL 3 sizes (never skip a test)
- Minimum 80/100 score is NON-NEGOTIABLE
- User feedback loop (Telegram + email support)
- Monthly quality audit (sample 2-3 random skills, re-test them)
- Version control for skills (if skill breaks, rollback + fix)

### Risk 4: Telegram Bot Ban

**Likelihood**: Low (we're not spam, just helpful)
**Impact**: High (lost lead capture channel)
**Mitigation**:
- Create backup Telegram bots (2-3 secondary bots ready to deploy)
- Keep Telegram bot code in GitHub (instant redeploy if banned)
- Never spam users (max 1 message per day per user)
- Follow Telegram guidelines (no phishing, no spam)
- Build email list as backup (export Telegram subscribers weekly)

### Risk 5: Market Doesn't Care About Premium Skills

**Likelihood**: Medium (unproven market)
**Impact**: Very High (all assumptions wrong)
**Mitigation**:
- Talk to 10-20 developers in week 1 (Reddit surveys, Twitter polls)
- Offer free Telegram access to validate interest
- A/B test pricing (€9 vs €12 vs €15/month)
- Start with ONE skill, get 100+ users, THEN expand
- If <20 Pro subscribers after month 1, pivot (maybe consulting model instead)

### Risk 6: Can't Scale to 30 Skills Fast Enough

**Likelihood**: Medium (1 skill/day is aggressive)
**Impact**: Low (just delays growth, doesn't kill business)
**Mitigation**:
- Pre-plan all 25-30 skills in month 1 (pain discovery in parallel)
- Build skill templates (boilerplate prompt structure)
- Outsource Phase 3 testing (hire freelancer to run test matrix)
- Batch similar skills (e.g., all "debug" skills one after another)
- Can always slow to 3-4 skills/week if burnout kicks in

---

## Implementation Checklist

### Week 1 Setup

- [ ] Domain registered: skilledge.ai
- [ ] Landing page designed (Framer)
- [ ] Landing page deployed (Vercel)
- [ ] Stripe payment integrated
- [ ] X account created + blue checkmark
- [ ] Tasker automation running on phone
- [ ] X API poller code written + tested
- [ ] Telegram bot deployed
- [ ] Supabase database set up
- [ ] Analytics dashboard created

### Week 2-3 Skills

- [ ] Skill 1 (RegEx Wizard): All 4 phases complete
- [ ] Skill 2 (DB Guardian): All 4 phases complete
- [ ] Skill 3 (Code Reviewer Pro): All 4 phases complete
- [ ] Skill 4 (API Contract Builder): All 4 phases complete
- [ ] Skill 5 (Prompt Optimizer): All 4 phases complete
- [ ] All skills pass 9-test matrix (80/100+ score)
- [ ] All skills have documentation + video demo
- [ ] All skills integrated into Telegram bot

### Week 4 Launch

- [ ] Launch tweet thread written
- [ ] 10 reply templates prepared
- [ ] 5 free tip tweets scheduled
- [ ] X automation running (Tier 1 + Tier 2)
- [ ] Telegram bot promoting Pro subscription
- [ ] Landing page optimized for conversions
- [ ] Email onboarding sequence created
- [ ] Referral program launched

### Success Metrics (Target)

**By end of Month 1**:
- [ ] 500+ X followers
- [ ] 50-100 Telegram subscribers
- [ ] 10-20 Pro subscribers
- [ ] €90-230 revenue
- [ ] 5 skills live + tested

**By end of Month 2**:
- [ ] 1000+ X followers
- [ ] 200-400 Telegram subscribers
- [ ] 50-100 Pro subscribers
- [ ] €550+ revenue (profitable)
- [ ] 15 skills live

**By end of Month 3**:
- [ ] 5000+ X followers
- [ ] 500-1000 Telegram subscribers
- [ ] 150-300 Pro subscribers
- [ ] €1900+ revenue (strong unit economics)
- [ ] 30 skills live

---

## APPENDIX A: Detailed Skill 10/10 Creation Workflow

### Complete Phase-by-Phase Guide with Templates & Rubrics

---

### PHASE 1: PAIN DISCOVERY — Detailed Process

**Duration**: 4 hours
**Goal**: Identify a repeatable, profitable pain point

#### Step 1.1: Research Sources (2 hours)

**Reddit Deep Dive** (1 hour):
```
Search queries to run:
- r/learnprogramming: "help with [topic]" + "how do I [task]"
- r/webdev: "struggling with", "confused by", "can't figure out"
- r/python: "regex", "database", "api design"
- r/golang: "[pain point] is hard", "best way to"
- r/javascript: "debugging", "performance", "testing"

Scoring each post:
- Upvotes (proxy for pain frequency): 100+ = common pain
- Comments (proxy for unresolved pain): 50+ = people still struggling
- Post recency: <3 months = current/relevant
```

**X/Twitter Scrape** (30 min):
```
Search for:
- "@dabit3 @echan00 @tjholowaychuk frustrated OR confused OR help"
- "#devtools help OR struggling OR tutorial"
- "claude api" + (regex OR database OR debug OR error) + frustrat*
- Advanced search: search within last week, exclude retweets

Score tweets by:
- Quote count (people sharing the pain)
- Reply count (people offering solutions = unsolved)
- Engagement velocity (likes in first 2h = viral pain)
```

**GitHub Issues** (30 min):
```
Search repos with 100k+ stars:
- "how do I", "how can I", "best practice for"
- "struggling", "confused", "unclear documentation"
- Label: "question", "help wanted", "good first issue"

Score by:
- Issue age (months old = persistent unsolved)
- "+1" reactions (people confirming the pain)
- Similar closed issues (recurring question)
```

#### Step 1.2: Consolidate Findings (1 hour)

**Create Pain Ranking Spreadsheet**:

| Pain | Frequency | Severity | Revenue Potential | Score |
|------|-----------|----------|-------------------|-------|
| Email regex validation | 150+ posts | High (edge cases) | €9/mo × 50 = €450 | 9/10 |
| Database query optimization | 120+ posts | Very high | €9/mo × 80 = €720 | 10/10 |
| API spec generation | 80+ posts | High | €9/mo × 60 = €540 | 8/10 |
| Regex general | 200+ posts | Medium | €9/mo × 40 = €360 | 7/10 |

**Scoring formula**:
```
Score = (Frequency/100 × 3) + (Severity/10 × 4) + (RevenueScore/10 × 3)
Max = 100
Threshold for "go" = 70+
```

#### Step 1.3: Document Pain Statement (1 hour)

**For selected pain, write**:

```
PAIN STATEMENT:
"Developers waste 10+ hours debugging database query performance
because they don't know WHERE the bottleneck is (parsing? execution?
indexing?) or HOW to fix it. Existing tools are either too low-level
(raw EXPLAIN PLAN output) or too opinionated (vendor-specific advice)."

EVIDENCE:
- Reddit r/postgres: 47 posts about slow queries in last 30 days
- GitHub mysql/mysql-server: 120+ "performance" issues
- X search: "slow query" frustrat* = 340 posts last week
- 3x developers in my network have mentioned this in conversations

USER PAIN POINTS:
1. "I don't know where to start optimizing" (paralysis)
2. "The query plan output is cryptic" (translation needed)
3. "Generic advice doesn't work for my specific schema" (overfitting)
4. "I broke something while optimizing" (risk aversion)

REAL EXAMPLES:
1. Product team: "Our reports take 30s. Is it the DB or the app?"
   → Need: bottleneck isolation + proof
2. Startup CTO: "We just got hit by HN + scaled 5x, queries are dying"
   → Need: quick wins + indexed recommendations
3. Agency consultant: "Client has 200 tables, where do I start?"
   → Need: systematic approach + safety guardrails

WHO WOULD PAY:
- Freelance developers: Yes (€9/mo saves 10h at $100/h = ROI 111x)
- Small startups (5-20 people): Yes (shared team account, €25/mo)
- Agencies: Yes (use on 5-10 client projects/month, €50/mo)
- Enterprise: Maybe (custom version, $5k+)
```

**Confidence Check**:
- [ ] Found 100+ raw mentions of pain (Reddit/GitHub/X combined)
- [ ] At least 3 real people in your network have this pain
- [ ] Can articulate 3+ specific pain points (not vague)
- [ ] Have 3 concrete real-world examples
- [ ] Revenue model makes sense (would users pay?)

---

### PHASE 2: SKILL ENGINEERING — Template & 7 Rules

**Duration**: 8-10 hours
**Goal**: Build a Claude prompt/tool that solves the pain consistently

#### Rule 1: Problem-First Prompting

**Bad** (solution-focused):
```
Output a JSON object with fields: query_plan, recommendations,
optimization_score, estimated_time_saved.
```

**Good** (problem-focused):
```
I'm confused by this database query's slow performance. I need to know:
1. WHERE is the bottleneck (parsing, execution, indexing, network)?
2. WHAT specific change would help most?
3. WHY will that change work?

Help me understand, then tell me the quickest fix to try first.
```

#### Rule 2: Guardrails Over Freedom

**Bad** (no constraints):
```
Analyze this query and optimize it.
```

**Good** (with guardrails):
```
CONSTRAINTS:
- Max 500 token response (be concise)
- Explain in plain English, not database jargon
- Only suggest changes you're 90%+ confident about
- Flag any risk (could break data, performance worse case)
- Output format: [Bottleneck] → [Fix] → [Confidence %] → [Risk]
```

#### Rule 3: Checklist Pattern

**Bad** (freeform):
```
Analyze the performance of this query and provide recommendations.
```

**Good** (structured checklist):
```
Follow this checklist step-by-step:

1. PARSE THE QUERY
   - [ ] Identify the main table and joins
   - [ ] Spot any subqueries or CTEs
   - [ ] Note the WHERE clause filters

2. ANALYZE THE PLAN
   - [ ] Check index usage (are we using indexes or full table scan?)
   - [ ] Spot join strategy (nested loop vs hash vs merge?)
   - [ ] Measure data volume at each step

3. IDENTIFY BOTTLENECK
   - [ ] Which step takes longest? (mark with ⏱️)
   - [ ] Is it CPU-bound, I/O-bound, or network?

4. RECOMMEND FIX
   - [ ] Suggest index (if full scan detected)
   - [ ] Suggest join reorder (if cartesian product detected)
   - [ ] Suggest query rewrite (if subquery detected)

5. VALIDATE
   - [ ] Will this fix help? (yes/no + confidence %)
   - [ ] Could it break something? (list risks)
   - [ ] Estimate time savings
```

#### Rule 4: Output Formatting

Always specify **exact** format with example:

```
OUTPUT FORMAT (must follow exactly):

{
  "bottleneck": "String describing WHERE the slowness is",
  "explanation": "2-3 sentence plain English explanation",
  "fix": "Specific, runnable code change or index command",
  "confidence": 85,  // 0-100, your confidence in this fix
  "estimated_speedup": "5-10x faster",
  "risk_level": "low|medium|high",
  "risks": ["List", "of", "specific", "risks"],
  "before_metrics": { "rows_scanned": 1000000, "time_ms": 5000 },
  "after_estimate": { "rows_scanned": 50000, "time_ms": 200 }
}
```

#### Rule 5: Failure Modes

**Anticipate breakage**:

```
FAILURE MODES (handle these):

IF user provides ambiguous query:
  → Ask: "Does this use table_a.id or table_b.id in the JOIN?"

IF EXPLAIN PLAN output is unreadable:
  → Say: "The plan is too complex for one recommendation.
          Can you simplify to just the slow part?"

IF multiple bottlenecks detected:
  → Rank by impact: "Fix [A] first (10x gain), then [B] (2x gain)"

IF risk is high:
  → Emphasize: "TEST THIS ON A COPY FIRST before production"

IF user disagrees with recommendation:
  → Ask: "What metric matters most? (speed, reliability, cost?)"
```

#### Rule 6: Cost Awareness

```
TRACK TOKENS:
- Typical query analysis: 200-400 tokens input, 300-500 output
- Large EXPLAIN plan: 600-1000 tokens input
- Per-skill monthly cost at 100 users: 100 × 50 queries × 500 tokens
  = 2.5M tokens = ~€1.50

OPTIMIZE:
- Summarize EXPLAIN output (don't send full 5KB plan)
- Ask user to provide snippet, not full 10k-line schema
- Cache common queries (email validation regex repeats often)
```

#### Rule 7: Feedback Loop

```
Add self-verification step:

After recommending optimization:

"Before you apply this fix, answer these questions to verify:
1. Will removing this index break any other queries?
2. Do you have a read replica to test on?
3. Can you estimate the space savings (bytes freed)?"

If user answers "no" to any, re-evaluate recommendation.
```

#### Phase 2 Template: RegEx Wizard Skill

```
SKILL: RegEx Wizard

PROBLEM DESCRIPTION:
Your regex patterns are hard to debug, easy to break on edge cases,
and impossible for teammates to understand. You need regex that's:
- Production-ready (tested)
- Explained (so others understand)
- Trustworthy (won't break on edge cases)

SYSTEM PROMPT:
You are a regex expert building production-ready patterns.

INPUT: User description + examples of what should/shouldn't match
OUTPUT: { pattern: "...", tests: [...], explanation: "..." }

RULES:
1. ALWAYS include 5 test cases (3 positive, 2 negative)
2. ALWAYS explain each character (anchors, quantifiers, groups, etc.)
3. NEVER recommend untested patterns
4. If too complex, suggest breaking into multiple regexes
5. Output is JSON, never markdown code blocks

STEP-BY-STEP:
1. UNDERSTAND what the user wants to match
   - Ask clarifying questions if ambiguous
   - Show 3 examples of what SHOULD match
   - Show 2 examples of what SHOULD NOT match

2. BUILD the pattern
   - Start simple, add complexity if needed
   - Test against all 5 examples
   - Adjust if any test fails

3. EXPLAIN the pattern
   - Break down by component (e.g., "^ = start of string")
   - Explain quirks (e.g., "This allows multiple dots, so '..com' matches")
   - Warn about edge cases

4. OUTPUT exactly:
   {
     "pattern": "^[a-z0-9]+@[a-z]+\\.[a-z]{2,}$",
     "tests": [
       { "input": "user@example.com", "should_match": true, "actual": true, "✓": true },
       { "input": "user@example", "should_match": false, "actual": false, "✓": true },
       ...
     ],
     "explanation": "Anchors ^ and $ ensure full string match. [a-z0-9]+ requires at least one alphanumeric before @..."
   }
```

**Phase 2 Deliverables**:
- [ ] Prompt finalized (tested with 3 example inputs)
- [ ] Prompt passes tiny + medium + large test (rough)
- [ ] Token cost estimated (~X tokens per query)
- [ ] Failure modes documented
- [ ] Error handling explained

---

### PHASE 3: STRESS TEST — Complete 9-Test Matrix

**Duration**: 6-8 hours
**Goal**: Ensure 80/100+ average across all conditions

#### The 9-Test Matrix Explained

**Project Sizes**:
- **Tiny** (1-5 files): Freelancer doing a quick task, 30min time budget
- **Medium** (10-30 files): Small team working on feature, 2hr time budget
- **Large** (50+ files): Agency/startup scaling, 8hr time budget

**Claude Models**:
- **Haiku** (fast, cheap): For rapid iteration, cost-sensitive projects
- **Sonnet** (balanced): Most common, good cost/quality
- **Opus** (premium): Complex analysis, high-stakes projects

**Test Scoring Rubric** (0-10 scale):

```
10/10 = PERFECT
- Output is production-ready
- No manual cleanup needed
- Goes above and beyond
- User says "wow, this saved me 2 hours"

8/10 = VERY GOOD
- Output works perfectly for the stated problem
- Minor cosmetic tweaks (formatting, explanation length)
- 90% of users accept as-is

6/10 = GOOD ENOUGH
- Output solves the core problem
- Requires 5-10 min manual cleanup/adjustment
- Addresses 80% of the use case
- Edge cases not fully covered

4/10 = USABLE BUT FLAWED
- Output is 50% helpful
- Requires 30+ min rework to be production-ready
- Misses key aspects of the problem
- Would need to re-run the skill

0/10 = COMPLETE FAILURE
- Wrong approach entirely
- Doesn't address the stated problem
- Wastes user's time
- User might request refund
```

#### Example Test Matrix: DB Guardian

| Test | Project | Model | Input | Expected | Actual Score | Notes |
|------|---------|-------|-------|----------|--------------|-------|
| 1 | Tiny | Haiku | Simple SELECT on 1 table, slow | Identify missing index | 9/10 | Perfect |
| 2 | Tiny | Sonnet | Simple SELECT on 1 table, slow | Identify missing index | 9/10 | Perfect |
| 3 | Tiny | Opus | Simple SELECT on 1 table, slow | Identify missing index | 10/10 | Excellent |
| 4 | Medium | Haiku | 3-table JOIN, vague slowness | Bottleneck isolation | 7/10 | Missed one join strategy |
| 5 | Medium | Sonnet | 3-table JOIN, vague slowness | Bottleneck isolation | 8/10 | Very good |
| 6 | Medium | Opus | 3-table JOIN, vague slowness | Bottleneck isolation | 9/10 | Excellent |
| 7 | Large | Haiku | 200-table schema, "broken" report | Index recommendations | 6/10 | Too generic, needed more context |
| 8 | Large | Sonnet | 200-table schema, "broken" report | Index recommendations | 8/10 | Very good recommendations |
| 9 | Large | Opus | 200-table schema, "broken" report | Index recommendations | 9/10 | Excellent |

**Matrix Average**: (9+9+10+7+8+9+6+8+9) / 9 = **8.33/10** ✅ PASS (>80%)

#### How to Run Tests (Step-by-Step)

**For each test cell**:

```
1. SETUP
   - Create test scenario matching project size
   - Prepare input (query, schema, metrics)
   - Time the response (track API latency)

2. EXECUTE
   - Call Claude API with the skill prompt
   - Capture full response
   - Note: tokens used, response time

3. EVALUATE
   - Does output solve the problem?
   - Is it production-ready?
   - What would need manual fix?
   - Score 0-10

4. RECORD
   - Note score + notes in matrix
   - Document any failures
   - Track tokens/cost
```

**Test Data Template** (DB Guardian):

```
TEST: Large Project, Sonnet Model

INPUT SCHEMA:
CREATE TABLE orders (id INT, customer_id INT, amount DECIMAL, created_at DATETIME);
CREATE TABLE customers (id INT, name VARCHAR, country VARCHAR);
CREATE TABLE order_items (id INT, order_id INT, product_id INT, qty INT, price DECIMAL);
[... 197 more tables ...]

INPUT QUERY:
SELECT
  c.name,
  COUNT(*) as order_count,
  SUM(o.amount) as total_spent
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.created_at > DATE_SUB(NOW(), INTERVAL 1 MONTH)
GROUP BY c.name
ORDER BY total_spent DESC
LIMIT 10;

EXECUTION METRICS:
- Execution time: 12.5 seconds (expected: <2s)
- Rows scanned: 1,234,567 (expected: <50k)
- EXPLAIN PLAN: [Full plan output]

EXPECTED OUTPUT:
- Identify: Full table scan on orders (no index on created_at)
- Recommend: CREATE INDEX idx_orders_created_at ON orders(created_at)
- Explain: Why this bottleneck matters
- Estimate: 5-10x speedup after fix

ACTUAL OUTPUT:
[Claude's response]

SCORE: 8/10
NOTES: Great bottleneck isolation, but could have mentioned materialized view option
```

#### Pass/Fail Criteria

- **PASS**: Average ≥ 80% across all 9 tests
- **FAIL**: Average < 80%, or any model scores < 6 consistently
- **If FAIL**: Return to Phase 2, improve prompt, re-test

---

### PHASE 4: PACKAGE — Complete Deliverables Checklist

**Duration**: 2-3 hours
**Goal**: Create launch-ready marketing assets

#### 4.1: Documentation (1 page markdown)

**File**: `skills/db-guardian.md`

```markdown
# DB Guardian — Query Performance Analysis

## Problem
Your database queries are slow, but you don't know WHERE the bottleneck is.
Is it missing indexes? Bad joins? Inefficient subqueries? Careless full table scans?

## Solution
DB Guardian analyzes your slow query and tells you:
1. **WHERE** it's bottlenecking (exact step in the plan)
2. **WHY** it's slow (index missing, join strategy wrong, etc.)
3. **HOW** to fix it (exact SQL change + confidence level)
4. **RISK** assessment (could this break something?)

## Who It's For
- **Freelance developers**: Save 5-10 hours per project optimizing
- **Startups**: Quick scaling pains, need fast turnaround
- **Agencies**: Use on 5-10 client projects/month
- **Solo CTOs**: Diagnose without hiring database consultant

## How to Use

### Step 1: Run EXPLAIN
```sql
EXPLAIN (FORMAT JSON, ANALYZE)
SELECT * FROM slow_query...
```

### Step 2: Paste to DB Guardian
Upload the EXPLAIN plan + original query

### Step 3: Get Recommendations
Get bottleneck analysis + fix + confidence score

### Example

**Before** (slow query, 12.5s, 1.2M rows scanned):
```sql
SELECT * FROM orders
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 MONTH)
```

**After** (with index, <500ms, 5k rows scanned):
```sql
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

## Pricing
€9/month — unlimited queries

## Troubleshooting

**Q: The recommendation didn't work**
A: Test on a copy first. If still broken, email us the query + plan.

**Q: I got a different recommendation from my DBA**
A: We optimize for speed. Your DBA might optimize for cost/storage.
   Email both recommendations and we'll explain the tradeoff.

**Q: Does this work for [database type]?**
A: Yes — MySQL, PostgreSQL, SQL Server, Oracle.
   Different syntax, same bottleneck principles.
```

#### 4.2: Before/After Screenshots (3-4 images)

**Screenshot 1: The Problem**
- Show raw EXPLAIN PLAN output (cryptic, overwhelming)
- Caption: "EXPLAIN plans are hard to read. Where's the bottleneck?"

**Screenshot 2: The Solution**
- Show DB Guardian output (clear bottleneck + fix)
- Caption: "DB Guardian isolates the issue in 10 seconds"

**Screenshot 3: Edge Case**
- Show complex schema scenario
- Caption: "Works on large schemas with 200+ tables"

**Screenshot 4: Cost Breakdown**
- Show tokens used, API cost, estimated ROI
- Caption: "One query fix pays for 3 months of subscription"

#### 4.3: Video Demo (2-3 minutes)

**Script**:
```
[0:00-0:30] Problem Setup
- "My startup scaled 5x overnight and our reports are dying"
- Show slow query taking 20+ seconds
- "I don't know where to start"

[0:30-1:30] Using DB Guardian
- Paste query + EXPLAIN plan
- Click "Analyze"
- Show output appearing in real-time
- "It found the bottleneck: missing index on created_at"

[1:30-2:00] Results
- Apply the recommended index
- Re-run query: now 500ms
- "40x faster. Saved me hours."

[2:00-2:30] Bonus: Cost Breakdown
- "This one optimization saved €500/month in database costs"
- Show ROI: €9/month skill cost vs €500 savings
```

#### 4.4: Social Content for X Launch

**Hook Tweet**:
```
Your database queries are slow.

You just don't know WHERE.

DB Guardian finds the bottleneck in 10 seconds.
Then tells you the exact fix.

€9/month. Used by 200+ devs.

[link]
```

**Follow-up Tweet 1 (Problem)**:
```
EXPLAIN plans are cryptic nonsense.

"Nested Loop"? "Sequential Scan"? "Sort Cost"?

Your DBA can decode it in 30min.

DB Guardian does it in 10 seconds.

[example screenshot]
```

**Follow-up Tweet 2 (Example)**:
```
Real example: startup query taking 15 seconds.

DB Guardian: "Missing index on created_at"

Apply index → 300ms.

50x faster.

€9/month pays for itself on one optimization.
```

**Follow-up Tweet 3 (Testimonial)**:
```
"Saved me 6 hours this week alone. Worth every penny."

— Senior Backend Dev, 50-person startup

DB Guardian. €9/month.

[link]
```

**FAQ Thread**:
```
Q: Does this work for MySQL? PostgreSQL?
A: Yes. All major databases.

Q: What if I get a recommendation I don't understand?
A: Email us. We explain in plain English.

Q: Could this recommendation break my database?
A: We flag risks. We never recommend untested changes.

Q: I already have a DBA. Do I need this?
A: This is 10x faster. Your DBA can focus on architecture.
```

#### 4.5: Beta Feedback Summary

**Collect feedback from 5-10 beta users**:

```
BETA TESTER: [Name], Senior Dev at [Company]

Would you use this again? ⭐⭐⭐⭐⭐ (5/5)

Biggest win: "Diagnosed a problem my team spent 6 hours on"

Feature wish: "Could you suggest partitioning strategies too?"

Issue found: "Sometimes recommends index when materialized view better"

Quote for marketing: "Saved me hours. Worth every penny."
```

#### 4.6: Checklist for Phase 4 Completion

- [ ] Documentation page written (clear problem + solution + examples)
- [ ] 3+ before/after screenshots created
- [ ] 2-3 minute video demo recorded
- [ ] Hook tweet + 3 follow-ups drafted
- [ ] FAQ thread prepared (min 5 questions)
- [ ] 5-10 beta users tested skill
- [ ] Feedback summary compiled
- [ ] Feature ideas logged for v2
- [ ] Ready for launch email sent to beta users

---

### Complete Workflow Timeline Example: RegEx Wizard

**Monday 9am: Phase 1 starts**
```
9:00-11:00: Reddit + X scrape (find "regex pain")
11:00-12:00: Pain consolidation (score opportunities)
12:00-1:00pm: Document pain statement (email validation pain)
END OF DAY: Pain statement approved ✅
```

**Monday 1pm - Tuesday 6pm: Phase 2 (Engineering)**
```
1pm-3pm: Draft initial prompt
3pm-4pm: Test with tiny example (email pattern)
4pm-5pm: Test with medium example (URL validation)
5pm-6pm: Refine prompt based on failures
6pm-7pm: Test with large example (complex patterns)
7pm-8pm: Measure tokens + costs
8pm-9pm: Document failures + error handling
END OF DAY: Prompt finalized ✅
```

**Tuesday 6pm - Wednesday 4pm: Phase 3 (Testing)**
```
6pm-7pm: Set up 9 test scenarios
7pm-8pm: Test 1-3 (Tiny + Haiku/Sonnet/Opus)
8pm-9pm: Test 4-6 (Medium + Haiku/Sonnet/Opus)
9pm-10pm: Test 7-9 (Large + Haiku/Sonnet/Opus)
NEXT DAY:
9am-10am: Score all tests, calculate average
10am-11am: Document failures, decide if re-engineer
11am-12pm: If >80%, move to Phase 4. If <80%, return to Phase 2
RESULT: 8.2/10 average ✅ PASS
```

**Wednesday 12pm - 3pm: Phase 4 (Packaging)**
```
12pm-1pm: Write documentation page
1pm-1:30pm: Create 3 screenshots (before/after/bonus)
1:30pm-2:30pm: Record video demo (2 min)
2:30pm-3pm: Draft X content + FAQ
END OF DAY: All assets ready ✅
```

**Wednesday 3pm - Thursday: Beta + Launch**
```
3pm-5pm: Send to 5 beta users
5pm-6pm: Collect feedback
6pm-7pm: Minor tweaks based on feedback
NEXT DAY:
9am: Launch on X
All day: Reply to mentions, engage with traffic
```

**Total: ~23 hours over 1.5 days**

---

### Skill Quality Guarantee

Every skill shipped guarantees:

✅ **Quality**: Passed 9-test matrix (80/100 minimum)
✅ **Testing**: 27 test scenarios across 3 models, 3 project sizes
✅ **Documentation**: 1-page guide + 3 screenshots + video demo
✅ **Beta Validated**: Tested by 5-10 real users
✅ **Production-Ready**: No manual cleanup needed
✅ **Cost Transparent**: Token breakdown + monthly cost estimate
✅ **Support**: Email support for questions/issues
✅ **Refund**: 30-day refund if not satisfied

If any skill fails to meet these standards, it's not shipped. Period.

---

## Next Steps

1. **Approve this plan** — make edits/changes as needed
2. **Register skilledge.ai domain** — via Namecheap or Google Domains
3. **Design landing page** — clone monoai.framer.website design, customize copy
4. **Set up infrastructure** — X account, Telegram bot, Supabase, Vercel
5. **Start Week 1** — launch live by end of week
6. **Develop first 5 skills** — parallelized, Week 2-3
7. **Launch** — Week 4

---

**Document Version**: 1.0
**Last Updated**: 2026-03-24
**Status**: Ready to Execute

