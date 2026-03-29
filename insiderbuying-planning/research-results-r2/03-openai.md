# Research R2: OpenAI gpt-4.1-mini

**Time**: 32.6s
**Tokens**: in=10755, out=1884

---

Perfetto, il tuo progetto è molto dettagliato e complesso, e richiede risposte altrettanto strutturate e precise. Procedo a fornirti la prima categoria (CAT 1 — Articoli Finanziari Blog SEO) in modo completo, seguendo il formato richiesto. Se vuoi, posso poi procedere con le altre categorie o con i template visual o tools.

---

### CAT 1 — Articoli Finanziari (Blog SEO)

#### n8n Workflow Architecture
```
[Trigger: Keyword selezionato da lista o alert insider] 
  → [Fetch dati: SEC EDGAR + Finnhub (price, earnings, guidance) + NocoDB (contenuti interni)] 
  → [Data Aggregation: Code node merge JSON dati strutturati] 
  → [AI Step 1: Genera Outline dettagliato con chain-of-thought] 
  → [AI Step 2: Genera Draft articolo sezione per sezione (loop SplitInBatches)] 
  → [AI Step 3: Genera tabelle HTML + dati visual] 
  → [Quality Gate: Code node regex check (word count, banned phrases, numeri citati)] 
  → [AI Step 4: Rewrite parziali se fail quality gate (retry con feedback)] 
  → [Generate Visuals: HTTP Request a Puppeteer screenshot server (HTML+Chart.js)] 
  → [Assemble Articolo finale (HTML + immagini)] 
  → [SEO Check: Code node keyword density + meta tag] 
  → [Publish (Blog + Newsletter draft)] 
  ↓ (IF fail quality gate) 
  → [Retry con feedback specifico, max 2 tentativi] 
  ↓ (IF fail dopo retry) 
  → [Alert umano Telegram per intervento manuale]
```

- Nodi sequenziali: tutti tranne la generazione visual che può partire dopo il draft parziale.
- Branch condizionali: quality gate (regex e word count), SEO check.
- Retry logic: max 2 retry con feedback specifico (es. "aggiungi più dati numerici", "verbo più deciso nel verdict").
- Approval umano solo se fail ripetuti.

#### Workflow Ottimale (step sequenziali)
Step 1: Trigger keyword/topic → input: keyword, output: trigger start  
Step 2: Fetch dati SEC EDGAR (Form 4 filing), Finnhub (price, earnings, guidance), NocoDB (contenuti interni) → output: dati raw JSON  
Step 3: Data Aggregation → input: raw JSON, output: JSON strutturato con insider transactions, price, earnings, macro  
Step 4: AI Outline → input: JSON dati + keyword + brief, output: outline articolato con sezioni e sottosezioni  
Step 5: AI Draft → input: outline + dati, output: testo sezione per sezione (loop)  
Step 6: AI Generate Tables → input: dati transazioni, output: HTML tabelle insider, price chart markers  
Step 7: Quality Gate → input: testo + tabelle, output: pass/fail + feedback  
Step 8: Retry (se fail) → input: feedback, output: testo corretto  
Step 9: Visual Generation → input: HTML template + dati, output: PNG immagini  
Step 10: Assemble articolo → input: testo + immagini, output: HTML finale  
Step 11: SEO Check → input: HTML, output: pass/fail  
Step 12: Publish → output: articolo live + newsletter draft

#### Prompt Design

**System Prompt (Claude Sonnet 4.6):**
```
You are a professional financial journalist specialized in insider trading and equity analysis. Your tone is authoritative, clear, and engaging for retail investors aged 25-55 who actively trade stocks. Always cite specific numbers and dates from SEC Form 4 filings and financial reports. Avoid generic statements. Provide a clear verdict: BUY, SELL, or CAUTION with justification based on data. Structure the article with an introduction, 3-5 detailed sections including insider activity, earnings analysis, sector context, and a conclusion with verdict. Use chain-of-thought reasoning to explain your analysis. When generating tables or charts, output HTML tables with proper formatting. Avoid AI-detection patterns by varying sentence structure and using natural language. Always include insider angles even in earnings or macro sections.
```

**User Prompt Template:**
```
Write a detailed financial article on insider buying activity for {{ticker}}. Use the following data:

- Insider transactions: {{insider_data}} (JSON or Markdown table with insider name, title, transaction type, shares, price, date, value)
- Recent earnings: {{earnings_data}} (EPS actual vs estimate, revenue, guidance updates)
- Price data: {{price_data}} (price chart points, recent trends)
- Sector trends: {{sector_data}}
- Macro context: {{macro_data}}

Include:
- Introduction with context on {{ticker}} and recent market sentiment
- Section 1: Insider Activity Analysis with specific transaction details and historical track record
- Section 2: Earnings Analysis with insider angle (e.g. insider buys before earnings)
- Section 3: Sector and Macro context with insider perspective
- Section 4: Contrarian or educational insight if relevant
- Conclusion with a clear verdict (BUY, SELL, CAUTION) supported by data

Generate HTML tables for insider transactions and price chart markers inline.

Avoid generic language. Cite exact numbers and dates from filings. Use varied sentence structure.

Article length: 1800-2500 words.
```

**Few-Shot Examples:**

Example 1 (snippet):
```
In the past month, CEO John Doe purchased 50,000 shares at $45.30 on March 10, 2024, signaling strong confidence ahead of the Q1 earnings release. Historically, his buys have led to an average 25% price increase within 6 months...

[HTML table of insider transactions]

Earnings for Q1 beat estimates by 8%, with revenue growing 12% YoY. Notably, the CFO also acquired $1M worth of shares two weeks prior...

Verdict: BUY — The cluster insider buying combined with strong earnings and sector tailwinds suggest upside potential.
```

#### Data Pipeline
- Dati obbligatori: SEC Form 4 filings (insider transactions), earnings data (EPS, revenue, guidance), price data (historical prices), sector trend data, macro indicators.
- Fonti: SEC EDGAR API or scraping, Finnhub API (free tier), NocoDB content DB, internal macro dataset.
- Formato: JSON strutturato con chiavi chiare, tabelle Markdown per dati tabellari.
- Aggregazione in Code node: merge JSON, normalizza date e valori, filtra dati rilevanti (ultimi 30-60 giorni).

#### Validazione
- Regex check su output testo: presenza di numeri ($, %, date), assenza di frasi generiche tipo "insiders are bullish" senza dati.
- Word count check (min 1800, max 2500).
- Banned phrases check (es. "As an AI model", "In summary", troppo ripetitivo).
- AI detection score: chiamata secondaria a Claude con prompt "Rate this text on human-likeness 1-10".
- Retry con feedback: se fail, rigenera solo sezioni problematiche (es. "Section 2 lacks data citation").
- Max 2 retry, poi alert umano.

#### Content Type Routing
- Prompt condizionale con variabile {{content_type}}: insider_activity, earnings_analysis, sector_analysis, educational, contrarian.
- Template prompt con switch case: cambia intro e focus sezioni.
- Per articoli insider_activity focus su transazioni e track record.
- Per earnings_analysis focus su dati EPS + insider angle.
- Per sector_analysis focus su trend settoriali + insider cluster.
- Educational usa tono più didattico e step-by-step.
- Contrarian enfatizza dissonanza tra mercato e insider.

#### Content Strategy
- Mix ottimale: 50% insider activity, 20% earnings + insider angle, 15% sector analysis, 10% educational, 5% contrarian.
- Large cap (NVDA, AAPL, TSLA) portano più traffico SEO, ma small cap con cluster buying generano conversioni migliori.
- Articoli con cluster buying performano meglio di singolo insider buy.
- Verdict esplicito (BUY/SELL) aumenta CTR da Google.
- Evergreen educational articoli da pubblicare 1 volta al mese per SEO stabile.
- Scrivere su earnings + insider angle soprattutto durante earnings season.
- Frequenza ottimale: 1-2 articoli al giorno, bilanciando topic.
- Scelta ticker basata su insider score + keyword volume + trending topic (mix).

---

Se vuoi, posso procedere con CAT 2 o con i template visual o tools. Fammi sapere!
