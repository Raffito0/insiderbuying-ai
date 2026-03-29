<!-- PROJECT_CONFIG
runtime: nodejs-commonjs
test_command: node --test n8n/tests/reddit-monitor.test.js
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-00-prerequisites
section-01-auth-tone-map
section-02-rotation-validation
section-03-cap-timing-jobs
section-04-cat5-daily-thread
section-05-cat6-dd-posts
section-06-anti-ai-detection
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-00-prerequisites | — | 01-06 | Yes (first) |
| section-01-auth-tone-map | 00 | 02-06 | No |
| section-02-rotation-validation | 01 | 03 | No |
| section-03-cap-timing-jobs | 01, 02 | 04, 05 | No |
| section-04-cat5-daily-thread | 00, 01, 03 | — | Yes (after 03) |
| section-05-cat6-dd-posts | 00, 01, 03 | — | Yes (after 03) |
| section-06-anti-ai-detection | 01, 02, 03 | — | No (last) |

## Execution Order

1. **section-00-prerequisites** — infrastructure only, no deps
2. **section-01-auth-tone-map** — foundation for all subsequent sections
3. **section-02-rotation-validation** — builds on section-01
4. **section-03-cap-timing-jobs** — builds on section-01 and section-02
5. **section-04-cat5-daily-thread** and **section-05-cat6-dd-posts** — can run in parallel after section-03
6. **section-06-anti-ai-detection** — applied last, touches prompts across all sections

Practical batches:
- **Batch 1**: section-00
- **Batch 2**: section-01
- **Batch 3**: section-02
- **Batch 4**: section-03
- **Batch 5** (parallel): section-04, section-05
- **Batch 6**: section-06

## Section Summaries

### section-00-prerequisites
Create 3 NocoDB tables (Reddit_State, Scheduled_Jobs, Reddit_DD_Posts) with required indexes. Create `n8n/code/insiderbuying/visual-templates.js` with 3 stub functions returning null. No unit tests for the NocoDB tables (infrastructure); 4 unit tests for the visual stubs. This is the only section with no code in `reddit-monitor.js`.

### section-01-auth-tone-map
Add `SUBREDDIT_TONE_MAP` constant (5 subs, daily caps summing to 10), `getRedditToken()` (dual-mode: refresh token flow primary, ROPC fallback; NocoDB token persistence), `getState()` / `setState()` NocoDB key/value helpers, and `getRedditLog(date)`. All network I/O injectable via `_setDeps()` test seam. 21 unit tests.

### section-02-rotation-validation
Add `REPLY_STRUCTURES` constant (3 structures: Q_A_DATA, AGREEMENT_BUT, DATA_INTERPRET), `getNextReplyStructure(subreddit)` with per-subreddit NocoDB counter, `validateReply(text, subreddit)` with markdown stripping + word count + URL/brand check, and `validateDDPost(text)` for CAT 6 (no brand name check). 22 unit tests.

### section-03-cap-timing-jobs
Add `checkDailyCommentLimit(subreddit)`, `shouldSkipToday()` (auto-generates Monday skip days), `upvoteContext()`, all Scheduled_Jobs insert functions (`scheduleEditUpdate`, `scheduleThreadReply`, `scheduleDDReplies`), `processScheduledJobs()` (handles all 5 job types), and `runCAT4Comments()` exported entry point. 32 unit tests.

### section-04-cat5-daily-thread
Add `shouldPostDailyThread()`, `findDailyDiscussionThread(subreddit)` (sticky-first 4-layer lookup, EST-aware), `buildDailyThreadComment(data)` (3 JavaScript templates, no Claude), `getDailyThreadTarget()`, and `postDailyThread()` exported entry point. 22 unit tests.

### section-05-cat6-dd-posts
Add `checkDDPostLimit()`, `buildDDPost(ticker, data)` (4-step Claude pipeline: outline → full draft → bear case review → TLDR), `validateDDPost(text)`, human-likeness check, Imgur visual upload, per-subreddit intro variant generation, NFA disclaimer append, and `postDDPost()` exported entry point. 32 unit tests.

### section-06-anti-ai-detection
Add `NEGATIVE_EXAMPLES` constant and `ANTI_PUMP_RULE` constant. Refactor `draftComment()` stub → `buildCommentPrompt()` with actual Claude API call, injecting both constants into the system prompt alongside subreddit tone and structure instructions. Inject `NEGATIVE_EXAMPLES` + `ANTI_PUMP_RULE` into the CAT 6 DD pipeline system prompts (Steps 2 and 3). 12 unit tests.
