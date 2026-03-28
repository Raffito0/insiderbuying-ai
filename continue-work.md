# Continuation Prompt — Autonomous Night Work

You are working autonomously on the InsiderBuying.ai project. The user is SLEEPING. Complete EVERYTHING below without asking questions. When you would normally ask the user a question, instead write it to the QUESTIONS file (see Task 3). Make your best judgment call and proceed.

## Context
- Working directory: `c:\Users\rafca\OneDrive\Desktop\Toxic or Nah`
- Project: InsiderBuying.ai (`ryan_cole/` subdirectory)
- Planning units in: `ryan_cole/insiderbuying-planning/`
- Site code in: `ryan_cole/insiderbuying-site/`
- Test runner: `npx jest` (Jest, not Vitest)
- All CLAUDE.md files apply (root, phone-bot, n8n, toxic-or-nah)

## Current Status

| Unit | Status |
|------|--------|
| 01-infrastructure | DONE (5/5 sections, all committed) |
| 02-figma-site-pages | Needs /deep-plan then /deep-implement |
| 03-dexter-content-engine | DONE (8/8 sections, all committed) |
| 04-sec-alerts-system | DONE (10/10 sections, all committed) |
| 05-data-studies-reports | Needs /deep-plan then /deep-implement |
| 06-newsletter-social | Needs /deep-plan then /deep-implement |
| 07-outreach-seo | Needs /deep-plan then /deep-implement |

## TASK 1: Complete ALL remaining units

For each incomplete unit (02, 05, 06, 07), in order:

### Step A: Check if sections exist
```
ls ryan_cole/insiderbuying-planning/{unit}/sections/index.md
```

### Step B: If NO sections exist → run /deep-plan
- Read the unit's spec/plan files (claude-spec.md, claude-plan.md, etc.)
- Use /deep-plan to create section files
- This generates the sections/index.md + section-NN-*.md files

### Step C: Run /deep-implement
- Use /deep-implement @ryan_cole/insiderbuying-planning/{unit}/sections/index.md
- Implement ALL sections with TDD (write tests, then code)
- For code review: auto-decide everything (no interview — user is sleeping)
- Commit after each section

### Step D: After each unit completes, append to MANUAL-STEPS.md (see Task 2)

## TASK 2: Maintain MANUAL-STEPS.md

File: `ryan_cole/insiderbuying-planning/MANUAL-STEPS.md`

After completing EACH unit, read through all its section files and extract every manual step into this centralized checklist. Also include manual steps from the already-completed units (01, 03, 04).

Format:
```markdown
# InsiderBuying.ai — Manual Steps Checklist

All steps that require manual action (dashboard access, account creation, DNS, API keys, etc.)
Organized by category. Check off as you complete them.

## Account Creation & Signups
- [ ] Step description (Unit XX, Section YY)

## API Keys & Tokens
- [ ] Step description (Unit XX, Section YY)

## DNS & Domain Configuration
- [ ] Step description (Unit XX, Section YY)

## Dashboard Configuration
- [ ] Step description (Unit XX, Section YY)

## Environment Variables
- [ ] Step description (Unit XX, Section YY)

## Deployment & Infrastructure
- [ ] Step description (Unit XX, Section YY)

## n8n Workflow Imports
- [ ] Step description (Unit XX, Section YY)

## Verification & Smoke Tests
- [ ] Step description (Unit XX, Section YY)
```

## TASK 3: Maintain QUESTIONS.md (decisions made without user)

File: `ryan_cole/insiderbuying-planning/QUESTIONS.md`

Every time you would normally ask the user a question (code review interview, design decision, ambiguity in spec, tradeoff choice), write it here instead. Format:

```markdown
# InsiderBuying.ai — Questions & Decisions Made Autonomously

Review these tomorrow morning. If you disagree with any decision, we can fix it.

## Unit XX — Section YY: [section name]

### Question 1
**What I would have asked:** [the question]
**What I decided:** [your decision]
**Why:** [reasoning]
**Risk if wrong:** [what breaks if user disagrees]
**How to fix:** [what to change if user wants different approach]
```

## TASK 4: Final commit

After ALL units are complete:
1. Make sure MANUAL-STEPS.md and QUESTIONS.md are committed
2. Do NOT push to remote

## Rules
- ZERO questions to user. Write them to QUESTIONS.md instead.
- Commit after each section (not batched).
- Follow all rules in CLAUDE.md.
- If a unit has no spec files at all (no claude-spec.md, no plan), skip it and note in QUESTIONS.md.
- If /deep-plan requires user interview answers, use your best judgment based on the project context and note decisions in QUESTIONS.md.
- Work until EVERYTHING is done.
