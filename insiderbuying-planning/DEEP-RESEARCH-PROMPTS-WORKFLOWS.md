# Deep Research: Prompt & Workflow Design per 12 Categorie di Contenuto

Copia tutto sotto la linea `---` e usalo come prompt per la deep research.

---

## Contesto

Sto costruendo EarlyInsider.com — un SaaS di insider trading intelligence. Il prodotto ha 3 componenti:

1. **Alert Pro ($24/mese o $228/anno)**: Alert in tempo reale quando insider comprano/vendono azioni (SEC Form 4)
2. **Report a pagamento ($14.99-$29.99)**: PDF 30-45 pagine, analisi finanziaria completa su ticker/settore
3. **Lead Magnet gratuito**: Report mensile con backtest degli alert del mese precedente

**Canali**: Blog SEO, X (@insiderbuying), Reddit (6 subreddit finance), Newsletter Beehiiv, Cold outreach email.

**AI Stack**: Claude Sonnet 4.6 per contenuto pubblico (articoli, report, Reddit, X replies), DeepSeek V3.2 per task interni (scoring, newsletter, outreach, X posts). Prompt caching su Claude per risparmiare.

**Target**: Retail investor americano, 25-55 anni, investe attivamente in azioni individuali.

**Infrastructure**: n8n workflows su VPS, Puppeteer screenshot server per visual generation, NocoDB per content DB, Supabase per auth/user data.

### Tipi di contenuto (NON solo insider buying)

I dati SEC insider sono il nostro edge, ma i contenuti coprono tutto il finance:

1. **Insider Activity** (core) — CEO/CFO/Director buy/sell, cluster buying, track record
2. **Earnings** — risultati trimestrali, sorprese EPS, guidance updates
3. **Market Commentary** — cosa sta succedendo oggi, settori in trend, market movers
4. **Macro** — Fed, tassi, inflazione, job data, come impattano i titoli
5. **Sector Analysis** — trend settoriali CON angolo insider ("healthcare insiders buying aggressively")
6. **Contrarian Takes** — "everyone bearish on $TICKER but 3 insiders just loaded up"
7. **Educational** — "how to read a Form 4", "what cluster buying means", "why CEO buys > CFO buys"
8. **News Reaction** — commentare breaking news con angolo insider

**Il differenziante**: anche quando parliamo di earnings, macro, o settori, aggiungiamo SEMPRE l'angolo insider ("And by the way, the CFO bought $3M two weeks before this report"). Questo e cio che ci distingue da tutti gli altri.

### Template Visual Necessari (15 tipi)

Tutti generati con: HTML/Chart.js template con dati → Puppeteer screenshot server (gia sul VPS) → PNG. Zero costo API.

| # | Template | Usato in | Contenuto |
|---|----------|----------|-----------|
| 1 | Data Card | X posts | Sfondo dark navy, ticker grosso, insider name+title, amount, date, verdict badge, branding |
| 2 | SEC Filing Mini Card | X replies | Versione compatta: ticker + insider + amount + date |
| 3 | Comparison Card | X replies | "Last time this insider bought → +34% in 6 months". Then vs Now |
| 4 | Insider Transaction Table | Articoli, Reddit DD, Report | Tabella formattata con tutte le transazioni: date, shares, price, value |
| 5 | Price Chart con Entry Point | X posts, Articoli, Reddit DD, Report | Grafico prezzo con marker "CEO bought here ↓" |
| 6 | Cluster Visual | X posts | 3+ insider stesso ticker: tabella con tutti gli insider, date, amount |
| 7 | Peer Comparison Bar Chart | Reddit DD, Report | Insider buying activity per ticker nello stesso settore |
| 8 | Portfolio Simulation Line Chart | Lead Magnet | Cumulativo mese per mese "What If You Followed" |
| 9 | Revenue/Margin Trend Line | Report | Ultimi 8 trimestri revenue + margini |
| 10 | Valuation Football Field | Report | Range valuation con DCF, multiples, comps |
| 11 | Spider Chart (peer) | Report | Radar chart metriche vs competitor |
| 12 | Earnings Card | X posts, X replies | Ticker + EPS actual vs estimate + revenue + surprise % |
| 13 | Market Movers Card | X posts | Top 3-5 ticker del giorno con % change + insider angle |
| 14 | Educational Infographic | X posts, Reddit DD | "How to read a Form 4" visual explainer |
| 15 | Contrarian Card | X posts, X replies | "Everyone says SELL, but insiders say BUY" con dati |

## Cosa Devo Sapere — Per Ogni Categoria

Ho gia definito i parametri 10/10 per ogni categoria (cosa deve avere l'output). Ora devo sapere COME arrivarci: il prompt migliore, il workflow ottimale, la pipeline dati, la validazione.

---

### CAT 1 — Articoli Finanziari (Blog SEO)

**Scopo**: Rankare su Google per query come "NVDA insider buying 2026". Convertire lettore → newsletter → Pro.
**Risultato**: Articolo 1800-2500 parole con dati SEC veriSi
ficabili, verdict BUY/SELL/CAUTION, 3-5 visual, passa AI detection.
**AI Model**: Claude Sonnet con prompt caching.
**Tipi di contenuto**: Non solo insider buying — anche earnings analysis, sector trends, educational, contrarian takes. Sempre con angolo insider.

Domande:
- Qual e la struttura di prompt migliore per articoli finance lunghi che passano AI detection? (system prompt con persona? few-shot example? chain-of-thought outline prima poi draft?)
- E meglio generare l'articolo in UN SOLO prompt o in step separati? (outline → expand each section → add tables? O tutto in un colpo?)
- Come passare i dati finanziari all'AI? (JSON strutturato? Markdown table? Testo libero con numeri inline?)
- Come forzare l'AI a citare numeri specifici dal filing invece di generalizzare?
- Come forzare il verdict a essere coraggioso e non generico?
- Come generare le visual inline (tabelle insider, price chart)? L'AI le genera come HTML table nel body o servono step separati con screenshot server?
- Come fare il quality gate automatico? (regex banned phrases? word count? check numeri citati? AI detection score?)
- Come forzare varieta tra articoli sullo stesso ticker?
- Come gestire il prompt caching con Claude? (system prompt cachato, user prompt variabile?)
- Come gestire i diversi tipi di articolo (insider activity vs earnings vs sector analysis vs educational)? Prompt diversi o condizionali nello stesso prompt?
- Fornisci un ESEMPIO COMPLETO di system prompt + user prompt per un articolo su insider buying di un CEO

### CAT 2 — Report Premium ($14.99-$29.99)

**Scopo**: Il cliente ha PAGATO. Deve pensare "vale i soldi". Upsell a Pro 18%.
**Risultato**: PDF 30-45 pagine, 9 sezioni, 40% visivo, qualita investment bank.
**AI Model**: Claude Sonnet.

Domande:
- Un report 9000-13500 parole e troppo per una singola call. Come spezzarlo? (sezione per sezione? outline poi expand?)
- Qual e il workflow ottimale? (gather data → outline → expand sections → generate charts → assemble PDF?)
- Come mantenere coerenza tra sezioni generate separatamente? (passare sezioni precedenti come contesto? Summary?)
- Come generare i 5 tipi di grafici finanziari? (Chart.js server-side? HTML template → screenshot?)
- Come garantire executive summary leggibile standalone? (generarlo per ultimo come "riassumi tutto in 4-6 frasi"?)
- Il prompt deve ricevere dati grezzi o pre-analizzati?
- Come gestire il Confidence Score nel verdict? (AI o formula?)
- Fornisci un ESEMPIO di prompt per la sezione "Investment Thesis (Bull + Bear Case)"

### CAT 3 — Lead Magnet PDF

**Scopo**: Visitatore lascia email. Deve pensare "se il gratis e cosi, il Pro e incredibile". Conversione → Pro: 4.2%.
**Risultato**: PDF 12-15 pagine con backtest reale (wins E losses).
**AI Model**: Claude Sonnet.

Domande:
- Come strutturare il prompt per forzare onesta sulle perdite? (AI tende a minimizzare loss)
- Il "What If" e calcolo matematico — AI o noi?
- Come generare case study individuali? Un prompt per tutti o uno per case study?
- Come rendere il CTA soft ma efficace?
- Come generare titolo dinamico ("7 Insider Buys That Jumped 50%+")? Calcoliamo noi o AI dai dati?
- Come generare i 3 grafici del backtest? (Chart.js → screenshot server?)
- Fornisci un ESEMPIO di prompt per la sezione "The Losers — Where Our Signals Failed"

### CAT 4 — Reddit Replies

**Scopo**: Sembrare redditor vero. Upvote → profile visit → discovery organica.
**Risultato**: Commento 50-200 parole con dato insider, tono perfetto per il sub.
**AI Model**: Claude Sonnet (redditor detectano AI).
**Tipi di contenuto**: Non solo insider — anche earnings reaction, sector comment, contrarian take, educational tip. Sempre con angolo insider.

Domande:
- Come fare prompt diversi per 5 subreddit? (5 system prompt? Conditional nel prompt? Mappa toni?)
- Come iniettare il dato insider in modo naturale? ("I was looking through Form 4s yesterday and...")
- Come forzare la rotazione di struttura? (Q-A-Data / Agreement-However-Insight / Data-Interpretation-Question)
- Servono few-shot examples reali PER SUBREDDIT nel prompt?
- Come validare il tono? (secondo prompt AI? Check lessicale per slang/emoji?)
- Come gestire post non-insider? (earnings, macro, sector — il commento aggiunge l'angolo insider come extra)
- Come variare il timing automaticamente? (delay 10-30 min)
- Fornisci un ESEMPIO COMPLETO di prompt per una reply su r/wallstreetbets con dato insider
- Fornisci un ESEMPIO COMPLETO di prompt per una reply su r/ValueInvesting con dato insider

### CAT 5 — Reddit Daily Thread

**Scopo**: Essere "il tizio degli insider" nel daily. Credibilita giorno dopo giorno. Dopo 30+ giorni: 12% profile view rate.
**Risultato**: Commento mattutino 80-150 parole con 2-4 ticker e dati insider.

Domande:
- Come selezionare i 2-4 filing piu interessanti di ieri? (score piu alto? Piu insoliti? Mix large+small cap?)
- I 3 template devono avere prompt AI diversi o basta variare l'intro?
- Il commento deve essere AI-generated o template con dati iniettati? ("$TICKER: [Name] ([Title]) bought $[Amount]" — serve AI?)
- Come fare il weekend recap?
- Come decidere quali giorni saltare?
- Come variare il contenuto? (non solo insider — a volte earnings recap, a volte macro + insider angle)
- Fornisci un ESEMPIO dei 3 template giornalieri con dati realistici

### CAT 6 — Reddit Posts (DD/Analisi)

**Scopo**: Post virale da 200-500 follower. DD autorevole. Build credibilita lungo termine.
**Risultato**: Post 1500-2500 parole, Reddit markdown, TLDR, bear case, position disclosure, 5-8 visual.
**AI Model**: Claude Sonnet.
**Tipi di DD**: Non solo insider buying — anche "earnings deep dive + what insiders did before", "sector rotation + where insiders are moving money", "contrarian DD — everyone hates $TICKER but insiders love it"

Domande:
- Prompt migliore per DD Reddit-style? (tono: "passionate retail investor who did their homework", non "AI analyst")
- Come generare bear case convincente? (AI troppo bullish — come forzare genuinita?)
- Come generare tabella insider in Reddit markdown?
- Come decidere su quale ticker fare la DD? (insider activity? Keyword trending? Ticker non coperto?)
- Come generare TLDR che fa venire voglia di leggere?
- Position disclosure senza posizione reale?
- Come generare immagini per Reddit? (upload su Reddit? imgur? inline?)
- Follow-up post dopo earnings?
- Come variare i tipi di DD? (insider-focused vs earnings-focused vs sector-focused vs contrarian)
- Fornisci un ESEMPIO COMPLETO di prompt per una DD su insider buying cluster con bear case

### CAT 7 — X Replies

**Scopo**: Tra i primi 10 reply su tweet di account 50K-500K follower. Profile click → follow → discovery.
**Risultato**: Reply 150-220 chars con dato specifico, in <5 min dal tweet.
**AI Model**: Claude Sonnet.
**Tipi di reply**: Non solo insider — anche earnings reaction ("earnings beat + insider bought $3M before"), market commentary + insider angle, contrarian data point, educational fact.

Domande:
- Prompt per reply CORTE e DENSE? (AI verbosa — come forzare 150-220 chars con dato?)
- Come passare contesto tweet + dato insider?
- I 3 archetipi (Data Bomb / Contrarian Fact-Check / Pattern Reply): 3 prompt diversi o "use archetype X"?
- Come generare screenshot SEC filing per 40% reply? (template HTML mini card → screenshot → PNG?)
- Come decidere QUALI tweet meritano reply? (menziona ticker con filing? O qualsiasi tweet finance?)
- Come gestire tweet non-insider? (earnings tweet → aggiungere angolo insider. Macro tweet → "interesting, and by the way 3 tech CEOs bought this week")
- Tone matching per account target? (mappa statica 25 account? O AI analizza tweet?)
- Engagement farming (like tweet + reply) prima o dopo?
- Quando allegare la Comparison Card ("last time → +34%") vs la SEC Filing Mini Card?
- Fornisci un ESEMPIO di prompt per ogni archetipo (Data Bomb, Contrarian, Pattern)

### CAT 8 — X Posts

**Scopo**: Costruire follower e credibilita. Reach massimo con media (2-3x immagine, 5x video).
**Risultato**: 3-4 tweet/giorno, mix formati, media allegato.
**AI Model**: DeepSeek V3.2 (task piu semplice, dato fa il lavoro).
**Tipi di contenuto**: Insider alert, earnings reaction, market movers, sector insight, educational, contrarian take, engagement (poll/question).

Domande:
- 4 formati (breaking, thread, commentary, poll): 4 prompt separati o dispatcher?
- Per thread (2-3 tweet): AI genera tutti in un colpo o uno per volta?
- Come generare Data Card visiva? (template HTML dark navy → screenshot → PNG)
- Come decidere quale formato per ogni post? (rotazione? Basato su tipo dato?)
- Come evitare che tweet sembrino template? (randomizzare struttura?)
- Come schedulare i 4 tweet nelle 4 finestre (9:30, 12:00, 15:30, 18:00)?
- Quote-retweet dopo 2-3 ore: prompt separato?
- Come gestire i poll? (AI genera opzioni? O noi da dati?)
- Come variare i tipi di contenuto? (non tutti insider — alternare con earnings, macro, educational)
- Quando usare Data Card vs Earnings Card vs Market Movers Card vs Contrarian Card?
- Fornisci un ESEMPIO di prompt per ogni formato (breaking, thread, commentary, poll) con tipo di contenuto diverso

### CAT 9 — Alert Scoring

**Scopo**: Score 1-10 accurato. Determina quali alert ricevono i Pro. Score sbagliato = fiducia persa.
**Risultato**: Score deterministico (6 fattori pesati) + refinement AI.
**AI Model**: DeepSeek V3.2 (classificazione, non scrittura).

Domande:
- Come combinare scoring deterministico e AI? (formula per base score, AI +/- 1 punto?)
- Come implementare formula pesata (30/25/20/15/5/5)?
- Come gestire market cap threshold? (lookup Finnhub → if/else soglia?)
- Come implementare calibrazione? (logging distribuzione → alert se >20% sono 8+?)
- Prompt AI per refinement: "base score is X, consider qualitative factors, adjust -1/0/+1 only"?
- Come detectare 10b5-1? (indicato nel Form 4? Lookup separato?)
- Come computare "days since last buy"?
- Come gestire filing con transazioni multiple?
- Fornisci un ESEMPIO della formula deterministica completa con numeri

### CAT 10 — Alert Analysis

**Scopo**: Spiegare PERCHE un trade e significativo. Il motivo per cui pagano Pro.
**Risultato**: 100-250 parole (variabile per score), Hook + Context + What to Watch.
**AI Model**: DeepSeek V3.2.

Domande:
- Prompt per analisi di lunghezza variabile? ("target: 200-250 words" per score 8-10?)
- Come forzare "What to Watch" con data specifica? (passare nextEarningsDate, dire "MUST mention"?)
- Come bilanciare bullish e cautionary?
- Come forzare citazione track record?
- Come validare numeri specifici? (regex $, %, date?)
- Come forzare unicita tra 10 alert stesso settore?
- Quanto contesto passare? (solo filing corrente? Ultimi 5 alert stesso ticker?)
- Fornisci un ESEMPIO COMPLETO di prompt per alert score 9 (CEO cluster buy $5M)

### CAT 11 — Newsletter

**Scopo**: Tenere subscriber engaged. Free → Pro (2.3%). Pro → retention. Open rate: 35%+.
**Risultato**: Email 1000-1400 parole, 6 sezioni, tono "smart friend", A/B subject, Free vs Pro.
**AI Model**: DeepSeek V3.2.

Domande:
- 6 sezioni: un prompt per tutta la newsletter o prompt separato per ogni sezione?
- Come ottenere tono "smart friend"? (persona: "You are Ryan, write as if emailing a friend..."?)
- Come generare 2 subject line per A/B? ("Generate 2: one with number, one curiosity gap"?)
- Come selezionare "move della settimana" per deep dive?
- Come generare "What I'm Watching" senza inventare? (passare earnings prossima settimana?)
- Come segmentare Free vs Pro?
- P.S. CTA: AI o template fisso?
- Come integrare referral program?
- Fornisci un ESEMPIO COMPLETO di prompt per generare la newsletter con tutte 6 le sezioni

### CAT 12 — Outreach Emails

**Scopo**: Backlink, guest post, citazioni. Response rate: 8-12%. Build autorita SEO.
**Risultato**: Email 100-125 parole, personalizzata, riferimento al LORO articolo, 1 dato nostro, CTA domanda.
**AI Model**: DeepSeek V3.2.

Domande:
- Come personalizzare automaticamente? (scraping blog? Campo manuale?)
- Come generare dato specifico che li interessa?
- Come fare 3 follow-up con toni diversi? (3 prompt separati?)
- Come gestire warm-up progressivo?
- Come validare subject domanda? (check "?"?)
- Come evitare reply duplicate?
- Come scegliere CTA? (guest post vs link swap vs "can I send data"?)
- Come gestire bounce? (SMTP 550 → mark invalid?)
- Fornisci un ESEMPIO COMPLETO di prompt per prima email + 3 follow-up

---

## Visual Template Design — Domande Specifiche

Per OGNUNO dei 15 template visual, devo sapere:

### Principi generali
- Qual e il design language che i top account finance su X usano? (colori, font, layout)
- Dark mode vs light mode: quale performa meglio su X finance?
- Dimensioni ottimali per X (post e reply)? Per Reddit? Per blog inline?
- Come rendere i grafici leggibili su mobile (schermo piccolo)?
- Font sans-serif o serif per data card finance?

### Per ogni template specifico:

**Template 1 — Data Card (X posts)**
- Che layout usa @unusual_whales per le loro card? Dimensioni? Colori?
- Quali info devono essere nella card e in che ordine visivo?
- Come rendere il verdict badge visivamente forte?
- Fornisci un ESEMPIO di layout HTML/CSS per una data card dark navy

**Template 2 — SEC Filing Mini Card (X replies)**
- Quanto deve essere piccola per funzionare come reply attachment?
- Deve avere branding o no? (reply con branding = promozionale?)
- Fornisci un ESEMPIO di layout

**Template 3 — Comparison Card (X replies)**
- Layout "then → now" efficace?
- Come mostrare il return % in modo visivamente impattante?

**Template 4 — Insider Transaction Table (Articoli, Reddit DD, Report)**
- Quante colonne: date, insider, title, type, shares, price, value, shares_after?
- Alternating row colors?
- Come gestire tabelle con 10+ transazioni?

**Template 5 — Price Chart con Entry Point (multiplo uso)**
- Chart.js o altra libreria? Server-side rendering come?
- Come annotare "CEO bought here ↓"?
- Timeframe default? (1Y? 6M? Dall'ultimo buy?)
- Candlestick o line chart?

**Template 6 — Cluster Visual (X posts)**
- Come visualizzare 3-5 insider che comprano lo stesso ticker?
- Timeline orizzontale o lista verticale?
- Mostrare somma totale prominente?

**Template 7 — Peer Comparison (Reddit DD, Report)**
- Bar chart orizzontale o verticale?
- Quanti peer? (3-5?)
- Metriche da confrontare?

**Template 8 — Portfolio Simulation (Lead Magnet)**
- Line chart cumulativo mese per mese?
- Mostrare benchmark (S&P 500) per confronto?
- Come gestire periodi di perdita visivamente?

**Template 9 — Revenue/Margin Trend (Report)**
- Dual axis (revenue + margin %) o charts separati?
- Quanti trimestri? (8?)
- Come mostrare trend direction?

**Template 10 — Valuation Football Field (Report)**
- Range bar chart orizzontale con 3-4 metodi valutazione?
- Come mostrare prezzo corrente vs range?

**Template 11 — Spider Chart (Report)**
- Quante dimensioni? (5-7?)
- Quali metriche? (growth, profitability, value, momentum, quality, insider conviction?)
- Radar chart leggibile con 2 aziende sovrapposte?

**Template 12 — Earnings Card (X posts, replies)**
- Layout: ticker + EPS beat/miss + revenue beat/miss + guidance?
- Come mostrare beat (verde) vs miss (rosso) visivamente?
- Aggiungere insider angle nel card? ("CEO bought $2M before earnings")

**Template 13 — Market Movers Card (X posts)**
- Top 3 o top 5 ticker?
- Mostrare % change + insider activity per ognuno?
- Layout: lista verticale compatta?

**Template 14 — Educational Infographic (X posts, Reddit DD)**
- Stile: flowchart? Step-by-step? Annotated SEC form screenshot?
- Lunghezza: 1 immagine o carousel multi-immagine?
- Come rendere Form 4 comprensibile per retail investor?

**Template 15 — Contrarian Card (X posts, replies)**
- Come visualizzare "market says X, insiders say Y"?
- Split screen? Vs icon? Before/after?
- Come mostrare il dato contrarian in modo impattante?

---

## n8n Workflow Architecture — Step, Validazione, Branching per ogni categoria

Per ogni categoria, devo sapere qual e la struttura ottimale del workflow n8n. Non solo "genera il contenuto" ma tutti gli step intermedi: fetch dati, pre-processing, generazione, validazione, retry, visual generation, pubblicazione.

n8n usa nodi collegati in sequenza con branch condizionali (IF node), loop (SplitInBatches), e Code node per logica custom.

### Per OGNI categoria (1-12), devo sapere:

**Architettura workflow**:
- Quanti step servono dal trigger alla pubblicazione?
- Quali step sono sequenziali (devono aspettare il precedente) e quali possono essere paralleli?
- Dove servono branch condizionali (IF node)? (es. se score < 4 → skip analisi)
- Dove servono retry con feedback? (es. articolo non passa quality gate → retry con motivo del fallimento nel prompt)
- Dove servono step di validazione/quality gate tra una fase e l'altra?

**Data fetching (primi step)**:
- Quante API call servono prima di poter generare il contenuto? (SEC EDGAR + Finnhub + NocoDB + Supabase?)
- Come aggregare i dati in un formato unico per il prompt? (merge node? Code node che assembla JSON?)
- Quali dati sono obbligatori vs opzionali? (se Finnhub non risponde, skippiamo o usiamo fallback?)

**Generazione AI (step centrali)**:
- Una singola AI call o multi-step? Per ogni step, cosa riceve in input e cosa produce?
- Se multi-step: lo step 2 riceve l'output dello step 1 come contesto?
- Come implementare il retry con feedback? (step 1 genera → step 2 valida → se fail, step 3 rigenera con feedback "il problema era X, correggi"?)
- Serve un "outline" step prima del "draft" step? Per quali categorie?

**Validazione (step post-generazione)**:
- Quali check sono in Code node (regex, word count, banned phrases, link count)?
- Quali check necessitano una seconda AI call? (es. "This article sounds too AI-generated, rewrite sections 2 and 4 to be more natural")
- Come implementare il quality gate? (IF node: passa → continua, non passa → loop back a generazione con feedback?)
- Quanti retry massimi prima di abortire? (2? 3? Dipende dalla categoria?)

**Visual generation (step paralleli o sequenziali)**:
- I visual devono essere generati DOPO il testo (perche dipendono dai dati nel testo) o in PARALLELO (perche usano gli stessi dati di input)?
- Come integrare screenshot server nel workflow? (HTTP Request node a localhost:3456?)
- Come assemblare testo + immagini nel contenuto finale? (per articoli: inserire img tag nell'HTML? Per X: allegare media all'API call?)

**Pubblicazione (step finali)**:
- Quali check fare prima di pubblicare? (duplicate check? Rate limit check? Timing check?)
- Serve approval umano (Telegram) o e tutto automatico?
- Come gestire il fallimento della pubblicazione? (retry? Queue? Alert?)

### Domande specifiche per categoria:

**CAT 1 — Articoli**: quanti step tra "keyword selezionato" e "articolo pubblicato"? Serve step SEO check separato (keyword density, meta tag, internal links) prima della pubblicazione? Il quality gate (14 check) deve essere un singolo Code node o nodi separati? Come funziona il retry con feedback ("article failed check #3: not enough data tables — regenerate with more tables")?

**CAT 2 — Report Premium**: come gestire la generazione sezione-per-sezione in n8n? SplitInBatches con lista sezioni? O 9 nodi AI sequenziali? Come assemblare il PDF finale da 9 sezioni + grafici? Serve un nodo "assemble" che combina tutto?

**CAT 3 — Lead Magnet**: i dati del backtest vengono calcolati in un Code node prima dell'AI? Quanti step di calcolo servono? (fetch alert del mese → calcola returns → calcola hit rate → calcola "what if" portfolio → passa tutto all'AI?)

**CAT 4 — Reddit Replies**: il monitoring (poll ogni 60 min) come triggera la generazione? (Schedule → fetch nuovi post → per ogni post: check rilevanza → genera reply → valida → delay → posta?) Come gestire il daily cap in un workflow che gira 24 volte/giorno?

**CAT 5 — Reddit Daily Thread**: serve un workflow separato dal reply monitor? O e lo stesso con branch condizionale? Come aggregare i filing di ieri? (NocoDB query → seleziona top 3-4 → assembla commento → posta?)

**CAT 6 — Reddit DD Post**: serve un workflow settimanale separato? Come decidere il ticker? (query NocoDB per cluster buy recenti + score alti → seleziona il migliore → genera DD?) Come generare e uploadare le 5-8 immagini?

**CAT 7 — X Replies**: il polling X ogni 5 min (twitterapi.io) come si integra? (Schedule → fetch nuovi tweet → per ogni tweet: match con filing DB → genera reply → valida → send to Telegram review → human approves → post reply + like tweet?) Come gestire la coda Telegram?

**CAT 8 — X Posts**: come schedulare 4 post nelle 4 finestre? (4 trigger Schedule separati? O 1 trigger ogni ora con check "e l'ora giusta"?) Come generare il visual e allegarlo al tweet? (step 1: genera testo → step 2: genera visual → step 3: upload media a X API → step 4: post tweet con media_id?)

**CAT 9 — Alert Scoring**: il workflow e gia definito (sec-monitor → score-alert → analyze-alert) — ma come integrare il scoring deterministico? (Code node con formula PRIMA dell'AI call? O Code node + AI call + Code node che combina?)

**CAT 10 — Alert Analysis**: come condizionare la lunghezza al score? (IF node: score >= 8 → prompt "200-250 words", score >= 6 → prompt "150-200", else → prompt "100-150"?)

**CAT 11 — Newsletter**: quanti step dal trigger (Monday 6:30 AM) alla mail inviata? Come fare A/B subject in n8n? (genera 2 subject → Beehiiv A/B API?) Come segmentare Free vs Pro? (genera 2 HTML → 2 chiamate Beehiiv separate?)

**CAT 12 — Outreach**: come gestire i 3 follow-up con timing diverso? (3 Schedule trigger separati? O 1 trigger giornaliero che check "ci sono prospect che hanno bisogno di follow-up day 5/10/16"?) Come fare il warm-up progressivo? (Code node che conta email inviate oggi e decide il limite?)

---

## Content Strategy — COSA pubblicare per ogni categoria

Per ogni categoria, non basta sapere COME creare il contenuto — serve sapere COSA pubblicare per massimizzare engagement, conversione, e crescita. Ogni canale ha dinamiche diverse.

### CAT 1 — Articoli: Content Mix Ottimale
- Qual e il mix ottimale di topic per un blog di insider trading? (X% insider activity, X% earnings + insider angle, X% sector analysis, X% educational, X% contrarian?)
- Gli articoli su large cap ($NVDA, $AAPL, $TSLA) portano piu traffico SEO o quelli su small cap poco coperte?
- Gli articoli su cluster buying (3+ insider) performano meglio di quelli su singolo insider buy?
- Gli articoli con verdict esplicito (BUY/SELL) ricevono piu click da Google di quelli senza?
- Articoli "evergreen" (educational, "how to read Form 4") vs "time-sensitive" (breaking insider buy): quale mix per SEO?
- Quando conviene scrivere su earnings + insider angle vs insider-only? (prima/dopo earnings season?)
- Qual e la frequenza ottimale? (1.5/giorno e troppo? troppo poco? I competitor quanti ne pubblicano?)
- Come scegliere il ticker per ogni articolo? (score piu alto del giorno? keyword volume? trending topic? mix?)

### CAT 2 — Report Premium: Cosa Vendere
- Quali ticker/settori vendono di piu come report a pagamento? (tech? healthcare? small cap speculative? blue chip "safe"?)
- Un report "Magnificent 7 Bundle" a $29.99 vende piu di 7 report singoli a $14.99?
- I report contrarian ("Everyone Hates $TICKER — Here's Why Insiders Disagree") vendono piu di quelli bullish standard?
- Conviene fare report su ticker trending (post-earnings, post-news) o su ticker "hidden gem"?
- Come decidere quando creare un nuovo report? (insider activity spike? Earnings appena usciti? Keyword demand?)
- Quanti report dovrebbe avere il catalogo prima del lancio? (5? 10? 20?)

### CAT 3 — Lead Magnet: Topic del Mese
- Il lead magnet deve coprire sempre lo stesso formato (backtest mensile) o variare? (un mese backtest, un mese "top picks", un mese "sector deep dive"?)
- Il titolo deve menzionare un risultato numerico specifico ("7 Buys That Jumped 50%+") o essere piu ampio ("Insider Buying Monthly Report")?
- I lead magnet con singolo ticker hero (es. "How $NVDA Insiders Called the Rally") convertono piu di quelli multi-ticker?

### CAT 4+5+6 — Reddit: Strategia Contenuti
- Su quale subreddit concentrare gli sforzi per massimo ROI? (WSB ha piu utenti ma piu rumore, r/stocks e piu targeted, r/ValueInvesting e piu serio)
- Che tipo di contenuto riceve piu upvote per subreddit? (WSB: YOLO + dati? stocks: analisi equilibrata? ValueInvesting: deep fundamental + insider edge?)
- I post/commenti su ticker trending del giorno performano meglio di quelli su ticker "hidden"?
- Come bilanciare contenuto insider-only vs contenuto generico finance con angolo insider?
- Quando postare la DD? (dopo un insider buy grosso? Dopo earnings? Prima di un catalyst?)
- Come scegliere il ticker per la DD settimanale? (cluster buy recente? Ticker mai coperto? Ticker con earnings in arrivo?)
- I post contrarian ("$TICKER is hated but insiders are loading up") ricevono piu engagement?
- Quanto contenuto educational postare? ("TIL cluster buying outperforms by 2.3x" — funziona su Reddit?)

### CAT 7+8 — X: Strategia Contenuti
- Qual e il mix ottimale di tipi di tweet? (X% insider alerts, X% earnings reaction, X% market commentary, X% educational, X% engagement/poll?)
- I tweet su large cap ricevono piu engagement o quelli su small cap "scoperte"?
- I thread su X performano meglio quando sono educational ("How to spot insider buying patterns") o data-driven ("3 CEOs bought $15M this week — here's what happened next")?
- I tweet contrarian ("Everyone selling $TICKER but CEO just bought $5M") generano piu follower?
- Come reagire a breaking news in tempo reale aggiungendo l'angolo insider? (es. NVDA earnings out → "reminder: CFO bought $3M 2 weeks ago")
- I poll su X ("Which insider buy are you watching? A) $NVDA B) $AAPL C) $TSLA") generano engagement reale o sono percepiti come spam?
- Come bilanciare la frequenza tra contenuto insider (core brand) e contenuto generico finance (reach piu ampio)?
- Quali account target per le reply generano piu profile click? (account da 50K o da 500K? Account data-focused o opinion-focused?)
- C'e un "tipo di tweet" che genera follower a tasso sproporzionato rispetto agli altri? (thread educativi? Alert con screenshot? Contrarian take?)

### CAT 9+10 — Alert: Quali Alert Mandare
- Tutti gli alert con score >=6 devono essere mandati o serve un filtro aggiuntivo? (troppi alert = alert fatigue = unsubscribe)
- Qual e il numero ottimale di alert/giorno per un Pro subscriber? (3? 5? 10? Illimitati?)
- Gli alert cluster buying (3+ insider) devono essere flaggati in modo speciale? (es. "CLUSTER ALERT" nel subject?)
- Conviene mandare alert anche per insider selling significativo o solo buying?
- Come gestire i giorni con 20+ filing significativi? (mandare tutti? Daily digest? Solo top 5?)
- Gli alert con "What to Watch" (catalyst prossimo) hanno retention migliore?

### CAT 11 — Newsletter: Selezione Contenuti
- Il "move della settimana" (deep dive) deve essere sempre il ticker con score piu alto? O il piu riconoscibile?
- Quanti alert includere nel recap? (top 3? top 5? top 10?)
- La newsletter deve avere un "tema" settimanale ("This week in healthcare insider buying") o essere sempre un mix di settori?
- Contenuto educational periodico nella newsletter funziona? (una volta al mese: "Did you know? Cluster buying outperforms by 2.3x")
- Come decidere i 3 articoli da linkare? (piu recenti? Piu letti? Mix?)

### CAT 12 — Outreach: Chi Contattare
- Quali tipi di finance blogger rispondono di piu? (piccoli blog personali? Media outlet? Newsletter creator?)
- E meglio contattare blogger che hanno gia scritto su insider trading o quelli che coprono il settore ma non insider trading (nuovo angolo per loro)?
- Qual e il "hook" che converte di piu nell'outreach? (guest post? "Abbiamo dati esclusivi"? "Posso scrivere un pezzo per te"?)
- Come trovare prospect senza tool a pagamento? (Google search "insider trading blog"? Twitter bio search? Reddit contributor che hanno blog?)
- Quanti prospect servono al mese per ottenere 5-10 backlink? (con 8-12% response rate, serve pool di 100-200?)

---

---

## Tools, Metodologie, Risorse — Tutto Cio Che Aiuta a Raggiungere 10/10

**VINCOLO CRITICO**: Il budget mensile e GIA ottimizzato a ~$20/mese. Qualsiasi tool/risorsa suggerito qui NON DEVE aggiungere piu di $5-10/mese IN TOTALE a tutto il sistema. Idealmente $0. Se un tool costa, DEVE giustificare il costo con un impatto misurabile sulla qualita.

Cerco QUALSIASI cosa che possa migliorare la qualita del contenuto generato — non solo software a pagamento. Includi:

### Categorie di "tool" da considerare:

1. **API gratuite o quasi gratuite** — qualsiasi API che fornisce dati utili per arricchire il contenuto (stock data, earnings calendar, analyst ratings, news, sentiment, ecc.). Solo free tier o <$2/mese

2. **Librerie open source** — npm packages, Python libraries, chart libraries, PDF generators, markdown parsers, ecc. che migliorano la qualita dell'output

3. **Prompt engineering techniques** — metodologie specifiche (chain-of-thought, few-shot, constitutional AI, self-critique, tree-of-thought, ecc.) che migliorano la qualita per ogni tipo di contenuto

4. **AI skills/plugins per Claude Code** — skill che potremmo creare o usare per automatizzare quality check, review, o generazione. Abbiamo gia: prompt-master, llm-prompt-optimizer, llm-structured-output, avoid-ai-writing, anti-hallucination, confidence-scorer

5. **n8n community nodes** — nodi n8n della community che aggiungono funzionalita utili (es. nodi per chart generation, PDF, email validation, ecc.)

6. **Free data sources** — dataset gratuiti, feed RSS, API governative, archivi pubblici che arricchiscono il contenuto (es. SEC EDGAR gia lo usiamo, ma ci sono altri?)

7. **Quality assurance methodologies** — framework per garantire qualita costante nel tempo (A/B testing, feedback loop, scoring rubric, human-in-the-loop patterns)

8. **Anti-AI detection techniques** — metodi SPECIFICI per far passare il contenuto come scritto da umano (non "scrivi peggio" — tecniche reali: variazione sintattica, inserimento errori naturali, pattern breaking, ecc.)

9. **SEO tools gratuiti** — qualsiasi risorsa gratuita per validare SEO (Google Rich Results Test, Schema Markup Validator, PageSpeed Insights, ecc.)

10. **Social media tools gratuiti** — scheduler, analytics, monitoring tools con free tier utile

11. **Design resources** — font gratuiti, color palette per finance, icon set, template design system per i visual

12. **Content calendar / planning tools** — metodologie o strumenti per pianificare cosa pubblicare quando

13. **Competitive intelligence** — come monitorare cosa fanno i competitor (Unusual Whales, MarketBeat, ecc.) gratis

14. **Legal/compliance resources** — template disclaimer, guide SEC compliance per contenuto finance, checklist legali

### Per OGNI tool/risorsa suggerita, fornisci:

```
- **Nome**: [tool/risorsa]
- **Tipo**: [API/libreria/metodologia/skill/ecc.]
- **Costo**: [$0 | $X/mese | one-time]
- **Per quali categorie**: [CAT 1, 4, 7, ecc.]
- **Cosa migliora**: [specifica — non "improves quality" ma "riduce AI detection score del 15%" o "aggiunge earnings date context che manca"]
- **Come si integra**: [n8n node? Code node? Pre-processing step? Post-processing validation?]
- **Impatto stimato**: [1-10 dove 10 = game changer]
```

### Domande specifiche:

- Esiste un'API gratuita per earnings calendar? (quando esce il prossimo earnings di $TICKER — serve per "What to Watch" nelle analisi)
- Esiste un'API gratuita per analyst ratings/price targets? (consenso Wall Street — serve per contesto nei report)
- Esiste un modo gratuito per validare la leggibilita di un testo finance? (Flesch-Kincaid implementation in JS/Python?)
- Quali librerie JS generano chart finanziari server-side senza browser? (Chart.js con node-canvas? D3 server-side? Recharts con JSDOM?)
- Esiste un'API gratuita per news aggregate per ticker? (ultima settimana di news su $NVDA?)
- Come implementare AI detection scoring senza tool a pagamento? (open source equivalent di Originality.ai?)
- Quali prompt engineering patterns funzionano meglio per contenuto finance lungo (2000+ parole)?
- Esiste un modo per fare A/B test delle newsletter con Beehiiv free tier?
- Come implementare un "content freshness checker" che verifica se stiamo ripetendo contenuto gia pubblicato?
- Esiste un feed RSS gratuito per le decisioni Fed/FOMC? Per i job report? Per CPI data?
- Come monitorare i competitor (Unusual Whales, MarketBeat) gratuitamente per capire cosa pubblicano?
- Esiste un template HTML/CSS open source per report finanziari professionali che possiamo adattare?
- Quali font gratuiti (Google Fonts) sono usati dai report finance professionali?
- Come implementare un "plagiarism/duplicate content checker" gratuito per evitare che articoli diversi si ripetano?

---

## Output Atteso

Per OGNI categoria (1-12), fornisci:

```
### CAT [N] — [Nome]

#### n8n Workflow Architecture
```
[Trigger] → [Node 1: descrizione] → [Node 2] → ... → [Publish]
                                          ↓ (IF fail)
                                    [Retry con feedback]
```
- Nodi sequenziali vs paralleli
- Branch condizionali (IF node) con condizioni esatte
- Retry logic con max attempts
- Dove serve approval umano (Telegram)

#### Workflow Ottimale (step sequenziali)
Step 1: [azione] — [input/output]
Step 2: ...

#### Prompt Design
**System Prompt**: [testo completo o struttura dettagliata]
**User Prompt Template**: [con variabili {{ticker}}, {{insider_data}}, ecc.]
**Few-Shot Examples**: [se necessari, fornire 1-2 esempi di output ideale]

#### Data Pipeline
[Quali dati servono, da dove vengono, in che formato passarli al prompt]

#### Validazione
[Check automatici sull'output, in che ordine, quanti retry]

#### Content Type Routing
[Come gestire i diversi tipi di contenuto: insider vs earnings vs macro vs educational]

#### Content Strategy
[COSA pubblicare: mix ottimale di topic, come scegliere il ticker/topic, frequenza, timing]
```

Per OGNI template visual (1-15), fornisci:

```
### Template [N] — [Nome]

#### Layout Design
[Dimensioni, colori, font, struttura, esempio visivo descritto]

#### HTML/CSS Structure
[Struttura HTML schematica con classi e posizionamento]

#### Data Input
[Quali variabili/dati servono per popolare il template]

#### Responsive Notes
[Come adattare per X post vs X reply vs blog inline vs PDF]
```

Per la sezione Tools/Risorse, fornisci una lista completa:

```
### Tools & Risorse Raccomandate

#### Costo $0 (priorita)
[Lista con formato: Nome — Tipo — Per quali CAT — Cosa migliora — Come integrare — Impatto 1-10]

#### Costo <$5/mese totale (se il valore lo giustifica)
[Stessa struttura]

#### Metodologie (sempre $0)
[Prompt engineering techniques, quality frameworks, anti-AI detection patterns specifici per ogni categoria]
```

IMPORTANTE: Fornisci ESEMPI CONCRETI di prompt, non descrizioni generiche. Voglio poter copiare il prompt e usarlo. Se un prompt ha variabili, usa la sintassi {{variabile}}.
