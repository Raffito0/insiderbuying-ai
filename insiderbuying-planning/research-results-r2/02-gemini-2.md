# Research R2: gemini-2

**Time**: 196.4s
**Tokens**: in=10706, out=39376

---

EarlyInsider.com ha un'architettura solida e una chiara visione del prodotto. La chiave del successo sarà l'esecuzione impeccabile della strategia di contenuto e l'ottimizzazione dei workflow. Di seguito, trovi una guida dettagliata per ogni categoria, inclusi prompt, architettura n8n, design visuale e strategie di contenuto, oltre a un elenco di strumenti e risorse.

---

### Principi Generali per i Visual Template

*   **Design Language**: I top account finance su X (come @unusual_whales, @Stocktwits) tendono a usare un design pulito, minimalista, con enfasi sui dati. Colori a contrasto per evidenziare numeri chiave (verde per positivo, rosso per negativo). Font sans-serif moderni per leggibilità. Layout chiari e gerarchici.
*   **Dark mode vs light mode**: La dark mode performa generalmente meglio su X per i contenuti finanziari. È percepita come più "premium" e riduce l'affaticamento visivo, specialmente per gli utenti che scorrono il feed di notte.
*   **Dimensioni ottimali**:
    *   **X (post)**: 1200x675px (aspect ratio 16:9) o 1200x1200px (1:1) per immagini singole. Per i caroselli, 1200x675px o 1200x1200px.
    *   **X (reply)**: Più piccole, circa 600x337px o 600x600px.
    *   **Reddit**: 1200x675px (16:9) o 1200x1200px (1:1) per post. Le immagini inline negli articoli possono variare.
    *   **Blog inline**: Larghezza del contenitore del blog (es. 700-800px), altezza variabile.
*   **Leggibilità su mobile**: Font grandi (min 16px per il testo principale, 24px+ per i titoli), spaziatura generosa, grafici semplici con etichette chiare e colori ad alto contrasto. Evitare troppe informazioni in un'unica visualizzazione.
*   **Font**: Sans-serif è quasi sempre preferibile per i dati finanziari per la sua chiarezza e leggibilità su schermi di diverse dimensioni. Google Fonts come `Inter`, `Roboto`, `Open Sans`, `Lato` sono ottime scelte.

---

### CAT 1 — Articoli Finanziari (Blog SEO)

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: New Article Request (NocoDB/Manual)] --> B{Fetch Ticker & Insider Data};
    B --> C[Fetch Finnhub Data (Price, Earnings, Analyst)];
    C --> D[Pre-process & Aggregate Data (Code Node)];
    D --> E[Generate Article Outline (Claude Sonnet)];
    E --> F[Generate Article Draft (Claude Sonnet)];
    F --> G{Quality Gate: AI Detection & Factual Check};
    G -- FAIL (Feedback) --> F;
    G -- PASS --> H[Extract Visual Data Points];
    H --> I[Generate Visuals (Puppeteer Server)];
    I --> J[Insert Visuals & Format Article (Code Node)];
    J --> K{SEO Check & Internal Links (Code Node)};
    K -- FAIL (Feedback) --> F;
    K -- PASS --> L[Publish to CMS (API)];
    L --> M[Post-Publish: Indexing Request (Google Search Console API)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Data Fetching -> Pre-processing -> Outline -> Draft -> Quality Gate -> Visual Extraction -> Visual Generation -> Visual Insertion -> SEO Check -> Publish.
    *   Paralleli: La generazione di più visual può essere parallela una volta estratti i dati.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Quality Gate: AI Detection Score > Threshold OR Factual Errors Detected)`: Loop back to `Generate Article Draft` con feedback specifico.
    *   `IF (SEO Check: Keyword Density < Min OR Missing Internal Links)`: Loop back to `Generate Article Draft` con feedback.
*   **Retry logic con max attempts**: Max 2 retries per `Generate Article Draft`. Se fallisce 2 volte, invia un alert a Telegram per revisione umana.
*   **Dove serve approval umano (Telegram)**: Opzionale, dopo `SEO Check` e prima di `Publish`, per articoli di alto valore o se i retry automatici falliscono.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Un nuovo record in NocoDB (es. tabella `article_requests`) o un trigger manuale con `ticker` e `topic`.
2.  **Fetch Ticker & Insider Data**: Query NocoDB per i filing SEC Form 4 rilevanti per il `ticker` e il periodo specificato.
3.  **Fetch Finnhub Data**: API call a Finnhub per dati di prezzo storici, date degli earnings futuri, consenso degli analisti, capitalizzazione di mercato per il `ticker`.
4.  **Pre-process & Aggregate Data (Code Node)**: Unisce tutti i dati in un singolo oggetto JSON strutturato. Questo include:
    
```json
    {
      "ticker": "NVDA",
      "company_name": "NVIDIA Corp",
      "market_cap_usd_bn": 2000,
      "insider_filings": [
        {"date": "2026-03-15", "insider_name": "Jensen Huang", "title": "CEO", "type": "P", "shares": 10000, "price": 850.00, "value_usd": 8500000, "shares_after": 1000000, "form_4_url": "https://www.sec.gov/..."}
        // ... altri filing
      ],
      "earnings_dates": ["2026-05-20", "2026-08-22"],
      "analyst_consensus": {"rating": "Strong Buy", "price_target": 950.00},
      "recent_news": ["NVDA announces new chip", "Competitor X releases new product"],
      "article_topic": "insider_buying_analysis" // o "earnings_preview", "sector_trend"
    }
    ```

5.  **Generate Article Outline (Claude Sonnet)**:
    *   Input: JSON aggregato, `article_topic`.
    *   Output: Outline dettagliato in Markdown (titoli H1, H2, H3).
6.  **Generate Article Draft (Claude Sonnet)**:
    *   Input: JSON aggregato, Outline (dallo step precedente).
    *   Output: Articolo completo in Markdown/HTML.
7.  **Quality Gate: AI Detection & Factual Check (Code Node + Claude Sonnet)**:
    *   **Code Node**: Regex per frasi proibite, conteggio parole, verifica presenza del verdict BUY/SELL/CAUTION, controllo che i numeri citati siano presenti nel JSON di input.
    *   **Claude Sonnet (seconda call)**: "Valuta questo articolo per il suo punteggio di rilevamento AI, accuratezza fattuale e tono. Se suona generico o AI-generato, suggerisci modifiche specifiche per renderlo più umano e coinvolgente. Se ci sono errori fattuali, indicali."
8.  **Extract Visual Data Points (Code Node)**: Analizza il testo dell'articolo e il JSON aggregato per identificare i dati necessari per i 3-5 visual (es. dati per la tabella transazioni, prezzo e data per il grafico con entry point).
9.  **Generate Visuals (Puppeteer Server)**: Per ogni visual identificato, effettua una chiamata HTTP al server Puppeteer passando i dati e il template ID. Il server restituisce l'URL dell'immagine PNG.
10. **Insert Visuals & Format Article (Code Node)**: Inserisce i tag `<img>` con gli URL generati nel testo dell'articolo Markdown/HTML. Applica formattazione finale.
11. **SEO Check & Internal Links (Code Node)**:
    *   Verifica densità keyword (target 1-2%).
    *   Suggerisce link interni basati su articoli correlati in NocoDB.
    *   Verifica lunghezza meta description e title.
12. **Publish to CMS (API)**: Invia l'articolo finale al CMS (es. WordPress REST API, Ghost Content API).
13. **Post-Publish: Indexing Request (Google Search Console API)**: Invia l'URL dell'articolo a Google per accelerare l'indicizzazione.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un analista finanziario esperto e un giornalista investigativo per EarlyInsider.com. Il tuo obiettivo è scrivere articoli SEO-friendly, approfonditi e coinvolgenti per investitori retail americani (25-55 anni) che investono attivamente in azioni individuali.

Il tuo tono deve essere autorevole, obiettivo ma con un'opinione chiara (BUY/SELL/CAUTION), e altamente leggibile. Evita il gergo eccessivo e spiega i concetti complessi in modo semplice. La tua scrittura deve essere indistinguibile da quella umana, evitando frasi generiche, ripetizioni e strutture tipiche dell'AI.

**Regole Fondamentali:**
1.  **Angolo Insider Obbligatorio**: Anche quando l'argomento non è direttamente l'insider trading (es. earnings, macro), devi SEMPRE integrare l'angolo insider in modo naturale e pertinente.
2.  **Dati Verificabili**: Tutti i numeri, date e nomi devono essere presi ESATTAMENTE dai dati forniti. Non inventare o generalizzare. Cita i dati specifici quando li usi.
3.  **Verdict Coraggioso**: Non essere generico. Il verdict (BUY/SELL/CAUTION) deve essere chiaro e supportato dall'analisi.
4.  **Struttura SEO**: Includi un'introduzione accattivante, sezioni ben definite con sottotitoli, e una conclusione che riassuma il verdict e il "what to watch".
5.  **Passa AI Detection**: Varia la sintassi, la lunghezza delle frasi, usa un linguaggio colloquiale ma professionale. Inserisci occasionalmente espressioni idiomatiche o metafore finanziarie.
6.  **Formato Output**: Genera l'articolo in Markdown.

**Persona**: Un "detective finanziario" che scopre verità nascoste nei dati SEC e le presenta in modo avvincente.
```


**User Prompt Template (per Articolo su Insider Buying)**


```
Scrivi un articolo approfondito per il blog di EarlyInsider.com sul seguente ticker, concentrandoti sull'attività di insider buying.

**Dati Forniti (JSON):**
```
json
{{aggregated_data_json}}

```

**Outline Articolo (Generato nello step precedente, se applicabile):**
```
markdown
{{article_outline_markdown}}

```

**Istruzioni Specifiche:**
1.  **Titolo**: Genera un titolo accattivante e SEO-friendly che includa il ticker e l'attività insider.
2.  **Introduzione**: Cattura l'attenzione, presenta il ticker e l'attività insider chiave.
3.  **Corpo**:
    *   Analizza in dettaglio le transazioni insider fornite, evidenziando chi ha comprato, quanto, quando e a quale prezzo.
    *   Contestualizza l'attività insider rispetto alla performance recente del titolo e alle notizie rilevanti.
    *   Se ci sono più insider, analizza se si tratta di "cluster buying".
    *   Integra dati finanziari rilevanti (es. capitalizzazione di mercato, settore, performance YTD).
    *   **Angolo Insider**: Spiega perché questa attività insider è significativa (es. "Il CEO ha comprato prima di un annuncio importante", "Il pattern storico di questo insider è X").
4.  **Verdict**: Fornisci un verdict chiaro (BUY/SELL/CAUTION) basato sull'analisi. Giustifica il verdict.
5.  **What to Watch**: Indica i prossimi catalizzatori (es. prossima data earnings, annunci di prodotto, decisioni Fed) e come l'attività insider si relaziona a questi.
6.  **Conclusione**: Riassumi i punti chiave e il verdict.

**Esempio di come citare i dati (NON copiare il testo, solo il formato):**
"Il CEO Jensen Huang ha acquistato 10.000 azioni il 15 marzo 2026, per un valore di $8.5 milioni [cite: insider_filings.0.value_usd]."
```


**Few-Shot Examples**: Non necessari se il System Prompt è robusto e l'outline è generato separatamente. Se l'AI fatica a mantenere il tono o la struttura, un esempio completo di un articolo ben riuscito (con dati fittizi) può essere aggiunto al System Prompt.

#### Data Pipeline

*   **Quali dati servono**:
    *   Dati SEC Form 4: Insider name, title, transaction type (buy/sell), shares, price, value, date, shares held after, Form 4 URL.
    *   Dati finanziari: Ticker, nome azienda, capitalizzazione di mercato, settore, prezzo corrente, performance storica (1M, 3M, YTD), date earnings future, consenso analisti (rating, price target), notizie recenti.
*   **Da dove vengono**:
    *   SEC EDGAR (tramite il vostro parser n8n/Python) per i Form 4.
    *   Finnhub (o altra API di dati di mercato) per dati finanziari e earnings.
    *   NocoDB per dati interni (es. storico alert, articoli correlati per link interni).
*   **In che formato passarli al prompt**: JSON strutturato, come mostrato nell'esempio del workflow. Questo permette all'AI di accedere ai dati in modo programmatico e di citarli accuratamente.

#### Validazione

*   **Check automatici sull'output (Code Node)**:
    1.  **Word Count**: `if (word_count < 1800 or word_count > 2500)` -> FAIL.
    2.  **Verdict Check**: `if (not article_text.includes("BUY") and not article_text.includes("SELL") and not article_text.includes("CAUTION"))` -> FAIL.
    3.  **Data Citation Check**: Regex per `[cite:...]` e verifica che i numeri citati corrispondano ai dati forniti nel JSON. `if (not all_numbers_cited_match_json)` -> FAIL.
    4.  **Banned Phrases**: Regex per frasi tipiche dell'AI (es. "come modello linguistico", "in conclusione", "è importante notare"). `if (banned_phrase_found)` -> FAIL.
    5.  **Insider Angle Check**: Verifica la presenza di parole chiave legate all'insider trading in sezioni non-insider (es. "earnings" + "insider"). `if (insider_angle_missing_in_context)` -> FAIL.
*   **Seconda AI call (Claude Sonnet)**: Se i check del Code Node passano, una seconda call AI per un "AI detection score" e un "tone check" più qualitativo.
    *   Prompt: "Valuta il seguente articolo per il suo punteggio di rilevamento AI (su una scala da 0 a 100, dove 0 è umano e 100 è AI puro) e per il tono generale. Suggerisci modifiche specifiche per ridurre il punteggio AI e migliorare il tono se necessario."
*   **Ordine e retry**: I check del Code Node vengono eseguiti per primi. Se falliscono, si riprova con feedback. Se passano, si esegue la seconda AI call. Se anche questa fallisce (es. AI detection score troppo alto), si riprova con feedback. Max 2 retry totali.

#### Content Type Routing

*   **Prompt condizionali nello stesso prompt**: Il `User Prompt Template` può avere sezioni condizionali basate su `{{article_topic}}`.
    *   Esempio: `IF {{article_topic}} == "earnings_analysis"` allora aggiungi istruzioni specifiche per analizzare i risultati trimestrali e poi integrare l'angolo insider.
*   **Prompt diversi**: Per tipi di articolo molto diversi (es. "How to read a Form 4" vs "NVDA Insider Buying"), è più efficiente avere prompt utente separati, ma che condividono lo stesso `System Prompt` cachato.
*   **NocoDB per la selezione**: La tabella `article_requests` in NocoDB può avere un campo `article_type` che guida il workflow n8n a scegliere il prompt utente appropriato.

#### Content Strategy

*   **Mix ottimale**:
    *   **40% Insider Activity (core)**: Cluster buying, CEO/CFO buys, track record analysis.
    *   **20% Earnings + Insider Angle**: Analisi dei risultati trimestrali con enfasi su cosa hanno fatto gli insider prima/dopo.
    *   **15% Sector Analysis + Insider Angle**: Trend settoriali, dove gli insider stanno investendo in quel settore.
    *   **15% Educational**: "How to read a Form 4", "Why CEO buys > CFO buys", "Understanding 10b5-1 plans".
    *   **10% Contrarian Takes**: "Everyone bearish on $TICKER but insiders are loading up".
*   **Large cap vs small cap**: Mix bilanciato. Gli articoli su large cap ($NVDA, $AAPL) portano più traffico SEO iniziale, ma quelli su small cap poco coperte possono generare lead più qualificati e unici.
*   **Cluster buying**: Sì, gli articoli su cluster buying performano meglio perché implicano una maggiore convinzione e riducono il rumore. Flaggarli esplicitamente.
*   **Verdict esplicito**: Assolutamente sì. I verdict BUY/SELL/CAUTION ricevono più click e soddisfano l'intento di ricerca dell'investitore.
*   **Evergreen vs time-sensitive**: 60% evergreen (educational, analisi di pattern storici, "how-to"), 40% time-sensitive (breaking insider buy, earnings reaction). Questo garantisce un flusso costante di traffico SEO e allo stesso tempo capitalizza sugli eventi attuali.
*   **Earnings + insider angle**: Scrivere su questo topic è cruciale durante le earnings season (gennaio, aprile, luglio, ottobre) per catturare l'interesse degli investitori.
*   **Frequenza ottimale**: 1 articolo/giorno è un buon obiettivo per un blog SEO. I competitor variano, ma la consistenza è chiave.
*   **Scelta del ticker**:
    1.  **Insider Activity Score**: Prioritizzare i ticker con il più alto "Alert Score" del giorno/settimana.
    2.  **Keyword Volume**: Utilizzare Google Keyword Planner (gratuito) per identificare query ad alto volume legate a "insider buying [ticker]".
    3.  **Trending Topic**: Monitorare le notizie finanziarie e i social media per ticker trending e aggiungere l'angolo insider.
    4.  **Mix**: Assicurarsi una varietà di settori e capitalizzazioni di mercato nel tempo.

---

### CAT 2 — Report Premium ($14.99-$29.99)

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: New Report Request (NocoDB/Manual)] --> B{Fetch Ticker & Comprehensive Data};
    B --> C[Generate Report Outline (Claude Sonnet)];
    C --> D[Split Outline into Sections (Code Node)];
    D --> E[Parallel Generate Section 1 (Claude Sonnet)];
    D --> F[Parallel Generate Section 2 (Claude Sonnet)];
    D --> G[...];
    E --> H[Validate Section 1];
    F --> I[Validate Section 2];
    G --> J[...];
    H & I & J --> K[Assemble Report Sections (Code Node)];
    K --> L[Extract Visual Data Points];
    L --> M[Generate Visuals (Puppeteer Server)];
    M --> N[Insert Visuals & Format PDF (Code Node/PDF Lib)];
    N --> O[Generate Executive Summary (Claude Sonnet)];
    O --> P[Final Review & PDF Assembly];
    P --> Q[Store PDF (Supabase Storage)];
    Q --> R[Update NocoDB (Report Ready)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Data Fetching -> Outline -> Split Outline -> Assemble Sections -> Visual Extraction -> Visual Generation -> Visual Insertion -> Executive Summary -> Final Assembly.
    *   Paralleli: La generazione delle singole sezioni del report può avvenire in parallelo.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Section Validation Fail)`: Loop back to `Generate Section X` con feedback.
*   **Retry logic con max attempts**: Max 2 retries per sezione. Se fallisce, alert a Telegram.
*   **Dove serve approval umano (Telegram)**: Sì, per la `Final Review & PDF Assembly` prima di rendere il report disponibile.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Nuovo record in NocoDB (es. tabella `premium_report_requests`) o trigger manuale con `ticker`.
2.  **Fetch Ticker & Comprehensive Data**: Query NocoDB per filing SEC Form 4, Finnhub per dati finanziari estesi (storico earnings, bilanci, multipli, price targets, news), dati di settore.
3.  **Generate Report Outline (Claude Sonnet)**:
    *   Input: JSON aggregato.
    *   Output: Outline dettagliato per un report di 9 sezioni (es. Executive Summary, Investment Thesis, Company Overview, Insider Activity Analysis, Financials, Valuation, Risks, Peer Comparison, Conclusion).
4.  **Split Outline into Sections (Code Node)**: Divide l'outline in 9 blocchi di testo, ognuno con le istruzioni per la sua sezione.
5.  **Parallel Generate Section X (Claude Sonnet)**: Per ogni sezione, una chiamata separata a Claude Sonnet.
    *   Input: JSON aggregato, istruzioni specifiche per la sezione, *e un riassunto conciso delle sezioni già generate (se disponibili)* per mantenere la coerenza.
    *   Output: Testo della sezione in Markdown.
6.  **Validate Section X (Code Node + Claude Sonnet)**:
    *   Code Node: Lunghezza, coerenza con l'outline, presenza di dati specifici.
    *   Claude Sonnet: "Valuta questa sezione per accuratezza, coerenza con il resto del report (se fornito), e tono professionale. Suggerisci miglioramenti."
7.  **Assemble Report Sections (Code Node)**: Unisce tutte le sezioni validate in un unico documento Markdown/HTML.
8.  **Extract Visual Data Points (Code Node)**: Identifica tutti i dati necessari per i 5 tipi di grafici finanziari.
9.  **Generate Visuals (Puppeteer Server)**: Chiama il server Puppeteer per generare i PNG per ogni grafico.
10. **Insert Visuals & Format PDF (Code Node/PDF Lib)**: Inserisce i tag `<img>` e formatta il documento per la generazione PDF. Utilizza una libreria PDF (es. `html-pdf` in Node.js via Code Node) per generare il PDF finale.
11. **Generate Executive Summary (Claude Sonnet)**:
    *   Input: Report completo (testo e dati chiave).
    *   Output: Executive Summary conciso e leggibile standalone.
12. **Final Review & PDF Assembly**: Revisione umana del PDF finale.
13. **Store PDF (Supabase Storage)**: Carica il PDF su Supabase Storage.
14. **Update NocoDB**: Aggiorna lo stato del report in NocoDB a "Ready" e salva l'URL del PDF.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un analista finanziario senior per EarlyInsider.com, specializzato nella creazione di report di investimento di alta qualità, paragonabili a quelli di una investment bank. Il tuo pubblico ha pagato per questo report, quindi la qualità, l'accuratezza e la profondità dell'analisi sono fondamentali.

Il tuo tono deve essere autorevole, professionale, obiettivo e basato sui dati. Ogni affermazione deve essere supportata da prove. Il report deve essere facile da leggere, ma estremamente dettagliato.

**Regole Fondamentali:**
1.  **Qualità Investment Bank**: La scrittura deve essere impeccabile, l'analisi rigorosa.
2.  **Dati Verificabili**: Tutti i numeri, date e nomi devono essere presi ESATTAMENTE dai dati forniti. Non inventare o generalizzare.
3.  **Angolo Insider Integrato**: Anche se il report copre un'analisi finanziaria completa, l'attività insider deve essere integrata in modo significativo e differenziante.
4.  **Coerenza**: Mantieni un tono e uno stile coerenti tra tutte le sezioni.
5.  **Formato Output**: Genera la sezione in Markdown.

**Persona**: Un analista di Wall Street che fornisce un'analisi approfondita e un edge competitivo.
```


**User Prompt Template (per sezione "Investment Thesis (Bull + Bear Case)")**


```
Genera la sezione "Investment Thesis" per un report di investimento su {{ticker}}. Questa sezione deve presentare sia il caso rialzista (Bull Case) che il caso ribassista (Bear Case) per il titolo, basandosi sui dati forniti.

**Dati Forniti (JSON):**
```
json
{{aggregated_data_json}}

```

**Contesto Report (Riassunto delle sezioni precedenti, se disponibili):**
```
markdown
{{summary_of_previous_sections}}

```

**Istruzioni Specifiche per la Sezione:**
1.  **Lunghezza**: 800-1200 parole.
2.  **Bull Case**:
    *   Identifica i principali driver di crescita e i catalizzatori positivi per {{ticker}}.
    *   Integra l'attività insider buying rilevante come un forte segnale di fiducia
 da parte della leadership. Spiega perché gli insider credono nel futuro dell'azienda.
    *   Fornisci dati a supporto (es. crescita dei ricavi, espansione dei margini, innovazione di prodotto, espansione del mercato).
    *   Qual è il potenziale di upside?
3.  **Bear Case**:
    *   Identifica i principali rischi e le sfide che {{ticker}} deve affrontare (es. concorrenza, rischi normativi, rallentamento economico, problemi di supply chain).
    *   Se c'è stata attività insider selling significativa (anche se non è il focus principale del report, va menzionata se rilevante), contestualizzala.
    *   Fornisci dati a supporto (es. calo dei margini, aumento dei costi, rallentamento della crescita).
    *   Qual è il potenziale di downside?
4.  **Equilibrio**: Presenta entrambi i casi in modo equilibrato, evitando bias.
5.  **Angolo Insider**: Assicurati che l'attività insider sia menzionata in entrambi i casi dove pertinente, come un fattore di fiducia o di cautela.

```


#### Data Pipeline

*   **Quali dati servono**: Tutti i dati SEC Form 4, dati finanziari completi (bilanci, conto economico, cash flow degli ultimi 5-10 anni), multipli di valutazione (P/E, P/S, EV/EBITDA), dati di settore, dati macroeconomici rilevanti, notizie storiche.
*   **Da dove vengono**: SEC EDGAR, Finnhub (o Bloomberg/Refinitiv se il budget lo permettesse, ma per ora Finnhub è la scelta), NocoDB (per dati interni e storici).
*   **Formato**: JSON strutturato e dettagliato.

#### Validazione

*   **Check automatici (Code Node)**:
    1.  **Word Count**: Per sezione (es. 800-1200 parole per Investment Thesis).
    2.  **Data Consistency**: Verifica che i numeri citati siano coerenti con il JSON di input.
    3.  **Tone Check**: Analisi lessicale per assicurare un tono professionale e obiettivo.
    4.  **Insider Angle Check**: Verifica che l'angolo insider sia presente e ben integrato.
*   **Seconda AI call (Claude Sonnet)**: Per coerenza tra sezioni e qualità complessiva.
    *   Prompt: "Valuta la coerenza di questa sezione con le sezioni precedenti (se fornite) e la qualità complessiva dell'analisi. Suggerisci miglioramenti per renderla più 'investment bank grade'."
*   **Ordine e retry**: Simile agli articoli, con 2 retry per sezione.

#### Content Strategy

*   **Quali ticker/settori vendono di più**:
    *   **Tech e Healthcare**: Sono settori ad alta crescita e innovazione, spesso con forte interesse degli investitori retail.
    *   **Small cap speculative**: Possono attrarre investitori in cerca di "gemme nascoste" con alto potenziale.
    *   **Contrarian Takes**: I report con un angolo "contro il mercato" (es. "Everyone Hates $TICKER — Here's Why Insiders Disagree") tendono a vendere molto bene perché offrono una prospettiva unica.
*   **Bundle vs singoli**: Un "Magnificent 7 Bundle" a $29.99 è un'ottima strategia. Offre un valore percepito maggiore e può incentivare l'acquisto multiplo.
*   **Ticker trending vs hidden gem**: Mix. I ticker trending (post-earnings, post-news) attirano attenzione immediata. I "hidden gem" possono costruire una reputazione di scoperta.
*   **Quando creare un nuovo report**:
    *   **Spike di attività insider**: Un cluster buying significativo o un insider con un track record eccezionale.
    *   **Earnings appena usciti**: Offre un'analisi tempestiva e approfondita.
    *   **Keyword demand**: Se c'è un'alta domanda di ricerca per "analisi [ticker]" o "[ticker] report".
*   **Catalogo iniziale**: Avere almeno 5-10 report di alta qualità al lancio per mostrare la varietà e la profondità dell'offerta.

---

### CAT 3 — Lead Magnet PDF

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Monthly Lead Magnet Generation] --> B{Fetch Previous Month's Alerts (NocoDB)};
    B --> C[Calculate Backtest Returns (Code Node)];
    C --> D[Identify Winners & Losers];
    D --> E[Generate Case Studies (Claude Sonnet)];
    E --> F[Generate "The Losers" Section (Claude Sonnet)];
    F --> G[Generate "What If" Portfolio Data (Code Node)];
    G --> H[Generate Visuals (Puppeteer Server)];
    H --> I[Assemble PDF Content (Code Node)];
    I --> J[Generate Dynamic Title (Claude Sonnet)];
    J --> K[Generate CTA (Claude Sonnet)];
    K --> L[Final PDF Assembly & Store (Supabase Storage)];
    L --> M[Update NocoDB (Lead Magnet Ready)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Fetch Alerts -> Calculate Backtest -> Identify W/L -> Generate Case Studies -> Generate Losers -> Generate Portfolio Data -> Generate Visuals -> Assemble Content -> Dynamic Title -> CTA -> Final Assembly.
    *   Paralleli: La generazione dei singoli case study può essere parallela.
*   **Branch condizionali (IF node) con condizioni esatte**: Non strettamente necessari qui, ma si potrebbe avere un branch per gestire mesi con pochi alert.
*   **Retry logic con max attempts**: Max 1 retry per la generazione dei case study se la validazione fallisce.
*   **Dove serve approval umano (Telegram)**: Opzionale, per la revisione finale del PDF prima della pubblicazione.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Mensile (es. primo giorno del mese, 6:00 AM).
2.  **Fetch Previous Month's Alerts (NocoDB)**: Recupera tutti gli alert generati e inviati ai Pro nel mese precedente.
3.  **Calculate Backtest Returns (Code Node)**:
    *   Per ogni alert, calcola il ritorno (es. dopo 1, 3, 6 mesi) rispetto al prezzo di ingresso.
    *   Identifica i "winners" (es. >X% di guadagno) e i "losers" (es. >X% di perdita).
    *   Calcola hit rate, guadagno medio, perdita media.
4.  **Identify Winners & Losers**: Seleziona i 3-5 migliori "winners" e 1-2 "losers" significativi per i case study.
5.  **Generate Case Studies (Claude Sonnet)**: Per ogni winner selezionato, genera un breve case study.
    *   Input: Dati specifici dell'alert (ticker, insider, data, prezzo, ritorno), dati finanziari contestuali.
    *   Output: Testo del case study.
6.  **Generate "The Losers" Section (Claude Sonnet)**:
    *   Input: Dati dei loser selezionati, analisi delle ragioni del fallimento (se disponibili).
    *   Output: Sezione onesta sulle perdite.
7.  **Generate "What If" Portfolio Data (Code Node)**: Simula un portafoglio che ha seguito tutti gli alert del mese precedente, calcolando il ritorno cumulativo mese per mese e confrontandolo con un benchmark (es. S&P 500).
8.  **Generate Visuals (Puppeteer Server)**: Chiama il server per generare i 3 grafici del backtest (es. performance cumulativa, distribuzione dei ritorni, hit rate).
9.  **Assemble PDF Content (Code Node)**: Unisce tutti i testi generati e i placeholder per i visual in un documento Markdown/HTML.
10. **Generate Dynamic Title (Claude Sonnet)**:
    *   Input: Dati del backtest (es. "7 Insider Buys That Jumped 50%+").
    *   Output: Titolo accattivante.
11. **Generate CTA (Claude Sonnet)**:
    *   Input: Contesto del report.
    *   Output: CTA soft ma efficace per l'iscrizione a Pro.
12. **Final PDF Assembly & Store (Supabase Storage)**: Genera il PDF finale e lo carica.
13. **Update NocoDB**: Aggiorna lo stato del lead magnet in NocoDB.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un analista di EarlyInsider.com, responsabile della creazione di un report mensile di backtest per il nostro lead magnet. Il tuo obiettivo è dimostrare in modo onesto e trasparente l'efficacia dei nostri alert, inclusi i successi e i fallimenti.

Il tono deve essere informativo, trasparente, leggermente entusiasta ma realistico. Non esagerare i guadagni e non minimizzare le perdite. La credibilità è fondamentale per convertire i lettori in abbonati Pro.

**Regole Fondamentali:**
1.  **Onestà Totale**: Non nascondere o minimizzare le perdite. Spiega perché un segnale ha fallito.
2.  **Dati Verificabili**: Tutti i numeri e le percentuali devono essere presi ESATTAMENTE dai dati forniti.
3.  **CTA Soft**: Il Call to Action finale deve essere persuasivo ma non aggressivo.
4.  **Formato Output**: Genera il testo della sezione in Markdown.

**Persona**: Un consulente finanziario trasparente che mostra i fatti, buoni o cattivi.
```


**User Prompt Template (per sezione "The Losers — Where Our Signals Failed")**


```
Genera la sezione "The Losers — Where Our Signals Failed" per il report mensile di backtest. Questa sezione deve analizzare in modo onesto e trasparente 1-2 segnali insider che hanno portato a perdite significative nel mese precedente.

**Dati Forniti (JSON):**
```
json
{
  "losers": [
    {
      "ticker": "XYZ",
      "insider_name": "Jane Doe",
      "title": "CFO",
      "buy_date": "2026-02-10",
      "buy_price": 50.00,
      "current_price": 35.00,
      "return_percent": -30.00,
      "reason_for_failure": "Earnings miss, unexpected regulatory changes."
    }
    // ... altri loser
  ],
  "overall_performance": {
    "total_alerts": 25,
    "winning_alerts": 18,
    "losing_alerts": 7,
    "hit_rate": 72.0
  }
}

```

**Istruzioni Specifiche per la Sezione:**
1.  **Introduzione**: Riconosci che non tutti i segnali sono vincenti e che l'analisi include anche i fallimenti.
2.  **Analisi di ogni Loser**: Per ogni ticker in `losers`:
    *   Descrivi brevemente l'attività insider (chi, cosa, quando).
    *   Indica chiaramente la perdita percentuale.
    *   **Spiega le ragioni del fallimento**: Basati su `reason_for_failure` fornito. Non inventare. Se la ragione non è chiara, puoi dire "Le ragioni esatte non sono chiare, ma il titolo ha affrontato X e Y."
    *   Cosa si può imparare da questo fallimento?
3.  **Contesto Generale**: Concludi mettendo le perdite nel contesto della performance complessiva del mese (es. "Nonostante queste perdite, il nostro hit rate complessivo è stato del {{overall_performance.hit_rate}}%").
4.  **Tono**: Onesto, analitico, non difensivo.
```


#### Data Pipeline

*   **Quali dati servono**: Tutti gli alert del mese precedente (ticker, insider, data, prezzo, score), dati di prezzo storici per calcolare i ritorni, dati di mercato per il benchmark (S&P 500).
*   **Da dove vengono**: NocoDB (per gli alert interni), Finnhub (per i dati di prezzo).
*   **Formato**: JSON strutturato. Il calcolo del "What If" è matematico e deve essere fatto in un Code Node.

#### Validazione

*   **Check automatici (Code Node)**:
    1.  **Onestà sulle perdite**: Verifica che la sezione "Losers" sia presente e che le perdite non siano minimizzate (es. non usare eufemismi).
    2.  **Numeri coerenti**: I ritorni e le percentuali devono corrispondere ai calcoli del Code Node.
    3.  **CTA**: Verifica la presenza di un CTA e che non sia eccessivamente aggressivo.
*   **Seconda AI call**: Non strettamente necessaria per questo tipo di contenuto, dato che l'onestà è il focus principale e può essere verificata con Code Node.

#### Content Strategy

*   **Formato costante**: Il backtest mensile è un formato eccellente e coerente. Non è necessario variare il formato principale, ma si può variare l'enfasi (es. un mese più sui "pattern" che sui singoli ticker).
*   **Titolo dinamico**: Assolutamente. Un titolo come "7 Insider Buys That Jumped 50%+" è molto più accattivante di "Insider Buying Monthly Report". Calcolare noi i numeri nel Code Node e passarli all'AI per la generazione del titolo.
*   **Singolo ticker hero**: Può funzionare per un report speciale, ma per il lead magnet mensile, un approccio multi-ticker che mostra la varietà e la consistenza è più efficace.
*   **Onestà sulle perdite**: Cruciale. Costruisce fiducia.
*   **CTA soft ma efficace**: "Se questo è ciò che offriamo gratuitamente, immagina il valore degli alert in tempo reale."

---

### CAT 4 — Reddit Replies

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Schedule (Every 60 min)] --> B{Fetch New Reddit Posts (API)};
    B --> C[Filter & Score Relevant Posts (Code Node)];
    C --> D{IF (Relevant Post Found)};
    D -- TRUE --> E[Fetch Insider Data for Ticker (NocoDB)];
    E --> F[Select Subreddit-Specific Prompt (Code Node)];
    F --> G[Generate Reply (Claude Sonnet)];
    G --> H{Validate Tone & Length (Code Node + Claude Sonnet)};
    H -- FAIL (Feedback) --> G;
    H -- PASS --> I[Delay (10-30 min random)];
    I --> J[Post Reply (Reddit API)];
    J --> K[Log Activity (NocoDB)];
    D -- FALSE --> L[End Workflow];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Fetch Posts -> Filter -> Fetch Insider Data -> Select Prompt -> Generate Reply -> Validate -> Delay -> Post.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Relevant Post Found)`: Continua il workflow.
    *   `IF (Tone & Length Validation Fail)`: Loop back to `Generate Reply` con feedback.
*   **Retry logic con max attempts**: Max 1 retry per la generazione della reply.
*   **Dove serve approval umano (Telegram)**: Opzionale, per reply su subreddit molto sensibili come r/wallstreetbets, ma l'obiettivo è l'automazione completa.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Ogni 60 minuti.
2.  **Fetch New Reddit Posts (API)**: Utilizza l'API di Reddit per recuperare i nuovi post dai 6 subreddit target.
3.  **Filter & Score Relevant Posts (Code Node)**:
    *   Filtra i post per parole chiave finanziarie e menzioni di ticker.
    *   Assegna un punteggio di rilevanza in base a engagement (upvotes, commenti) e pertinenza del topic.
    *   Verifica se abbiamo già commentato quel post.
    *   Implementa un daily cap (es. max 5 reply per subreddit al giorno).
4.  **IF (Relevant Post Found)**: Se un post supera la soglia di rilevanza e non è stato ancora commentato.
5.  **Fetch Insider Data for Ticker (NocoDB)**: Se il post menziona un ticker, recupera i dati insider più recenti e rilevanti per quel ticker.
6.  **Select Subreddit-Specific Prompt (Code Node)**: Sceglie il `System Prompt` e le istruzioni specifiche per il subreddit.
7.  **Generate Reply (Claude Sonnet)**:
    *   Input: Testo del post Reddit, dati insider rilevanti, `subreddit_tone`.
    *   Output: Commento Reddit (50-200 parole).
8.  **Validate Tone & Length (Code Node + Claude Sonnet)**:
    *   Code Node: Verifica lunghezza (50-200 parole), presenza di slang/emoji (per WSB), assenza di link diretti (per evitare spam).
    *   Claude Sonnet: "Valuta il tono di questa reply per r/{{subreddit_name}}. Sembra un redditor genuino? È troppo AI-generata o promozionale? Suggerisci modifiche."
9.  **Delay (10-30 min random)**: Aggiunge un ritardo casuale per sembrare più umano.
10. **Post Reply (Reddit API)**: Invia il commento tramite l'API di Reddit.
11. **Log Activity (NocoDB)**: Registra il post commentato e la reply.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un redditor esperto e appassionato di finanza, con un interesse particolare per l'insider trading. Il tuo obiettivo è partecipare a discussioni su Reddit in modo naturale, fornendo insight basati sui dati insider di EarlyInsider.com, ma senza sembrare promozionale o un bot.

Il tuo tono deve adattarsi perfettamente al subreddit specifico.
- **r/wallstreetbets**: Sfacciato, umoristico, con slang di WSB, ma con un dato solido. YOLO mentality.
- **r/stocks**: Informativo, equilibrato, leggermente analitico.
- **r/ValueInvesting**: Analitico, profondo, basato sui fondamentali, con un tocco di scetticismo sano.
- **r/investing**: Pratico, orientato ai consigli, con dati chiari.
- **r/Daytrading**: Veloce, orientato all'azione, con dati rilevanti per il breve termine.
- **r/PersonalFinance**: Cauto, educativo, orientato alla pianificazione a lungo termine (raro l'insider, ma se c'è, deve essere contestualizzato).

**Regole Fondamentali:**
1.  **Tono Autentico**: Adatta il tono al subreddit.
2.  **Angolo Insider Naturale**: Inietta il dato insider in modo organico, come se lo avessi scoperto tu.
3.  **Breve e Densa**: 50-200 parole. Ogni parola conta.
4.  **Nessun Link Diretto**: Non includere link espliciti al tuo sito.
5.  **Varia Struttura**: Non usare sempre la stessa introduzione o conclusione.
6.  **Passa AI Detection**: Scrivi come un umano.
```


**User Prompt Template (per r/wallstreetbets con dato insider)**


```
Genera una reply per il seguente post su r/wallstreetbets. Inietta il dato insider fornito in modo sfacciato e umoristico, tipico di WSB.

**Post Reddit:**
```

{{reddit_post_text}}

```

**Dati Insider Rilevanti (JSON):**
```
json
{
  "ticker": "GME",
  "insider_name": "Ryan Cohen",
  "title": "Chairman",
  "transaction_type": "P",
  "value_usd": 10000000,
  "date": "2026-03-20"
}

```

**Istruzioni Specifiche:**
1.  **Tono**: Sfacciato, YOLO, con slang di WSB.
2.  **Angolo Insider**: "Il grande capo ha appena messo i suoi soldi dove è la sua bocca."
3.  **Lunghezza**: 80-150 parole.
4.  **Emoji/Slang**: Includi 1-2 emoji pertinenti e slang di WSB (es. "tendies", "🚀", "💎🙌").
```


**Esempio di output per r/wallstreetbets:**

"LOL, tutti a parlare di $GME e intanto il grande capo, Ryan Cohen (Chairman), ha appena caricato altri $10M di azioni il 20 marzo. 🚀💎🙌 Non so voi, ma quando il CEO mette i suoi soldi, io inizio a sentire l'odore di tendies. Forse sa qualcosa che noi non sappiamo, o forse è solo un altro autista di razzi. Ad ogni modo, sembra che qualcuno abbia ancora fiducia. NFA, ovviamente, ma i miei diamanti sono pronti. 🚀"

**User Prompt Template (per r/ValueInvesting con dato insider)**


```
Genera una reply per il seguente post su r/ValueInvesting. Inietta il dato insider fornito in modo analitico e ponderato, tipico di r/ValueInvesting.

**Post Reddit:**
```

{{reddit_post_text}}

```

**Dati Insider Rilevanti (JSON):**
```
json
{
  "ticker": "BRK.B",
  "insider_name": "Warren Buffett",
  "title": "CEO",
  "transaction_type": "P",
  "value_usd": 50000000,
  "date": "2026-03-18",
  "context": "First significant buy in 5 years."
}

```

**Istruzioni Specifiche:**
1.  **Tono**: Analitico, ponderato, obiettivo, con un focus sui fondamentali e sul lungo termine.
2.  **Angolo Insider**: "Un segnale interessante da considerare nel contesto di una valutazione fondamentale."
3.  **Lunghezza**: 100-200 parole.
4.  **Evita Slang/Emoji**: Mantieni un linguaggio professionale.
```


**Esempio di output per r/ValueInvesting:**

"Discussione interessante su $BRK.B. Mentre molti si concentrano sui multipli attuali, ho notato un'attività insider piuttosto significativa che potrebbe meritare attenzione. Il 18 marzo 2026, Warren Buffett (CEO) ha effettuato un acquisto di $50 milioni. [cite: insider_data.value_usd] Questo è particolarmente degno di nota dato che è il primo acquisto significativo in oltre 5 anni. [cite: insider_data.context] Sebbene l'insider buying non sia l'unico fattore, un tale movimento da parte di un leader con un track record così consolidato suggerisce una potenziale sottovalutazione o fiducia nelle prospettive a lungo termine dell'azienda. Vale la pena approfondire l'analisi dei fondamentali per capire cosa potrebbe aver motivato questa mossa."

#### Data Pipeline

*   **Quali dati servono**: Testo del post Reddit, URL del post, ID del post, dati insider (ticker, nome, titolo, tipo, valore, data).
*   **Da dove vengono**: Reddit API, NocoDB (per i dati insider).
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza, presenza di parole chiave proibite (es. "iscriviti", "link in bio"), verifica del `subreddit_tone` (es. per WSB, presenza di slang; per ValueInvesting, assenza di slang).
*   **Claude Sonnet (seconda call)**: Per un controllo più sfumato del tono e della "umanità" della risposta.

#### Content Type Routing

*   **Mappa toni**: Un Code Node che, dato il `subreddit_name`, seleziona il set di istruzioni di tono appropriato per il prompt.
*   **Contenuto non-insider**: Se il post non menziona un ticker o non ha un angolo insider ovvio, il workflow può cercare un ticker rilevante nel post e poi cercare dati insider *generici* per quel settore o per il mercato in generale, e poi forzare l'AI a trovare un modo per collegarlo.

#### Content Strategy

*   **Subreddit focus**:
    *   `r/wallstreetbets`: Alto volume, alta visibilità, ma anche alto rumore. Ottimo per la brand awareness e per mostrare dati "shocking".
    *   `r/stocks`, `r/investing`: Più equilibrati, utenti più seri. Buoni per costruire credibilità.
    *   `r/ValueInvesting`: Nicchia più piccola ma molto qualificata. Ottimo per mostrare analisi approfondite.
*   **Tipo di contenuto**:
    *   **WSB**: YOLO + dati insider (es. "CEO ha comprato prima di un pump").
    *   **Stocks/Investing**: Analisi equilibrata con l'insider come "edge".
    *   **ValueInvesting**: Dati fondamentali + insider come conferma o segnale contrarian.
*   **Ticker trending**: Sì, i commenti su ticker trending ricevono più engagement.
*   **Bilanciare insider-only vs generico**: Per le reply, l'angolo insider è sempre il differenziante. Anche su un post generico, trova un modo per iniettarlo.
*   **Few-shot examples**: Molto utili per addestrare l'AI al tono specifico di ogni subreddit.
*   **Timing**: Il ritardo casuale (10-30 min) è fondamentale per sembrare umano.

---

### CAT 5 — Reddit Daily Thread

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Schedule (Daily, Morning)] --> B{Query NocoDB for Yesterday's Top Filings};
    B --> C[Filter & Select Top 2-4 Filings (Code Node)];
    C --> D[Select Daily Template (Code Node)];
    D --> E[Generate Daily Comment (Claude Sonnet/Template)];
    E --> F[Post Comment to Daily Thread (Reddit API)];
    F --> G[Log Activity (NocoDB)];
```


*   **Nodi sequenziali vs paralleli**: Tutti sequenziali.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (No Top Filings)`: Posta un commento generico o salta il giorno.
*   **Retry logic con max attempts**: Max 1 retry per la pubblicazione.
*   **Dove serve approval umano (Telegram)**: No, l'obiettivo è l'automazione completa per la credibilità quotidiana.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Ogni giorno feriale, mattina (es. 8:00 AM EST).
2.  **Query NocoDB for Yesterday's Top Filings**: Recupera tutti i filing SEC Form 4 del giorno precedente, ordinati per "Alert Score".
3.  **Filter & Select Top 2-4 Filings (Code Node)**:
    *   Seleziona i 2-4 filing con lo score più alto.
    *   Cerca di avere un mix (es. large cap + small cap, settori diversi).
    *   Escludi filing con 10b5-1 se non rilevanti per il daily thread.
4.  **Select Daily Template (Code Node)**: Sceglie uno dei 3 template giornalieri a rotazione.
5.  **Generate Daily Comment (Claude Sonnet/Template)**:
    *   Input: Dati dei 2-4 filing selezionati, template scelto.
    *   Output: Commento mattutino (80-150 parole).
    *   Per i template più semplici, potrebbe essere un Code Node che inietta i dati in un testo predefinito. Per variare il contenuto, l'AI è preferibile.
6.  **Post Comment to Daily Thread (Reddit API)**: Trova il "Daily Discussion Thread" del giorno e posta il commento.
7.  **Log Activity (NocoDB)**: Registra il commento postato.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un "insider detective" per la community di Reddit, che ogni mattina fornisce un rapido riepilogo delle attività insider più interessanti del giorno precedente. Il tuo obiettivo è costruire credibilità e fiducia, fornendo dati concisi e pertinenti in un tono amichevole e informativo.

**Regole Fondamentali:**
1.  **Conciso e Diritto al Punto**: 80-150 parole.
2.  **Dati Chiari**: Presenta i ticker, i nomi degli insider, i valori e le date in modo leggibile.
3.  **Tono Amichevole**: Sembra un redditor che condivide informazioni utili.
4.  **Variazione**: Non usare sempre la stessa introduzione/conclusione.
5.  **Angolo Insider**: Il focus è sempre sull'attività insider.
```


**Esempio dei 3 template giornalieri con dati realistici (AI-generated con dati iniettati):**

**Template 1: "Quick Hits"**


```
**User Prompt:**
Genera il commento giornaliero per il Daily Thread di Reddit usando il template "Quick Hits". Concentrati sui dati chiave.

**Dati Forniti (JSON):**
```
json
{
  "filings": [
    {
      "ticker": "CRM",
      "insider_name": "Marc Benioff",
      "title": "CEO",
      "value_usd": 12000000,
      "date": "2026-03-27"
    },
    {
      "ticker": "PLTR",
      "insider_name": "Alexander Karp",
      "title": "CEO",
      "value_usd": 5000000,
      "date": "2026-03-27"
    },
    {
      "ticker": "RIVN",
      "insider_name": "Robert J. Scaringe",
      "title": "CEO",
      "value_usd": 3000000,
      "date": "2026-03-27"
    }
  ]
}

```

**Output (AI-generated):**
"Buongiorno a tutti! Ecco un rapido riepilogo delle attività insider più interessanti di ieri:
*   **$CRM**: Marc Benioff (CEO) ha comprato $12M il 27 marzo. Un segnale di fiducia significativo dal capo di Salesforce.
*   **$PLTR**: Alexander Karp (CEO) ha aggiunto $5M di azioni il 27 marzo. Il CEO di Palantir continua a scommettere sulla sua azienda.
*   **$RIVN**: Robert J. Scaringe (CEO) ha acquistato $3M il 27 marzo. Un bel segnale per Rivian, che cerca di riprendersi.
Come sempre, NFA, ma è interessante vedere dove i grandi stanno mettendo i loro soldi. Buon trading!"
```


**Template 2: "Deep Dive Highlight"**


```
**User Prompt:**
Genera il commento giornaliero per il Daily Thread di Reddit usando il template "Deep Dive Highlight". Scegli il filing più interessante e approfondiscilo leggermente.

**Dati Forniti (JSON):**
```
json
{
  "filings": [
    {
      "ticker": "CRM",
      "insider_name": "Marc Benioff",
      "title": "CEO",
      "value_usd": 12000000,
      "date": "2026-03-27",
      "context": "Largest buy in 2 years, ahead of earnings."
    },
    {
      "ticker": "PLTR",
      "insider_name": "Alexander Karp",
      "title": "CEO",
      "value_usd": 5000000,
      "date": "2026-03-27"
    }
  ]
}

```

**Output (AI-generated):**
"Ciao Redditors! Un'occhiata all'attività insider di ieri. Il pezzo forte è sicuramente **$CRM**. Marc Benioff, il CEO di Salesforce, ha effettuato un acquisto massiccio di $12 milioni il 27 marzo. [cite: filings.0.value_usd] Questo non è un acquisto qualsiasi; è il suo più grande acquisto in due anni e arriva proprio in vista dei prossimi earnings. [cite: filings.0.context] Quando il fondatore e CEO mette una somma così ingente, è difficile ignorarlo. Potrebbe essere un segnale di forte fiducia nei risultati futuri o nelle prospettive a lungo termine. Anche Alexander Karp di $PLTR ha comprato $5M. Sempre interessante vedere i CEO che si espongono. Fate le vostre ricerche!"
```


**Template 3: "Sector Spotlight"**


```
**User Prompt:**
Genera il commento giornaliero per il Daily Thread di Reddit usando il template "Sector Spotlight". Raggruppa i filing per settore se possibile.

**Dati Forniti (JSON):**
```
json
{
  "filings": [
    {
      "ticker": "MRNA",
      "insider_name": "Stéphane Bancel",
      "title": "CEO",
      "value_usd": 4000000,
      "date": "2026-03-27",
      "sector": "Healthcare"
    },
    {
      "ticker": "PFE",
      "insider_name": "Albert Bourla",
      "title": "CEO",
      "value_usd": 2500000,
      "date": "2026-03-27",
      "sector": "Healthcare"
    },
    {
      "ticker": "GOOGL",
      "insider_name": "Sundar Pichai",
      "title": "CEO",
      "value_usd": 8000000,
      "date": "2026-03-27",
      "sector": "Technology"
    }
  ]
}

```

**Output (AI-generated):**
"Ehilà, gente! Vediamo cosa è successo nel mondo degli insider ieri. Sembra che il settore **Healthcare** abbia visto un po' di attività:
*   **$MRNA**: Stéphane Bancel (CEO) ha comprato $4M il 27 marzo.
*   **$PFE**: Albert Bourla (CEO) ha aggiunto $2.5M lo stesso giorno.
Interessante vedere due CEO di aziende farmaceutiche fare acquisti quasi contemporaneamente. Forse c'è qualcosa che bolle in pentola nel settore.
Nel frattempo, nel **Tech**, Sundar Pichai (CEO di Google) ha comprato $8M di $GOOGL. [cite: filings.2.value_usd] I grandi nomi continuano a investire nelle loro aziende. Come sempre, fate attenzione ai segnali! Buon venerdì!"
```


#### Data Pipeline

*   **Quali dati servono**: Filing SEC Form 4 del giorno precedente (ticker, insider, titolo, valore, data, settore, score).
*   **Da dove
 vengono**: NocoDB (per i filing già processati e score).
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza, presenza di 2-4 ticker, assenza di link.

#### Content Strategy

*   **Workflow separato**: Sì, un workflow separato è più pulito e facile da gestire rispetto a un branch condizionale in un workflow di reply.
*   **Selezione filing**: Score più alto è il criterio principale. Mix large/small cap e settori per varietà.
*   **Template**: Ruotare i 3 template per evitare ripetizioni. L'AI può generare il commento per aggiungere varietà.
*   **Weekend recap**: Un template specifico per il lunedì mattina che riassume l'attività del venerdì, sabato e domenica.
*   **Saltare giorni**: Se non ci sono filing significativi (es. score < 6), si può postare un commento generico ("Oggi poca attività insider degna di nota...") o saltare.
*   **Variare contenuto**: Sì, non solo insider. A volte un "earnings recap" con l'angolo insider, o un "macro update" con l'angolo insider.

---

### CAT 6 — Reddit Posts (DD/Analisi)

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Weekly DD Request (NocoDB/Manual)] --> B{Query NocoDB for High-Score Cluster Buys};
    B --> C[Select Best Ticker for DD (Code Node)];
    C --> D[Fetch Comprehensive Data (Finnhub, SEC)];
    D --> E[Generate DD Outline (Claude Sonnet)];
    E --> F[Generate DD Draft (Claude Sonnet)];
    F --> G[Generate Bear Case (Claude Sonnet)];
    G --> H{Quality Gate: AI Detection & DD Standards};
    H -- FAIL (Feedback) --> F;
    H -- PASS --> I[Extract Visual Data Points];
    I --> J[Generate Visuals (Puppeteer Server)];
    J --> K[Insert Visuals & Format Markdown (Code Node)];
    K --> L[Generate TLDR (Claude Sonnet)];
    L --> M[Human Review & Position Disclosure];
    M --> N[Post DD (Reddit API)];
    N --> O[Log Activity (NocoDB)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Data Fetching -> Outline -> Draft -> Bear Case -> Quality Gate -> Visual Extraction -> Visual Generation -> Visual Insertion -> TLDR -> Human Review -> Post.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Quality Gate Fail)`: Loop back to `Generate DD Draft` con feedback.
*   **Retry logic con max attempts**: Max 2 retries per la generazione del draft.
*   **Dove serve approval umano (Telegram)**: Sì, per `Human Review & Position Disclosure` prima di pubblicare.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Settimanale (es. venerdì mattina).
2.  **Query NocoDB for High-Score Cluster Buys**: Recupera i cluster buying recenti con score alto.
3.  **Select Best Ticker for DD (Code Node)**: Sceglie il ticker più promettente basandosi su score, rilevanza, e se non è stato coperto di recente.
4.  **Fetch Comprehensive Data (Finnhub, SEC)**: Dati SEC Form 4, dati finanziari completi, notizie, dati di settore.
5.  **Generate DD Outline (Claude Sonnet)**:
    *   Input: JSON aggregato.
    *   Output: Outline dettagliato per una DD Reddit-style (Introduzione, Tesi, Attività Insider, Analisi Finanziaria, Bear Case, Rischi, Conclusione, TLDR).
6.  **Generate DD Draft (Claude Sonnet)**:
    *   Input: JSON aggregato, Outline.
    *   Output: Draft completo in Markdown, con placeholder per i visual.
7.  **Generate Bear Case (Claude Sonnet)**:
    *   Input: JSON aggregato, draft del Bull Case.
    *   Output: Sezione Bear Case convincente.
8.  **Quality Gate: AI Detection & DD Standards (Code Node + Claude Sonnet)**:
    *   Code Node: Lunghezza (1500-2500 parole), presenza di Bear Case, formattazione Markdown.
    *   Claude Sonnet: "Valuta questa DD per il suo tono da 'redditor appassionato', accuratezza, e la genuinità del bear case. Sembra troppo AI-generata o troppo bullish? Suggerisci modifiche."
9.  **Extract Visual Data Points (Code Node)**: Identifica i dati per i 5-8 visual.
10. **Generate Visuals (Puppeteer Server)**: Chiama il server Puppeteer per generare i PNG.
11. **Insert Visuals & Format Markdown (Code Node)**: Inserisce i link alle immagini e formatta il testo in Reddit Markdown.
12. **Generate TLDR (Claude Sonnet)**:
    *   Input: DD completa.
    *   Output: TLDR accattivante.
13. **Human Review & Position Disclosure**: Revisione umana, aggiunta della disclosure sulla posizione.
14. **Post DD (Reddit API)**: Pubblica il post.
15. **Log Activity (NocoDB)**: Registra la DD.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un redditor appassionato e un investitore retail che ha fatto i compiti a casa. Il tuo obiettivo è scrivere una "Due Diligence" (DD) approfondita e autorevole per i subreddit finanziari, con un focus sull'attività insider. Il tuo tono deve essere quello di un investitore genuino, non un analista di Wall Street o un bot AI.

**Regole Fondamentali:**
1.  **Tono da Redditor**: Usa un linguaggio autentico, a volte colloquiale, ma sempre ben argomentato.
2.  **Dati Verificabili**: Tutti i dati devono essere accurati e supportati.
3.  **Bear Case Genuino**: Non essere eccessivamente ottimista. Presenta un bear case credibile e ben ragionato.
4.  **Formato Reddit Markdown**: Utilizza intestazioni, grassetti, elenchi puntati e link per le immagini.
5.  **Passa AI Detection**: Varia la sintassi, la lunghezza delle frasi, inserisci opinioni personali (ma basate sui dati).
```


**User Prompt Template (per DD su insider buying cluster con bear case)**


```
Scrivi una Due Diligence (DD) approfondita per Reddit su {{ticker}}, concentrandoti su un recente cluster buying significativo. Includi un bear case convincente.

**Dati Forniti (JSON):**
```
json
{{aggregated_data_json}}

```

**Outline DD (Generato nello step precedente, se applicabile):**
```
markdown
{{dd_outline_markdown}}

```

**Istruzioni Specifiche:**
1.  **Titolo**: Accattivante, include il ticker e l'argomento principale.
2.  **TLDR**: Genera un TLDR che riassuma i punti chiave e il verdict.
3.  **Introduzione**: Cattura l'attenzione, presenta il ticker e la tesi di investimento.
4.  **Sezione Attività Insider**:
    *   Dettaglia il cluster buying: chi ha comprato, quanto, quando, a quale prezzo.
    *   Analizza il track record degli insider coinvolti (se disponibile).
    *   Spiega perché questo cluster buying è significativo.
5.  **Analisi Finanziaria**: Breve panoramica dei fondamentali dell'azienda.
6.  **Bear Case & Rischi**:
    *   **FORZA l'AI a generare un bear case genuino e non generico.** Non minimizzare i rischi.
    *   Identifica 2-3 rischi specifici e credibili per {{ticker}} (es. concorrenza, debito, rallentamento del settore, problemi di prodotto).
    *   Spiega come questi rischi potrebbero impattare il titolo.
7.  **Conclusione**: Riassumi la tesi e il verdict.
8.  **Formato Immagini**: Inserisci placeholder per le immagini come `[Image: Insider Transaction Table]`, `[Image: Price Chart with Entry Point]`, ecc.
9.  **Position Disclosure**: Aggiungi un placeholder per la disclosure.
```


#### Data Pipeline

*   **Quali dati servono**: Dati SEC Form 4 (cluster buying), dati finanziari completi (bilanci, conto economico, cash flow, multipli), notizie, dati di settore, dati macro.
*   **Da dove vengono**: NocoDB, Finnhub, SEC EDGAR.
*   **Formato**: JSON strutturato.

#### Validazione

*   **Code Node**: Lunghezza, presenza di TLDR, presenza di Bear Case, formattazione Markdown corretta, numero di visual placeholder.
*   **Claude Sonnet (seconda call)**: Per il tono, la genuinità del bear case, e il punteggio di rilevamento AI.

#### Content Strategy

*   **Subreddit focus**: `r/stocks`, `r/investing`, `r/ValueInvesting` sono i migliori per le DD. `r/wallstreetbets` può funzionare per DD molto speculative.
*   **Tipo di contenuto**:
    *   **Insider-focused**: Cluster buying, track record di insider specifici.
    *   **Earnings deep dive + insider**: Analisi post-earnings con l'angolo insider.
    *   **Sector rotation + insider**: Dove gli insider stanno spostando i soldi tra settori.
    *   **Contrarian DD**: "Everyone hates $TICKER but insiders love it".
*   **Ticker selection**: Cluster buy recenti con score alto, ticker non coperti di recente, ticker con earnings in arrivo o catalizzatori.
*   **TLDR**: Cruciale per Reddit. Deve essere conciso e invogliare a leggere.
*   **Position disclosure**: Obbligatoria per credibilità.
*   **Immagini**: Caricare su Imgur (gratuito) e linkare. Reddit supporta anche upload diretti.
*   **Follow-up post**: Sì, dopo earnings o catalizzatori importanti, un breve aggiornamento.
*   **Contrarian posts**: Generano molto engagement.
*   **Educational**: Funziona bene se integrato in una DD o come post a sé stante ("TIL: Cluster buying outperforms by X%").

---

### CAT 7 — X Replies

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Schedule (Every 5 min)] --> B{Fetch New Tweets (TwitterAPI.io)};
    B --> C[Filter & Score Relevant Tweets (Code Node)];
    C --> D{IF (Relevant Tweet Found & Daily Cap Not Reached)};
    D -- TRUE --> E[Fetch Insider Data for Ticker (NocoDB)];
    E --> F[Select Reply Archetype & Tone (Code Node)];
    F --> G[Generate Reply (Claude Sonnet)];
    G --> H[Generate Visual (Puppeteer Server - Mini Card)];
    H --> I{Validate Reply (Code Node + Claude Sonnet)};
    I -- FAIL (Feedback) --> G;
    I -- PASS --> J[Send to Telegram for Human Approval];
    J --> K{IF (Human Approved)};
    K -- TRUE --> L[Post Reply + Like Tweet (X API)];
    K -- FALSE --> M[Log Rejected Reply];
    L --> N[Log Activity (NocoDB)];
    D -- FALSE --> O[End Workflow];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Fetch Tweets -> Filter -> Fetch Insider Data -> Select Archetype -> Generate Reply -> Generate Visual -> Validate -> Telegram Approval -> Post.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Relevant Tweet Found)`: Continua.
    *   `IF (Validation Fail)`: Loop back to `Generate Reply`.
    *   `IF (Human Approved)`: Posta.
*   **Retry logic con max attempts**: Max 1 retry per la generazione della reply.
*   **Dove serve approval umano (Telegram)**: Sì, per le reply su X, per garantire che il tono sia perfetto e non sembri spam.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Ogni 5 minuti.
2.  **Fetch New Tweets (TwitterAPI.io)**: Recupera i nuovi tweet dagli account target (50K-500K follower).
3.  **Filter & Score Relevant Tweets (Code Node)**:
    *   Filtra per menzioni di ticker o parole chiave finanziarie.
    *   Assegna un punteggio di rilevanza.
    *   Verifica se il tweet è già stato risposto.
    *   Implementa un daily cap.
4.  **IF (Relevant Tweet Found & Daily Cap Not Reached)**: Se il tweet supera la soglia.
5.  **Fetch Insider Data for Ticker (NocoDB)**: Recupera i dati insider più recenti e rilevanti per il ticker menzionato nel tweet.
6.  **Select Reply Archetype & Tone (Code Node)**:
    *   Sceglie uno dei 3 archetipi (Data Bomb, Contrarian Fact-Check, Pattern Reply) in rotazione o basato sul contenuto del tweet.
    *   Determina il tono in base all'account target (mappa statica o analisi AI del tweet).
7.  **Generate Reply (Claude Sonnet)**:
    *   Input: Testo del tweet, dati insider, archetipo, tono.
    *   Output: Reply (150-220 caratteri).
8.  **Generate Visual (Puppeteer Server - Mini Card)**: Se l'archetipo lo richiede, genera una `SEC Filing Mini Card` o `Comparison Card`.
9.  **Validate Reply (Code Node + Claude Sonnet)**:
    *   Code Node: Lunghezza (150-220 chars), assenza di link diretti, presenza del dato insider.
    *   Claude Sonnet: "Valuta questa reply per il suo tono, la concisione e l'impatto. Sembra un bot? Suggerisci modifiche."
10. **Send to Telegram for Human Approval**: Invia la reply generata e l'immagine (se presente) a un canale Telegram per l'approvazione umana.
11. **IF (Human Approved)**: Se l'umano approva.
12. **Post Reply + Like Tweet (X API)**: Invia la reply e mette "like" al tweet originale.
13. **Log Activity (NocoDB)**: Registra l'attività.

#### Prompt Design

**System Prompt (Claude Sonnet - Cached)**


```
Sei un analista finanziario di EarlyInsider.com, specializzato nell'individuare e condividere rapidamente insight sull'attività insider su X. Il tuo obiettivo è rispondere a tweet di account influenti con dati specifici e concisi, aggiungendo valore alla conversazione e attirando l'attenzione sul tuo profilo.

**Regole Fondamentali:**
1.  **Breve e Densa**: 150-220 caratteri. Ogni parola deve avere un impatto.
2.  **Dato Specifico**: Includi sempre un dato numerico o un fatto sull'attività insider.
3.  **Tono Adattivo**: Adatta il tono all'account target (es. più formale per Bloomberg, più diretto per un trader).
4.  **Nessun Link Diretto**: Non includere link espliciti.
5.  **Passa AI Detection**: Scrivi come un umano, con un tocco di personalità.
6.  **Archetipo**: Segui l'archetipo specificato.
```


**Esempio di prompt per ogni archetipo:**

**Archetipo 1: Data Bomb**


```
**User Prompt:**
Genera una reply "Data Bomb" per il seguente tweet. Inietta il dato insider fornito in modo diretto e conciso.

**Tweet Originale:**
```

{{original_tweet_text}}

```

**Dati Insider Rilevanti (JSON):**
```
json
{
  "ticker": "TSLA",
  "insider_name": "Elon Musk",
  "title": "CEO",
  "transaction_type": "P",
  "value_usd": 50000000,
  "date": "2026-03-25"
}

```

**Istruzioni Specifiche:**
1.  **Archetipo**: Data Bomb.
2.  **Tono**: Diretta, fattuale, impattante.
3.  **Lunghezza**: Massima 180 caratteri.
4.  **Focus**: Il dato insider è la notizia principale.
```


**Esempio Output Data Bomb:**
"Interessante. A proposito di $TSLA, Elon Musk (CEO) ha appena comprato $50M di azioni il 25 marzo. [cite: insider_data.value_usd] Un segnale forte di fiducia dal capo. #InsiderTrading"

**Archetipo 2: Contrarian Fact-Check**


```
**User Prompt:**
Genera una reply "Contrarian Fact-Check" per il seguente tweet. Il tweet esprime un sentimento bearish. Inietta un dato insider bullish per contrastare.

**Tweet Originale:**
```

{{original_tweet_text}}

```

**Dati Insider Rilevanti (JSON):**
```
json
{
  "ticker": "AMC",
  "insider_name": "Adam Aron",
  "title": "CEO",
  "transaction_type": "P",
  "value_usd": 1000000,
  "date": "2026-03-26",
  "context": "Despite recent bearish sentiment."
}

```

**Istruzioni Specifiche:**
1.  **Archetipo**: Contrarian Fact-Check.
2.  **Tono**: Leggermente scettico verso il tweet originale, ma basato sui fatti.
3.  **Lunghezza**: Massima 200 caratteri.
4.  **Focus**: Contraddire il sentiment con il dato insider.
```


**Esempio Output Contrarian Fact-Check:**
"Molti sono bearish su $AMC, ma il CEO Adam Aron ha appena comprato $1M di azioni il 26 marzo. [cite: insider_data.value_usd] Nonostante il rumore, gli insider a volte vedono qualcosa che il mercato ignora. Solo un dato. #InsiderBuying"

**Archetipo 3: Pattern Reply**


```
**User Prompt:**
Genera una reply "Pattern Reply" per il seguente tweet. Collega il dato insider a un pattern storico o a un contesto più ampio.

**Tweet Originale:**
```

{{original_tweet_text}}

```

**Dati Insider Rilevanti (JSON):**
```
json
{
  "ticker": "NVDA",
  "insider_name": "Colette Kress",
  "title": "CFO",
  "transaction_type": "P",
  "value_usd": 3000000,
  "date": "2026-03-20",
  "historical_pattern": "CFO bought 2 weeks before last 3 earnings beats."
}

```

**Istruzioni Specifiche:**
1.  **Archetipo**: Pattern Reply.
2.  **Tono**: Analitico, perspicace.
3.  **Lunghezza**: Massima 220 caratteri.
4.  **Focus**: Evidenziare un pattern o un contesto significativo.
```


**Esempio Output Pattern Reply:**
"Interessante discussione su $NVDA. Un dato da considerare: la CFO Colette Kress ha comprato $3M il 20 marzo. [cite: insider_data.value_usd] Storicamente, i suoi acquisti 2 settimane prima degli earnings hanno preceduto 3 beat consecutivi. [cite: insider_data.historical_pattern] Coincidenza? #InsiderPatterns"

#### Data Pipeline

*   **Quali dati servono**: Testo del tweet originale, ID del tweet, autore del tweet, dati insider (ticker, nome, titolo, tipo, valore, data, contesto storico).
*   **Da dove vengono**: TwitterAPI.io, NocoDB.
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza, presenza di dato numerico, assenza di link.
*   **Claude Sonnet (seconda call)**: Per il tone matching e l'impatto.

#### Content Strategy

*   **Prompt per reply corte**: Il `System Prompt` e la restrizione sui caratteri sono fondamentali. I `few-shot examples` per ogni archetipo aiutano molto.
*   **Contesto tweet + dato insider**: Passare entrambi nel JSON.
*   **Archetipi**: 3 prompt diversi o un dispatcher nel Code Node che seleziona le istruzioni specifiche per l'archetipo.
*   **Screenshot SEC filing**: Generare la `SEC Filing Mini Card` o `Comparison Card` con Puppeteer e allegarla.
*   **Quali tweet meritano reply**: Tweet che menzionano ticker con filing recenti, o tweet di account influenti su argomenti finanziari generali dove si può aggiungere un angolo insider.
*   **Tweet non-insider**: Trovare sempre un modo per aggiungere l'angolo insider.
*   **Tone matching**: Mappa statica per 25 account target è un buon inizio. L'AI può poi affinare il tono.
*   **Engagement farming**: `Like tweet + reply` è la strategia.
*   **Quando allegare la Comparison Card vs Mini Card**: `Comparison Card` per pattern storici o quando l'insider ha un track record notevole. `Mini Card` per un singolo alert significativo.

---

### CAT 8 — X Posts

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Schedule (4x/day)] --> B{Query NocoDB for Top Filings/Events};
    B --> C[Select Post Type & Content (Code Node)];
    C --> D[Generate Text (DeepSeek V3.2)];
    D --> E[Generate Visual (Puppeteer Server)];
    E --> F[Upload Media to X API];
    F --> G[Post Tweet with Media (X API)];
    G --> H[Log Activity (NocoDB)];
    H --> I[Schedule Quote-Retweet (Optional)];
```


*   **Nodi sequenziali vs paralleli**: Tutti sequenziali.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Post Type == Thread)`: Loop per generare più tweet.
*   **Retry logic con max attempts**: Max 1 retry per la generazione del testo/visual.
*   **Dove serve approval umano (Telegram)**: Opzionale, per post di alto impatto o se si vuole un controllo extra.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: 4 trigger `Schedule` separati per le 4 finestre orarie (9:30, 12:00, 15:30, 18:00 EST).
2.  **Query NocoDB for Top Filings/Events**: Recupera i filing con score più alto, earnings imminenti, market movers, ecc.
3.  **Select Post Type & Content (Code Node)**:
    *   Sceglie il formato (breaking, thread, commentary, poll) in rotazione o basato sul tipo di dato.
    *   Seleziona il ticker/evento più rilevante per quel formato.
4.  **Generate Text (DeepSeek V3.2)**:
    *   Input: Dati selezionati, formato del post.
    *   Output: Testo del tweet/thread.
5.  **Generate Visual (Puppeteer Server)**: Chiama il server Puppeteer per generare la `Data Card`, `Earnings Card`, `Market Movers Card` o `Contrarian Card`.
6.  **Upload Media to X API**: Carica l'immagine generata sull'API di X per ottenere un `media_id`.
7.  **Post Tweet with Media (X API)**: Invia il tweet con il `media_id` allegato.
8.  **Log Activity (NocoDB)**: Registra il tweet.
9.  **Schedule Quote-Retweet (Optional)**: Programma un quote-retweet dopo 2-3 ore per aumentare la visibilità.

#### Prompt Design

**System Prompt (DeepSeek V3.2 - Cached)**


```
Sei un social media manager esperto di EarlyInsider.com, specializzato nella creazione di post su X che generano engagement e attirano follower interessati all'insider trading. Il tuo obiettivo è comunicare insight finanziari complessi in modo conciso, visivamente accattivante e con un chiaro angolo insider.

**Regole Fondamentali:**
1.  **Conciso e Impattante**: Massimizza l'impatto in pochi caratteri.
2.  **Angolo Insider Obbligatorio**: Ogni post deve avere un riferimento all'attività insider.
3.  **Usa Hashtag Rilevanti**: Includi 2-3 hashtag pertinenti.
4.  **Varia Struttura**: Evita che i tweet sembrino template. Randomizza l'introduzione e la chiusura.
5.  **Formato Output**: Solo il testo del tweet.
```


**Esempio di prompt per ogni formato:**

**Formato 1: Breaking Alert (Data Card)**


```
**User Prompt:**
Genera un tweet "Breaking Alert" per un acquisto insider significativo.

**Dati Forniti (JSON):**
```
json
{
  "ticker": "MSFT",
  "insider_name": "Satya Nadella",
  "title": "CEO",
  "value_usd": 20000000,
  "date": "2026-03-28",
  "score": 9.2
}

```

**Istruzioni Specifiche:**
1.  **Formato**: Breaking Alert.
2.  **Tono**: Urgente, informativo.
3.  **Lunghezza**: Massima 250 caratteri.
4.  **Hashtag**: #InsiderBuying #MSFT
```


**Esempio Output Breaking Alert:**
"🚨 BREAKING: Satya Nadella (CEO di $MSFT) ha appena comprato $20M di azioni il 28 marzo! [cite: insider_data.value_usd] Un segnale di fiducia massiccio dal leader di Microsoft. Cosa ne pensate? #InsiderBuying #MSFT"

**Formato 2: Thread (Educational)**


```
**User Prompt:**
Genera un thread educativo su X che spieghi "Come leggere un Form 4".

**Dati Forniti (JSON):**
```
json
{
  "topic": "How to read a Form 4",
  "key_points": [
    {"title": "What is a Form 4?", "content": "SEC filing for insider transactions."},
    {"title": "Key Sections", "content": "Table I (non-derivative), Table II (derivative)."},
    {"title": "Important Fields", "content": "Transaction Code (P=Purchase, S=Sale), Shares, Price, Value, Date."},
    {"title": "Why it Matters", "content": "Insight into insider sentiment."}
  ]
}

```

**Istruzioni Specifiche:**
1.  **Formato**: Thread (2-3 tweet).
2.  **Tono**: Educativo, chiaro, semplice.
3.  **Lunghezza**: Ogni tweet max 280 caratteri.
4.  **Hashtag**: #InsiderTrading #Education #Form4
```


**Esempio Output Thread:**
**Tweet 1/3:** "Vuoi capire cosa fanno gli insider? Impara a leggere un Form 4! 🕵️‍♂️ Questo documento SEC rivela quando CEO, CFO e direttori comprano o vendono azioni della propria azienda. Ecco una guida rapida: #InsiderTrading #Education"
**Tweet 2/3:** "Le sezioni chiave: Table I per azioni ordinarie (non-derivative), Table II per opzioni (derivative). Cerca il 'Transaction Code': 'P' per acquisto, 'S' per vendita. Guarda le 'Shares', 'Price' e 'Value' per capire l'entità. #Form4"
**Tweet 3/3:** "Perché è importante? L'attività insider può dare un'idea della fiducia della leadership nel futuro dell'azienda. Un acquisto significativo spesso è un segnale bullish. Ma attenzione ai 10b5-1! 💡 #Investimenti"

**Formato 3: Commentary (Market Movers Card)**


```
**User Prompt:**
Genera un tweet di commento sui market movers del giorno, aggiungendo l'angolo insider.

**Dati Forniti (JSON):**
```
json
{
  "market_movers": [
    {"ticker": "SMCI", "change_percent": 15.2, "insider_activity": "CEO bought $2M last week"},
    {"ticker": "AMD", "change_percent": -5.1, "insider_activity": "No recent insider activity"},
    {"ticker": "DELL", "change_percent": 8.9, "insider_activity": "CFO sold $1M 2 months ago"}
  ],
  "market_context": "Tech sector rally."
}

```

**Istruzioni Specifiche:**
1.  **Formato**: Commentary.
2.  **Tono**: Analitico, informativo.
3.  **Lunghezza**: Massima 250 caratteri.
4.  **Hashtag**: #MarketMovers #TechStocks #InsiderTrading
```


**Esempio Output Commentary:**
"Rally nel settore tech oggi! $SMCI +15.2% dopo le notizie, e il CEO ha comprato $2M la scorsa settimana. [cite: market_movers.0.insider_activity] $AMD -5.1%, senza attività insider recente. $DELL +8.9%, ma il CFO ha venduto $1M 2 mesi fa. [cite: market_movers.2.insider_activity] Sempre interessante vedere come gli insider si muovono rispetto al mercato. #MarketMovers"

**Formato 4: Poll (Engagement)**


```
**User Prompt:**
Genera un tweet con un sondaggio per l'engagement, chiedendo quale insider buy gli utenti stanno osservando.

**Dati Forniti (JSON):**
```
json
{
  "poll_options": [
    {"ticker": "GOOGL", "insider_activity": "CEO bought $8M"},
    {"ticker": "AMZN", "insider_activity": "Director bought $5M"},
    {"ticker": "META", "insider_activity": "CTO bought $3M"}
  ],
  "question": "Quale di questi acquisti insider ti interessa di più?"
}

```

**Istruzioni Specifiche:**
1.  **Formato**: Poll.
2.  **Tono**: Interattivo, coinvolgente.
3.  **Lunghezza**: Massima 200 caratteri per il testo del tweet.
4.  **Hashtag**: #InsiderPoll #StockMarket #Investimenti
```


**Esempio Output Poll:**
"Curioso di sapere cosa pensate! Quale di questi recenti acquisti insider vi interessa di più? 🤔
A) $GOOGL (CEO bought $8M)
B) $AMZN (Director bought $5M)
C) $META (CTO bought $3M)
Votate e fateci sapere perché nei commenti! 👇 #InsiderPoll #StockMarket"

#### Data Pipeline

*   **Quali dati servono**: Filing SEC Form 4 (ticker, nome, titolo, valore, data, score), dati earnings (EPS, revenue, guidance), dati di mercato (top movers, % change), dati educativi.
*   **Da dove vengono**: NocoDB, Finnhub.
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza, presenza di hashtag, presenza di dato insider.
*   **DeepSeek V3.2 (seconda call)**: Per un controllo rapido del tono e della pertinenza.

#### Content Strategy

*   **Mix ottimale**: 30% insider alerts, 25% earnings reaction, 20% market commentary, 15% educational, 10% engagement/poll.
*   **Large cap vs small cap**: Mix. Large cap per reach, small cap per "scoperte".
*   **Thread**: Funzionano meglio quando sono educativi o data-driven con una narrazione chiara.
*   **Contrarian tweets**: Generano molto engagement e follower.
*   **Reazione a breaking news**: Cruciale. Avere un workflow rapido per integrare l'angolo insider.
*   **Poll**: Generano engagement se le opzioni sono pertinenti e interessanti.
*   **Bilanciare frequenza**: Alternare insider-core con contenuto generico finance per ampliare la reach.
*   **Account target per reply**: Account da 50K-500K follower, data-focused o opinion-focused.
*   **Tipo di tweet che genera follower**: Thread educativi, alert con screenshot, contrarian take.

---

### CAT 9 — Alert Scoring

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: New SEC Filing (SEC Monitor)] --> B{Fetch Filing Details (SEC EDGAR)};
    B --> C[Extract Raw Data (Code Node)];
    C --> D[Calculate Deterministic Base Score (Code Node)];
    D --> E[Fetch Market Cap (Finnhub)];
    E --> F{IF (Market Cap < Threshold)};
    F -- TRUE --> G[Adjust Score (Code Node - Small Cap Bonus)];
    F -- FALSE --> H[No Adjustment];
    G --> I[Prepare AI Refinement Prompt];
    H --> I;
    I --> J[AI Refinement (DeepSeek V3.2)];
    J --> K[Final Score & Log (NocoDB)];
    K --> L[Trigger Alert Analysis (CAT 10)];
```


*   **Nodi sequenziali vs paralleli**: Tutti sequenziali.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Market Cap < Threshold)`: Applica bonus per small cap.
*   **Retry logic con max attempts**: No retry per lo scoring, deve essere deterministico.
*   **Dove serve approval umano (Telegram)**: No, deve essere completamente automatico.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Nuovo SEC Form 4 rilevato dal monitor.
2.  **Fetch Filing Details (SEC EDGAR)**: Scarica il filing completo.
3.  **Extract Raw Data (Code Node)**: Parsa il filing per estrarre tutti i campi rilevanti (insider, titolo, tipo transazione, azioni, prezzo, valore, data, 10b5-1 flag, shares after).
4.  **Calculate Deterministic Base Score (Code Node)**: Implementa la formula pesata.
5.  **Fetch Market Cap (Finnhub)**: Ottiene la capitalizzazione di mercato del ticker.
6.  **IF (Market Cap < Threshold)**: Se la market cap è inferiore a $500M (es.).
7.  **Adjust Score (Code Node - Small Cap Bonus)**: Aggiunge un bonus di +1 o +2 punti al base score.
8.  **Prepare AI Refinement Prompt**: Prepara il prompt per l
'AI con il base score e i dati qualitativi.
9.  **AI Refinement (DeepSeek V3.2)**: L'AI aggiusta il punteggio di -1/0/+1.
10. **Final Score & Log (NocoDB)**: Salva il punteggio finale in NocoDB.
11. **Trigger Alert Analysis (CAT 10)**: Passa l'alert al workflow di analisi.

#### ESEMPIO della formula deterministica completa con numeri

**Fattori e Pesi:**

1.  **Valore della Transazione (30%)**:
    *   `Value > $1M`: +30
    *   `$500K - $1M`: +20
    *   `$100K - $500K`: +10
    *   `< $100K`: +5
2.  **Percentuale di Aumento della Partecipazione (25%)**:
    *   `% Increase > 10%`: +25
    *   `5% - 10%`: +15
    *   `1% - 5%`: +10
    *   `< 1%`: +5
3.  **Ruolo dell'Insider (20%)**:
    *   `CEO/CFO/Presidente`: +20
    *   `Direttore/Consigliere`: +15
    *   `Altro Officer`: +10
    *   `Azionista 10%`: +5
4.  **Cluster Buying (15%)**:
    *   `3+ insider in 30 giorni`: +15
    *   `2 insider in 30 giorni`: +10
    *   `Singolo insider`: +0
5.  **Assenza di Piano 10b5-1 (5%)**:
    *   `NO 10b5-1`: +5 (indica acquisto discrezionale)
    *   `SÌ 10b5-1`: +0
6.  **Giorni dall'Ultimo Acquisto (5%)**:
    *   `> 180 giorni`: +5 (indica una nuova convinzione)
    *   `90-180 giorni`: +3
    *   `< 90 giorni`: +1

**Calcolo Base Score (su 100):**
`Base Score = (Punteggio Valore + Punteggio % Aumento + Punteggio Ruolo + Punteggio Cluster + Punteggio 10b5-1 + Punteggio Giorni Ultimo Acquisto) / 10` (per normalizzare a 10)

**Aggiustamento Small Cap:**
*   `IF Market Cap < $500M`: `Base Score = Base Score + 1.5` (es. un bonus di 1.5 punti)

**Esempio:**
*   CEO compra $2M (Punteggio Valore: 30)
*   Aumento partecipazione del 7% (Punteggio % Aumento: 15)
*   Ruolo CEO (Punteggio Ruolo: 20)
*   2 insider in 30 giorni (Punteggio Cluster: 10)
*   NO 10b5-1 (Punteggio 10b5-1: 5)
*   Ultimo acquisto > 180 giorni fa (Punteggio Giorni: 5)
*   **Totale Raw Score**: 30 + 15 + 20 + 10 + 5 + 5 = 85
*   **Base Score normalizzato**: 85 / 10 = 8.5
*   **Market Cap**: $300M (quindi < $500M)
*   **Score dopo Small Cap Bonus**: 8.5 + 1.5 = 10

#### Prompt AI per refinement


```
**System Prompt (DeepSeek V3.2 - Cached)**
Sei un raffinatore di punteggi di alert insider per EarlyInsider.com. Il tuo compito è applicare un aggiustamento qualitativo finale al punteggio base di un alert, basandoti su fattori non quantificabili. Puoi solo aggiustare il punteggio di -1, 0 o +1.

**Regole Fondamentali:**
1.  **Aggiustamento Limitato**: Solo -1, 0, +1.
2.  **Fattori Qualitativi**: Considera il contesto delle notizie, il sentiment generale del mercato, la reputazione dell'insider (se nota), o anomalie nel filing.
3.  **Giustificazione**: Fornisci una breve giustificazione per l'aggiustamento.
```



```
**User Prompt Template:**
Il punteggio base deterministico per l'alert su {{ticker}} è {{base_score}}.
Ecco i dettagli dell'alert e il contesto qualitativo:

**Dettagli Alert (JSON):**
```
json
{{alert_details_json}}

```

**Contesto Qualitativo:**
- Notizie recenti su {{ticker}}: {{recent_news_summary}}
- Sentiment di mercato per il settore {{sector}}: {{sector_sentiment}}
- Track record noto dell'insider {{insider_name}}: {{insider_track_record_summary}}

Considerando questi fattori, suggerisci un aggiustamento al punteggio base (-1, 0, o +1) e giustificalo brevemente.
```


#### Data Pipeline

*   **Quali dati servono**: Tutti i campi del Form 4, market cap, storico acquisti/vendite dell'insider, notizie recenti (da Finnhub), sentiment di settore (da Finnhub o API di sentiment).
*   **Da dove vengono**: SEC EDGAR, Finnhub, NocoDB (per storico insider).
*   **Formato**: JSON.

#### Validazione

*   **Calibrazione**: Loggare la distribuzione dei punteggi in NocoDB. Se più del 20% degli alert sono 8+, inviare un alert Telegram per revisione della formula.
*   **10b5-1**: Indicato nel Form 4 (campo "Rule 10b5-1 Transaction").
*   **"Days since last buy"**: Calcolato in un Code Node interrogando NocoDB per gli acquisti precedenti dello stesso insider.
*   **Filing con transazioni multiple**: Il Code Node deve aggregare il valore e le azioni per lo stesso insider/data, o trattare ogni transazione separatamente se sono diverse.

---

### CAT 10 — Alert Analysis

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: New Scored Alert (from CAT 9)] --> B{Fetch Comprehensive Data for Ticker};
    B --> C[Prepare AI Analysis Prompt];
    C --> D[Generate Analysis (DeepSeek V3.2)];
    D --> E{Validate Analysis (Code Node)};
    E -- FAIL (Feedback) --> D;
    E -- PASS --> F[Store Analysis (NocoDB)];
    F --> G[Trigger Newsletter/Alert Pro (CAT 11)];
```


*   **Nodi sequenziali vs paralleli**: Tutti sequenziali.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Score >= 8)`: Prompt per 200-250 parole.
    *   `IF (Score >= 6)`: Prompt per 150-200 parole.
    *   `ELSE`: Prompt per 100-150 parole.
    *   `IF (Validation Fail)`: Loop back to `Generate Analysis`.
*   **Retry logic con max attempts**: Max 1 retry.
*   **Dove serve approval umano (Telegram)**: No, deve essere automatico.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Nuovo alert con score finale (da CAT 9).
2.  **Fetch Comprehensive Data for Ticker**: Recupera dati SEC Form 4, dati finanziari (prezzo, earnings date, analisti), notizie recenti, storico track record dell'insider.
3.  **Prepare AI Analysis Prompt**:
    *   Include il `score` per condizionare la lunghezza.
    *   Passa tutti i dati rilevanti.
    *   Include `nextEarningsDate` e istruzioni per menzionarlo.
4.  **Generate Analysis (DeepSeek V3.2)**:
    *   Input: Dati aggregati, prompt condizionale.
    *   Output: Analisi dell'alert (100-250 parole).
5.  **Validate Analysis (Code Node)**:
    *   Lunghezza: Verifica che rientri nel range desiderato.
    *   Presenza di "What to Watch" e `nextEarningsDate`.
    *   Presenza di citazioni del track record.
    *   Regex per $, %, date.
6.  **Store Analysis (NocoDB)**: Salva l'analisi nel record dell'alert.
7.  **Trigger Newsletter/Alert Pro (CAT 11)**: L'analisi è pronta per essere usata negli alert Pro o nella newsletter.

#### Prompt Design

**System Prompt (DeepSeek V3.2 - Cached)**


```
Sei un analista di EarlyInsider.com, specializzato nella creazione di analisi concise e impattanti per gli alert di insider trading. Il tuo obiettivo è spiegare PERCHÉ un trade è significativo, fornendo contesto e indicando cosa osservare in futuro.

**Regole Fondamentali:**
1.  **Conciso e Focalizzato**: 100-250 parole, a seconda del punteggio.
2.  **Hook + Contesto + What to Watch**: Segui questa struttura.
3.  **Dati Verificabili**: Cita numeri specifici dai dati forniti.
4.  **Bilanciato**: Presenta sia il potenziale rialzista che eventuali note di cautela.
5.  **Angolo Insider**: Il focus è sempre sull'attività insider.
```


**User Prompt Template (per alert score 9 - CEO cluster buy $5M)**


```
Genera un'analisi dettagliata per il seguente alert insider. Il punteggio dell'alert è {{alert_score}}.

**Dettagli Alert (JSON):**
```
json
{
  "ticker": "CRM",
  "company_name": "Salesforce Inc.",
  "insider_name": "Marc Benioff",
  "title": "CEO",
  "transaction_type": "P",
  "value_usd": 5000000,
  "date": "2026-03-27",
  "cluster_info": "3 altri insider hanno comprato azioni CRM negli ultimi 30 giorni.",
  "insider_track_record": "Marc Benioff ha un track record del 75% di guadagni a 6 mesi sui suoi acquisti precedenti.",
  "next_earnings_date": "2026-05-20",
  "recent_news": "Salesforce ha annunciato una nuova partnership strategica la scorsa settimana."
}

```

**Istruzioni Specifiche:**
1.  **Lunghezza Target**: 200-250 parole (dato che il punteggio è 9).
2.  **Struttura**:
    *   **Hook**: Inizia con una frase che cattura l'attenzione sull'importanza dell'acquisto.
    *   **Contesto**: Spiega chi ha comprato, quanto, quando. Evidenzia il cluster buying e il track record dell'insider. Collega l'acquisto alle notizie recenti.
    *   **What to Watch**: **DEVI menzionare la prossima data degli earnings ({{next_earnings_date}}) e spiegare perché è rilevante in relazione all'acquisto insider.**
3.  **Tono**: Autorevole, informativo, leggermente bullish ma con un tocco di realismo.
4.  **Citazioni**: Cita esplicitamente il valore dell'acquisto, il track record e la data degli earnings.
```


#### Data Pipeline

*   **Quali dati servono**: Tutti i dati dell'alert (dal CAT 9), `nextEarningsDate` (da Finnhub), `insider_track_record` (da NocoDB).
*   **Da dove vengono**: NocoDB, Finnhub.
*   **Formato**: JSON.

#### Validazione

*   **Code Node**:
    *   Lunghezza: Verifica che rientri nel range (es. 200-250 per score 9).
    *   Presenza di `nextEarningsDate` e della frase "What to Watch".
    *   Presenza di citazioni del track record.
    *   Regex per validare numeri e date citate.
*   **Unicità**: Per alert nello stesso settore, il Code Node può verificare la presenza di frasi comuni e, se necessario, richiedere all'AI di riformulare.

#### Content Strategy

*   **Lunghezza variabile**: Cruciale per non affaticare gli utenti con analisi lunghe per alert meno significativi.
*   **"What to Watch"**: Fondamentale per la retention. Fornisce un motivo per cui l'utente dovrebbe continuare a seguire il titolo.
*   **Bilanciare bullish e cautionary**: L'AI deve essere istruita a presentare un quadro realistico, non solo bullish.
*   **Track record**: Aggiunge credibilità.
*   **Unicità**: L'AI deve essere istruita a trovare angoli unici anche per alert simili.
*   **Contesto**: Passare sufficiente contesto (filing corrente, ultimi 5 alert stesso ticker, notizie recenti) per un'analisi completa.

---

### CAT 11 — Newsletter

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: Schedule (Monday 6:30 AM)] --> B{Fetch Data for Newsletter Sections};
    B --> C[Generate "Move of the Week" (DeepSeek V3.2)];
    C --> D[Generate "Top Alerts Recap" (DeepSeek V3.2)];
    D --> E[Generate "What I'm Watching" (DeepSeek V3.2)];
    E --> F[Generate "Educational Tip" (DeepSeek V3.2)];
    F --> G[Generate "Articles to Read" (Code Node)];
    G --> H[Generate "P.S. CTA" (Code Node/DeepSeek)];
    H --> I[Assemble Newsletter HTML (Code Node)];
    I --> J[Generate 2 Subject Lines (DeepSeek V3.2)];
    J --> K[Segment Free vs Pro Content (Code Node)];
    K --> L[Send to Beehiiv (API - Free)];
    K --> M[Send to Beehiiv (API - Pro)];
    L & M --> N[Log Activity (NocoDB)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Trigger -> Fetch Data -> Generate Sections (C-H) -> Assemble HTML -> Subject Lines -> Segment -> Send.
    *   Paralleli: La generazione delle singole sezioni può essere parallela.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Subscriber Type == Free)`: Invia versione Free.
    *   `IF (Subscriber Type == Pro)`: Invia versione Pro.
*   **Retry logic con max attempts**: Max 1 retry per la generazione di ogni sezione.
*   **Dove serve approval umano (Telegram)**: Opzionale, per la revisione finale prima dell'invio.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Ogni lunedì, 6:30 AM EST.
2.  **Fetch Data for Newsletter Sections**:
    *   `Move of the Week`: Alert con score più alto della settimana precedente.
    *   `Top Alerts Recap`: Top 5-10 alert della settimana.
    *   `What I'm Watching`: Prossimi earnings, eventi macro.
    *   `Educational Tip`: Un tip casuale da NocoDB.
    *   `Articles to Read`: Ultimi 3 articoli del blog.
3.  **Generate "Move of the Week" (DeepSeek V3.2)**: Analisi approfondita dell'alert principale.
4.  **Generate "Top Alerts Recap" (DeepSeek V3.2)**: Breve riassunto dei top alert.
5.  **Generate "What I'm Watching" (DeepSeek V3.2)**: Elenco di eventi futuri con angolo insider.
6.  **Generate "Educational Tip" (DeepSeek V3.2)**: Breve spiegazione di un concetto.
7.  **Generate "Articles to Read" (Code Node)**: Formatta i link agli articoli.
8.  **Generate "P.S. CTA" (Code Node/DeepSeek)**: Genera il CTA per il referral program o l'upsell.
9.  **Assemble Newsletter HTML (Code Node)**: Combina tutte le sezioni in un unico HTML, usando un template Beehiiv.
10. **Generate 2 Subject Lines (DeepSeek V3.2)**: Per A/B testing.
11. **Segment Free vs Pro Content (Code Node)**: Crea due versioni dell'HTML: una per Free (con CTA per Pro) e una per Pro (con CTA per referral).
12. **Send to Beehiiv (API - Free)**: Invia la versione Free.
13. **Send to Beehiiv (API - Pro)**: Invia la versione Pro.
14. **Log Activity (NocoDB)**: Registra l'invio.

#### Prompt Design

**System Prompt (DeepSeek V3.2 - Cached)**


```
Sei Ryan, il fondatore di EarlyInsider.com. Stai scrivendo la newsletter settimanale per i tuoi abbonati. Il tuo tono deve essere quello di un "amico intelligente" che condivide insight preziosi: informale ma autorevole, amichevole ma professionale, e sempre con un tocco personale.

**Regole Fondamentali:**
1.  **Tono "Smart Friend"**: Scrivi come se stessi inviando un'email a un amico fidato.
2.  **Valore**: Ogni sezione deve fornire valore.
3.  **Angolo Insider**: Il focus è sempre sull'attività insider.
4.  **Conciso**: Evita la verbosità.
5.  **Formato HTML/Markdown**: Genera il testo per ogni sezione.
```


**User Prompt Template (per generare la newsletter con tutte 6 le sezioni)**


```
Genera il contenuto per la newsletter settimanale di EarlyInsider.com. Includi tutte le 6 sezioni richieste, usando i dati forniti.

**Dati Forniti (JSON):**
```
json
{
  "move_of_the_week": {
    "ticker": "CRM",
    "insider_name": "Marc Benioff",
    "value_usd": 12000000,
    "date": "2026-03-27",
    "context": "Largest buy in 2 years, ahead of earnings."
  },
  "top_alerts_recap": [
    {"ticker": "PLTR", "insider_name": "Alexander Karp", "value_usd": 5000000},
    {"ticker": "RIVN", "insider_name": "Robert J. Scaringe", "value_usd": 3000000}
  ],
  "what_im_watching": [
    {"event": "NVDA Earnings", "date": "2026-05-20", "insider_angle": "CFO bought $3M last month."},
    {"event": "FOMC Meeting", "date": "2026-04-15", "insider_angle": "Tech CEOs have been buying aggressively ahead of rate decision."}
  ],
  "educational_tip": {
    "title": "Cos'è il Cluster Buying?",
    "content": "Quando 3 o più insider comprano lo stesso titolo in un breve periodo, è un segnale molto forte."
  },
  "articles_to_read": [
    {"title": "NVDA Insider Buying 2026", "url": "earlyinsider.com/nvda-insider-buying"},
    {"title": "How to Read a Form 4", "url": "earlyinsider.com/how-to-read-form4"}
  ],
  "subscriber_type": "Free" // o "Pro"
}

```

**Istruzioni Specifiche per Ogni Sezione:**

**1. Oggetto (2 opzioni per A/B testing):**
   *   Genera 2 subject line: una con un numero o un dato specifico, l'altra con un "curiosity gap".

**2. Introduzione:**
   *   Saluta gli abbonati con un tono amichevole.
   *   Breve panoramica di cosa coprirà la newsletter.

**3. Move della Settimana (Deep Dive):**
   *   Analizza l'alert in `move_of_the_week`.
   *   Spiega perché è significativo, usando il contesto fornito.
   *   Lunghezza: 200-300 parole.

**4. Top Alerts Recap:**
   *   Elenca i `top_alerts_recap` in modo conciso.
   *   Breve commento su ciascuno.
   *   Lunghezza: 150-200 parole.

**5. What I'm Watching:**
   *   Elenca gli eventi in `what_im_watching`.
   *   Per ogni evento, spiega l'angolo insider.
   *   Lunghezza: 100-150 parole.

**6. Educational Tip:**
   *   Presenta il `educational_tip` in modo chiaro e conciso.
   *   Lunghezza: 80-120 parole.

**7. Articoli da Leggere:**
   *   Formattare i `articles_to_read` come una lista di link.

**8. P.S. (Call to Action):**
   *   **Se `subscriber_type` è "Free"**: Includi un CTA per l'upgrade a Pro, evidenziando i benefici degli alert in tempo reale.
   *   **Se `subscriber_type` è "Pro"**: Includi un CTA per il referral program, incoraggiando a condividere EarlyInsider.com.

**Formato Output**: Genera il testo per ogni sezione in Markdown.
```


#### Data Pipeline

*   **Quali dati servono**: Alert con score alto (settimanali), prossime date earnings, eventi macro (FOMC, CPI), articoli recenti del blog, tip educativi.
*   **Da dove vengono**: NocoDB, Finnhub (per earnings/macro).
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza delle sezioni, presenza di tutte le sezioni, presenza di 2 subject lines, presenza del CTA corretto per il tipo di abbonato.
*   **DeepSeek V3.2 (seconda call)**: Per il tono "smart friend" e la coerenza generale.

#### Content Strategy

*   **6 sezioni**: Un prompt per tutta la newsletter è più efficiente per mantenere la coerenza del tono.
*   **Tono "smart friend"**: Il `System Prompt` è cruciale. L'uso di "Ryan" come persona aiuta.
*   **2 subject line per A/B**: L'AI può generarle facilmente.
*   **"Move della settimana"**: Scegliere il ticker con lo score più alto o il più riconoscibile per il deep dive.
*   **"What I'm Watching"**: Basarsi su eventi reali (earnings, macro) e aggiungere l'angolo insider.
*   **Segmentazione Free vs Pro**: Generare due versioni HTML e inviarle separatamente tramite Beehiiv.
*   **P.S. CTA**: L'AI può generarlo in base al tipo di abbonato.
*   **Referral program**: Integrarlo nel CTA per gli abbonati Pro.

---

### CAT 12 — Outreach Emails

#### n8n Workflow Architecture


```mermaid
graph TD
    A[Trigger: New Prospect (NocoDB/Manual)] --> B{Scrape Prospect Blog/Article (Puppeteer/Code)};
    B --> C[Extract Personalization Data (Code Node)];
    C --> D[Select Outreach Type (Code Node)];
    D --> E[Generate First Email (DeepSeek V3.2)];
    E --> F[Send Email (SMTP)];
    F --> G[Log Activity & Schedule Follow-ups (NocoDB)];
    G --> H[Trigger: Schedule (Follow-up 1)];
    G --> I[Trigger: Schedule (Follow-up 2)];
    G --> J[Trigger: Schedule (Follow-up 3)];
    H --> K[Generate Follow-up 1 (DeepSeek V3.2)];
    I --> L[Generate Follow-up 2 (DeepSeek V3.2)];
    J --> M[Generate Follow-up 3 (DeepSeek V3.2)];
    K & L & M --> N[Send Email (SMTP)];
    N --> O[Log Activity (NocoDB)];
```


*   **Nodi sequenziali vs paralleli**:
    *   Sequenziali: Trigger -> Scrape -> Extract -> Select Type -> Generate First Email -> Send -> Log & Schedule.
    *   Paralleli: I trigger dei follow-up sono paralleli e indipendenti.
*   **Branch condizionali (IF node) con condizioni esatte**:
    *   `IF (Prospect Replied)`: Annulla i follow-up.
*   **Retry logic con max attempts**: Max 1 retry per l'invio dell'email.
*   **Dove serve approval umano (Telegram)**: Opzionale, per la prima email per garantire la massima personalizzazione.

#### Workflow Ottimale (step sequenziali)

1.  **Trigger**: Nuovo prospect in NocoDB (es. tabella `outreach_prospects`) o trigger manuale.
2.  **Scrape Prospect Blog/Article (Puppeteer/Code)**: Visita l'URL del blog del prospect e estrae il titolo dell'ultimo articolo, un paragrafo rilevante, il nome dell'autore.
3.  **Extract Personalization Data (Code Node)**: Estrae nome del prospect, nome del blog, titolo dell'articolo, un punto specifico dell'articolo a cui fare riferimento.
4.  **Select Outreach Type (Code Node)**: Sceglie il tipo di CTA (guest post, link swap, "can I send data").
5.  **Generate First Email (DeepSeek V3.2)**:
    *   Input: Dati di personalizzazione, tipo di CTA.
    *   Output: Email 100-125 parole.
6.  **Send Email (SMTP)**: Invia l'email.
7.  **Log Activity & Schedule Follow-ups (NocoDB)**: Registra l'invio e programma 3 follow-up (Day 5, Day 10, Day 16) in NocoDB.
8.  **Trigger: Schedule (Follow-up X)**: Trigger separati per ogni follow-up.
9.  **Generate Follow-up X (DeepSeek V3.2)**: Genera l'email di follow-up con un tono diverso.
10. **Send Email (SMTP)**: Invia.
11. **Log Activity (NocoDB)**: Registra l'invio.

#### Prompt Design

**System Prompt (DeepSeek V3.2 - Cached)**


```
Sei un esperto di outreach per EarlyInsider.com. Il tuo obiettivo è scrivere email di cold outreach altamente personalizzate e persuasive per ottenere backlink, guest post o collaborazioni. Il tuo tono deve essere rispettoso, professionale, amichevole e focalizzato sul valore per il destinatario.

**Regole Fondamentali:**
1.  **Altamente Personalizzato**: Fai riferimento specifico al lavoro del destinatario.
2.  **Valore Reciproco**: Sottolinea come la collaborazione può beneficiare entrambi.
3.  **Breve e Conciso**: 100-125 parole per la prima email, più brevi per i follow-up.
4.  **CTA Chiaro (Domanda)**: Termina con una domanda che invita a rispondere.
5.  **Nessun Spam**: Evita un linguaggio troppo promozionale.
```


**User Prompt Template (per prima email + 3 follow-up)**


```
Genera una sequenza di email di outreach per il prospect {{prospect_name}} di {{prospect_blog_name}}.

**Dati di Personalizzazione (JSON):**
```
json
{
  "prospect_name": "John Doe",
  "prospect_email": "john.doe@example.com",
  "prospect_blog_name": "Investing Insights",
  "prospect_article_title": "The Future of AI in Finance",
  "prospect_article_snippet": "Ho apprezzato molto il tuo punto sulla convergenza tra AI e mercati azionari.",
  "our_data_point": "I nostri dati mostrano che gli insider tech hanno aumentato gli acquisti del 15% nell'ultimo trimestre.",
  "cta_type": "guest_post" // o "link_swap", "send_data"
}

```

**Istruzioni Specifiche per Ogni Email:**

**Email 1 (Prima Email - 100-125 parole):**
1.  **Oggetto**: Domanda personalizzata o riferimento all'articolo.
2.  **Introduzione**: Riferimento specifico all'articolo di `{{prospect_article_title}}` e al `{{prospect_article_snippet}}`.
3.  **Valore Nostro**: Inietta `{{our_data_point}}` in modo naturale.
4.  **CTA**: Basato su `{{cta_type}}`.
    *   `guest_post`: "Saresti aperto a un guest post da parte nostra su come l'attività insider si lega all'AI?"
    *   `link_swap`: "Saresti interessato a esplorare una collaborazione per lo scambio di link?"
    *   `send_data`: "Saresti interessato a ricevere alcuni dei nostri dati esclusivi sull'attività insider?"

**Email 2 (Follow-up 1 - Giorno 5 - 50-75 parole):**
1.  **Oggetto**: Re: [Oggetto Email 1]
2.  **Tono**: Breve, amichevole, promemoria.
3.  **Contenuto**: "Solo un rapido follow-up al mio messaggio della scorsa settimana. Volevo assicurarmi che non fosse finito nello spam."
4.  **CTA**: Ripeti il CTA originale in modo più leggero.

**Email 3 (Follow-up 2 - Giorno 10 - 30-50 parole):**
1.  **Oggetto**: Re: [Oggetto Email 1]
2.  **Tono**: Ancora più breve, con un nuovo piccolo valore.
3.  **Contenuto**: "Capisco che sei impegnato. Volevo solo aggiungere che abbiamo anche dati su X che potrebbero interessarti."
4.  **CTA**: Domanda ancora più diretta.

**Email 4 (Follow-up 3 - Giorno 16 - 20-30 parole):**
1.  **Oggetto**: Re: [Oggetto Email 1]
2.  **Tono**: Ultimo tentativo, rispettoso del tempo.
3.  **Contenuto**: "Un'ultima prova. Se non è il momento giusto, nessun problema. In bocca al lupo con il tuo lavoro!"
4.  **CTA**: Nessun CTA esplicito, solo un'apertura.

**Formato Output**: Genera il testo completo di ogni email.
```


#### Data Pipeline

*   **Quali dati servono**: Nome prospect, email, nome blog, URL blog, titolo ultimo articolo, snippet rilevante, dato insider specifico per il prospect, tipo di CTA.
*   **Da dove vengono**: NocoDB (prospect list), Puppeteer (scraping blog).
*   **Formato**: JSON.

#### Validazione

*   **Code Node**: Lunghezza delle email, presenza di personalizzazione, presenza di CTA domanda, verifica del `?` nell'oggetto.
*   **Warm-up progressivo**: Il Code Node può contare le email inviate al giorno e limitarle per evitare di finire in spam.

#### Content Strategy

*   **Personalizzazione automatica**: Scraping del blog del prospect è fondamentale.
*   **Dato specifico**: L'AI deve trovare un dato insider rilevante per il loro pubblico.
*   **3 follow-up**: Con toni diversi, programmati in NocoDB.
*   **Warm-up progressivo**: Iniziare con pochi invii al giorno e aumentare gradualmente.
*   **CTA**: Variare tra guest post, link swap, "can I send data" in base al prospect.
*   **Bounce**: Monitorare i bounce SMTP (550 error) e marcare l'email come non valida in NocoDB.

---

### Visual Template Design — Domande Specifiche

#### Template 1 — Data Card (X posts)

*   **Layout Design**: Sfondo dark navy (`#0A1128`), ticker grosso in alto a sinistra (es. `NVDA` in bianco, font `Inter Bold` 48px). Sotto, nome insider + titolo (es. `Jensen Huang, CEO` in grigio chiaro, font `Inter Regular` 20px). A destra, `Amount` (es. `$8.5M` in verde brillante per buy, rosso per sell, font `Inter Bold` 36px). Sotto, `Date` (es. `March 15, 2026` in grigio chiaro, font `Inter Regular` 18px). In basso a destra, `Verdict Badge` (es. `BUY` in verde scuro con testo bianco, `CAUTION` in giallo, `SELL` in rosso). Branding EarlyInsider.com in basso a sinistra.
*   **HTML/CSS Structure**:
    
```html
    <div class="data-card">
        <div class="header">
            <span class="ticker">NVDA</span>
            <span class="amount green">$8.5M</span>
        </div>
        <div class="details">
            <span class="insider-name">Jensen Huang, CEO</span>
            <span class="date">March 15, 2026</span>
        </div>
        <div class="footer">
            <span class="branding">EarlyInsider.com</span>
            <span class="verdict-badge buy">BUY</span>
        </div>
    </div>
    ```

    
```css
    .data-card {
        width: 1200px; height: 675px; /* 16:9 */
        background-color: #0A1128;
        color: #F0F0F0;
        font-family: 'Inter', sans-serif;
        padding: 40px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        border-radius: 15px;
    }
    .header { display: flex; justify-content: space-between; align-items: baseline; }
    .ticker { font-size: 80px; font-weight: bold; color: white; }
    .amount { font-size: 60px; font-weight: bold; }
    .amount.green { color: #28A745; } /* Verde per Buy */
    .amount.red {
 color: #DC3545; } /* Rosso per Sell */
    .details { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
    .insider-name { font-size: 28px; color: #B0B0B0; }
    .date { font-size: 24px; color: #B0B0B0; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
    .branding { font-size: 20px; color: #B0B0B0; }
    .verdict-badge {
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: bold;
        font-size: 28px;
        color: white;
    }
    .verdict-badge.buy { background-color: #28A745; }
    .verdict-badge.sell { background-color: #DC3545; }
    .verdict-badge.caution { background-color: #FFC107; color: #333; }
    
```

*   **Data Input**: `ticker`, `insider_name`, `title`, `amount`, `date`, `verdict`.
*   **Responsive Notes**: Per X post, mantenere 16:9 o 1:1. Per blog, adattare la larghezza al contenitore, scalando i font.

#### Template 2 — SEC Filing Mini Card (X replies)

*   **Layout Design**: Molto compatta. Sfondo scuro, ticker in alto, sotto insider + amount + date. Nessun verdict badge.
*   **Branding**: Sì, un piccolo logo o testo "EarlyInsider.com" in basso, ma molto discreto. Serve per la riconoscibilità.
*   **HTML/CSS Structure**:
    
```html
    <div class="mini-card">
        <span class="ticker">NVDA</span>
        <span class="insider-info">J. Huang, CEO bought $8.5M</span>
        <span class="date">Mar 15</span>
        <span class="branding-mini">EI.com</span>
    </div>
    ```

    
```css
    .mini-card {
        width: 600px; height: 150px; /* Esempio di dimensioni */
        background-color: #1A2238; /* Un po' più chiaro del dark navy */
        color: #F0F0F0;
        font-family: 'Inter', sans-serif;
        padding: 15px 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        border-radius: 10px;
        font-size: 18px;
    }
    .mini-card .ticker { font-size: 36px; font-weight: bold; color: white; }
    .mini-card .insider-info { font-size: 24px; color: #B0B0B0; }
    .mini-card .date { font-size: 20px; color: #B0B0B0; text-align: right; }
    .mini-card .branding-mini { font-size: 14px; color: #777; align-self: flex-end; }
    ```

*   **Data Input**: `ticker`, `insider_initials`, `title_short`, `amount`, `date_short`.
*   **Responsive Notes**: Per X replies, mantenere le dimensioni ridotte.

#### Template 3 — Comparison Card (X replies)

*   **Layout Design**: Split screen "Then vs Now". A sinistra "Last time this insider bought" con data e risultato (es. `+34% in 6 months`). A destra "Now" con l'attuale acquisto insider. Colori contrastanti per le due sezioni.
*   **Return %**: Grosso, verde, con un'icona freccia in su.
*   **HTML/CSS Structure**:
    
```html
    <div class="comparison-card">
        <div class="section then">
            <h3>Last Time Insider Bought</h3>
            <p class="date">Oct 2024</p>
            <p class="result green">+34% in 6 months</p>
        </div>
        <div class="section now">
            <h3>Current Insider Buy</h3>
            <p class="ticker">NVDA</p>
            <p class="details">J. Huang, CEO bought $8.5M</p>
            <p class="date">Mar 2026</p>
        </div>
    </div>
    ```

    
```css
    .comparison-card {
        width: 800px; height: 300px;
        display: flex;
        border-radius: 15px;
        overflow: hidden;
        font-family: 'Inter', sans-serif;
    }
    .section {
        flex: 1;
        padding: 25px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
    }
    .then { background-color: #1A2238; color: #F0F0F0; }
    .now { background-color: #0A1128; color: white; }
    .section h3 { font-size: 24px; margin-bottom: 10px; }
    .section .date { font-size: 18px; color: #B0B0B0; }
    .section .result { font-size: 48px; font-weight: bold; margin-top: 15px; }
    .result.green { color: #28A745; }
    .section .ticker { font-size: 40px; font-weight: bold; color: white; margin-bottom: 5px; }
    .section .details { font-size: 22px; color: #B0B0B0; }
    ```

*   **Data Input**: `last_buy_date`, `last_buy_return_percent`, `last_buy_return_timeframe`, `current_ticker`, `current_insider_info`, `current_buy_date`.
*   **Responsive Notes**: Per X replies, mantenere le proporzioni, scalando i font.

#### Template 4 — Insider Transaction Table (Articoli, Reddit DD, Report)

*   **Colonne**: `Date`, `Insider`, `Title`, `Type`, `Shares`, `Price`, `Value`, `Shares After`.
*   **Alternating row colors**: Sì, migliora la leggibilità.
*   **Gestione 10+ transazioni**: Paginazione per report, scrollabile per blog/Reddit se molto lungo. Per Reddit DD, limitare a 5-7 transazioni chiave o riassumere.
*   **HTML/CSS Structure**:
    
```html
    <table class="insider-table">
        <thead>
            <tr>
                <th>Date</th>
                <th>Insider</th>
                <th>Title</th>
                <th>Type</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Value</th>
                <th>Shares After</th>
            </tr>
        </thead>
        <tbody>
            <tr class="even">
                <td>2026-03-15</td>
                <td>Jensen Huang</td>
                <td>CEO</td>
                <td>P</td>
                <td>10,000</td>
                <td>$850.00</td>
                <td>$8.5M</td>
                <td>1,000,000</td>
            </tr>
            <tr class="odd">
                <td>2026-03-10</td>
                <td>Colette Kress</td>
                <td>CFO</td>
                <td>P</td>
                <td>3,000</td>
                <td>$840.00</td>
                <td>$2.52M</td>
                <td>500,000</td>
            </tr>
        </tbody>
    </table>
    ```

    
```css
    .insider-table {
        width: 100%;
        border-collapse: collapse;
        font-family: 'Inter', sans-serif;
        font-size: 16px;
        color: #333; /* O bianco per dark mode */
    }
    .insider-table th, .insider-table td {
        border: 1px solid #ddd; /* O bordo più chiaro per dark mode */
        padding: 8px;
        text-align: left;
    }
    .insider-table th {
        background-color: #f2f2f2; /* O dark grey per dark mode */
        font-weight: bold;
    }
    .insider-table tr.even { background-color: #f9f9f9; /* O leggermente più chiaro per dark mode */ }
    .insider-table tr.odd { background-color: #ffffff; /* O leggermente più scuro per dark mode */ }
    /* Per dark mode: */
    /* .insider-table { color: #F0F0F0; } */
    /* .insider-table th, .insider-table td { border-color: #444; } */
    /* .insider-table th { background-color: #333; } */
    /* .insider-table tr.even { background-color: #2A2A2A; } */
    /* .insider-table tr.odd { background-color: #1A1A1A; } */
    ```

*   **Data Input**: Array di oggetti transazione.

#### Template 5 — Price Chart con Entry Point (multiplo uso)

*   **Libreria**: `Chart.js` con `node-canvas` per rendering server-side. È la soluzione più efficiente e gratuita.
*   **Annotazione**: Utilizzare le funzionalità di annotazione di Chart.js per disegnare una freccia (`↓`) e un testo "CEO bought here" sulla data e il prezzo dell'acquisto.
*   **Timeframe default**: 6 mesi o 1 anno, con l'opzione di mostrare dall'ultimo buy se è più recente.
*   **Candlestick o line chart**: Line chart è più semplice e chiaro per evidenziare un singolo punto di ingresso. Candlestick è più complesso e richiede più dati.
*   **HTML/CSS Structure**: Non direttamente HTML/CSS, ma configurazione JSON per Chart.js.
*   **Data Input**: Array di date e prezzi storici, `buy_date`, `buy_price`, `insider_name`.

#### Template 6 — Cluster Visual (X posts)

*   **Visualizzazione**: Lista verticale compatta.
*   **Mostrare somma totale**: Sì, in evidenza in alto.
*   **HTML/CSS Structure**:
    
```html
    <div class="cluster-visual">
        <div class="total-summary">
            <h3>$TICKER Cluster Buying</h3>
            <p class="total-amount">Total: $15.2M</p>
        </div>
        <div class="insider-list">
            <div class="insider-item">
                <span class="name">Jensen Huang, CEO</span>
                <span class="amount">$8.5M</span>
                <span class="date">Mar 15</span>
            </div>
            <div class="insider-item">
                <span class="name">Colette Kress, CFO</span>
                <span class="amount">$2.5M</span>
                <span class="date">Mar 10</span>
            </div>
            <div class="insider-item">
                <span class="name">Mark Stevens, Director</span>
                <span class="amount">$4.2M</span>
                <span class="date">Mar 08</span>
            </div>
        </div>
    </div>
    ```

    
```css
    .cluster-visual {
        width: 800px; height: 450px;
        background-color: #0A1128;
        color: white;
        font-family: 'Inter', sans-serif;
        padding: 30px;
        border-radius: 15px;
    }
    .total-summary { text-align: center; margin-bottom: 25px; }
    .total-summary h3 { font-size: 32px; color: white; margin-bottom: 5px; }
    .total-summary .total-amount { font-size: 48px; font-weight: bold; color: #28A745; }
    .insider-list { display: flex; flex-direction: column; gap: 15px; }
    .insider-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #1A2238;
        padding: 15px 20px;
        border-radius: 10px;
    }
    .insider-item .name { font-size: 22px; font-weight: bold; }
    .insider-item .amount { font-size: 28px; font-weight: bold; color: #28A745; }
    .insider-item .date { font-size: 18px; color: #B0B0B0; }
    ```

*   **Data Input**: `ticker`, `total_cluster_amount`, array di oggetti insider (`name`, `title`, `amount`, `date`).

#### Template 7 — Peer Comparison Bar Chart (Reddit DD, Report)

*   **Bar chart**: Orizzontale è spesso più leggibile per confronti di nomi.
*   **Quanti peer**: 3-5 è l'ideale per chiarezza.
*   **Metriche**: Insider buying activity (es. "Total Insider Buy Value Last 3M"), ma anche metriche finanziarie chiave come Revenue Growth, Net Margin, P/E Ratio.
*   **HTML/CSS Structure**: Chart.js configurazione.
*   **Data Input**: Array di oggetti peer (`name`, `metric_value`).

#### Template 8 — Portfolio Simulation Line Chart (Lead Magnet)

*   **Line chart**: Sì, cumulativo mese per mese.
*   **Benchmark**: Assolutamente, S&P 500 per confronto.
*   **Periodi di perdita**: Mostrare chiaramente i cali.
*   **HTML/CSS Structure**: Chart.js configurazione.
*   **Data Input**: Array di dati mensili (`date`, `portfolio_value`, `sp500_value`).

#### Template 9 — Revenue/Margin Trend Line (Report)

*   **Dual axis**: Sì, per Revenue (asse Y sinistro) e Margin % (asse Y destro).
*   **Quanti trimestri**: 8-12 trimestri (2-3 anni) per mostrare un trend significativo.
*   **Trend direction**: Linee chiare, con etichette per i valori.
*   **HTML/CSS Structure**: Chart.js configurazione.
*   **Data Input**: Array di oggetti trimestrali (`quarter`, `revenue`, `net_margin_percent`).

#### Template 10 — Valuation Football Field (Report)

*   **Range bar chart orizzontale**: Sì, con 3-4 metodi (DCF, Multipli, Comps, Gordon Growth).
*   **Prezzo corrente**: Linea verticale o punto sul grafico che indica il prezzo corrente rispetto ai range di valutazione.
*   **HTML/CSS Structure**: Chart.js configurazione (tipo bar orizzontale con range).
*   **Data Input**: Array di oggetti metodo (`name`, `min_value`, `max_value`), `current_price`.

#### Template 11 — Spider Chart (Report)

*   **Quante dimensioni**: 5-7 dimensioni è un buon equilibrio.
*   **Metriche**: Growth (Revenue Growth), Profitability (Net Margin), Value (P/E), Momentum (Price Change 3M), Quality (ROE), Insider Conviction (Insider Buy Score).
*   **Radar chart leggibile**: Limitare a 2-3 aziende per confronto per evitare sovrapposizioni eccessive.
*   **HTML/CSS Structure**: Chart.js configurazione (tipo radar).
*   **Data Input**: Array di oggetti azienda (`name`, `metrics` {`growth`: X, `profitability`: Y, ...}).

#### Template 12 — Earnings Card (X posts, replies)

*   **Layout**: Ticker grosso, sotto EPS actual vs estimate, revenue actual vs estimate, surprise %. Colori verde/rosso per beat/miss.
*   **Insider angle**: Sì, in basso, discreto ma presente ("CEO bought $2M before earnings").
*   **HTML/CSS Structure**: Simile alla Data Card, ma con dati earnings.
    
```html
    <div class="earnings-card">
        <span class="ticker">NVDA</span>
        <div class="metric-row">
            <span class="label">EPS:</span>
            <span class="value green">$1.50 (Beat)</span>
            <span class="estimate">Est: $1.40</span>
        </div>
        <div class="metric-row">
            <span class="label">Revenue:</span>
            <span class="value green">$20B (Beat)</span>
            <span class="estimate">Est: $19.5B</span>
        </div>
        <p class="insider-angle">CFO bought $3M 2 weeks before this report. 👀</p>
    </div>
    ```

    
```css
    .earnings-card {
        width: 800px; height: 400px;
        background-color: #0A1128;
        color: white;
        font-family: 'Inter', sans-serif;
        padding: 30px;
        border-radius: 15px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    .earnings-card .ticker { font-size: 60px; font-weight: bold; text-align: center; margin-bottom: 20px; }
    .metric-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 15px; }
    .metric-row .label { font-size: 24px; color: #B0B0B0; }
    .metric-row .value { font-size: 32px; font-weight: bold; }
    .metric-row .value.green { color: #28A745; }
    .metric-row .value.red { color: #DC3545; }
    .metric-row .estimate { font-size: 20px; color: #777; }
    .insider-angle { font-size: 18px; color: #B0B0B0; text-align: center; margin-top: 20px; }
    ```

*   **Data Input**: `ticker`, `eps_actual`, `eps_estimate`, `revenue_actual`, `revenue_estimate`, `insider_activity_summary`.

#### Template 13 — Market Movers Card (X posts)

*   **Top 3 o top 5 ticker**: Top 3 per chiarezza su X.
*   **Layout**: Lista verticale compatta.
*   **HTML/CSS Structure**:
    
```html
    <div class="market-movers-card">
        <h3>Top Market Movers Today</h3>
        <div class="mover-item">
            <span class="ticker">SMCI</span>
            <span class="change green">+15.2%</span>
            <span class="insider-note">CEO bought $2M last week</span>
        </div>
        <div class="mover-item">
            <span class="ticker">DELL</span>
            <span class="change green">+8.9%</span>
            <span class="insider-note">CFO sold $1M 2 months ago</span>
        </div>
        <div class="mover-item">
            <span class="ticker">AMD</span>
            <span class="change red">-5.1%</span>
            <span class="insider-note">No recent insider activity</span>
        </div>
    </div>
    ```

    
```css
    .market-movers-card {
        width: 800px; height: 450px;
        background-color: #0A1128;
        color: white;
        font-family: 'Inter', sans-serif;
        padding: 30px;
        border-radius: 15px;
    }
    .market-movers-card h3 { font-size: 32px; text-align: center; margin-bottom: 25px; }
    .mover-item {
        display: flex;
        align-items: center;
        background-color: #1A2238;
        padding: 15px 20px;
        border-radius: 10px;
        margin-bottom: 15px;
    }
    .mover-item .ticker { font-size: 28px; font-weight: bold; width: 15%; }
    .mover-item .change { font-size: 28px; font-weight: bold; width: 20%; text-align: right; }
    .mover-item .change.green { color: #28A745; }
    .mover-item .change.red { color: #DC3545; }
    .mover-item .insider-note { font-size: 18px; color: #B0B0B0; width: 60%; text-align: right; margin-left: 5%; }
    ```

*   **Data Input**: Array di oggetti mover (`ticker`, `change_percent`, `insider_activity_summary`).

#### Template 14 — Educational Infographic (X posts, Reddit DD)

*   **Stile**: Flowchart o step-by-step per "How to read a Form 4". Screenshot annotato del Form 4.
*   **Lunghezza**: Multi-immagine (carousel) per X, singola immagine lunga per Reddit DD.
*   **Form 4 comprensibile**: Utilizzare icone, frecce, evidenziazioni e testo conciso.
*   **HTML/CSS Structure**: Layout basato su div e testo, con immagini di sfondo o icone.
*   **Data Input**: Testo esplicativo per ogni step, screenshot del Form 4 con aree evidenziate.

#### Template 15 — Contrarian Card (X posts, replies)

*   **Visualizzazione**: Split screen "Market Says SELL" vs "Insiders Say BUY".
*   **Dato contrarian**: Grosso e al centro di ogni sezione.
*   **HTML/CSS Structure**: Simile alla Comparison Card, ma con un messaggio più diretto.
    
```html
    <div class="contrarian-card">
        <div class="section market-says">
            <h3>Market Says:</h3>
            <p class="sentiment">SELL</p>
            <p class="data">Analyst Consensus: Underperform</p>
        </div>
        <div class="section insiders-say">
            <h3>Insiders Say:</h3>
            <p class="sentiment">BUY</p>
            <p class="data">CEO bought $5M, CFO bought $2M</p>
        </div>
    </div>
    ```

    
```css
    .contrarian-card {
        width: 800px; height: 400px;
        display: flex;
        border-radius: 15px;
        overflow: hidden;
        font-family: 'Inter', sans-serif;
    }
    .contrarian-card .section {
        flex: 1;
        padding: 30px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
    }
    .market-says { background-color: #DC3545; color: white; } /* Rosso per Sell */
    .insiders-say { background-color: #28A745; color: white; } /* Verde per Buy */
    .contrarian-card h3 { font-size: 28px; margin-bottom: 15px; }
    .contrarian-card .sentiment { font-size: 60px; font-weight: bold; margin-bottom: 20px; }
    .contrarian-card .data { font-size: 22px; }
    ```

*   **Data Input**: `ticker`, `market_sentiment_text`, `market_sentiment_data`, `insider_sentiment_text`, `insider_sentiment_data`.

---

### Tools & Risorse Raccomandate

#### Costo $0 (priorità)

*   **Nome**: **Google Keyword Planner**
    *   **Tipo**: SEO Tool
    *   **Costo**: $0 (richiede account Google Ads, ma non è necessario spendere)
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 6 (Reddit Posts), CAT 11 (Newsletter), CAT 12 (Outreach), Content Strategy generale.
    *   **Cosa migliora**: Identificazione di query ad alto volume per articoli SEO, topic per DD, idee per newsletter e outreach.
    *   **Come si integra**: Ricerca manuale per la pianificazione dei contenuti.
    *   **Impatto stimato**: 8
*   **Nome**: **Google Search Console**
    *   **Tipo**: SEO Tool
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 1 (Articoli), Content Strategy.
    *   **Cosa migliora**: Monitoraggio delle performance SEO, identificazione di opportunità di keyword, richiesta di indicizzazione rapida.
    *   **Come si integra**: API per richiedere l'indicizzazione dopo la pubblicazione. Monitoraggio manuale.
    *   **Impatto stimato**: 7
*   **Nome**: **Google Alerts**
    *   **Tipo**: Monitoring Tool
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 8 (X Posts), CAT 11 (Newsletter), Competitive Intelligence.
    *   **Cosa migliora**: Monitoraggio di ticker, competitor, notizie di settore in tempo reale.
    *   **Come si integra**: Feed RSS o email. Può essere parsato da n8n per identificare breaking news.
    *   **Impatto stimato**: 6
*   **Nome**: **Imgur**
    *   **Tipo**: Image Hosting
    *   **Costo**: $0 (con limiti, ma sufficiente per Reddit)
    *   **Per quali categorie**: CAT 6 (Reddit Posts).
    *   **Cosa migliora**: Hosting gratuito per le immagini da allegare ai post Reddit.
    *   **Come si integra**: Dopo la generazione del visual con Puppeteer, upload via API Imgur, poi inserire il link nel post Reddit.
    *   **Impatto stimato**: 5
*   **Nome**: **Chart.js + node-canvas**
    *   **Tipo**: Libreria Open Source (Charting)
    *   **Costo**: $0
    *   **Per quali categorie**: Tutti i Template Visual con grafici (5, 7, 8, 9, 10, 11).
    *   **Cosa migliora**: Generazione di grafici finanziari server-side come immagini PNG, senza browser.
    *   **Come si integra**: Implementato nel Puppeteer screenshot server (o come Code Node separato in n8n se si vuole evitare Puppeteer per i soli grafici).
    *   **Impatto stimato**: 10 (Game Changer per i visual)
*   **Nome**: **html-pdf (Node.js library)**
    *   **Tipo**: Libreria Open Source (PDF Generation)
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 2 (Report Premium), CAT 3 (Lead Magnet).
    *   **Cosa migliora**: Generazione di PDF da HTML/CSS, essenziale per report e lead magnet.
    *   **Come si integra**: Implementato in un Code Node n8n.
    *   **Impatto stimato**: 9
*   **Nome**: **Flesch-Kincaid Readability (Python/JS implementation)**
    *   **Tipo**: Libreria Open Source (Quality Assurance)
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 2 (Report), CAT 3 (Lead Magnet), CAT 6 (Reddit Posts).
    *   **Cosa migliora**: Misura la leggibilità del testo, utile per garantire che il contenuto sia accessibile al target.
    *   **Come si integra**: Code Node n8n per la validazione post-generazione.
    *   **Impatto stimato**: 6
*   **Nome**: **RSS Feed Reader (n8n node)**
    *   **Tipo**: n8n Community Node / Built-in
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 8 (X Posts), CAT 11 (Newsletter), Competitive Intelligence.
    *   **Cosa migliora**: Monitoraggio di feed RSS gratuiti per notizie Fed/FOMC, job reports, CPI data, blog competitor.
    *   **Come si integra**: Nodo "RSS Feed Reader" in n8n.
    *   **Impatto stimato**: 7
*   **Nome**: **Google Fonts**
    *   **Tipo**: Design Resource
    *   **Costo**: $0
    *   **Per quali categorie**: Tutti i Template Visual.
    *   **Cosa migliora**: Accesso a font sans-serif professionali e leggibili (es. Inter, Roboto) per i visual.
    *   **Come si integra**: Inclusione nel CSS dei template HTML per Puppeteer.
    *   **Impatto stimato**: 5
*   **Nome**: **Color Hunt / Coolors.co**
    *   **Tipo**: Design Resource
    *   **Costo**: $0
    *   **Per quali categorie**: Tutti i Template Visual.
    *   **Cosa migliora**: Aiuta a scegliere palette colori professionali e ad alto contrasto per i visual.
    *   **Come si integra**: Strumenti di ispirazione per il design dei template.
    *   **Impatto stimato**: 4
*   **Nome**: **Markdown-it (Node.js library)**
    *   **Tipo**: Libreria Open Source (Markdown Parser)
    *   **Costo**: $0
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 6 (Reddit Posts), CAT 2 (Report), CAT 3 (Lead Magnet).
    *   **Cosa migliora**: Conversione di Markdown in HTML per la pubblicazione o la generazione PDF.
    *   **Come si integra**: Code Node n8n.
    *   **Impatto stimato**: 6
*   **Nome**: **regex101.com**
    *   **Tipo**: Strumento di Sviluppo
    *   **Costo**: $0
    *   **Per quali categorie**: Tutte le categorie con validazione (Code Node).
    *   **Cosa migliora**: Aiuta a costruire e testare espressioni regolari complesse per la validazione dei dati e del testo.
    *   **Come si integra**: Strumento esterno per lo sviluppo dei Code Node.
    *   **Impatto stimato**: 7

#### Costo <$5/mese totale (se il valore lo giustifica)

*   **Nome**: **Finnhub (Free Tier / Micro Plan)**
    *   **Tipo**: API Dati Finanziari
    *   **Costo**: Free Tier (limiti) o Micro Plan ($9/mese, ma potrebbe superare il budget se usato intensivamente).
    *   **Per quali categorie**: Tutte le CAT (dati di prezzo, earnings calendar, market cap, news).
    *   **Cosa migliora**: Fornisce dati finanziari essenziali per arricchire tutti i contenuti. L'earnings calendar è cruciale per "What to Watch".
    *   **Come si integra**: Nodo HTTP Request in n8n.
    *   **Impatto stimato**: 10 (Assolutamente cruciale, se il free tier è sufficiente o il micro plan è giustificato)
*   **Nome**: **TwitterAPI.io (Free Tier)**
    *   **Tipo**: API Twitter
    *   **Costo**: Free Tier (limiti, ma può essere sufficiente per il polling ogni 5 min per pochi account).
    *   **Per quali categorie**: CAT 7 (X Replies), CAT 8 (X Posts).
    *   **Cosa migliora**: Accesso ai tweet in tempo reale per le reply, e pubblicazione automatica.
    *   **Come si integra**: Nodo HTTP Request in n8n.
    *   **Impatto stimato**: 9 (Essenziale per l'automazione X)

#### Metodologie (sempre $0)

*   **Nome**: **Chain-of-Thought (CoT) Prompting**
    *   **Tipo**: Prompt Engineering Technique
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 2 (Report), CAT 6 (Reddit Posts).
    *   **Cosa migliora**: Migliora la qualità e la coerenza del contenuto lungo, guidando l'AI attraverso passaggi intermedi (es. Outline -> Draft -> Revisione).
    *   **Come si integra**: Nodi AI multipli in n8n, dove l'output di un nodo (es. outline) diventa l'input per il nodo successivo (draft).
    *   **Impatto stimato**: 8
*   **Nome**: **Few-Shot Prompting (con esempi negativi)**
    *   **Tipo**: Prompt Engineering Technique
    *   **Per quali categorie**: CAT 4 (Reddit Replies), CAT 7 (X Replies), CAT 6 (Reddit Posts - Bear Case).
    *   **Cosa migliora**: Aiuta l'AI a capire il tono desiderato e a evitare errori comuni, specialmente per contenuti sensibili come il bear case o il tono di Reddit. Includere esempi di "cosa NON fare".
    *   **Come si integra**: Aggiungere esempi al `System Prompt` o al `User Prompt`.
    *   **Impatto stimato**: 7
*   **Nome**: **Self-Critique / Iterative Refinement**
    *   **Tipo**: Prompt Engineering Technique / Quality Assurance
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 2 (Report), CAT 6 (Reddit Posts), CAT 4 (Reddit Replies), CAT 7 (X Replies).
    *   **Cosa migliora**: L'AI genera un output, poi lo "critica" in base a criteri specifici (AI detection, tono, accuratezza) e lo rigenera.

    *   **Come si integra**: Loop di retry in n8n con feedback dal nodo di validazione (Code Node o seconda AI call) al nodo di generazione.
    *   **Impatto stimato**: 9 (Cruciale per passare AI detection e migliorare la qualità)
*   **Nome**: **Persona-Based Prompting**
    *   **Tipo**: Prompt Engineering Technique
    *   **Per quali categorie**: Tutte le categorie.
    *   **Cosa migliora**: Garantisce un tono e uno stile coerenti e appropriati per ogni canale/tipo di contenuto.
    *   **Come si integra**: Definizione dettagliata della persona nel `System Prompt`.
    *   **Impatto stimato**: 8
*   **Nome**: **Content Freshness Checker (Code Node)**
    *   **Tipo**: Quality Assurance Methodology
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 6 (Reddit Posts).
    *   **Cosa migliora**: Evita la ripetizione di contenuti su ticker o argomenti già coperti di recente.
    *   **Come si integra**: Code Node n8n che interroga NocoDB per articoli/post recenti sullo stesso ticker/argomento e, se trova duplicati, invia un feedback all'AI o blocca la generazione.
    *   **Impatto stimato**: 7
*   **Nome**: **Competitive Monitoring (Manual + RSS)**
    *   **Tipo**: Competitive Intelligence
    *   **Per quali categorie**: Content Strategy per tutte le categorie.
    *   **Cosa migliora**: Permette di capire cosa pubblicano i competitor (Unusual Whales, MarketBeat), quali formati funzionano, quali topic sono caldi.
    *   **Come si integra**: Monitoraggio manuale dei siti/social dei competitor. Utilizzo di RSS feed (se disponibili) per automatizzare il monitoraggio in n8n.
    *   **Impatto stimato**: 7
*   **Nome**: **Anti-AI Detection Techniques (Specifiche)**
    *   **Tipo**: Metodologia
    *   **Per quali categorie**: Tutte le categorie con contenuto pubblico.
    *   **Cosa migliora**: Riduce il punteggio di rilevamento AI.
    *   **Come si integra**: Istruzioni esplicite nel `System Prompt` (es. "Varia la lunghezza delle frasi, usa un linguaggio colloquiale ma professionale, inserisci occasionalmente espressioni idiomatiche o metafore finanziarie, evita frasi generiche come 'in conclusione' o 'come modello linguistico', usa la voce passiva e attiva in modo bilanciato, inserisci errori grammaticali *naturali* o piccole imperfezioni stilistiche che un umano potrebbe fare").
    *   **Impatto stimato**: 9 (Critico per la credibilità)
*   **Nome**: **Plagiarism/Duplicate Content Checker (Code Node + Google Search)**
    *   **Tipo**: Quality Assurance Methodology
    *   **Per quali categorie**: CAT 1 (Articoli), CAT 2 (Report), CAT 6 (Reddit Posts).
    *   **Cosa migliora**: Assicura l'originalità del contenuto.
    *   **Come si integra**: Code Node n8n che prende snippet di testo e li cerca su Google (o usa un'API gratuita se trovata) per verificare la presenza di duplicati.
    *   **Impatto stimato**: 6

---
