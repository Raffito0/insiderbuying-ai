# Interview Transcript — 15-articles-reports

## Q1: Quality gate merge strategy

**Q:** The existing qualityGate() has completely different checks from the spec's 14-point gate (spec: FK Ease, visual placeholders, CTA in first 500 chars, track record section, etc. — existing: meta description, AI detection, key_takeaways, verdict fields, etc.). Should the spec's gate REPLACE the current one entirely, or should the new checks be ADDED on top of what already exists?

**A:** Merge: keep existing checks that are NOT duplicated by the new 14 (meta description 140-155 chars, AI detection heuristics, key_takeaways count, verdict field presence). Replace only the checks where the new spec has a better version (e.g. old FK Grade 8-10 → new FK Ease 30-50, old data_tables_count >= 1 → new visual placeholders >= 3). Final gate should be ~18-20 checks, not 14 and not 28.

---

## Q2: Missing dependencies (visual-templates.js, covers.js)

**Q:** visual-templates.js (chart rendering) and covers.js (report covers) are referenced by the spec but do NOT exist in the codebase today. These are listed as earlier sections in the plan. Should this plan create stub/placeholder implementations for them, or should this section assume they already exist when it runs?

**A:** Assume they exist (prior sections built them). This plan documents what interface is expected. Actual creation is handled by earlier sections.

---

## Q3: PDF generator per report type

**Q:** The current PDF stack uses a screenshot server (http://host.docker.internal:3456). The spec adds WeasyPrint for complex reports. Which PDF generator should each report type use?

**A:** WeasyPrint only for complex/premium reports (types: single, complex, sector, bundle — i.e. all paid reports). Screenshot server remains in use for lead magnets and any non-premium content.

---

## Q4: Bear case authenticity measurement

**Q:** The bear case section requires an authenticity review (score < 7/10 → retry). How should authenticity be measured?

**A:** Separate Claude call scoring it 1-10 (Recommended). Claude reads the bear case text and returns a JSON score + reasoning. Clear and auditable.

---

## Q5: ESM syllable package workaround

**Q:** The syllable package for FK Ease is ESM-only, but n8n Code nodes run in CommonJS. Which workaround should the plan use?

**A:** Inline a custom syllable counter (~20-line regex-based syllable function inlined directly in the file). No npm dependency. Works in CommonJS without any import tricks.

---

## Q6: Schema.org JSON-LD injection point

**Q:** Schema.org JSON-LD (Article + Person + FinancialProduct) — where should it be injected?

**A:** Appended to body_html before saving to NocoDB. The `<script type="application/ld+json">` tag is part of the article's HTML stored in the database. The Next.js frontend renders it as-is.

---

## Q7: Lead magnet generation approach

**Q:** The spec says lead magnet expands to 4000-5000 words / 12-15 pages. The current buildNarrativePrompt() targets 1500-2000 words in a single Claude call. Should the expanded version use a single call with a higher token budget, or multiple sequential calls?

**A:** Single call, higher token budget. One Claude call with 6000 max_tokens and explicit 4000-5000 word instruction. Simpler, no coordination overhead.

---

## Q8: Preview PDF content strategy

**Q:** The 5-page preview PDF — should the preview be page 1-5 of the full PDF, or a specifically generated teaser?

**A:** First 5 pages BUT ensure the report section ordering places the most visually impressive content early: (1) Cover with verdict badge, (2) Executive Summary with key metrics, (3) Insider Intelligence with transaction table chart + timeline chart, (4) Price chart with buy markers. The section generation order in generate-report.js must guarantee charts appear in pages 1-5. Add a 'CONTINUE READING' watermark/banner on page 5 with pricing CTA. The preview must feel like a premium product sample, not a truncated document.
