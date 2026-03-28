# EarlyInsider — Prompt, Workflow & Content Framework Definitivo

Basato su 10 ricerche parallele (5 Ricerca 1 + 5 Ricerca 2) cross-referenziate.
Questo file contiene tutto il necessario per implementare ogni categoria al 10/10.

---

## Design System Visivo (trasversale)

**Colori**: Background `#0A1128` (dark navy), secondary `#1A2238`, text white `#FFF` / gray `#B0B0B0`, green `#28A745` (buy), red `#DC3545` (sell), yellow `#FFC107` (caution), blue `#007BFF` (neutral)
**Font**: Inter (Google Fonts) — sans-serif. Ticker 60-96px bold, amounts 36-60px, names 20-28px, dates 18-24px, branding 14-20px
**Dimensioni**: X post 1200x675, X reply 600x337, Reddit/Blog 1200x675 o 700-800px wide
**Chart lib**: Chart.js + node-canvas (server-side PNG, `responsive: false`, `animation: false`)
**Rendering**: Puppeteer screenshot server (gia sul VPS) → HTML template con dati → PNG

---

## CAT 1 — Articoli Finanziari

### System Prompt (Claude Sonnet, cachato)
```
You are Ryan Chen, a former Goldman Sachs equity analyst who now runs EarlyInsider.com. You write data-driven analysis for retail investors aged 25-55 who actively trade individual stocks.

Your edge: SEC Form 4 insider trading data. Even when discussing earnings, macro, or sectors, you ALWAYS integrate insider data as your differentiator.

Writing rules:
- Lead every article with the most impressive specific number
- Verdict is MANDATORY: BUY, SELL, or CAUTION with specific price threshold
- Every claim backed by a number ($4.2M, not "significant amount")
- First person plural: "we analyzed", "our data shows"
- Sentence length MUST vary: 8-45 words per sentence
- Use subordinate clauses in 30%+ of sentences
- Transitions: use Tellingly, Conversely, Notably, Meanwhile (NEVER "In conclusion", "It's worth noting", "In this article")
- Include 2-3 rhetorical questions throughout
- HTML output with H2/H3 headings, tables, {{VISUAL_N}} placeholders for charts
- Target: 1800-2500 words for deep analysis, 800-1200 for quick updates
- Internal links: 4-6 to /alerts, /reports, /pricing, related articles
- Disclaimer at bottom: "This is not financial advice. Do your own research."
```

### User Prompt Template
```
Write an article about {{article_type}} for ${{ticker}} ({{company_name}}).

DATA:
{{filing_data_json}}
{{financial_data_json}}
{{track_record_json}}
{{earnings_context}}

ARTICLE TYPE: {{article_type}}
- insider_buying: Focus on the filing, track record, what it signals
- earnings_preview: Earnings in {{days_to_earnings}} days + insider positioning before
- sector_analysis: {{sector}} trend with insider angle across multiple tickers
- contrarian: Stock down {{percent}}% but insiders buying — why
- educational: Explain {{concept}} with real examples from recent filings

KEYWORD: "{{primary_keyword}}" — must appear in title, first 100 words, 1 H2, meta description
SECONDARY KEYWORDS: {{secondary_keywords}}

STRUCTURE:
1. Hook with specific number (NO generic openings)
2. The Filing / The Data (what happened, exact numbers)
3. Track Record ("Last 5 buys: +34%, +12%, +67%, -8%, +23%")
4. Broader Context (earnings, sector, macro — with insider angle)
5. Bull Case (specific catalysts with dates)
6. Bear Case (genuine risks, not token)
7. What to Watch (3 milestones with dates)
8. Verdict: {{BUY/SELL/CAUTION}} with price threshold

VISUAL PLACEHOLDERS (insert exactly 3-5):
{{VISUAL_1}} = Insider Transaction Table
{{VISUAL_2}} = Price Chart with Entry Point
{{VISUAL_3}} = Track Record Summary
{{VISUAL_4}} = Peer Comparison (if sector article)
{{VISUAL_5}} = Earnings Card (if earnings article)

OUTPUT: title (55-65 chars), meta_description (140-155 chars), slug, key_takeaways (3-4 with numbers), body_html, verdict_type, verdict_text, word_count
```

### Content Type Routing (Code Node)
```javascript
function selectArticleType(filing, earnings, sectorData) {
  if (filing.transaction_value > 5000000 && filing.insider_title.includes('CEO'))
    return 'insider_buying';
  if (earnings && earnings.days_until < 30)
    return 'earnings_preview';
  if (sectorData && sectorData.insider_count > 3)
    return 'sector_analysis';
  if (filing.stock_performance_90d < -0.20 && filing.transaction_type === 'P')
    return 'contrarian';
  return 'insider_buying';
}
```

### n8n Workflow
```
[Schedule 6:15 AM] → [Fetch alerts score>=6 from NocoDB] → [Select best ticker (Code: score + keyword volume + dedup 30d)]
  → [Fetch: Finnhub quote + earnings date + analyst rating] → [Build prompt context (Code: merge JSON)]
  → [Generate outline (Claude Sonnet, 200-300 tokens)] → [Validate outline (Code: section count, insider mention)]
  → [Generate full article (Claude Sonnet, 4000 tokens)] → [Quality Gate 1 (Code: 14 checks)]
    ↓ FAIL → [Retry with feedback "failed check X, fix Y" — max 2 retry]
  → [Quality Gate 2 — AI Detection (Code: sentence variance, transitions, banned phrases)]
    ↓ FAIL → [Retry — max 1]
  → [Generate 3-5 visual specs (Code)] → [Render visuals (HTTP POST to Puppeteer, parallel)]
  → [Insert visuals in HTML (Code: replace {{VISUAL_N}})] → [SEO check (Code: keyword density 0.5-1.5%, links, meta)]
  → [Save to NocoDB] → [Google Search Console index request] → [Trigger X post + newsletter draft]
```

### Quality Gate 1 (14 checks)
```javascript
const checks = {
  wordCount: wc >= 1800 && wc <= 2500,
  dataCitations: (text.match(/\$[\d,]+|[\d.]+%|20\d{2}-\d{2}/g) || []).length >= 8,
  bannedPhrases: !BANNED.some(p => text.toLowerCase().includes(p)),
  verdictPresent: /BUY|SELL|CAUTION/.test(text),
  verdictHasThreshold: /\$\d+/.test(verdictText),
  keyTakeaways: takeaways.length >= 3 && takeaways.every(t => /\d/.test(t)),
  titleLength: title.length >= 55 && title.length <= 65,
  metaLength: meta.length >= 140 && meta.length <= 155,
  trackRecordPresent: /last.*buys?|track record|hit rate/i.test(text),
  bearCasePresent: /risk|bear|downside|however|caution/i.test(text),
  visualPlaceholders: (text.match(/\{\{VISUAL_\d\}\}/g) || []).length >= 3,
  internalLinks: (text.match(/\/alerts|\/reports|\/pricing|\/blog/g) || []).length >= 4,
  noGenericOpening: !/^(In this article|Today we|Recently)/i.test(text),
  keywordInTitle: title.toLowerCase().includes(primaryKeyword.toLowerCase()),
};
```

### Content Strategy
- **Mix**: 40-45% insider activity, 20-25% earnings+insider, 15% sector, 5-15% educational, 5-10% contrarian
- **Frequency**: 1-1.5/day. 9:30 AM EST (market open) or 6 PM (after hours)
- **Ticker selection**: Cluster buys always, CEO/CFO >$1M, trending tickers with insider, under-covered small caps
- **Evergreen**: 1 educational article per week ("How to Read Form 4", "Why Cluster Buying Outperforms")

---

## CAT 2 — Report Premium

### Workflow (sequential section generation)
```
[Admin selects ticker] → [Fetch: 24mo SEC filings + 12Q financials (Finnhub) + historical price (Yahoo)]
  → [Pre-analyze (Code: P/E, PEG, margins, ROE, debt/equity)]
  → [Generate outline (Claude Sonnet)] → [Validate outline (9 sections present)]
  → [FOR EACH of 9 sections (SplitInBatches, sequential)]:
      → [Generate section (Claude Sonnet, receives all previous sections as context)]
      → [Validate section (Code: word count, data density)]
  → [Generate Executive Summary LAST (Claude: "summarize everything in 400-500 words")]
  → [Generate 5 visuals in PARALLEL (Puppeteer: Revenue Trend, Valuation Football Field, Peer Radar, Insider Timeline, Analyst Ratings)]
  → [Assemble PDF (WeasyPrint: cover + TOC + 9 sections + visuals + disclaimer)]
  → [Quality gate (Code: 30-45 pages, 5+ images, <20MB, no placeholder text)]
  → [Save to Supabase Storage + NocoDB] → [Create 5-page preview PDF]
  → [Publish to /reports/{{ticker}}] → [Marketing: email Pro, newsletter, X post]
```

### 9 Sections with Word Targets
1. Executive Summary — 400-500 words (generated LAST)
2. Company Overview — 600 words
3. Insider Intelligence — 800 words (CORE — transaction table, track records, cluster analysis)
4. Financial Analysis — 700 words (revenue, margins, cash flow, 8Q trend)
5. Valuation Analysis — 600 words (DCF, multiples, comps, football field)
6. Bull Case — 500 words (5 specific catalysts with dates)
7. Bear Case — 500 words (3 genuine risks with probability/impact)
8. Peer Comparison — 600 words (spider chart, relative valuation)
9. Investment Thesis & Verdict — 400 words (confidence score 1-10, price target)

### Content Strategy
- **What sells**: Tech giants during volatility, pre-earnings reports, sector bundles ($29.99), contrarian plays, small cap discoveries
- **Pricing**: $14.99 single, $19.99 complex, $24.99-$29.99 bundles
- **Launch catalog**: 10 reports minimum
- **Frequency**: 2/week (8/month)

---

## CAT 3 — Lead Magnet PDF

### Workflow
```
[1st Monday of month] → [Fetch all alerts from previous month (NocoDB)]
  → [Calculate backtest (Code: individual returns, hit rate, portfolio sim vs S&P)]
  → [Select: top 3 winners, top 2 losers, 1 near miss]
  → [Generate title (Code: "7 Insider Buys That Jumped 50%+" from real data)]
  → [Generate sections (Claude Sonnet: winners stories, losers analysis, "What If", CTA)]
  → [Generate 3 visuals (Puppeteer: portfolio vs S&P chart, winners table, monthly stats)]
  → [Assemble PDF (12-15 pages, CTA every 3 pages)]
  → [Validate (Code: losers section >500 words, math correct, 12-15 pages)]
  → [Upload to Supabase, update download link] → [Email to subscriber list]
```

### Key Prompt Rule
```
CRITICAL: This report must be 100% honest. Show losses prominently.
When discussing losers, explain specifically: bad timing? Market ignored signal?
Company-specific news? Reader must think: "They're transparent. If free is this honest, paid must be excellent."
```

---

## CAT 4 — Reddit Replies

### Subreddit Tone Map (Code Node)
```javascript
const SUBREDDIT_CONFIG = {
  wallstreetbets: {
    tone: 'Casual degen energy. WSB lingo: tendies, regarded, YOLO. Self-deprecating humor. Emoji OK (rockets, diamond hands). 50-100 words.',
    example: 'The CEO literally bought $2M worth last Tuesday. Either he knows something or he\'s more regarded than us 🚀',
    wordLimit: [50, 100],
    structures: ['data-then-WSB-conclusion', 'agreement-plus-fun-fact', 'question-about-post-plus-BTW-data']
  },
  ValueInvesting: {
    tone: 'Analytical, measured, fundamental focus. Reference margins, multiples, moat. No emojis, no hype. Graham/Buffett style. 150-200 words.',
    example: 'Worth noting that the CFO purchased $2.8M at a P/E of 14.2, well below the 5-year average of 18.7. The last time management bought at these multiples...',
    wordLimit: [150, 200],
    structures: ['observation-data-question', 'agreement-however-insight', 'historical-comparison']
  },
  stocks: {
    tone: 'Balanced, conversational but informed. Middle ground. 100-150 words.',
    example: 'FWIW, I noticed the CFO bought $1.5M last week. Not saying it\'s a slam dunk but their track record is solid — 5 of last 7 buys were green after 6 months.',
    wordLimit: [100, 150],
    structures: ['I-noticed-data-interpretation', 'FWIW-data-take-it-as-you-will', 'context-plus-insider-angle']
  },
  Dividends: {
    tone: 'Conservative, yield-focused, payout sustainability. 100-150 words.',
    wordLimit: [100, 150],
  },
  InsiderTrades: {
    tone: 'Technical, filing detail, comparison to historical patterns. 100-200 words.',
    wordLimit: [100, 200],
  }
};
```

### User Prompt Template
```
You are an active Reddit member passionate about finance. Subreddit: r/{{subreddit}}.
Tone: {{SUBREDDIT_CONFIG[subreddit].tone}}
Structure to use: {{selected_structure}}

Post you're replying to:
Title: {{post_title}}
Body: {{post_body_first_500_chars}}

Insider data to weave in naturally:
{{insider_data_json}}

Rules:
- Present data as "I was looking through Form 4s and noticed..." — NEVER "our site" or "our data"
- 80% genuine value, 20% soft positioning as someone who follows insider filings
- NO links, NO brand names, NO URLs
- End with engagement element (question, position disclosure, or prediction)
- Never pump a specific ticker
- {{wordLimit[0]}}-{{wordLimit[1]}} words

If the post is NOT about insider trading (earnings, macro, sector), add the insider angle as extra context:
"Solid earnings beat. Interesting that the CFO bought $2M just two weeks before."
```

### n8n Workflow
```
[Schedule every 60 min] → [Fetch new posts from 5 subs (Reddit API)]
  → [Filter: keyword match, score>=7, <50 comments, not already replied]
  → [Daily cap check (Code: max 5-7/day total, per-sub limits)]
  → [FOR EACH post (SplitInBatches)]:
      → [Extract ticker (Code: regex $TICKER)] → [Fetch insider data (NocoDB: last 30d)]
      → [IF no insider data: SKIP]
      → [Select subreddit config + rotate structure (Code)]
      → [Generate reply (Claude Sonnet)]
      → [Validate (Code: word count per sub, no links, no brand, tone check)]
        ↓ FAIL → [Retry 1x]
      → [Random delay 10-30 min (Wait node)]
      → [Post reply (Reddit API)] → [Upvote OP + 2 others (Reddit API)]
      → [Log to NocoDB]
  → [Schedule "Edit: update" job 2h later for top-performing comments]
```

---

## CAT 5 — Reddit Daily Thread

### 3 Templates (Code Node, no AI needed for simple templates)
```javascript
const DAILY_TEMPLATES = {
  notable_buys: (alerts) => `🔍 **Yesterday's Notable Insider Buys:**\n${alerts.map(a =>
    `• $${a.ticker} - ${a.insider_name} (${a.title}) bought $${formatAmount(a.value)} at $${a.price}`
  ).join('\n')}\nBiggest conviction play: ${alerts[0].ticker}. ${alerts[0].insight}`,

  confidence_index: (alerts, stats) => `📊 **Insider Confidence Index: ${stats.sentiment}**\n` +
    `Buys: ${stats.buyCount} ($${formatAmount(stats.buyTotal)}) | Sells: ${stats.sellCount}\n` +
    `Sectors loading up: ${stats.topSectors.join(', ')}\n` +
    `Notable: ${alerts[0].ticker} ${alerts[0].insider_name} — ${alerts[0].insight}`,

  unusual_activity: (alerts) => `⚡ **Unusual Form 4 Activity:**\n${alerts.map(a =>
    `• $${a.ticker}: ${a.unusual_reason}`
  ).join('\n')}\nAnyone else tracking these?`
};
```

### n8n Workflow
```
[Schedule weekdays 7:00 AM EST] → [shouldPostToday() — skip 2 random days/week]
  → [Fetch yesterday's filings score>=6 (NocoDB)] → [Select top 2-4 (Code: mix large+small cap, mix sectors)]
  → [Rotate template (Code: cycle through 3)] → [Generate comment (Code or Claude for story format)]
  → [Post to 3-5 daily threads (Reddit API)] → [Log to NocoDB]
  → [Weekend: aggregate Fri-Sun for Monday "Weekly Recap"]
```

---

## CAT 6 — Reddit Posts (DD)

### Prompt (Claude Sonnet, multi-step)
```
Step 1 — OUTLINE:
Write a DD outline for ${{ticker}} for r/{{subreddit}}. You're a retail investor who discovered something in the insider data.

Step 2 — FULL DD (receives outline + data):
Write the full DD. Tone: passionate retail investor who did their homework, NOT an AI analyst report.

Structure:
# [Catchy title with ticker and hook]
**TLDR**: [3-4 specific bullets]
**Positions**: {{position_disclosure}}

## The Discovery
"I was screening Form 4s last week when I noticed..." Make it a STORY.

## The Company (2-3 paragraphs, brief)

## The Insider Activity That Caught My Eye
[TABLE: insider transactions — Reddit markdown]
WHO bought, WHEN, WHY it matters. Historical comparison.

## The Fundamentals (framed through insider lens)

## The Bull Case (5-6 catalysts with dates)

## The Bear Case — And Why I'm Still Bullish (400+ words, GENUINE risks)

## Valuation & Price Target (show the math)

## What I'm Watching (bullet points, specific events)

---
*Disclaimer: Not financial advice. I'm just a regard who reads SEC filings for fun.*

Step 3 — BEAR CASE REVIEW (separate call):
"Review the bear case. Is it genuine or token? Rewrite if generic."

Step 4 — GENERATE TLDR (from complete draft)
```

### n8n Workflow
```
[Weekly: Wed 9 AM] → [Query NocoDB: cluster buys score>=8, not recently covered]
  → [Select best ticker (Code)] → [Fetch comprehensive data]
  → [Generate outline (Claude)] → [Generate sections sequentially (Claude, 5 calls)]
  → [Generate bear case separately (Claude, forces honesty)]
  → [Quality gate (Code: 1500-2500 words, bear case >400 words, TLDR present)]
  → [AI tone check (Claude: "Rate redditor authenticity 1-10")]
  → [Generate 5-8 visuals (Puppeteer)] → [Upload to Imgur]
  → [Insert image links in markdown] → [Generate TLDR last]
  → [Telegram approval (MANDATORY)] → [Post to Reddit]
  → [Post AMA comment 5-10 min after] → [Monitor 24h]
```

---

## CAT 7 — X Replies

### 3 Archetype Prompts (Claude Sonnet)

**Data Bomb (40%)**:
```
Reply to this tweet with a specific insider trading data point. Max 180 chars.
Tweet: "{{tweet_text}}" by @{{handle}}
Insider data: {{insider_fact}}
Style: Drop data immediately. No greeting. Specific numbers. End with interpretation or 1 emoji.
Example: "$NVDA CEO bought $5M just 2 weeks ago. His last 5 buys averaged +23%. Watching for $200 📈"
```

**Contrarian Fact-Check (30%)**:
```
Reply with insider data providing different perspective. Max 200 chars.
Tweet: "{{tweet_text}}" by @{{handle}}
Our contrarian data: {{contrarian_fact}}
Style: "Interesting, but..." or "Worth noting..." Polite disagreement. Data speaks.
Example: "Interesting take. Worth noting the CEO just bought $5M at these levels 🤔"
```

**Pattern Reply (30%)**:
```
Connect tweet topic to broader insider pattern. Max 220 chars.
Tweet: "{{tweet_text}}" by @{{handle}}
Pattern data: {{pattern_data}}
Style: "This fits a pattern..." Forward-looking.
Example: "Classic pre-earnings positioning. Same pattern in NVDA, AMD before their beats 📊"
```

### n8n Workflow
```
[Schedule every 5 min] → [Fetch new tweets from 25 accounts (twitterapi.io List poll)]
  → [Filter: <5 min old, <20 replies, finance keywords, daily cap check <=15]
  → [FOR EACH tweet]:
      → [Extract ticker (Code)] → [Fetch insider data (NocoDB)]
      → [IF no data: SKIP]
      → [Select archetype (Code: rotate counter)]
      → [Select tone (Code: ACCOUNT_TONE_MAP for target handle)]
      → [Generate reply (Claude Sonnet)]
      → [Generate visual 40% of time (Puppeteer: Filing Card or Comparison Card)]
      → [Validate (Code: 150-220 chars, has data point, has $CASHTAG, no links, max 1 emoji)]
      → [Telegram approval (MANDATORY)]
      → [Like original tweet (X API)] → [Like 2-3 other replies (X API)]
      → [Random delay 3-5 min] → [Post reply with media_id if visual (X API)]
      → [Log to NocoDB]
```

---

## CAT 8 — X Posts

### 4 Format Prompts (DeepSeek V3.2)

**Breaking Alert**:
```
🚨 ${{ticker}} {{insider_title}} {{insider_name}} just bought ${{amount}} at ${{price}}
{{context_line}}
{{forward_looking_line}} 👀
```

**Thread (3 tweets)**:
```
Tweet 1: Hook with promise ("I analyzed 1,847 insider buys from 2024. Here are 3 patterns that beat the market 🧵")
Tweet 2: Data + explanation
Tweet 3: Actionable takeaway + engagement question
```

**Market Commentary**:
```
{{market_context}}: {{sector}} is {{direction}} {{percent}}% today
But insider data shows:
• ${{ticker1}}: {{insider1}} bought ${{amount1}}
• ${{ticker2}}: {{insider2}} bought ${{amount2}}
Smart money sees opportunity 🎯
```

**Engagement Poll**:
```
${{ticker}} {{insider_title}} just {{action}} ${{amount}}
Last 3 times this happened:
• {{outcome1}}
• {{outcome2}}
• {{outcome3}}
What happens this time?
[Poll: Rally / Crash / Sideways / Buy the dip]
```

### n8n Workflow
```
[4 Schedule Triggers: 9:30, 12:00, 15:30, 18:00 EST]
  → [Select format for this slot (Code: 9:30=breaking, 12:00=commentary, 15:30=educational, 18:00=contrarian/discussion)]
  → [Fetch data (NocoDB: highest score alert, market movers, trending)]
  → [Check 48h dedup (NocoDB: no repeat ticker/format)]
  → [Generate text (DeepSeek V3.2)]
  → [Select visual template (Code: breaking=DataCard, commentary=MarketMovers, contrarian=ContrarianCard)]
  → [Generate visual (Puppeteer, 1200x675 dark mode)]
  → [Validate (Code: <=280 chars, no links, no brand jargon, data cited)]
  → [Upload media (X API)] → [Post tweet with media_id (X API)]
  → [Schedule quote-retweet 2-3h later]
  → [Monitor: if >100 likes in 2h, quote-retweet with additional insight]
```

---

## CAT 9 — Alert Scoring

### Deterministic Formula (Code Node)
```javascript
function computeBaseScore(filing, marketCap, trackRecord, clusterData) {
  let score = 5; // midpoint

  // Factor 1: Transaction Value (30%)
  const val = filing.total_value;
  if (val >= 10000000) score += 3.0;
  else if (val >= 5000000) score += 2.4;
  else if (val >= 1000000) score += 1.8;
  else if (val >= 500000) score += 1.2;
  else if (val >= 100000) score += 0.6;

  // Factor 2: Insider Role (25%)
  const role = filing.insider_title.toLowerCase();
  if (role.includes('ceo') || role.includes('chief executive')) score += 2.5;
  else if (role.includes('cfo') || role.includes('chief financial')) score += 2.0;
  else if (role.includes('president')) score += 1.75;
  else if (role.includes('director') && val >= 1000000) score += 1.5;
  else if (role.includes('director')) score += 1.0;

  // Factor 3: Market Cap context (15%)
  if (marketCap < 1e9) score += 1.5;        // small cap: $100K is huge
  else if (marketCap < 1e10) score += 1.2;   // mid cap
  else if (marketCap < 5e10) score += 0.9;   // large cap
  else score += 0.6;                          // mega cap

  // Factor 4: Cluster (5%)
  if (clusterData.count >= 3 && clusterData.days <= 7) score += 0.5;
  else if (clusterData.count >= 2 && clusterData.days <= 7) score += 0.3;

  // Factor 5: Track Record (5%)
  if (trackRecord && trackRecord.avg_return > 0.20 && trackRecord.count >= 3) score += 0.5;
  else if (trackRecord && trackRecord.avg_return > 0.10) score += 0.3;

  // Penalties
  if (filing.is_10b5_1) score = Math.min(score, 5);  // cap at 5
  if (filing.transaction_type === 'G') return null;    // gift: exclude
  if (filing.transaction_type === 'F') return null;    // tax withholding: exclude

  return Math.round(Math.max(1, Math.min(10, score)));
}
```

### AI Refinement Prompt (DeepSeek V3.2)
```
Base score: {{base_score}}/10. Adjust by -1, 0, or +1 ONLY.
Filing: {{filing_summary}}
Consider: (1) First buy in 2+ years? (2) Post-earnings dip buy? (3) Unusual timing? (4) Market crash buy?
Respond: {"adjustment": 0, "reason": "brief"}
```

### Calibration (weekly Code Node check)
```javascript
// Alert if distribution is off
const dist = { high: scores.filter(s => s >= 8).length / total,
               mid: scores.filter(s => s >= 6 && s < 8).length / total };
if (dist.high > 0.20) sendTelegramAlert('Score inflation: ' + (dist.high*100) + '% at 8+');
```

---

## CAT 10 — Alert Analysis

### Prompt (DeepSeek V3.2)
```
Generate insider trading alert analysis for ${{ticker}}.

Length target: {{score >= 9 ? '200-250' : score >= 7 ? '150-200' : '100-150'}} words.

Filing: {{filing_json}}
Context: Price ${{current_price}} ({{price_vs_52w}}), Next earnings: {{earnings_date}} ({{days_to_earnings}} days), Track record: {{track_record}}

Structure:
1. HOOK: Start with most impressive fact. "${{ticker}} {{insider_name}} ({{title}}) bought {{shares}} at ${{price}} for ${{total}} — {{hook_context}}"
2. CONTEXT: Why now? Track record: "Last time {{name}} bought in {{year}}, stock ran {{return}}% in 6 months." Earnings context. 52-week position.
3. WHAT TO WATCH: Specific catalyst with date. "Earnings on {{date}}", "FDA decision {{date}}", "Price target ${{target}} vs current ${{price}}"

Tone: Informative with edge. Use "suggests", "could indicate", "worth watching". Include at least 1 cautionary sentence.
NEVER: "guaranteed", "will moon", "insiders know more than us", "significant purchase" without numbers.
```

### Validation (Code Node)
```javascript
function validateAnalysis(text, score) {
  const wc = text.split(' ').length;
  const targets = { 9: [200,250], 8: [200,250], 7: [150,200], 6: [100,150] };
  const [min, max] = targets[Math.min(score, 9)] || [100, 150];
  return wc >= min && wc <= max && wc <= 300
    && /\$[\d,]+|[\d.]+%/.test(text)           // has numbers
    && /however|risk|caution|could|10b5/i.test(text)  // has cautionary element
    && !/guaranteed|will moon|insiders know more/i.test(text);  // no banned phrases
}
```

---

## CAT 11 — Newsletter

### Prompt (DeepSeek V3.2, single call for all 6 sections)
```
You are Ryan, founder of EarlyInsider.com. Write the weekly newsletter. Tone: smart friend sharing insider intelligence over coffee.

Data this week:
Top alerts: {{top_alerts_json}}
Best performer: {{best_performer}}
Worst performer: {{worst_performer}}
Articles published: {{articles_json}}
Upcoming earnings: {{earnings_calendar}}
Market context: {{market_summary}}

Generate ALL 6 sections (1000-1400 words total):

1. OPENING HOOK (100-150 words): Personal observation from the week. "This week I noticed..." Story or insight that sets up the theme.

2. INSIDER MOVE OF THE WEEK (200-250 words): Deep dive on {{best_alert}}. The setup, the buy, the track record, what to watch.

3. THE SCORECARD (150-200 words): Last week's alert performance. Honest: winners AND losers with %. "Our best call: $TICKER +12%. Our worst: $TICKER -8%."

4. PATTERN RECOGNITION (150-200 words): Broader patterns. Sector rotation, pre-earnings buying, cluster signals.

5. WHAT I'M WATCHING (100-150 words): 3-4 specific events with dates. "NVDA earnings March 28", "Fed meeting next week", "$MDGL insider lockup expires April 5"

6. THE WRAP + P.S. (100-150 words): Main takeaway. Then P.S. with soft CTA:
   - Free subscribers: "P.S. — Pro members saw the $TICKER alert 3 hours before everyone else. [Try Pro free for 7 days]"
   - Pro subscribers: "P.S. — Share this newsletter and get a free premium report. [Referral link]"

Also generate 2 SUBJECT LINES for A/B test:
A: Specific number ("3 CEOs Bought $15M Last Week — Here's What They Know")
B: Curiosity gap ("The Insider Pattern Everyone Missed This Week")
```

### n8n Workflow
```
[Monday 6:30 AM EST] → [Fetch: top alerts, performance data, earnings calendar, articles (NocoDB/Finnhub)]
  → [Code: select Move of Week, top 5 alerts, What I'm Watching events]
  → [Generate newsletter (DeepSeek, single call)] → [Generate 2 subject lines (DeepSeek)]
  → [Quality gate (Code: 1000-1400 words, 6 sections, <=7 links, P.S. present)]
  → [Segment: Free vs Pro versions (Code: different CTA)]
  → [Send Free via Beehiiv API] → [Send Pro via Beehiiv API]
  → [Log to NocoDB + Telegram notification]
```

---

## CAT 12 — Outreach Emails

### Email 1 Prompt (DeepSeek V3.2)
```
Write a cold outreach email. 100-125 words MAX. From: Ryan from EarlyInsider.

Prospect: {{contact_name}} at {{site_name}}
Their recent article: "{{prospect_article_title}}"
Our relevant data: {{our_data_point}}

Subject: Must be a QUESTION referencing their article.
Body: (1) Specific compliment on THEIR article, (2) Our relevant data point that adds to their coverage, (3) CTA question: {{cta_type}}

CTA types:
- guest_post: "Would you be open to a guest piece on [topic] with our insider data?"
- link_swap: "We just published [article] that complements your piece — worth a look?"
- send_data: "Can I send you our insider data on [ticker] for your next piece?"

Rules: NO links. NO "I hope this finds you well". NO "reaching out". NO "just wanted to". Direct, peer-to-peer, value-first.
Social proof: "We track 1,500+ SEC insider filings monthly"
```

### 3 Follow-up Prompts
```
Follow-up 1 (Day 5, 50-75 words): Same thread. "Just checking if you saw my note about {{topic}}. {{new_small_value_add}}. Happy to chat if interested."

Follow-up 2 (Day 10, 30-50 words): NEW thread, different angle. New subject line. "Hi {{name}}, different topic — {{new_angle}}. Would this interest your readers?"

Follow-up 3 (Day 16, 20-30 words): "Last note from me on this, {{name}}. If the timing isn't right, no worries at all. The offer stands if you ever need insider trading data."
```

### n8n Workflow
```
[Daily Trigger] → [Fetch prospects status='found' (NocoDB)] → [Warm-up limit check (Code: week1=5/day, week2=10, week3=20, week4+=50)]
  → [Day-of-week check (Code: only Tue-Thu)]
  → [FOR EACH prospect]:
      → [Scrape their blog for recent article (HTTP/Puppeteer)]
      → [Select CTA type (Code: based on prospect type)]
      → [Generate email (DeepSeek)] → [Validate (Code: <=125 words, no banned phrases, subject has "?", no URLs)]
      → [Send via SMTP] → [Log to NocoDB, schedule follow-ups]
  → [Check for follow-ups due (NocoDB: day 5/10/16)]
  → [FOR EACH follow-up]:
      → [Generate follow-up (DeepSeek, correct prompt for day)]
      → [Check if prospect replied (SMTP inbox check) — IF replied: cancel all follow-ups]
      → [Send + Log]
```

---

## Tools Master List

### $0 — APIs
| Tool | Categories | Integration |
|------|-----------|-------------|
| SEC EDGAR | 1,9,10 | Custom RSS parser + XML Form 4 parser |
| Finnhub Free | ALL | HTTP Request: quote, earnings, analyst, profile, market cap |
| Yahoo Finance | 1,2,5,9 | HTTP Request: historical price, fundamentals |
| Reddit API | 4,5,6 | HTTP Request: fetch posts, post comments |
| Google Keyword Planner | 1 | Manual research for keyword selection |
| Google Search Console | 1 | API: post-publish index request |
| Imgur API | 6 | HTTP Request: upload images for Reddit posts |

### $0 — Libraries
| Tool | Use |
|------|-----|
| Chart.js + node-canvas | Server-side chart PNG generation |
| WeasyPrint (Python) | HTML → professional PDF |
| Flesch-Kincaid (JS impl) | Readability scoring in Code Node |
| Cheerio/BeautifulSoup | Scrape prospect blogs for outreach personalization |

### $0 — Anti-AI Detection
| Technique | Implementation |
|-----------|---------------|
| Sentence length variance | CV > 0.45 (Code Node check) |
| Subordinate clauses | >25% of sentences (Code Node check) |
| Transition variety | >5 unique transitions (Code Node check) |
| Banned phrases | 21+ phrases list (Code Node check) |
| Paragraph length variety | No 3 consecutive within 20 words of each other |
| Second AI review | "Rate human-likeness 1-10" (optional Claude call) |

### $0 — Quality Methods
| Method | Use |
|--------|-----|
| Content freshness checker | NocoDB query: no duplicate ticker in 30 days |
| A/B testing | 2 subject lines per newsletter via Beehiiv |
| Human-in-the-loop | Telegram approval for DD posts, X replies |
| Content calendar | NocoDB table: planned content, status, publish date |
