# Section 05 Code Review Interview

## Auto-fixed (no user input needed)

- **C1 (Critical)**: Changed Supabase Prefer header from `resolution=merge-duplicates` to `resolution=ignore-duplicates`. Updated test assertion to match. Spec requires DO NOTHING on conflict, not UPSERT.
- **C2 (Critical)**: Integrated `handleDeadLetter` into `runPostProcessing` — iterates `failedFilings`, calls `handleDeadLetter` for those with `retry_count > 3`. Added integration test.
- **I1**: Added defensive `JSON.stringify` for `raw_filing_data` in both Airtable and Supabase insert functions.
- **I3**: Added response status check to `patchAirtableRecord` — throws on non-2xx responses.
- **I4**: Added comment documenting the additive cluster size assumption (dedup prevents double-writes).
- **S1**: Added happy-path end-to-end test for `writeFilingPersistence`.
- **S2**: Added test for `runPostProcessing` cluster grouping with 2 clusters.
- **S3**: Added console.warn when Monitor_State record is not found.

## Let go (not worth changing)

- **I2**: Spec says persistence belongs inline in `sec-monitor.js`. Keeping separate file — better testability, matches existing pattern (score-alert.js, analyze-alert.js are separate files). Spec will be updated.
- **S4**: Airtable URL uses table ID — confirmed intentional.
- **S5**: Realtime event test requires live Supabase — tracked as manual integration test.
