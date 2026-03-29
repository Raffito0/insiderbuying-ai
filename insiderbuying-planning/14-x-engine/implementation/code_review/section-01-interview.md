# Code Review Interview — Section 01: ai-client.js functional API

## Review Findings Triage

All findings auto-fixed or let go — no user decisions needed.

### Auto-Fixes Applied

**Fix 1: `content[0].text` crashes on empty content array**
- Finding: `resData.content[0].text` throws TypeError if Anthropic returns `content: []` or missing (can happen on content policy stops)
- Fix: Changed to `resData.content && resData.content.find(b => b.type === 'text')` pattern matching AIClient class

**Fix 2: `parseInt` NaN on HTTP-date Retry-After header**
- Finding: HTTP-date format `Retry-After` (e.g. "Wed, 30 Mar 2026") → `parseInt` returns NaN → `sleep(NaN)` → delay silently skipped
- Fix: Added explicit `!isNaN(retryAfterMs)` check; falls back to `_RETRY_DELAYS[attempt - 1]` on NaN. Applied to both `claude()` and `deepseek()`.

### Items Let Go

- `deepseek()` no `systemPrompt` path: by spec design — "caller incorporates system context into prompt for DeepSeek"
- Model name `claude-haiku-20240307`: spec explicitly specifies this exact ID
- Empty string `systemPrompt` silently dropped by `if (opts.systemPrompt)`: edge case, not a real caller scenario for this unit

## Final Test Results

17/17 passing after all fixes.
