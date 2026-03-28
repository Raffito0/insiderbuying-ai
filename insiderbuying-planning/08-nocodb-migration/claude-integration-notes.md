# Integration Notes: External Review Feedback

## Reviews Received

- **o3 (OpenAI)**: 7 categories, ~15 items
- **Gemini 3 Pro Preview**: 5 categories, ~10 items

---

## Integrating

### 1. `.get()` returns null on 404 (Gemini)

**Decision**: Integrate. The plan said `.get()` throws on non-2xx. But 404 is a normal "record doesn't exist" outcome that calling code must handle. The client should return `null` on 404 specifically, throw on everything else.

**Change**: Add note to Section 1 that `.get()` has special handling for 404 → returns null.

### 2. `count()` unwraps `{ count: N }` to a plain number (o3)

**Decision**: Integrate. The plan said `count()` returns a number, which is the right API contract. But NocoDB's raw endpoint returns `{ count: 42 }`. The method internally unwraps this. This is already the intent but needs to be explicit.

**Change**: Clarify in Section 1 that `count()` calls the `/count` endpoint and returns `response.count` (the unwrapped integer).

### 3. Encode dynamic values in `where` params — commas/parens (Gemini)

**Decision**: Integrate. Insider names can contain commas (e.g., `Smith, John`), which would break the NocoDB `(field,op,value)` parser. The client or callers must handle this.

**Change**: Add to Section 1 that callers should use `encodeURIComponent()` on dynamic string values interpolated into `where` strings, and the `_req()` method should build URLs from a plain object to avoid manual concatenation pitfalls.

### 4. PATCH semantics — unknown fields cause failure (o3)

**Decision**: Integrate. Airtable silently ignores unknown fields on PATCH. NocoDB/Postgres throws. Callers that spread full objects (`{ ...row, status: 'sent' }`) may send NocoDB internal fields (`Id`, `created_at`) back on update, which will cause errors.

**Change**: Add note in Section 1 that `.update()` callers must send only the fields they intend to update, not the full record object. Document which fields are NocoDB-managed and must not be included in PATCH bodies.

### 5. Case-insensitive search: `like` vs `ilike` (Gemini)

**Decision**: Integrate. The `score-alert.js` migration replaces Supabase's `ILIKE` (case-insensitive) with NocoDB's `like` (which maps to Postgres `LIKE` = case-sensitive). Insider names in the DB may have inconsistent casing.

**Change**: Note in Section 2 (score-alert) that the `like` operator is case-sensitive. Use lowercase normalization on both sides: lowercase the column value in the DB query OR use the `like` operator with a pre-lowercased search string. The implementation should check if NocoDB exposes an `ilike` operator; if not, lowercase both stored names and query string.

### 6. Supabase ID type — cast Integer to String (Gemini)

**Decision**: Integrate. `write-persistence.js` calls `writeSupabaseHistory()` passing the returned record ID. If Supabase's `airtable_record_id` column is typed as TEXT and we now receive an integer from NocoDB, there may be a type mismatch.

**Change**: Add note in Section 2 that `writeSupabaseHistory()` should cast `data.Id` to string: `String(data.Id)` when passing to Supabase to avoid type errors.

### 7. `bulkCreate` chunking — 200 records per batch (Gemini)

**Decision**: Integrate. Unlimited bulk inserts can hit Postgres parameter limits or request size limits. The client should chunk internally.

**Change**: Add to Section 1 that `bulkCreate()` chunks input arrays into batches of 200 and executes sequentially, returning a flattened array of created records.

### 8. Retry with backoff in `_req()` (o3)

**Decision**: Integrate. "Localhost means no rate limit" does not mean zero failures. NocoDB/Postgres can be momentarily locked, restarting, or busy. 3 attempts with exponential backoff (100ms, 300ms, 1000ms) handles transient errors without hanging the workflow.

**Change**: Add to Section 1 that `_req()` retries up to 3 times on 500/503 with exponential backoff. 4xx errors are not retried.

### 9. Add sort by stable field to pagination loops (Gemini/o3)

**Decision**: Integrate. Offset pagination with changing data can skip or duplicate records. Sort by `-Id` (descending) on all paginated queries ensures deterministic ordering.

**Change**: Add note to Section 3 (sec-monitor) and Section 1 that paginated `list()` calls should include `sort: '-Id'` for stable traversal.

### 10. Deployment choreography (o3)

**Decision**: Integrate a brief note. The plan currently assumes a clean switchover. In reality, the order matters: data must be in NocoDB before code goes live.

**Change**: Add a "Deployment Order" note to Section 5 (Validation): (1) verify NocoDB schema and data are populated/migrated, (2) update env vars on VPS, (3) deploy new code. Do NOT merge code before data is in NocoDB.

### 11. Docker networking clarification (Gemini)

**Decision**: Integrate as a note. `http://localhost:8080` only works if n8n and NocoDB are in the same container or network. If they're on separate containers, use Docker service name.

**Change**: Add note in Section 5 environment variable section that `NOCODB_BASE_URL` should be `http://localhost:8080` if same container, or `http://nocodb:8080` (Docker service name) if separate containers on the same Compose network.

### 12. GAP 12.14 — strip `url` from context, add post-generation validation (Gemini)

**Decision**: Integrate. Just editing the prompt text is insufficient — the LLM may hallucinate URLs from other context. The fix must also strip `url` from the context object passed to the LLM, and optionally add a regex validation on the generated output.

**Change**: Update Section 4 (send-outreach) to specify that: (a) `ourArticle.url` is removed from the prompt template, AND (b) the article context object passed to the LLM for email #1 must not include a `url` field. A regex post-check is optional but recommended.

---

## NOT Integrating

### Error redaction in logs (o3)

The logs would contain `insider_name` in `where` clauses. This is internal SEC data, not user-facing PII. The codebase already logs similar content. Not a practical concern for this migration.

### Connection pooling / keep-alive agent (o3)

Each n8n workflow execution is a short-lived process. There is no persistent process to share a pool across. The concern is valid for a long-running server but not for n8n Code nodes. No change.

### GET query-string length for dedup (o3)

`sec-monitor.js`'s dedup check fetches the last 7 days of `dedup_key` values as a list — it doesn't send all dedup keys in a single `where` clause. The pagination loop retrieves all records from the DB. This is not a URL length issue.

### N+1 list-then-count in x-auto-post.js (o3)

The list and count serve different purposes and can't trivially be merged. Not worth the optimization complexity given low call volume.

### Legal/unsubscribe link in first email (o3)

This is a product/legal decision, not a code migration concern. Out of scope for this plan.

### Backup and monitoring (o3)

Infrastructure/ops concerns. Out of scope for this migration unit.

### Offset pagination race condition (Gemini)

The 7-day lookback window is append-mostly and the pagination completes in seconds. Practically not a concern. Covered by stable sort recommendation (item 9 above).
