# Section 02 Interview — Form 4 XML Parser

## Triage Decisions

No user interview required — all items were either auto-fixes or let-go.

## Auto-Fixes Applied (original session)

**Fix 1: `httpsGet` socket drain**
- Added `res.resume()` before all non-2xx/redirect returns in `httpsGet`
- Prevents socket exhaustion under load

**Fix 2: `transactionCode` extraction refactored**
- `extractValue(block, 'transactionCoding')` was wrong guard (looks for nested `<value>`, not present in transactionCoding)
- Replaced with: `const codingBlock = extractTag(block, 'transactionCoding'); const transactionCode = codingBlock ? extractTag(codingBlock, 'transactionCode') : null;`
- Cleaner, one fewer regex call, correct intent

## Auto-Fixes Applied (this session re-review)

**Fix 3: 404 → index.json fallback now reachable in production**
- `doFetch` in `fetchForm4Xml` now catches `httpsGet` rejections and surfaces HTTP status codes as resolved values
- Previously, a 404 on primary URL caused httpsGet to reject, which hit the catch block and returned null immediately — bypassing index.json entirely in production
- Network-level errors (timeout, DNS) are still re-thrown

**Fix 4: Decimal XML entities now decoded**
- Added `.replace(/&#(\d+);/g, ...)` to `decodeXmlEntities`
- Previously only hex `&#xNN;` was handled; decimal `&#NNN;` (e.g. `&#38;` = &, `&#160;` = NBSP) is valid XML and appears in EDGAR company names

## Tests After All Fixes

93/93 pass. No regressions.
