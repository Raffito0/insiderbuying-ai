# Integration Notes: External Review Feedback

## Reviewers
- **Gemini 3 Pro Preview**: 6 actionable suggestions
- **OpenAI o3**: ~15 suggestions across sections

## Integrating (8 items)

### 1. DeepSeek JSON parsing safety (Both reviewers)
**Issue**: DeepSeek often wraps JSON responses in markdown code fences (```json ... ```). Raw `JSON.parse()` will throw.
**Action**: Add JSON sanitization step in ai-client.js response parsing -- strip markdown fences before parsing. Also consider passing `response_format: {type: "json_object"}` for scoring calls.

### 2. Network-level errors in retry (Gemini)
**Issue**: Retry logic only checks HTTP status codes. Network errors (`ECONNRESET`, `ETIMEDOUT`) throw before any response exists, causing `TypeError` when checking status.
**Action**: Wrap `fetchFn` call in try/catch within retry loop. Treat network errors as retryable.

### 3. Tool Use response robustness (Both reviewers)
**Issue**: `data.content.find(c => c.type === 'tool_use')` returns undefined if model refuses the tool call or returns text-only. Reading `.input` will crash.
**Action**: Add null check. If no `tool_use` block found, throw descriptive error with the text content (safety refusal or unexpected response).

### 4. Cache + Tool Use combined support (o3)
**Issue**: `completeToolUse()` has no caching option, but `generate-article.js` needs both Tool Use AND cached system prompt.
**Action**: Add optional `cache` boolean to `completeToolUse()` opts. When true, apply `cache_control` to the request.

### 5. DeepSeek retry config (Gemini)
**Issue**: DeepSeek V3 has current instability issues. 2 retries with 10s max delay may not be enough.
**Action**: Increase DeepSeek defaults: max 3 retries, max delay 30s.

### 6. Explicit timeouts (o3)
**Issue**: `fetchFn` may default to no timeout. A stuck provider call hangs the workflow.
**Action**: Add per-provider timeout config. Claude: 30s. DeepSeek: 60s. Pass timeout option to fetchFn.

### 7. Security: logging discipline (Both reviewers)
**Issue**: Console logging could accidentally include prompts or API keys if someone logs the config object.
**Action**: Cost logging must ONLY log: provider, model, token counts, cost. Never log prompts, API keys, or raw request/response bodies. Add explicit note in plan.

### 8. DeepSeek English-only safeguard (o3)
**Issue**: DeepSeek may respond in Chinese if prompt language detection fails.
**Action**: Note that prompts sent to DeepSeek should include "Respond in English only" as system message or prompt suffix.

## NOT Integrating (7 items)

### 1. "Model names don't exist" (Gemini) -- INCORRECT
Gemini claims `claude-sonnet-4-6-20250514` and `claude-haiku-4-5-20251001` don't exist, suggesting `claude-3-5-sonnet-20241022` instead. **These are outdated model IDs.** The codebase already uses the correct current model names. Gemini's model knowledge is stale.

### 2. "cache_control can't be top-level" (Gemini) -- INCORRECT for automatic mode
Gemini says `cache_control` must be on content blocks, not the root body. This is true for explicit breakpoint mode, but the plan uses **automatic mode** (which IS top-level). However, I'll add a note to verify at implementation time since both approaches are documented.

### 3. Feature flag for provider choice (o3) -- Overengineering
A env var toggle like `AI_PROVIDER_SCORE=deepseek|claude` adds complexity. The abstraction already makes switching a one-line code change. For 3 files, this isn't worth the indirection.

### 4. Circuit breaker (o3) -- Overengineering
At this volume (~100-200 API calls/day), a circuit breaker is unnecessary. Retry with backoff is sufficient.

### 5. Streaming support (o3) -- Not needed
No current or planned file needs streaming. Adding unused parameters increases API surface for no benefit.

### 6. Prometheus metrics (o3) -- Out of scope
Console logging is sufficient per interview decision. Airtable tracking was explicitly declined.

### 7. Pricing in env vars (o3) -- Over-rotating
Prices change maybe once a year. Hard-coded constants with a comment are fine. If prices change, update the constants in one file.

## Noted but not actionable now

### Cache cost economics (Gemini)
Valid point: if articles are generated >5 min apart, cache writes (1.25x) cost MORE than uncached (1.0x). This depends on actual n8n trigger frequency. The plan should note this and recommend monitoring cache hit rate after deployment. If hit rate is <50%, disable caching.

### DeepSeek prose verbosity (o3)
DeepSeek may be more verbose than Claude for analyze-alert.js. Worth monitoring after deployment but not a plan change -- `max_tokens` already limits output length.
