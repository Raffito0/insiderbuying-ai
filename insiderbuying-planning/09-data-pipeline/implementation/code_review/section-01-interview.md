# Section 01 Code Review Interview

## Issue 1: Rate limiter bypass when fetchFn provided
**Category:** Let go
**Reason:** Intentional design. The code comment explicitly documents: "Rate limiting (skip acquire when fetchFn provided — tests don't wait for bucket)". The fetchFn parameter is test-only (per spec: "Optional HTTP override for testing"). Rate limiting applies to production HTTP calls only. Making acquire unconditional would significantly slow down the 93 unit tests.

## Issue 2: Dead code in toEdgarIso — second .replace('Z', '')
**Category:** Auto-fix
**Fix:** Remove the unreachable second `.replace('Z', '')` from `toEdgarIso`. First regex `replace(/\.\d{3}Z$/, '')` already handles the full milliseconds+Z suffix. Second replace is never reached and could theoretically corrupt output if code path changed.

## Issues 3-5
**Category:** Let go — nitpicks. Existing comments and behavior are acceptable.
