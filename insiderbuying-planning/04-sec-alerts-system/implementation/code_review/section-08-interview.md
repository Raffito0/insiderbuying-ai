# Section 08 — Code Review Interview

## Review verdict: PASS with fixes applied

### I1 — Test CTA text mismatch
**Let go.** Test validates the decision logic (which CTA type to show), not the exact copy. Copy changes are UI-level, not logic-level.

### I2 — Missing .catch() on auth promise
**Auto-fixed.** Added `.catch(() => {})` to the `getUser()` chain. Safe default (blur stays on) was already correct, but the unhandled rejection warning is now suppressed.

### S1 — Flatten nested .then()
**Let go.** Current pattern is readable enough for 2 levels. Not worth the churn.

### S2 — Test file extension .js vs .tsx
**Let go.** No JSX in the test, .js is correct for the Jest config (`**/tests/**/*.test.js`).

### S3 — Footer "Full Analysis" link
**Let go.** Out of scope for this section. The footer link is a general CTA, not part of the per-card blur system.
