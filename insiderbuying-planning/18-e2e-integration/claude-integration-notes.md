# External Review Integration Notes

## Summary

Both Gemini and OpenAI produced strong, consistent feedback. The main themes were: mock brittleness, date determinism, Jest config subtleties, and cross-chain test isolation. Most feedback is actionable and will meaningfully improve the test suite's reliability.

---

## INTEGRATING

### 1. URL-based request router mock (replaces `makeFetchSeq`)

**Both reviewers flagged this.** `makeFetchSeq` breaks if: (a) a pipeline makes async concurrent calls, (b) a logging/telemetry call is added between stages, (c) call order within a stage changes for any reason.

**Decision: Integrate.** Replace `makeFetchSeq` with a URL-pattern router in `helpers.js`:
```javascript
// Example shape — implementation details left to deep-implement
makeRouter(routes) // { [urlPattern]: response | fn(url, opts) => response }
```
`makeFetchSeq` can remain as a simpler utility for cases where URL routing is overkill, but the main happy-path tests should use the router.

### 2. `clearMocks: true` instead of `resetMocks: true`

**Both reviewers flagged this.** `resetMocks: true` destroys mock implementations set in `beforeEach` — causing `fetchFn` to return `undefined` on test 2+. `clearMocks: true` only resets call counts while preserving the `mockResolvedValue` implementation.

**Decision: Integrate.** Plan updated to use `clearMocks: true`.

### 3. Global `fetch` safety trap

**OpenAI recommended.** If any module bypasses `opts.fetchFn` and calls `global.fetch` directly, tests currently pass but production hits real APIs.

**Decision: Integrate.** Add to `helpers.js` or a `setup.js` file:
```javascript
beforeAll(() => {
  global.fetch = () => { throw new Error('Unexpected real fetch — use opts.fetchFn'); };
});
```
This guards against production-only bugs without adding any test complexity.

### 4. `jest.useFakeTimers()` for date-sensitive tests

**Both reviewers flagged this.** Outreach tests use "10 days ago" and "7 days ago" logic. Newsletter tests may use today's date. These fail nondeterministically near month/year boundaries.

**Decision: Integrate.** Add a `_now` injectable alongside `_sleep` in opts OR use `jest.useFakeTimers().setSystemTime(FIXED_DATE)` in the e2e setup file. The plan recommends the fake timers approach since it's global and doesn't require module changes.

### 5. `makeFetch` must return proper Response shape

**OpenAI raised this precisely.** The current helper pattern returns `{ ok, status, json: async () => response }` which is correct, but this must be explicit in the plan — not assumed. The plan should mandate this shape and add `text()` and `headers.get()` stubs to the Response-like object for modules that use those.

**Decision: Integrate.** Update Section 1 (Helpers) to specify the exact Response stub shape that `makeFetch` must return.

### 6. Separate Jest project for e2e with `--runInBand` / `maxWorkers: 1`

**OpenAI recommended.** Jest runs test files in parallel workers by default. Cross-chain tests (Section 9) share in-memory mock state — in parallel workers each has isolated memory, so cross-chain assertions would fail silently.

**Decision: Integrate.** Add a `"projects"` entry to Jest config for the e2e suite with `testMatch` scoped to `e2e/` and `runner`/`maxWorkers: 1` so e2e tests run single-threaded.

### 7. `jest.setTimeout` in e2e setup

**OpenAI recommended.** Set a per-test timeout explicitly (e.g., 8000ms) via `jest.setTimeout(8000)` in `setup.js` so slow tests fail clearly rather than hanging.

**Decision: Integrate.** Add to setup.js: `jest.setTimeout(8000)`.

### 8. Cross-chain test approach: capture-and-replay over in-memory fake DB

**Gemini recommended.** Instead of building a fake Supabase/NocoDB that re-implements filter/sort logic, cross-chain tests should capture the exact JSON payload that Chain 1 writes (via `fetchFn` call args) and replay that as Chain 4's GET response.

**Decision: Integrate partially.** For the 5 cross-chain tests in `08-cross-chain.test.js`, use the capture-and-replay pattern:
1. Run Chain 1's write function with a spy `fetchFn` → capture the POST body
2. Configure Chain 4's read `fetchFn` to return that exact captured payload
3. Assert Chain 4 processes it correctly

This avoids the fake DB complexity entirely.

### 9. Fixtures must include full Anthropic API response shape

**OpenAI noted.** Claude API responses include `id`, `model`, `usage` fields that production validation may check. The fixture JSON must include these.

**Decision: Integrate.** Add explicit note to Section 1 that `claude-score-response.json` and `claude-analysis-response.json` must include `id`, `model`, `usage.input_tokens`, `usage.output_tokens` fields to match the real Anthropic API schema.

### 10. `expectNoUnhandledFetch` helper + `expectFetchCalledTimes`

**OpenAI suggested.** A helper that asserts the mock was called exactly N times — and fails if it was called fewer (under-fetching is also a bug).

**Decision: Integrate.** Add `expectFetchCalledTimes(mockFn, n)` to helpers.js that asserts `mockFn.mock.calls.length === n` with a descriptive failure message.

---

## NOT INTEGRATING

### A. "Call top-level orchestrator only" (Gemini)

Gemini suggested the e2e tests should only call a single top-level orchestrator per chain. The insiderbuying modules are designed to run as individual n8n workflow nodes — there is no single `runFullAlertPipeline()` function. Creating one would add production code purely for testability, which inverts the correct relationship. The stage-by-stage sequential call pattern IS the integration test — it explicitly verifies the data contract between each stage.

### B. "Start BASE_ENV from empty per chain" (OpenAI)

OpenAI suggested a `withEnv(overrides)` helper that starts from an empty env and only adds keys used by the chain. This is a good long-term idea but requires mapping every env key to every chain — too much maintenance overhead for the value at this stage. The shared `BASE_ENV` with all keys is frozen (integrated above) which prevents mutation. Missing-key detection can be added in a future pass.

### C. "Store raw EDGAR XML instead of JSON" (OpenAI)

The pipeline modules receive parsed JSON from the n8n EDGAR node — not raw XML. The fixture should match what the module actually receives at its input boundary, which is JSON.

### D. "Coverage thresholds for e2e" (OpenAI)

Coverage thresholds are a CI configuration concern beyond this plan's scope. The plan's run command scopes coverage to `coverage/e2e` directory, which avoids affecting the main coverage report.

---

## Summary of Plan Changes

| Change | Section Affected |
|--------|-----------------|
| URL-router `makeRouter` helper | Section 1 |
| `makeFetch` full Response shape spec | Section 1 |
| `expectFetchCalledTimes` helper | Section 1 |
| Global fetch safety trap in setup.js | Section 1 |
| `jest.useFakeTimers` in setup.js | Section 1 |
| `clearMocks: true` (not `resetMocks`) | Jest Config Update |
| Separate Jest project for e2e | Jest Config Update |
| `jest.setTimeout(8000)` | Jest Config Update |
| Cross-chain capture-and-replay | Section 9 |
| Anthropic fixture full schema | Section 1 fixtures |
