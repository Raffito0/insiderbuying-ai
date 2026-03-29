# Section 06 Code Review — identity-assets.js

Reviewer: Claude Sonnet 4.6
Date: 2026-03-29
Tests: 15/15 pass

---

## Summary

The core logic is sound and matches the spec. The 2-tier cascade, TTL structure, and batch dedup are all present. However there are 6 real bugs — two of them will cause silent data loss in production, one is a security issue that could enable SSRF, and one makes `prefetchLogos` functionally wrong with respect to TTL.

---

## Findings

### Critical (must fix)

**1. SVG prompt injection into screenshot server (SSRF / XSS risk)**

File: `identity-assets.js` lines 65-70

The SVG buffer fetched from the Brandfetch CDN is base64-encoded and embedded verbatim into an HTML document that is POSTed to the internal screenshot server. SVG files can contain `<script>` tags, `<foreignObject>`, and `href`-based network requests. A malicious or compromised CDN response with a crafted SVG would execute JavaScript inside the headless browser, which runs on the internal Docker network with access to `host.docker.internal` and other services.

The content-type check (`image/svg+xml`) only confirms Brandfetch labeled the response as SVG — it does not prevent embedded scripts. No sanitization is applied before passing to the screenshot server.

Fix: Before passing to `_rasterizeSvg`, strip `<script>`, event handler attributes, and `<foreignObject>` from the SVG string. A regex-based strip is sufficient for this threat model; a full SVG sanitizer library is better.

---

**2. `_cacheSet` throws propagate out of `getCompanyLogo`, discarding a valid R2 URL**

File: `identity-assets.js` lines 123-130 and 134-146

Both `_cacheSet` calls after a successful fetch are awaited with no surrounding try/catch. If NocoDB is unreachable at write time, `_nocoGet` inside `_cacheSet` will reject, and that rejection propagates all the way out of `getCompanyLogo`. The caller receives an error instead of the R2 URL that was already uploaded successfully.

The same failure mode affects the UI Avatars path: `_cacheSet` throws, the caller gets an error instead of the UI Avatars URL, and `getCompanyLogo`'s contract of "always returns a URL" is violated.

Fix: Wrap both `_cacheSet` calls in try/catch with a `console.warn`. The logo URL should be returned regardless of whether the cache write succeeded.

```javascript
try {
  await _cacheSet(tableId, 'domain', domain, { ... }, helpers);
} catch (cacheErr) {
  console.warn(`[identity-assets] cache write failed for ${domain}: ${cacheErr.message}`);
}
return logoUrl;
```

---

### Important (should fix)

**3. `prefetchLogos` batch check does not enforce TTL — expired entries are never refreshed**

File: `identity-assets.js` lines 162-165

The batch NocoDB query collects all rows matching the domain list and marks them as "cached" based purely on row presence. It does not inspect `fetched_at` or `ttl_seconds`. A domain with a 40-day-old record will appear in `cachedDomains` and be excluded from `missing`, so its logo is never refreshed.

This contradicts `_cacheGet`, which checks TTL before returning a hit. After a month of operation, `prefetchLogos` will silently stop updating any logo and the batch call will become a no-op.

Fix: After collecting `body.list`, filter to only rows where `fetched_at + ttl_seconds * 1000 > Date.now()` before building `cachedDomains`.

```javascript
const now = Date.now();
const cachedDomains = new Set(
  (body.list || [])
    .filter(r => new Date(r.fetched_at).getTime() + (r.ttl_seconds || 0) * 1000 > now)
    .map(r => r.domain)
);
```

---

**4. `_nocoGet` does not check HTTP status — NocoDB errors are silently treated as cache misses**

File: `identity-assets.js` lines 11-13

`_nocoGet` calls `res.json()` without first checking `res.ok` or `res.status`. When NocoDB returns 401 (bad token), 503, or a rate-limit 429, the response body may parse as a NocoDB error object with no `list` field. The callers handle this gracefully at the surface (`body.list && body.list[0]` returns undefined), but the effect is that every NocoDB outage looks like a full cache miss, causing `getCompanyLogo` to hit Brandfetch and attempt a `_cacheSet` write that will also fail (and now throw per finding 2).

More importantly, PATCH and POST responses in `_cacheSet` are never checked. A failed write is never surfaced.

Fix: Add `if (!res.ok) throw new Error(`NocoDB ${res.status}: ${await res.text()}`)` in `_nocoGet`. This surfaces the real error rather than masking it.

---

**5. R2 upload uses hardcoded `'image/png'` MIME type for non-SVG images**

File: `identity-assets.js` lines 110-117

When Brandfetch returns `image/jpeg` or `image/webp`, the code assigns `pngBuffer = rawBuffer` (no conversion) but then uploads to R2 with `'image/png'` and stores the key with a `.png` extension. The R2 object will have an incorrect `Content-Type` header. Any downstream consumer that checks MIME type to decide how to render the image will receive a JPEG or WebP bytes under a PNG content-type declaration.

Fix: Preserve the original content-type and extension for non-SVG, non-PNG images. Use `'image/png'` only for SVG-rasterized output.

---

**6. R2 key uses `domain` directly without sanitizing path separators**

File: `identity-assets.js` line 110

```javascript
const key = `earlyinsider/logos/${domain}_${Date.now()}.png`;
```

`domain` is not sanitized before use in the R2 object key. A domain string containing `/` (e.g., from malformed SEC data like `nvidia.com/subsidiary`) would create an unintended nested R2 path. While `encodeURIComponent` is applied in the NocoDB query string, it is not applied here.

Fix: Sanitize `domain` for use in the R2 key: `domain.replace(/[^a-z0-9._-]/gi, '_')`.

---

## What Works Well

- The 2-tier cascade (Brandfetch → UI Avatars) is clean and correctly structured. The outer try/catch ensuring fallthrough is the right pattern.
- TTL logic in `_cacheGet` is correct: `fetched_at + ttlMs > Date.now()`.
- PATCH vs POST distinction in `_cacheSet` is correctly implemented and tested.
- Content-type guard (`ct.startsWith('image/')`) prevents downloading non-image responses from Brandfetch.
- Double size check (Content-Length header first, then buffer length) is thorough.
- `prefetchLogos` deduplication via `new Set(domains)` is correct and prevents race conditions.
- All 15 tests are structurally sound and cover the right scenarios. Finding 3 (TTL in prefetch) is a gap the test suite does not cover.
