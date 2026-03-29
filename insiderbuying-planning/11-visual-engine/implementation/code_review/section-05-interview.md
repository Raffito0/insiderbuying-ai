# Section 05 Code Review Interview

## Auto-fixes Applied (no user input needed)

### Fix 1: Remove unused BASE_CSS import
- **Before**: `const { escapeHtml, normalizeVerdict, VERDICTS, COLORS, BASE_CSS } = require('./visual-css');`
- **After**: `const { escapeHtml, normalizeVerdict, VERDICTS, COLORS } = require('./visual-css');`
- **Why**: BASE_CSS was imported but never used in this file.

### Fix 2: `javascript:` URI validation for logoUrl (security)
- **Before**: `escapeHtml(String(data.logoUrl))` used directly in `<img src>`
- **After**: Validate URL starts with `http://` or `https://` before using; fallback to ticker placeholder if not
- **Why**: `escapeHtml` does not block `javascript:` URIs. A malicious `logoUrl` value could inject JS into the screenshot server's Chromium instance.

### Fix 3: R2 key built from raw ticker/sectorName, not HTML-escaped value
- **Before**: `cover-a-${ticker.toLowerCase()}` where `ticker` = `escapeHtml(...)`
- **After**: Separate `rawTicker = String(data.ticker).replace(/[^A-Za-z0-9]/g, '')` used for key building
- **Why**: HTML-escaped values like `&amp;` would appear in R2 key names. Keys should use clean path-safe strings.
- **Same fix applied to** `renderCoverB` sectorName slug.

### Fix 4: Cover D test assertion tightened
- **Before**: `expect(body.viewport.deviceScaleFactor).not.toBe(2)` — passes even if set to 1
- **After**: `expect(body.viewport.deviceScaleFactor).toBeUndefined()` — matches spec (no property at all)
- **Why**: Spec says Cover D does NOT use `deviceScaleFactor`. The assertion should verify absence, not just non-2.

## Decisions Let Go

### R2 storage path under `charts/`
- `uploadChart` hardcodes the `earlyinsider/charts/` prefix for all uploads. Report covers land under `charts/covers/` rather than a dedicated `covers/` path.
- **Decision**: Let go. This is a cross-file architectural concern for `generate-chart.js`, not in scope for this section. Consistent behavior with all other chart/template uploads.
