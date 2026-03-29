# Section 04: Migrate score-alert.js to DeepSeek Client

## Overview

This section migrates `score-alert.js` from making direct Anthropic API calls (Claude Haiku) to using the shared `createDeepSeekClient()` abstraction from `ai-client.js`. The scoring task (rate an SEC filing 1-10) is a data-driven evaluation that does not require Claude-tier reasoning, making DeepSeek V3.2 a cost-effective replacement at $0.27/1M input tokens vs $3/1M for Claude.

The migration touches one source file and one test file. All prompt text and business logic remain unchanged -- only the API transport layer changes.

## Dependencies

- **Section 01** (ai-client.js) must be implemented -- provides `createDeepSeekClient` factory function
- **Section 02** (ai-client.test.js) must pass -- validates the abstraction layer before depending on it
- `env.DEEPSEEK_API_KEY` must be available in the n8n environment (added to `validateEnv()` in this section)

## Files Modified

| File | Action |
|------|--------|
| `n8n/code/insiderbuying/score-alert.js` | Replace `callHaiku()` with DeepSeek client calls |
| `tests/insiderbuying/score-alert.test.js` | Update mocks from fetchFn/Claude format to ai-client/DeepSeek format |
| `n8n/code/insiderbuying/e2e-monitoring.js` | Add `DEEPSEEK_API_KEY` to `validateEnv()` required list |

## Tests (Write These First)

All tests go in the existing `tests/insiderbuying/score-alert.test.js` (466 lines currently). Update existing tests and add new ones as described below.

### Provider switch tests

```javascript
// Test: runScoreAlert() calls DeepSeek client, not Claude/Haiku
// Mock createDeepSeekClient to return a mock client with jest.fn() complete()
// Call runScoreAlert() and verify mock client.complete() was called

// Test: runScoreAlert() uses env.DEEPSEEK_API_KEY (not ANTHROPIC)
// Verify createDeepSeekClient is called with fetchFn and env.DEEPSEEK_API_KEY

// Test: response JSON parsing handles markdown-fenced JSON from DeepSeek
// Mock client.complete() to return { content: '```json\n{"score": 8, "reasoning": "Strong insider buy"}\n```' }
// Verify the result has score: 8 after sanitization

// Test: buildHaikuPrompt() output is unchanged (prompt preservation)
// Snapshot or inline-compare the prompt output -- must match pre-migration output exactly
```

### Safe default tests

```javascript
// Test: AI client error -> returns HAIKU_DEFAULT (score 5, generic reasoning)
// Mock client.complete() to throw Error('API failure')
// Verify runScoreAlert() returns HAIKU_DEFAULT, does NOT throw

// Test: JSON parse failure -> returns HAIKU_DEFAULT
// Mock client.complete() to return { content: 'not valid json at all' }
// Verify runScoreAlert() returns HAIKU_DEFAULT

// Test: network error -> returns HAIKU_DEFAULT
// Mock client.complete() to throw Error('ECONNRESET')
// Verify runScoreAlert() returns HAIKU_DEFAULT
```

### No retry duplication test

```javascript
// Test: score-alert.js does NOT have its own retry loop (delegated to ai-client)
// Read score-alert.js source, verify no retry/backoff/attempt loop logic
// Or: verify client.complete() is called exactly once per runScoreAlert() call
// (ai-client handles retries internally -- score-alert should not re-wrap)
```

### No direct API calls tests

```javascript
// Test: no direct fetchFn call to anthropic.com in score-alert.js
// Read the source file and verify it contains no 'anthropic.com' string

// Test: no claude-haiku or claude-3 model strings in score-alert.js
// Read the source file and verify it contains no 'claude-haiku' or 'claude-3' strings
```

### Mocking approach

The existing test file mocks `fetchFn` to return Claude-format responses (`content[0].text`). After migration, tests should mock at the `ai-client` level instead:

```javascript
// Before (old pattern):
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    content: [{ text: '{"score": 7, "reasoning": "..."}' }],
    usage: { input_tokens: 100, output_tokens: 50 }
  })
});

// After (new pattern):
jest.mock('./ai-client', () => ({
  createDeepSeekClient: jest.fn(() => ({
    complete: jest.fn().mockResolvedValue({
      content: '{"score": 7, "reasoning": "..."}',
      toolResult: null,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cached: false,
      estimatedCost: 0.0001
    })
  }))
}));
```

Adjust the mock module path based on the actual require path used in `score-alert.js`.

## Implementation

### Step 1: Add DeepSeek client to score-alert.js

At the top of `score-alert.js`, add the import and client creation:

```javascript
const { createDeepSeekClient } = require('./ai-client');
```

The client instance should be created inside the main exported function (where `fetchFn` and `env` are available), not at module level:

```javascript
const deepseek = createDeepSeekClient(fetchFn, env.DEEPSEEK_API_KEY);
```

### Step 2: Replace callHaiku() body

The existing `callHaiku()` function (lines ~253-290) makes a direct `fetchFn` call to the Anthropic API with model `claude-haiku-4-5-20251001`, has a 3-attempt retry loop with linear backoff, and parses the Claude response format.

Replace the entire function body with:

```javascript
async function callHaiku(prompt) {
  const result = await deepseek.complete(null, prompt, { temperature: 0.3 });
  return sanitizeAndParseJSON(result.content);
}
```

Notes on the replacement:
- System prompt is `null` because `buildHaikuPrompt()` puts everything in a single user prompt
- Temperature 0.3 matches DeepSeek's factory default but is explicit for clarity
- The `deepseek` client variable must be in scope (created in the parent function)

### Step 3: Add JSON sanitization for DeepSeek responses

DeepSeek frequently wraps JSON responses in markdown code fences (` ```json ... ``` `), even when the prompt says "Return ONLY JSON". Add a sanitizer function:

```javascript
function sanitizeAndParseJSON(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}
```

This is critical -- without it, `JSON.parse()` will throw on fenced responses, causing every scoring call to fall back to `HAIKU_DEFAULT`.

Alternative approach: pass `response_format: { type: "json_object" }` in the request opts. This forces DeepSeek to return raw JSON without fences. However, it requires the word "json" to appear in the prompt text. `buildHaikuPrompt()` already says "Return ONLY JSON", so this works. Both approaches are valid; the sanitizer is more defensive and handles edge cases where `response_format` is not respected.

### Step 4: Preserve HAIKU_DEFAULT fallback

The existing `HAIKU_DEFAULT` object (something like `{ score: 5, reasoning: "Unable to score" }`) must be preserved as the catch-all fallback. Wrap the scoring call:

```javascript
try {
  const result = await callHaiku(prompt);
  // Validate score is 1-10 integer
  if (!result || typeof result.score !== 'number' || result.score < 1 || result.score > 10) {
    return HAIKU_DEFAULT;
  }
  return result;
} catch (err) {
  console.log(`[score-alert] scoring failed, using defaults: ${err.message}`);
  return HAIKU_DEFAULT;
}
```

This is the existing error handling pattern -- keep it exactly as-is. The `ai-client` retry logic will handle transient failures internally. If all retries are exhausted, the error propagates up to this catch block, which returns safe defaults instead of crashing the pipeline.

### Step 5: Remove old retry loop and Anthropic references

Delete from `score-alert.js`:
- The old 3-attempt retry loop with linear backoff inside `callHaiku()`
- Any direct `fetchFn` calls to `api.anthropic.com`
- Any `x-api-key`, `anthropic-version` headers
- Any `claude-haiku-4-5-20251001` or other Claude model string references
- Any Anthropic URL constants

Do NOT delete:
- `buildHaikuPrompt()` -- the prompt builder stays unchanged
- `HAIKU_DEFAULT` -- the safe default object stays
- Score validation logic (1-10 range check)
- Any business logic that processes the score after it's returned

### Step 6: Add DEEPSEEK_API_KEY to validateEnv()

In `n8n/code/insiderbuying/e2e-monitoring.js`, find the `validateEnv()` function and add `DEEPSEEK_API_KEY` to its required environment variables list. This ensures deployment fails fast with a clear error message if the key is missing, rather than failing silently on the first scoring call.

### Prompt preservation note

`buildHaikuPrompt(filing, trackRecord)` remains completely unchanged. It constructs a prompt that asks the model to evaluate an SEC insider filing and return `{ score: 1-10, reasoning: string }` as JSON. This prompt works identically with DeepSeek -- the model change is transparent to the prompt layer.

## Risk mitigation

**DeepSeek quality is untested for this scoring task.** The migration is based on cost projection ($0.27/1M vs $3/1M input tokens), not quality validation. The abstraction makes switching back trivial:

To roll back to Claude, change two things:
1. `createDeepSeekClient(fetchFn, env.DEEPSEEK_API_KEY)` becomes `createClaudeClient(fetchFn, env.ANTHROPIC_API_KEY)`
2. The JSON sanitizer can stay (harmless) or be removed

**Recommended post-deployment check**: Monitor the first ~50 scored filings after deployment. Compare score distribution to historical Claude Haiku scores. If DeepSeek scores cluster differently (e.g., all 7-8 when Haiku gave 3-9 spread), the model may not be discriminating well enough, and a rollback is warranted.

**DeepSeek language risk**: DeepSeek can occasionally respond in Chinese. The `buildHaikuPrompt()` prompt is in English and asks for JSON, which typically prevents this. If Chinese responses occur, add "Respond in English only." to the system message (pass as first arg to `client.complete()` instead of `null`).

## Verification checklist

After implementation, verify:

- [ ] `npm test` passes (all score-alert tests green)
- [ ] No `anthropic.com` string anywhere in `score-alert.js`
- [ ] No `claude-haiku` or `claude-3` model strings in `score-alert.js`
- [ ] `DEEPSEEK_API_KEY` appears in `validateEnv()` in `e2e-monitoring.js`
- [ ] `buildHaikuPrompt()` output is byte-identical to pre-migration
- [ ] `HAIKU_DEFAULT` fallback still works on API errors
- [ ] JSON parsing handles both raw JSON and markdown-fenced JSON responses
- [ ] No retry/backoff logic remains in `score-alert.js` (delegated to ai-client)
- [ ] Cost log line appears in console showing DeepSeek provider and token counts
