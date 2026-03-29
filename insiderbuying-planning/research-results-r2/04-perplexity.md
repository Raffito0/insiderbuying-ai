# Research R2: Perplexity Deep

**Time**: 307.5s
**Tokens**: in=10856, out=26157
**Citations**: 0

---

# EarlyInsider.com — Sistema Completo di Generazione Contenuti

Questo documento fornisce il playbook operativo per tutte e 12 le categorie di contenuto, i 15 template visual, la strategia di contenuti, e gli strumenti per ottenere qualità 10/10 con budget ~$20/mese.

---

## PARTE 1: CATEGORIE DI CONTENUTO (1-12)

---

### CAT 1 — Articoli Finanziari (Blog SEO)

#### n8n Workflow Architecture

```
[Schedule: 6:15 AM daily] 
  ↓
[Node 1: Fetch SEC Alerts di ieri] (Query NocoDB, filter score >= 6)
  ↓
[Node 2: Select best ticker] (Code: score weighting + keyword volume check)
  ↓
[Node 3: Fetch supplemental data] (Finnhub: quote, earnings date, analyst rating | YFinance: fundamentals)
  ↓
[Node 4: Fetch recent articles] (Search NocoDB: articoli su stesso ticker ultimi 30gg)
  ↓
[IF: Similar article exists?]
  ├─ YES → [Code: Calculate content angle delta] → [IF delta > threshold?]
  │          ├─ NO → Skip (publish only when angle is fresh)
  │          └─ YES → Continue
  └─ NO → Continue
  ↓
[Node 5: Build prompt context] (Code: JSON con {{ticker}}, {{insider_data}}, {{earnings_date}}, {{analyst_rating}}, {{content_type}})
  ↓
[Node 6: Generate article outline] (Claude Sonnet: "Generate 7-section outline") — 200-300 tokens
  ↓
[Node 7: Validate outline] (Code: Regex per "1.", "2.", "3." — min 6 section, max 10)
  ↓
[IF: Outline valid?] ├─ NO → Retry with feedback (max 2 attempts)
  └─ YES → Continue
  ↓
[Node 8a-8g: Generate sections in parallel] (7x Claude Sonnet: "Expand section N with data") — 800-1200 tokens each
  ↓
[Node 9: Assemble draft article] (Code: Concatenate sections + add intro + add conclusion)
  ↓
[Node 10: Quality gate #1 - Basic checks] (Code node: word count 1800-2500, at least 3 data citation, no banned AI phrases)
  ├─ IF fail → Retry node 8 (full section regen) with feedback
  └─ IF pass → Continue
  ↓
[Node 11: Quality gate #2 - AI detection check] (Code: Variance check — sentence length distribution, subordinate clause % > 25%, transition word variety)
  ├─ IF too uniform → "Rewrite 30% of sentences to vary structure and length"
  └─ IF pass → Continue
  ↓
[Node 12: Generate visual specs] (Code: Determine which 3-5 visuals based on content type)
  ↓
[Node 13a-13e: Async - Generate visuals in parallel]
  ├─ [HTTP POST to screenshot server: Template 1, 4, 5] (Puppeteer render HTML → PNG)
  └─ [Code: Generate Table 4 as inline HTML]
  ↓
[Node 14: Insert visuals into article] (Code: Replace {{VISUAL_1}}, {{VISUAL_2}}) with img tags
  ↓
[Node 15: Quality gate #3 - Final SEO check]
  ├─ Keyword in title: Y/N
  ├─ Keyword in H1: Y/N
  ├─ Meta description draft (160 chars): Y/N
  ├─ Internal link opportunity (link to report on same ticker): Y/N
  └─ IF any fail → Add field in article JSON for manual fix
  ↓
[Node 16: Save to NocoDB] (articles table: {{title}}, {{slug}}, {{content_html}}, {{seo_meta}}, {{published_at}}, {{ticker}}, {{content_type}})
  ↓
[Node 17: Publish to WordPress] (REST API: POST /wp-json/wp/v2/posts + featured image)
  ↓
[IF publish success?] ├─ YES → Continue
  └─ NO → Telegram notification + retry queue
  ↓
[Node 18: Share to channels]
  ├─ X post (TweetDeck API): {{title}} {{URL}} + visual
  ├─ Newsletter draft (save to Beehiiv draft)
  ├─ Reddit cross-post (r/stocks, r/investing — humanize slight variations)
  └─ Send to Telegram: Publish notification

**Timing**: Seq 1-7 = 30-45s, Parallel 8a-8g = 90-120s per section, Seq 9-18 = 60-90s. **Total: ~4-6 min per articolo.**
```

#### Workflow Ottimale (Step-by-Step)

| Step | Azione | Input | Output | Durata |
|------|--------|-------|--------|--------|
| 1 | Fetch SEC alerts da NocoDB filter score >= 6 | — | [15-30 alerts] | 2s |
| 2 | Score weighting + keyword volume (SEMrush fallback: monthly volume data) | [15-30 alerts] | {{best_ticker}} | 3s |
| 3 | Fetch dati supplementari (Finnhub quote + earnings + rating) | {{ticker}} | {{quote}}, {{earnings_date}}, {{analyst_rating}} | 2s |
| 4 | Query articoli recenti stesso ticker | {{ticker}} | [0-3 articoli ultimi 30gg] | 1s |
| 5 | Calc angle delta (NLP: cosine similarity tra {{insider_angle}} e articoli precedenti) | Content type + insider data | angle_freshness_score: 0-100 | 2s |
| 6 | Build prompt context (Code: merge all data into structured JSON) | All above | {{context_json}} | 1s |
| 7 | Generate outline (Claude Sonnet) | {{context_json}} + content_type | {{outline_7sections}} | 30s |
| 8 | Validate outline (Code: regex, structure check) | {{outline_7sections}} | validated ✓ OR error msg | 1s |
| 9 | Generate 7 sections (Claude Sonnet x7 parallel) | {{context_json}} + {{section_n}} + {{outline}} | {{section_1_body}} … {{section_7_body}} | 120s |
| 10 | Assemble draft (Code: concatenate + format) | [{{section_1}}…{{section_7}}] | {{draft_article_html}} | 2s |
| 11 | Quality gate #1: Basic checks (Code) | {{draft_article_html}} | pass/fail + [errors] | 2s |
| 12 | If fail: Retry gen section (Code + Claude) with feedback | {{errors}} | {{draft_article_html_v2}} | 60-90s |
| 13 | AI detection variance check (Code) | {{draft_article_html}} | pass/fail + variance_score | 3s |
| 14 | If fail: Rewrite variance sections (Claude) | {{variance_report}} | {{draft_article_html_v2}} | 45s |
| 15 | Generate visual specs (Code) | content_type, insider_count | [{{visual_1_spec}}, …, {{visual_5_spec}}] | 2s |
| 16 | Render visuals (HTTP to screenshot server x5 parallel) | [{{visual_specs}}] | [{{visual_1.png}}, …, {{visual_5.png}}] | 20-30s |
| 17 | Insert visuals (Code: replace {{VISUAL_}} placeholders) | {{draft_html}} + [.png files] | {{final_article_html}} | 2s |
| 18 | SEO final check (Code) | {{final_article_html}}, {{ticker}} | pass/fail + seo_fields | 2s |
| 19 | Save to NocoDB (Append row: articles table) | {{final_article_html}}, metadata | row_id | 1s |
| 20 | Publish to WordPress (REST API) | {{row_id}}, {{final_article_html}} | post_id, post_url | 3s |
| 21 | X share (Async queue) | post_url, {{title}}, visual | tweet_id OR queue | 2s |
| 22 | Newsletter draft save (Beehiiv) | post_url, content snippet | draft_id | 1s |
| 23 | Telegram notification | post_url, status | notification sent | 1s |

**Total time: 5-8 min per articolo (90-95% è generazione AI)**

---

#### Prompt Design

**SYSTEM PROMPT** (Claude Sonnet — cached):

```
You are Marcus Chen, a data-driven financial analyst at EarlyInsider.com. 
Your goal: Write SEO-optimized financial articles that blend insider trading 
intelligence with mainstream finance analysis (earnings, macro, sectors, education).

Your writing style:
- Data-first: Always cite specific numbers (prices, dates, percentages, dollar amounts)
- Conversational but authoritative: Explain WHY insiders matter, don't just report the data
- Clear verdict: BUY/SELL/CAUTION with one sentence justification
- Contrarian edge: Find the uncommon angle ("Everyone bearish on $NVDA, but CFO just loaded up")

Structure:
1. **Hook** (2-3 sentences): What happened? Why should retail investors care?
2. **The Insider Angle** (200-300 words): SEC filing data, insider name/title/amount, context
3. **The Broader Context** (300-400 words): Earnings surprise? Sector trends? Macro backdrop?
4. **What It Means** (200-250 words): Historical track record of this insider, what similar buys led to
5. **The Bull Case** (200-250 words): Why this is bullish
6. **The Bear Case** (150-200 words): Risks, counter-arguments, when this bet goes wrong
7. **What to Watch** (150-200 words): Catalyst dates, earnings, competitor moves, price targets

Data Requirements:
- Cite SEC filing: "John Smith, CFO of $NVDA, purchased 10,000 shares at $147.23 on Mar 21, 2026"
- Always include: insider's track record (past 3 years: X buys, average +Y% in 6mo)
- Reference earnings date/price target if available
- Use specific numbers, never generalize ("around $150" → "$147.23")

Verdict Rule:
- BUY: Insider track record >+60% avg gain in 6mo, recent catalyst within 90 days, price < 52w high
- SELL: Insider history >-20% avg loss, insider selling after recent rally, price > analyst target
- CAUTION: Mixed track record or unclear catalyst

Length: 1800-2500 words exactly (count from Hook start to Watch end, excl. visuals)
AI Detection: Vary sentence length (8-45 words), use 3+ types of punctuation, 
subordinate clauses in 30%+ sentences, uncommon transitions (Moreover, In contrast, 
Tellingly), specific examples, rhetorical questions.

Visuals to embed as {{PLACEHOLDER}}:
- {{VISUAL_1}}: Insider Transaction Table (all buys/sells by this insider, past 5 years)
- {{VISUAL_2}}: Price Chart with Entry Point (price chart 1Y, mark CEO buy date)
- {{VISUAL_3}}: Insider Track Record (bar chart: past 10 trades, % return each)
- {{VISUAL_4}}: [conditional - only if sector analysis] Peer Comparison (insider buying in same sector)
- {{VISUAL_5}}: [conditional - only if contrarian] Consensus vs Reality (analyst bullish %, insider buying $)
```

**USER PROMPT TEMPLATE** (for section expansion — 7x call):

```
Content Type: {{content_type}} 
[Options: insider_activity | earnings_plus_insider | sector_analysis | educational | contrarian]

Ticker: {{ticker}}
Company: {{company_name}}
Industry: {{industry}}

INSIDER DATA:
- Name: {{insider_name}}
- Title: {{insider_title}}
- Transaction: {{trans_type}} {{shares_count}} shares @ ${{price}} on {{date}}
- Dollar value: ${{transaction_value}}
- Past 5 years: {{past_trades_count}} trades, avg return {{avg_return}}% (6mo holding period)
- Last trade: {{days_ago}} days ago

MARKET DATA:
- Current price: ${{current_price}}
- 52W high: ${{high_52w}} | Low: ${{low_52w}}
- Next earnings: {{earnings_date}}
- Analyst consensus: {{consensus_rating}} | Price target: ${{price_target}}
- Insider selling by others? {{insider_selling_flag}} (Y/N)

SECTION TO EXPAND:
Section: {{section_number}} — {{section_title}}
Outline: {{section_outline_bullet_points}}

Previous sections (for context continuity):
{{previous_sections_summary}}

---

INSTRUCTIONS FOR THIS SECTION:

Expand the outline above into 2-3 paragraphs (200-400 words typically). Requirements:
- {{section_specific_requirements}} [varies by section]
- Use at least 2 specific numbers/data points
- Include a transition sentence linking to previous section or next section
- Vary sentence length: 5-10 words, 15-25 words, 35+ words
- {{tone_requirements}} [conversational/analytical/cautionary/bullish/etc based on section]
- If citing insider, use exact name + title format: "John Smith, CFO of {{company_name}}"

OUTPUT: 
Plain HTML <p> tags only. No markdown. No {{VISUAL}} placeholders in this section's content 
(visuals go in separate assembly step).
```

**Section-Specific Requirements**:

| Section | Requirement |
|---------|-------------|
| 1. Hook | Start with specific number or action: "On March 21, 2026, John Smith, CFO of Nvidia, bought..." NOT "Recently insiders have been buying..." |
| 2. Insider Angle | Cite filing verbatim if possible. Include: title, amount, date, track record %. Must answer: "Why does this insider's opinion matter?" |
| 3. Broader Context | If {{content_type}} = earnings_plus_insider: explain EPS surprise, guidance. If sector_analysis: trend in sector. Never just repeat insider data. |
| 4. What It Means | Historical comparison: "The last 3 times John bought, stock returned +X%, +Y%, +Z% in 6 months." Track record is KEY. |
| 5. Bull Case | Specific catalysts: "Earnings in 30 days," "AI cycle just starting," "Price target $180 vs $150 now." NOT generic bullish sentiment. |
| 6. Bear Case | MUST be genuine risks, not dismissal. "Insider bought but competition is intensifying," "valuation stretched at 45x P/E," "previous buy was wrong (stock -15%)." |
| 7. What to Watch | 3 milestones: "Next earnings {{date}}", "Competitor earnings {{date}}", "Price target {{price_target}} would suggest +X% upside." Specific dates only. |

---

**FEW-SHOT EXAMPLES** (What good output looks like):

**Example 1: Hook + Insider Angle (insider_activity type)**

```html
<p><strong>On March 16, 2026, Sarah Chen, CFO of Broadcom (AVGO), purchased 15,000 shares 
at $187.50.</strong> That's $2.8 million of her own money—a signal retail investors ignore 
at their peril. Insider buys by C-suite executives account for just 0.02% of daily trading 
volume, yet historical data shows that insider buys beat the market by 2.3% annualized over 
the following 6 months.</p>

<p>Why does Chen's $2.8M matter? Over the past 5 years, Chen has executed 7 insider buys, 
and the average return 6 months post-purchase was +18.4%. Her track record isn't perfect—
her buy in January 2024 at $140 saw the stock dip to $135 before rebounding—but she has 
a habit of buying near inflection points, not near peaks. Today, AVGO is trading at $187.50, 
which is 8% below the analyst consensus price target of $203.</p>
```

**Example 2: Bear Case (even for bullish insider)**

```html
<p>The bear case is real. Broadcom faces two headwinds: first, semiconductor demand 
uncertainty—the company's next earnings (April 10) could miss guidance if AI capex cycles 
slow. Second, competitive pressure from Advanced Micro Devices (AMD) is intensifying; AMD's 
chip prices have fallen 12% year-over-year, which could pressure Broadcom's margins. Chen's 
previous insider buy in September 2023 at $142 did return +31% in 6 months, but market 
conditions were more favorable then.</p>

<p>There's also this: Chen sold 8,000 shares in January 2026 (stock at $165), which suggests 
she had different timing assumptions then. The fact that she's buying again after only 2 months 
suggests either conviction has changed, or she's diversifying within her portfolio—not a clear 
bullish signal.</p>
```

---

#### Data Pipeline

**Input Sources**:

```json
{
  "sec_filing": {
    "ticker": "AVGO",
    "insider_name": "Sarah Chen",
    "insider_title": "Chief Financial Officer",
    "transaction_type": "BUY",
    "shares": 15000,
    "price": 187.50,
    "date": "2026-03-16",
    "form4_link": "https://www.sec.gov/cgi-bin/browse-edgar?...",
    "filing_date": "2026-03-17"
  },
  "finnhub_quote": {
    "ticker": "AVGO",
    "current_price": 187.50,
    "high_52w": 195.00,
    "low_52w": 155.00,
    "market_cap_m": 82000,
    "analyst_target": 203.00,
    "analyst_consensus": "BUY (18/20 analysts)"
  },
  "yfinance_fundamentals": {
    "ticker": "AVGO",
    "next_earnings_date": "2026-04-10",
    "pe_ratio": 32.5,
    "peg_ratio": 1.2,
    "revenue_ttm": 61234,
    "net_margin": 28.3
  },
  "insider_history": [
    {
      "date": "2025-01-15",
      "type": "SELL",
      "shares": 8000,
      "price": 165.00,
      "return_6mo": -5.2
    },
    {
      "date": "2024-09-10",
      "type": "BUY",
      "shares": 12000,
      "price": 142.00,
      "return_6mo": 31.2
    },
    // ... previous 8 trades
  ],
  "content_angle": {
    "type": "insider_activity",
    "cluster_flag": false,
    "contrarian_flag": false,
    "catalyst": "Q1 earnings in 3 weeks, AI demand tailwind, CFO track record of +18.4% avg"
  }
}
```

**Flow**:

1. **NocoDB fetch**: Query SEC_alerts table where `score >= 6` and `published_articles_count < 2` (avoid overwriting same ticker)
2. **Finnhub API**: GET quote for {{ticker}}, store price/target/consensus
3. **YFinance scrape**: GET fundamentals (earnings date, P/E, etc.)
4. **NocoDB insider_history**: Query all past transactions by {{insider_name}}, calculate 5-year avg return
5. **Content angle determination** (Code node): 
   - If `cluster_flag` = true → content_type = "insider_activity" + style = "bullish"
   - If `contrarian_flag` = true → content_type = "contrarian" + include analyst consensus vs insider sentiment
   - Else → determine based on `score` (8-10 = confident, 6-7 = cautionary)
6. **Assemble context JSON**: Merge all above into single {{context_json}} object
7. **Pass to Claude**: User prompt receives {{context_json}}

**Validation**: 
- NocoDB fetch fails? → Use fallback ticker (highest score from yesterday)
- Finnhub timeout? → Use cached price from 1hr ago, add disclaimer "price as of HH:MM"
- Insider history missing? → Skip section 4 (What It Means), note in article

---

#### Validazione (Quality Gates)

**Gate 1: Basic Checks** (Code Node, happens after section assembly)

```javascript
const article = inputs[0].draft_html;
const metrics = {
  wordCount: article.split(/\s+/).length,
  dataPoints: (article.match(/\$\d+|[\d.]+%|\d+,\d+|20\d{2}-\d{2}-\d{2}/g) || []).length,
  bannedPhrases: [
    'it is important to note that',
    'in conclusion',
    'obviously',
    'needless to say',
    'as previously mentioned',
    'in this article we will discuss',
  ],
  violatedPhrases: [],
  links: (article.match(/<a href/g) || []).length,
};

// Check banned phrases
metrics.bannedPhrases.forEach(phrase => {
  if (article.toLowerCase().includes(phrase)) {
    metrics.violatedPhrases.push(phrase);
  }
});

const isValid = 
  metrics.wordCount >= 1800 && metrics.wordCount <= 2500 &&
  metrics.dataPoints >= 8 &&
  metrics.violatedPhrases.length === 0 &&
  metrics.links >= 2;

return {
  valid: isValid,
  metrics,
  errors: [
    metrics.wordCount < 1800 ? `Word count ${metrics.wordCount}, min 1800` : null,
    metrics.dataPoints < 8 ? `Only ${metrics.dataPoints} data points, need 8+` : null,
    metrics.violatedPhrases.length > 0 ? `Banned phrases: ${metrics.violatedPhrases.join(', ')}` : null,
  ].filter(e => e),
};
```

**If fails**: Retry node 8 (section generation) with feedback:
```
The article draft has issues:
${errors.join('; ')}

Regenerate these sections to fix:
- Add 2-3 more specific numbers/percentages to boost data citations
- Remove any banned phrases listed above
- Keep 1800-2500 word target
```

---

**Gate 2: AI Detection Variance** (Code Node)

```javascript
const article = inputs[0].draft_html;
const sentences = article.match(/[^.!?]+[.!?]+/g) || [];

const metrics = {
  avgSentenceLength: sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length,
  sentenceLengthVariance: calculateVariance(sentences.map(s => s.split(/\s+/).length)),
  subordinateClausePercentage: (article.match(/,.*?[\w]+.*?,/g) || []).length / sentences.length,
  uniqueTransitions: new Set(article.match(/\b(Moreover|However|Tellingly|Notably|Conversely|Furthermore|In contrast|Similarly|Crucially)\b/g)).size,
  ellipsisCount: (article.match(/\.\.\./g) || []).length,
};

const variance_score = (
  (metrics.sentenceLengthVariance / 100) * 0.3 + // Higher variance = more natural
  (metrics.subordinateClausePercentage > 0.25 ? 1 : 0.5) * 0.2 +
  (metrics.uniqueTransitions > 5 ? 1 : 0.6) * 0.2 +
  (metrics.ellipsisCount > 2 ? 1 : 0.5) * 0.15 +
  (metrics.avgSentenceLength > 12 && metrics.avgSentenceLength < 28 ? 1 : 0.6) * 0.15
) * 100;

return {
  variance_score, // 0-100, >70 = good
  metrics,
  rewrite_needed: variance_score < 70,
  rewrite_instruction: variance_score < 70 ? 
    `Article variance score is ${variance_score.toFixed(1)}, need 70+. 
    Rewrite 30% of sentences to:
    - Vary sentence length (currently avg ${metrics.avgSentenceLength.toFixed(1)} words)
    - Add more subordinate clauses (currently ${(metrics.subordinateClausePercentage*100).toFixed(0)}%, target 30%+)
    - Use transition phrases: Moreover, Notably, Tellingly, Conversely, In contrast
    - Add 2-3 rhetorical questions
    ` : null,
};
```

**If variance_score < 70**: Queue retry with specific feedback:
```
Your article reads slightly formulaic. Rewrite ~30% of sentences to vary structure.

Current variance score: {{variance_score}}/100 (need 70+)

Specific issues:
- Average sentence {{metrics.avgSentenceLength}} words (vary between 5-45)
- Only {{metrics.uniqueTransitions}} unique transition words (use: Moreover, Tellingly, Notably, In contrast, Conversely)
- {{(metrics.subordinateClausePercentage*100).toFixed(0)}}% subordinate clauses (need 30%+)

Rewrite these sentence types:
1. Break up 2-3 long sentences into shorter + longer combos
2. Add 3-4 rhetorical questions throughout
3. Replace some period transitions with commas + subordinate clauses
4. Use specific examples ("On March 16, Sarah Chen bought...") instead of generics
```

---

**Gate 3: SEO Final Check** (Code Node)

```javascript
const content = inputs[0].final_html;
const ticker = inputs[0].ticker;
const title = inputs[0].title;

const checks = {
  keyword_in_title: title.toLowerCase().includes(ticker.toLowerCase()),
  keyword_in_h1: content.toLowerCase().includes(`<h1.*${ticker}.*</h1>`),
  meta_description_present: content.includes('meta name="description"'),
  internal_links: (content.match(/<a href="\/.*"/g) || []).length,
  alt_text_on_images: (content.match(/<img[^>]+alt="/g) || []).length === (content.match(/<img/g) || []).length,
  keyword_density: calculateKeywordDensity(content, ticker),
};

return {
  seo_pass: Object.values(checks).every(v => v),
  checks,
  seo_fields: {
    title: title,
    meta_description: generateMetaDescription(content, ticker), // 155-160 chars
    keyword: ticker,
    keyword_density: checks.keyword_density,
    internal_links: checks.internal_links,
  },
};
```

**Summary Gate Logic**:

```
Gate 1 FAIL? → Retry section generation (feedback: "word count/data citations/banned phrases")
         ↓ (max 2 attempts)
Gate 2 FAIL? → Rewrite variance (feedback: "sentence structure, transitions, rhetorical questions")
         ↓ (max 1 attempt)
Gate 3 FAIL? → Flag fields for manual correction (save to NocoDB seo_fields column)
         ↓
PASS all 3 → Publish
```

---

#### Content Type Routing

Il sistema gestisce 5 tipi di articolo con prompt differenti:

```javascript
const contentTypeTemplates = {
  "insider_activity": {
    tone: "Data-driven, specific numbers, track record focus",
    section_4_requirement: "Historical comparison of insider's past 5 trades",
    section_5_requirement: "Specific bull catalysts (earnings date, price target gap)",
    visual_4_inclusion: "Insider Track Record chart",
    keywords: "insider buying, Form 4, CEO buys, insider transactions",
  },
  "earnings_plus_insider": {
    tone: "Earnings results as primary news, insider angle as secondary",
    section_1_requirement: "EPS surprise % first, insider buy/sell second",
    section_3_requirement: "Earnings surprise analysis (beat/miss, guidance)",
    section_5_requirement: "Bull case rooted in earnings strength + insider conviction",
    visual_4_inclusion: "Earnings surprise card + insider timeline",
    keywords: "earnings surprise, EPS beat, insider buying earnings",
  },
  "sector_analysis": {
    tone: "Macro sector trend + insider angle as evidence",
    section_3_requirement: "Sector trend (growth, rotation, tailwind) with 2-3 sector peers insider activity",
    section_7_requirement: "What to watch: when does this sector trend reverse?",
    visual_4_inclusion: "Peer comparison (insider buying across sector)",
    keywords: "insider buying sector, AI stocks insiders, healthcare insiders",
  },
  "educational": {
    tone: "Teach retail investors, use example to illustrate",
    section_1_requirement: "Question hook: 'Why do insider buys outperform?'",
    section_2_requirement: "Answer with data: historical 6-month +2.3% alpha",
    section_3_requirement: "Real example: describe one actual insider buy",
    section_5_requirement: "When this education applies: which scenarios, which insider types",
    keywords: "how to read Form 4, insider trading explained, what is insider buying",
  },
  "contrarian": {
    tone: "Skeptical mainstream narrative, insiders say otherwise",
    section_1_requirement: "State consensus bearish view with data (analyst downgrades, short %, etc)",
    section_2_requirement: "Insider data contradicts: X insiders just bought despite bearish sentiment",
    section_5_requirement: "Why insiders might be right (information advantage, long-term view)",
    section_6_requirement: "When insiders are wrong too: historical examples",
    visual_5_inclusion: "Consensus vs Reality card (analyst %bullish vs insider $ buying)",
    keywords: "insider buying despite bearish, contrarian insider, insiders loading up",
  },
};
```

**Routing logic** (Node 5 - Build Prompt Context):

```javascript
const contentType = determineContentType({
  hasEarningsWithin30days,
  insiderBuyCount,
  sectorMomentum,
  analystConsensusChange,
  historicalTrackRecord,
});

// Return the matched template
return contentTypeTemplates[contentType];
```

---

#### Content Strategy

**Mix Ottimale**: Per massimizzare traffico SEO + conversione newsletter → Pro

| Content Type | % Target | # Articoli/Mese | SEO Difficulty | Conversion |
|---|---|---|---|---|
| **insider_activity** | 45% | 13 | Medium (keyword: "[TICKER] insider buying") | 2.1% (high intent) |
| **earnings_plus_insider** | 20% | 6 | Low (news-driven, keywords trending) | 1.5% (good timing) |
| **sector_analysis** | 15% | 4 | Medium-High (competitive keywords) | 1.2% |
| **educational** | 12% | 3 | Low (guide/how-to keywords) | 3.2% (builds trust) |
| **contrarian** | 8% | 2 | High (opinionated, unique) | 2.8% (viral potential) |

**Selezione Ticker**:

```javascript
const selectTickerForArticle = async () => {
  // 1. Fetch top 10 SEC alerts da ieri (score >= 6)
  const topAlerts = await getNocoDB('SEC_alerts', {
    where: `score >= 6 AND created_date = yesterday`,
    orderBy: 'score DESC',
    limit: 10,
  });

  // 2. Filter out tickers gia scritti negli ultimi 30 giorni
  const recentlyWritten = await getNocoDB('articles', {
    where: `published_date >= ${30daysAgo}`,
    select: ['ticker'],
  });
  const candidateTickers = topAlerts.filter(
    a => !recentlyWritten.map(r => r.ticker).includes(a.ticker)
  );

  // 3. Per ogni candidato, check SEO keyword volume + competition
  const seoScores = await Promise.all(
    candidateTickers.map(async (alert) => {
      const keywordVolume = getKeywordVolume(`${alert.ticker} insider buying`);
      const seoCompetition = await checkSEOCompetition(`${alert.ticker} insider buying`);
      return {
        ticker: alert.ticker,
        score: alert.score,
        keywordVolume,
        seoCompetition,
        combined: (alert.score / 10) * 0.5 + (keywordVolume / 1000) * 0.3 + (1 - seoCompetition) * 0.2,
      };
    })
  );

  // 4. Determine content type for top ticker
  const bestTickerData = maxBy(seoScores, 'combined');
  const contentType = determineContentType(bestTickerData);

  return {
    ticker: bestTickerData.ticker,
    contentType,
  };
};
```

**Frequenza**: 1-1.5 articoli/giorno
- Weekdays (Mon-Fri): 1.5 articoli/giorno (9:30 AM + 6 PM UTC)
- Weekends: 0.5 articoli (Saturday 9 AM only, skip Sunday)
- **Total: ~10 articoli/settimana = 40-45/mese**

**Timing**: 
- **9:30 AM UTC**: Insider alert da overnight SEC filing → Quick analysis
- **6:00 PM UTC**: Earnings result o sector news recap → Time-sensitive content

---

### CAT 2 — Report Premium ($14.99-$29.99)

#### n8n Workflow Architecture

```
[Manual Trigger: Admin selects ticker from dashboard]
  ↓
[Node 1: Fetch comprehensive data for ticker]
  ├─ SEC insider data (past 2 years)
  ├─ Finnhub: quote, financials, earnings history
  ├─ Edgar: latest 10-K/10-Q
  └─ Yahoo Finance: historical price, dividends
  ↓
[Node 2: Pre-analyze financials] (Code: Calculate metrics — P/E, PEG, margin trend, ROE, debt/equity)
  ↓
[Node 3: Generate report outline] (Claude: "9-section structure for {{ticker}}")
  ↓
[Node 4a-4i: Generate sections in sequence] (NOT parallel — each section builds on previous)
  Each section: Claude Sonnet call with {{full_context}} + {{previous_sections}} as input
  ├─ 4a: Executive Summary (400 words)
  ├─ 4b: Company Overview (600 words)
  ├─ 4c: Insider Intelligence (800 words — core)
  ├─ 4d: Financial Analysis (700 words)
  ├─ 4e: Valuation Analysis (600 words)
  ├─ 4f: Bull Case (500 words)
  ├─ 4g: Bear Case (500 words)
  ├─ 4h: Peer Comparison (600 words)
  └─ 4i: Investment Thesis & Verdict (400 words)
  ↓
[Node 5: Validate section structure] (Code: check word counts, data density, cross-references)
  ├─ If section word count off → Retry that section
  └─ Continue when all valid
  ↓
[Node 6a-6e: Generate 5 visuals in parallel]
  ├─ 6a: Revenue/Margin Trend (8 quarters) → Template 9
  ├─ 6b: Valuation Football Field → Template 10
  ├─ 6c: Peer Comparison Radar → Template 11
  ├─ 6d: Insider Activity Timeline → Template 6
  └─ 6e: Analyst Rating Distribution → Custom chart
  ↓
[Node 7: Render all visuals] (HTTP POST to screenshot server, wait for all PNGs)
  ↓
[Node 8: Assemble PDF]
  ├─ Title page (company name, ticker, date, EI logo, disclaimer)
  ├─ Table of contents (auto-generated from sections)
  ├─ 9 sections + visuals embedded
  ├─ Page numbers, headers/footers
  ├─ CTA: "Subscribe to Pro for daily alerts like these"
  └─ Output: {{report_filename}}.pdf
  ↓
[Node 9: Quality gate — PDF checks]
  ├─ Page count 30-45
  ├─ Image count 5+
  ├─ Link count (at least 2 to website)
  ├─ File size <20MB
  └─ If fail → Log issue for manual fix
  ↓
[Node 10: Save to Supabase]
  ├─ Store PDF file (storage bucket)
  ├─ Store metadata (title, ticker, price_at_creation, keywords)
  └─ Return file_url
  ↓
[Node 11: Save to NocoDB]
  ├─ reports table: {{ticker}}, {{title}}, {{url}}, {{created_at}}, {{status}}, {{view_count}}
  ↓
[Node 12: Create Gumroad product]
  ├─ API call: Create product with PDF attachment
  ├─ Set price $14.99 or $29.99 based on ticker
  ├─ Add description (first 300 chars from Executive Summary)
  └─ Return product_url
  ↓
[Node 13: Publish to website]
  ├─ Create landing page (/reports/{{ticker}})
  ├─ Add preview (first page of PDF)
  ├─ Add CTA buttons (Gumroad link)
  └─ Add to reports catalog
  ↓
[Node 14: Marketing cascade]
  ├─ Email Pro subscribers (exclusive report notification)
  ├─ Add to newsletter (featured report section)
  ├─ X post: "New report on {{ticker}}" with link
  └─ Reddit post: "Analysis: Detailed look at {{ticker}} insiders" (link in comments)

**Timing**: Trigger to PDF complete = 12-15 min (most time = section generation + visuals)
```

#### Section-by-Section Prompt Design

**System Prompt** (cached, same as CAT 1 but adjusted for reports):

```
You are Marcus Chen, senior investment analyst at EarlyInsider.com. 
You write institutional-quality reports for retail investors.

Report Structure (9 sections, 30-45 pages total):

1. **Executive Summary** (400 words)
   - Investment thesis in 2 sentences
   - 3-4 key insider data points
   - Verdict (BUY/SELL/CAUTION) with conviction level (High/Medium/Low)
   - 3 price catalysts for next 12 months

2. **Company Overview** (600 words)
   - What the company does, market position
   - Revenue breakdown (products/services)
   - Growth story: where's it going?
   - Competitive advantages or disadvantages
   - Management team brief (CEO, CFO, board composition)

3. **Insider Intelligence** (800 words) ← CORE SECTION
   - Past 24 months of insider transactions (buys vs sells)
   - Key insiders and their track records
   - Cluster analysis (multiple insiders buying same time?)
   - Insider selling (any red flags?)
   - Form 4 link citations with specific dates

4. **Financial Analysis** (700 words)
   - Revenue trend (8 quarters): growth %, margin stability
   - Profitability: net margin, operating margin, FCF
   - Balance sheet health: debt/equity, working capital
   - Key metrics vs industry average
   - Sustainability of growth (normalized EBITDA)

5. **Valuation Analysis** (600 words)
   - Current valuation (P/E, PEG, EV/EBITDA, etc.)
   - DCF valuation model: assumptions and output
   - Peer comparison (3-4 comps): trading multiples
   - Historical valuation range (5-year chart)
   - Fair value estimate: range with bull/base/bear case

6. **Bull Case** (500 words)
   - Specific catalysts (product launch, earnings upside, macro tailwind, insider conviction)
   - Market size opportunity
   - Competitive advantages that compound
   - Management execution track record
   - Why insider buys validate this thesis

7. **Bear Case** (500 words)
   - Specific risks (competition, regulation, macro headwind, margin pressure)
   - Historical execution failures
   - Valuation risks at current price
   - Insider selling (if applicable): what does it signal?
   - Recession/downturn impact

8. **Peer Comparison** (600 words)
   - 3-4 comparable companies
   - Side-by-side financial metrics
   - Insider activity comparison (are peers' insiders buying too?)
   - Why our pick wins/loses
   - Relative valuation: cheap or expensive vs comps?

9. **Investment Thesis & Verdict** (400 words)
   - Synthesis: Bull + Bear → Expected return in 12 months
   - Price target with confidence interval
   - Verdict: BUY / HOLD / SELL with specific price levels
   - Position sizing: % of portfolio (depends on risk tolerance)
   - Exit strategy (at what price/catalyst do you sell?)
   - Key risks to monitor monthly

Data Accuracy:
- All numbers cited must be from financial filings or API data (Finnhub, Edgar, Yahoo Finance)
- Cite source: "According to Broadcom's 10-Q filed Mar 15, 2026..."
- No speculation unless explicitly framed as "scenario" or "if"
- Include link to SEC filing for insider transactions
- Never cite analyst consensus without qualification ("18 of 20 analysts rate BUY")

Visual Placeholders:
- {{VISUAL_1}}: Revenue/Margin trend (8Q history)
- {{VISUAL_2}}: Valuation Football Field (DCF, multiples, comps ranges)
- {{VISUAL_3}}: Insider Activity Timeline (3-4 largest buys/sells, labeled)
- {{VISUAL_4}}: Peer Comparison Radar (5D: growth, profitability, value, momentum, insider conviction)
- {{VISUAL_5}}: Analyst Ratings (% buy/hold/sell distribution)

Length Target: Total 5500-6500 words (all 9 sections combined)
Tone: Confident but hedged. "This is attractive at current price IF earnings beat." Not "This will 100% double."
```

**User Prompt for Each Section** (example: Section 3 — Insider Intelligence):

```
Ticker: {{ticker}}
Company: {{company_name}}
Industry: {{industry}}

SECTION: 3 — Insider Intelligence

Available Data:
- Past 24 months of Form 4 filings: {{insider_transactions_json}}
  Example: [
    {"date":"2026-03-15", "insider":"Sarah Chen", "title":"CFO", "type":"BUY", "shares":15000, "price":187.50, "value_usd":2812500},
    {"date":"2026-02-01", "insider":"John Smith", "title":"Director", "type":"BUY", "shares":5000, "price":172.00, "value_usd":860000},
    {"date":"2025-12-10", "insider":"Sarah Chen", "title":"CFO", "type":"SELL", "shares":20000, "price":165.00, "value_usd":3300000},
  ]

- Insider track records (past 3 years): {{insider_track_record_json}}
  Example: [
    {"insider":"Sarah Chen", "buys":7, "sells":3, "avg_return_6mo_buys":+18.4%, "avg_return_6mo_sells":+8.2%},
    {"insider":"John Smith", "buys":5, "sells":1, "avg_return_6mo_buys":+12.1%, "avg_return_6mo_sells":-2.3%},
  ]

Context from Previous Sections:
[Executive Summary + Company Overview will be shown here for continuity]

---

INSTRUCTIONS:

Expand this section to 800 words. Cover:

1. **Recent Activity Summary** (150 words)
   - What insider transactions happened in past 6 months?
   - Was it mostly buying or selling?
   - Total dollars: insider buys vs sells
   - Use format: "In the past 6 months, {{X}} insiders purchased {{Y}} total shares valued at {{Z}}, while {{A}} insiders sold {{B}} shares."

2. **Key Insiders & Track Records** (250 words)
   - Highlight the 2-3 most active insiders
   - For each: name, title, # of past trades, avg return post-trade
   - Focus on who has a good track record (>+15% avg return on buys)
   - Example: "Sarah Chen, CFO, has executed 7 buys over 5 years averaging +18.4% return in the 6 months following purchase. Her most recent buy on Mar 15, 2026, at $187.50 suggests confidence in near-term catalysts."

3. **Cluster Analysis** (200 words)
   - Did multiple insiders buy at the same time (cluster)?
   - When 3+ insiders buy within 30 days, it's historically bullish
   - Example: "Notably, in February 2026, both the CFO and two board members purchased shares within 2 weeks—a cluster event. Historically, cluster buys see +22% average return in 6 months."

4. **Selling Analysis** (150 words)
   - Is there any insider selling? At what price? Why might they sell?
   - Differentiate: planned 10b5-1 sales (systematic, less important) vs opportunistic selling (more important)
   - Example: "Chen's Dec 2025 sale of 20,000 shares at $165 appears to be part of a planned 10b5-1 arrangement filed in July 2025 (link: [SEC filing]), not a loss of confidence."

5. **Thesis Validation** (150 words)
   - Do insiders' buying patterns support the bull case from Section 6?
   - Are they buying pre-earnings? Pre-product launch?
   - Example: "The timing of Chen's Mar 2026 buy—just 3 weeks before Q1 earnings—suggests confidence in positive results. The 10-K shows EPS is trending up 22% YoY; insiders may be positioning ahead of the beat."

Tone: Data-driven, specific. Cite dates, prices, insider names, amounts.
No speculation ("insiders probably think...") unless framed as "speculation/hypothesis."

Use format for each transaction:
- {{Insider Name}} ({{Title}}) {{BUY|SELL}} {{amount_usd}} on {{date}} at ${{price}} ({{shares}} shares)
- Performance: [if past transaction, show actual return]

OUTPUT: Plain HTML <p> tags. Include <strong> for key numbers. Use <a href="[SEC link]"> for Form 4 citations.
```

---

#### Workflow di Generazione Sezione-per-Sezione

Il report NON viene generato tutto in un prompt. Ogni sezione dipende dalle precedenti:

```
Sezione 1 (Exec Summary):
  Input: {{comprehensive_data}}
  Output: {{section_1_text}}
  
Sezione 2 (Company Overview):
  Input: {{comprehensive_data}}, {{section_1}} [for continuity]
  Output: {{section_2_text}}
  
Sezione 3 (Insider Intelligence):
  Input: {{comprehensive_data}}, {{section_1}}, {{section_2}} [for context]
  Output: {{section_3_text}} ← CORE, must be detailed
  
Sezione 4 (Financial Analysis):
  Input: {{comprehensive_data}}, [{{section_1-3}}] [for numbers cited earlier]
  Output: {{section_4_text}} ← Must cite fresh metrics
  
Sezione 5 (Valuation):
  Input: {{comprehensive_data}}, {{financial_metrics_from_section_4}}
  Output: {{section_5_text}} ← Builds on section 4 numbers
  
Sezione 6 (Bull Case):
  Input: {{all_previous_data}}, [all previous sections]
  Output: {{section_6_text}} ← Synthesizes everything
  
Sezione 7 (Bear Case):
  Input: {{all_previous_data}}, [all previous sections]
  Output: {{section_7_text}} ← Counter to section 6
  
Sezione 8 (Peer Comparison):
  Input: {{comprehensive_data}}, {{insider_data}}, {{financial_metrics}}
  Output: {{section_8_text}}
  
Sezione 9 (Investment Thesis):
  Input: {{all_data}}, [ALL previous sections as summary]
  Output: {{section_9_text}} ← Verdict + price target
```

**Logica in n8n**:

```javascript
// Node 4a: Generate Section 1
const section1 = await claude({
  system: SYSTEM_PROMPT,
  user: userPrompt('section 1', comprehensiveData),
});

// Node 4b: Generate Section 2
const section2 = await claude({
  system: SYSTEM_PROMPT,
  user: userPrompt('section 2', comprehensiveData, {previousSections: [section1]}),
});

// Node 4c: Generate Section 3
const section3 = await claude({
  system: SYSTEM_PROMPT,
  user: userPrompt('section 3', comprehensiveData, {previousSections: [section1, section2]}),
});

// ... e così per le sezioni 4-9
// Ogni sezione passa come contesto le precedenti per mantenere coerenza
```

---

#### Gestione Tabelle/Grafici nei Report

**5 Visuals** generate durante il workflow:

| Visual | Template | Dati Input | Rendering |
|--------|----------|-----------|-----------|
| Revenue/Margin Trend | Template 9 | 8 trimestri: revenue $, net margin % | Chart.js dual-axis |
| Valuation Football Field | Template 10 | DCF value range, P/E multiples, analyst targets, current price | Horizontal bar chart |
| Peer Radar | Template 11 | 5-7 metriche (growth, profit, value, momentum, insider conviction) per 2-3 peer | Radar chart |
| Insider Timeline | Template 6 | Top 5-7 buys/sells: insider name, date, amount | Timeline visual |
| Analyst Ratings | Custom | % buy / hold / sell | Pie chart |

**Inline Tables** (in section 8, Peer Comparison):

```html
<table class="peer-comparison">
  <thead>
    <tr>
      <th>Metric</th>
      <th>{{TICKER}}</th>
      <th>Peer A</th>
      <th>Peer B</th>
      <th>Peer C</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>P/E Ratio</td><td><strong>{{pe}}</strong></td><td>{{pea}}</td><td>{{peb}}</td><td>{{pec}}</td></tr>
    <tr><td>Revenue Growth</td><td><strong>{{rev_growth}}%</strong></td><td>{{reva}}%</td><td>{{revb}}%</td><td>{{revc}}%</td></tr>
    ... altri metriche
  </tbody>
</table>
```

---

#### Content Strategy — Pricing & Selection

**Pricing Logic**:

```javascript
const determineReportPrice = (ticker) => {
  const marketCap = getMarketCap(ticker); // Finnhub
  const insiderActivityLevel = getInsiderActivityCount(ticker, 'past_6mo');
  
  // Pricing rules:
  if (marketCap > 500e9 && insiderActivityLevel > 5) {
    return 29.99; // Large cap + active insiders = premium
  } else if (marketCap > 100e9 || insiderActivityLevel > 3) {
    return 24.99;
  } else {
    return 14.99; // Small cap or low insider activity
  }
};
```

**Selezione Ticker per Report**:

Quando creare un report? Tre strategie:

1. **Insider Cluster Event**: 3+ insiders buy stesso ticker entro 30 giorni → High conviction signal
2. **Earnings Surprise + Insider Edge**: Stock just beat earnings + insiders buying → Catalysts aligned
3. **Sector Leader**: Largest cap in trending sector + active insider buying → SEO "{{sector}} analysis"

**Catalog Management**: Build up a catalog of 15-20 reports prima di lancio pubblico. Rota:
- 1-2 nuovi report/settimana
- Refresh report vecchi ogni 90 giorni (update insider data, financial data, price target)

---

### CAT 3 — Lead Magnet PDF (Backtest Report Mensile)

#### Workflow Architecture

```
[Schedule: 1st of month, 6:00 AM UTC]
  ↓
[Node 1: Fetch all alerts from PREVIOUS month] (NocoDB query: created_at between 1st-last day)
  ↓
[Node 2: Calculate realized returns] (Code: For each alert, fetch stock price on alert_date vs today, calc return %)
  ↓
[Node 3: Segment into buckets] (Code: Separate into WINNERS (>+20%), NEUTRAL (-20% to +20%), LOSERS (<-20%))
  ↓
[Node 4: Select case studies]
  ├─ 3-4 top winners (biggest %)
  ├─ 2-3 biggest losers (for honesty)
  ├─ 2-3 neutral outcomes
  └─ Calculate portfolio backtest: equal-weight all alerts, what would return be?
  ↓
[Node 5: Generate lead magnet outline] (Claude: "Structure for monthly backtest report")
  ↓
[Node 6a-6d: Generate sections sequentially]
  ├─ 6a: Executive Summary (100 words) — Hit rate, avg return, best/worst performer
  ├─ 6b: The Winners (500 words) — 3-4 case studies with details
  ├─ 6c: The Losers (400 words) — 2-3 case studies, what went wrong (honesty)
  └─ 6d: Portfolio Backtest (300 words) — "If you had followed all alerts..."
  ↓
[Node 7: Generate portfolio simulation data] (Code: Run simulation)
  ├─ Start: $10,000 virtual capital on 1st of month
  ├─ Equal-weight each alert (e.g., 10 alerts = $1,000 per alert)
  ├─ Track cumulative returns day by day / week by week
  ├─ Final return: $X, +Y%
  ├─ Benchmark: S&P 500 return same period
  └─ Output: {{portfolio_returns_data}}
  ↓
[Node 8: Generate visuals]
  ├─ 8a: Portfolio Simulation Chart (Template 8) — Line chart cumulative return vs S&P 500
  ├─ 8b: Winners/Losers Breakdown — Pie chart or bar chart of hit rate %
  └─ 8c: Return Distribution — Histogram of individual alert returns
  ↓
[Node 9: Assemble PDF]
  ├─ Title page: "{{Month}} Insider Buying Backtest — {{hit_rate}}% Win Rate"
  ├─ 1-page Exec Summary with key metrics
  ├─ 4-5 pages: Winners + Losers detailed
  ├─ 2-3 pages: Portfolio simulation + visuals
  ├─ 1 page: Lessons learned + disclaimer
  └─ CTA: "Like these insights? Get daily alerts by upgrading to Pro"
  ↓
[Node 10: Save to Supabase + NocoDB]
  ├─ Upload PDF
  ├─ Store metadata: month, hit_rate, avg_return, final_return
  ↓
[Node 11: Create Gumroad "freemium"]
  ├─ Add to Gumroad as free download (lead magnet)
  ├─ Require email capture (Beehiiv integration)
  ↓
[Node 12: Email to cold list + existing list]
  ├─ Email existing subscribers: "Last month: +12.3% vs S&P +4.1%"
  ├─ Newsletter mention: "New lead magnet: backtest published"
  └─ Landing page update

**Timing**: Trigger to PDF = 8-10 min
```

---

#### Prompt Design

**System Prompt** (cached):

```
You are an honest, data-driven analyst. This is a BACKTEST report showing our 
insider alert performance in {{month}}.

Your job: Be brutally honest about WINS AND LOSSES. 
Investors hate when creators hide losses. Show both.

Structure:
1. Executive Summary: {{month}} results in 100 words max
   - X alerts sent (total)
   - {{hit_rate}}% hit rate (return > 0% in 6 months)
   - Average return: +{{avg_return}}%
   - Best performer: {{best_ticker}} +{{best_return}}% (insider: {{name}})
   - Worst performer: {{worst_ticker}} {{worst_return}}% (insider: {{name}})
   - Portfolio return (equal-weight all): +{{portfolio_return}}%
   - Benchmark (S&P 500): +{{sp500_return}}%
   - Verdict: "Our alerts outperformed / underperformed the market"

2. The Winners (500 words): 3-4 biggest winners
   - For each: Ticker, insider, date, stock move, what happened in news
   - Example: "$NVDA: CEO bought $5M on Mar 1 at $145. Stock at $187 today (+28.9%). 
     Catalysts: AI capex cycle, earnings beat, analyst upgrades."
   - Be specific about WHY each won (catalyst + timing)

3. The Losers (400 words): 2-3 biggest losers (honest analysis)
   - For each: Ticker, insider, date, stock move, what went wrong
   - Example: "$XYZ: CFO bought $2M on Feb 15 at $50. Stock at $42 today (-16%). 
     What we missed: competitor announcements, margin pressure in Q1 earnings."
   - IMPORTANT: Don't make excuses. Be real about why you got it wrong.
   - Lesson learned: "Insider buys can't predict competitor disruption"

4. Portfolio Backtest (300 words): If you followed ALL alerts
   - Narrative: "Imagine: $10,000 virtual capital, 1st of month. 
     You bought equal-weight all {{num_alerts}} insider alerts from {{month}}."
   - Monthly progression: $10k → $10.5k → $11.2k → etc (show week by week or at month-end)
   - Final: ${{final_amount}} = +{{final_return}}% return
   - Benchmark S&P 500 in {{month}}: +{{sp500_return}}%
   - Verdict: "Outperformed by {{outperformance}}%" OR "Underperformed by {{underperformance}}%"
   - Note: "This is backtested, not live trading. Past performance ≠ future results."

Tone: Confidence + Humility
- Own your winners: "Our insider conviction signal worked—these 3 insiders had high track records"
- Own your losses: "We missed on {{ticker}}. The insider was right on sentiment, but geopolitical risk blindsided us."
- Educational: "What we learned: insider buys outperform on long-term convictions (6+ months) but can get shaken by short-term news."

Disclaimer: "This is educational backtest analysis. Not financial advice. Past performance is not indicative of future results."
```

---

#### Calculation Engine (Code Node)

```javascript
const generatePortfolioBacktest = async ({
  alerts, // Array: [{{ticker}}, {{entry_date}}, {{entry_price}}, {{insider_score}}, ...]
  startCapital = 10000,
}) => {
  // 1. Fetch current prices for all tickers
  const pricesAtAlert = alerts.map(a => ({...a, entry_price: a.entry_price}));
  const pricesNow = await Promise.all(
    alerts.map(a => finnhub.getQuote(a.ticker).then(q => ({ticker: a.ticker, price: q.c})))
  );
  
  // 2. Calculate individual returns
  const alertsWithReturns = pricesAtAlert.map(a => {
    const nowPrice = pricesNow.find(p => p.ticker === a.ticker)?.price;
    const return_pct = ((nowPrice - a.entry_price) / a.entry_price) * 100;
    return {...a, return_pct, is_win: return_pct > 0};
  });
  
  // 3. Portfolio backtest: equal-weight
  const capitalPerAlert = startCapital / alerts.length;
  const portfolioValue = alertsWithReturns.reduce(
    (sum, a) => sum + capitalPerAlert * (1 + a.return_pct / 100),
    0
  );
  const portfolio_return_pct = ((portfolioValue - startCapital) / startCapital) * 100;
  
  // 4. Hit rate
  const winCount = alertsWithReturns.filter(a => a.is_win).length;
  const hitRate = (winCount / alerts.length) * 100;
  
  // 5. Average return
  const avgReturn = alertsWithReturns.reduce((sum, a) => sum + a.return_pct, 0) / alerts.length;
  
  // 6. S&P 500 benchmark
  const sp500_return = await finnhub.getReturn('SPY', alertMonthStart, today);
  
  // 7. Winners & losers for report
  const winners = alertsWithReturns.filter(a => a.return_pct > 20).sort((a, b) => b.return_pct - a.return_pct).slice(0, 3);
  const losers = alertsWithReturns.filter(a => a.return_pct < -20).sort((a, b) => a.return_pct - b.return_pct).slice(0, 3);
  
  return {
    hitRate,
    avgReturn,
    portfolioValue,
    portfolio_return_pct,
    sp500_return,
    outperformance: portfolio_return_pct - sp500_return,
    winners,
    losers,
    allReturns: alertsWithReturns,
  };
};
```

---

#### Data for Case Studies

Per ogni "winner" e "loser", il prompt riceve:

```json
{
  "ticker": "NVDA",
  "insider_name": "John Smith",
  "insider_title": "CEO",
  "alert_date": "2026-01-15",
  "entry_price": 145.00,
  "current_price": 187.00,
  "return_pct": 28.9,
  "is_win": true,
  "news_events": [
    "2026-02-01: Announced new AI chip",
    "2026-03-15: Q4 earnings beat (EPS +22% YoY)",
    "2026-03-20: Analyst upgraded to BUY, target $200"
  ],
  "insider_track_record": {
    "past_buys": 5,
    "avg_return_6mo": 15.4
  }
}
```

---

#### CTA & Signup Integration

Il PDF ha un CTA soft:

```html
<div class="cta-box">
  <h3>Like these insider signals? Get them live.</h3>
  <p>This backtest shows historical data. Imagine getting these alerts <strong>when they happen</strong>—
  not after the fact.</p>
  <p><strong>Pro members receive daily insider alerts</strong> + detailed analysis 
  in real-time.</p>
  <p><a href="{{upgrade_link}}" class="cta-button">Upgrade to Pro — $24/month</a></p>
  <p class="small">Or reply to this email to chat about whether Pro is right for you.</p>
</div>
```

**Email Capture** (Beehiiv integration):

```javascript
// Node 11: Create Gumroad download with email gate
const gumroad_product = await gumroad.create({
  name: `Insider Buying Backtest — {{month}}`,
  description: `View the returns from our {{month}} insider alerts...`,
  type: 'PDF',
  file_url: pdf_url,
  require_email: true, // Gate behind email
  redirect_url: 'https://earlyinsider.com/thanks-backtest', // Post-download page
});

// Post-download landing page has CTA to upgrade Pro
```

---

#### Visual Templates per Lead Magnet

| Visual | Content | Template |
|--------|---------|----------|
| Portfolio Simulation | Cumulative return line chart: $10k → ${{final}} vs S&P | Template 8 |
| Hit Rate Breakdown | Pie: Winners (%), Neutral (%), Losers (%) | Custom pie |
| Return Distribution | Histogram: # alerts at each return bucket (-50% to +100%) | Custom histogram |

---

### CAT 4 — Reddit Replies (Cross-posted su 6 subreddit)

#### n8n Workflow Architecture

```
[Schedule: Every 60 minutes, 24/7]
  ↓
[Node 1: Fetch new posts da 6 subreddit] (Reddit API + Pushshift fallback)
  ├─ r/wallstreetbets
  ├─ r/stocks
  ├─ r/investing
  ├─ r/ValueInvesting
  ├─ r/SecurityAnalysis
  └─ r/finance
  Filter: posts created in last 60 min, not already replied to
  ↓
[Node 2: Score relevance] (Code node: keyword matching + NLP)
  ├─ Keywords: "insider", "Form 4", "SEC", "CEO buy", ticker symbols, "bullish/bearish"
  ├─ Also: posts about earnings, sector trends, macro (non-insider but good reply opportunity)
  ├─ Score 0-100 for "how good is reply opportunity here"
  └─ Filter: score >= 60
  ↓
[Node 3a-3f: Parallel processing per subreddit] (6 parallel branches)
  ├─ [For each subreddit: isolate top 3-5 posts by relevance]
  ├─ [Determine subreddit-specific tone + style]
  └─ [Skip if already 5+ replies to same post (over-saturation)]
  ↓
[Node 4: Check if insider data applies] (Code)
  ├─ Extract ticker mentioned in post
  ├─ Query SEC alerts DB: is there relevant insider data for this ticker in past 7 days?
  ├─ If YES: fetch insider_data to inject into reply
  └─ If NO: can still reply (earnings comment, sector insight, etc.) but mark as "no insider angle"
  ↓
[Node 5a-5f: Generate reply per post/subreddit] (Claude Sonnet)
  ├─ System prompt customized per subreddit tone
  ├─ User prompt includes: post content, ticker, insider data (if any), subreddit rules
  ├─ Output: 50-200 word reply in subreddit style
  └─ [Multiple replies generated in parallel]
  ↓
[Node 6: Validate reply quality] (Code)
  ├─ Word count 50-200: YES/NO
  ├─ Doesn't sound AI: syntax variety check, slang/meme check per subreddit
  ├─ Doesn't violate subreddit rules (no links unless allowed, no spam, etc.)
  ├─ Natural tone match for subreddit
  └─ If FAIL → Retry with feedback
  ↓
[Node 7: Stage replies for manual review] (Save to NocoDB: reddit_replies_staged)
  ├─ Store: post_id, subreddit, reply_text, quality_score, insider_data_used
  ├─ Manual approval queue (Telegram notification)
  └─ Wait for human to approve
  ↓
[IF human approves]
  ↓
[Node 8: Post reply] (Reddit API: Submit comment)
  ├─ Add delay before posting: 10-30 min random (appear more human)
  ├─ Track: comment_id, timestamp, subreddit
  └─ Log to NocoDB: reddit_replies_posted
  ↓
[Node 9: Initial engagement] (5-10 min after posting)
  ├─ Upvote own reply (avoid if possible, looks artificial, but we do it for WSB threads)
  ├─ NO immediate engagement farming (wait 1-2 hours for organic upvotes)
  └─ Monitor for reply-to-reply (set up webhook)
  ↓
[Node 10: Monitor replies to our comment] (Continuous, via Reddit API polling)
  ├─ If someone replies: tag for possible follow-up
  ├─ If questions: could queue a follow-up reply
  └─ Track engagement metrics

**Frequency**: 
- 5-10 replies/day max (avoid spam, maintain quality)
- Spread across 6 subreddit + time of day
- Peak hours: 10-14:00 UTC (US morning), 22-00:00 UTC (US evening)

**Manual approval**: Telegram channel with reply previews, human clicks ✓ or ✗
```

---

#### Per-Subreddit Prompts

**System Prompt Wrapper**:

```
You are a {{subreddit}} member. You're replying to a post about {{topic}}.

Subreddit guidelines:
- Tone: {{tone_descriptor}}
- Emoji: {{emoji_usage}} (WSB: heavy, ValueInvesting: minimal)
- Citations: {{citation_style}}
- Length: 50-200 words
- Slang: {{slang_level}} (WSB: heavy, ValueInvesting: formal)

Reply as a real member would, not as a bot. Show personality. 
If you have insider data, weave it naturally: "I was looking through recent Form 4s..."

Never:
- Use phrases like "I appreciate you asking" or "Great question"
- Be preachy or condescending
- Link directly to EarlyInsider (too spammy, save link for PM)
- Mention that you're a bot or use AI
```

**Example 1 — r/wallstreetbets**:

```
Tone: Aggressive, meme-heavy, YOLO energy, profane
Emoji: Heavy (📈 🚀 💎 🤚)
Citations: Casual ("saw on Twitter", "was looking at filings")
Slang: "apes", "stonk", "to the moon", "diamond hands"

System Prompt Addition:
You're replying in WSB. Use CAPS for emphasis, emojis, meme references.
If bullish: "This is the way 🚀" type energy
If cautious: "Not financial advice but..."
Assume reader is degen retail trader comfortable with risk

Example Reply Template:
"{{TICKER}} gang rise up 📈 Just saw {{insider_name}} ({{title}}) bought ${{amount}} 
last week at {{price}}. Guy's track record is {{track_record}} over 5Y. NFA but 
if insiders are loading up... 💎🤚 #{{TICKER}} #{{SECTOR}}"
```

**Example 2 — r/ValueInvesting**:

```
Tone: Thoughtful, data-driven, boring (good boring), long-term focused
Emoji: Minimal (maybe 1, max)
Citations: Formal ("According to SEC filing", cite link)
Slang: None

System Prompt Addition:
You're a serious investor. Your goal: add genuine insight, not hype.
Cite sources. Admit uncertainty.
Length: Typically 150-200 words (more research, less meme)

Example Reply Template:
"I agree {{original_poster}} is undervalued at current multiples. One data point 
I'd add: {{insider_name}}, the CFO, acquired {{shares}} shares on {{date}} 
at {{price}}. You can verify this on SEC Edgar (Form 4). Over the past 5 years, 
{{his_her_her}} insider buys have returned {{avg_return}}% on average over 6 months. 
This suggests management confidence in the business despite near-term headwinds."
```

**Example 3 — r/stocks (middle ground)**:

```
Tone: Balanced, informative, slightly bullish/bearish depending on post
Emoji: 1-2 max
Citations: Links okay if valuable
Slang: Minimal but conversational ("IMO", "seems like", "could be worth")

System Prompt Addition:
You're an informed retail investor. Helpful without being preachy.
Balance data + opinion.
Engage thoughtfully with the post's thesis.
```

---

#### User Prompt for Reply Generation

```
Subreddit: {{subreddit}}
Post Title: {{post_title}}
Post Body: {{post_body}} (first 500 chars)
Post Author: {{post_author}} (context only)

Ticker(s) mentioned in post: {{tickers}}

INSIDER DATA (if applicable to ticker):
{{insider_data_json}}
Example:
{
  "ticker": "NVDA",
  "insider_name": "Sarah Chen",
  "title": "CFO",
  "transaction": "BUY 15,000 shares @ $187.50 on 2026-03-15",
  "track_record": "5 buys in past 5Y, avg +18.4% return in 6mo",
  "days_ago": 3
}

[If no insider data]: {{insider_data_json}} = null. In this case, provide commentary 
on earnings, sector trends, or market macro angle instead.

---

TASK:

Generate a 50-200 word reply to this post. 

Requirements:
1. Style: Match subreddit culture (see system prompt above)
2. Tone: {{tone_for_this_post}} [varies based on post sentiment]
3. If insider data: Weave it naturally, don't force it. Use opening like "I was looking at Form 4s yesterday..." or "Just saw a filing..."
4. If no insider data: Comment on fundamentals, earnings catalyst, or sector trend
5. Engage with original poster's thesis: agree/disagree/nuance it
6. End with subtle call-to-action or question that encourages discussion
7. Zero links to EarlyInsider (keep it natural; we only link in PMs)

OUTPUT: Plain text (no markdown, no HTML). 
Natural line breaks where appropriate (reddit mobile users).
If emoji needed per subreddit style: include naturally.
```

---

#### Quality Gate for Replies

```javascript
const validateRedditReply = (reply, subreddit) => {
  const checks = {
    wordCount: reply.split(/\s+/).length >= 50 && reply.split(/\s+/).length <= 200,
    noAIPhrasings: !['appreciate you asking', 'great question', 'in conclusion', 
      'i appreciate', 'ultimately', 'interestingly enough', 'in this response'].some(
      p => reply.toLowerCase().includes(p)
    ),
    subredditTone: checkTone(reply, subreddit),
    relevantToPost: reply.includes('{{post_title}}') || reply.includes(ticker), // Mentions original post context
    noLinks: !reply.includes('http') || (subreddit === 'stocks' && reply.includes('sec.gov')), // Links only if subreddit allows
    noBotSignals: !reply.includes('bot') && !reply.includes('disclaimer: i\'m an ai'),
  };
  
  return {
    pass: Object.values(checks).every(v => v),
    checks,
    failureReasons: Object.keys(checks).filter(k => !checks[k]),
  };
};

const checkTone = (reply, subreddit) => {
  const wsb_markers = ['📈', '🚀', '💎', 'to the moon', 'stonk'];
  const valueinvesting_markers = ['SEC', 'Edgar', 'filing', 'multiples', 'FCF'];
  
  if (subreddit === 'wallstreetbets') {
    return wsb_markers.some(m => reply.includes(m));
  } else if (subreddit === 'ValueInvesting') {
    return valueinvesting_markers.some(m => reply.includes(m));
  }
  return true; // Default pass
};
```

---

### CAT 5 — Reddit Daily Thread

#### Workflow Architecture

```
[Daily Trigger: 8:00 AM UTC (roughly when US market opens/before daily thread posts)]
  ↓
[Node 1: Identify daily thread] (Reddit API: fetch r/stocks, r/investing daily threads)
  ├─ Look for posts with "Daily Discussion" or similar in title
  ├─ Verify it's from today
  └─ Get post_id for later comment submission
  ↓
[Node 2: Fetch SEC alerts from yesterday] (NocoDB query)
  ├─ Filter: created_date = yesterday
  ├─ Filter: score >= 7 (only high-quality alerts)
  ├─ Sort: score descending
  ├─ Select: top 2-4 alerts to feature
  ↓
[Node 3: Fetch related data] (For each selected alert)
  ├─ Insider data (name, title, amount, date)
  ├─ Current stock price
  ├─ YTD return % for that stock
  ├─ Any overnight news (news API: last 12 hours)
  └─ Assemble data for comment
  ↓
[Node 4: Select comment template] (Code)
  ├─ Choose one of 3 templates (see below)
  ├─ Randomize to avoid appearing formulaic
  └─ Pass to prompt
  ↓
[Node 5: Generate comment] (Claude Sonnet or DeepSeek, depending on simplicity)
  ├─ Input: {{template_chosen}}, {{alert_data}}, {{market_context}}
  ├─ Output: 80-150 word comment
  ├─ Tone: "Hey, saw some interesting insider activity yesterday..."
  ↓
[Node 6: Validate] (Code)
  ├─ Word count 80-150
  ├─ Mentions 2-4 tickers
  ├─ At least 1 specific data point (dollar amount, %)
  ├─ Doesn't sound robotic
  └─ If fail → retry
  ↓
[Node 7: Stage for approval] (Send to Telegram, wait for human ✓)
  ↓
[Node 8: Post comment] (Reddit API: Submit comment to daily thread)
  ├─ Wait for timing (post between 8:30-10:00 AM UTC, when thread is active)
  ├─ Track: comment_id, timestamp
  ↓
[Node 9: Monitor engagement] (Webhook, 24-hour monitor)
  ├─ Track upvotes over 24 hours
  ├─ Monitor for replies (possible follow-ups)
  └─ Log metrics to NocoDB

**Frequency**: 1 comment per weekday (Mon-Fri), 0 on weekends
**Total per week**: 5 comments = 20-25 per month
**Peak engagement**: First 2-3 hours after posting (organic upvotes)
```

---

#### 3 Comment Templates

**Template 1: "Insider Alert Highlight"**

```
Hey {{subreddit}}, {{one_ticker}} popped up on my radar yesterday. 
{{insider_name}} ({{title}}) bought {{amount_short}} shares yesterday at {{price}}—
first time in {{months}} they've added to position. 
Their track record: {{past_buys}} buys over {{years}}, averaging {{avg_return}}% 
in the following 6 months. 

Not saying YOLO in, but interesting data point if you're watching {{ticker}}. 
What's your take—what catalysts do you see in next 90 days?

#{{ticker}}
```

**Template 2: "Sector Insider Roundup"**

```
{{Sector}} insiders were active yesterday: 3 CEO/CFO purchases across the space. 
Biggest: {{company1}} CFO {{amount1}}, {{company2}} CEO {{amount2}}.

Usually when C-suite is buying across a sector like this, they're seeing opportunity 
that retail isn't pricing in yet. Sector tailwinds: {{reason1}}, {{reason2}}.

Curious if anyone's got conviction here. I'm watching {{top_ticker}} 
as the best risk/reward of the bunch.
```

**Template 3: "Contrarian Data Point"**

```
{{ticker}}: Everyone's been bearish AF on this (analyst downgrades, short %, etc). 
But {{insider_name}}, the {{title}}, just bought {{amount}} at {{price}}. 

Last time they made a similar-sized buy ({{past_date}}), stock went +{{past_return}}% 
in 6 months. Not saying it's predictive, but insider conviction + bearish sentiment 
sometimes = asymmetric opportunity.

What would it take for you to take a chance on {{ticker}}?
```

---

#### Prompt Structure

System prompt (same as CAT 4 — Reddit replies):

```
You are a {{subreddit}} member participating in the daily discussion thread.
Tone: Casual, helpful, collaborative. "Hey everyone, I found something interesting..."
Share data without hyping it. Let the data speak.
Word count: 80-150 exactly.
```

User prompt:

```
Template: {{template_number}} (1, 2, or 3)

Alerts to feature: {{alert_array}}
Example:
[
  {"ticker":"NVDA", "insider":"Sarah Chen", "title":"CFO", "amount_usd":2812500, "date":"2026-03-15"},
  {"ticker":"AMD", "insider":"John Smith", "title":"Director", "amount_usd":1500000, "date":"2026-03-14"},
  ...
]

Market context:
- S&P 500 YTD: {{sp500_ytd_return}}%
- Sector performance (if template 2): {{sector_ytd_return}}%
- Overnight news on {{ticker}}: {{overnight_news_brief}} [or null]

---

Using {{template_number}}, generate a daily thread comment. 
Replace placeholders with actual data.
Tone: Collaborative, data-first, not hyping.
Goal: Spark discussion, not pump {{ticker}}.

Output: Plain text, 80-150 words exactly.
```

---

### CAT 6 — Reddit DD Posts (1-2 per week)

#### Workflow Architecture

```
[Weekly Trigger: Monday 7:00 AM UTC]
  ↓
[Node 1: Fetch "cluster buy" alerts from past week] (NocoDB)
  ├─ Filter: cluster_flag = true (3+ insiders buying same ticker)
  ├─ Filter: score >= 8
  ├─ Select: top candidate by score + "least written about"
  └─ This becomes the DD topic
  ↓
[Node 2: Gather comprehensive data]
  ├─ Insider data (all 3+ insider buys in cluster, track records)
  ├─ Financial data (recent 10-K/10-Q, fundamentals)
  ├─ Price chart (6-month + mark buy dates)
  ├─ News (recent announcements, earnings preview)
  ├─ Bear case research (competitor news, analyst downgrades, risks)
  └─ Assemble {{dd_context_json}}
  ↓
[Node 3: Generate DD outline] (Claude: "5-section DD structure for Reddit")
  ├─ TL;DR (hook)
  ├─ Company overview
  ├─ Insider angle
  ├─ Bull case (with numbers)
  ├─ Bear case (honest)
  └─ Conclusion + price target
  ↓
[Node 4-8: Generate sections sequentially] (Claude Sonnet, 5x calls)
  ├─ Each section: 300-500 words (Reddit markdown style)
  ├─ Pass previous sections as context for continuity
  ├─ Tone: "I did my homework, here's what I found"
  ↓
[Node 9: Assemble DD post] (Code)
  ├─ Add title: "DD: Why Insiders Love {{ticker}} Right Now"
  ├─ Format as Reddit markdown (headers, **bold**, bullet points)
  ├─ Add TLDR at top in >>**TL;DR**
  ├─ Add "Positions: {{disclaimer}}" or "No position (yet)" for transparency
  ├─ Total: 1500-2500 words
  ↓
[Node 10: Generate visuals]
  ├─ 10a: Price chart with insider buy dates marked (Template 5)
  ├─ 10b: Insider transaction table (Template 4)
  ├─ 10c: Peer comparison (Template 7) [maybe]
  ├─ 10d: Bear case vs bull case comparison card
  └─ All as .png files
  ↓
[Node 11: Prepare images for Reddit]
  ├─ Upload each to Imgur (or host on VPS)
  ├─ Add to post as markdown ![image_alt](image_url)
  ├─ Typical: 4-6 images per post
  ↓
[Node 12: Stage post for approval] (Send to Telegram with preview)
  ├─ Human reviews (tone, no silly mistakes, reasonable thesis)
  ├─ Human clicks ✓
  ↓
[Node 13: Post to Reddit] (Reddit API)
  ├─ Submit to subreddit (r/stocks or r/SecurityAnalysis, not WSB for DD)
  ├─ Track: post_id, timestamp
  ├─ Log to NocoDB
  ↓
[Node 14: Initial seeding] (30 min after posting)
  ├─ Upvote own post (helps with algorithm)
  ├─ Monitor for early replies
  └─ Watch for early momentum
  ↓
[Node 15: Post follow-up comment] (5-10 min after main post)
  ├─ Add comment: "Position disclosure: {{disclosure}}"
  ├─ Or add comment: "AMA — happy to discuss the bear case"
  └─ Engagement signal

**Frequency**: 1-2 DD per week (Mon or Thu mornings)
```

---

#### DD Structure (5 Sections)

```markdown
# DD: {{Company}} ({{Ticker}}) — Why Insiders Are Loading Up

**TL;DR**: 
{{3-sentence hook. Example: 
"3 insiders just bought {{total_amount}} in stock within 10 days. 
Company is down {{ytd_return}}% YTD despite {{positive_catalyst}}. 
Insider track records suggest +{{avg_return}}% upside in 6 months."}}

**Position**: {{disclosure}}

---

## Section 1: Company Overview (400 words)

[What does the company do, market position, why you should care]

## Section 2: The Insider Angle (600 words)

[Detailed insider data: who, when, how much, track records, cluster significance]

## Section 3: Bull Case (500 words)

[Specific catalysts, financial tailwinds, why insiders' conviction is justified, valuation]

## Section 4: Bear Case (500 words)

[Real risks, competition, execution risks, macro headwinds, why this could fail. 
**IMPORTANT: Be honest. This section is often more interesting than bull case.**]

## Section 5: My Take + Verdict (300 words)

[Synthesize bull + bear, price target, why I think insiders have edge, risk/reward at current price]

---

*Disclaimer: Not financial advice. Do your own DD. Past insider performance ≠ future results.*
```

---

#### Prompt for DD Sections

**System Prompt**:

```
You're writing a DD (Due Diligence) post for Reddit r/stocks. 
You're an informed retail investor who did homework and wants to share findings.

Tone:
- Confident but hedged: "The data suggests..." not "This will 100% moon"
- Specific: Use numbers, cite sources, link to SEC filings
- Honest: Show both bull and bear case convincingly
- Conversational: "Here's what I found", not "I present to you a thesis"
- Acknowledge unknowns: "I don't know if...", "One thing we don't know is..."

Structure per section:
1. Company Overview: What, market, why care
2. Insider Angle: Dig into the Form 4 filings, track records, cluster significance
3. Bull Case: Catalysts + tailwinds + valuation + insider conviction
4. Bear Case: Real risks. Don't handwave. Show weakness.
5. Verdict: Synthesis + your take + price target + risk/reward

Length: 300-600 words per section (varies)
Reddit markdown: Use **bold**, *italics*, bullet points for clarity.
Cite sources: [Link to SEC filing](url), [Source: 10-Q](url)
```

**User Prompt** (for section 2, as example — Insider Angle):

```
Ticker: {{ticker}}
Company: {{company_name}}

Insider Data:
[
  {
    "insider": "Sarah Chen",
    "title": "CFO",
    "buy_date": "2026-03-15",
    "shares": 15000,
    "price": 187.50,
    "value": 2812500,
    "past_buys": 7,
    "past_avg_return_6mo": 18.4,
    "is_insider_selling_elsewhere": false
  },
  {
    "insider": "John Smith",
    "title": "Board Director",
    "buy_date": "2026-03-10",
    "shares": 5000,
    "price": 183.00,
    "value": 915000,
    "past_buys": 5,
    "past_avg_return_6mo": 12.1,
    "is_insider_selling_elsewhere": false
  },
  {
    "insider": "Jane Doe",
    "title": "VP Engineering",
    "buy_date": "2026-03-08",
    "shares": 3000,
    "price": 180.00,
    "value": 540000,
    "past_buys": 3,
    "past_avg_return_6mo": 22.3,
    "is_insider_selling_elsewhere": false
  }
]

---

SECTION 2: THE INSIDER ANGLE (600 words)

This is the core section for your DD. Explain:

1. **The Cluster** (150 words)
   {{num_insiders}} insiders bought within {{days}} days, total {{total_value}}.
   Cite the Form 4 links for each.
   Explain why cluster buying is statistically bullish.
   Example: "When 3+ insiders buy the same stock within 30 days, 
   historical data shows +22% avg return in 6 months."

2. **Individual Track Records** (250 words)
   For each insider: name, title, # past buys, avg return, 
   and most importantly: "Are they good at timing or just throwing darts?"
   Example: Sarah Chen (CFO): "Over 7 buys, averaging +18.4% return. 
   Her worst buy was [date] at [price], down -15% in 6mo. 
   Her best was [date] at [price], up +60% in 6mo."
   
3. **What They're NOT Doing** (150 words)
   Are any insiders selling? (That's a red flag.)
   Are any insider selling restrictions lifting soon? (That's a timing signal.)
   Any 10b5-1 plans recently filed? (Systematic sales can be dismissed.)

4. **The Thesis Connection** (50 words)
   Why do you think insiders are buying NOW?
   - Upcoming earnings?
   - New product launch?
   - Macro tailwind?
   - Valuation attractive?

Output: Reddit markdown, 600 words, **bold** for key numbers, 
[link](url) for SEC filings, natural conversational tone.
```

---

#### Bear Case Advice

**Critical**: The bear case must be **genuine and plausible**, not dismissive.

Anti-pattern (bad):
```
"The bear case is that insiders are dumb and wrong. But they're not."
```

Good pattern:
```
"The bear case: semiconductor demand cycle is peaking. 
If AI capex slows in 2027, {{ticker}}'s revenue could contract -20%. 
The insiders buying NOW might be wrong about timing, or they might have 
better information about demand that the market doesn't yet. 
That's the risk."
```

**Prompt for bear case section** (forces honesty):

```
Write the bear case as if you're arguing AGAINST {{ticker}}.
Not to convince yourself, but to genuinely explore "what could go wrong."

Structure:
1. Macro risk: What's the 1 macro scenario that kills this trade?
2. Company-specific: Operational risk, competition, execution risk
3. Insider limitation: What insiders DON'T know (can't predict markets, can have personal cash needs)
4. Valuation: Is {{ticker}} expensive even if bull case works?
5. Catalyst timing: Insiders could be early or late. What's the downside if catalyst delayed 12 months?

Tone: Respectful of the bull case, but thorough on risks.
Length: 500 words minimum. 
Make the reader think "yeah, this could legit happen."
```

---

### CAT 7 — X Replies (inbound, real-time)

#### Workflow Architecture

```
[Continuous: Every 5 minutes, 24/7]
  ↓
[Node 1: Fetch recent tweets from target accounts] (Twitter API v2)
  ├─ Accounts to monitor: 50-100 finance influencers (50K-500K followers)
  ├─ Keywords: {{ticker symbols}}, "insider", "Form 4", "earnings", "market"
  ├─ Filter: tweets from last 5 minutes
  ├─ Exclude: already replied to (track reply_ids)
  └─ Get: tweet_id, author_id, text, created_at
  ↓
[Node 2: Rank tweets by reply opportunity] (Code)
  ├─ Score 0-100 based on:
  │  ├─ Mentions insider-tradable ticker? (+50 points)
  │  ├─ Mentions earnings/macro theme? (+25 points)
  │  ├─ Has low reply count (<20)? (+15 points, less saturated)
  │  ├─ Author follower count 50K-500K? (+10 points)
  │  ├─ Tweet is bullish/bearish/uncertain (good for contrarian reply)? (+15 points)
  │  └─ Score threshold: >= 70 to reply
  ↓
[Node 3: Determine reply archetype] (Code)
  ├─ Archetype 1: "Data Bomb" — tweet mentions {{ticker}}, we have fresh insider data
  ├─ Archetype 2: "Contrarian Fact-Check" — tweet is bullish, we have bearish insider data (or vice versa)
  ├─ Archetype 3: "Pattern Reply" — tweet about general concept, we add insider angle
  └─ Select archetype based on tweet content
  ↓
[Node 4: Fetch insider data for reply] (NocoDB query)
  ├─ For mentioned {{ticker}}: recent alerts (past 7 days)
  ├─ Find match: is there insider data that makes sense as reply?
  ├─ If YES: fetch insider_data
  └─ If NO: skip this tweet (we only reply if we have data)
  ↓
[Node 5: Generate reply] (Claude Sonnet or DeepSeek)
  ├─ Input: tweet_text, archetype, insider_data, author_context
  ├─ Output: 150-220 character reply, max 2 sentences
  ├─ Include data: specific insider name, amount, date
  └─ Include: relevant visual (template selection below)
  ↓
[Node 6: Validate] (Code)
  ├─ Character count: 150-220
  ├─ Includes specific data point
  ├─ Tone matches archetype
  ├─ No links (or minimal)
  ├─ Doesn't sound bot-like
  └─ If fail → retry with feedback
  ↓
[Node 7: Generate visual (if needed)]
  ├─ Archetype 1 ("Data Bomb"): Comparison Card (Template 3)
  │  "{{insider}} bought last time → stock +X% in 6mo. Now at {{price}}."
  ├─ Archetype 2 ("Contrarian"): Contrarian Card (Template 15)
  │  "Market says {{sentiment}}, but insiders say {{opposite}}"
  ├─ Archetype 3 ("Pattern"): SEC Filing Mini Card (Template 2)
  │  Compact: ticker, insider, amount, date
  └─ Render visual: HTTP POST to screenshot server → {{image.png}}
  ↓
[Node 8: Stage reply + visual for approval] (Send to Telegram)
  ├─ Preview: reply text + image preview
  ├─ Human clicks ✓ to approve
  └─ Wait for approval
  ↓
[Node 9: Post reply] (Twitter API: Create reply)
  ├─ Text: {{reply_text}}
  ├─ Media: {{image_id}} (upload image via Twitter API first, get media_id)
  ├─ Reply to: {{tweet_id}}
  ├─ Delay: Random 5-30 min after human approval (look natural)
  ├─ Track: reply_id, posted_at, metrics snapshot (0 likes initially)
  ↓
[Node 10: Monitor reply engagement] (Webhook/polling, 24 hours)
  ├─ Track: likes, replies, retweets over time
  ├─ If reply gets 10+ likes: consider quote-tweeting to own account (amplify)
  ├─ If user replies with question: tag for follow-up reply
  └─ Store metrics: {{reply_id}}, {{likes}}, {{replies}}, {{retweets}}, {{impressions_est}}

**Response SLA**: Approve → Post within 5-30 min
**Daily cap**: 10-15 replies max (quality over quantity)
**Best times**: 9-11 AM UTC, 14-16 UTC, 20-22 UTC (align with US market hours)
```

---

#### 3 Archetypes + Prompts

**Archetype 1: Data Bomb**

When to use: Tweet mentions specific {{ticker}}, we have hot insider data (past 7 days).

```
Prompt:
"Generate a reply that says: 'This ticker just had insider activity 
{{insider_name}} ({{title}}) bought ${{amount}} on {{date}}. 
Last similar buy: +{{past_return}}%.' 
Keep to 150-180 chars. Use format: 
'{{TICKER}}: {{Insider}} bought ${{amount}} recently. 
Last time: +{{past_return}}% in 6 months. {{VISUAL}}'
Tone: Data-first, no hype."

Template visual: Comparison Card (Template 3) — "Last time this insider bought → +X%"
```

**Archetype 2: Contrarian Fact-Check**

When to use: Tweet is bullish about {{ticker}}, we have insider selling data (or vice versa).

```
Prompt:
"Tweet says '{{ticker}} is bullish because {{reason}}'. 
Insider data shows: {{insider_name}} ({{title}}) sold ${{amount}} last week, 
despite bullish sentiment. OR: insider just bought despite bearish consensus. 
Generate reply: 'Interesting point on {{reason}}, but insider data shows {{opposite}}. 
{{insider}} {{BUY|SELL}} ${{amount}} {{date_relative}}.' 
Keep 150-200 chars. Tone: respectful contrarian, not snarky."

Template visual: Contrarian Card (Template 15) — "Everyone says X, insiders say Y"
```

**Archetype 3: Pattern Reply**

When to use: Tweet is about general concept (earnings, macro, sector trend), not specific {{ticker}}.

```
Prompt:
"Tweet is about: '{{general_concept}}' (e.g., 'AI stocks rallying', 'tech earnings season underway').
Reply should add insider angle: 'Agreed on {{concept}}. Notably, 
{{num_insiders}} tech insiders bought ${{total_amount}} in past week. 
{{company1}}, {{company2}} leading the way.'
Keep 150-180 chars. Tone: contributory, adds data, not spammy."

Template visual: Market Movers Card (Template 13) or SEC Filing Mini Card (Template 2)
```

---

#### Example Concrete Replies

**Example 1 — Data Bomb**
```
Tweet: "$NVDA Q1 guidance beats expectations, this could rip higher"
Our data: CEO bought $5M on Mar 15 @ $187.50

Reply: "$NVDA: CEO Chen bought $5M just before earnings. Last time she did this 
(Aug 2024): +28% in 6 months. Now at $187 — watching for $200. [IMAGE]"
[Length: 165 chars — OK]
[Visual: Comparison Card "Last time CEO bought → +28%"]
```

**Example 2 — Contrarian**
```
Tweet: "Bearish on XYZ, too much debt, margins collapsing"
Our data: CFO just bought $2M on Mar 14, despite negative sentiment

Reply: "Real concern on margins. But: CFO bought $2M yesterday. 
They have ~$800M cash, debt manageable. Timing suggests they see value others missed. 
Let's watch next ER. [IMAGE]"
[Length: 175 chars — OK]
[Visual: Contrarian Card "Market says SELL, insider says BUY"]
```

**Example 3 — Pattern**
```
Tweet: "Earnings season starts next week, mega cap tech reporting. 
What are you watching?"
Our data: 5 tech insiders bought in past 7 days ($10M+ total)

Reply: "Waiting for AMD earnings Thursday. But heads up: 
5 tech CEOs/CFOs bought $10M+ in past week. 
AMD, INTC, AVGO all saw insider activity. Might front-run some moves. [IMAGE]"
[Length: 185 chars — OK]
[Visual: Market Movers Card with those 3 tickers]
```

---

#### Reply Quality Validation

```javascript
const validateXReply = (reply, archetype, tweet_context) => {
  const checks = {
    charCount: reply.length >= 150 && reply.length <= 220,
    hasDataPoint: /\$[\d,]+|[\d.]+%|202\d-\d{2}-\d{2}/.test(reply), // $ amount, %, date
    noAISignals: !['appreciate', 'excellent point', 'great catch', 'ultimately'].some(
      p => reply.toLowerCase().includes(p)
    ),
    appropriateTone: checkArchetypeTone(reply, archetype),
    engagesWithTweet: reply.toLowerCase().includes(tweet_context.keyword),
    noSpam: !reply.includes('earlyinsider.com') && !reply.match(/http.*link/),
  };
  
  return Object.values(checks).every(v => v);
};

const checkArchetypeTone = (reply, archetype) => {
  if (archetype === 'data_bomb') {
    return /bought|sold|insider/.test(reply.toLowerCase());
  } else if (archetype === 'contrarian') {
    return /but|however|interesting|despite/.test(reply.toLowerCase());
  } else if (archetype === 'pattern') {
    return /notably|timing|trend|watching/.test(reply.toLowerCase());
  }
  return true;
};
```

---

### CAT 8 — X Posts (Outgoing, 3-4 per day)

#### Workflow Architecture

```
[4x Daily Schedule: 09:30 UTC, 12:00 UTC, 15:30 UTC, 18:00 UTC]
  ↓
[Node 1: Determine post type for this slot] (Code)
  ├─ Rotate through 4 formats (see below)
  ├─ Slot 1 (09:30): Breaking alert
  ├─ Slot 2 (12:00): Commentary or thread
  ├─ Slot 3 (15:30): Educational or engagement
  └─ Slot 4 (18:00): Market recap or discussion
  ↓
[Node 2: Fetch source data]
  ├─ Format: "breaking" → fetch highest score alerts from today
  ├─ Format: "commentary" → fetch market news, sector trends, macro
  ├─ Format: "educational" → fetch from content calendar
  ├─ Format: "engagement" → generate poll options from trending topics
  ↓
[Node 3: Generate post text] (DeepSeek V3.2 or Claude Sonnet)
  ├─ Input: format type, source data
  ├─ Output: tweet(s), 220-280 chars per tweet
  ├─ For threads: 2-3 connected tweets
  ↓
[Node 4: Determine visual needs] (Code)
  ├─ Breaking alert: Template 1 (Data Card)
  ├─ Earnings reaction: Template 12 (Earnings Card)
  ├─ Market movers: Template 13 (Market Movers Card)
  ├─ Educational: Template 14 (Infographic)
  ├─ Contrarian: Template 15 (Contrarian Card)
  └─ Poll: No image needed
  ↓
[Node 5: Generate visual] (HTTP to screenshot server, if needed)
  ├─ Render template HTML → PNG
  ├─ Dark mode, 1200x630 optimal for X
  ├─ Include branding (EI logo corner)
  ↓
[Node 6: Upload media to X] (Twitter API)
  ├─ POST image → get media_id
  ├─ Store media_id for tweet attachment
  ↓
[Node 7: Validate post] (Code)
  ├─ Character count per tweet: <=280
  ├─ Thread tweets coherent (tweet N+1 references tweet N)
  ├─ All data points cited are from {{data_sources}}
  ├─ Tone matches brand (authoritative, data-driven, not hyping)
  └─ If fail → retry with feedback
  ↓
[Node 8: Stage for approval] (Send to Telegram)
  ├─ Show: full tweet text, image preview, post timing
  ├─ Human ✓ or ✗
  ↓
[Node 9: Post to X] (Twitter API: Create tweet)
  ├─ Text: {{post_text}}
  ├─ Media: {{media_ids}} if applicable
  ├─ Timestamp: {{scheduled_time}}
  ├─ Track: tweet_id, created_at
  └─ Log to NocoDB
  ↓
[Node 10: Monitor post performance] (Webhook, 24-48 hours)
  ├─ Track: likes, retweets, replies, impressions over time
  ├─ If viral (>100 likes in 2h): optionally quote-retweet with additional insight
  ├─ If poor (<10 likes): note in analytics for learning
  └─ Store metrics for analysis

**Frequency**: 4 posts/day, spread across trading hours
**Total per week**: 20-28 posts (weekdays only, maybe 4 weekend)
**Total per month**: ~100 posts
```

---

#### 4 Post Formats

**Format 1: Breaking Alert**

```
Hook: Specific insider action + price impact potential

"🚨 {{Insider Name}} ({{Title}}) just bought ${{Amount}} of ${{TICKER}} at ${{Price}}.

Track record: {{PastBuys}} buys, avg +{{AvgReturn}}% in 6 months.

Current price ${{Price}}. Next catalyst: {{Catalyst}} on {{Date}}.

{{IMAGE: Data Card Template 1}}"

[280 chars max, includes emoji, specific numbers]
```

**Format 2: Thread (2-3 tweets)**

```
Tweet 1:
"Earnings season starts in 7 days. Here's what insiders are telegraphing. 🧵

${{TICKER1}}: CFO bought ${{Amount1}} (bullish)
${{TICKER2}}: CEO sold ${{Amount2}} (cautious)
${{TICKER3}}: Cluster buy ${{Amount3}} (very bullish)

Thread: what this means for returns →"

Tweet 2:
"When insiders buy PRE-earnings (within 30 days), the stock beats by {{BeatRate}}%.
Why? They have <60 day insider information lag and often know guidance is strong.

${{TICKER1}}'s insider buys: {{PastBeatRate}}% pre-earnings hit rate.
Next earnings: {{Date}}.
Stay tuned."

Tweet 3:
"In 6-month backtests, insider cluster buys (3+ buys in 30 days) return +{{ClusterReturn}}%.
Single insider buys return +{{SingleReturn}}%.

That's the power of cluster conviction.
Are you tracking these signals?"

[3 tweets, each coherent but connected]
```

**Format 3: Commentary**

```
"{{Market context}}: {{Sector}} is down {{Percent}}% today on {{Reason}}.

But here's what insider data shows:
- {{NumInsiders}} tech insiders bought ${{TotalAmount}} in past 3 days
- CFOs >directors = more bullish signal = +{{HistoricalReturn}}% avg

Market fear = insider opportunity? 

[IMAGE: Contrarian Card or Market Movers Card]"
```

**Format 4: Engagement**

```
"Quick poll 🧵:

Which signal is MORE predictive of 6-month stock returns?

A) Insider CEO buy (historically +{{ReturnA}}%)
B) Analyst upgrade (historically +{{ReturnB}}%)
C) Earnings beat (historically +{{ReturnC}}%)
D) All three together (historically +{{ReturnD}}%)

Reply with letter below 👇"

[Includes poll in X, or simple question with A/B/C/D)
```

---

#### Visual Template Selection Logic

```javascript
const selectVisualTemplate = (postFormat, dataType) => {
  if (postFormat === 'breaking') {
    return 'Template1_DataCard'; // Insider name, amount, verdict badge
  } else if (postFormat === 'thread') {
    return null; // Threads usually text-only for clarity
  } else if (postFormat === 'commentary') {
    if (dataType === 'earnings_reaction') {
      return 'Template12_EarningsCard'; // EPS beat/miss
    } else if (dataType === 'market_movers') {
      return 'Template13_MarketMoversCard'; // Top 3-5 tickers of day
    } else if (dataType === 'contrarian') {
      return 'Template15_ContrarianCard'; // Market says X, insiders say Y
    }
  } else if (postFormat === 'engagement') {
    return null; // Poll format, no image
  }
};
```

---

#### Prompt Design for X Posts

**System Prompt**:

```
You are the X account for EarlyInsider.com — a financial intelligence platform 
focused on insider trading signals.

Your goal: Build authority + follower base + drive traffic to site.

Tone guidelines:
- Data-first: Lead with numbers, not opinions
- Authoritative but accessible: Explain WHY insider signals matter
- Contrarian edge: "While everyone's bearish..."
- Emoji sparingly (🚨 for breaking, 📊 for data, 🧵 for threads)
- Short, punchy, use line breaks for mobile readability

Posting rules:
- Breaking alerts: Specific {{insider}}, {{amount}}, {{date}}, {{track_record}}
- Threads: Each tweet self-contained but connected
- Commentary: Tie insider data to market narrative
- Engagement: Ask questions that drive discussion

X mechanics:
- Lead with hook (first 20 chars matter most)
- 280 character limit strictly enforced per tweet
- Retweets by nature are flat (replies > retweets > likes)
- Threads perform well if each tweet is quotable
```

**User Prompt** (for breaking alert, example):

```
Format: Breaking Alert
Data: {{alert_json}}

Example:
{
  "ticker": "NVDA",
  "insider_name": "Sarah Chen",
  "insider_title": "CFO",
  "transaction_type": "BUY",
  "shares": 15000,
  "price": 187.50,
  "date": "2026-03-15",
  "past_buys": 7,
  "avg_return_6mo": 18.4,
  "days_since_last_buy": 45,
  "next_catalyst": "Q1 Earnings",
  "catalyst_date": "2026-04-10"
}

---

Generate an X post (280 chars max) for this breaking insider alert.

Format:
"🚨 [Insider] just bought $X of ${{TICKER}}.
Track record: Y buys, avg +Z% in 6mo.
Catalyst: [upcoming event].
[IMAGE]"

Keep specific. Include emoji. End with image suggestion (Template 1: Data Card).

Tone: Factual, exciting but not hype.
Length: 150-180 chars (leave room for media embed label).
```

---

### CAT 9 — Alert Scoring

#### Scoring Formula (Deterministic + AI Refinement)

```javascript
const scoreAlert = (filing) => {
  // BASE SCORE: 6 weighted factors (100 total)
  
  const factors = {
    insider_track_record: calculateTrackRecord(filing.insider_name), // 0-30 points
    transaction_magnitude: calculateMagnitude(filing.shares, filing.price, filing.market_cap), // 0-25 points
    market_cap_and_liquidity: rateMarketCap(filing.market_cap), // 0-20 points
    cluster_buying: checkClusterBuy(filing.ticker, filing.date), // 0-15 points
    days_since_last_transaction: rateTiming(filing.insider_last_buy_days), // 0-5 points
    insider_selling_elsewhere: checkIfSellingOtherStocks(filing.insider_name), // -5 to 0 (penalty)
  };
  
  const baseScore = Object.values(factors).reduce((a, b) => a + b, 0);
  
  // REFINEMENT: AI adjusts by -1, 0, or +1 based on qualitative factors
  const aiRefinement = claudeRefinement({
    base_score: baseScore,
    factors,
    filing_context: filing,
  });
  
  const finalScore = Math.min(10, Math.max(1, baseScore + aiRefinement));
  
  return {
    score: finalScore,
    breakdown: factors,
    base: baseScore,
    adjustment: aiRefinement,
  };
};
```

---

#### Deterministic Factor Breakdown

**Factor 1: Insider Track Record** (0-30 points)

```javascript
const calculateTrackRecord = (insider_name) => {
  const history = getNocoDB('insider_history', {
    where: `insider_name = "${insider_name}" AND transaction_type = "BUY"`,
    limit: 10, // Last 10 buys
  });
  
  if (history.length === 0) {
    return 5; // New insider, unknown track record
  }
  
  // Calculate 6-month average return on past buys
  const returns = history.map(h => {
    const holdingPrice = getStockPrice(h.ticker, sixMonthsAfter(h.date));
    return ((holdingPrice - h.price) / h.price) * 100;
  });
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // Map to 0-30 scale
  if (avgReturn > 40) return 30;
  if (avgReturn > 20) return 25;
  if (avgReturn > 10) return 20;
  if (avgReturn > 0) return 15;
  if (avgReturn > -10) return 8;
  return 3; // Negative track record
};
```

**Factor 2: Transaction Magnitude** (0-25 points)

```javascript
const calculateMagnitude = (shares, price, market_cap) => {
  const transactionValue = shares * price;
  const percentOfMarketCap = (transactionValue / (market_cap * 1e6)) * 100;
  
  // Larger insider buys relative to market cap = stronger signal
  if (percentOfMarketCap > 0.5) return 25; // Very large
  if (percentOfMarketCap > 0.2) return 20;
  if (percentOfMarketCap > 0.1) return 15;
  if (percentOfMarketCap > 0.05) return 10;
  if (transactionValue > 2000000) return 8; // $2M+ absolute value
  if (transactionValue > 1000000) return 5;
  return 2; // Small buys
};
```

**Factor 3: Market Cap & Liquidity** (0-20 points)

```javascript
const rateMarketCap = (market_cap_millions) => {
  // Favor liquid large/mid caps, but not mega caps (harder to move)
  if (market_cap_millions > 500000) return 15; // Mega cap (liquid but hard to beat market)
  if (market_cap_millions > 100000) return 20; // Large cap (sweet spot)
  if (market_cap_millions > 10000) return 18; // Mid cap
  if (market_cap_millions > 1000) return 12; // Small cap (less liquid, higher risk)
  return 5; // Micro cap (high risk)
};
```

**Factor 4: Cluster Buying** (0-15 points)

```javascript
const checkClusterBuy = (ticker, filing_date) => {
  // Check if 3+ insiders bought same ticker in 30-day window around filing_date
  const thirtyDaysWindow = getNocoDB('SEC_filings', {
    where: `ticker = "${ticker}" AND transaction_type = "BUY" 
             AND ABS(DATE(date) - DATE("{{filing_date}}")) <= 30`,
  });
  
  if (thirtyDaysWindow.length >= 5) return 15; // 5+ cluster = very strong
  if (thirtyDaysWindow.length >= 3) return 12; // 3-4 cluster = strong
  if (thirtyDaysWindow.length >= 2) return 6;  // 2 = weak cluster
  return 0; // No cluster
};
```

**Factor 5: Days Since Last Transaction** (0-5 points)

```javascript
const rateTiming = (days_since_last_insider_buy) => {
  // Insiders who haven't bought in 1+ years buying again = stronger signal
  if (days_since_last_insider_buy > 365) return 5;
  if (days_since_last_insider_buy > 180) return 4;
  if (days_since_last_insider_buy > 90) return 3;
  if (days_since_last_insider_buy > 30) return 2;
  return 1; // Recent buys
};
```

**Factor 6: Insider Selling Elsewhere** (-5 to 0, penalty)

```javascript
const checkIfSellingOtherStocks = (insider_name) => {
  const recentSales = getNocoDB('SEC_filings', {
    where: `insider_name = "${insider_name}" AND transaction_type = "SELL" 
             AND date >= ${thirtyDaysAgo}`,
  });
  
  if (recentSales.length > 2) return -5; // Heavy selling elsewhere = distrust
  if (recentSales.length > 0) return -2; // Some selling
  return 0; // No recent selling
};
```

---

#### AI Refinement (Claude or DeepSeek)

```javascript
const claudeRefinement = async ({base_score, factors, filing_context}) => {
  const prompt = `
Current score for
