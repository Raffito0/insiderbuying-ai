<!-- PROJECT_CONFIG
runtime: javascript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-nocodb-client
section-02-alerts-pipeline
section-03-social-pipeline
section-04-outreach-pipeline
section-05-validation-cleanup
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-nocodb-client | - | 02, 03, 04, 05 | No |
| section-02-alerts-pipeline | 01 | 05 | Yes (with 03, 04) |
| section-03-social-pipeline | 01 | 05 | Yes (with 02, 04) |
| section-04-outreach-pipeline | 01 | 05 | Yes (with 02, 03) |
| section-05-validation-cleanup | 02, 03, 04 | - | No |

## Execution Order

1. **section-01-nocodb-client** — must be done first; all other sections import and use this module
2. **section-02-alerts-pipeline, section-03-social-pipeline, section-04-outreach-pipeline** — fully independent file migrations, can run in parallel after section-01
3. **section-05-validation-cleanup** — runs after all migration sections are complete; verifies grep-zero and test pass

## Section Summaries

### section-01-nocodb-client
Create `nocodb-client.js` — the shared NocoDB REST helper class and its test file `nocodb-client.test.js`. This is the foundation all other files depend on. Implements `NocoDB` class with 7 public methods (list, get, create, update, delete, bulkCreate, count), fetchFn DI pattern, retry backoff, chunked bulk, and null-on-404 for get.

### section-02-alerts-pipeline
Migrate `write-persistence.js`, `score-alert.js`, `analyze-alert.js`, and `deliver-alert.js` from Airtable to NocoDB. Includes the track record Supabase-to-NocoDB migration in score-alert. Update all corresponding test files.

### section-03-social-pipeline
Migrate `x-auto-post.js`, `x-engagement.js`, `reddit-monitor.js`, and `sec-monitor.js` from Airtable to NocoDB. Includes pagination loop update in sec-monitor (cursor to offset). Update all corresponding test files.

### section-04-outreach-pipeline
Migrate `send-outreach.js` and `find-prospects.js` from Airtable to NocoDB. Includes GAP 12.14 fix: remove URL from first email prompt template and LLM context. Update all corresponding test files including GAP 12.14 assertions.

### section-05-validation-cleanup
Remove all Airtable env vars from all migrated files. Add NocoDB env vars to REQUIRED_ENV arrays. Run `grep -r "airtable" ... -i` verification. Confirm all test suites pass. Document env var changes.
