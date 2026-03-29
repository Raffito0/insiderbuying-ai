# Integration Notes: External Review Feedback

## Reviewers
- **OpenAI o3**: Production-readiness / threat-model / scalability review
- **Gemini 3 Pro Preview**: Critical architectural review

---

## INTEGRATING (changes applied to claude-plan.md)

### 1. DROP node-canvas — render ALL charts via screenshot server (Gemini, CRITICAL)
**Why**: Gemini correctly identified that n8n runs inside Docker. Installing `libcairo2-dev` etc. on the host VPS does nothing for the container. A custom Dockerfile is needed, which adds massive deployment friction. Meanwhile, the screenshot server already handles HTML→PNG perfectly.
**Change**: Chart.js loaded via `<script>` tag in HTML templates, rendered through screenshot server. Eliminates `canvas` and `chartjs-plugin-annotation` npm deps. Only `chart.js` needed (for configuration objects, not rendering). Actually, even chart.js npm is unnecessary — load via CDN in the HTML.
**Impact**: Removes Section 2's entire canvas lifecycle (registerFont, create canvas, chart.destroy). Removes VPS native deps setup. Unified rendering pipeline.

### 2. HTML escaping for all template interpolations (Both reviewers)
**Why**: Template literals with `${data.companyName}` are XSS vectors. "Bed Bath & Beyond" or "O'Reilly" break HTML. Even for screenshots only, `<img src="http://169.254.169.254/...">` could SSRF from Chrome.
**Change**: Add `escapeHtml()` utility to visual-css.js. All template functions must use it for every dynamic string interpolation.

### 3. Self-host Inter fonts (Both reviewers)
**Why**: Google Fonts @import in every template adds network latency and can fail if Google blocks bots. Screenshot server may capture before fonts load.
**Change**: Base64-encode Inter WOFF2 files directly into visual-css.js. Zero network dependency for font rendering.

### 4. R2 key collision fix (Both reviewers)
**Why**: `${name}_${timestamp}.png` collides in batch processing (multiple renders in same millisecond).
**Change**: Append random 6-char suffix: `${name}_${timestamp}_${randomSuffix}.png`

### 5. Brandfetch SVG handling (Gemini)
**Why**: Brandfetch frequently returns SVG logos. Uploading SVG with .png extension fails in browsers.
**Change**: Check Content-Type from response. If `image/svg+xml`, either use Puppeteer to rasterize to PNG, or upload with .svg extension. Prefer rasterization for consistency.

### 6. NocoDB cache race condition (Gemini)
**Why**: `prefetchLogos()` fires parallel requests. Duplicate domains hit cache miss simultaneously → duplicate POST → unique constraint error.
**Change**: Deduplicate domains array in memory before checking NocoDB.

### 7. Wikidata redirect following (Gemini)
**Why**: `Special:FilePath` returns 301/302. HEAD request without redirect following fails.
**Change**: Add `redirect: 'follow'` to HEAD request options.

### 8. Screenshot server waitUntil (Gemini)
**Why**: Screenshot can fire before fonts/images finish loading → blank images, fallback fonts.
**Change**: Screenshot server POST should include `waitUntil: 'networkidle0'` parameter (if supported). Document this as a requirement for the server.

### 9. deviceScaleFactor for print covers (Gemini)
**Why**: A4 covers (1240x1754) at deviceScaleFactor=1 may have blurry text for print.
**Change**: Pass `deviceScaleFactor: 2` for print covers (A, B, C). Web covers keep factor 1.

### 10. Input validation — width/height clamps (OpenAI)
**Why**: No bounds on canvas dimensions. Malicious or buggy input could request a gigapixel image.
**Change**: Clamp width to [200, 3000] and height to [200, 3000] in renderTemplate.

### 11. Verdict enum centralization (OpenAI)
**Why**: Templates accept free-text verdict strings. Risk of "Buy" vs "BUY" vs "buy" inconsistency.
**Change**: Define `VERDICTS` enum in visual-css.js: `{ BUY, SELL, HOLD, CAUTION, WAIT }` with associated colors. Templates normalize input verdict to enum key.

### 12. Optional chaining in templates (Gemini)
**Why**: `data.stats[0].label` throws TypeError if stats is empty/undefined.
**Change**: All template data access uses optional chaining and fallback values.

---

## NOT INTEGRATING (with reasons)

### License concerns for Brandfetch/Commons (OpenAI)
**Why not**: Valid concern but out of scope for implementation plan. This is a legal/business decision. Note: Brandfetch free tier allows reasonable use. Commons images have various licenses. Flag for future legal review but don't block implementation.

### Nightly NocoDB cleanup job (OpenAI)
**Why not**: At 10-50 renders/day, cache accumulation is minimal (~50 entries/month for logos, ~100/month for photos). Not worth the complexity of a separate cleanup workflow now. Can add later if table size becomes an issue.

### CI/Docker automation (OpenAI)
**Why not**: This project doesn't have CI. VPS is manually managed. Now moot anyway since we're dropping node-canvas.

### Load testing (OpenAI)
**Why not**: 10-50 renders/day doesn't warrant load testing. Screenshot server already handles this volume for existing image generation.

### Chart.js global defaults bleed (OpenAI)
**Why not**: Moot — we're dropping server-side Chart.js. Charts render in isolated browser pages via screenshot server. Each page has its own Chart.js instance.

### Screenshot server sandbox flags (OpenAI)
**Why not**: The screenshot server is a pre-existing system (already running for generate-image.js). Its configuration is outside this unit's scope. The concern is valid but should be addressed in a dedicated security audit, not here.

### PNG compression/WebP (OpenAI)
**Why not**: At 10-50 images/day, storage costs are negligible. PNG is the universal format for social media and reports. WebP support varies.

### Color-blind accessibility (OpenAI)
**Why not**: Valid UX concern but out of scope for this technical unit. Would require design system changes affecting all templates. Flag for future design iteration.
