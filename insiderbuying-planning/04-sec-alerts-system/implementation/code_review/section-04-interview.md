# Section 04 — Code Review Interview

## Auto-fixes applied (no user input needed)

### 1. Malformed API response guard
- **Issue**: `data.content[0].text` accessed without null checks
- **Fix**: Added optional chaining `data?.content?.[0]?.text` + throw on empty
- **Risk**: Low — defensive improvement

### 2. Nested retry amplification
- **Issue**: Validation retry called `callWithRetry` which could itself retry on 429/503, producing up to 4 API calls
- **Fix**: Changed validation retry to call `callClaude` directly — max 2 calls on validation failure path
- **Risk**: Low — matches spec intent of "one retry"

### 3. Zero delay on 500/503 retry
- **Issue**: Immediate retry against server error almost certainly fails again
- **Fix**: Added 2s sleep before 500/503 retry
- **Risk**: Low — standard practice, test updated to verify

### 4. max_tokens 1024→1536
- **Issue**: 1024 tokens slightly tight for 2-3 paragraph analysis
- **Fix**: Bumped to 1536 (no extra cost — only billed for output tokens used)
- **Risk**: None

### 5. Cosmetic array join removal
- **Issue**: Single-element array with `.join('')` — unnecessary complexity
- **Fix**: Simplified to direct string concatenation
- **Risk**: None

## Items let go
- Missing file-level header comment: not blocking, can add later
- Edge case tests (empty content array, etc.): covered by the null guard fix
