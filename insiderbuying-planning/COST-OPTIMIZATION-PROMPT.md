# Prompt per /problem-solver-specialist

Copia tutto quello sotto la linea e incollalo nella nuova chat dopo aver invocato /problem-solver-specialist:

---

## Problema

Ho un progetto SaaS chiamato InsiderBuying.ai — un sito che manda alert in tempo reale quando insider (CEO, CFO, Director) comprano azioni della propria azienda (SEC Form 4 filings). Il sito ha anche un blog SEO con articoli finanziari, newsletter settimanale, e presenza social su X e Reddit.

Il codice è TUTTO già scritto e committato (7 planning units, 515 test che passano). Ma ho scoperto che il costo mensile stimato inizialmente ($40) era sbagliato — il piano originale costava $250-430/mese. Il mio budget è $50/mese massimo.

Ho già trovato alternative più economiche che portano il costo a ~$60-77/mese, ma voglio esplorare se esistono soluzioni migliori che non ho considerato per mantenere la qualità massima spendendo il meno possibile.

## Architettura Attuale

### Stack
- **Frontend**: Next.js 16.2.1, React 19, TypeScript, Tailwind v4, SSR su Netlify
- **Backend**: n8n (self-hosted su VPS Hostinger), 16+ workflow automatizzati
- **Database**: Supabase (auth + DB) + NocoDB (content DB) + Airtable (workflow state)
- **Payments**: Stripe ($24/mese o $228/anno)
- **Email**: Resend (transactional + alert)
- **Push**: OneSignal
- **Newsletter**: Beehiiv
- **Storage**: Cloudflare R2

### I 3 Pilastri del Business

#### 1. DATI FINANZIARI (SEC Insider Trading Alerts)
**Cosa serve**: Rilevare in tempo reale quando un insider compra/vende azioni → analizzare il filing → dare uno score di significatività → mandare alert via email + push ai subscriber Pro.

**Piano costoso ($50-100/mese)**: Financial Datasets API — dati strutturati JSON, endpoint insider trading.

**Alternativa trovata ($0)**: SEC EDGAR diretto (RSS feed per nuovi filing + XML parsing del Form 4) + Finnhub free tier (prezzo azioni, profilo azienda). EDGAR è la fonte originale — Financial Datasets prende da lì. Latenza <1 secondo.

**Dubbio**: Il parsing XML del Form 4 richiede ~100 righe Python. È robusto? Ci sono edge case che non ho considerato? C'è qualcosa di meglio?

#### 2. SEO (Keyword Research per Blog)
**Cosa serve**: Trovare keyword con volume e difficulty per scrivere articoli che rankano. ~20 keyword/settimana.

**Piano costoso ($50-100/mese)**: DataForSEO — volumi esatti, keyword difficulty precisa, SERP analysis.

**Alternativa trovata ($0)**: Ahrefs Free Keyword Generator (KD + related keywords, unlimited) + Google Keyword Planner (volumi in range, account Ads $0 spend). I volumi sono range (1K-10K) non numeri esatti.

**Dubbio**: Per un sito nuovo che parte da zero, i range bastano? Ci sono tool gratuiti migliori che non ho considerato? Google Search Console serve solo DOPO che sei indicizzato.

#### 3. SOCIAL MONITORING (X/Twitter)
**Cosa serve**: Monitorare 15-25 account grossi nella nicchia finance/insider trading su X. Quando postano, commentare tra i primi 5-10 (entro 3-5 minuti). L'algoritmo di X premia pesantemente le reply precoci.

**Piano costoso ($200/mese)**: X API Basic tier — polling timeline, ma quota 50K tweet/mese si esaurisce in ore con 25 account.

**Alternativa trovata (~$26/mese)**: twitterapi.io — scraper API, poll ogni 5 minuti, $0.00012/call vuota. 25 account × 288 check/giorno = ~$26/mese.

**Dubbio**: Esiste qualcosa di più economico? Un modo per abbassare il numero di call senza perdere latenza? Un approccio completamente diverso che non ho considerato?

### Costi AI

**Piano costoso ($80-150/mese)**: Claude Sonnet per articoli finanziari + analisi alert + social copy + newsletter.

**Alternativa trovata ($4-19/mese)**: DeepSeek V3.2 con cache aggressiva. Qualità scrittura ~15% inferiore a Claude per articoli finanziari.

**Altre opzioni considerate**:
- Gemini 2.5 Flash-Lite: $9.40/mese (50M input + 11M output)
- Gemini 2.5 Flash: $42.50/mese
- Gemini 2.0 Flash: DEPRECATO, muore giugno 2026
- Groq (Llama 3.3): free tier troppo limitato (100K token/giorno)

**Dubbio**: C'è un modo per avere qualità Claude a prezzo DeepSeek? Routing intelligente (Claude solo per articoli, DeepSeek per il resto)? Prompt caching? Batch API con sconto?

### Tabella Costi Attuale (piano economico)

| Voce | Costo/mese |
|------|-----------|
| VPS Hostinger (n8n + NocoDB + Puppeteer) | $20 |
| twitterapi.io (25 account, 5-min poll) | $26 |
| kie.ai Nano Banana (hero images, ~90/mese) | $10 |
| Cloudflare R2 | $2 |
| DeepSeek V3.2 (con cache) | $4-19 |
| Supabase | $0 (free tier) |
| Netlify | $0 (free tier) |
| Resend | $0 (free tier, 100/giorno) |
| OneSignal | $0 (free tier) |
| Beehiiv | $0 (free tier) |
| Finnhub | $0 (free tier) |
| SEC EDGAR | $0 (government data) |
| Ahrefs Free + Google KP | $0 |
| **TOTALE** | **$62-77/mese** |

### Volume Contenuti Generati (TUTTI i pezzi che il sistema produce)

#### Giornaliero
| Contenuto | Quantita/giorno | AI Model | Token output stimati |
|-----------|----------------|----------|---------------------|
| Blog articles (2000-5000 parole) | 3 | Claude Sonnet | ~25K |
| Hero images (1200x630) | 3 | kie.ai Nano Banana | - |
| OG cards (1200x630) | 3 | Screenshot server | - |
| SEC alert scan (Form 4 filing) | 40-50 processati | Haiku (score) + Sonnet (analisi score≥4) | ~15K |
| Alert email (score≥6) | 12-25 | Template, no AI | - |
| Alert push notification (score≥6) | 12-25 | Template, no AI | - |
| X posts (articoli + alert) | 7-10 | Haiku (280 char) | ~3K |
| X engagement replies | 3-7 | Haiku (280 char) | ~2K |
| Reddit comments | 2-5 | Sonnet (quality) | ~3K |
| Outreach emails + follow-up | 10 + ~2 | Haiku (150 parole) | ~5K |

#### Settimanale
| Contenuto | Quantita/settimana | AI Model |
|-----------|-------------------|----------|
| Newsletter | 1 (lunedi 7AM EST) | Haiku |
| SEO monitoring report | 1 (Telegram summary) | No AI (Google Search Console) |

#### Mensile
| Contenuto | Quantita/mese | AI Model |
|-----------|--------------|----------|
| Report pre-generati per catalogo /reports (25-50 pagine) | ~8 (2/settimana) | Sonnet |
| Custom report on-demand (comprato da cliente) | 1-5 | Sonnet |
| Lead Magnet PDF gratuito (4-6 pagine) | 1 (fine mese) | Sonnet |

#### Totali mensili
| Tipo | Volume/mese |
|------|------------|
| Blog articles | 90 |
| Hero images | 90 |
| OG cards | 90 |
| SEC filing processati | 1,200-1,500 |
| Alert email | 360-750 |
| Alert push | 360-750 |
| X posts | 210-300 |
| X replies | 90-210 |
| Reddit comments | 60-150 |
| Outreach emails + follow-up | 360 |
| Newsletter | 4-5 |
| Report catalogo (pre-generati, venduti infinite volte) | ~8 |
| Custom report on-demand | 1-5 |
| Lead Magnet PDF | 1 |
| SEO report | 4-5 |
| **TOTALE pezzi di contenuto** | **~2,500-3,400/mese** |

**Nota**: I report pre-generati (~8/mese) NON sono ancora nel workflow. Il codice attuale (generate-report.js / W15) gestisce solo report on-demand triggerati da Stripe. La generazione automatica del catalogo report è un task separato da pianificare dopo l'ottimizzazione costi.

### Budget Target: $50/mese massimo

Devo tagliare ~$15-27 dal piano attuale, oppure trovare alternative completamente diverse che non ho considerato.

## Cosa Voglio Da Te

1. **Analizza ogni voce di costo**: c'è un'alternativa migliore/più economica che non ho considerato?
2. **Immagini AI**: kie.ai a $10/mese è necessario? Posso usare Unsplash/Pexels stock gratis? O generare con un modello gratuito?
3. **AI routing**: ha senso usare Claude SOLO per gli articoli (la cosa che richiede più qualità) e DeepSeek/Gemini per tutto il resto? Quanto costerebbe?
4. **VPS**: $20/mese per Hostinger è il minimo? Ci sono VPS più economici che reggono n8n + NocoDB + Puppeteer?
5. **twitterapi.io**: c'è un modo per ridurre i costi sotto $15/mese mantenendo latenza ≤5 minuti?
6. **Approcci non convenzionali**: webhooks, RSS, Telegram bots, browser extensions, o qualsiasi altro metodo creativo che riduce i costi senza sacrificare il core business.
7. **Cosa tagliare vs cosa tenere**: se devo stare a $50, cosa sacrifico con meno impatto sul business?

## File Rilevanti nel Progetto
- `ryan_cole/insiderbuying-planning/MANUAL-STEPS.md` — tutti gli step manuali
- `ryan_cole/insiderbuying-planning/QUESTIONS.md` — decisioni prese autonomamente
- `ryan_cole/insiderbuying-site/.env.example` — tutti i servizi utilizzati
- `ryan_cole/insiderbuying-planning/01-infrastructure/` — Supabase, Stripe, NocoDB, SSR, deploy
- `ryan_cole/insiderbuying-planning/03-dexter-content-engine/` — Blog, articoli, immagini, SEO
- `ryan_cole/insiderbuying-planning/04-sec-alerts-system/` — Alert SEC Form 4
- `ryan_cole/insiderbuying-planning/06-newsletter-social/` — Newsletter, X, Reddit
- `ryan_cole/insiderbuying-planning/07-outreach-seo/` — Outreach, SEO monitoring
- `ryan_cole/insiderbuying-site/n8n/code/` — Tutti i code node n8n
