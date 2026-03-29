<!-- PROJECT_CONFIG
runtime: node
test_command: node --test n8n/tests/ai-client.test.js n8n/tests/x-engagement.test.js n8n/tests/x-auto-post.test.js
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-ai-client
section-02-data-enrichment
section-03-archetype-system
section-04-validation-caps-timing
section-05-media-attachment
section-06-format-rotation
section-07-qrt-scheduling
END_MANIFEST -->

# Implementation Sections Index: 14-x-engine

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-ai-client | — | 03, 05, 06 | Yes |
| section-02-data-enrichment | — | 03, 05 | Yes |
| section-03-archetype-system | 01, 02 | — | No |
| section-04-validation-caps-timing | — | — | Yes |
| section-05-media-attachment | 01, 02 | — | No |
| section-06-format-rotation | 01 | — | No |
| section-07-qrt-scheduling | — | — | Yes |

## Execution Order

1. **Batch 1** (parallel): section-01, section-02, section-04, section-07 — all independent
2. **Batch 2** (parallel): section-03, section-05, section-06 — after Batch 1

## Section Summaries

### section-01-ai-client
New file `n8n/code/insiderbuying/ai-client.js`. Exports `claude(prompt, opts, helpers)` and `deepseek(prompt, opts, helpers)`. Exponential backoff retry (max 3 attempts, 2s/4s/8s). Catches `status >= 500` and 429. Default `maxTokens` per call type. New test file `n8n/tests/ai-client.test.js` with fixture-based tests using mock `fetchFn`.

### section-02-data-enrichment
Adds `extractTicker(tweetText)` and `buildFilingContext(tweet, filings)` to `x-engagement.js`. Regex `\$[A-Z]{1,6}(?:\.[A-Z]{1,2})?` handles `$BRK.B` style tickers. `clusterCount` capped at 3. Returns null when no ticker or no matching filings. Tests in `x-engagement.test.js`.

### section-03-archetype-system
Adds `REPLY_ARCHETYPES` config, `selectArchetype(currentCounts)`, `buildReplyPrompt(archetype, tweet, filingContext, helpers)`, and `ACCOUNT_TONE_MAP` to `x-engagement.js`. Weighted random (40/30/30). Tweet text wrapped in `"""..."""` delimiters in prompt (prompt injection guard). Calls `ai-client.js` `claude()`. Tests: archetype distribution (1000 iterations, ±8%), boundary tests with mocked `Math.random`, prompt injection guard verification.

### section-04-validation-caps-timing
Adds `validateReply(text)`, `checkDailyReplyCap(logEntries)`, `buildTimingDelay()`, `buildEngagementSequence(originalTweetId)` to `x-engagement.js`. `validateReply`: 150–220 chars, ≤2 emojis, no URLs (`.com/` suffix check), `$CASHTAG` required, AI refusal phrase check. `buildEngagementSequence` returns array of 1 (like original tweet only). Tests: all validation edge cases, cap at 14/15, timing range.

### section-05-media-attachment
Adds `maybeAttachMedia(filingContext, helpers)` and `uploadMediaToX(buffer, helpers)` to `x-engagement.js`. `require('./visual-templates')` wrapped in try/catch. Upload failures caught and return null (text-only fallback). OAuth 1.0a multipart payload builder. Tests: missing module returns null, upload error returns null, payload structure verification.

### section-06-format-rotation
Adds `POST_FORMATS` config, `selectNextFormat(lastUsedFormat)`, `buildBreakingAlert`, `buildThread`, `buildCommentary`, `buildPoll`, `validatePoll` to `x-auto-post.js`. Removes `generateArticleTweet`, `generateAlertTweet`. Updates `MAX_DAILY_POSTS = 4`. `buildThread` validates all 3 tweets internally (retries once, returns null on failure). `validatePoll`: 2–4 options, each ≤25 chars. Tests: selectNextFormat never repeats, thread null on invalid content, poll validation edge cases.

### section-07-qrt-scheduling
Adds `buildQuoteRetweetJob(tweetId, ticker, priceAtPurchase)`, `buildQuoteRetweetText(ticker, priceAtBuy, currentPrice)`, `buildLinkValidation(text)`, `postToXWithMedia(text, mediaId)` to `x-auto-post.js`. `X_Scheduled_Jobs` record includes `priceAtPurchase` as number and `status` with full enum (pending/processing/done/skipped/expired). `buildLinkValidation` rejects `.com/` not bare "dot-com". Tests: QRT job field shapes, percentage calculation edge cases, link validation patterns.
