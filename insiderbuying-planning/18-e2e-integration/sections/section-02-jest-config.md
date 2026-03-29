# Section 02: Jest Config Update

## Overview

This section updates the Jest configuration in `ryan_cole/insiderbuying-site/package.json` to split tests into two separate Jest projects: one for existing unit tests (`unit`) and one for the new e2e integration tests (`e2e`). This enables running the two suites independently without either interfering with the other.

**Depends on**: section-01-helpers-fixtures (setup.js must exist before this config can reference it)
**Blocks**: All chain test sections (03–09) and cross-chain (10) — none of them can run until this config is in place

---

## What to Do

There is exactly one file to modify:

**`ryan_cole/insiderbuying-site/package.json`**

Locate the existing `"jest"` key. It currently reads:

```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"]
}
```

Replace it entirely with the following:

```json
"jest": {
  "projects": [
    {
      "displayName": "unit",
      "testEnvironment": "node",
      "testMatch": ["**/tests/**/*.test.js"],
      "testPathIgnorePatterns": ["/tests/insiderbuying/e2e/"]
    },
    {
      "displayName": "e2e",
      "testEnvironment": "node",
      "testMatch": ["**/tests/insiderbuying/e2e/**/*.test.js"],
      "setupFilesAfterFramework": ["<rootDir>/tests/insiderbuying/e2e/setup.js"],
      "clearMocks": true,
      "runner": "jest-runner",
      "maxWorkers": 1
    }
  ]
}
```

That is the complete change. No other files are touched in this section.

---

## Why Each Option Was Chosen

**`"projects"` array**: Splitting into two named projects lets you run `npx jest --selectProjects unit` or `npx jest --selectProjects e2e` independently. The existing unit test CI command continues to work unchanged by selecting the `unit` project explicitly.

**`testPathIgnorePatterns` on the unit project**: Without this, the unit project would pick up e2e test files (they live under `tests/`) and run them without the e2e setup, causing failures. Excluding `/tests/insiderbuying/e2e/` from the unit project prevents double-running.

**`clearMocks: true` (not `resetMocks`)**: `clearMocks` resets call counts and instances between tests but leaves `mockResolvedValue` / `mockReturnValue` implementations intact. This is required because many e2e tests set up their `fetchFn` mock in `beforeEach` using `mockResolvedValue`, then assert call counts after the test body. `resetMocks` would wipe the implementation between test body and assertion, breaking the `mockResolvedValue` that `beforeEach` just set.

**`maxWorkers: 1`**: The cross-chain tests (`08-cross-chain.test.js`) use the capture-and-replay pattern where one test captures the POST body written by Chain A and replays it as Chain B's read response. With parallel workers, each worker has an isolated memory space — shared in-memory mock state never crosses worker boundaries, so cross-chain assertions would fail silently. `maxWorkers: 1` forces all e2e tests to run in the same process in sequence, making the capture-and-replay pattern reliable.

**`setupFilesAfterFramework`** (note: this is the correct key for the Jest v30 API — some older docs show `setupFilesAfterFramework`): Points to `setup.js` which installs the global fetch trap, fake timers, and `jest.setTimeout(8000)` before each test file runs. Every e2e test file benefits from this automatically without having to import anything.

**`runner: "jest-runner"`**: Explicit default runner declaration. Included for clarity and to prevent any project-level runner inheritance issue if the root config is ever extended.

---

## Tests for This Section

There is no dedicated test file for the Jest config change itself. The verification is behavioral: after making this change, run the following commands and confirm each succeeds:

```bash
# Should run only unit tests (no e2e files)
npx jest --selectProjects unit

# Should run only e2e tests
npx jest --selectProjects e2e

# Should run both projects (combined output)
npx jest
```

If the unit project accidentally picks up e2e files, the e2e setup guards (fake timers, global fetch trap) will not be active and several unit tests may fail or behave unexpectedly. If `testPathIgnorePatterns` is correct, this will not happen.

If `maxWorkers` is missing or set to a value > 1, the cross-chain tests in section 10 will be flaky (passing in isolation, failing when run as a suite) rather than failing deterministically. This is the most common misconfiguration to watch for.

---

## Run Commands (After This Section Is Done)

```bash
# Run e2e tests only
npx jest --selectProjects e2e

# Run unit tests only (unchanged behavior)
npx jest --selectProjects unit

# Run both
npx jest

# Run e2e with coverage (for CI)
npx jest --selectProjects e2e --coverage --coverageDirectory coverage/e2e
```

---

## Definition of Done for This Section

- `package.json` `"jest"` key replaced with the `"projects"` array above
- `npx jest --selectProjects unit` runs and passes with the same results as before this change
- `npx jest --selectProjects e2e` runs (may have 0 test files at this point if chain sections are not yet implemented — that is expected and not a failure)
- No existing unit test failures introduced by the config change
