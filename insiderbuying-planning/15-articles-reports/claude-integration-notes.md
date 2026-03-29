# Integration Notes — External LLM Review

Reviews received from: o3 (OpenAI) and Gemini 3 Pro Preview.

---

## Changes Integrated

### 1. WeasyPrint Architecture — Move to Screenshot Server (CRITICAL — Gemini)

**Original plan**: Use `node-weasyprint` npm package to call WeasyPrint from inside the n8n Code node via `child_process.spawn`.

**Why it's wrong**: n8n Code nodes run in a restricted sandbox that blocks `child_process.spawn`. Installing Python on the host VPS doesn't help — the n8n Docker container has no access to host binaries. `node-weasyprint` would throw immediately in production.

**Fix integrated**: WeasyPrint is NOT called from the n8n Code node. Instead, WeasyPrint is installed inside the screenshot server container (the server already running at `host.docker.internal:3456`). The screenshot server gains a new `/weasyprint` HTTP endpoint that accepts an HTML string and returns a PDF binary. The n8n Code node calls this endpoint via `fetch`, exactly as it calls the existing `/pdf` endpoint.

This removes `node-weasyprint` from the npm dependencies. WeasyPrint's Python/system libs are installed in the screenshot server's Dockerfile, not the n8n container.

---

### 2. Lead Magnet max_tokens Limit (CRITICAL — Gemini)

**Original plan**: `max_tokens: 6000` for lead magnet generation.

**Why it's wrong**: The Anthropic API's standard output limit is 4096 tokens. Passing 6000 returns a 400 Bad Request.

**Fix integrated**: Use the extended output beta header (`anthropic-beta: max-tokens-3-5-sonnet-2024-07-15`) and set `max_tokens: 8192`. This header unlocks 8K output tokens. Target 4000-4500 words (not 5000) to ensure the request completes cleanly without truncation risk. The plan is updated to note the beta header and the adjusted word target.

---

### 3. n8n Execution Timeout (CRITICAL — Gemini)

**Original plan**: No mention of n8n workflow timeout configuration.

**Why it's wrong**: Sequential report generation (10 Claude calls + 5 charts + WeasyPrint PDF) can take 3-5 minutes. n8n's default execution timeout is insufficient.

**Fix integrated**: Document in the "VPS One-Time Setup" section that `EXECUTIONS_TIMEOUT=600` and `EXECUTIONS_TIMEOUT_MAX=900` must be set in the n8n `.env`. This is a one-time infrastructure configuration.

---

### 4. PDF Preview Out-of-Bounds (Both Reviewers)

**Fix integrated**: `generatePreviewPDF` now uses `Math.min(sourceDoc.getPageCount(), 5)` before building the page index array. This prevents a crash when a report generates fewer than 5 pages.

---

### 5. Promise.allSettled for Chart Generation (o3)

**Fix integrated**: Chart generation uses `Promise.allSettled` instead of `Promise.all`. A failed chart logs a warning and substitutes a placeholder `<div>`, rather than rejecting the entire array. The plan already mentioned the graceful fallback — now the correct Promise combinator is specified.

---

### 6. Separate Retry Budgets for Outline vs Draft (Gemini)

**Fix integrated**: Outline generation gets its own 1-retry budget, independent of the 2-retry budget for draft quality gate. If the outline fails validation once and retries, the draft still has its full 2 attempts. The outline retry passes the specific validation error list as "Regenerate outline fixing: [errors]" — not just another generic generation request.

---

### 7. Freshness Check — Propagate effectiveArticleType (o3)

**Fix integrated**: `checkContentFreshness` returns `{ fresh: boolean, effectiveArticleType: string, lastPublished?: string }`. When not fresh, `effectiveArticleType` is set to the alternate angle (e.g. 'contrarian' or 'sector'). This value is propagated through the entire pipeline (slug generation, CTA copy, SEO keyword selection, tags) so there's no mismatch between metadata and content angle.

---

### 8. Sentence CV Guard (o3)

**Fix integrated**: `computeSentenceCV` returns null (not a failing score) when the sentence count is ≤1. The quality gate skips the CV check in that case rather than failing articles with very short content.

---

### 9. Abbreviation Syllable Override — Lowercase Normalization (o3)

**Fix integrated**: `countSyllablesInline(word)` normalizes the word to uppercase before lookup in the abbreviation override map. This catches mixed-case variants like "Ceo" or "etf".

---

### 10. JSON.parse Sanitization for Claude Outputs (Gemini)

**Fix integrated**: All `JSON.parse(claudeText)` calls pass through a sanitizer that strips markdown code fences before parsing: `text.replace(/```json/g, '').replace(/```/g, '').trim()`. Applied to outline parsing (Section 1.2), bear case review parsing (Section 4), and any other structured Claude output.

---

### 11. Image Embedding as Data URIs for WeasyPrint (o3 + Gemini)

**Fix integrated**: When building HTML for WeasyPrint PDF generation, `buildReportHTML()` converts chart images to base64 data URIs instead of R2 HTTPS URLs. This prevents WeasyPrint from making synchronous outbound network calls during PDF render (which adds latency and would fail if R2 is temporarily unavailable). The conversion: `Buffer.from(chartBuffer).toString('base64')` → inject as `src="data:image/png;base64,{base64}"`.

---

### 12. FK Ease Range Loosened to 25-55 (Gemini)

**Fix integrated**: The quality gate FK Ease check uses range 25-55 instead of 30-50. The inline regex syllable counter has inherent ±10% inaccuracy. A fixed range of 30-50 would create false failures on valid finance content. 25-55 accounts for syllable counter error margin while still enforcing readability.

---

### 13. Losers Section — Structured Extraction with ID Tag (Gemini)

**Fix integrated**: The lead magnet narrative prompt explicitly instructs Claude to wrap the losers section in `<div id="losers-section">...</div>`. The `verifyLosersLength()` function extracts the inner text of this element rather than using fragile heading-based heuristics.

---

### 14. Global Abort Guard for Sequential Report Generation (o3)

**Fix integrated**: The sequential generation loop has a `maxFailedSections` guard (default 2). If more than 2 sections fail after their individual retries, the orchestrator aborts with a clear error rather than continuing in a degraded state.

---

## Not Integrated (with reasoning)

### Prompt injection from NocoDB (o3)
The existing codebase already has robust input sanitization in `blog-helpers.js` (ticker: alphanumeric max 5 chars; company name: strip angle brackets). The tools for this already exist and are in production. Redundant escaping is not added to the plan — the implementer should verify these sanitizers are applied in the new code paths.

### validateLinks for internal link checker (o3)
Building a crawler or slug dictionary is out of scope for this plan. The internal links ≥4 check is a heuristic for content guidance, not a broken-link validator. The check remains as-is.

### NocoDB Docker Dockerfile updates (o3)
Infrastructure Dockerfile changes are outside the scope of these three JS files. This is a deployment concern noted in the plan but not specced here.

### Cost meter / LIGHT_MODE toggle (o3)
Not added — the user's explicit requirement is for the upgraded quality. A cost toggle would add complexity without clear value for a low-volume publishing system.

### Legal disclaimer / SEC disclaimers (o3)
These exist in the current `buildReportHTML()` already ("past performance disclaimer"). The plan notes they should be present but doesn't redocument existing text.

### Array.from syllable shared util (o3)
Syllable counter is per-file inline by user request (avoids ESM/module complexity). Duplication acceptable at this scale.

### Lead magnet switching to sequential generation (Gemini)
User explicitly chose single call with higher token budget. The beta header + 8192 max_tokens solves the hard limit issue while honoring the user's preference.
