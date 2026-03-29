# EarlyInsider Content Engine — Implementation Requirements

## Overview
EarlyInsider.com SaaS with 16+ n8n workflows generating ~2,500 content pieces/month across 12 categories. Code exists (7 planning units completed, 515 tests passing), but needs 130 quality gaps fixed + 11 infrastructure changes + 27 new tools/methodologies integrated.

## Sources
- WORKFLOW-CHANGES.md — Master file: Part A (11 infra), Part B (130 gaps), Part C (completed), Part D (27 tools)
- PROMPT-WORKFLOW-FRAMEWORK.md — Prompts, workflows, quality gates for all 12 categories
- CONTENT-QUALITY-FRAMEWORK.md — 10/10 quality parameters per category
- CONTENT-GAPS-ALL.md — 130 gaps with file:line and exact fix per gap
- COST-OPTIMIZATION-FINAL.md — $20/month budget, AI routing Claude/DeepSeek

## Architecture
- Frontend: Next.js 16, React 19, TypeScript, Tailwind v4 on Netlify
- Backend: n8n self-hosted on VPS Hostinger
- Database: Supabase + NocoDB (replaces Airtable)
- AI: Claude Sonnet 4.6 ($11/mo, public content) + DeepSeek V3.2 ($1/mo, internal tasks)
- Data: SEC EDGAR + Finnhub free + Alpha Vantage free
- Visual: Puppeteer + Chart.js + node-canvas
- X Monitoring: twitterapi.io List polling ($6/mo)
- Email: Resend free + Gmail SMTP
- Push: OneSignal free
- Newsletter: Beehiiv free
- PDF: WeasyPrint
- Storage: Cloudflare R2

## Files to Modify (10 existing)
- generate-article.js (CAT 1), generate-report.js (CAT 2), generate-lead-magnet.js (CAT 3)
- reddit-monitor.js (CAT 4+5+6), x-engagement.js (CAT 7), x-auto-post.js (CAT 8)
- score-alert.js (CAT 9), analyze-alert.js (CAT 10)
- weekly-newsletter.js (CAT 11), send-outreach.js (CAT 12)

## New Files to Create
- edgar-parser.js, generate-chart.js, visual-templates.js, content-calendar.js

## Priority Groups
- P0 (BLOCKING): NocoDB migration, remove URL from outreach
- P1 (FOUNDATION): Chart.js, WeasyPrint, AI swap, EDGAR parser, Alpha Vantage
- P2 (VISUAL+CRITICAL): Visual engine, Reddit tone, X replies, Reddit Daily+DD, Scoring
- P3 (QUALITY): Articles, Reports, X Posts, Newsletter, Content calendar
- P4 (POLISH): Lead Magnet, Alert analysis, Outreach, Secondary infra

## Constraints
- Budget ~$20/month total
- Jest test runner (npx jest)
- n8n Code Node: pure JavaScript, require() only, no fetch global
- Target dir: ryan_cole/insiderbuying-site/
- Prompts from PROMPT-WORKFLOW-FRAMEWORK.md (don't invent new ones)
