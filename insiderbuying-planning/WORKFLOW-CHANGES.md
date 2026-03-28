# Modifiche da applicare ai workflow

Tutte le modifiche da fare al codice/workflow. Tre fonti:
1. Sessione review mattutina (28/03/2026)
2. Problem-solver-specialist (COST-OPTIMIZATION-FINAL.md)
3. Content Quality Framework + Gap Analysis (CONTENT-GAPS-ALL.md — 130 gap)

## Stato: DA APPLICARE (dopo prompt/workflow design per ogni categoria)

---

# PARTE A — Modifiche Infrastrutturali (costi + provider swap)

## A1. RIMUOVERE: Data Study PDF (W3)
**File**: `data-study.js`, `data-study.test.js`, workflow W3
**Azione**: Non importare su n8n. Ridondante col Lead Magnet.

## A2. AGGIUNGERE: Report Catalog Generator (W17 — nuovo)
**Azione**: Serve /deep-plan. Schedule 2x/settimana, seleziona ticker da insider activity + earnings + trend.

## A3. SWAP AI: Claude Sonnet + DeepSeek V3.2
**Tier 1 — Claude Sonnet** (~$11/mese): Articoli, Report, Lead Magnet, Reddit (tutto), X replies
**Tier 2 — DeepSeek V3.2** (~$1/mese): X posts, Alert scoring, Alert analysis, Newsletter, Outreach
**File da modificare**: tutti i 10 file di generazione contenuto (cambio endpoint + API key)

## A4. SWAP Dati: Financial Datasets → SEC EDGAR + Finnhub
**File**: `sec-monitor.js` + nuovo `edgar-parser.js`
**Edge case**: Form 4/A amended, derivative transactions, prezzo $0 (gift/opzioni), transazioni multiple per filing

## A5. SWAP SEO: DataForSEO → Ahrefs Free + Google KP
**File**: `select-keyword.js`

## A6. SWAP X Monitoring: twitterapi.io List Polling ($26 → $6)
**File**: `x-engagement.js` — List timeline endpoint + frequenza variabile

## A7. SWAP Immagini: kie.ai → Puppeteer OG Cards ($10 → $0)
**File**: `generate-image.js` — rimuovere kie.ai, usare Puppeteer template

## A8. MIGRARE: Airtable → NocoDB (BLOCCANTE)
**File**: tutti i file che chiamano Airtable API (sec-monitor, score-alert, analyze-alert, write-persistence, deliver-alert, x-auto-post, x-engagement, send-outreach, find-prospects)

## A9. VPS Condiviso: Hostinger ($20 → $0)
**Azione**: Verificare RAM >= 4GB con `free -h`

## A10. Ridurre Reddit volume (17 → 8-10/giorno)
**File**: `reddit-monitor.js`

## A11. FIX: Rimuovere doppio sitemap
**Azione**: Rimuovere `src/app/sitemap.ts`, tenere solo `next-sitemap`

---

# PARTE B — Content Quality Gaps (130 gap da CONTENT-GAPS-ALL.md)

**IMPORTANTE**: Prima di implementare i fix, serve il PROMPT & WORKFLOW DESIGN per ogni categoria (Parte C). Non fixare i gap senza aver prima definito il prompt e il flusso ottimale.

## CAT 1 — Articoli Finanziari (`generate-article.js`) — 12 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 1.1 | Readability scale | FK Ease 30-50 richiesto, codice usa FK Grade 8-10 | Cambiare scala in `seoScore()` |
| 1.2 | Visual elements | Minimo 3-5, codice check solo >=1 tabella | Hard gate per 3+ visual |
| 1.3 | Internal links | 4-6 richiesti, nessun hard gate | Hard gate per 4+ link interni |
| 1.4 | CTA placement | Dopo 2° paragrafo, non controllato | Check CTA nei primi 500 chars |
| 1.5 | Schema.org | Article + Person + FinancialProduct non generato | Creare `generateSchema()` |
| 1.6 | Track record | Sezione "last 5 buys" non enforced | Quality gate check |
| 1.7 | Social proof | "247 subscribers tracking" non presente | Iniettare nel prompt/HTML |
| 1.8 | Filing timeliness | No check 24h/72h da filing date | Check `daysSinceFiling` |
| 1.9 | TLDR placement | Non verificato nei primi 200 words | Quality gate check posizione |
| 1.10 | Word range | Long 2000-3000, framework dice 1800-2500 | Restringere range |
| 1.11 | Sentence CV | Soft signal, framework vuole hard gate >0.45 | Promuovere a hard gate |
| 1.12 | Keyword density | Target 1.0-2.5%, framework dice 0.5-1.5% | Cambiare target |

## CAT 2 — Report Premium (`generate-report.js`) — 12 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 2.1 | Sezioni mancanti | 5/9 presenti, mancano 4 (Investment Thesis, Peer Comparison, Technical Analysis, Catalysts Timeline) | Riscrivere prompt con 9 sezioni |
| 2.2 | Troppo corto | 3000-5000 parole vs 9000-13500 necessarie | Generazione sezione per sezione |
| 2.3 | Zero grafici | 40%+ visivo richiesto, zero generato | Modulo chart generation |
| 2.4 | Font headings | Georgia per tutto, serve Helvetica Neue titoli | CSS update |
| 2.5 | Cover page | Header div semplice, serve pagina intera | Template cover professionale |
| 2.6 | Confidence Score | Manca nel verdict | Aggiungere al prompt |
| 2.7 | "What Others Missed" | Sezione mancante | Aggiungere al prompt |
| 2.8 | 5-page preview | Nessuna preview generata | Funzione PDF troncato |
| 2.9 | File size check | Nessuna validazione <5MB | Check post-generazione |
| 2.10 | Header/footer pagina | Solo footer finale, no per-pagina | CSS `@page` |
| 2.11 | Price tier | Nessuna differenziazione $14.99/$24.99/$29.99 | Logica tier-based |
| 2.12 | "Free updates 60d" | Non menzionato | Aggiungere a email + footer |

## CAT 3 — Lead Magnet PDF (`generate-lead-magnet.js`) — 9 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 3.1 | Troppo corto | 1500-2000 parole vs 4000-5000 necessarie | Aumentare target |
| 3.2 | Sezioni mancanti | Manca Methodology + Case Studies individuali | Espandere prompt |
| 3.3 | Zero grafici | 60%+ visivo richiesto, solo 1 tabella | Generare grafici via screenshot server |
| 3.4 | CTA placement | Solo 1 alla fine, serve ogni 3 pagine | Inserire CTA dopo sezione 2 e 4 |
| 3.5 | Titolo generico | "Insider Buying Backtest" vs "7 Insider Buys That Jumped 50%+" | Generare titolo dinamico |
| 3.6 | Quick Wins page | Non presente | Aggiungere pagina bullet points |
| 3.7 | Font mobile | Default browser, serve 12pt+ | CSS font-size |
| 3.8 | Worst performers table | Solo top 5, manca bottom 3 | Aggiungere tabella |
| 3.9 | "What If" non visivo | Solo narrativa, serve tabella/grafico | Aggiungere visual simulation |

## CAT 4 — Reddit Replies (`reddit-monitor.js`) — 11 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 4.1 | Tone matching | Prompt identico per tutti i sub | Mappa `SUBREDDIT_TONE_MAP` |
| 4.2 | Word length per sub | "3-5 sentences" per tutti, serve WSB 50-100, stocks 100-150, ecc. | `wordLimit` per sub |
| 4.3 | Subreddit mancanti | Mancano ValueInvesting, Dividends, InsiderTrades | Aggiungere |
| 4.4 | Structure rotation | Nessuna rotazione Q-A-D / Agreement-However / Data-Q | `getNextStructure()` |
| 4.5 | Daily limit | Nessun cap | `checkDailyCommentLimit()` max 5-7 |
| 4.6 | Reply timing | Nessun delay | Delay 10-30 min |
| 4.7 | Upvoting | Non implementato | `upvoteContext()` |
| 4.8 | "Edit: update" | Non implementato | Job schedulato dopo 2h |
| 4.9 | Day skipping | Nessuna logica | `shouldSkipToday()` |
| 4.10 | Anti-pump rule | Non nel prompt | Aggiungere regola |
| 4.11 | Validazione parole | Check sentence count, serve word count | Cambiare validazione |

## CAT 5 — Reddit Daily Thread — 6 gap (NON ESISTE)

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 5.1 | Intera categoria | Zero codice | Creare `buildDailyThreadComment()` |
| 5.2 | Pre-market scheduling | Non esiste | Timing 7:00-8:30 AM EST |
| 5.3 | Template rotation | Non esiste | 3 template con rotazione |
| 5.4 | Weekend recap | Non esiste | `buildWeekendRecap()` |
| 5.5 | Day scheduling | Non esiste | 4-5 giorni/settimana |
| 5.6 | Reply-to-replies | Non esiste | Check dopo 1-2h |

## CAT 6 — Reddit Posts DD — 6 gap (NON ESISTE)

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 6.1 | Intera categoria | Zero codice | Creare `buildDDPost()` |
| 6.2 | Visual per Reddit | Non esiste | Generare immagini dati |
| 6.3 | Frequency limiter | Non esiste | Max 1 per 3-4 giorni |
| 6.4 | Scheduling | Non esiste | Tue-Thu 10AM-2PM EST |
| 6.5 | Follow-up post | Non esiste | Dopo earnings/catalyst |
| 6.6 | Crosspost prevention | Non esiste | Tracking in NocoDB |

## CAT 7 — X Replies (`x-engagement.js`) — 11 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 7.1 | Character enforcement | 150-220 chars, prompt dice "under 240" | Validazione 150-220 |
| 7.2 | Data enrichment | ZERO dati insider nel prompt | Aggiungere `filingContext` |
| 7.3 | $CASHTAG | Non menzionato ne validato | Regola prompt + validazione |
| 7.4 | Media attachment | Solo testo, +35-50% engagement con screenshot | Screenshot SEC filing |
| 7.5 | Archetype rotation | Prompt unico | 3 archetipi: Data Bomb / Contrarian / Pattern |
| 7.6 | Tone per account | Identico per tutti | Mappa `ACCOUNT_TONE_MAP` |
| 7.7 | Daily cap | Zero rate limiting | Max 15-20/giorno |
| 7.8 | Timing | Nessun delay | Min 180s, max 300s dal tweet |
| 7.9 | Emoji limit | Nessuna validazione | Max 1, check in validazione |
| 7.10 | Engagement farming | Solo reply, no like | Likare tweet + 2-3 reply |
| 7.11 | Account age | Filter 30d per altri, non per se | Documentare in MANUAL-STEPS |

## CAT 8 — X Posts (`x-auto-post.js`) — 11 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 8.1 | Format rotation | Solo singolo tweet template | 4 tipi: breaking, thread, commentary, poll |
| 8.2 | Media support | ZERO, critico (2-3x reach immagine, 5x video) | Twitter media upload + card generation |
| 8.3 | Hashtag | Nessuno | 1-3 hashtag + $CASHTAG |
| 8.4 | Daily limit alto | MAX=10, framework dice 3-4 | Ridurre a 4 |
| 8.5 | Timing | Nessuno scheduling | 4 finestre: 9:30, 12:00, 15:30, 18:00 EST |
| 8.6 | Link check | Non controlla URL nel testo | Validare no http/www |
| 8.7 | Quote-retweet | Non implementato | Job dopo 2-3h |
| 8.8 | Thread building | Non implementato | `buildThread()` 2-3 tweet |
| 8.9 | Verdict generico | "insiders are loading up" — generico | Dati specifici dal filing |
| 8.10 | Brand jargon | "significance X/10 signal" | Rimuovere |
| 8.11 | No variation | Formato identico sempre | 3-4 template rotazione |

## CAT 9 — Alert Scoring (`score-alert.js`) — 8 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 9.1 | No formula deterministica | TUTTO delegato a Haiku | `computeBaseScore()` con pesi 30/25/20/15/5/5 |
| 9.2 | No market cap | Threshold generico, serve per-size | Lookup Finnhub + formula |
| 9.3 | No 10b5-1 cap | Nessun hard cap a 5 | `Math.min(score, 5)` |
| 9.4 | No esclusioni | Gift/transfer processati | Pre-filtro transaction type |
| 9.5 | No calibrazione | Nessun tracking distribuzione | Logging + alert se fuori target |
| 9.6 | Cluster incompleto | Solo 7d +3, manca 14d | Aggiungere 14-day window |
| 9.7 | No "days since last buy" | Dati disponibili ma non calcolati | Calcolare da track record |
| 9.8 | No exercise held vs sold | Non distingue | Logica same-day buy+sell |

## CAT 10 — Alert Analysis (`analyze-alert.js`) — 10 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 10.1 | Word count per score | "2-3 paragraphs" generico | Target per score: 8-10=200-250, 6-7=150-200, 4-5=100-150 |
| 10.2 | Struttura mismatch | Trade Signal/Historical/Risk vs Hook/Context/What to Watch | Ristrutturare prompt |
| 10.3 | No "What to Watch" | Catalyst + date mancanti | Aggiungere earnings date lookup |
| 10.4 | No prezzo corrente | Solo purchase price, no market price | Yahoo/Finnhub lookup |
| 10.5 | No % portfolio | Non fetchato | Calcolare da shares owned after |
| 10.6 | No days-to-earnings | Non fetchato | Earnings date lookup |
| 10.7 | Validazione debole | Solo >50 chars e >=2 paragrafi | Espandere: word count, cautionary, numeri, banned |
| 10.8 | No 300-word max | Nessun upper bound | Aggiungere check |
| 10.9 | No banned phrases | Non controllate | Lista: "guaranteed", "will moon", "insiders know more" |
| 10.10 | No cautionary check | Non verifica presenza frasi cautelative | Check per "however"/"risk"/"caution" |

## CAT 11 — Newsletter (`weekly-newsletter.js`) — 16 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 11.1 | Data layer stub | `gatherWeeklyContent()` ritorna array vuoti | Implementare query NocoDB/Supabase |
| 11.2 | Struttura mancante | 2/6 sezioni presenti | Ristrutturare con tutte 6 |
| 11.3 | Intro generico | "Here is what insiders..." | AI-generated "This week I'm watching..." |
| 11.4 | Zero AI | Solo string concatenation | AI per opener, deep dive, market context, watching |
| 11.5 | No deep dive | Manca sezione 300 parole su #1 move | Selezionare top alert + AI |
| 11.6 | No market context | Manca sezione 200 parole | AI generation |
| 11.7 | No "What I'm Watching" | Manca sezione 150 parole | AI basato su upcoming earnings |
| 11.8 | No P.S. CTA | Solo CTA block, no stile P.S. (3x CTR) | Aggiungere P.S. testuale |
| 11.9 | Subject line debole | Generico, no A/B, no emoji, no preview cliffhanger | AI per 2 varianti + emoji |
| 11.10 | No segmentazione | Una versione per tutti | 2 HTML: Free vs Pro |
| 11.11 | No word count | Nessun controllo lunghezza | Check 1000-1400 parole |
| 11.12 | No link limit | Link illimitati | Max 5-7 link |
| 11.13 | Not mobile | Font default, no viewport | font-size 16px + viewport |
| 11.14 | No referral | Non presente | Sezione Beehiiv referral |
| 11.15 | No A/B subject | Solo 1 subject | 2 varianti per Beehiiv A/B |
| 11.16 | No alert table | Article cards, no tabella insider moves | HTML table top 3 moves |

## CAT 12 — Outreach Emails (`send-outreach.js`) — 15 gap

| # | Gap | Cosa manca | Fix |
|---|-----|-----------|-----|
| 12.1 | Word limit | 150, framework dice 100-125 | Cambiare a 125 |
| 12.2 | Banned phrases | 16/21 | Aggiungere 5+ |
| 12.3 | Subject format | No enforcement domanda | Validare "?" nel subject |
| 12.4 | From name | No display name | "Ryan from EarlyInsider" |
| 12.5 | No their article | Riferimento generico | Campo `recent_article_title` o scraping |
| 12.6 | Solo 1 follow-up | Framework dice 3 | `followup_count` 0/1/2/3 |
| 12.7 | No timing variation | Singolo threshold 5 giorni | 3 finestre: day 4-5, 9-10, 16 |
| 12.8 | No angolo diverso day 9 | Sempre "Re:" | Nuovo thread, angolo diverso |
| 12.9 | No 1 frase day 16 | "2-3 sentences" | Prompt ultra-corto |
| 12.10 | No day/time check | Nessun filtro | Solo Tue-Thu 10AM |
| 12.11 | No daily limit | Nessun rate limiting | Max 50-100/giorno |
| 12.12 | No bounce tracking | Nessuno | Tracking da SMTP response |
| 12.13 | No warm-up | Nessuna logica | `getWarmupLimit()` progressivo |
| 12.14 | URL in first email | VIOLA regola zero-link | RIMUOVERE URL dal prompt |
| 12.15 | No social proof | Non presente | Aggiungere "tracks 1,500 filings/month" |

## Visual Generation — 3 gap trasversali

| # | Gap | Riguarda | Fix |
|---|-----|---------|-----|
| V.1 | No data chart generation | CAT 1,2,3,6,8 | Creare `generate-chart.js` via screenshot server |
| V.2 | No SEC filing screenshot | CAT 7,8 | Template HTML SEC filing → PNG |
| V.3 | No inline article images | CAT 1 | 1-3 data chart inline nell'HTML articolo |

---

# PARTE C — Prompt & Workflow Design (DA FARE PRIMA DI IMPLEMENTARE)

**Per ognuna delle 12 categorie, servono:**

1. **Workflow steps**: la sequenza esatta (fetch dati → research → outline → draft → validate → visual → publish)
2. **Prompt ottimale**: il prompt completo per l'AI, con struttura, tono, esempi, regole, output format
3. **Data input**: quali dati servono e da dove vengono (SEC EDGAR, Finnhub, NocoDB, Supabase)
4. **Validazione**: quali check fare sull'output, in che ordine, quanti retry
5. **Visual**: quali elementi visivi generare e come (screenshot server, template HTML)

**Stato**: COMPLETATO — vedi PROMPT-WORKFLOW-FRAMEWORK.md per prompt, workflow, e content strategy di tutte 12 categorie.

---

# PARTE D — Tools, Metodologie, Tecniche da Implementare (dalla Ricerca 2)

Tutti a $0. Emersi dal cross-reference delle 5 ricerche parallele.

## D1. Librerie da installare

| # | Libreria | Cosa fa | Dove si usa | Come installare |
|---|----------|---------|-------------|----------------|
| D1.1 | **Chart.js + node-canvas** | Genera grafici PNG server-side (bar, line, radar, scatter) | Tutti i 15 template visual | `npm install chart.js canvas` sul VPS |
| D1.2 | **WeasyPrint** (Python) | HTML → PDF professionale con header/footer per pagina, TOC | Report Premium, Lead Magnet | `pip install weasyprint` sul VPS |
| D1.3 | **Cheerio** (Node.js) | Scraping blog dei prospect per personalizzazione outreach | CAT 12 Outreach | `npm install cheerio` (gia in devDependencies) |
| D1.4 | **Flesch-Kincaid** (JS) | Calcolo readability score nel quality gate articoli | CAT 1 Articoli | Implementare formula in Code Node (~20 righe) |

## D2. API gratuite da integrare

| # | API | Cosa fa | Dove si usa | Integrazione |
|---|-----|---------|-------------|-------------|
| D2.1 | **Alpha Vantage Free** | Earnings calendar, fundamentals, quotes (500 call/giorno) | CAT 1, 2, 10, 11 | HTTP Request node. Serve per "What to Watch" (data prossimo earnings) |
| D2.2 | **Google Alerts** (RSS) | Monitor ticker + competitor automatico via feed | CAT 1, 8, 11 | RSS Feed Reader node in n8n → trigger articoli/tweet su breaking news |
| D2.3 | **Imgur API** | Hosting gratuito immagini per post Reddit | CAT 6 Reddit DD | HTTP Request node: upload PNG, ricevi URL per markdown inline |
| D2.4 | **QuickEmailVerification** | Verifica email prima di mandare outreach (100/giorno gratis) | CAT 12 Outreach | HTTP Request node prima di ogni send. Bounce rate <5% protegge dominio |
| D2.5 | **Google Search Console API** | Index request dopo pubblicazione articolo | CAT 1 Articoli | HTTP Request node post-publish per indicizzazione immediata |

## D3. Metodologie di generazione (prompt engineering)

| # | Tecnica | Dove | Cosa migliora | Come implementare |
|---|---------|------|---------------|-------------------|
| D3.1 | **Persona nominata** | CAT 1, 2 | "Ryan Chen, ex-Goldman" batte "you are an analyst" — tono piu consistente | Cambiare system prompt: nome + background specifico |
| D3.2 | **Multi-step: outline → draft** | CAT 1, 2, 6 | Articolo piu strutturato, meno ripetizioni | 2 call Claude: outline 200 token → draft completo |
| D3.3 | **Bear case in call separata** | CAT 2, 6 | Forza AI a scrivere bear case genuino, non tokenistico | Call dedicata con prompt "argue AGAINST this ticker" |
| D3.4 | **TLDR generato per ultimo** | CAT 6 | TLDR e riassunto reale del draft, non anticipazione inventata | Generare TLDR dopo il draft completo |
| D3.5 | **Executive Summary per ultimo** | CAT 2 | Riassume accuratamente perche ha visto tutte le sezioni | Generare dopo le 9 sezioni |
| D3.6 | **Negative few-shot** | CAT 4, 7 | Mostrare "questo e un commento BOT, NON farlo cosi" | Aggiungere esempi negativi nel prompt |
| D3.7 | **Visual placeholders inline** | CAT 1 | `{{VISUAL_N}}` nell'HTML body permette visual inline senza step separati | Prompt chiede di inserire 3-5 `{{VISUAL_N}}` nel testo |

## D4. Metodologie di validazione

| # | Metodo | Dove | Cosa previene | Come implementare |
|---|--------|------|---------------|-------------------|
| D4.1 | **Content freshness checker** | CAT 1, 6, 8 | Previene contenuto ripetitivo sullo stesso ticker | Query NocoDB: "articolo su $TICKER negli ultimi 30 giorni?" → IF yes, skip o angolo diverso |
| D4.2 | **Cosine similarity checker** | CAT 1 | Previene che 3 articoli su $NVDA dicano la stessa cosa | Confronta embedding nuovo articolo vs ultimi 10 pubblicati. Se similarity >0.85, reject |
| D4.3 | **Second AI review call** | CAT 4, 6 | Ultimo check anti-AI detection | Call: "Rate this text for human-likeness 1-10. If <7, suggest specific fixes." |
| D4.4 | **Calibrazione scoring settimanale** | CAT 9 | Score inflation (se >20% sono 8+, il sistema perde significato) | Weekly Code Node: query distribuzione, Telegram alert se fuori target |
| D4.5 | **Losers section length check** | CAT 3 | Lead magnet che nasconde le perdite = credibilita persa | Code Node: if losers_section_words < 500, reject e retry |
| D4.6 | **Math verification** | CAT 3, 9 | "What If" portfolio simulation con numeri sbagliati = disaster | Calcolare TUTTO nel Code Node deterministicamente, passare risultati all'AI per narrativa |

## D5. Metodologie di engagement

| # | Metodo | Dove | Cosa migliora | Come implementare |
|---|--------|------|---------------|-------------------|
| D5.1 | **Engagement farming pre-reply** | CAT 7 | +visibilita algoritmica per la propria reply | Likare tweet originale + 2-3 altre reply PRIMA di postare la propria (X API) |
| D5.2 | **AMA comment post-DD** | CAT 6 | +engagement e credibilita sul post DD | Postare "AMA — happy to discuss the bear case" 5-10 min dopo il DD |
| D5.3 | **Quote-retweet scheduling** | CAT 8 | "Second wave" di reach 2-3h dopo il tweet | Job schedulato che quote-retweeta con contesto aggiuntivo ("Update: now up 3%") |
| D5.4 | **"Edit: update" sui commenti** | CAT 4, 5 | Segnale di comportamento umano + aggiorna il dato | Job schedulato 2h dopo il commento: edita con update se ha ricevuto upvote |
| D5.5 | **Upvote OP + 2-3 commenti** | CAT 4 | Segnale di utente attivo, non bot | Reddit API: upvote OP + 2-3 commenti random dopo aver postato |
| D5.6 | **Reply to replies** | CAT 5, 6 | Segnale di utente presente e responsive | Check dopo 1-2h, rispondere a 1-2 reply al proprio commento/post |

## D6. Design resources ($0)

| # | Risorsa | Cosa fa | Dove si usa |
|---|---------|---------|-------------|
| D6.1 | **Google Fonts — Inter** | Font sans-serif professionale per tutti i template visual | 15 template visual |
| D6.2 | **Color palette dark navy** | `#0A1128` bg, `#1A2238` secondary, `#28A745` green, `#DC3545` red, `#FFC107` yellow | Tutti i visual |
| D6.3 | **Chart.js annotation plugin** | Aggiunge marker "CEO bought here ↓" sui grafici prezzo | Template 5 (Price Chart) |
| D6.4 | **Chart.js dark theme config** | Tick `#CCC`, grid `#333`, backdrop `#0A1128` | Tutti i chart |

## D7. Content calendar & competitive intelligence ($0)

| # | Metodo | Cosa fa | Come implementare |
|---|--------|---------|-------------------|
| D7.1 | **Content calendar NocoDB** | Tabella con: planned content, ticker, type, status, publish date, channel | Nuova tabella NocoDB `Content_Calendar` |
| D7.2 | **Competitor RSS monitoring** | Monitorare Unusual Whales, MarketBeat, Seeking Alpha per capire cosa pubblicano | Google Alerts RSS + n8n RSS Reader → log in NocoDB |
| D7.3 | **Earnings calendar integration** | Alpha Vantage/Finnhub earnings calendar per pianificare contenuto pre-earnings | Weekly fetch → popola Content_Calendar con "earnings preview" per ticker rilevanti |

---

# Ordine di implementazione suggerito

| Priorita | Cosa | Perche |
|----------|------|--------|
| **P0** | A8 — Airtable → NocoDB | BLOCCANTE, esplode in 24 giorni |
| **P0** | 12.14 — RIMUOVERE URL in outreach email | VIOLA regola zero-link, danneggia deliverability |
| **P1** | D1.1 — Installare Chart.js + node-canvas | Prerequisito per tutti i 15 template visual |
| **P1** | D1.2 — Installare WeasyPrint | Prerequisito per Report Premium + Lead Magnet PDF |
| **P1** | A3 — AI provider swap (Claude + DeepSeek) | Determina tutti i prompt |
| **P1** | A4 — SEC EDGAR parser | Core business: alert senza dati = niente |
| **P1** | D2.1 — Alpha Vantage earnings calendar | Prerequisito per "What to Watch" in CAT 10, 11 |
| **P2** | V.1-V.3 + D6 — Visual generation system | Trasversale: 15 template, design system, chart config |
| **P2** | CAT 4 — Reddit tone matching (D3.6 negative few-shot) | Rischio shadowban senza. Impatto piu grande |
| **P2** | CAT 7 — X Replies (7.2 data enrichment + 7.4 visual + 7.5 archetipi) | Da reply vuote a reply con dati + screenshot |
| **P2** | CAT 5+6 — Reddit Daily + DD (NUOVI, con D5.2 AMA + D3.3 bear case separato) | Categorie interamente mancanti |
| **P2** | CAT 9 — Scoring deterministico (D4.4 calibrazione + D4.6 math verification) | Score accurati = trust = retention |
| **P3** | CAT 1 — Article quality gates (D3.1 persona + D3.2 multi-step + D3.7 visual placeholders + D4.1 freshness) | Gia 70%, serve polish al 95% |
| **P3** | CAT 2 — Report Premium (D3.3 bear case + D3.5 exec summary last + D1.2 WeasyPrint) | Cliente PAGA, qualita 10/10 |
| **P3** | CAT 8 — X Posts media + format (D5.3 quote-retweet + 4 formati + visual) | Reach 2-5x con media |
| **P3** | CAT 11 — Newsletter (6 sezioni + D2.1 earnings calendar + A/B subject) | Data layer e stub, 4 sezioni mancano |
| **P3** | D7 — Content calendar + competitive intelligence | Pianificazione e monitoring competitor |
| **P4** | CAT 3 — Lead Magnet (D4.5 losers check + D4.6 math verification) | Gia parzialmente funzionante |
| **P4** | CAT 10 — Alert analysis (What to Watch + prezzo corrente) | Gia parzialmente funzionante |
| **P4** | CAT 12 — Outreach (D1.3 Cheerio scraping + D2.4 email verification + 3 follow-up) | Gia parzialmente funzionante |
| **P4** | A5-A7, A9-A11 — Altre infra | Ottimizzazione costi secondaria |
| **P4** | D4.2 — Cosine similarity checker | Nice-to-have per evitare ripetizioni |
