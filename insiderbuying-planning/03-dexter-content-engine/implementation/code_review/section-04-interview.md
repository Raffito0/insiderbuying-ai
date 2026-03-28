# Section 04 — Code Review Interview

## Auto-fixed (obvious improvements)

| ID | Issue | Fix Applied |
|----|-------|-------------|
| C1/C2 | sanitizeHtml: href/class values not escaped — XSS via `"` breakout | Added `escapeAttr()` — escapes `"` to `&quot;` and `&` to `&amp;` |
| C3 | Script tag regex misses unclosed tags | Added final safety pass: strips remaining `<script>`, `</script>`, `on*=` |
| I1 | extractTicker misses tickers followed by punctuation `"NVDA, MSFT"` | Updated regex lookahead to allow `,;:!?).-` after ticker |
| I4 | Quality gate trusts Claude's self-reported word_count | Now recomputes from body_html text content |
| I6 | Sanitization ran AFTER quality gate | Moved sanitization + word count recompute BEFORE quality gate |
| I7 | Article marked 'published' even if W12/W13 fail | Now checks downstream results — stays 'enriching' if W12/W13 failed |

## Let go (low-risk)

| ID | Issue | Reason |
|----|-------|--------|
| I3 | Keyword threshold inconsistency (50%/any/40%) | Intentional: title needs more keyword words than meta description |
| I5 | NocoDB helpers return null without logging | Callers handle null returns — adding logging would couple to n8n console |
| S1 | Race condition guard not implemented | Planned for future — 5h spacing between triggers makes collision unlikely |
| S4 | Missing integration tests for orchestrator | Requires live NocoDB+Claude — unit tests cover all pure logic |
