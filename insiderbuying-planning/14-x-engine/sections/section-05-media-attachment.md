# Section 05: Media Attachment (Gated)

## Overview

This section adds `maybeAttachMedia` and `uploadMediaToX` to `x-engagement.js`. These two functions implement the 40% media-attachment flow for replies: optionally rendering a PNG via `visual-templates.js` (a unit 11 dependency) and uploading it to X via OAuth 1.0a multipart POST. All failures are caught and return null, ensuring the calling workflow always falls back gracefully to text-only posting.

**Depends on:** section-01 (`ai-client.js` established), section-02 (`buildFilingContext` present so `FilingContext` data shape is stable)

**Blocks:** nothing downstream in this unit

---

## Tests First

File to create: `n8n/tests/x-engagement.test.js` (extend the existing test file — add the tests below in a dedicated describe block or as top-level `test()` calls following the existing pattern).

### maybeAttachMedia tests

```
test: when require('./visual-templates') throws (module not found)
  → maybeAttachMedia returns null
  → does not throw or rethrow
  → calling code receives null, not an exception

test: when Math.random() returns a value > 0.4 (60% path)
  → maybeAttachMedia returns null without calling templates.renderTemplate
  → no media upload attempted

test: when uploadMediaToX throws (network error, mocked)
  → maybeAttachMedia catches the error
  → returns null (fallback to text-only)
  → does not rethrow the upload error

test: when all conditions met
  (Math.random() <= 0.4, visual-templates available via mock, uploadMediaToX mocked to return "media_id_abc")
  → maybeAttachMedia returns the string "media_id_abc"
  → renderTemplate was called with templateId=2 and the filingContext object
```

**Testing note:** Because `require()` is called at invocation time (inside the function, not at module load), tests can simulate a missing module by injecting a `requireFn` argument into `maybeAttachMedia` — or by structuring the test to verify the null-return behavior through a controlled fixture. The implementation should accept an optional `_requireFn` parameter (defaulting to `require`) so tests can substitute it without monkey-patching globals.

### uploadMediaToX tests

```
test: given a Buffer and helpers object with OAuth credentials
  → returned payload has method "POST"
  → returned payload URL is "https://upload.twitter.com/1.1/media/upload.json"
  → Content-Type header includes "multipart/form-data"
  → multipart boundary string is present in the Content-Type header value

test: OAuth credentials are not echoed back in the payload body
  → consumer_key, consumer_secret, access_token, access_token_secret
     must not appear as plaintext in the request body (they belong only in the Authorization header)

test: fixture response contains media_id_string "1234567890123456789"
  → uploadMediaToX returns the string "1234567890123456789"
  → the return type is string (not number — avoids JS integer precision loss)

test: multipart boundary is present in request headers
  → Content-Type value matches /multipart\/form-data; boundary=.+/
```

---

## Implementation Details

### File to modify

`n8n/code/insiderbuying/x-engagement.js`

Add two new exported functions near the bottom of the file, after the existing `buildEngagementSequence` function.

### Function: maybeAttachMedia

Signature:
```javascript
async function maybeAttachMedia(filingContext, helpers, _requireFn = require)
```

Logic:
1. Wrap `_requireFn('./visual-templates')` in a try/catch. If it throws for any reason (module not found is the expected case pre-unit-11), return null immediately.
2. If `Math.random() > 0.4`, return null (skip media 60% of the time).
3. Call `templates.renderTemplate(2, filingContext)` to get a PNG buffer. Template ID 2 is the filing card template defined in unit 11.
4. Call `uploadMediaToX(buffer, helpers)` inside a try/catch. If it throws, return null.
5. Return the `media_id_string` returned by `uploadMediaToX`.

The caller (n8n workflow) attaches the returned `media_id_string` to the tweet body. When null is returned, the workflow posts text-only.

### Function: uploadMediaToX

Signature:
```javascript
async function uploadMediaToX(buffer, helpers)
```

Logic:
1. Build a `multipart/form-data` request body. The single field is `media` (the raw buffer). Generate a random boundary string (e.g. `----FormBoundary` + a random hex suffix).
2. Build the Authorization header using OAuth 1.0a. Required credentials from `helpers`:
   - `helpers.xConsumerKey`
   - `helpers.xConsumerSecret`
   - `helpers.xAccessToken`
   - `helpers.xAccessTokenSecret`
3. POST to `https://upload.twitter.com/1.1/media/upload.json` using `helpers.fetchFn`.
4. Parse the JSON response and return `response.media_id_string` as a string.
5. Do not log the `helpers` object on error — construct error messages from status codes and response body only.

**Important:** Always return `media_id_string` (the string field), never `media_id` (the numeric field). X API responses for media upload include both; JavaScript loses precision on the large integer in `media_id`.

### OAuth 1.0a implementation note

Implementing a full OAuth 1.0a signer from scratch inside a Code node is verbose but feasible using Node's built-in `crypto` module (`require('crypto')`). The signature base string, percent-encoding, and HMAC-SHA1 computation are all standard. Alternatively, the function can accept a pre-computed `Authorization` header string via `helpers.xOAuthHeader` — this simpler path lets the n8n HTTP Request node (which has native OAuth 1.0a support) handle signing, and `uploadMediaToX` just passes the header through. Either approach is acceptable; document the chosen path clearly.

### External dependency flag

OAuth 1.0a credentials must be configured before this path goes live:
- `consumer_key` and `consumer_secret` from X Developer Portal (app-level)
- `access_token` and `access_token_secret` from the account being automated

These are passed via `helpers` — never hardcoded. Until credentials are configured, `uploadMediaToX` will throw a network or auth error, which `maybeAttachMedia` catches and converts to null. The workflow continues text-only.

### visual-templates.js dependency

`visual-templates.js` is implemented in unit 11. Until then, the `require('./visual-templates')` call inside `maybeAttachMedia` will throw `MODULE_NOT_FOUND`. This is the expected and safe behavior — the try/catch returns null and the workflow proceeds without media. No stub file is needed.

Once unit 11 is complete, the require will resolve and the 40% media-attachment path becomes active automatically, with no changes needed to this section's code.

---

## Data Shapes

### FilingContext (input to maybeAttachMedia, passed through to renderTemplate)

```javascript
{
  ticker: string,           // e.g. "NVDA"
  insiderName: string,      // e.g. "Jensen Huang"
  insiderRole: string,      // e.g. "CEO"
  transactionValue: string, // e.g. "$2.4M" (pre-formatted)
  transactionDate: string,  // ISO date string
  priceAtPurchase: number,  // e.g. 142.50
  trackRecord: string|null, // e.g. "+23% avg" or null
  clusterCount: number      // 1–3
}
```

This shape is produced by `buildFilingContext` (section-02). Pass it directly to `renderTemplate`.

### helpers (required fields for this section)

```javascript
{
  fetchFn: Function,           // injected HTTP fetch (existing pattern)
  xConsumerKey: string,        // OAuth 1.0a consumer key
  xConsumerSecret: string,     // OAuth 1.0a consumer secret
  xAccessToken: string,        // OAuth 1.0a access token
  xAccessTokenSecret: string,  // OAuth 1.0a access token secret
  // optional shortcut:
  xOAuthHeader: string         // pre-computed Authorization header (if using n8n OAuth node)
}
```

---

## Failure Modes and Expected Behavior

| Failure | Behavior |
|---------|----------|
| `visual-templates.js` not found (MODULE_NOT_FOUND) | Returns null, workflow posts text-only |
| `Math.random()` > 0.4 (60% of calls) | Returns null, no upload attempted |
| `renderTemplate` throws | Should be caught in the same try/catch wrapping the require; returns null |
| `uploadMediaToX` throws (network, 401, 413 file-too-large) | Caught by inner try/catch in `maybeAttachMedia`; returns null |
| X API returns error JSON (e.g. `errors` array) | `uploadMediaToX` should throw with the error message; caught by caller |

---

## Checklist for Implementer

1. Add `maybeAttachMedia` to `x-engagement.js` with the `_requireFn` default-param pattern for testability.
2. Add `uploadMediaToX` to `x-engagement.js` with multipart builder and OAuth header handling.
3. Export both functions (follow the existing `module.exports` pattern in the file).
4. Write the four `maybeAttachMedia` tests and four `uploadMediaToX` tests listed above.
5. Run the full test suite and verify all 21 existing tests still pass:
   ```bash
   node --test n8n/tests/x-engagement.test.js
   node --test n8n/tests/x-auto-post.test.js
   ```
6. Do not create `visual-templates.js` — leave the require to fail gracefully until unit 11.
7. Do not hardcode any OAuth credentials — all from `helpers`.
