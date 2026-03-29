<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npx jest --selectProjects e2e
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-helpers-fixtures
section-02-jest-config
section-03-alert-pipeline
section-04-article-pipeline
section-05-reddit-pipeline
section-06-x-pipeline
section-07-report-pipeline
section-08-newsletter-pipeline
section-09-outreach-pipeline
section-10-cross-chain
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-helpers-fixtures | — | all | No (foundation) |
| section-02-jest-config | 01 | all | No |
| section-03-alert-pipeline | 01, 02 | 10 | Yes |
| section-04-article-pipeline | 01, 02 | 10 | Yes |
| section-05-reddit-pipeline | 01, 02 | 10 | Yes |
| section-06-x-pipeline | 01, 02 | 10 | Yes |
| section-07-report-pipeline | 01, 02 | 10 | Yes |
| section-08-newsletter-pipeline | 01, 02 | 10 | Yes |
| section-09-outreach-pipeline | 01, 02 | 10 | Yes |
| section-10-cross-chain | 03–09 | — | No (requires all chains) |

## Execution Order

1. `section-01-helpers-fixtures` — foundation: helpers.js, setup.js, 4 fixture JSON files
2. `section-02-jest-config` — Jest projects config update in package.json
3. `section-03-alert-pipeline` through `section-09-outreach-pipeline` — parallel (all independent chain test files)
4. `section-10-cross-chain` — requires all 7 chain test files to exist first

## Section Summaries

### section-01-helpers-fixtures
Create `tests/insiderbuying/e2e/helpers.js` (makeFetch, makeRouter, makeFetchSeq, expectFetchCalledTimes, BASE_ENV, noSleep, named mock responses), `tests/insiderbuying/e2e/setup.js` (global fetch trap, fake timers, jest.setTimeout), and the 4 JSON fixture files under `tests/insiderbuying/e2e/fixtures/`. Also create `tests/insiderbuying/e2e/helpers.test.js` to self-verify the helpers and fixture shapes.

### section-02-jest-config
Update Jest config in `ryan_cole/insiderbuying-site/package.json` to use a `"projects"` array splitting unit tests (existing) and e2e tests (new) into separate Jest projects. The e2e project gets `clearMocks: true`, `maxWorkers: 1`, `setupFilesAfterFramework` pointing to `setup.js`, and `testPathIgnorePatterns` to exclude non-e2e files.

### section-03-alert-pipeline
Create `tests/insiderbuying/e2e/01-alert-pipeline.test.js` with 4 tests: (1) happy path CEO $5M buy flows EDGAR→score→analyze→deliverAlert with makeRouter mocks, asserting score ≥ 8 + analysis text patterns + delivery fetchFn call counts; (2) gift transaction excluded; (3) 10b5-1 hard cap ≤ 5; (4) high-score triggers x-auto-post tweet.

### section-04-article-pipeline
Create `tests/insiderbuying/e2e/02-article-pipeline.test.js` with 3 tests: (1) happy path keyword→outline→draft→qualityGate→writeArticle with makeRouter verifying outline JSON passes to draft call; (2) quality gate fail triggers retry with error in prompt using makeFetchSeq; (3) freshness check redirects article type for duplicate ticker.

### section-05-reddit-pipeline
Create `tests/insiderbuying/e2e/03-reddit-pipeline.test.js` with 3 tests: (1) buildSearchQueries→draftComment→validateComment chain; (2) subreddit tone difference (WSB shorter than ValueInvesting); (3) daily cap enforcement.

### section-06-x-pipeline
Create `tests/insiderbuying/e2e/04-x-pipeline.test.js` with 3 tests: (1) filterRelevant→draftReply with cashtag and length check; (2) no filing data → skip; (3) postToX API call count and result shape.

### section-07-report-pipeline
Create `tests/insiderbuying/e2e/05-report-pipeline.test.js` with 3 tests: (1) 9 sequential buildReportPrompt calls with growing context accumulation verified; (2) bear case authenticity retry (fetchFn called twice); (3) buildReportRecord returns status: 'published'.

### section-08-newsletter-pipeline
Create `tests/insiderbuying/e2e/06-newsletter-pipeline.test.js` with 2 tests: (1) happy path with A/B subjects, free/pro segmentation, Beehiiv called exactly twice; (2) word count gate throws error.

### section-09-outreach-pipeline
Create `tests/insiderbuying/e2e/07-outreach-pipeline.test.js` with 5 tests: all using fake timers set to 2026-03-01. (1) article scrape→email with ? subject; (2) follow-up day 10 new thread; (3) replied prospect cancels; (4) bounce rate Telegram alert; (5) warm-up limit 5/day enforcement.

### section-10-cross-chain
Create `tests/insiderbuying/e2e/08-cross-chain.test.js` with 5 tests using the capture-and-replay pattern: (1) Chain 1→4 alert triggers x-auto-post; (2) Chain 2→4 article triggers x-auto-post; (3) Chain 1→6 alert appears in newsletter data; (4) Chain 2→6 article appears in newsletter; (5) Chain 5→NocoDB report published status.
