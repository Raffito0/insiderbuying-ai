# Code Review — Section 05: report-covers.js

Reviewer: Claude Code (Senior Code Reviewer)
Date: 2026-03-29

All 19 tests pass. The implementation is generally clean and follows the established patterns. The findings below are real bugs or security gaps, ordered by severity.

---

## What Was Done Well

- Every user-controlled string field goes through `escapeHtml()` before insertion into the HTML template. All four cover functions apply this consistently.
- `normalizeVerdict()` falls back to `'HOLD'` for unknown inputs, so `VERDICTS[verdictKey]` never produces `undefined` — no risk of a `.color` crash from malformed verdict data.
- `insiderScore` is properly clamped to `[1, 5]` before use.
- The `screenshotUrl()` helper correctly reads from `helpers.env` first, enabling clean test injection without monkey-patching globals.
- Cover D correctly omits `deviceScaleFactor` from the viewport object.

---

## Findings

### 1. IMPORTANT — `logoUrl` is inserted into an `<img src>` attribute without full URL validation

**Location**: `report-covers.js` line 45

```javascript
const logoHtml = data.logoUrl
  ? `<img src="${escapeHtml(String(data.logoUrl))}" style="..."/>`
  : `...`;
```

`escapeHtml` escapes `<`, `>`, `"`, `'`, and `&`. It does not block `javascript:` URIs. If `logoUrl` is caller-supplied and reaches this function with the value `javascript:alert(1)`, the resulting `<img src="javascript:alert(1)">` will be inserted into the HTML that is sent to the screenshot server. Whether Puppeteer/Chromium executes `javascript:` on `<img>` `src` attributes is browser-version-dependent; some versions do not, but the pattern is a code smell and the protection relies entirely on the screenshot server's JS engine behavior, not on the module itself.

The fix is to validate that `logoUrl` starts with `https://` (or `http://`) before using it, and fall back to the ticker-initial placeholder otherwise. This is the same guard that n8n's own `generate-chart.js` does not need because it does not accept external image URLs.

This is the only real security issue in the file.

---

### 2. IMPORTANT — `uploadChart` key prefix is hardcoded to `earlyinsider/charts/`

**Location**: `generate-chart.js` line 341 (the callee, not this file)

```javascript
const key = `earlyinsider/charts/${name}_${Date.now()}_${_randomSuffix(6)}.png`;
```

All four cover functions call `uploadChart(buffer, 'cover-a-NVDA', helpers)`, but the key is built inside `uploadChart` with the prefix `earlyinsider/charts/`. Report covers are not charts. They will be stored under `earlyinsider/charts/cover-a-nvda_...png`. This is a naming/organizational issue: the spec describes covers and charts as distinct asset types. The cover files will be discoverable and usable, but any tooling that scans `earlyinsider/covers/` will find nothing.

This cannot be fixed inside `report-covers.js` without either duplicating the upload logic or passing a key prefix to `uploadChart`. It is worth flagging to decide whether `uploadChart` should accept an optional path prefix, or whether a separate `uploadCover` helper should be added to `generate-chart.js`.

---

### 3. IMPORTANT — Cover B `title` field: `escapeHtml` applied but `title` is used directly in a CSS `font-size:42px` block inside a style-attribute. This is correct — but `stocks` array items do not validate that `upside` contains only safe characters before using it in a colored `style` attribute value

**Location**: `report-covers.js` lines 136–143

```javascript
const upside = escapeHtml(String(s.upside || ''));
// ...
<div style="font-size:16px;font-weight:600;color:${COLORS.green};">${upside}</div>
```

`upside` is escaped before insertion into the text node. No issue here. However, `verdictInfo.color` comes from the `VERDICTS` lookup, which only ever returns hardcoded hex strings — safe. This finding is a non-issue on further inspection; noted here to confirm it was checked.

---

### 4. SUGGESTION — Cover A: ticker inserted into the R2 key via `.toLowerCase()` but no sanitization of path-unsafe characters

**Location**: `report-covers.js` line 122

```javascript
return uploadChart(buffer, `cover-a-${ticker.toLowerCase()}`, helpers);
```

Stock tickers are 1–5 uppercase Latin letters in normal usage. However, `ticker` at this point is the HTML-escaped version of the input string — meaning a ticker like `A&B` would produce `cover-a-a&amp;b` as the key fragment. HTML entities in R2 key names are legal but ugly and could cause matching issues downstream. `ticker` should be sanitized for the key using a simple `/[^a-z0-9]/g` replace rather than the HTML-escaped form.

Similarly in Cover B, `sectorName.toLowerCase().replace(/\s+/g, '-')` is applied to the HTML-escaped sector name. A sector name like `"Tech & Finance"` becomes `"tech-&amp;-finance"` in the key. Same root cause.

---

### 5. SUGGESTION — No test covers the `logoUrl` injection path (XSS finding #1)

The test suite tests `thesis` injection for Cover A and `sectorName` injection for Cover B, but there is no test for `logoUrl: 'javascript:alert(1)'`. Given finding #1 above, a test asserting that a `javascript:` logo URL is discarded in favour of the ticker-initial fallback would serve as a regression guard once the fix is applied.

---

### 6. SUGGESTION — Test for Cover D's `deviceScaleFactor` uses `.not.toBe(2)` rather than asserting absence

**Location**: `report-covers.test.js` line 221

```javascript
expect(body.viewport.deviceScaleFactor).not.toBe(2);
```

The spec says Cover D must NOT have `deviceScaleFactor: 2`. The assertion passes if `deviceScaleFactor` is `undefined` (which is the actual implementation), but it would also pass if someone accidentally set it to `1`. The stronger assertion is `expect(body.viewport.deviceScaleFactor).toBeUndefined()`, which is what the spec ("NO `deviceScaleFactor`") actually requires.

---

## Summary

| # | Severity | Area | Short Description |
|---|----------|------|-------------------|
| 1 | Important | Security | `logoUrl` not validated against `javascript:` URI scheme |
| 2 | Important | Storage | All covers land in `charts/` prefix, not a covers-specific path |
| 3 | — | Security | Confirmed safe (verdict color comes from hardcoded lookup only) |
| 4 | Suggestion | Storage | R2 key built from HTML-escaped ticker/sector name; should use raw+sanitized form |
| 5 | Suggestion | Tests | No test for `javascript:` logoUrl injection |
| 6 | Suggestion | Tests | Cover D `deviceScaleFactor` assertion should be `.toBeUndefined()` not `.not.toBe(2)` |

The code is production-ready after addressing finding #1 (the `javascript:` URL guard). Finding #2 is a cross-file naming decision that should be resolved before the pipeline is used at scale.
