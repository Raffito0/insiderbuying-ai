# Platform Verdict Matrix — AI Freelancer Automation

**Date**: 2026-03-23 | **Full report**: [AUTOMATION-FEASIBILITY-REPORT.md](AUTOMATION-FEASIBILITY-REPORT.md)

---

## Verdict Table

| Platform | Anti-Bot | Best Method | API? | Ban Risk | Nav Reliability | Revenue/mo | **VERDICT** |
|----------|----------|-------------|------|----------|----------------|------------|-------------|
| **Freelancer.com** | Weak | REST API | Full (bids!) | 4/10 | 9/10 | €100-300 | **AUTOMATE** |
| **Apify Store** | N/A | Platform API | Full | 0/10 | 10/10 | €200-2000+ | **AUTOMATE** |
| **PeoplePerHour** | Unknown | Undocumented API | Partial | 5/10 | 5/10 | €50-100 | **CAUTIOUS** |
| **Upwork** | Cloudflare + FP | RSS + human click | Read-only | 8/10 | 3/10 | €200-500* | **MANUAL ONLY** |
| **Fiverr** | CF + PerimeterX | None viable | None | 10/10 | 1/10 | €200-500* | **MANUAL ONLY** |
| **Guru.com** | Unknown | Browser only | None | 6/10 | 3/10 | €20-50 | **SKIP** |
| **Contra** | Unknown | Browser only | None | 5/10 | 3/10 | €20-50 | **SKIP** |
| **Legiit** | Unknown | Browser only | None | 4/10 | 3/10 | €10-30 | **SKIP** |
| **SEOClerks** | Unknown | Browser only | None | 4/10 | 3/10 | €10-30 | **SKIP** |
| **Truelancer** | Unknown | Browser only | None | 4/10 | 3/10 | €20-50 | **SKIP** |
| **Workana** | Unknown | Browser only | None | 4/10 | 3/10 | €30-80 | **SKIP** |
| **Hubstaff Talent** | N/A | Job board (no bids) | None | 2/10 | N/A | €0 | **SKIP** |
| **Outsourcely** | N/A | N/A | N/A | N/A | N/A | **DEAD** | **DEAD** |
| **Pangian** | N/A | External links only | None | 1/10 | N/A | €0 | **SKIP** |

*\* Upwork/Fiverr revenue requires human proposal submission (~30 min/day)*

---

## Platform Summaries

### AUTOMATE (2 platforms)

**Freelancer.com** — The only major freelance marketplace with a public REST API that supports bid submission (`POST /bids`). 5+ existing auto-bid tools prove it works. Weaker anti-bot than Upwork/Fiverr. Main limitation: free accounts get only 6 bids/month (paid membership needed). Main risk: generic proposals get 0 replies — quality matters more than volume.

**Apify Store** — Completely different model: publish pre-built web scrapers as paid "Actors," earn 80% of revenue when others run them. Top creators make $10,000+/month. Zero ban risk — you're a developer on their platform, not a bot on someone else's. Aligns perfectly with data/scraping skills. Best ROI in the entire analysis.

### CAUTIOUS (1 platform)

**PeoplePerHour** — API exists (`api.peopleperhour.com`) but poorly documented with no public reference. PHP client on GitHub suggests basic functionality works. 15 proposals/month free. Could supplement Freelancer.com income but don't depend on it. Test the API before investing time.

### MANUAL ONLY (2 platforms)

**Upwork** — Has a GraphQL API but explicitly blocks automated proposal submission. Cloudflare + heavy device fingerprinting. $1M agency banned in 2025 with funds frozen. The ONLY proven safe approach is GigRadar-style: RSS monitoring → AI writes proposal draft → human reviews and clicks submit. Budget 15-30 min/day for this. Worth it — Upwork has the highest project volume and rates.

**Fiverr** — Dual anti-bot (Cloudflare + PerimeterX, hardest tier). No seller API exists. Government ID + phone verification mandatory. Accounts permanently banned "within hours" per multiple reports. Zero documented success cases for automation. Must be fully manual — but Fiverr buyers come to you (gig marketplace), so less proposal work needed.

### SKIP (9 platforms)

**Guru, Contra, Legiit, SEOClerks, Truelancer, Workana, Hubstaff Talent, Pangian** — No public APIs. Low project volume. Would require browser automation against unknown anti-bot systems. Combined potential revenue (~€100-200/mo) doesn't justify the automation development cost and ban risk. Key disqualifiers: SEOClerks is a service marketplace (nothing to bid on), Hubstaff Talent and Pangian link to external applications (nothing to automate in-platform), Workana is Spanish/Portuguese only, **Outsourcely is shut down** (confirmed dead by Tracxn).

---

## The Bottom Line

Of 14 platforms evaluated:
- **2** can be fully automated (14%)
- **1** might work with careful API exploration (7%)
- **2** require human involvement for bidding but are worth the time (14%)
- **9** should be skipped entirely (65%)

The "15-platform autonomous AI freelancer" is not feasible. The "3-platform hybrid agent + passive income" is viable and reaches €500/month by month 3.
