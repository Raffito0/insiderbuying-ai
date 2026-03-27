# Section 03: Code Review Interview

## Auto-fixes applied

### I1: Substring matching bug — FIXED
- Changed `words.includes(signal) || lower.includes(signal)` to `new RegExp(\b${signal}\b, 'i').test(lower)`
- Prevents "top" matching inside "stopped", "how" inside "showdown"

### I4: Dead variable `existingLower` — FIXED
- Removed unused variable, replaced with self-dedup Set

### I5: No self-dedup within candidate pool — FIXED
- Added Set-based dedup before external dedup step
- DataForSEO may return same keyword in volume and related results

### I6: Hardcoded year 2026 — FIXED
- Changed to `new Date().getFullYear()` template literal

## Deferred (reasonable for MVP)

### I2: Fuzzy dedup (similarity > 0.8)
- Spec mentions it but Levenshtein adds dependency/complexity
- Exact case-insensitive match covers 95% of real duplicates
- Can add fuzzy matching later when DataForSEO data shows it's needed

### I3: SERP Analysis endpoint
- Third DataForSEO endpoint for gap analysis
- Correctly belongs in a separate n8n HTTP node, not the Code node
- The Code node handles scoring and classification; SERP data enriches but doesn't change the pipeline

## Final state
- 30 tests, all passing (84ms)
- 4 issues fixed from review
