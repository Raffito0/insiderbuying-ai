# Spec: 18-e2e-integration

## Purpose
Verify that all 7 complete pipeline chains work end-to-end after the 10-unit quality upgrade. These are INTEGRATION tests (not unit tests) — they mock external APIs (EDGAR, X, Reddit, Beehiiv, Claude/DeepSeek, Puppeteer, Finnhub) but use real in-process function calls across module boundaries to catch integration bugs that pass unit tests but break at chain handoffs.

## Scope
**Files created**: `tests/insiderbuying/e2e/` directory with 7 test files
- `tests/insiderbuying/e2e/01-alert-pipeline.test.js`
- `tests/insiderbuying/e2e/02-article-pipeline.test.js`
- `tests/insiderbuying/e2e/03-reddit-pipeline.test.js`
- `tests/insiderbuying/e2e/04-x-pipeline.test.js`
- `tests/insiderbuying/e2e/05-report-pipeline.test.js`
- `tests/insiderbuying/e2e/06-newsletter-pipeline.test.js`
- `tests/insiderbuying/e2e/07-outreach-pipeline.test.js`

## Constraints
- Jest test framework (existing setup)
- ALL external APIs mocked via `jest.mock()` or `nock`
- NocoDB: use in-memory mock (not real DB) — `jest.mock('../nocodb-client')`
- Each test must complete in < 10s (mock latency 0-50ms)
- No real API calls, no file system writes, no network
- Tests verify: output shape, data propagation between stages, mock call counts, error handling at boundaries

## Mock Setup Pattern
```javascript
// Each e2e test file starts with:
jest.mock('../../n8n/code/insiderbuying/nocodb-client');
jest.mock('../../n8n/code/insiderbuying/ai-client');
jest.mock('https'); // blocks all real HTTP

const { NocoDB } = require('../mocks/nocodb-mock');
const { claude, deepseek } = require('../mocks/ai-mock');
```

## Sections

### Section 1: Alert Pipeline E2E (Chain 1)
`01-alert-pipeline.test.js` — covers: EDGAR RSS → edgar-parser → sec-monitor → write-persistence → score-alert → analyze-alert → deliver-alert → x-auto-post

**Test 1.1 — Happy path: CEO buy $5M scores 8+, gets analysis, gets delivered**
```javascript
test('CEO $5M buy flows from EDGAR to delivery', async () => {
  // Given: mock EDGAR RSS returns 1 new filing
  // Given: mock Form 4 XML for NVDA CEO Jensen Huang, $5M purchase
  // Given: mock Finnhub quote, profile, earnings
  // Given: mock NocoDB reads (no duplicate, no cluster)
  // Given: mock DeepSeek returns score adjustment +1, analysis text

  const filing = await edgarParser.fetchRecentFilings(6);
  const parsed = await edgarParser.parseForm4Xml(mockXml);
  const baseScore = scoreAlert.computeBaseScore(enrichedFiling);
  const finalScore = await scoreAlert.runScoreAlert(enrichedFiling);
  const analysis = await analyzeAlert.analyze(finalScore);
  const deliveryResult = await deliverAlert.deliverToEligibleUsers(analysis);

  // Assert: score >= 8 (CEO + $5M + large cap → ~8.2)
  expect(finalScore.score).toBeGreaterThanOrEqual(8);
  // Assert: analysis has 3 required sections (hook, context, what-to-watch)
  expect(analysis.text).toMatch(/bought|purchased/i);
  expect(analysis.text).toMatch(/last time|previous|track record/i);
  expect(analysis.text).toMatch(/earnings|watch|catalyst/i);
  // Assert: word count in target range
  expect(analysis.text.split(/\s+/).length).toBeGreaterThan(150);
  // Assert: delivery mock called with correct user segments (free + pro)
  expect(resendMock.calls).toHaveLength(2); // free email + pro email
  // Assert: NocoDB write called for delivery log
  expect(nocodbMock.create).toHaveBeenCalledWith('Alert_Delivery_Log', expect.objectContaining({ score: finalScore.score }));
});
```

**Test 1.2 — Gift transaction excluded**
- Given: transaction code = 'G' (gift)
- Assert: scoring returns null, never reaches analysis or delivery

**Test 1.3 — 10b5-1 plan hard-capped**
- Given: is10b5Plan = true, value = $10M, role = CEO
- Assert: finalScore.score <= 5

**Test 1.4 — X auto-post triggered after high-score alert**
- Given: score = 9, article exists for same ticker
- Assert: x-auto-post `generateAlertTweet()` called with correct data, contains $CASHTAG

### Section 2: Article Pipeline E2E (Chain 2)
`02-article-pipeline.test.js` — covers: keyword selection → generate-article (multi-step) → quality gate → visual placeholder replacement → NocoDB publish → GSC index request

**Test 2.1 — Article generation: multi-step outline → draft → quality gate → visual injection**
```javascript
test('article flows through outline, draft, quality gate, visual injection', async () => {
  // Mock: claude returns valid outline JSON, then valid article HTML
  // Mock: generate-chart.js templates return PNG buffers
  // Mock: uploadToR2 returns R2 URLs
  // Mock: NocoDB Articles create succeeds

  const keyword = { keyword: 'nvidia insider buying', primaryKeyword: 'nvidia insider buying', difficulty: 45 };
  const result = await generateArticle.run(keyword, mockFilingData);

  // Assert: outline was requested first (Claude call #1)
  expect(claudeMock.calls[0].userPrompt).toContain('outline');
  // Assert: draft received outline JSON (Claude call #2)
  expect(claudeMock.calls[1].userPrompt).toContain(JSON.stringify(mockOutline));
  // Assert: quality gate passed (if it fails, test should pass with correct mock data)
  expect(result.qualityGate.valid).toBe(true);
  // Assert: visual placeholders replaced with R2 URLs
  expect(result.body_html).not.toContain('{{VISUAL_');
  expect(result.body_html).toContain('https://pub-');
  // Assert: NocoDB create called with correct schema
  expect(nocodbMock.create).toHaveBeenCalledWith('Articles', expect.objectContaining({ headline: expect.any(String), body_html: expect.any(String) }));
});
```

**Test 2.2 — Quality gate failure triggers retry with error feedback**
- Mock: Claude returns article that fails FK Ease check (< 30)
- Assert: second Claude call includes the specific error message

**Test 2.3 — Freshness check skips duplicate ticker within 30 days**
- Mock: NocoDB returns existing article for same ticker < 30 days ago
- Assert: generation uses different article type (contrarian or sector, not insider_buying)

### Section 3: Reddit Pipeline E2E (Chain 3)
`03-reddit-pipeline.test.js` — covers: daily thread posting → reply generation with tone map → DD post with bear case + Imgur

**Test 3.1 — Daily thread: correct template selection + posting**
```javascript
test('daily thread posts to r/stocks with correct template', async () => {
  // Mock: shouldPostToday() = true, template rotation index = 0 (notable_buys)
  // Mock: NocoDB returns yesterday's top alerts
  // Mock: Reddit API post returns {id: 'abc123'}

  const result = await redditMonitor.buildDailyThreadComment(mockAlertData);
  await redditMonitor.postDailyThread(result, 'stocks');

  expect(result).toContain('Notable Insider Buys');
  expect(redditApiMock.post).toHaveBeenCalledWith('stocks', 'daily_discussion', expect.any(String));
});
```

**Test 3.2 — Subreddit tone: WSB reply is shorter + different tone than ValueInvesting**
- Both generate reply for same ticker data
- Assert: WSB reply word count 50-100, ValueInvesting 150-200
- Assert: WSB system prompt received by Claude mock includes 'degen'

**Test 3.3 — DD post: 4-step generation + bear case review + Imgur upload**
- Mock: Claude calls 4 times (outline, draft, bear case review, TLDR)
- Mock: Imgur returns image URL
- Assert: step 2 received outline JSON from step 1
- Assert: step 3 received bear case text from step 2
- Assert: step 4 received complete draft
- Assert: Imgur upload called once (after visual generation)
- Assert: Reddit post body contains `i.imgur.com` URL

**Test 3.4 — Daily cap enforced**
- Mock: NocoDB returns 10 comments today across subreddits
- Assert: no new reply attempted

### Section 4: X Pipeline E2E (Chain 4)
`04-x-pipeline.test.js` — covers: List polling → archetype reply + screenshot → post with media → quote-retweet scheduling

**Test 4.1 — Reply: filing data injected → archetype selected → media attached → like + post**
```javascript
test('X reply flow: data enrichment → archetype → media → engage → post', async () => {
  // Mock: twitterapi.io returns 3 tweets about $NVDA
  // Mock: NocoDB returns recent NVDA filing
  // Mock: visual-templates renders Template 2 PNG
  // Mock: X media upload returns media_id '12345'
  // Mock: X likes endpoint returns success
  // Mock: X tweet endpoint returns {id: 'tweet123'}

  await xEngagement.processMentions(mockTweets);

  expect(nocodbMock.list).toHaveBeenCalledWith('Insider_Alerts', expect.objectContaining({ where: expect.stringContaining('NVDA') }));
  expect(visualMock.renderTemplate).toHaveBeenCalledWith(2, expect.any(Object));
  expect(xApiMock.likePost).toHaveBeenCalled(); // engagement farming
  const tweetCall = xApiMock.postTweet.mock.calls[0][0];
  expect(tweetCall.text.length).toBeGreaterThanOrEqual(150);
  expect(tweetCall.text.length).toBeLessThanOrEqual(220);
  expect(tweetCall.text).toMatch(/\$[A-Z]+/); // $CASHTAG present
  expect(tweetCall.media_ids).toEqual(['12345']);
});
```

**Test 4.2 — No filing data → skip reply**
- Mock: NocoDB returns no alerts for tweet's ticker
- Assert: no tweet posted, logged as skipped

**Test 4.3 — X post: format rotation + media + quote-retweet scheduled**
- Mock: slot index 0 (9:30 AM = breaking_alert format)
- Assert: Template 1 (Data Card) rendered
- Assert: NocoDB `X_Scheduled_Jobs` create called with `type: 'quote_retweet'`

### Section 5: Report Pipeline E2E (Chain 5)
`05-report-pipeline.test.js` — covers: data gather → 9-section sequential → chart generation → cover generation → PDF assembly → NocoDB publish

**Test 5.1 — 9-section generation: each section receives previous context**
```javascript
test('report sections generated sequentially with growing context', async () => {
  // Mock: Claude returns valid section text for each call
  // Capture: each Claude call's userPrompt

  await generateReport.generateReportSections('NVDA', mockReportData);

  const calls = claudeMock.calls;
  // First section (company_overview): no previous sections in prompt
  expect(calls[0].userPrompt).not.toContain('insider_intelligence');
  // Third section (financial_analysis): should contain first two sections
  expect(calls[2].userPrompt).toContain('company_overview');
  expect(calls[2].userPrompt).toContain('insider_intelligence');
  // Executive summary (last call): contains ALL 9 sections
  const lastCall = calls[calls.length - 1];
  expect(lastCall.userPrompt).toContain('catalysts_timeline');
  expect(lastCall.userPrompt).toContain('investment_thesis');
});
```

**Test 5.2 — Bear case: separate call + authenticity retry if < 7**
- Mock: first bear case review returns `{"authenticity": 4, "rewrite": "..."}`
- Assert: bear case call made TWICE (initial + retry with rewrite instruction)

**Test 5.3 — PDF assembly: chart buffers + cover URL combined**
- Mock: all 5 chart renders return valid PNG buffers
- Mock: WeasyPrint subprocess succeeds
- Assert: PDF buffer > 100KB (valid PDF has content)
- Assert: NocoDB Report_Catalog status updated to 'published'

### Section 6: Newsletter + Outreach Pipelines (Chains 6-7)
`06-newsletter-pipeline.test.js`:

**Test 6.1 — Newsletter: data gather → 6 sections → A/B subjects → Free/Pro segmentation**
- Mock: NocoDB returns 5 alerts, 3 articles, 2 performance records
- Mock: DeepSeek returns JSON with 6 sections + 2 subjects
- Assert: both subjectA and subjectB present and different strings
- Assert: Free HTML has 3 sections, Pro HTML has 6 sections
- Assert: Free HTML contains upgrade CTA, Pro HTML contains referral block
- Assert: Beehiiv API called twice (free segment + pro segment)

**Test 6.2 — Newsletter word count gate**
- Mock: DeepSeek returns only 800 words
- Assert: error thrown with message containing 'word count'

`07-outreach-pipeline.test.js`:

**Test 7.1 — Initial email: Cheerio scraped article → personalized prompt → subject has ?**
- Mock: Cheerio/fetchUrl returns HTML with article title
- Mock: DeepSeek returns email with subject ending in ?
- Assert: prospect's `recent_article_title` field included in prompt
- Assert: no URL in email body

**Test 7.2 — Follow-up day 10: new thread, different angle**
- Given: `followup_count = 1`, `sent_at = 10 days ago`
- Assert: follow-up 2 prompt used (new thread angle, not "Re:")
- Assert: NocoDB `followup_count` updated to 2

**Test 7.3 — Replied prospect: all follow-ups cancelled**
- Given: prospect.replied = true
- Assert: `cancelFollowUps()` called, no emails sent
- Assert: `followup_count` set to 99

**Test 7.4 — Bounce rate > 5%: Telegram alert**
- Given: 6 bounces out of 100 sends today
- Assert: Telegram message sent with bounce rate

**Test 7.5 — Warm-up limit: day 7 domain → max 5/day**
- Given: `DOMAIN_SETUP_DATE` = 7 days ago
- Assert: `getWarmupLimit()` returns 5
- Assert: stops after 5 sends even if 10 prospects queued

### Section 7: Cross-Chain Validation + Coverage Report
`run-e2e.sh` script (document only):
```bash
# Run all e2e tests and generate coverage report
npx jest tests/insiderbuying/e2e/ --coverage --coverageDirectory coverage/e2e
```

Cross-module integration checklist (manually verify after all 7 chains pass):
- [ ] Chain 1 → Chain 4: Alert scored 9+ triggers x-auto-post (via NocoDB state)
- [ ] Chain 2 → Chain 4: New article triggers x-auto-post tweet
- [ ] Chain 1 → Chain 6: Alert data appears in weekly newsletter
- [ ] Chain 2 → Chain 6: Article summary appears in newsletter
- [ ] Chain 5 → NocoDB: Report catalog status = 'published' after PDF

## Test Requirements
- All 7 test files runnable with `npx jest tests/insiderbuying/e2e/`
- Zero real network calls (nock or jest.mock blocks all)
- Each test asserts at minimum: output shape, data propagation, key mock call counts
- Each chain's error path tested: at least 1 error scenario per chain

## Definition of Done
- All 7 e2e test files exist and pass
- Zero tests skipped (`.skip` or `.todo` not allowed)
- Total e2e test count >= 28 (4 tests × 7 chains minimum)
- `npx jest tests/insiderbuying/e2e/` passes with `--ci` flag
- Console output shows full chain names: "Alert Pipeline E2E", "Article Pipeline E2E", etc.
