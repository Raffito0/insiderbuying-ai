# InsiderBuying.ai — Content Quality Gaps (127 totali)

Ogni gap e una modifica da fare al codice per raggiungere il 10/10.
Riferimento: CONTENT-QUALITY-FRAMEWORK.md per i parametri target.

---

## CAT 1 — Articoli Finanziari (`generate-article.js`) — 12 gap

### GAP 1.1: Readability scale mismatch
**Framework**: Flesch-Kincaid Reading Ease 30-50 (finance-appropriate, college level)
**Codice**: Controlla FK Grade 8-10 (linea 385), che corrisponde a FK Ease ~60-70 — troppo facile per finance
**Fix**: Cambiare `seoScore()` per usare FK Ease 30-50 invece di FK Grade 8-10

### GAP 1.2: No 3-5 visual elements enforcement
**Framework**: 3-5 elementi visivi obbligatori (tabelle insider transaction, grafici prezzo, screenshot SEC)
**Codice**: Quality gate controlla solo `data_tables_count >= 1` per articoli tipo A (linea 309)
**Fix**: Aggiungere quality gate check per minimo 3 visual elements

### GAP 1.3: No 4-6 internal link enforcement
**Framework**: 4-6 link interni obbligatori (/alerts, /reports, /pricing, altri articoli)
**Codice**: SEO score da punti per >= 3 link ma nessun hard gate
**Fix**: Aggiungere quality gate hard check per minimo 4 internal link

### GAP 1.4: No CTA after 2nd paragraph check
**Framework**: CTA dopo il 2° paragrafo (non in fondo) + sticky mobile banner
**Codice**: Nessun check per posizionamento CTA
**Fix**: Aggiungere quality gate check per CTA nei primi 500 chars dell'HTML body

### GAP 1.5: No Schema.org generation
**Framework**: Schema.org Article + Person + FinancialProduct markup
**Codice**: Nessun JSON-LD schema generato
**Fix**: Aggiungere funzione `generateSchema()` che produce JSON-LD e lo include nell'output

### GAP 1.6: No track record section enforcement
**Framework**: Sezione track record per ogni insider ("last 5 buys: +34%, +12%...")
**Codice**: Non controllato nel quality gate
**Fix**: Aggiungere quality gate check che il body contenga dati track record

### GAP 1.7: No social proof injection
**Framework**: Social proof tipo "247 Pro subscribers tracking this insider"
**Codice**: Non presente
**Fix**: Aggiungere al system prompt o iniettare programmaticamente nell'HTML

### GAP 1.8: No SEC filing timeliness check
**Framework**: Pubblicare entro 24h dal filing (72h massimo)
**Codice**: Nessun confronto date tra filing_date e now
**Fix**: Aggiungere check `daysSinceFiling = now - filing_date`, warn se >24h, reject se >72h

### GAP 1.9: No TLDR placement enforcement
**Framework**: TLDR/Key Takeaways nei primi 200 parole
**Codice**: Key takeaways generati ma posizionamento non verificato
**Fix**: Quality gate check che key_takeaways o TLDR appaiano nei primi 200 words del body

### GAP 1.10: Deep analysis word range mismatch
**Framework**: 1,800-2,500 parole per deep analysis
**Codice**: "Long" e 2000-3000 (linea 22) — range troppo ampio
**Fix**: Restringere long range a 1800-2500, aggiornare quality gate word count

### GAP 1.11: Sentence length CV not a hard gate
**Framework**: Coefficiente di variazione > 0.45 obbligatorio
**Codice**: Usato come soft signal in AI detection (linea 478-489), non hard gate
**Fix**: Aggiungere come hard quality gate: se CV < 0.45, reject e retry

### GAP 1.12: Keyword density target mismatch
**Framework**: 0.5-1.5%
**Codice**: SEO score target 1.0-2.5% (linea 342)
**Fix**: Cambiare target a 0.5-1.5%

---

## CAT 2 — Report Premium (`generate-report.js`) — 12 gap

### GAP 2.1: Missing 4 of 9 required sections
**Framework**: 9 sezioni (Executive Summary, Investment Thesis bull+bear, Insider Activity Analysis, Financial Deep Dive, Peer Comparison, Risk Factors, Technical Analysis, Catalysts Timeline, Verdict con Confidence Score)
**Codice**: Solo 5 sezioni nel prompt (linea 138-143): Executive Summary, Key Findings, Detailed Analysis, Risk Assessment, Conclusion
**Mancano**: Investment Thesis (bull+bear), Insider Activity Analysis (tabella+timeline), Peer Comparison (spider chart), Technical Analysis (entry/exit), Catalysts Timeline (12 mesi)
**Fix**: Riscrivere `buildReportPrompt()` con struttura a 9 sezioni

### GAP 2.2: Word count far too low
**Framework**: 30-45 pagine = 9,000-13,500 parole minimo
**Codice**: Target 3000-5000 parole (linea 145) = solo 10-15 pagine
**Fix**: Aumentare target a 9000-13500 parole. Potrebbe servire chiamata AI multipla (sezione per sezione)

### GAP 2.3: Zero chart/visual generation
**Framework**: 40%+ contenuto visivo con grafici specifici (insider transaction timeline, revenue trend, valuation football field, peer comparison bar chart, risk/reward scatterplot)
**Codice**: Zero generazione grafici. Solo testo markdown convertito in HTML
**Fix**: Creare modulo chart generation (HTML→PNG via screenshot server, gia sul VPS) per ogni tipo di grafico

### GAP 2.4: No Helvetica Neue for headings
**Framework**: Helvetica Neue titoli + Georgia body. Max 3 colori
**Codice**: Georgia per tutto (linea 180)
**Fix**: Aggiungere Helvetica Neue nei CSS per h1, h2, h3

### GAP 2.5: No professional cover page
**Framework**: Copertina professionale con branding
**Codice**: Header div semplice (linea 177-198)
**Fix**: Creare template HTML cover page a pagina intera con gradient, ticker, verdict badge, branding

### GAP 2.6: No Confidence Score in verdict
**Framework**: Verdict con Confidence Score numerico
**Codice**: Conclusione generica senza score
**Fix**: Aggiungere al prompt: "End with a Verdict and a Confidence Score (1-100) with brief justification"

### GAP 2.7: No "What Others Missed" section
**Framework**: Sezione esplicita "What Others Missed"
**Codice**: Non nel prompt
**Fix**: Aggiungere al prompt come sezione 9.5 o integrata nel verdict

### GAP 2.8: No 5-page preview generation
**Framework**: 3.2% conversion con 5-page preview gratuita
**Codice**: Nessuna logica di preview
**Fix**: Aggiungere funzione che genera PDF troncato alle prime 5 pagine per preview pubblica

### GAP 2.9: No file size check
**Framework**: < 5MB per mobile
**Codice**: Nessuna validazione post-generazione
**Fix**: Aggiungere check file size dopo PDF generation, comprimere immagini se >5MB

### GAP 2.10: No header/footer branding on each page
**Framework**: Header/footer consistente su ogni pagina PDF
**Codice**: Solo un footer in fondo all'HTML (linea 192-193)
**Fix**: Aggiungere CSS `@page` con header/footer per rendering PDF

### GAP 2.11: No price tier differentiation
**Framework**: $14.99 = 30pg single ticker, $24.99 = 40pg + peer, $29.99 = 50pg+ settore
**Codice**: `determineReportParams()` differenzia per tipo ma non per tier/prezzo
**Fix**: Aggiungere logica tier-based per word count target e sezioni incluse

### GAP 2.12: No "free updates for 60 days" mention
**Framework**: "Free updates for 60 days" per earnings events
**Codice**: Non presente
**Fix**: Aggiungere all'email di delivery e al footer del report

---

## CAT 3 — Lead Magnet PDF (`generate-lead-magnet.js`) — 9 gap

### GAP 3.1: Far too short
**Framework**: 12-15 pagine
**Codice**: Target 1500-2000 parole (linea 164) = solo 5-6 pagine
**Fix**: Aumentare target a 4000-5000 parole. Aggiungere sezioni mancanti per arrivare a 12-15 pagine

### GAP 3.2: Missing sections
**Framework**: 7 sezioni incluse Methodology e 5-7 Case Studies con charts (8-10 pagine)
**Codice**: Ha 7 sezioni ma manca Methodology e Case Studies individuali con grafici
**Fix**: Aggiungere sezione Methodology. Espandere case studies con 1 grafico ciascuno

### GAP 3.3: Zero chart generation
**Framework**: 60%+ contenuto visivo
**Codice**: Dati chart embeddati come JSON comment (linea 237-255) ma NESSUN grafico reale generato. Solo 1 tabella HTML
**Fix**: Generare grafici via screenshot server (stessa approach OG cards). Almeno: top performers bar chart, cluster vs individual comparison, monthly returns line chart

### GAP 3.4: No CTA every 3 pages
**Framework**: CTA ogni 3 pagine, soft
**Codice**: Solo 1 CTA box alla fine (linea 289-293)
**Fix**: Inserire CTA box dopo sezione 2 e sezione 4 (ogni ~3 pagine)

### GAP 3.5: Title missing number + specific result
**Framework**: Titolo tipo "7 Insider Buys That Jumped 50%+"
**Codice**: Cover title generico "Insider Buying Backtest" (linea 280)
**Fix**: Generare titolo dinamico con numero + risultato dal dataset reale

### GAP 3.6: No Quick Wins summary page
**Framework**: Sezione 2 = 1 pagina bullet point Quick Wins
**Codice**: Non presente
**Fix**: Aggiungere pagina Quick Wins dopo la cover con 5-7 bullet dei risultati principali

### GAP 3.7: Font size not enforced for mobile
**Framework**: 12pt+ per mobile
**Codice**: CSS usa sizing default del browser
**Fix**: Aggiungere `font-size: 12pt` o `16px` al body CSS

### GAP 3.8: No worst performers table
**Framework**: Mostrare perdite con visual elements (onesta costruisce fiducia)
**Codice**: `worstPerformer` nei dati ma solo top 5 tabulati
**Fix**: Aggiungere tabella "Bottom 3 Performers" accanto a "Top 5 Performers"

### GAP 3.9: No "What If" portfolio simulation as visual
**Framework**: "What If You Followed Every Alert" come tabella/grafico visivo
**Codice**: Il prompt chiede il "What If" ma l'HTML lo rende solo come narrativa testuale
**Fix**: Aggiungere tabella/grafico con simulazione portfolio mese per mese

---

## CAT 4 — Reddit Replies (`reddit-monitor.js`) — 11 gap

### GAP 4.1: No subreddit-specific tone
**Framework**: 5 toni distinti (WSB=degenerato+dati, stocks=professionale, ValueInvesting=accademico/Graham/Buffett, Dividends=conservativo/yield, InsiderTrades=tecnico/filing)
**Codice**: Prompt identico per tutti i sub (linea 100-115). Dice "match r/{subreddit} tone" ma senza istruzioni specifiche
**Fix**: Creare mappa `SUBREDDIT_TONE_MAP` con prompt specifico, lunghezza, e stile per ogni sub. Iniettare nel prompt

### GAP 4.2: No per-subreddit word length
**Framework**: WSB 50-100 parole, stocks 100-150, ValueInvesting 150-200
**Codice**: "3-5 sentences" per tutti (linea 113)
**Fix**: Aggiungere `wordLimit` per sub nella mappa toni. Cambiare validazione da sentence count a word count

### GAP 4.3: Missing subreddits
**Framework**: r/ValueInvesting, r/Dividends, r/InsiderTrades obbligatori
**Codice**: Ha wallstreetbets, stocks, investing, SecurityAnalysis, stockmarket (linea 12-18). Mancano 3 sub critici
**Fix**: Aggiungere ValueInvesting, Dividends, InsiderTrades. Rimuovere SecurityAnalysis e stockmarket se non in target

### GAP 4.4: No structure rotation
**Framework**: 3 strutture in rotazione: Q-A-Data / Agreement-"However..."-Insight / Data-Interpretation-Question
**Codice**: Nessuna rotazione. Prompt unico
**Fix**: Aggiungere `getNextStructure()` con counter rotazione. Includere struttura scelta nel prompt

### GAP 4.5: No daily comment limit
**Framework**: Max 5-7 commenti/giorno distribuiti
**Codice**: Nessun contatore o enforcement
**Fix**: Aggiungere `checkDailyCommentLimit()` che legge log NocoDB per commenti odierni

### GAP 4.6: No reply timing delay
**Framework**: Reply 10-30 minuti dopo il post (non istantaneo)
**Codice**: Nessun delay
**Fix**: Aggiungere delay random 10-30 min prima di postare (o schedulare)

### GAP 4.7: No upvoting logic
**Framework**: Upvotare OP + 2-3 altri commenti
**Codice**: Non implementato
**Fix**: Aggiungere `upvoteContext()` che vota OP e 2-3 commenti casuali dopo aver postato

### GAP 4.8: No "Edit: update" after 2h
**Framework**: Tornare dopo 2h per "Edit: forgot to mention..."
**Codice**: Non implementato
**Fix**: Aggiungere job schedulato che dopo 2h edita il commento con update (se il commento ha upvote)

### GAP 4.9: No day skipping
**Framework**: Saltare 1-2 giorni a settimana
**Codice**: Nessuna logica di scheduling
**Fix**: Aggiungere `shouldSkipToday()` che salta random 1-2 giorni/settimana

### GAP 4.10: No anti-pump rule in prompt
**Framework**: "Never pump specific ticker"
**Codice**: Non presente nelle regole del prompt (linea 100-115)
**Fix**: Aggiungere regola "Never recommend buying or selling any specific stock" al prompt

### GAP 4.11: validateComment checks sentence count not word count
**Framework**: Lunghezza definita in parole per sub
**Codice**: Validazione per sentence count 3-5 (linea 151-159)
**Fix**: Cambiare validazione a word count con target per-subreddit

---

## CAT 5 — Reddit Daily Thread — 6 gap (INTERAMENTE NON IMPLEMENTATO)

### GAP 5.1: Entire category missing
**Framework**: Commento giornaliero nel daily thread con bullet point, ticker + insider + $amount
**Codice**: NESSUN codice dedicato. `reddit-monitor.js` gestisce solo reply a post esistenti
**Fix**: Creare funzione `buildDailyThreadComment()` in reddit-monitor.js o file nuovo

### GAP 5.2: No pre-market scheduling
**Framework**: 7:00-8:30 AM EST (3x engagement)
**Codice**: Non esiste
**Fix**: Aggiungere logica scheduling pre-market

### GAP 5.3: No 3-template rotation
**Framework**: "Notable buys" / "Insider confidence index" / "Unusual Form 4 activity"
**Codice**: Non esiste
**Fix**: Creare 3 template con rotazione giornaliera

### GAP 5.4: No weekend recap mode
**Framework**: Weekend = "Weekly insider recap" piu lungo
**Codice**: Non esiste
**Fix**: Aggiungere `buildWeekendRecap()` con formato diverso (piu lungo, summary settimanale)

### GAP 5.5: No 4-5 days/week scheduling
**Framework**: Non postare 7/7 — robots non prendono giorni off
**Codice**: Non esiste
**Fix**: Aggiungere `shouldPostDailyThread()` che salta 2-3 giorni random/settimana

### GAP 5.6: No reply-to-replies logic
**Framework**: Rispondere a 1-2 reply al proprio commento
**Codice**: Non esiste
**Fix**: Aggiungere check dopo 1-2h per reply al commento, rispondere a 1-2

---

## CAT 6 — Reddit Posts DD (`reddit-monitor.js`) — 6 gap (INTERAMENTE NON IMPLEMENTATO)

### GAP 6.1: Entire category missing
**Framework**: Post standalone DD 1500-2500 parole con TLDR, Thesis, Insider Activity table, Fundamental Analysis, Bear Case, Position, NFA
**Codice**: NESSUN codice per generare DD post. Solo reply a post esistenti
**Fix**: Creare funzione `buildDDPost()` con prompt per 1500-2500 parole, struttura DD

### GAP 6.2: No visual element generation for Reddit
**Framework**: 5-8 visivi (Bloomberg Terminal screenshots > TradingView > Excel)
**Codice**: Non esiste
**Fix**: Generare immagini dati via screenshot server, uploadare su Reddit o imgur

### GAP 6.3: No posting frequency limiter
**Framework**: Max 1 post ogni 3-4 giorni (8/mese)
**Codice**: Non esiste
**Fix**: Aggiungere `checkDDPostFrequency()` che controlla ultimo post e enforce 3-4 giorni gap

### GAP 6.4: No Tue-Thu scheduling
**Framework**: Tue-Thu, 10 AM - 2 PM EST
**Codice**: Non esiste
**Fix**: Aggiungere day-of-week + time-of-day filter

### GAP 6.5: No follow-up post logic after earnings
**Framework**: Follow-up post dopo earnings/catalyst per credibilita
**Codice**: Non esiste
**Fix**: Aggiungere job che detecta earnings passati per ticker di DD precedenti e genera follow-up

### GAP 6.6: No crosspost prevention
**Framework**: Mai crosspostare stesso DD su piu sub
**Codice**: Non esiste
**Fix**: Aggiungere tracking in NocoDB: `dd_post_id` + `subreddit` → reject se gia postato altrove

---

## CAT 7 — X Replies (`x-engagement.js`) — 11 gap

### GAP 7.1: No character length enforcement
**Framework**: 150-220 caratteri
**Codice**: Prompt dice "under 240 characters" (linea 67). Nessuna validazione output
**Fix**: Aggiungere `validateReply()` con check 150-220 chars. Se fuori range, retry o trim

### GAP 7.2: No data enrichment
**Framework**: Aggiungere DATO SPECIFICO dal SEC filing che il tweet non aveva
**Codice**: Il prompt riceve SOLO il testo del tweet (linea 58-69). Zero dati insider/SEC
**Fix**: Aggiungere parametro `filingContext` a `draftReply()` con ticker, insider_name, transaction_type, shares, value, date. Iniettare nel prompt

### GAP 7.3: No $CASHTAG enforcement
**Framework**: $CASHTAG sempre per discoverability
**Codice**: Nessuna menzione nel prompt, nessuna validazione
**Fix**: Aggiungere regola nel prompt + validazione post-generazione per presenza $TICKER

### GAP 7.4: No media attachment support
**Framework**: 40% reply con screenshot SEC filing (+35-50% engagement)
**Codice**: Solo testo, nessun supporto immagini
**Fix**: Aggiungere logica: 40% delle volte genera screenshot SEC filing via screenshot server, allega alla reply

### GAP 7.5: No archetype rotation
**Framework**: 3 archetipi in rotazione: Data Bomb / Contrarian Fact-Check / Pattern Reply
**Codice**: Prompt unico senza variazione (linea 58-69)
**Fix**: Creare `selectArchetype()` con counter. 3 prompt template diversi. Tracking ultimo archetipo usato

### GAP 7.6: No tone adaptation per target account
**Framework**: Tono adattato all'account target (serio per @WSJ, casual per @litquidity)
**Codice**: Prompt identico per tutti (linea 58)
**Fix**: Creare mappa `ACCOUNT_TONE_MAP` con tono per account. Iniettare nel prompt

### GAP 7.7: No daily reply cap
**Framework**: Max 15-20 reply/giorno
**Codice**: Zero rate limiting o daily count
**Fix**: Aggiungere `checkDailyReplyLimit()` che legge log per reply odierne

### GAP 7.8: No timing enforcement
**Framework**: Reply 3-5 min dopo tweet, mai istantanea (<30 sec)
**Codice**: Nessun timestamp comparison o scheduling
**Fix**: Aggiungere delay minimo 180s e massimo 300s dal tweet timestamp

### GAP 7.9: No emoji limit enforcement
**Framework**: Max 1 emoji professionale
**Codice**: Nessuna validazione
**Fix**: Aggiungere check emoji count in `validateReply()`

### GAP 7.10: No engagement farming
**Framework**: Likare tweet originale + 2-3 altre reply
**Codice**: Solo draft reply, nessun like logic
**Fix**: Aggiungere `engageFarm()` che lika tweet originale + 2-3 reply casuali prima/dopo postare

### GAP 7.11: Account age filter mismatch
**Framework**: Proprio account deve avere 6+ mesi
**Codice**: Filtra ALTRI account a 30 giorni (linea 14) — questo va bene per filtrare bot. Ma non valida il proprio account
**Fix**: Non critico — e un requisito di setup, non di codice. Documentare in MANUAL-STEPS.md

---

## CAT 8 — X Posts (`x-auto-post.js`) — 11 gap

### GAP 8.1: No format rotation
**Framework**: 4 tipi in rotazione: breaking news + screenshot, thread 2-3 tweet, market commentary, engagement bait (poll/domanda)
**Codice**: Solo singolo tweet da template (article o alert). Nessun thread, poll, o commentary
**Fix**: Creare `selectPostFormat()` con rotazione. Aggiungere `buildThread()`, `buildPoll()`, `buildCommentary()`

### GAP 8.2: No media support
**Framework**: CRITICO — immagine = 2-3x reach, video = 5x reach
**Codice**: `postToX()` (linea 109-120) invia solo testo. Zero media upload
**Fix**: Aggiungere Twitter media upload API. Generare card dati via screenshot server. Allegare a ogni tweet

### GAP 8.3: No hashtag support
**Framework**: 1-3 hashtag per topic piu ampi + $CASHTAG
**Codice**: Nessun hashtag
**Fix**: Aggiungere logica hashtag (#InsiderTrading, #Stocks, ecc.) + $CASHTAG gia presente

### GAP 8.4: Daily limit too high
**Framework**: 3-4/giorno ottimale, >6 = utenti ti mutano
**Codice**: `MAX_DAILY_POSTS = 10` (linea 13)
**Fix**: Ridurre a `MAX_DAILY_POSTS = 4`

### GAP 8.5: No timing logic
**Framework**: 4 finestre ottimali: market open 9:30, lunch 12:00, power hour 15:30, after market 18:00
**Codice**: Nessuno scheduling per time slot
**Fix**: Aggiungere `selectTimeSlot()` che assegna ogni post a una delle 4 finestre con jitter ±15 min

### GAP 8.6: No link-in-first-tweet check
**Framework**: Mai link nel primo tweet (reach killed)
**Codice**: Non controlla per URL nel testo generato
**Fix**: Aggiungere validazione: se tweet contiene http/www → reject. Link solo come reply

### GAP 8.7: No quote-retweet "second wave"
**Framework**: Quote-retweetare proprio post dopo 2-3 ore per second wave reach
**Codice**: Non implementato
**Fix**: Aggiungere job schedulato che dopo 2-3h quote-retweeta il tweet con un commento aggiuntivo

### GAP 8.8: No thread building
**Framework**: Thread = 2x follower gain vs single tweet
**Codice**: Solo singoli tweet
**Fix**: Creare `buildThread()` che genera 2-3 tweet collegati con dati progressivi

### GAP 8.9: Verdict map uses generic phrases
**Framework**: Numeri specifici SEMPRE, mai frasi generiche
**Codice**: `verdictMap` con frasi tipo "insiders are loading up" (linea 35-39) — generico
**Fix**: Sostituire verdict map con dati specifici dal filing: "$4.2M in 3 transactions" invece di "loading up"

### GAP 8.10: Brand jargon in alert tweets
**Framework**: Zero brand identity nei post
**Codice**: "This is a significance X/10 signal" (linea 94) — rivela automazione e brand
**Fix**: Rimuovere "significance X/10 signal". Sostituire con contesto naturale

### GAP 8.11: No structure variation
**Framework**: Variare struttura per anti-detection
**Codice**: Entrambe le funzioni producono formato identico ogni volta
**Fix**: Aggiungere 3-4 template in rotazione per article tweet e alert tweet

---

## CAT 9 — Alert Scoring (`score-alert.js`) — 8 gap

### GAP 9.1: No deterministic weighted scoring
**Framework**: 6 fattori con pesi espliciti (30%/25%/20%/15%/5%/5%) e valori puntuali
**Codice**: TUTTO delegato a Haiku LLM (linea 164-193). Nessuna formula deterministica
**Fix**: Creare `computeBaseScore()` con formula pesata. Usare Haiku solo come refinement layer (+/- 1 punto dal base score)

### GAP 9.2: No market-cap-aware thresholds
**Framework**: <$1B: $100K+, $1-10B: $500K+, >$10B: $1M+
**Codice**: Prompt dice genericamente "$500K+ notable, $1M+ significant" (linea 187). Nessun dato market cap
**Fix**: Aggiungere market cap lookup (Finnhub free). Passare al prompt e alla formula deterministica

### GAP 9.3: No 10b5-1 plan cap at 5
**Framework**: Piani pre-pianificati 10b5-1 = cap score a massimo 5
**Codice**: Prompt menziona option exercise ma nessun hard cap
**Fix**: Aggiungere `if (is10b5_1) score = Math.min(score, 5)` dopo scoring

### GAP 9.4: No exclusion logic
**Framework**: Gift/transfer = escluso, option exercise con vendita immediata = score 0
**Codice**: Tutti i filing processati senza filtro (linea 311)
**Fix**: Aggiungere pre-filtro: `if (transactionType === 'G' || transactionType === 'F') return null`

### GAP 9.5: No calibration enforcement
**Framework**: Score 8-10 deve essere 10-20% degli alert totali
**Codice**: Nessun tracking distribuzione, nessuna normalizzazione
**Fix**: Aggiungere logging distribuzione scores. Alert mensile se distribuzione e fuori target. Backtest automatico

### GAP 9.6: Cluster signal detail incomplete
**Framework**: 3+ in 7 giorni = +4, 2 in 7 giorni = +2, 3+ in 14 giorni = +2
**Codice**: Prompt dice solo "+3" genericamente per cluster (linea 188). Manca finestra 14 giorni
**Fix**: Aggiungere cluster 14-day window al prompt e alla formula deterministica con valori puntuali corretti

### GAP 9.7: No "days since last buy" timing factor
**Framework**: First buy in 2+ years = 3.1x signal
**Codice**: `computeTrackRecord()` ha i dati storici ma non calcola "days since last buy"
**Fix**: Aggiungere calcolo `daysSinceLastBuy` dal track record. Se >730 giorni → boost significativo

### GAP 9.8: No option exercise held vs sold distinction
**Framework**: Exercise mantenuta = +1, exercise + vendita immediata = 0
**Codice**: Non differenzia
**Fix**: Aggiungere logica: se filing ha sia buy (exercise) che sell nello stesso giorno → score 0 per quella transazione

---

## CAT 10 — Alert Analysis (`analyze-alert.js`) — 10 gap

### GAP 10.1: No word-count target by score
**Framework**: 8-10 = 200-250 parole, 6-7 = 150-200, 4-5 = 100-150
**Codice**: Prompt dice genericamente "2-3 paragraphs" (linea 29) per tutti gli score
**Fix**: Iniettare word count target nel prompt basato su `filing.significance_score`

### GAP 10.2: Prompt structure doesn't match framework
**Framework**: (1) Hook con numeri esatti, (2) Context con track record + 52-week + earnings, (3) What to Watch con catalyst + data
**Codice**: (1) TRADE SIGNAL, (2) HISTORICAL CONTEXT, (3) RISK FACTORS (linea 30-32)
**Fix**: Rinominare e ristrutturare: TRADE SIGNAL → Hook, HISTORICAL CONTEXT → Context (aggiungere 52-week e earnings), RISK FACTORS → What to Watch (catalyst + date). Spostare risk factors come sotto-sezione del Context

### GAP 10.3: No "What to Watch" section with catalyst dates
**Framework**: "earnings in 2 weeks", "FDA decision March 15"
**Codice**: Non presente nel prompt. Nessun dato catalyst passato
**Fix**: Aggiungere earnings date lookup. Passare `nextEarningsDate` e `daysTilEarnings` al prompt. Aggiungere sezione "What to Watch"

### GAP 10.4: No current price vs purchase price
**Framework**: Dato obbligatorio per contestualizzare la dimensione dell'acquisto
**Codice**: `price_per_share` presente ma non il prezzo corrente di mercato
**Fix**: Aggiungere Yahoo Finance/Finnhub lookup per prezzo corrente. Passare `currentPrice` al prompt

### GAP 10.5: No % portfolio increase data
**Framework**: "if available" — percentuale del portfolio dell'insider che l'acquisto rappresenta
**Codice**: Non fetchato o passato
**Fix**: Se disponibile dal filing SEC (shares owned after transaction), calcolare % increase

### GAP 10.6: No days-to-earnings data
**Framework**: Includere se <60 giorni
**Codice**: Non fetchato o passato
**Fix**: Stesso fix di GAP 10.3 — aggiungere earnings date lookup

### GAP 10.7: Validation too weak
**Framework**: Controllare word count range, cautionary language, numeri specifici, banned phrases
**Codice**: `validateAnalysis()` (linea 43-49) controlla solo >50 chars e >=2 paragrafi
**Fix**: Espandere validazione: word count per-score, check per almeno 1 frase cautionary, check per numeri specifici ($, %), banned phrase check ("guaranteed", "will moon", "insiders know more")

### GAP 10.8: No 300-word max enforcement
**Framework**: Mai >300 parole
**Codice**: Nessun upper bound
**Fix**: Aggiungere `if (wordCount > 300) retry` in `validateAnalysis()`

### GAP 10.9: No banned phrase checking
**Framework**: Mai "guaranteed", "will moon", "insiders know more than us"
**Codice**: Nessun check
**Fix**: Aggiungere lista banned phrases per analisi + check in validazione

### GAP 10.10: Missing cautionary balance check
**Framework**: Ogni analisi bullish DEVE avere almeno 1 frase di cautela
**Codice**: Il prompt chiede RISK FACTORS ma non valida che l'output li contenga
**Fix**: Aggiungere check in validazione: presenza di keyword cautelative ("however", "risk", "caution", "could", "10b5-1", "routine")

---

## CAT 11 — Newsletter (`weekly-newsletter.js`) — 16 gap

### GAP 11.1: gatherWeeklyContent() is a stub
**Framework**: Deve raccogliere articoli, alert, data study della settimana
**Codice**: Ritorna array vuoti (linea 17-30). Commento dice "In n8n, these would be actual HTTP calls"
**Fix**: Implementare query reali a NocoDB/Supabase per articoli e alert degli ultimi 7 giorni

### GAP 11.2: No 6-section structure
**Framework**: 6 sezioni specifiche (personal opener, top 3, deep dive, market context, what I'm watching, P.S.)
**Codice**: Solo intro + article cards + alert spotlight + CTA
**Fix**: Ristrutturare `assembleNewsletter()` con tutte 6 le sezioni

### GAP 11.3: Intro is generic
**Framework**: Personal opener "This week I'm watching..." con 50 parole di personalita
**Codice**: "Here is what insiders were buying and selling this week" (linea 60)
**Fix**: Generare intro personalizzato via AI con tono "smart friend"

### GAP 11.4: No AI-generated content
**Framework**: Deep dive 300 parole, market context 200 parole — servono AI
**Codice**: Solo string concatenation (linea 37-66), zero call AI
**Fix**: Aggiungere Claude/DeepSeek call per: personal opener, deep dive su #1 move, market context, what I'm watching

### GAP 11.5: No deep dive on #1 move
**Framework**: 300 parole sul move piu significativo della settimana
**Codice**: Non presente
**Fix**: Selezionare alert con score piu alto della settimana. Generare 300 parole via AI

### GAP 11.6: No market context section
**Framework**: 200 parole su contesto settore/macro
**Codice**: Non presente
**Fix**: Generare via AI con dati aggregati della settimana

### GAP 11.7: No "What I'm Watching" section
**Framework**: 150 parole su cosa guardare la prossima settimana
**Codice**: Non presente
**Fix**: Generare via AI basato su upcoming earnings + filing recenti

### GAP 11.8: No P.S. CTA
**Framework**: P.S. ha 3x CTR vs body links. 50 parole soft CTA
**Codice**: Solo un CTA block alla fine (linea 97-99), non in stile P.S.
**Fix**: Aggiungere sezione P.S. in fondo con testo personale tipo "P.S. — If you're not getting these alerts in real-time..."

### GAP 11.9: Subject line weak
**Framework**: A/B test sempre. Numeri specifici +15% open rate. Emoji. Preview text che completa il cliffhanger
**Codice**: Subject generico "This Week in Insider Buying" o template semplice (linea 49). No A/B. No emoji. Preview text generico
**Fix**: Generare 2 subject line via AI. Aggiungere emoji. Generare preview text che completa il cliffhanger

### GAP 11.10: No segmentation Free vs Pro
**Framework**: Free = top 3 moves + CTA upgrade. Pro = top 3 + 5 aggiuntivi + link analisi
**Codice**: Una sola versione per tutti
**Fix**: Generare 2 varianti HTML. Beehiiv supporta segmenti

### GAP 11.11: No word count targeting
**Framework**: 1,000-1,400 parole totali
**Codice**: Nessun controllo lunghezza
**Fix**: Aggiungere check lunghezza totale dopo assemblaggio

### GAP 11.12: No link count enforcement
**Framework**: Max 5-7 link totali (>1 link/100 parole = spam filter)
**Codice**: Article cards generano link illimitati
**Fix**: Limitare a max 5-7 link totali. Se piu articoli, linkare solo i top 3

### GAP 11.13: HTML not mobile-optimized
**Framework**: Single column, font 16px, 60% lettori su mobile
**Codice**: `max-width:600px` (linea 85) ma font size default
**Fix**: Aggiungere `font-size: 16px` al body CSS + meta viewport

### GAP 11.14: No referral program section
**Framework**: 12% partecipazione se reward rilevante
**Codice**: Non presente
**Fix**: Aggiungere sezione referral con Beehiiv referral link

### GAP 11.15: No A/B subject line testing
**Framework**: Sempre A/B test
**Codice**: Solo 1 subject generato
**Fix**: Generare 2 subject line. Usare Beehiiv A/B split (se supportato via API)

### GAP 11.16: No table for top 3 moves
**Framework**: Tabella con ticker/insider/amount/score
**Codice**: Article cards, non tabella alert
**Fix**: Aggiungere HTML table con top 3 insider moves della settimana

---

## CAT 12 — Outreach Emails (`send-outreach.js`) — 15 gap

### GAP 12.1: Word limit too high
**Framework**: 100-125 parole
**Codice**: Prompt dice "MAX 150 words" (linea 68), validazione >150 (linea 94)
**Fix**: Cambiare a "MAX 125 words" nel prompt e validazione a >125

### GAP 12.2: Banned phrases list incomplete
**Framework**: 21+ frasi bannate
**Codice**: 16 frasi (linea 4-21)
**Fix**: Aggiungere almeno 5 frasi mancanti: "just wanted to reach out", "I stumbled upon", "I am a huge fan", "big fan of your work", "as per our conversation"

### GAP 12.3: No subject line question format enforcement
**Framework**: Subject deve essere domanda: "Question about [titolo loro articolo]" (+22% open rate)
**Codice**: Prompt chiede "Subject: " ma non enforce formato domanda. Nessuna validazione
**Fix**: Aggiungere regola nel prompt: "Subject MUST be a question". Aggiungere validazione: subject contiene "?"

### GAP 12.4: No "from" display name
**Framework**: "Ryan from EarlyInsider" (+40% open rate vs brand name)
**Codice**: `buildSendPayload()` prende `fromEmail` (linea 134) ma non setta display name
**Fix**: Settare from come `"Ryan from EarlyInsider <ryan@earlyinsider.com>"`

### GAP 12.5: No reference to THEIR specific recent article
**Framework**: Aprire con riferimento SPECIFICO a un loro articolo recente
**Codice**: Prompt usa `prospect.notes` generico (linea 57). Nessun scraping articoli recenti
**Fix**: Aggiungere campo `recent_article_title` e `recent_article_url` al prospect record. O scraping automatico del loro sito

### GAP 12.6: Only 1 follow-up supported
**Framework**: 3 follow-up: Day 4-5 (stesso thread), Day 9-10 (nuovo thread, angolo diverso), Day 16 (ultimo check-in 1 frase)
**Codice**: `checkForFollowUps()` (linea 191-199) tratta follow-up come binario (fatto o no). Solo 1 follow-up
**Fix**: Cambiare a `followup_count` (0/1/2/3) con logica per 3 stadi diversi

### GAP 12.7: No follow-up timing variation
**Framework**: Day 4-5, Day 9-10, Day 16 — 3 finestre diverse
**Codice**: Singolo `daysSince` threshold (default 5)
**Fix**: Implementare 3 check separati per 3 follow-up con giorni diversi

### GAP 12.8: No Day 9-10 "new thread, different angle"
**Framework**: Secondo follow-up in thread NUOVO con angolo DIVERSO
**Codice**: `buildFollowUpPrompt()` fa sempre "Re: " (linea 171) = stesso thread
**Fix**: Creare `buildFollowUpPrompt2()` per day 9-10: nuovo subject, angolo diverso, nessun "Re: "

### GAP 12.9: No Day 16 "last check-in, 1 sentence"
**Framework**: Terzo follow-up = 1 frase sola
**Codice**: Follow-up prompt dice "2-3 sentences" (linea 169)
**Fix**: Creare `buildFollowUpPrompt3()` per day 16: 1 frase, "Last check-in, no worries if not interested"

### GAP 12.10: No timing enforcement
**Framework**: Tue-Thu, 10 AM timezone destinatario
**Codice**: Nessun check giorno/ora
**Fix**: Aggiungere `isValidSendTime()`: solo Tue-Thu, 9-11 AM (assumere EST se timezone sconosciuto)

### GAP 12.11: No daily send limit
**Framework**: Max 50-100/giorno dopo warm-up
**Codice**: Nessun rate limiting
**Fix**: Aggiungere `checkDailySendLimit()` con counter da NocoDB log

### GAP 12.12: No bounce rate tracking
**Framework**: >5% = reputazione dominio danneggiata
**Codice**: Nessun tracking bounce
**Fix**: Aggiungere tracking bounce da risposte SMTP. Alert se bounce rate >5%

### GAP 12.13: No domain warm-up awareness
**Framework**: 2-4 settimane, iniziare 5-10/giorno
**Codice**: Nessuna logica warm-up
**Fix**: Aggiungere `getWarmupLimit()`: se account age <14 giorni → max 5/giorno, <28 giorni → max 20/giorno, dopo → max 50/giorno

### GAP 12.14: URL in first email VIOLATES framework
**Framework**: Zero link nella prima email (spam filter)
**Codice**: Prompt include `ourArticle.url` (linea 62-63) — VIOLA direttamente la regola
**Fix**: RIMUOVERE URL dall'email prompt. Menzionare il dato dell'articolo ma senza link

### GAP 12.15: No social proof injection
**Framework**: "Our system tracks 1,500 insider trades per month" per siti nuovi
**Codice**: Nessun social proof nel prompt
**Fix**: Aggiungere riga al prompt: "Mention that we track over 1,500 SEC insider filings per month"

---

## VISUAL GENERATION GAPS (trasversale a piu categorie)

### GAP V.1: No data chart generation
**Riguarda**: CAT 1 (articoli), CAT 2 (report), CAT 3 (lead magnet), CAT 6 (Reddit DD), CAT 8 (X posts)
**Framework**: Grafici finanziari specifici (insider timeline, revenue trend, peer comparison, ecc.)
**Codice**: `generate-image.js` genera solo hero AI image + OG card. Zero data charts
**Fix**: Creare modulo `generate-chart.js` che usa screenshot server (gia sul VPS) per renderizzare grafici HTML→PNG. Tipi necessari: bar chart, line chart, transaction table, comparison table

### GAP V.2: No SEC filing screenshot generation
**Riguarda**: CAT 7 (X replies), CAT 8 (X posts)
**Framework**: Screenshot SEC filing come allegato per +35-50% engagement
**Codice**: Non esiste
**Fix**: Creare template HTML per SEC filing visual (ticker, insider, amount, date) → screenshot server → PNG. Allegare a reply/post X

### GAP V.3: No inline article images
**Riguarda**: CAT 1 (articoli)
**Framework**: 3-5 visual elements per articolo
**Codice**: Solo hero + OG (2 immagini). Zero immagini inline nell'articolo
**Fix**: Generare 1-3 data chart inline (insider transaction table, price chart con entry point, peer comparison) e inserirli nell'HTML dell'articolo
