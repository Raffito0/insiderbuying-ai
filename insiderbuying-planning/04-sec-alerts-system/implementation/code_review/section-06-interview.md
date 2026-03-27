# Section 06 Code Review Interview

## Auto-fixed
- **C1**: Added fire emoji to cluster email subject to match spec.
- **I4**: Added `res.ok` check on Supabase preferences query. Logs warning and returns empty on failure.

## Let go
- **I1/I2**: Env var naming (`SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SERVICE_KEY`, `AIRTABLE_BASE_ID` vs `AIRTABLE_INSIDERBUYING_BASE_ID`) — keeping consistent with sections 02-05. Will standardize across all sections in section-07 (n8n workflow config).
- **I3**: No n8n entry point — this is intentional. Functions are tested independently; the n8n glue code is a commented stub pattern (matching analyze-alert.js). Section 07 handles wiring.
- **I5**: OneSignal tag stringification — documented constraint. Scores are 1-10, so lexicographic and numeric comparison are identical in this range.
- **S1-S5**: Nice-to-have suggestions — deferred to polish pass.
