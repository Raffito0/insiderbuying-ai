# Section 03 Code Review Interview

## Auto-decided (user sleeping, autonomous mode)

### Applied Fixes
1. **IMPORTANT-03**: Added `{ error }` destructuring + 500 returns on ALL Supabase operations (7 checks total). Stripe will retry on 500 — prevents permanent data loss.
2. **IMPORTANT-01**: Added `console.warn` when `customer.subscription.created` has no `userId` in metadata.
3. **MINOR-01**: Extracted `PLAN_PRO` constant for plan name.
4. **MINOR-02**: Added `resolveId()` helper to deduplicate ID extraction pattern.
5. **Bug fix**: Changed `dynamic` export from `force-static` to `force-dynamic`.

### Deferred (acceptable for MVP)
- IMPORTANT-02: `invoice.paid` period fields vs subscription period — documented simplification
- IMPORTANT-04: `checkout.session.completed` missing `current_period_end` — `customer.subscription.created` fires simultaneously and fills it
- IMPORTANT-05: subscription ID matching on deletion — single-tier for now
- MINOR-03: `as any` casts — not blocking
- MINOR-04: Regex-based tests — behavioral tests would need mocking infrastructure
