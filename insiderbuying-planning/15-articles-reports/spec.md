# Spec: 15-articles-reports

## Purpose
Elevate the three content generation files to professional finance publication standard. Articles get a named persona, multi-step outline→draft generation, hardened 14-point quality gate, and visual placeholder injection. Premium reports get full 9-section sequential generation with executive summary last, separate bear case, 5 chart types, report covers, and WeasyPrint PDF. Lead magnets expand to 12-15 pages with honest losers section, math verification, and dynamic titles.

## Scope
**Files modified**: generate-article.js, generate-report.js, generate-lead-magnet.js
**Reference**: WORKFLOW-CHANGES.md CAT 1 (gaps 1.1-1.12), CAT 2 (gaps 2.1-2.12), CAT 3 (gaps 3.1-3.9), PROMPT-WORKFLOW-FRAMEWORK.md CAT 1/2/3

## Sections

### Section 1: generate-article.js — Named Persona + Multi-Step Generation
Fix GAP 1 (persona): add to system prompt:
```
You are Ryan Chen, former Goldman Sachs equity research analyst, now independent investor and founder of an insider trading intelligence service. Write in first-person singular. Reference your analytical background naturally.
```

Fix GAP (multi-step D3.2): replace single-call generation with 2-step:

**Step 1 — Outline** (Claude, ~300 tokens):
```
Write a structured outline for an article about ${{ticker}} insider buying. Article type: {{articleType}}.
Include: headline (55-65 chars with primary keyword), 5-7 H2 sections with 2-3 H3 subsections each, TLDR bullets (3-5), required data points to gather.
Format as JSON: {headline, tldr: [], sections: [{h2, h3s: []}]}
```
Validate outline: must have ≥5 sections and mention ticker name.

**Step 2 — Full Draft** (Claude, 4000 tokens, receives outline + data):
```
Write the full article from this outline: {{outline_json}}
Data to use: {{dexter_research_package}}
[Full persona + rules from PROMPT-WORKFLOW-FRAMEWORK.md CAT 1]
Include {{VISUAL_1}}, {{VISUAL_2}}, {{VISUAL_3}} placeholders where charts should appear.
```

### Section 2: generate-article.js — Hardened Quality Gate (14 checks)
Fix gaps 1.1-1.12. Rewrite `qualityGate()`:

```javascript
function qualityGate(article, opts) {
  const errors = [];

  // 1. Word count
  const words = countWords(article.body_html);
  if (words < 1800 || words > 2500) errors.push(`word count: ${words} (need 1800-2500)`);

  // 2. Visual placeholders (was: checks only ≥1 table) — FIX GAP 1.2
  const visuals = (article.body_html.match(/{{VISUAL_\d+}}/g) || []).length;
  if (visuals < 3) errors.push(`visuals: ${visuals} (need ≥3 {{VISUAL_N}} placeholders)`);

  // 3. Internal links (was: soft signal) — FIX GAP 1.3
  const internalLinks = (article.body_html.match(/href="\/[^"]+"/g) || []).length;
  if (internalLinks < 4) errors.push(`internal links: ${internalLinks} (need 4-6)`);

  // 4. CTA in first 500 chars — FIX GAP 1.4
  const first500 = article.body_html.slice(0, 500);
  if (!first500.match(/alert|subscribe|notification|free/i)) errors.push('no CTA in first 500 chars');

  // 5. Track record section — FIX GAP 1.6
  if (!article.body_html.match(/last \d+ buy|previous buy|track record|historically/i)) {
    errors.push('no track record section found');
  }

  // 6. Social proof — FIX GAP 1.7
  if (!article.body_html.match(/subscriber|tracking|member|\d{3}+ (pro|user)/i)) {
    errors.push('no social proof injection');
  }

  // 7. Filing timeliness — FIX GAP 1.8
  const daysSinceFiling = opts.daysSinceFiling;
  if (daysSinceFiling > 72) errors.push(`stale: filed ${daysSinceFiling}h ago (max 72h)`);
  if (daysSinceFiling > 24) article.staleness_warning = true; // add disclaimer but don't reject

  // 8. TLDR in first 200 words — FIX GAP 1.9
  const first200words = article.body_html.split(/\s+/).slice(0, 200).join(' ');
  if (!first200words.match(/tldr|key takeaway|in brief|quick take/i)) {
    errors.push('TLDR not in first 200 words');
  }

  // 9. Word count range — FIX GAP 1.10 (was 2000-3000, now 1800-2500)
  // (covered in check 1)

  // 10. Sentence CV — FIX GAP 1.11 (was soft signal, now hard gate)
  const sentences = extractSentences(article.body_html);
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const cv = stdDev(lengths) / mean(lengths);
  if (cv < 0.45) errors.push(`sentence variation CV: ${cv.toFixed(2)} (need >0.45)`);

  // 11. Keyword density — FIX GAP 1.12 (was 0.5-1.5%, now 1.0-2.5%)
  const kd = computeKeywordDensity(article.body_html, opts.primaryKeyword);
  if (kd < 0.01 || kd > 0.025) errors.push(`keyword density: ${(kd*100).toFixed(1)}% (need 1.0-2.5%)`);

  // 12. FK Readability — FIX GAP 1.1 (was FK Grade 8-10, now FK Ease 30-50)
  const fkEase = computeFleschKincaidEase(article.body_html);
  if (fkEase < 30 || fkEase > 50) errors.push(`FK Ease: ${fkEase} (need 30-50 for finance)`);

  // 13. Title 55-65 chars
  if (article.headline.length < 55 || article.headline.length > 65) {
    errors.push(`title length: ${article.headline.length} (need 55-65)`);
  }

  // 14. No generic opening
  const openingLine = stripHtml(article.body_html).slice(0, 100);
  if (openingLine.match(/^(in this article|today we|recently|welcome to|introduction)/i)) {
    errors.push('generic opening detected');
  }

  return { valid: errors.length === 0, errors, staleness_warning: article.staleness_warning };
}
```

Retry logic: max 2 attempts. On 2nd attempt, pass error list back to Claude: "Previous attempt failed: {{errors}}. Fix specifically."

Add helper functions: `computeFleschKincaidEase(html)` (~20 lines — FK Ease formula: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)).

### Section 3: generate-article.js — Visual Injection + Freshness
Visual placeholder replacement (after generation):
```javascript
async function replaceVisualPlaceholders(article, filingData) {
  // For each {{VISUAL_N}} in html:
  // {{VISUAL_1}} → Insider Transaction Table (Template 4)
  // {{VISUAL_2}} → Price Chart with buy marker (Template 5)
  // {{VISUAL_3}} → Revenue Trend (Template 6)
  const { templates } = require('./visual-templates');
  for (const [idx, match] of Object.entries(visualMatches)) {
    const buffer = await templates.renderTemplate(templateMap[idx], data);
    const url = await uploadChart(buffer, `article-${article.slug}-visual-${idx}`);
    article.body_html = article.body_html.replace(match, `<img src="${url}" alt="Insider data visualization" />`);
  }
}
```

Content freshness checker (D4.1): before generating article, query NocoDB:
```javascript
async function checkContentFreshness(ticker) {
  const recent = await nocodb.list('Articles', {
    where: `(ticker,eq,${ticker})~and(published_at,gt,${thirtyDaysAgo})`,
    limit: 1
  });
  if (recent.length > 0) return { fresh: false, lastPublished: recent[0].published_at };
  return { fresh: true };
}
```
If not fresh: use different angle (contrarian / sector / earnings-preview) instead of standard insider_buying.

Schema.org JSON-LD (GAP 1.5): add `generateSchema(article)` returning JSON-LD for Article + Person (Ryan Chen) + FinancialProduct. Inject as `<script type="application/ld+json">` in article HTML.

### Section 4: generate-report.js — 9-Section Sequential Generation
Fix GAP 2.1 and 2.2: rewrite report generation to sequential 9-section approach.

```javascript
const REPORT_SECTIONS = [
  { id: 'company_overview', wordTarget: 600 },
  { id: 'insider_intelligence', wordTarget: 800 }, // CORE
  { id: 'financial_analysis', wordTarget: 700 },
  { id: 'valuation_analysis', wordTarget: 600 },
  { id: 'bull_case', wordTarget: 500 },
  { id: 'bear_case', wordTarget: 500 }, // SEPARATE CALL — D3.3
  { id: 'peer_comparison', wordTarget: 600 },
  { id: 'catalysts_timeline', wordTarget: 400 },
  { id: 'investment_thesis', wordTarget: 400 },
  // exec_summary generated LAST — D3.5
];
```

Sequential generation loop (each call receives all previous sections as context):
```javascript
const completedSections = {};
for (const section of REPORT_SECTIONS) {
  const context = JSON.stringify(completedSections);
  const sectionText = await claude.complete(
    buildSectionSystemPrompt(section.id),
    buildSectionUserPrompt(section, data, context)
  );
  validateSection(sectionText, section); // word count + data citations
  completedSections[section.id] = sectionText;
}
// Generate executive summary LAST (D3.5)
completedSections.exec_summary = await claude.complete(
  EXEC_SUMMARY_SYSTEM,
  `Summarize these 9 sections into a 400-500 word executive summary: ${JSON.stringify(completedSections)}`
);
```

Bear case (D3.3): separate Claude call with adversarial prompt:
```
You are a skeptical short seller. Argue AGAINST buying ${{ticker}}.
Required: 3 genuine fundamental risks (not just "market uncertainty"), 1 bear scenario with specific downside target, historical precedents where similar insider buying was followed by stock decline.
Do NOT mention the bull case. Be genuinely skeptical.
```
Bear case is reviewed for authenticity (same pattern as CAT 6 DD): if < 7/10 authenticity → retry.

### Section 5: generate-report.js — Charts + Cover + PDF
5 charts per report (parallel generation using Promise.all):
```javascript
const charts = await Promise.all([
  covers.renderCoverA({ ticker, verdict, ... }),       // Report cover
  templates.renderTemplate(5, { priceHistory, ... }), // Price chart with buy markers
  templates.renderTemplate(6, { financials }),         // Revenue trend
  templates.renderTemplate(7, { valuation }),          // Valuation football field
  templates.renderTemplate(8, { peerData }),            // Peer radar
]);
```

Price tier logic (GAP 2.11):
```javascript
function getReportConfig(reportType) {
  if (reportType === 'single') return { price: 14.99, coverTemplate: 'A' };
  if (reportType === 'complex') return { price: 19.99, coverTemplate: 'A' }; // more pages
  if (reportType === 'sector') return { price: 19.99, coverTemplate: 'B' };
  if (reportType === 'bundle') return { price: 24.99, coverTemplate: 'C' };
}
```

PDF generation: WeasyPrint for complex reports (per-page CSS `@page` headers/footers, TOC):
```javascript
async function generateReportPDF(sections, charts, config) {
  const html = buildReportHTML(sections, charts, config); // full HTML with CSS
  // WeasyPrint via child_process
  const { exec } = require('child_process');
  await new Promise((resolve, reject) => {
    exec(`python3 -c "import weasyprint; weasyprint.HTML(string=open('/tmp/report.html').read()).write_pdf('/tmp/report.pdf')"`,
      (err) => err ? reject(err) : resolve());
  });
  const pdfBuffer = require('fs').readFileSync('/tmp/report.pdf');
  return pdfBuffer;
}
```

CSS: `@page { @top-center { content: "EarlyInsider — Insider Intelligence Report"; } @bottom-right { content: counter(page); } }`. Helvetica Neue for headings (GAP 2.4).

5-page preview (GAP 2.8): `generatePreviewPDF(pdfBuffer)` — uses pdftk or pdf-lib to extract first 5 pages. Upload both full + preview to R2. Preview URL = public (free users), full = auth-gated.

File size check (GAP 2.9): `if (pdfBuffer.length > 5_242_880) throw new Error('Report PDF exceeds 5MB')`.

### Section 6: generate-lead-magnet.js — Expansion
Fix GAP 3.1: expand to 4000-5000 words / 12-15 pages.
Fix GAP 3.5: dynamic title generation:
```javascript
const titleData = { count: topPerformers.length, maxReturn: topPerformers[0].return };
const title = `${titleData.count} Insider Buys That Jumped ${Math.floor(titleData.maxReturn)}%+ — The ${currentMonth} Backtest`;
```

Fix GAP 3.6: add Quick Wins page (second page after cover): bullet list of 5 most actionable insights from the data.

Fix GAP 3.8: add worst performers table (not just top 5). Table: Ticker | Insider | Amount | Return | What Went Wrong.

Fix GAP 3.9: "What If" simulation — compute deterministically in Code Node:
```javascript
// $10,000 invested in EACH of the top 5 picks
const whatIfReturns = topPerformers.map(p => ({ ticker: p.ticker, invested: 10000, value: 10000 * (1 + p.return/100) }));
const totalInvested = 50000;
const totalValue = whatIfReturns.reduce((sum, p) => sum + p.value, 0);
// Pass computed numbers to Claude for narrative — never let Claude compute math
```

Fix GAP 3.4: CTA placement — inject CTA HTML block after sections 2 (winners) and 4 (methodology):
```html
<div class="cta-block">📊 Get real-time alerts when CEOs make moves like these. <a href="https://earlyinsider.com/alerts">Start free →</a></div>
```

Fix GAP 3.3: generate 3 charts via `generate-chart.js`:
1. Portfolio vs S&P line chart (12-month comparison)
2. Winners table image (Template 4)
3. Monthly stats bar chart (scores by month)

Fix GAP 4.5 + D4.6 — math verification:
```javascript
// Validate all numbers in generated text match computed values
function verifyMathAccuracy(text, computedData) {
  // Extract numbers from text matching our computed values
  // Check: win rate %, avg return, portfolio value — each within 1% of computed
  const errors = [];
  if (!text.includes(computedData.winRate.toFixed(0) + '%')) errors.push('win rate mismatch');
  // ...
  return errors;
}
```

Losers section length (D4.5): validate `losersSection.split(/\s+/).length > 500` — if not, retry with explicit instruction: "The losers section is too short. Expand each loss with: what went wrong, what the data missed, what we learned."

## Test Requirements
- qualityGate: all 14 checks, pass/fail for each individually
- computeFleschKincaidEase: known inputs → expected FK Ease scores
- checkContentFreshness: mock NocoDB, returns correct fresh/stale status
- Section sequential: mock Claude, verify each section receives previous sections as context
- Bear case review: mock "authenticity 4" → retry triggered
- Price tier config: 4 report types return correct prices
- whatIfReturns: pure math function, no AI — verify correct arithmetic
- losers section length check: mock short section → retry

## Definition of Done
- Articles: 14-point quality gate enforced, multi-step generation, named persona in system
- Reports: 9 sections sequential, exec summary last, bear case separate, 5 charts, PDF with WeasyPrint
- Lead magnet: 4000-5000 word target, dynamic title, math verified, losers > 500 words, 3 charts
- All existing tests pass
