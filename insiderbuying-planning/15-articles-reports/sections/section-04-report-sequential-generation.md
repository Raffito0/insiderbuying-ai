# Section 04: 9-Section Sequential Report Generation

## Overview

This section upgrades `generate-report.js` from a single monolithic Claude call (producing 5 prose sections) to a controlled sequential generation loop that produces 9 discrete sections plus an executive summary. Each call receives all previously completed sections as XML-tagged context, enabling cross-section coherence. The bear case uses an entirely separate adversarial system prompt and is scored by a second Claude call for authenticity. A global abort guard prevents partial reports from being saved silently.

**File to modify**: `ryan_cole/insiderbuying-site/n8n/code/generate-report.js`
**Test file**: `n8n/tests/generate-report.test.js`
**Dependencies**: None (section-05 depends on this section, not vice versa)
**Blocks**: section-05 (charts + PDF assembly require knowledge of section data shapes from this section)

---

## Tests First

All tests live in `n8n/tests/generate-report.test.js`. These must be written and passing before the implementation is considered complete.

### Section Generation Loop

```
// Test: generateReportSection — mock fetchFn returns section text at target word count → accepted, returned as-is
// Test: generateReportSection — mock fetchFn returns text 25% below target → retry triggered once
// Test: generateReportSection — mock fetchFn returns short text on both attempts → returns text anyway (best effort), does not throw
// Test: generateReportSection — prior sections are passed as XML-tagged context in user prompt
//   (assert user message contains <section name="company_overview">...</section>)
// Test: generateReportSection — first section call has empty prior sections context (no XML block)

// Test: sequential loop — failedSections counter: 2 failures → loop continues; 3rd failure → aborts loop
// Test: sequential loop — aborted loop throws with clear error message (not silent failure)
```

### Bear Case + Authenticity Review

```
// Test: bear case uses adversarial system prompt (assert contains "skeptical short seller")
// Test: reviewBearCaseAuthenticity (mock fetchFn returns { score: 4, reasoning: '...' }) → returns score < 7
// Test: bear case retry triggered when authenticity score < 7
// Test: bear case NOT retried when authenticity score >= 7
// Test: bear case allows max 2 total attempts (score < 7 on both → accepted after 2nd attempt anyway)
// Test: reviewBearCaseAuthenticity — strips markdown fences from JSON response before JSON.parse
//   (mock fetchFn returns ```json\n{"score":8}\n``` → parsed correctly)
// Test: all JSON.parse calls on Claude output strip ```json code fences before parsing
```

### Executive Summary

```
// Test: exec summary call receives all 9 completed sections as context (not called before all 9 are done)
// Test: exec summary system prompt instructs Claude to lead with verdict and top insider signal
```

### Cross-Cutting Concern (applies here)

```
// Test (generate-report.js): all section texts are plain strings (not JSON objects) before being
//   passed as context to next section call
```

---

## Background and Motivation

The existing `generate-report.js` sends a single Claude call with a 5000-word prompt and asks for all report sections at once. This has three problems:

1. Claude cannot reason about individual sections when generating everything simultaneously — structure is unpredictable and sections bleed into each other.
2. Per-section word count validation is impossible when the output is a single blob.
3. The bear case is generated with the same helpful analyst persona as the bull case, producing weak, hedged skepticism.

Sequential generation where each call receives the full prior output as context resolves all three. Sections stay on-topic, word counts are enforceable per section, and the bear case can use a completely different persona.

---

## Section Order and Word Targets

Sections are generated in this fixed order. Do not change the order — the investment_thesis synthesizes all earlier sections and must come last among the nine, and exec_summary must be generated after all nine are complete.

| # | Section ID | Word Target | Notes |
|---|------------|-------------|-------|
| 1 | `company_overview` | 600 | Business description, competitive position, key financials overview |
| 2 | `insider_intelligence` | 800 | CORE section. Full insider transaction analysis, cluster detection, historical patterns |
| 3 | `financial_analysis` | 700 | Revenue trends, margin analysis, balance sheet health |
| 4 | `valuation_analysis` | 600 | P/E, EV/EBITDA, DCF summary, relative valuation |
| 5 | `bull_case` | 500 | Three specific catalysts with target prices |
| 6 | `bear_case` | 500 | Adversarial — see bear case section below |
| 7 | `peer_comparison` | 600 | Relative performance vs sector peers |
| 8 | `catalysts_timeline` | 400 | Upcoming events, earnings dates, regulatory milestones |
| 9 | `investment_thesis` | 400 | Synthesizes sections 1-8 into a directional recommendation |
| 10 | `exec_summary` | 400-500 | Generated LAST; receives all 9 sections as context |

---

## New Functions

### `generateReportSection(sectionId, wordTarget, completedSections, data, fetchFn)`

Makes a single Claude call to generate one section. Returns the section text as a plain string.

**Signature stub**:
```js
/**
 * Generate one report section via Claude.
 * @param {string} sectionId - e.g. 'company_overview'
 * @param {number} wordTarget - target word count
 * @param {Array<{id: string, text: string}>} completedSections - all previously generated sections
 * @param {object} data - Dexter research data for this ticker
 * @param {Function} fetchFn - injectable fetch (for testing)
 * @returns {Promise<string>} - plain string section text
 */
async function generateReportSection(sectionId, wordTarget, completedSections, data, fetchFn) { ... }
```

**Context injection format**: The user prompt starts with an XML block containing all prior sections, then states the new section request:

```
<prior_sections>
<section name="company_overview">
[full text of company_overview]
</section>
<section name="insider_intelligence">
[full text of insider_intelligence]
</section>
</prior_sections>

Now write the financial_analysis section. Target: 700 words. Do not repeat content from prior sections.
```

For the first section (`company_overview`), the prior sections block is omitted entirely — no empty XML tags.

**Word count validation**: After generation, count words in the returned text. If the count is outside ±20% of `wordTarget`, retry once with the explicit instruction: "Your previous response was [N] words. The target is [wordTarget] words. Rewrite to hit the target." On the second attempt, return whatever is generated regardless of word count (best effort — do not throw).

**JSON fence stripping**: All `JSON.parse` calls on Claude output must strip markdown code fences first:
```js
text.replace(/```json/g, '').replace(/```/g, '').trim()
```

### `buildSectionSystemPrompt(sectionId)`

Returns the system prompt for a given section ID. This is a pure function — a switch/lookup returning a string. For `bear_case`, this function is never called — bear case has its own adversarial system prompt (see below).

**Signature stub**:
```js
/**
 * Returns the system prompt string for the given section.
 * @param {string} sectionId
 * @returns {string}
 */
function buildSectionSystemPrompt(sectionId) { ... }
```

The returned prompts instruct Claude to write as a professional equity research analyst focused specifically on the section's domain (e.g. for `financial_analysis`: focus on revenue trends, margin analysis, balance sheet health; for `valuation_analysis`: focus on P/E, EV/EBITDA, DCF, relative valuation).

### `reviewBearCaseAuthenticity(bearCaseText, fetchFn)`

Makes a separate Claude call that reads the bear case text and scores it for authenticity.

**Signature stub**:
```js
/**
 * Score the bear case for authenticity using a separate Claude call.
 * @param {string} bearCaseText - the generated bear case section text
 * @param {Function} fetchFn - injectable fetch
 * @returns {Promise<{score: number, reasoning: string}>}
 */
async function reviewBearCaseAuthenticity(bearCaseText, fetchFn) { ... }
```

The reviewer's system prompt instructs Claude to score the bear case 1-10, scoring LOW (below 7) if:
- The case uses generic risks such as "market uncertainty" or "macro headwinds"
- It does not include a specific downside price target
- It does not reference at least one historical precedent where similar insider buying preceded a price decline
- It contains hedging language that weakens the core argument

The response is plain JSON (strip markdown fences before `JSON.parse`):
```json
{ "score": 6, "reasoning": "..." }
```

### `generateExecSummary(allSections, fetchFn)`

Called after all 9 sections complete. Generates a 400-500 word executive summary.

**Signature stub**:
```js
/**
 * Generate the executive summary after all 9 sections are complete.
 * @param {Array<{id: string, text: string}>} allSections - all 9 completed sections
 * @param {Function} fetchFn - injectable fetch
 * @returns {Promise<string>} - exec summary text
 */
async function generateExecSummary(allSections, fetchFn) { ... }
```

The exec summary system prompt instructs Claude to:
- Lead with the key verdict (Buy / Hold / Watch)
- State the top insider transaction signal (who bought, how much, when)
- State the price target range from the investment_thesis section
- Summarize the bull and bear cases in 2-3 sentences each
- Keep the total to 400-500 words

All 9 sections are passed as XML-tagged context in the user message (same format as `generateReportSection`).

---

## Bear Case — Adversarial Generation

The bear case is the only section that does NOT use `buildSectionSystemPrompt()`. Instead, it uses a hardcoded adversarial system prompt:

```
You are a skeptical short seller writing a bear case analysis for [ticker].
Your job is to argue AGAINST buying this stock.

Requirements:
- Identify 3 genuine fundamental risks (NOT "market uncertainty" or "macro headwinds")
- Include 1 bear scenario with a specific downside price target
- Reference at least one historical precedent where similar insider buying preceded a price decline
- Be direct and adversarial — do not hedge or soften the case
```

After generation, call `reviewBearCaseAuthenticity()`. If `score < 7`, regenerate the bear case once more (max 2 total attempts). On the second attempt, accept the result regardless of score — do not loop indefinitely.

The bear case call DOES receive prior sections as XML-tagged context (sections 1-5 are already complete at this point), so the adversarial analysis can reference the bull case arguments to rebut them.

---

## Global Abort Guard

The orchestration loop maintains a `failedSections` counter (integer, starts at 0). A section is counted as failed if `generateReportSection()` throws on both attempts (initial + word-count retry).

- If `failedSections <= 2`: continue with the loop
- If `failedSections > 2` (i.e. 3 or more sections fail): abort immediately and throw with a descriptive error message, e.g.: `"Report generation aborted: 3 sections failed. Failed sections: financial_analysis, valuation_analysis, peer_comparison"`

This prevents a partially degraded report (e.g. 6 of 9 sections) from being saved to NocoDB and delivered to users. The abort triggers the existing NocoDB/Telegram error reporting path.

---

## Data Shapes (for reference in this section and section-05)

These types are used throughout the sequential loop and must be consistent with what section-05 consumes when building the HTML.

**`ReportSection`**:
```js
{ id: string, wordTarget: number, text: string }
```

Sections are accumulated in a `completedSections` array throughout the loop. Each entry is a `ReportSection`. The `text` field is always a plain string — never a JSON object.

**`BearCaseReview`**:
```js
{ score: number, reasoning: string }
```

---

## Orchestration Flow (pseudocode)

This describes the high-level flow the orchestration code should implement:

```
const SECTIONS = [
  { id: 'company_overview', wordTarget: 600 },
  { id: 'insider_intelligence', wordTarget: 800 },
  { id: 'financial_analysis', wordTarget: 700 },
  { id: 'valuation_analysis', wordTarget: 600 },
  { id: 'bull_case', wordTarget: 500 },
  { id: 'bear_case', wordTarget: 500 },   // adversarial prompt
  { id: 'peer_comparison', wordTarget: 600 },
  { id: 'catalysts_timeline', wordTarget: 400 },
  { id: 'investment_thesis', wordTarget: 400 },
]

const completedSections = []
let failedSections = 0

for (const section of SECTIONS) {
  try {
    const text = await generateReportSection(
      section.id, section.wordTarget, completedSections, data, fetchFn
    )
    completedSections.push({ id: section.id, wordTarget: section.wordTarget, text })
  } catch (err) {
    failedSections++
    if (failedSections > 2) {
      throw new Error(`Report generation aborted: ${failedSections} sections failed. ...`)
    }
    // log warning and continue with remaining sections
  }
}

const execSummaryText = await generateExecSummary(completedSections, fetchFn)
completedSections.push({ id: 'exec_summary', wordTarget: 450, text: execSummaryText })
```

The bear case section (`id === 'bear_case'`) is handled inside the loop with a branch: instead of calling `buildSectionSystemPrompt('bear_case')`, it uses the adversarial system prompt and calls `reviewBearCaseAuthenticity()` after generation.

---

## n8n Environment Prerequisite

Sequential 10-call report generation takes longer than the default n8n execution timeout. Add these environment variables to the n8n `.env` before deploying:

```
EXECUTIONS_TIMEOUT=600
EXECUTIONS_TIMEOUT_MAX=900
```

Without these, n8n will kill the execution mid-loop and surface a generic timeout error.

---

## Implementation Checklist

1. Write tests in `n8n/tests/generate-report.test.js` (all stubs listed in "Tests First" above)
2. Add `generateReportSection(sectionId, wordTarget, completedSections, data, fetchFn)` to `generate-report.js`
3. Add `buildSectionSystemPrompt(sectionId)` — switch over section IDs returning focused system prompts
4. Add adversarial bear case system prompt as a module-level constant
5. Add `reviewBearCaseAuthenticity(bearCaseText, fetchFn)` with markdown fence stripping before JSON.parse
6. Add `generateExecSummary(allSections, fetchFn)`
7. Replace the existing single-call generation with the orchestration loop (pseudocode above)
8. Add `failedSections` abort guard
9. Verify all tests pass
10. Add/update `EXECUTIONS_TIMEOUT` and `EXECUTIONS_TIMEOUT_MAX` in the n8n `.env`
