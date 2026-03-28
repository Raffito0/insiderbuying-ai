# Section 08 Code Review: Frontend Subscription-Aware Blur

**Reviewer**: Claude Opus 4.6 (Senior Code Reviewer)
**Date**: 2026-03-28
**Verdict**: PASS with suggestions

---

## Plan Alignment

The implementation matches the section spec exactly. All five required changes are present:

1. `isPro` state added with `false` default -- matches spec.
2. `isLoggedIn` state added with `false` default -- matches spec.
3. Profiles query inside existing `useEffect` using `getUser()` then `.from("profiles")` -- matches spec code verbatim.
4. Blur class made conditional on `!isPro` -- matches spec.
5. CTA overlay wrapped in `{!isPro && (...)}` with differentiated text/link for unauth vs free -- matches spec behavior matrix row for row.

The blur behavior matrix from the spec (4 rows: unauthenticated, free, pro, profiles error) is fully covered in both the component logic and the test file.

No deviations from plan detected.

---

## What Was Done Well

- **Safe defaults**: Both `isPro` and `isLoggedIn` default to `false`, so any failure mode (network error, profiles query crash, auth timeout) falls back to blurred state. This is correct for a paywall -- fail closed, not open.
- **CTA differentiation is clean**: The ternary for unauth ("Sign up for free" -> `/signup`) vs free ("Upgrade to Pro" -> `/pricing`) is the right conversion optimization. Unauth users should not see "Upgrade" language.
- **Test coverage of edge cases**: `deriveIsPro()` is tested with `null`, `undefined`, empty object, and missing field. The behavior matrix `test.each` is a good pattern for documenting the complete state space.
- **No unnecessary re-renders**: The subscription check runs once on mount and does not trigger on Realtime events, which is correct -- tier does not change mid-session.

---

## Issues

### Important (should fix)

**I1. CTA text mismatch between component and test helper** (`page.tsx:244` vs `alerts-blur.test.js:17`)

The component renders `"Sign up for free to unlock AI analysis"` as the paragraph text and `"Sign up free"` as the link text. The test helper `getBlurState()` returns `ctaText: 'Sign up for free'`. These are three different strings. The test is testing extracted logic that does not exactly mirror the component -- the `<p>` tag text, the `<Link>` text, and the test's `ctaText` are all slightly different.

This is acceptable for pure-logic testing (the test validates the decision logic, not the exact copy), but worth noting that the test file's `ctaText` values do not match either the `<p>` or the `<Link>` text in the component verbatim. If someone changes the component copy, the tests will still pass even though the behavior changed. Consider adding a comment in the test file noting this intentional abstraction, or aligning the test strings to match one of the two rendered strings exactly.

**I2. No `.catch()` on the `getUser()` promise chain** (`page.tsx:104`)

The `.then()` chain on `supabase.auth.getUser()` has no `.catch()`. If the Supabase auth endpoint is unreachable (network error, Supabase outage), this will produce an unhandled promise rejection in the browser console. The state defaults are safe (blur stays on), so this is not a functional bug, but unhandled rejections can trigger error monitoring noise and in strict environments may cause issues.

Recommendation: Add `.catch(() => {})` at the end of the outer `.then()` chain, or wrap in try/catch if refactored to async.

### Suggestions (nice to have)

**S1. Nested `.then()` could be flattened**

The current pattern is:
```tsx
supabase.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;
  setIsLoggedIn(true);
  supabase.from("profiles")...then(({ data }) => { ... });
});
```

This nests two `.then()` calls. A flat chain or `async` IIFE would be more readable:
```tsx
(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  setIsLoggedIn(true);
  const { data } = await supabase.from("profiles")
    .select("subscription_tier").eq("id", user.id).single();
  if (data?.subscription_tier === "pro") setIsPro(true);
})().catch(() => {});
```

This also naturally addresses I2 (the `.catch()` issue).

**S2. Test file uses `.js` extension, spec says `.test.tsx`**

The spec at line 19 says the test file should be `alerts-blur.test.tsx`. The implementation uses `alerts-blur.test.js`. Since the tests are pure logic (no JSX, no React Testing Library), `.js` is fine and arguably more honest. But it is a minor spec deviation.

**S3. The "Full Analysis" link in the card footer is always visible and always points to `/pricing`**

At `page.tsx:262`, every alert card has a "Full Analysis" link pointing to `/pricing` regardless of auth state. For unauthenticated users this should arguably point to `/signup` (consistent with the CTA logic above). For pro users it could point to the actual detailed analysis page. This is outside section-08 scope but worth flagging for a future pass.

---

## Security Review: DOM Content Visibility

The spec explicitly states: "The blur is intentionally CSS-only (not server-side truncation). The text is present in the DOM -- this is the FOMO mechanic."

This is acknowledged and intentional. The AI analysis text is fully readable via browser DevTools / "View Source" / screen readers / `document.querySelector`. For a FOMO conversion mechanic this is standard practice (Substack, Medium, and many SaaS products do the same). If the AI analysis becomes genuinely sensitive or premium-exclusive content, server-side truncation should be reconsidered, but that is a product decision outside this section's scope.

One note: `select-none` prevents casual copy-paste but does not prevent programmatic extraction. This is expected.

---

## Test Quality

The test file takes a pragmatic approach: since the project uses plain Jest without jsdom/RTL, the blur/CTA decision logic is extracted into pure functions and tested directly. This covers:

- `deriveIsPro()`: 5 cases including null/undefined/empty
- `getBlurClasses()`: 2 cases (pro/not pro)
- `getBlurState()`: 4 named cases + parametric matrix

Missing from the spec's test list:
- **Realtime integration test** ("new alert inserted in Supabase appears on /alerts page within 3 seconds") -- this was listed in the spec but is not present. This is reasonable to skip in unit tests (it would require a full Supabase mock or E2E setup), but should be noted as untested.

The `test.each` matrix case for `authenticated, pro` uses `ctaText: undefined` and the assertion `if (ctaText) expect(...)` -- this correctly skips the ctaText check for pro users since `getBlurState` still returns a ctaText even when `showCta` is false. The `undefined` sentinel plus guard is a minor smell but functionally correct.

---

## Summary

| Category | Count |
|----------|-------|
| Critical (must fix) | 0 |
| Important (should fix) | 2 |
| Suggestions (nice to have) | 3 |

The implementation is clean, matches the spec, handles failure modes correctly, and the test coverage is solid for the chosen testing approach. The two Important items (catch handler and test string alignment) are low-effort fixes that improve robustness and maintainability. Ready to merge after addressing I2 at minimum.
