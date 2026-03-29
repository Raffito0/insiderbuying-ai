# Section 06 Code Review Interview

## Auto-fixes Applied

### Fix 1: NocoDB HTTP status check in `_nocoGet`
- Added `if (!res.ok) throw new Error(...)` before `res.json()`
- **Why**: A 401/429/503 response would silently return `{list:[]}` (treated as cache miss), hiding real errors.

### Fix 2: CSP meta tag in SVG rasterization HTML
- Added `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">` to the rasterization HTML
- **Why**: Raw SVG data from Brandfetch CDN is base64-embedded in an `<img>` tag sent to the internal screenshot server. CSP blocks any embedded network requests the SVG might attempt.

### Fix 3: `_cacheSet` calls wrapped in try/catch
- Both `_cacheSet` calls (after Brandfetch success and after UI Avatars fallback) are now in `try/catch` with `console.warn`
- **Why**: If NocoDB is down at write time, the unguarded `await _cacheSet(...)` would propagate the error, breaking the "always returns URL" contract despite a valid R2 upload already completed.

### Fix 4: Correct MIME type for non-SVG Brandfetch images
- Was: always `uploadToR2(buffer, key, 'image/png')` even for JPEG/WebP
- Now: use `ct.split(';')[0].trim()` as MIME; only SVG-rasterized output is `image/png`
- **Why**: Storing JPEG as `image/png` in R2 produces incorrect `Content-Type` headers.

### Fix 5: Domain sanitized in R2 key
- Added `.replace(/[^a-z0-9.-]/gi, '_')` to `safeDomain` variable used in key
- **Why**: A domain containing `/` would create unintended nested R2 paths.

## Decisions Let Go

### prefetchLogos batch cache check ignores TTL
- The batch query checks row presence (not TTL validity). A domain with an expired record won't be refreshed by `prefetchLogos`.
- **Decision**: Let go. `prefetchLogos` is a pre-fill optimization; TTL enforcement happens in `getCompanyLogo` on actual render calls. This is acceptable behavior.
