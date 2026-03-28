# InsiderBuying.ai — Deep Project Interview

## Session 1: 2026-03-26 (Site Build — COMPLETED)

### Requirements Sources
- `ryan_cole/DEXTER-FINANCE-BLOG.md` — Full business model, 16 workflows, stack, costs, strategies
- `ryan_cole/FINANCIAL-ARTICLE-SYSTEM-PROMPT.md` — Production Claude prompt for article generation
- `ryan_cole/insiderbuying-site/` — Existing Next.js site with homepage (12 sections)

### Interview Transcript

#### Q1: Launch priority — which blog first?
**A: InsiderBuying.ai only.** The other 2 blogs come later as separate projects.

#### Q2: Rendering strategy — static export vs SSR?
**A: Switch to SSR on Netlify.** Remove `output: 'export'` from next.config.ts.

#### Q3: Scope — how many of the 16 workflows to plan?
**A: All 16 workflows.** Full scope.

#### Q4: Design source — Figma vs existing style?
**A: Figma is gospel.** Pixel-perfect from Figma designs.

#### Q5: Auth + payments stack?
**A: New Supabase project.** Separate from Toxic or Nah.

#### Q6: Airtable organization?
**A: New Airtable base.** Separate from ToxicOrNah pipeline.

#### Q7: API keys status?
**A: Have Financial Datasets API key.** DataForSEO needs acquisition.

#### Q8: Dexter AI research agent?
**A: Needs to be built** as n8n workflow.

#### Q9: Ryan Cole — who is he?
**A: Founder & CEO of InsiderBuying.ai.** Real person. Author of blog articles.

#### Q10: Timeline?
**A: 7 days. Everything ready.**

### Key Decisions (Session 1)
| Decision | Choice |
|----------|--------|
| Blog scope | InsiderBuying.ai only |
| Rendering | SSR on Netlify |
| Workflow scope | All 16 |
| Design | Figma pixel-perfect |
| Supabase | New project |
| Airtable | New base |
| Timeline | 7 days |

### Existing Assets (Session 1)
- Next.js 16 site with homepage (12 sections, all components built)
- Navbar + Footer, page directories created
- Color system: navy #002A5E, green #00D26A, red #FF3B3B
- Fonts: Montaga (headings), Inter (body), Space Mono (data)
- Tailwind v4, React 19, TypeScript

---

## Session 2: 2026-03-28 (Content Engine Quality Upgrade)

### Context
Session 1 produced 7 planning units (01-infrastructure through 07-outreach-seo) that built the site from scratch. This session covers the NEXT phase: implementing 130 quality gaps + 11 infrastructure changes + 27 tools/methodologies + 3 visual systems across the existing 25 JS code files.

### Requirements Sources
- `ryan_cole/insiderbuying-planning/WORKFLOW-CHANGES.md` — Master file: 11 infra (A1-A11), 130 gaps, 27 tools (D1-D7), P0-P4 ordering
- `ryan_cole/insiderbuying-planning/PROMPT-WORKFLOW-FRAMEWORK.md` — Production prompts, workflows, quality gates for all 12 categories
- `ryan_cole/insiderbuying-planning/CONTENT-GAPS-ALL.md` — 130 gaps with file:line references
- `ryan_cole/insiderbuying-planning/COST-OPTIMIZATION-FINAL.md` — AI routing + $20/month budget
- `ryan_cole/insiderbuying-planning/DEEP-TRILOGY-PROMPT.md` — Consolidated requirements + 3 additional elements
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/` — 25 JS files, ~7650 lines, 18 test files, 1612 test cases

### Interview Transcript

#### Q1: Scope — How should new units relate to existing 01-07?
**A: New units alongside (08+).** Preserve existing 01-07 as completed work.

#### Q2: Restructuring freedom?
**A: Full freedom.** Propose whatever decomposition makes the most technical sense.

#### Q3: Timeline?
**A: ASAP. 3-4 hours total.** Each unit completes in 20-40 min via /deep-implement. Sequential execution. Constraint is context window management, not time.

#### Q4: Airtable -> NocoDB migration (A8) status?
**A: Still pending.** All 9 files still use Airtable API.

#### Q5: NocoDB migration file grouping?
**A: Group by data domain** (3-4 sections of related files), not one section per file.

#### Q6: PDF engine for reports?
**A: Both available, choose per use case.** Puppeteer for simple PDFs, WeasyPrint for complex PDFs with per-page headers.

### Additional Elements (Post-Initial Draft)
1. **Report Cover Generation** — 4 templates (A: Single Stock, B: Sector, C: Bundle, D: Hero Featured), HTML/CSS -> Puppeteer -> PNG
2. **Company Logo System** — Brandfetch API (free, 60M+ brands) + text abbreviation fallback for non-single-ticker reports
3. **CEO/Insider Photo System** — 3-tier cascade: Wikidata P18 -> Google Knowledge Graph -> UI Avatars (initials). `getInsiderPhoto()` with NocoDB caching. Used in Data Card, Filing Card, Report cover, Alert email, Transaction Table

### Key Decisions (Session 2)
| Decision | Choice |
|----------|--------|
| Unit numbering | 08+ alongside existing 01-07 |
| Restructuring | Full freedom |
| Timeline | 3-4 hours total |
| A8 status | Still pending |
| A8 grouping | By data domain |
| PDF engine | Both (Puppeteer simple, WeasyPrint complex) |
| Visual additions | Report covers + logos + insider photos integrated |

### Key Constraints
- Budget: ~$20/month (Claude Sonnet + DeepSeek V3.2)
- Test runner: Jest (`npx jest`), tests in `tests/insiderbuying/`
- n8n Code Node: CommonJS only, no global `fetch`, use `require('https')`
- Target dir: `ryan_cole/insiderbuying-site/`
- Commit per section
- Prompts from PROMPT-WORKFLOW-FRAMEWORK.md (not invented)
- 20-40 min per unit, 4-8 sections each
