# Interview Transcript: Visual Engine (Unit 11)

## Q1: How will these 4 modules be called?
**Answer**: Called from existing workflows. `generate-report.js`, `generate-image.js`, and others will import and call these functions directly.

## Q2: What rendering volume do you expect?
**Answer**: Medium (10-50/day). Regular article + alert generation with visuals.

## Q3: Is Inter font / node-canvas native deps installed on VPS?
**Answer**: Nothing pre-installed. VPS has Node.js + Docker + n8n only. Plan must include full VPS setup (Cairo/Pango for node-canvas, Inter font, npm packages).

## Q4: NocoDB cache tables (Logo_Cache, Insider_Photos) status?
**Answer**: Don't exist yet, create them. Use the same EarlyInsider base as the existing 12 tables.

## Q5: Template architecture — standalone vs shared base?
**Answer**: Standalone functions with shared CSS. Each template is an independent HTML string function, but they share a CSS utility library (colors, badges, glassmorphism classes, design tokens).

## Q6: Logo fallback priority?
**Answer**: Always show something. Brandfetch → UI Avatars fallback (text abbreviation). Never show broken/missing images.

## Q7: renderTableImage() approach?
**Answer**: HTML table via screenshot server. Easier styling, consistent design with other templates. Overrides the spec's "drawRect + fillText" approach.

## Q8: Google Knowledge Graph API for insider photos?
**Answer**: Haven't used it yet. Key exists but untested. Plan should include validation of this API and weight Wikidata appropriately in the cascade.

## Q9: Module API design pattern?
**Answer**: Standard n8n helpers pattern. Functions receive `(data, helpers)` where `helpers = { fetchFn, env, _sleep }`. Consistent with the other 25 files.

## Q10: Smoke test data?
**Answer**: NVDA + Jensen Huang is enough, plus a fallback test for unknown company/person.

## Key Decisions Summary
1. **Integration**: Existing workflows call these modules (no new workflow)
2. **Scale**: Medium (10-50 renders/day) — no page pooling needed, but browser reuse recommended
3. **VPS**: Full setup required (Cairo, Pango, Inter font, npm packages)
4. **NocoDB**: Create 2 new tables in EarlyInsider base
5. **Templates**: Standalone HTML functions + shared CSS utilities
6. **Logos**: Always show something (Brandfetch → UI Avatars fallback)
7. **Tables**: HTML via screenshot server (not canvas drawRect)
8. **Photos**: Wikidata → Google KG → UI Avatars cascade, KG untested
9. **API pattern**: `(data, helpers)` matching existing n8n Code Node pattern
10. **Tests**: NVDA/Jensen Huang + unknown fallback cases
