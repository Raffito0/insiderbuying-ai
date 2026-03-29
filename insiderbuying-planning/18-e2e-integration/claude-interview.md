# Interview Transcript: 18-e2e-integration

## Q1: How should e2e tests handle the spec/reality gap?

**Question:** The spec references `nocodb-client.js`, `ai-client.js`, `edgarParser.parseForm4Xml()`, and `generateArticle.run()` — none of which exist in the actual codebase. The modules use an `opts.fetchFn` dependency-injection pattern instead. How should the e2e tests be written?

**Answer:** Adapt tests to real exports (Recommended) — Write tests that call the actual module functions (runScoreAlert, analyze, deliverAlert, etc.) with mocked fetchFn opts. Cleaner, no new files needed, stays true to existing patterns.

---

## Q2: What level of chain coverage is the real priority?

**Question:** The spec defines 7 chains with 28+ tests and calls them 'e2e'. Given that all modules already use fetchFn injection (so each test is already integration-grade), what level of chain coverage is the real priority?

**Answer:** Happy path per chain + 1 error case (Recommended) — 7 files × (1 happy path + 1-2 error cases) = ~21-28 tests. Focus on proving data flows end-to-end through each stage, not exhaustive edge cases.

---

## Q3: Should a shared helpers file be created?

**Question:** Should a shared helpers file be created at tests/insiderbuying/e2e/helpers.js to consolidate makeFetch, makeFetchSeq, BASE_ENV, and noSleep — or should each test file copy the pattern inline (as existing tests do)?

**Answer:** Yes, create shared helpers.js (Recommended) — DRY: one place for makeFetch, makeFetchSeq, BASE_ENV, noSleep, and standard mock responses. Existing tests can stay as-is.

---

## Q4: Cross-chain validation — automated or manual checklist?

**Question:** The spec's Cross-Chain Validation section requires manually verifying 5 inter-chain links (Chain 1→4, Chain 2→4, Chain 1→6, Chain 2→6, Chain 5→NocoDB). Should these be automated Jest assertions, or remain a manual checklist as the spec says?

**Answer:** Automate the NocoDB state checks — Write one cross-chain test per link that checks NocoDB state transitions (e.g. alert score 9+ triggers x-auto-post flag). Adds ~5 extra tests.

---

## Q5: What's the most important verification signal per chain?

**Question:** Each happy-path test should assert data flows correctly through all stages. What's the most important verification signal per chain?

**Answer:** Output shape + mock call counts (Recommended) — Verify the final output matches expected shape AND that each stage's mock was called the right number of times with correct args. Proves wiring.

---

## Q6: Inline mock objects vs. fixture files?

**Question:** The spec requires all tests complete in <10s each (mock latency 0-50ms). Is there any chain where you want real test data fixtures (e.g. a sample EDGAR XML, a sample Claude response) stored as .json/.xml test fixtures files, rather than inline mock objects?

**Answer:** Fixtures for EDGAR + Claude responses — Store realistic XML/JSON responses as fixture files in tests/insiderbuying/e2e/fixtures/. More realistic, slightly more maintenance.
