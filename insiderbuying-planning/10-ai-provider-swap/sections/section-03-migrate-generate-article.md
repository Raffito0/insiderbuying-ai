# Section 03: Migrate generate-article.js to Claude Client

## Overview

This section replaces the direct Anthropic API call in `generate-article.js` with the shared `AIClient` abstraction from `ai-client.js`. The migration targets the `callClaudeToolUse()` function (lines ~752-782), which currently makes a raw `fetchFn` POST to `https://api.anthropic.com/v1/messages` with Tool Use parameters. After migration, this function is removed and all Claude interaction goes through `client.completeToolUse()` with prompt caching enabled.

**Provider stays Claude** -- this is NOT a provider switch. `generate-article.js` uses Claude Sonnet 4 with Tool Use for structured article output. The migration adds prompt caching for cost savings and removes duplicated HTTP/retry/header logic.

## Dependencies

- **Section 01** (`ai-client.js`) must be complete -- provides `createClaudeClient` and the `AIClient` class
- **Section 02** (`ai-client.test.js`) must be complete -- validates `completeToolUse()` and caching work correctly

## File Paths

- **Modified**: `n8n/code/insiderbuying/generate-article.js`
- **Modified or created**: `tests/insiderbuying/generate-article.test.js`
- **Read-only dependency**: `n8n/code/insiderbuying/ai-client.js` (from Section 01)

## Current State

### `callClaudeToolUse()` (lines 752-782)

This function:
1. Accepts `systemPrompt` and an `opts` object (`{ fetchFn, apiKey, maxTokens }`)
2. Calls `buildToolSchema()` to get the `generate_article` tool definition
3. Makes a direct `fetchFn` POST to `https://api.anthropic.com/v1/messages` with hardcoded headers (`x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`)
4. Sends body with `model: 'claude-sonnet-4-6-20250514'`, `temperature: 0.6`, `system` (separate field), `messages`, `tools`, `tool_choice: { type: 'tool', name: 'generate_article' }`
5. Throws on non-OK response
6. Returns the raw JSON response

### `extractToolResult()` (lines 179-184)

Parses the raw Claude response to find the `tool_use` content block:
```javascript
function extractToolResult(response) {
  if (!response || !response.content || response.content.length === 0) return null;
  const block = response.content.find((c) => c.type === 'tool_use');
  if (!block) return null;
  return block.input || null;
}
```

### Main generation loop (lines ~1012-1028)

```javascript
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = attempt === 0
      ? systemPrompt
      : `${systemPrompt}\n\nQuality gate failed: ${retryFeedback}. Fix these issues.`;

    const response = await callClaudeToolUse(prompt, {
      fetchFn,
      apiKey: env.ANTHROPIC_API_KEY,
      maxTokens: params.maxTokens,
    });

    article = extractToolResult(response);
    if (!article) {
      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
      return { status: 'skipped', reason: 'Claude safety refusal' };
    }
    // ... quality gate checks follow
}
```

### What the module exports

`callClaudeToolUse` and `extractToolResult` are both in `module.exports`. Any test or external code importing them needs updating.

## Tests (Write These First)

Tests go in `tests/insiderbuying/generate-article.test.js`. If this file already exists, add/modify the relevant test cases. If not, create it.

### Mocking approach

Instead of mocking `fetchFn` to return raw Claude-format HTTP responses, mock `createClaudeClient` to return a fake `AIClient` with a jest-mocked `completeToolUse` method.

```javascript
// Mock setup pattern
jest.mock('../../n8n/code/insiderbuying/ai-client', () => ({
  createClaudeClient: jest.fn(() => ({
    completeToolUse: jest.fn(),
    completeWithCache: jest.fn(),
    complete: jest.fn(),
  })),
}));
```

### Test: generateArticle calls client.completeToolUse (not direct fetchFn)

Verify that `generateArticle()` invokes `client.completeToolUse()` during execution. The mock should return a successful result with `toolResult` containing a valid article object. Assert that `completeToolUse` was called at least once. Assert that `fetchFn` was NOT called with any URL containing `anthropic.com`.

### Test: completeToolUse receives correct arguments

Verify the call passes:
- The system prompt (string) as first argument
- `'Generate the article now.'` as the user prompt (second argument)
- The tool schema from `buildToolSchema()` as tools array (third argument)
- `{ type: 'tool', name: 'generate_article' }` as tool_choice (fourth argument)
- Options object with `temperature: 0.6`, `cache: true`, and the correct `maxTokens` (fifth argument)

### Test: result.toolResult used for article extraction

Verify that when `completeToolUse` returns `{ toolResult: { title: '...', body_html: '...', ... }, content: null }`, the article variable receives the `toolResult` value directly. No separate `extractToolResult()` parsing should occur.

### Test: cache: true is passed in opts

Verify that every call to `completeToolUse` includes `cache: true` in the options argument. This enables prompt caching on the ~3K token system prompt.

### Test: temperature 0.6 override is passed

Verify that `temperature: 0.6` is in the options. The factory default for Claude is 0.7, but article generation needs 0.6 for more consistent structured output.

### Test: quality gate retry still works with ai-client response format

Simulate a quality gate failure followed by a pass:
1. First `completeToolUse` call returns an article with a failing quality gate (e.g., word count too low)
2. Second call returns a passing article
3. Verify `completeToolUse` was called twice
4. Verify the second call's system prompt includes the quality gate failure feedback

### Test: safety refusal handling (toolResult is null)

When `completeToolUse` throws an error indicating no `tool_use` block (safety refusal), verify that `generateArticle` catches this and returns `{ status: 'skipped', reason: 'Claude safety refusal' }` after marking the keyword as skipped.

### Test: no direct API references remain

Grep the modified `generate-article.js` source for:
- `anthropic.com` -- should not appear
- `x-api-key` -- should not appear
- `anthropic-version` -- should not appear
- Direct `fetchFn` calls to any AI API URL -- should not appear

These can be simple string-search assertions on the file content, or just a manual verification note.

## Implementation Details

### Step 1: Add import

At the top of `generate-article.js`, add:

```javascript
const { createClaudeClient } = require('./ai-client');
```

### Step 2: Create client in generateArticle()

Inside the `generateArticle()` main function (not at module level, because `fetchFn` and `env` are only available at call time), create the client:

```javascript
const claude = createClaudeClient(fetchFn, env.ANTHROPIC_API_KEY);
```

### Step 3: Replace callClaudeToolUse usage in the generation loop

Replace:
```javascript
const response = await callClaudeToolUse(prompt, {
  fetchFn,
  apiKey: env.ANTHROPIC_API_KEY,
  maxTokens: params.maxTokens,
});

article = extractToolResult(response);
if (!article) {
  await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
  return { status: 'skipped', reason: 'Claude safety refusal' };
}
```

With:
```javascript
let result;
try {
  result = await claude.completeToolUse(
    prompt,                                          // system prompt
    'Generate the article now.',                     // user prompt
    [buildToolSchema()],                             // tools
    { type: 'tool', name: 'generate_article' },      // tool_choice
    {
      temperature: 0.6,
      model: 'claude-sonnet-4-6-20250514',
      maxTokens: params.maxTokens,
      cache: true,
    }
  );
} catch (err) {
  // completeToolUse throws on safety refusal (no tool_use block)
  console.log(`[generate-article] Claude refusal or error: ${err.message}`);
  await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
  return { status: 'skipped', reason: 'Claude safety refusal' };
}

article = result.toolResult;
if (!article) {
  await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
  return { status: 'skipped', reason: 'Claude safety refusal' };
}
```

Key differences from the old code:
- `completeToolUse` handles HTTP request formatting, headers, retry with backoff, and response parsing internally
- `result.toolResult` replaces `extractToolResult(response)` -- the ai-client already extracts the `tool_use` block
- `cache: true` enables prompt caching on the system prompt (the `ARTICLE_SYSTEM_PROMPT` is ~3K tokens, reused across articles)
- Safety refusals (no `tool_use` block in response) now throw from ai-client with a descriptive error, so wrap in try/catch

### Step 4: Remove callClaudeToolUse function

Delete the entire `callClaudeToolUse` function (lines 752-782). This includes:
- The function body with direct `fetchFn` call to `https://api.anthropic.com/v1/messages`
- All hardcoded headers (`x-api-key`, `anthropic-version`)
- The manual error handling (`if (!res.ok)`)

### Step 5: Remove or deprecate extractToolResult

The `extractToolResult` function is no longer needed for the main flow since `ai-client.completeToolUse()` returns `toolResult` directly. However, check if any other code imports it:
- If nothing else uses it, remove it entirely
- If other code imports it (check `module.exports` and grep for `extractToolResult` across the codebase), keep it but add a deprecation comment

The function is currently exported in `module.exports`. Remove it from exports if deleting.

### Step 6: Update module.exports

Remove from exports:
- `callClaudeToolUse` (deleted)
- `extractToolResult` (deleted, unless used elsewhere)

Do NOT change exports for any other function. All pure functions (`qualityGate`, `seoScore`, `sanitizeHtml`, etc.) and all business logic remain untouched.

### Step 7: Preserve everything else exactly as-is

The following must NOT change:
- `buildToolSchema()` -- same tool definition, passed to `completeToolUse`
- `ARTICLE_SYSTEM_PROMPT` interpolation -- same template, same variables
- Quality gate logic (14 checks + SEO + AI detection)
- The retry loop structure (quality gate retry, not HTTP retry -- HTTP retry is now in ai-client)
- `sanitizeHtml()`, `ensureUniqueSlug()`, `writeArticle()`, `triggerDownstream()`
- All NocoDB interactions
- All Telegram notifications
- All prompt text

## Caching Opportunity and Warning

The `ARTICLE_SYSTEM_PROMPT` template is approximately 3K tokens after variable interpolation. With Claude prompt caching:
- **First call** in a 5-minute window: 1.25x input cost ($3.75/1M) for cache write
- **Subsequent calls** within 5 minutes: 0.1x input cost ($0.30/1M) for cache read

**When caching helps**: Batch article generation (multiple articles triggered close together). The quality gate retry loop also benefits -- if the first attempt fails the gate, the retry call within seconds gets a cache hit on the system prompt.

**When caching hurts**: If articles are generated individually, spread more than 5 minutes apart (e.g., one per webhook throughout the day), every call pays 25% MORE for the cache write with zero cache hits. After deployment, monitor the `cached: true/false` field in cost logs. If hit rate is consistently below 50%, change `cache: true` to `cache: false` in the opts to save 25% on input costs.

## Verification Checklist

After implementation:
- [ ] `generate-article.js` has no `anthropic.com` URL
- [ ] `generate-article.js` has no `x-api-key` or `anthropic-version` header
- [ ] `generate-article.js` imports `createClaudeClient` from `./ai-client`
- [ ] `callClaudeToolUse` function is deleted
- [ ] `extractToolResult` is deleted (or deprecated if used elsewhere)
- [ ] `module.exports` is updated (removed deleted functions)
- [ ] Quality gate retry loop still works (retry is for quality, not HTTP errors)
- [ ] `cache: true` is passed to `completeToolUse`
- [ ] `temperature: 0.6` is passed to `completeToolUse`
- [ ] `buildToolSchema()` result is passed as the tools argument
- [ ] All tests pass
- [ ] No prompt text was modified
- [ ] No business logic was modified
