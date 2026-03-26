# InsiderBuying.ai — Ecosistema Finanziario Automatizzato

## Concept

Modello Motley Fool / Seeking Alpha miniaturizzato e automatizzato con AI.
Dexter (AI research agent) + Financial Datasets API (dati SEC istituzionali) producono
analisi stock di qualita' istituzionale. Un singolo report Dexter ($0.24) genera contenuto
su 3 blog + newsletter + alert + X thread. Tutto automatico via n8n.

---

## I 3 Domini + Prodotto SaaS

```
deepstockanalysis.com       L'ESERCITO      3 art/giorno   ads + affiliate broker
insiderbuying.ai            IL CECCHINO     3 art/giorno   $24/mese Pro + $49/mese Premium + ads
dividenddeep.com            LA RENDITA      3 art/giorno   ads + affiliate broker
insiderbuyingalerts.com     REDIRECT        → insiderbuying.ai
```

**insiderbuying.ai ha 3 funzioni in 1 dominio:**
- `/` = landing page SaaS (design Stitch, stile Invesco light mode)
- `/blog/` = 3 articoli/giorno su insider buying (SEO)
- `/dashboard/` = dashboard alert per subscriber Pro (futuro)

**Ogni blog ha un keyword cluster separato — zero cannibalizzazione:**
```
"NVDA stock analysis"        → deepstockanalysis.com
"insider buying NVDA"        → insiderbuying.ai/blog
"NVDA dividend yield"        → dividenddeep.com
```

---

## Stack Tecnico

| Componente | Tool | Costo |
|---|---|---|
| AI Research Agent | Dexter (github.com/virattt/dexter, TypeScript/Bun) | Open source |
| Dati Finanziari | Financial Datasets API (financialdatasets.ai) | ~$20-30/mese |
| API Key | `7d1e20bc-768e-4a87-927f-39085e1cfe3f` | |
| Scrittura Articoli | Claude/GPT API (GPT-4o-mini per Dexter, Sonnet per writing) | ~$15-25/mese |
| Blog CMS | WordPress (3 istanze su 1 server) | ~$11/mese |
| Orchestrazione | n8n (self-hosted, gia' disponibile su VPS Hostinger) | $0 |
| Newsletter | Beehiiv (free fino 2.500 sub, API inclusa, growth tools) | $0-49/mese |
| Email Alert Pro | Resend (free 3.000/mese, poi $20/mese) | $0-20/mese |
| Web Push | OneSignal (free tier) | $0 |
| Database + Auth | Supabase free tier | $0 |
| Pagamenti | Stripe (Pro $24/mese, Premium $49/mese) | % su transazione |
| PDF Report | Venduti su insiderbuying.ai (non Gumroad) | $0 |
| Hosting Landing Page | Vercel free tier | $0 |
| Indicizzazione SEO | Sitemap XML + Google Search Console + linking interno | $0 |
| Account X | @insiderbuying (da creare) | $0 |
| SEO Keyword Intelligence | DataForSEO Labs API (keyword volume + intent + SERP) | $0.35/mese |
| Grafici Interattivi | TradingView Widget embed (free, illimitato) | $0 |
| Custom Charts | Chart.js / Recharts (open source) | $0 |
| Logo Aziendali | Clearbit Logo API (free, illimitato, no API key) | $0 |
| Featured Images | Puppeteer screenshot di template HTML + Clearbit logos | $0 |

---

## Costo per Articolo: $0.24

```
Financial Datasets API:     $0.23  (10-15 calls per articolo)
    Earnings:               GRATIS
    Income statement:       $0.04
    Balance sheet:          $0.04
    Cash flow:              $0.04
    Financial metrics:      $0.02
    Insider trades:         $0.02
    Stock prices:           $0.01
    Competitor data:        $0.06

Dexter reasoning (4o-mini): $0.002
Claude article writing:     $0.003 (budget) / $0.07 (quality)
Refinement pass:            $0.003 (budget) / $0.07 (quality)

TOTALE:  $0.24 (budget) / $0.37 (quality)
Con caching (riusa dati <7 giorni): $0.13-0.25
```

---

## Costi Mensili Totali

```
A regime (9 articoli/giorno = 3+3+3):

Financial Datasets API:     ~$25/mese
LLM API (Dexter + write):  ~$15-25/mese
Hosting (1 server, 3 siti): $11/mese
Domini (3 .com + 1 .ai):    $13/mese (~EUR 158/anno)
Beehiiv newsletter:          $0 (free fino 2.500 sub, poi $49/mese)
Resend (email alert):        $0-20/mese (free 3.000/mese)
OneSignal (web push):        $0 (free tier)
DataForSEO (keyword intel):  $0.35/mese
TradingView (grafici):       $0 (widget embed gratuiti)
Clearbit (logo aziendali):   $0 (API gratuita)
Puppeteer (featured images): $0 (open source)
Stripe:                      2.9% + $0.30 per transazione
────────────────────────────
TOTALE LANCIO:               ~$65-75/mese (~EUR 60-70)
TOTALE A SCALA (>2.500 sub): ~$115-165/mese (~EUR 105-150)
```

---

## Scaling Graduale (Google-Safe)

```
PER OGNI BLOG (stessa timeline, indipendenti):

Mese 1:   1 articolo/giorno    = 30/mese     (totale 3 blog: 90)
Mese 2:   2 articoli/giorno    = 60/mese     (totale: 180)
Mese 3+:  3 articoli/giorno    = 90/mese     (totale: 270)

Anno 1:   ~900 articoli per blog = 2.700 totali
Anno 2:   ~1.800 per blog = 5.400 totali
```

Mai piu' di 3/giorno per dominio. Mai scalare piu' del 50% mese su mese.
Monitorare indexation ratio su Google Search Console: >60% = ok, <40% = stop.

### Indicizzazione (CORRETTO — Google NON supporta IndexNow per articoli)

```
Google Indexing API: SOLO per JobPosting e BroadcastEvent.
Per articoli normali, la strada corretta e':

1. Sitemap XML aggiornata automaticamente dopo ogni pubblicazione
   WordPress genera sitemap automaticamente (Yoast/RankMath)
2. Ping Google Search Console via API dopo pubblicazione
3. Linking interno forte: ogni nuovo articolo linkato da almeno
   2-3 articoli esistenti correlati (cross-reference automatico)
4. Crawlability pulita: robots.txt corretto, no broken links,
   pagine veloci (<2s load time)

NOTA: Bing/Yandex/altri motori SUPPORTANO IndexNow.
Per quelli possiamo usarlo. Solo Google non lo supporta.
```

---

## Cosa Pubblica Ogni Blog

### deepstockanalysis.com — Analisi Stock Generiche (50% Tipo A)

```
Titoli tipo:
    "Is NVDA a Good Investment in 2026?"
    "Tesla vs BYD: Which Stock to Buy?"
    "Apple Earnings Q2 2026 Analysis"
    "Best Growth Stocks March 2026"
    "Microsoft Stock Forecast 2026"

Monetizza: AdSense ($15-30 CPM) + affiliate broker (eToro $200/signup)
Manda traffico a: insiderbuying.ai (widget insider in fondo a ogni articolo)
```

### insiderbuying.ai/blog — Insider Buying Content (30% Tipo B)

```
Titoli tipo:
    "Insider Buying This Week: Top 5 CEO Purchases"
    "Why Insiders Are Buying NVDA — March 2026"
    "How to Track Insider Buying (Complete Guide)"
    "Stocks With Unusual Insider Activity Today"
    "Top 10 Insider Purchases Over $1M This Month"

Monetizza: conversione diretta a Pro $24/mese o Premium $49/mese
Chi legge questi = target ESATTO per il prodotto
```

### dividenddeep.com — Dividend Investing (audience separata)

```
Titoli tipo:
    "Best Dividend Stocks to Buy in 2026"
    "Top 20 Dividend Aristocrats Analysis"
    "Monthly Dividend Stocks Under $10"
    "Dividend Stocks vs Growth Stocks"
    "Best Dividend ETFs for Passive Income"

Monetizza: AdSense + affiliate broker
Audience conservativa 40-65 anni, compra e tiene
Manda traffico a: insiderbuying.ai (widget insider)
```

### Tipo C: Earnings + Events (20%, distribuito su tutti i blog)

```
Titoli tipo:
    "NVDA Earnings Q2 2026: What to Expect"
    "Insider Buying Before AAPL Earnings — Bullish Signal?"
    "Fed Meeting March 2026: Stocks Insiders Are Buying"

Traffico esplode 10-50x nei giorni dell'evento.
Calendario earnings e' pubblico — prepari contenuto in anticipo.
```

---

## Widget Insider Cross-Link (in OGNI articolo dei 3 blog)

```
+--------------------------------------------------+
| INSIDER ACTIVITY: NVDA                            |
| Jensen Huang (CEO) bought $2.3M — 2 days ago     |
| 90-day sentiment: 4 buys, 1 sell                  |
| [Get real-time alerts → InsiderBuying.ai]         |
+--------------------------------------------------+
```

Widget auto-generato da Financial Datasets API. Diverso per ogni stock.
Zero effort — n8n genera il widget quando pubblica l'articolo.

---

## Alert Delivery System (il prodotto InsiderBuying.ai)

### Monitoraggio (n8n, ogni 5 minuti)

```
n8n Schedule Trigger (ogni 5 min)
    |
    v
HTTP Request → Financial Datasets API
    GET /insider-trades?filed_after=5_minutes_ago
    Costo: $0.02/call × 12/ora × 24h = $5.76/mese
    |
    v
IF node: filtra
    amount > 500000
    AND role IN (CEO, CFO, Director, 10% Owner)
    AND NOT routine option exercise
    |
    v
Tipicamente: 2-5 alert/giorno passano il filtro
```

### Analisi (Dexter + Claude, per ogni alert)

```
Dexter analizza:
    - Storico acquisti insider (12 mesi)
    - Prezzo azione oggi vs ultimo acquisto
    - Performance dopo acquisti precedenti
    - Sentiment insider 90 giorni (buy vs sell count)
    |
    v
Claude scrive alert (200-300 parole):
    "Jensen Huang just bought $2.3M of NVDA at $112.40.
     Largest since Q2 2024 (bought at $78, rallied 47% in 3mo).
     First buy in 8 months. 90-day: 4 buys, 1 sell."
    |
    v
Costo per alert: ~$0.15 (API + LLM)
```

### Delivery

Il target (retail investor 30-55, USA) usa EMAIL come canale primario per alert finanziari.
FINRA Foundation survey: email (38%) = metodo preferito #1. Fidelity, Vanguard, Schwab
mandano tutto via email. Il target NON vive su Telegram/Discord.

```
TIER 1 — EMAIL (primary, il target lo aspetta)
    Resend API per alert real-time (<60 secondi dal filing SEC)
    Subject: "Insider Alert: NVDA — Jensen Huang bought $2.3M"
    Body: alert completo + AI analysis + link dashboard
    Come Fidelity/Vanguard/Schwab fanno per i loro alert

TIER 2 — WEB PUSH NOTIFICATION (secondary, per urgenza)
    Browser push via OneSignal (free tier)
    Notifica desktop/mobile quando insider buy >$500K
    Come TradingView fa per price alerts
    Costo: $0

TIER 3 — TELEGRAM (opzionale, per chi lo vuole)
    Non il canale principale — offerto come opzione in Settings
    "Prefer Telegram? Connect your account"
    Per il 10-15% di utenti che gia' usano Telegram per trading

SKIP: Discord (troppo giovane/crypto), SMS ($1.660/mese per 5k utenti)

FREE:
    → 3 alert/settimana via email (delayed 24h)
    → Weekly digest lunedi' mattina (Beehiiv) — top 5 insider buys
    → Solo nomi + importi, senza AI analysis
    → CTA: "Want real-time alerts? Upgrade to Pro"

PRO ($24/mese):
    → TUTTI gli alert via email real-time (<60 secondi)
    → Browser push notification (OneSignal)
    → Dashboard web real-time (Supabase)
    → AI analysis con ogni alert
    → Custom watchlist (alert solo per i tuoi ticker)
    → 20% sconto su report individuali

PREMIUM ($49/mese):
    → Tutto Pro
    → TUTTI i Deep Dive Reports inclusi
    → Nuovi report ogni mese
    → Priority support
    → Early access nuove feature

BLOG (insiderbuying.ai/blog):
    → Ogni alert significativo diventa anche articolo blog
    → "Why NVDA's CEO Just Bought $2.3M of Stock"
    → SEO cattura chi cerca la notizia su Google
```

### Costo Delivery a Scala

```
100 subscriber Pro, 5 alert/giorno:
    Resend: 100 × 5 × 30 = 15.000 email/mese = $0 (free tier 3.000) → $20/mese
    OneSignal push: $0 (free tier)
    Beehiiv digest: $0 (free tier)

500 subscriber Pro:
    Resend: 75.000 email/mese = ~$30/mese
    OneSignal: $0
    Beehiiv: $49/mese (Scale plan, >2.500 sub free)

5.000 subscriber Pro:
    Resend: 750.000 email/mese = ~$200/mese
    OneSignal: $0-50/mese
    Beehiiv: $49/mese
```

---

## Target Customer InsiderBuying.ai

### Segmento 1: "Il Cercatore di Edge" (60%)

```
Chi: Retail investor self-directed, 30-55 anni, portfolio $25k-$500k
Usa: Finviz, TradingView, Reddit r/stocks
Cerca: "insider buying stocks today", "insider buying tracker"
Perche' paga $24: Risparmia 2-3 ore/giorno di screening manuale
Obiezione: "Posso farlo gratis su OpenInsider"
Risposta: OpenInsider e' manuale e next-day. Noi siamo real-time + AI analysis
```

### Segmento 2: "Il Validatore" (25%)

```
Chi: Investitore esperto, 35-60 anni, portfolio $100k-$2M
Ha gia' una tesi su un titolo, usa insider buying come CONFERMA
Cerca: "insider buying NVDA", "why do insiders buy stock"
Perche' paga $24: Conferma su decisioni da $10k+ = $24 e' niente
Obiezione: "Controllo quando mi serve"
Risposta: Il timing conta. CEO compra venerdi' sera, filing esce alle 22:00.
         Noi te lo mandiamo alle 22:01. Chi aspetta paga il 3-5% in piu'.
```

### Segmento 3: "Il Quantitativo Pigro" (15%)

```
Chi: Engineer/developer, 25-45 anni
Ha letto studio Harvard (insider buying = +6% annuo)
Vuole strategia sistematica basata su dati
Cerca: "insider buying strategy", "insider buying stocks list"
Perche' paga $24: Vuole lista curata. "Mandi 3-5 titoli/settimana, io compro quelli."
Obiezione: "E' financial advice?"
Risposta: No. Dati pubblici SEC filtrati + analisi. Decisione tua. Disclaimer su tutto.
```

---

## Brand Identity InsiderBuying.ai

### Logo
```
Insider        ← regular weight, #1A1A1A
Buying         ← bold weight, #1A1A1A
```
Wordmark puro, niente icone. ".ai" non nel logo (sta solo nell'URL).

### Colori (Light Mode — landing page)
```
Background:    #FFFFFF (bianco)
Alt sections:  #F5F6F8 (grigio chiaro)
Testo:         #1A1A1A (quasi nero)
Muted:         #5C6670 (grigio)
Accent buy:    #00D26A (verde — buy signal, CTA)
Accent sell:   #FF3B3B (rosso — solo per sell)
Primary btn:   #002A5E (navy — stile Invesco)
Footer:        #1A1A1A (scuro)
```

### Typography
```
Headings:  Inter, 700, 32-48px
Body:      Inter, 400, 16px
Data:      Space Mono, 400 (monospace per tutti i numeri)
Buttons:   Inter, 600, 14px uppercase
```

### Tono di Voce
```
Preciso, freddo, data-driven. Zero hype, zero emoji, zero opinioni.
Ogni frase contiene un NUMERO o un FATTO.

SI: "NVDA CEO bought $2.3M. Last time: Q2 2024 → +47% in 3 months."
NO: "MASSIVE insider buy! Don't miss out! 🚀"
```

### Mai
- Emoji nel sito o negli alert
- Promesse di rendimento ("make money", "get rich")
- Stock photos di gente sorridente
- Rosso come colore primario (associato a perdite)

---

## Landing Page InsiderBuying.ai

Design reference: invesco.com/qqq-etf (stile visivo ONLY, non contenuto).
Tool: Google Stitch → MCP → Claude Code per codice.
Prompt completo: `crypto-sniper/insiderbuying-stitch-prompt.md`
Stitch genera design → MCP → Claude Code genera codice → deploy su Vercel.

11 sezioni:
1. Hero: "Know What CEOs Are Buying. Before Everyone Else."
2. Live Alert Feed: 5 card con CEO photo, ticker, importo, tempo
3. How It Works: 3 colonne (Scan / Filter / Alert)
4. Why Insider Buying Matters: 3 metriche (6%, 73%, 2 days)
5. Detailed Alert Card: esempio espanso di alert completo
6. Charts: Insider Buying vs Stock Price + Monthly Activity
7. Trust Metrics: $4.2B tracked / 2,847 alerts / 17,325+ companies
8. Pricing: Free (email digest + 3 delayed alerts/week) vs Pro $24/mese (AI analysis + watchlist) vs Premium $49/mese (Pro + all reports)
9. FAQ: 6 domande (legale, velocita', advice, tracking, differenza, cancel)
10. Final CTA: "You'll know in 60 seconds."
11. Footer: disclaimer legale

CEO headshot nelle card: pubblici (SEC Form 4 = public record, foto su siti aziendali).
PDF report venduti direttamente sul sito (non Gumroad) — piu' professionale.

---

## DataForSEO — Keyword Intelligence ($0.35/mese)

Integrazione: dataforseo.com API per scegliere keyword con VOLUME VERIFICATO.
Senza: 60% degli articoli targetta keyword con volume reale (il resto e' sprecato).
Con: 95% keyword verificate. +58% contenuto efficace a parita' di costi.

### API Endpoints Utilizzati

| Endpoint | Costo | Cosa Fa |
|---|---|---|
| Google Ads Keyword Volume | $0.05/task (1.000 keyword) | Volume mensile esatto per keyword |
| Search Intent | $0.001/task + $0.0001/kw | Classifica: informational/commercial/transactional |
| Historical SERPs | $0.0001/SERP | Chi ranka ora? Competitor forti o deboli? |

### Workflow Settimanale (Domenica, automatico)

```
n8n genera 200 keyword candidate per la settimana
(basate su earnings calendar + trending stocks + nicchia)
    |
    v
DataForSEO Google Ads API → volume per ognuna ($0.05)
    |
    v
DataForSEO Search Intent → classifica intent ($0.001)
    |
    v
FILTRA:
    volume > 100/mese (primi 3 mesi: long-tail specifiche per topical authority)
    volume > 500/mese (dopo mese 3: quando il dominio ha authority)
    intent = commercial o transactional
    competition = low/medium
    NOTA: keyword con volume 100-300 ma intent forte costruiscono
    topical authority piu' velocemente per siti nuovi
    |
    v
ORDINA per: volume x (1/competition)
    |
    v
TOP 21 keyword → 3/giorno × 7 giorni → distribuite sui 3 blog
    |
    v
Lun-Dom: n8n prende keyword del giorno → Dexter → Claude → WordPress
```

### Costo Mensile DataForSEO

```
Keyword volume:    $0.20/mese (4 task × $0.05)
Search intent:     $0.10/mese
SERP analysis:     $0.04/mese
────────────────
TOTALE:            $0.35/mese
```

### Impatto Revenue

```
Senza DataForSEO: 900 art/anno × 60% utili = 540 che rankano
Con DataForSEO:   900 art/anno × 95% utili = 855 che rankano
→ +58% traffico → +58% revenue
→ Mese 12 senza: EUR 2.200-9.300 | Con: EUR 3.550-14.920
```

---

## Grafici Interattivi — TradingView + Custom Charts ($0/mese)

Numero grafici adattivo alla lunghezza articolo:
- Articoli brevi (800-1000 parole): 1-2 grafici (prezzo + 1 custom)
- Articoli standard (1200-1800 parole): 2-3 grafici
- Deep dive (2000-3000 parole): 3-5 grafici
L'utente puo' zoomare, cambiare timeframe,
aggiungere indicatori. Aspetto professionale Bloomberg/Investing.com, costo zero.

### TradingView Widget (gratuiti, illimitati)

```
WIDGET 1 — Grafico Prezzo Stock (dopo "Financial Health")
    TradingView Advanced Chart embed
    Ticker: dinamico ({{TICKER}} dal workflow)
    Interval: daily, range 1 anno
    Theme: light (match stile Invesco)
    Interattivo: zoom, pan, indicatori tecnici, timeframe selector
    Costo: $0

WIDGET 2 — Confronto Competitor (dopo "How It Compares")
    TradingView Comparison Chart
    Symbols: {{TICKER}}, {{COMPETITOR_1}}, {{COMPETITOR_2}}
    Overlay performance % su 1 anno
    Costo: $0

WIDGET 3 — Mini Ticker (header articolo)
    TradingView Mini Symbol Overview
    Prezzo real-time + % change giornaliero
    Costo: $0
```

### Custom Charts (Chart.js/Recharts, nostri dati)

```
WIDGET 4 — Insider Activity Timeline
    X: ultimi 12 mesi
    Y: prezzo stock (linea) + marker verdi per insider buy
    Dati: Financial Datasets API /insider-trades (gia' fetchati)
    "CEO bought $2.3M here → stock rallied 47%"
    Costo: $0 extra (dati gia' nel report Dexter)

WIDGET 5 — Financial Metrics Comparison
    Bar chart: P/E, Revenue Growth, Debt/Equity vs sector average
    Dati: Financial Datasets API /financial-metrics (gia' fetchati)
    Costo: $0 extra
```

### Embed Automatico via n8n

```
Claude scrive articolo → n8n inserisce widget con template:

<div class="tradingview-widget-container">
  <script src="https://s3.tradingview.com/tv.js"></script>
  <script>
  new TradingView.widget({
    "symbol": "{{EXCHANGE}}:{{TICKER}}",
    "interval": "D",
    "theme": "light",
    "style": "1",
    "height": 400,
    "width": "100%",
    "allow_symbol_change": true
  });
  </script>
</div>

Solo {{TICKER}} e {{EXCHANGE}} cambiano per articolo. Il resto e' template fisso.
```

### Impatto SEO

```
Senza grafici: time on page 2-3 min, bounce 65-75%
Con grafici:   time on page 4-7 min, bounce 45-55%
→ Google interpreta: contenuto di alta qualita'
→ +10-15% ranking boost stimato
→ Piu' traffico → piu' revenue, a $0 di costo
```

---

## Immagini Auto-Generate — Featured + OG ($0/mese)

Ogni articolo ha un'immagine featured unica e branded, generata automaticamente.
Serve per: SEO (Google Images), social share (X/LinkedIn/Facebook), Google Discover.

### Come Funziona

```
1. Template HTML/CSS (creato 1 volta per blog, 3 totali)
2. n8n sostituisce variabili: {{LOGO}}, {{TICKER}}, {{TITLE}}, {{METRICS}}
3. Puppeteer fa screenshot → JPG 1200x630px
4. Upload su WordPress come featured image
Tutto automatico, zero intervento manuale.
```

### Logo Aziendali — Clearbit API (gratis, illimitato)

```
https://logo.clearbit.com/nvidia.com   → logo NVIDIA PNG
https://logo.clearbit.com/apple.com    → logo Apple PNG
https://logo.clearbit.com/microsoft.com → logo Microsoft PNG

Funziona con qualsiasi dominio aziendale.
Costo: $0. Nessun API key. Nessun limite.
```

### 3 Template (1 per Blog)

**deepstockanalysis.com:**
```
+----------------------------------------------+
|  [Company Logo]     NASDAQ: NVDA              |
|                                               |
|  "Is NVDA a Good Investment?"                 |
|                                               |
|  P/E: 28.4  |  Revenue: +23%  |  $112.40     |
|                                               |
|          Deep Stock Analysis                  |
+----------------------------------------------+
Sfondo: #F5F6F8, testo: #1A1A1A, metriche: #00D26A
```

**insiderbuying.ai:**
```
+----------------------------------------------+
|  ● INSIDER BUY                                |
|                                               |
|  [CEO Photo]  Jensen Huang, CEO               |
|               NVIDIA (NVDA)                   |
|                                               |
|  Bought: $2,300,000 — March 21, 2026         |
|                                               |
|  InsiderBuying.ai                             |
+----------------------------------------------+
Sfondo: bianco, badge verde "INSIDER BUY"
```

**dividenddeep.com:**
```
+----------------------------------------------+
|  [Company Logo]                               |
|                                               |
|  JOHNSON & JOHNSON (JNJ)                      |
|  Dividend Analysis                            |
|                                               |
|  Yield 3.2%  |  62 Years  |  Dividend King   |
|                                               |
|  DividendDeep                                 |
+----------------------------------------------+
Sfondo: #F5F6F8, badge "Dividend King" blu/oro
```

### Impatto SEO Immagini

```
Google Images: featured image indicizzata con alt text SEO
    alt="NVDA NVIDIA Stock Analysis March 2026 P/E 28.4"
    → Traffico extra gratuito da Google Images

Social Share: OG image 1200x630px con dati reali
    → CTR 2-3x superiore a link senza immagine su X/LinkedIn/Facebook

Google Discover: richiede immagini >1200px (le nostre qualificano)
    → Puo' portare 10.000-50.000 visite in 1 giorno
```

### Costo Totale Visual Content

```
TradingView widgets:            $0
Chart.js/Recharts (librerie):   $0
Clearbit Logo API:              $0
Puppeteer screenshot:           $0
Template HTML/CSS:              $0 (creato 1 volta)
────────────────────────────
TOTALE:                         $0/mese

9 immagini + 27-45 grafici interattivi al giorno. Tutto gratis.
```

---

## Funnel Acquisizione Clienti

```
GOOGLE (70% dei clienti):
    Cerca "is NVDA a good investment"
    → deepstockanalysis.com (articolo)
    → widget insider in fondo: "CEO bought $2.3M"
    → click → insiderbuying.ai
    → signup FREE → weekly digest
    → 2-4 settimane → upgrade Pro $24/mese

X/TWITTER (20% dei clienti):
    Vede thread con dati insider
    → clicca profilo → bio link
    → insiderbuying.ai
    → stesso funnel

NEWSLETTER (10% dei clienti):
    Iscritto da blog o X
    → weekly digest free
    → FOMO: "CEO bought Friday, stock up 8% Monday. Pro gets alerts real-time."
    → upgrade Pro
```

**Costo acquisizione**: $0 (SEO + X organico)
**Tempo medio a conversione**: 2-4 settimane
**Lifetime value**: $24 × 8 mesi avg retention = $192 (Pro) / $49 × 8 = $392 (Premium)

---

## Revenue Proiezione (3 Blog + SaaS + DataForSEO Targeting)

Con DataForSEO: 95% keyword verificate (vs 60% senza). +58% contenuto efficace.
Grafici TradingView: +10-15% time on page → ranking boost.
Immagini branded: Google Discover eligible → spike traffico occasionali.

```
Mese 1:   3 art/giorno totali (1+1+1), 90 articoli
          Revenue: EUR 0 | Costi: EUR 65 | Profitto: -EUR 65

Mese 3:   9 art/giorno (3+3+3), 540 articoli (95% utili)
          Traffico: 3k-8k visite/mese
          ─────────────────
          deepstockanalysis ads+aff:  EUR 20-80
          IBA blog→Pro conversion:    EUR 30-120
          IBA Pro subscription:       EUR 50-200 (2-8 sub × $24) + Premium EUR 100-400 (2-8 × $49)
          dividenddeep ads+aff:       EUR 15-60
          PDF sul sito:               EUR 20-60
          TOTALE:                     EUR 145-550
          Profitto:                   EUR 75-480

Mese 6:   1.350 articoli (1.280 utili con DataForSEO)
          Traffico: 15k-50k visite/mese combinati
          Pro subscriber: 15-60
          ─────────────────
          deepstockanalysis ads+aff:  EUR 200-700
          IBA blog→Pro:               EUR 150-500
          IBA Pro subscription:       EUR 435-1.740
          dividenddeep ads+aff:       EUR 150-500
          Newsletter paid:            EUR 50-200
          PDF sul sito:               EUR 80-300
          TOTALE:                     EUR 1.065-3.940
          Profitto:                   EUR 990-3.865 (margine 93-98%)

Mese 12:  2.700 articoli (2.565 utili)
          Traffico: 50k-180k visite/mese
          Pro subscriber: 50-180
          ─────────────────
          deepstockanalysis ads+aff:  EUR 700-3.500
          IBA blog→Pro:               EUR 400-1.500
          IBA Pro subscription:       EUR 1.450-5.220
          dividenddeep ads+aff:       EUR 500-2.500
          Newsletter paid:            EUR 200-800
          Newsletter sponsor:         EUR 0-500
          PDF sul sito:               EUR 300-900
          TOTALE:                     EUR 3.550-14.920
          Profitto:                   EUR 3.470-14.840 (margine 97-99%)

Anno 2:   5.400 articoli (5.130 utili)
          Traffico: 150k-500k visite/mese
          Pro subscriber: 150-500
          ─────────────────
          deepstockanalysis ads+aff:  EUR 2.500-10.000
          IBA blog→Pro:               EUR 1.000-4.000
          IBA Pro subscription:       EUR 4.350-14.500
          dividenddeep ads+aff:       EUR 2.000-7.500
          Newsletter paid+sponsor:    EUR 1.000-4.000
          PDF sul sito:               EUR 600-2.000
          TOTALE:                     EUR 11.450-42.000
          Profitto:                   EUR 11.300-41.850 (margine 98-99%)
```

### Riepilogo

| Periodo | Revenue/mese | Costi/mese | Profitto/mese | Margine |
|---------|-------------|-----------|---------------|---------|
| Mese 1 | EUR 0 | EUR 65 | -EUR 65 | - |
| Mese 3 | EUR 145-550 | EUR 70 | EUR 75-480 | 52-87% |
| Mese 6 | EUR 1.065-3.940 | EUR 75 | EUR 990-3.865 | 93-98% |
| Mese 12 | EUR 3.550-14.920 | EUR 80 | EUR 3.470-14.840 | 97-99% |
| Anno 2 | EUR 11.450-42.000 | EUR 150 | EUR 11.300-41.850 | 98-99% |

### Revenue Cumulativa

```
Primi 12 mesi:  EUR 15.000-55.000 totali
Anno 2:         EUR 135.000-500.000 totali
Investimento:   EUR 1.000-1.500 (12 mesi × EUR 80)
ROI Anno 1:     1.500-5.500%
```

---

## Affiliate Broker (commissioni altissime in finance)

| Broker | Commissione per Signup |
|--------|-----------------------|
| eToro | $200 per deposito qualificato |
| Interactive Brokers | $100-200 |
| Robinhood | $50-100 |
| Trade Republic | EUR 50-100 |
| Scalable Capital | EUR 25-50 |
| Plus500 | $400-800 (CFD) |
| Revolut | EUR 15-30 |

Ogni articolo termina con "How to Buy [STOCK]" + 3 link affiliati.
1 signup eToro = $200 = paga i costi per 2-3 mesi.

---

## Articolo Template

```markdown
# Is [STOCK] a Good Investment in 2026?

## Quick Verdict
[1 paragrafo: si/no/dipende + motivo principale]

## Financial Health — The Numbers
| Metric | [STOCK] | Sector Avg |
|--------|---------|------------|
| P/E Ratio | XX.X | XX.X |
| Revenue Growth (YoY) | +XX% | +XX% |
| Debt/Equity | X.XX | X.XX |
| Free Cash Flow | $X.XB | — |
| Insider Activity | +XXX% buying | — |

## What's Working
[3-4 punti con numeri reali da Dexter]

## What Could Go Wrong
[2-3 rischi concreti con dati]

## How It Compares
[Tabella vs 2-3 competitor diretti]

## Insider Activity
[Ultimi 90 giorni di insider buying/selling con importi]

+--------------------------------------------------+
| INSIDER ALERT: [STOCK]                            |
| [Name] ([Title]) bought $X — X days ago           |
| 90-day sentiment: X buys, X sells                 |
| [Get real-time alerts → InsiderBuying.ai]         |
+--------------------------------------------------+

## My Verdict
[Raccomandazione con reasoning basato su dati]

## How to Buy [STOCK]
→ eToro (affiliate): commission-free, easy to use
→ Interactive Brokers (affiliate): best for active traders
→ Trade Republic (affiliate): best for European investors

IMPORTANTE — AFFILIATE LINKS:
    Tutti i link affiliate DEVONO avere rel="sponsored"
    Esempio: <a href="..." rel="sponsored">eToro</a>
    Google lo richiede esplicitamente per link commerciali.
    La sezione "How to Buy" deve essere visivamente separata
    dall'analisi editoriale (bordo/sfondo diverso) cosi' il
    lettore capisce subito cosa e' analisi e cosa e' conversione.

*Disclaimer: For informational purposes only. Not financial advice.
Always do your own research before making investment decisions.*
```

---

## Google AI Content Policy (perche' funziona)

Google NON penalizza AI content. Penalizza contenuti senza valore.

**Policy ufficiale** (2024-2025):
"Our focus is on the quality of content, rather than how content is produced."

**Cosa Google penalizza**: thin content, duplicati, keyword stuffing, info sbagliate.
**Cosa Google premia**: contenuti con dati reali, tabelle, struttura chiara, fonti.

**I nostri articoli hanno**: P/E reali, revenue verificabili, insider activity da SEC,
tabelle comparative, 2500-3000 parole. Nessun blog AI competitor ha questo.

**Case study**: Bankrate (YMYL finance) ha pubblicato 162 articoli AI, rankati page 1.
NerdWallet usa "automation technology for initial drafts" — ranka top su tutto.

**Rischio principale**: volume troppo alto troppo presto. Fix: scaling graduale (1→2→3/giorno).

---

## Rischi e Mitigazioni

| Rischio | Probabilita' | Mitigazione |
|---------|-------------|-------------|
| Google penalizza AI content | Bassa | Dati reali = E-E-A-T forte |
| Volume troppo alto | Media | Scaling graduale 1→2→3/giorno |
| Financial Datasets cambia pricing | Bassa | Earnings gratis, worst case +$20/mese |
| Affiliate broker cambiano termini | Media | Diversificare 5+ broker |
| Errori nei dati finanziari (YMYL) | Media | Double-check automatico, disclaimer |
| Competizione | Media | Moat = volume (2.700 art) + dati reali |
| Disclaimer legale insufficiente | Media | Disclaimer su OGNI articolo/email/PDF |

**Disclaimer obbligatorio su OGNI output:**
"This content is for informational purposes only and does not constitute
financial advice. Always do your own research before making investment decisions."

---

## Piano d'Azione — Day by Day

```
GIORNO 1-2: Setup
    [x] Fork Dexter — DONE (crypto-sniper/dexter/)
    [x] Test API Financial Datasets — DONE (tutti 4 endpoint funzionano)
        NVDA income: $68.1B revenue, $43B net income
        NVDA insider: 10 trade recenti con nomi e importi
        AAPL metrics: market cap $4T, P/E 34.3
        MSFT prices: 18 giorni OHLCV
    [x] Installare Bun v1.3.11 — DONE
    [x] bun install (565 packages) — DONE
    [x] .env configurato (Financial Datasets + Gemini API key) — DONE
    [ ] bun start → test "Analyze NVDA financials" (richiede terminale interattivo)
    [ ] Comprare domini (deepstockanalysis.com, insiderbuying.ai,
        dividenddeep.com, insiderbuyingalerts.com)
    [ ] Setup account: Stripe, Resend, Supabase, OneSignal, Beehiiv, DataForSEO, X

GIORNO 3-7: Siti + Design
    [ ] Landing page insiderbuying.ai (Stitch design → MCP → Claude Code → Vercel)
    [ ] Setup 3 WordPress su 1 server (deepstockanalysis + IBA blog + dividenddeep)
    [ ] Installare Rank Math SEO su tutti i blog
    [ ] Creare template featured image HTML/CSS (3 template, 1 per blog)
    [ ] Setup Clearbit Logo API per company logos
    [ ] Setup TradingView widget embed template
    [ ] Scrivere pagine Disclaimer, Privacy, About
    [ ] Iscrizione affiliate broker (eToro, IBKR, Trade Republic)
    [ ] Primi 5 articoli manuali per sito (15 totali, validare qualita')

GIORNO 8-14: Automazione
    [ ] Workflow n8n DOMENICA: DataForSEO keyword selection (200 candidate → top 21)
    [ ] Workflow n8n DAILY: Dexter → Claude → TradingView embed → featured image → WordPress
    [ ] Workflow n8n ALERT: monitor insider trades (ogni 5 min) → Resend email + OneSignal push
    [ ] Workflow n8n NEWSLETTER: Beehiiv weekly digest (lunedi')
    [ ] Setup Puppeteer per auto-generazione featured images
    [ ] Account X + primi thread
    [ ] Primi 3 PDF report sul sito
    [ ] Scale a 1 articolo/giorno per blog

MESE 1: 1 art/giorno per blog (3 totali)
MESE 2: 2 art/giorno per blog (6 totali)
MESE 3+: 3 art/giorno per blog (9 totali) ← velocita' di crociera
```

---

## Moat / Vantaggio Competitivo

1. **Dati SEC reali** — nessun blog AI ha Financial Datasets come fonte
2. **DataForSEO targeting** — 95% keyword verificate, ogni articolo ha volume confermato
3. **Grafici TradingView interattivi** — aspetto Bloomberg, costo $0, +15% engagement
4. **Immagini branded auto-generate** — Google Discover eligible, OG social share ottimizzato
5. **3 blog separati** — 3 keyword cluster, 3 audience, zero cannibalizzazione
6. **2.700 articoli/anno** — domain authority massiva
7. **SaaS + Content** — l'unico competitor che ha sia blog sia prodotto alert
8. **Costi $0.24/articolo** — vs $200-500 freelance finance writer
9. **Earnings calendar** — traffico prevedibile e preparabile
10. **Cross-sell naturale** — blog → newsletter → Pro → PDF
11. **Data studies linkabili** — contenuti originali che attraggono backlink naturali
12. **Opinion engine** — "Our Verdict" con threshold numerici crea trust + ritorno lettori
13. **Authority building sistematico** — HARO, guest posts, Reddit, partnership newsletter

---

## "Our Verdict" Section — In Ogni Articolo

Ogni articolo DEVE avere una sezione "Our Verdict" prima della conclusione.
NON generico ("this stock looks good"). SPECIFICO con numeri e posizione chiara.

### Template "Our Verdict"

```
## Our Verdict

[STRONG OPINION con threshold numerico]

Esempio BUY:
"Despite trading near all-time highs, Jensen Huang's $2.3M purchase
signals strong conviction. With FCF yield at 3.2% and insider sentiment
4:1 buy-to-sell, we consider NVDA attractive below $115. Above $130,
the risk/reward deteriorates significantly."

Esempio CAUTION:
"While the CEO purchase is notable, declining margins (34% → 28% YoY)
and rising debt-to-equity (0.4 → 0.9) suggest this is a defensive buy,
not a conviction signal. We would not enter above current levels and
would want to see Q3 margins stabilize before reconsidering."

Esempio SELL:
"Three directors sold $14M combined in the last 30 days. Free cash flow
turned negative for the first time since 2019. Despite the attractive
dividend yield (4.2%), the payout ratio at 112% is unsustainable. We
see significant downside risk from current levels."

Esempio WAIT:
"The insider purchase is notable, but the data isn't conclusive. We'd
want to see Q3 margins above 32% and at least one more executive buy
before considering entry. Current valuation at 35x forward earnings
leaves no margin for error. Wait for a better setup."

Esempio NO TRADE:
"Insufficient data to form a thesis. Only one insider purchase in 12
months, no clear trend in financials, and the stock trades within 2%
of fair value. There's no edge here — we'd look elsewhere."
```

### Tipi di Verdict (5 opzioni, non solo 3)

```
1. BUY CONVICTION — dati forti, threshold chiaro, rischio definito
2. CAUTION — segnali misti, problema specifico da monitorare
3. SELL/AVOID — dati negativi, rischio alto, meglio stare fuori
4. WAIT FOR BETTER ENTRY — tesi interessante ma valuation o timing sbagliati
5. NO TRADE — dati insufficienti per prendere posizione

IMPORTANTE: non forzare MAI un BUY/SELL quando i dati non lo supportano.
Un verdict "WAIT" o "NO TRADE" credibile costruisce piu' trust di un
BUY forzato. Il lettore deve pensare "questi non sparano cazzate".
```

### Come viene generato

```
Claude riceve:
    1. Tutti i dati finanziari (Dexter output)
    2. Insider trade details
    3. Prompt: "Write Our Verdict. Take a CLEAR position. Include:
       - specific price threshold (entry/exit)
       - 2-3 supporting data points with numbers
       - explicit risk if thesis is wrong
       Do NOT be neutral. Do NOT hedge everything."
```

### Regole "Our Verdict"

```
1. DEVE avere un threshold numerico ("below $X", "above $Y")
2. DEVE citare almeno 2 metriche specifiche
3. DEVE dichiarare il rischio se la tesi e' sbagliata
4. MAI frasi tipo "could be interesting" o "worth watching"
5. MAI financial advice esplicito — sempre "we consider" non "you should buy"
6. Disclaimer obbligatorio sotto: "This is analysis, not financial advice.
   Past insider buying performance does not guarantee future results."
```

---

## AI-Proof Content System — Anti-Detection Google

Google sta imparando a riconoscere contenuti AI. Il nostro sistema DEVE essere
indistinguibile da contenuto scritto da un team editoriale umano. 4 layer:

### 1. Verdict Forte (gia' implementato sopra)

Ogni articolo ha "Our Verdict" con posizione chiara e threshold numerico.
Questo da solo ci separa dal 95% dei blog AI che non prendono mai posizione.

### 2. Variazione Strutturale degli Articoli

```
NON tutti gli articoli devono avere la stessa struttura.
Un blog umano ha articoli di tipi diversi scritti da persone diverse.

TIPO A — Data-Heavy (40% degli articoli):
    Struttura: dati → tabelle → grafici → conclusione
    Tono: freddo, analitico, Bloomberg-style
    Esempio: "NVDA Q2 2026 Earnings: Revenue $38.2B, +24% YoY"

TIPO B — Narrativo/Story-Driven (25% degli articoli):
    Struttura: hook narrativo → contesto → dati → insight
    Tono: piu' discorsivo, racconta una storia
    Esempio: "Jensen Huang Just Made His Biggest Bet in 2 Years.
              Here's Why It Matters."

TIPO C — Comparativo (20% degli articoli):
    Struttura: 2-3 stock side-by-side → metriche → winner
    Tono: oggettivo ma con opinione finale
    Esempio: "NVDA vs AMD vs INTC: Which Chip Stock Wins on
              Insider Confidence?"

TIPO D — Opinion/Editorial (15% degli articoli):
    Struttura: tesi forte → supporto dati → contro-argomenti → conclusione
    Tono: piu' personale, quasi "lettera al lettore"
    Esempio: "Why I Think the Market Is Wrong About Tesla's
              Insider Selling Pattern"

IMPLEMENTAZIONE n8n:
    Il TIPO viene assegnato in base alla keyword/intent, NON random:

    Keyword tipo "NVDA earnings Q2 2026"     → tipo A (data-heavy)
    Keyword tipo "why insiders buying NVDA"  → tipo B (narrativo)
    Keyword tipo "NVDA vs AMD stock"         → tipo C (comparativo)
    Keyword tipo "insider buying strategy"   → tipo D (opinion)

    Mappatura nel codice n8n:
    - keyword contiene "earnings/analysis/forecast/metrics" → tipo A
    - keyword contiene "why/how/what happened/signal"       → tipo B
    - keyword contiene "vs/compare/best/top"                → tipo C
    - keyword contiene "strategy/guide/should/opinion"      → tipo D
    - fallback se nessun match                              → tipo A

    Il tipo determina: struttura sezioni, tono, lunghezza, apertura.
    Risultato: variazione naturale guidata dal contenuto, non dal caso.
```

### 3. Insight Non Ovvi (Deep Analysis Layer)

```
Il contenuto AI generico dice cose ovvie:
    ✗ "insider buying is generally a positive signal"
    ✗ "the company has strong fundamentals"
    ✗ "investors should do their own research"

Il NOSTRO contenuto deve dire cose SPECIFICHE e NON OVVIE:
    ✓ "cluster buying after an earnings miss historically
       outperforms by 8.3% — but only when the CFO is
       part of the cluster"
    ✓ "this is the first time 3+ executives bought within
       the same week since 2019 — and that preceded a 34% rally"
    ✓ "despite the large purchase, the CEO sold 10x more in
       options exercises last quarter — net insider sentiment
       is actually negative"

COME GENERARLO:
    Dexter non deve solo riassumere i dati.
    Il prompt Dexter include:
    - "Find the NON-OBVIOUS pattern in this data"
    - "What would surprise a professional analyst?"
    - "What does the data say that contradicts the obvious narrative?"
    - "Find correlations between insider timing and subsequent events"

    Claude poi costruisce l'articolo ATTORNO a questi insight,
    non come appendice.
```

### 4. Contenuti "Umani" (Pattern Breaker)

```
Anche con variazione strutturale, l'AI ha pattern riconoscibili:
    - frasi troppo bilanciate ("on the other hand...")
    - transizioni troppo pulite
    - mancanza di opinioni forti
    - vocabolario troppo uniforme

SOLUZIONE: 1 articolo su 10 (~10%) e' scritto con prompt
"editoriale umano" che rompe i pattern AI:

Prompt speciale (tipo D rinforzato):
    "Write this as if you're a senior analyst writing a personal
    column. Use:
    - first person occasionally ('I've been tracking this...')
    - strong opinions ('this is overhyped')
    - anecdotes from market history
    - rhetorical questions
    - shorter paragraphs, some just 1 sentence
    - occasional informal language ('let's be real here')
    - NOT every paragraph needs data
    - break conventional article structure
    Do NOT use: 'on the other hand', 'it's worth noting',
    'in conclusion', 'having said that', 'it remains to be seen'"

BANNED PHRASES (in TUTTI gli articoli, non solo tipo D):
    ✗ "It's worth noting that..."
    ✗ "In conclusion..."
    ✗ "Having said that..."
    ✗ "It remains to be seen..."
    ✗ "On the other hand..."
    ✗ "At the end of the day..."
    ✗ "All in all..."
    ✗ "Needless to say..."
    ✗ "It goes without saying..."
    ✗ "In today's market..."
    → Queste sono signature AI. Claude le deve evitare SEMPRE.
    → Aggiunte al system prompt come banned list.

VARIAZIONE LUNGHEZZA (altro pattern breaker):
    Non tutti gli articoli stessa lunghezza.
    - 30% articoli: 800-1000 parole (brevi, punchy)
    - 50% articoli: 1200-1800 parole (standard)
    - 20% articoli: 2000-3000 parole (deep dive)
    → un blog umano ha articoli di lunghezze diverse

VARIAZIONE APERTURA (primo paragrafo):
    Non iniziare mai 2 articoli consecutivi nello stesso modo.
    Pool di aperture:
    - Dato shock: "Jensen Huang just spent $2.3M of his own money."
    - Domanda: "When was the last time 3 NVDA executives bought
      in the same week?"
    - Contrarian: "Everyone's talking about AI spending. The insider
      data tells a different story."
    - Storico: "In March 2024, a similar cluster buy preceded..."
    - Diretto: "NVDA is trading at 28x forward earnings. Here's
      why that matters less than what the CEO did Friday."
    → n8n sceglie un'apertura random dal pool per ogni articolo
```

---

## Data Studies — Linkable Content Engine

2 data study al mese per blog (6 totali). Questi sono i nostri LINKABLE ASSETS —
contenuti originali con dati aggregati che altri siti vogliono citare e linkare.

### Cos'e' un Data Study

```
NON e' un articolo normale su 1 stock.
E' un'analisi AGGREGATA su centinaia/migliaia di data point.

Esempio:
"We Analyzed 500 CEO Purchases Over 10 Years. Here's What Happened."
→ 500 data point, grafici, statistiche, conclusioni
→ NESSUN altro sito ha questi dati aggregati
→ Giornalisti, newsletter, blogger lo citano come fonte
→ = backlink naturali
```

### Data Study Calendar (per blog)

```
deepstockanalysis.com (2/mese):
    Mese 1: "The 50 Most Undervalued Stocks Right Now (Data-Driven)"
            "Tech vs Value: 5-Year Performance Breakdown"
    Mese 2: "How Earnings Surprises Predict Next-Quarter Returns"
            "Small Cap vs Large Cap: Where Insiders Are Buying"
    Mese 3: "The Best Month to Buy Stocks (20 Years of Data)"
            "Revenue Growth vs Stock Returns: What Actually Matters"

insiderbuying.ai/blog (2/mese):
    Mese 1: "We Analyzed 500 CEO Purchases: Here's What Happened Next"
            "Do Insider Buys Predict Returns? (10-Year Backtest)"
    Mese 2: "Top 100 Insider Purchases Ranked by 12-Month Performance"
            "CEO vs CFO Purchases: Who Has Better Timing?"
    Mese 3: "Insider Buying Before Earnings: Signal or Noise?"
            "The $1M Club: What Happens When Insiders Buy Big"

dividenddeep.com (2/mese):
    Mese 1: "Dividend Aristocrats vs S&P 500: The Real Numbers"
            "High Yield Traps: How to Spot Them With Data"
    Mese 2: "The 20 Most Consistent Dividend Growers (30-Year Data)"
            "Dividend Growth Rate vs Total Return: What Wins"
    Mese 3: "Insider Buying in Dividend Stocks: A Bullish Signal?"
            "Monthly Dividend Stocks: Performance vs Quarterly Payers"
```

### Come Viene Generato un Data Study

```
1. n8n query Financial Datasets API con AGGREGAZIONE:
   - /insider-trades con date_range=10y, amount_min=1000000
   - /stock-prices per calcolare returns a 3/6/12 mesi post-buy
   - Costo: ~$2-5 per study (molte piu' API calls di un articolo)

2. Python/JS script aggrega i dati:
   - media, mediana, percentili
   - filtri per ruolo (CEO vs CFO vs Director)
   - breakdown per settore, dimensione azienda, importo

3. Claude scrive il report con:
   - titolo headline-worthy (citabile)
   - executive summary (300 parole, standalone)
   - metodologia (trasparente, replicabile)
   - 5-8 finding principali con numeri specifici
   - grafici (Chart.js con dati aggregati)
   - "Our Take" con conclusione forte
   - limitazioni e disclaimer

4. Featured image speciale (infografica con stat principale)

5. Distribuzione immediata (vedi Authority Building sotto)
```

### Costo Data Studies

```
Per study:
    Financial Datasets API:  $2-5 (queries aggregate)
    Claude writing:          $0.10 (articolo lungo)
    Totale per study:        $2-5

Per mese (6 studi):
    $12-30/mese extra
```

### KPI Data Studies

```
Successo = backlink. Non traffico diretto.
Target per study: 3-10 backlink nei primi 30 giorni.
Target anno 1: 6 study/mese × 12 mesi × 5 backlink avg = 360 backlink

Metriche:
    - # backlink ottenuti (Ahrefs/Google Search Console)
    - # citazioni (brand mention senza link)
    - # condivisioni Reddit/X
    - referring domains (DR > 30 = valuable)
```

---

## Authority Building Engine — Backlink Strategy

### Tier 1 — Immediato (Settimana 1, zero costo)

**HARO / Connectively / Featured.com**
```
Cosa: giornalisti finance cercano fonti per articoli ogni giorno
Come: iscrizione gratuita, rispondi a 2-3 query/giorno con dati reali
Target: Forbes, Business Insider, MarketWatch, Investopedia
Effort: 15 min/giorno
Timeline: primi backlink in 2-4 settimane
Template risposta:
    "Hi [Name], I run InsiderBuying.ai where we analyze SEC Form 4
    filings in real-time. Relevant to your question: [DATO SPECIFICO
    dal nostro database]. Happy to provide more data or clarify.
    Source: [link al nostro data study]"
```

**Reddit (r/stocks, r/investing, r/wallstreetbets, r/dividends)**
```
Cosa: pubblica data study come post genuini, NON promo
Come: "I analyzed 500 CEO purchases over 10 years. Here's what happened."
      + link alla versione completa sul blog
Regole:
    - MAI promo diretta ("check out my site")
    - SEMPRE valore prima ("here's the data, full study on our blog")
    - Rispondi ai commenti con altri dati
    - Reddit AMA i dati originali, odia la pubblicita'
Target: 1 post/settimana, alternando subreddit
Un post virale = 50-100k views + backlink da chi lo ripubblica
```

**X/Twitter @insiderbuying**
```
Cosa: thread giornaliero con dati insider reali
Formato:
    "Today's biggest insider buy:
    Jensen Huang (CEO, NVDA) bought $2.3M
    Last time this happened: +47% in 3 months
    90-day sentiment: 4 buys, 1 sell
    [link to full analysis]"
Target: fintwit community (30-55 anni, retail investor)
KPI: quando account finance >10k follower retwittano = authority signal
```

**Medium + Substack cross-posting**
```
Medium:
    - Ripubblica data study (DA 95 = backlink fortissimo)
    - Tag: Finance, Investing, Data Science, Stock Market
    - Canonical URL punta al nostro blog (evita duplicate content)

Substack:
    - Newsletter gratuita: weekly digest insider buying
    - Ogni issue linka ai nostri articoli
    - Beehiiv per la newsletter principale, Substack per reach extra
```

### Tier 2 — Settimana 2-4

**Data Study Outreach Diretto**
```
Dopo ogni data study, manda email a 20-30 target:

Target list:
    - Newsletter finance (Milk Road, Morning Brew, The Hustle)
    - Blog finance (Motley Fool contributors, Seeking Alpha contributors)
    - Podcast finance (hosts sempre cercano dati originali)
    - Professori/ricercatori finance (amano dati SEC aggregati)
    - Account X finance con >5k follower

Template email:
    Subject: "Original research: [KEY FINDING] (10 years of SEC data)"

    "Hi [Name],

    We just published original research analyzing [N] insider
    purchases over [N] years using SEC Form 4 filings.

    Key finding: [STATISTICA FORTE, es. "CEO purchases >$1M
    outperformed the S&P 500 by 12.4% on average"]

    Full study with methodology: [LINK]

    Thought your readers/listeners might find it useful.
    Happy to provide the raw data if you'd like to verify.

    [firma]"

NON chiedere il link. Offri il dato. Il link viene naturalmente.
Success rate atteso: 5-10% rispondono, 2-3% linkano.
20 email × 3% = 1 backlink per outreach.
Con 6 study/mese × 20 email = ~6 backlink/mese da outreach.
```

**Guest Posts su Siti Finance**
```
Piattaforme che accettano contributor:
    - Seeking Alpha (accetta contributor, link nel profilo + articolo)
    - Investopedia (contributor program)
    - Yahoo Finance contributor network
    - Kiplinger (accetta guest post finance)
    - The Balance (accetta contributor)

Strategia:
    - 1 guest post/mese su ciascuna piattaforma
    - Contenuto: versione ridotta di un data study
    - Link: "Full data and methodology at InsiderBuying.ai"
    - Bio: "Research team at InsiderBuying.ai, tracking insider
      buying activity across 17,000+ publicly traded companies"

Effort: 2-3 ore per guest post (gia' abbiamo i dati, serve solo adattare)
```

### Tier 3 — Mese 2-3

**Partnership Newsletter Finance**
```
Offerta:
    "Noi forniamo il dato insider buying della settimana
    (top 5 CEO purchases + returns). Voi lo mettete nella
    vostra newsletter con credit: 'Data by InsiderBuying.ai'"

Win-win:
    Loro: contenuto gratis, dati esclusivi, valore per i lettori
    Noi: backlink + brand mention settimanale + nuovo pubblico

Target: newsletter finance con 1k-50k subscriber (small-medium)
Come trovarle: Beehiiv directory, Substack finance category
Template:
    "Hi [Name], love your newsletter. We track insider buying
    in real-time using SEC filings. Would you be interested in
    a weekly 'Insider Activity Snapshot' for your readers?
    We'd provide: top 5 CEO purchases, AI analysis, returns data.
    Credit + link to InsiderBuying.ai. No cost. [example attached]"
```

**Infografiche**
```
Prendi stat principali dai data study → infografica professionale
Strumenti: Canva free / Figma (gia' lo usiamo)
Distribuzione:
    - Pinterest (finance infographics hanno traffico enorme)
    - Reddit r/dataisbeautiful (se i dati sono visualizzati bene)
    - X come immagine (piu' RT di un thread di testo)
    - Embed code offerto ("Embed this infographic" con backlink)
```

**Podcast Finance come Ospite**
```
Pitch:
    "I built a system that analyzes every insider trade in
    real-time using AI. Here's what 10 years of data show:
    CEO purchases >$1M outperform the S&P by 12.4%.
    Would love to share the methodology with your listeners."

Target: podcast finance con 500-5k ascolti/episodio
Come trovarle: Apple Podcasts finance category, Podchaser
Ogni apparizione = link nelle show notes + brand mention
Target: 1-2 podcast/mese dal mese 3
```

### Tier 4 — Cross-link dai Nostri 3 Blog (Natural Linking Rules)

**REGOLA FONDAMENTALE: il link deve migliorare il contenuto per il lettore.
Se non aggiunge valore, NON metterlo. Google penalizza pattern artificiali.**

```
FREQUENZA (su 100 articoli per blog):
    40-50 articoli → 1 link a insiderbuying.ai (solo quando aggiunge valore)
    10-15 articoli → 2 link (solo articoli lunghi dove ha senso)
    35-50 articoli → NESSUN link
    → il contesto decide, NON una quota fissa
    → se il link non migliora l'esperienza del lettore, non metterlo

COSA NON FARE MAI:
    ✗ Link in OGNI articolo
    ✗ Link SEMPRE nello stesso punto (es. fine articolo)
    ✗ Link SEMPRE con stesso anchor text
    ✗ "Check InsiderBuying.ai for more" (forzato, debole)
    ✗ Linkare sempre la homepage
    → tutto questo = pattern artificiale = penalizzazione

ANCHOR TEXT — VARIARE SEMPRE:
    ✗ Non sempre "InsiderBuying.ai"
    ✓ "insider buying data"
    ✓ "recent insider transactions"
    ✓ "SEC Form 4 filings analysis"
    ✓ "our insider dataset"
    ✓ "real-time insider alerts"
    ✓ "insider sentiment data"
    ✓ "track what executives are buying"
    → mix naturale, mai lo stesso anchor 2 volte di fila

POSIZIONE DEL LINK — MESCOLARE:
    ✓ Meta' articolo (dentro un paragrafo analitico)
    ✓ Dentro una sezione dati ("insider sentiment shows...")
    ✓ Nel widget insider (quando presente)
    ✓ Raramente in fondo
    → nessun punto fisso, varia per ogni articolo

DEEP LINKS (molto piu' potenti della homepage):
    ✓ insiderbuying.ai/alerts (pagina alert live)
    ✓ insiderbuying.ai/reports/nvda (report specifico)
    ✓ insiderbuying.ai/blog/insider-buying-nvda (articolo correlato)
    ✓ insiderbuying.ai/methodology (quando si citano dati)
    ✗ Non sempre insiderbuying.ai/ (homepage)
    → deep link = piu' valore SEO + piu' naturale

DISTRIBUZIONE TRA I 2 BLOG CHE LINKANO:
    deepstockanalysis.com:
        → piu' link a insiderbuying.ai (ha senso: analisi stock
          → insider data e' un approfondimento naturale)
        → ~50% degli articoli hanno un link

    dividenddeep.com:
        → meno link (insider buying e' meno rilevante per
          chi cerca solo dividendi)
        → ~25-30% degli articoli hanno un link
        → solo quando l'insider buying e' rilevante al contesto

    → distribuzione asimmetrica = sembra naturale

ESEMPIO LINK BUONO (dentro contesto analitico):
    "Revenue grew 12% YoY, but more importantly, insider
    sentiment has shifted significantly. SEC filings show
    4 executive purchases totaling $8.2M in the last 90 days
    (insider transaction data), the strongest cluster
    since Q2 2024."

ESEMPIO LINK CATTIVO (forzato):
    "For more insider buying data, visit InsiderBuying.ai."

IMPLEMENTAZIONE NEL PIPELINE n8n:
    Il prompt Claude per la scrittura articolo include:
    - Random flag: 45% probabilita' di includere 1 link
    - Se include: sceglie anchor text random da pool di 8+
    - Se include: sceglie posizione random (meta'/terzo/widget)
    - Se include: sceglie deep link random (alerts/reports/blog/methodology)
    - 12% probabilita' di 2 link (solo se articolo lungo >1500 parole)
    - 43% probabilita' di 0 link
    - MA il flag viene OVERRIDDEN se il contesto non e' rilevante
      → il link deve migliorare l'esperienza del lettore
    → tutto randomizzato nel codice, zero pattern manuale
```

### Timeline Authority Building

```
SETTIMANA 1:
    [ ] Iscrizione HARO/Connectively
    [ ] Creare account X @insiderbuying
    [ ] Creare account Reddit u/insiderbuying
    [ ] Primo data study pubblicato
    [ ] Primo post Reddit con data study

SETTIMANA 2:
    [ ] Prime 3 risposte HARO
    [ ] Primo thread X con dati insider
    [ ] Cross-post data study su Medium
    [ ] Outreach email a 20 newsletter (per data study)

SETTIMANA 3:
    [ ] Applicazione contributor Seeking Alpha
    [ ] Secondo data study pubblicato
    [ ] Secondo post Reddit
    [ ] Substack newsletter avviata

SETTIMANA 4:
    [ ] Primo guest post su Seeking Alpha (se approvato)
    [ ] Outreach partnership 5 newsletter
    [ ] Prima infografica

MESE 2:
    [ ] HARO routine (3 risposte/settimana)
    [ ] 2 guest post pubblicati
    [ ] 2 partnership newsletter attive
    [ ] 4 data study pubblicati (totale)

MESE 3:
    [ ] Primo podcast
    [ ] 6-8 data study pubblicati (totale)
    [ ] 30-50 backlink totali stimati
    [ ] Primo check Google Search Console: indexation ratio >60%?
```

### KPI Authority (trimestrale)

```
Q1 target:
    Backlink totali: 30-50
    Referring domains (DR >30): 10-15
    Brand mention (senza link): 50+
    Reddit karma da post finance: 1000+
    X follower @insiderbuying: 500+
    Newsletter subscriber: 200+

Q2 target:
    Backlink totali: 80-120
    Referring domains (DR >30): 25-35
    Guest post pubblicati: 6+
    Podcast apparizioni: 3+
    Newsletter partnership attive: 5+
```

---

## Methodology Page — "How We Analyze" (su ogni blog)

Pagina /methodology su ciascun blog. Serve per E-E-A-T e per chi vuole
verificare i nostri dati. Deve essere trasparente e dettagliata.

### Struttura

```
URL: insiderbuying.ai/methodology
     deepstockanalysis.com/methodology
     dividenddeep.com/methodology

Sezioni:
1. "Our Data Sources"
    - SEC Form 4 filings (public record, filed within 2 business days)
    - Financial Datasets API (financialdatasets.ai)
    - Specific endpoints: income statement, balance sheet, cash flow,
      insider trades, stock prices, financial metrics
    - Data refresh: real-time for insider trades, daily for financials

2. "Our Analysis Process"
    - Step 1: Data collection (automated, API-driven)
    - Step 2: AI research agent analyzes patterns, compares historical
    - Step 3: Article generation with real data citations
    - Step 4: Human editorial review for accuracy (futuro)
    - Step 5: Publication with interactive charts

3. "Our AI Tools"
    - Dexter (open-source research agent) for data reasoning
    - Claude for article writing with data citations
    - Transparent: we use AI, not hiding it
    - Every number is verifiable against SEC filings

4. "Limitations"
    - Insider trading data has a 2-day reporting delay
    - Past insider buying performance does not guarantee future results
    - AI analysis can have errors — always verify with primary sources
    - We are not registered investment advisors

5. "Verify Our Data"
    - Link to SEC EDGAR for raw Form 4 filings
    - Link to Financial Datasets API documentation
    - "Every data point in our articles can be independently verified"
```

---

## Moat / Vantaggio Competitivo (aggiornato)

1. **Dati SEC reali** — nessun blog AI ha Financial Datasets come fonte
2. **DataForSEO targeting** — 95% keyword verificate, ogni articolo ha volume confermato
3. **Grafici TradingView interattivi** — aspetto Bloomberg, costo $0, +15% engagement
4. **Immagini branded auto-generate** — Google Discover eligible, OG social share ottimizzato
5. **3 blog separati** — 3 keyword cluster, 3 audience, zero cannibalizzazione
6. **2.700 articoli/anno** — domain authority massiva
7. **SaaS + Content** — l'unico competitor che ha sia blog sia prodotto alert
8. **Costi $0.24/articolo** — vs $200-500 freelance finance writer
9. **Earnings calendar** — traffico prevedibile e preparabile
10. **Cross-sell naturale** — blog → newsletter → Pro → PDF
11. **Data studies linkabili** — contenuti originali che attraggono backlink naturali
12. **Opinion engine** — "Our Verdict" con threshold numerici crea trust + ritorno lettori
13. **Authority building sistematico** — HARO, guest posts, Reddit, partnership newsletter
14. **Methodology transparency** — ogni dato verificabile contro SEC EDGAR

---

## Article System Prompt (Claude Sonnet 4.6)

Il prompt completo per la generazione articoli e' in:
`ryan_cole/FINANCIAL-ARTICLE-SYSTEM-PROMPT.md`

Contiene: identity, blog context, reader profile, 4 tipi articolo (A/B/C/D),
length calibration, writing rules, banned phrases, authority signals,
engagement techniques, SEO rules, output format JSON, quality gate (14 check),
n8n integration code (variable interpolation + response parsing).

Modello: claude-sonnet-4-6-20250514, temperature 0.6
Max tokens: 6000 (short), 8000 (medium), 12000 (long)

---

## DECISIONI FINALI (sessione 2026-03-26)

### Stack Aggiornato

```
SITO:           Next.js + Tailwind + TypeScript → Netlify (free)
                NON WordPress. Blog = file Markdown o Airtable CMS headless.
BLOG:           Airtable come CMS → n8n genera articolo → salva in Airtable
                → webhook Netlify rebuild → articolo live
NEWSLETTER:     Beehiiv SOLO (Substack eliminato — no API)
SOCIAL:         X API Free (posting) + twitterapi.io (monitoring ~$3/mese)
REDDIT:         Reddit API Free (monitoring commenti) → Telegram → post manuale
EMAIL OUTREACH: Gmail SMTP gratis + Hunter/Snov/Apollo free tier per trovare email
ALERT SYSTEM:   Scala con revenue (Fase 0 = $0, Fase 1 = $7/mese, ecc.)
IMMAGINI:       Nano Banana Pro ($0.04/img) hero + Puppeteer data card OG
CROSS-POST:     Eliminati Medium e Substack
HARO:           Eliminato (chiuso fine 2024)
REPORT PDF:     Venduti su insiderbuying.ai direttamente (non Gumroad)
```

### Costi Mensili Finali — Lancio (3 art/giorno)

```
CONTENT (3 art/giorno, 90/mese):
  Financial Datasets API (con cache 7gg):  $10.00
  Dexter GPT-4o-mini (analisi):            $0.27
  Claude Sonnet (scrittura):               $4.50
  Nano Banana Pro (hero images):           $3.60
  DataForSEO (keyword):                    $0.35
                                           ──────
                                           $18.72

DATA STUDIES (6/mese, dati cached):
  Financial Datasets (extra queries):      $8.00
  Claude Sonnet (report lunghi):           $0.60
  Nano Banana Pro:                         $0.24
                                           ──────
                                           $8.84

ALERT SYSTEM:
  Fase 0 (0 clienti):                     $0.00
  Fase 1 (1-20 clienti, check ogni 2h):   $7.20
  Fase 2 (20-100, ogni 30min):            $28.80
  Fase 3 (100+, ogni 15min):              $57.60
  REGOLA: mai >5% del revenue

X + REDDIT + OUTREACH:
  twitterapi.io (monitoring):              $3.00
  Reddit API:                              $0.00
  Claude (commenti X+Reddit):             $2.40
  Claude (email outreach 50/sett):         $2.00
  Gmail SMTP:                              $0.00
  Hunter/Snov/Apollo free:                 $0.00
                                           ──────
                                           $7.40

HOSTING:
  Netlify:                                 $0
  Supabase:                                $0
  VPS Hostinger (n8n, gia' pagato):        $0 extra

DOMINI:
  insiderbuying.ai (~$35/anno):            $3.00
  deepstockanalysis.com (~$12/anno):       $1.00
  dividenddeep.com (~$12/anno):            $1.00
  insiderbuyingalerts.com (~$12/anno):     $1.00
                                           ──────
                                           $6.00

═══════════════════════════════════════════════════
TOTALE LANCIO (Fase 0):           ~$41/mese
TOTALE CON ALERT Fase 1:         ~$48/mese
═══════════════════════════════════════════════════
```

### Pricing Strategy (aggiornata 2026-03-26)

```
3 PIANI:

FREE ($0/mese):
  ✓ Real-time alert feed (who bought what, how much)
  ✓ 3 email alerts/week (top picks, no AI analysis)
  ✓ Weekly insider digest (Beehiiv)
  ✓ Monthly backtest report PDF (lead magnet)
  ✗ AI analysis (BLURRED con lucchetto)
  ✗ Conviction scoring (BLURRED)
  ✗ Historical context (BLURRED)
  ✗ Custom watchlist (locked)
  ✗ Deep Dive Reports (locked)
  ✗ Priority support

PRO ($24/mese, annual $19/mese = $228/anno — "Save 21%"):
  ✓ Everything in Free
  ✓ Full AI analysis on every trade
  ✓ Conviction scoring (0-100)
  ✓ Historical context & patterns
  ✓ Custom stock watchlist
  ✓ Unlimited email + push alerts
  ✓ 20% off individual report purchase
  ✗ All reports included (locked)
  ✗ Priority support

PREMIUM ($49/mese, annual $39/mese = $468/anno — "Save 20%"):
  ✓ Everything in Pro
  ✓ ALL Deep Dive Reports included (new ones every month)
  ✓ Priority support
  ✓ Early access to new features

NEWSLETTER SUBSCRIBER DISCOUNT (codice nella welcome sequence):
  Pro first month: $12 (poi $24/mese)
  Premium first month: $24 (poi $49/mese)
  Messaggio: "As a subscriber, your first month is [price]"
  Solo per monthly, non annual.

RIMBORSO: NO. Cancel anytime, service active until end of billing period.
No contracts, no refunds. Standard SaaS model.

REPORT INDIVIDUALI (per chi non vuole Premium):
  $14.99 — single stock report (NVDA, AAPL, etc.)
  $24.99 — sector report (AI & Semi, Dividend Kings, etc.)
  $29.99 — bundle report (Magnificent 7)
  Pro subscriber: 20% sconto su tutti
  Premium subscriber: tutti inclusi gratis

PIANO ANNUALE: disponibile subito al lancio.
  Pro: $19/mese ($228/anno) vs $24/mese = save 21%
  Premium: $39/mese ($468/anno) vs $49/mese = save 20%
  NON offrire sconti annuali >25% — dati retention non disponibili al lancio.
  Dopo 6-9 mesi: rivaluta pricing annuale con dati churn reali.
```

### Pagina /alerts — Strategia Free vs Pro/Premium

```
FREE USER:
  → Vede TUTTE le alert (nome CEO, ticker, importo, BUY/SELL) IN TEMPO REALE
  → AI Analysis: BLURRED con lucchetto
  → Conviction Score: BLURRED
  → Contesto storico: BLURRED
  → CTA: "Upgrade to Pro for full AI analysis"
  → Riceve 3 email/settimana (top picks, solo dati base senza analisi)
  → Weekly digest via Beehiiv

PRO USER ($24/mese):
  → Tutto sbloccato: AI analysis, conviction score, contesto storico
  → Email illimitate per ogni trade
  → Web push notification (OneSignal)
  → Custom watchlist
  → Report individuali con 20% sconto

PREMIUM USER ($49/mese):
  → Tutto Pro
  → Tutti i Deep Dive Reports accessibili e scaricabili
  → Nuovi report ogni mese inclusi
  → Priority support

PAIN POINT per conversione Free → Pro:
  NON e' il delay (15 min non importa al retail investor).
  E' il CONTESTO bloccato. Sapere CHI ha comprato non basta.
  Sapere PERCHE' e cosa e' successo LE VOLTE PRECEDENTI = valore vero.

PAIN POINT per conversione Pro → Premium:
  Chi compra 2+ report al mese spende $30+ — Premium a $49 e' piu' conveniente.
  Il trigger e' il secondo acquisto report: "You've bought 2 reports this month.
  Premium gives you unlimited reports for $49/mo."
```

### X Strategy

```
POSTING (X API Free, 1,500/mese):
  → Post automatici dopo ogni articolo/alert
  → MAI link nei tweet (ammazza il reach)
  → Solo dati + insight. Link in bio del profilo.
  → Formato: stat principale + contesto + conviction

MONITORING (twitterapi.io, ~$3/mese):
  → Ogni 15 min: search keyword insider tra 50 account target
  → Filtra: engagement >100 like, ultimi 30 min
  → Claude genera commento (2-3 frasi, dato specifico)
  → Manda su Telegram: commento + link tweet
  → Tu posti manualmente

COMMENTI — STRATEGIA 4D:
  → MAI menzionare InsiderBuying.ai
  → MAI link
  → Aggiungi dato specifico che l'autore non ha
  → Profilo @InsiderBuying fa il lavoro passivo
  → Tono: esperto che contribuisce, non marketer
  → 3-5 commenti/giorno max
```

### Reddit Strategy

```
MONITORING (Reddit API Free, 100 req/min):
  → Ogni 2 ore: cerca "insider buying/trading/SEC" su
    r/stocks, r/investing, r/wallstreetbets, r/dividends
  → Filtra: >50 upvote, ultimi 24h
  → Claude genera commento
  → Manda su Telegram: commento + link post
  → Tu posti manualmente da @InsiderBuying

COMMENTI — REGOLE:
  80% commenti: puro valore, zero mention
    "SEC filing shows 3 execs bought $4.2M combined.
     Strongest cluster since Q2 2024."

  20% commenti: soft mention organica
    "Actually ran the numbers on this last week —
     CEO purchases >$1M outperform S&P by 12.4%..."
    → Nessun link, nessun brand name
    → Chi e' curioso clicca profilo → trova sito in bio

  SE QUALCUNO CHIEDE "where's your data from?":
    → ALLORA rispondi naturalmente con il sito
    → 100% organico perche' LORO hanno chiesto
```

### Email Outreach (50/settimana, gratis)

```
TROVARE PROSPECT:
  → Hunter.io (25/mese free) + Snov.io (50/mese free)
    + Apollo.io (100/mese free) = ~175 email/mese
  → Google Custom Search: cerca blog/newsletter finance
    con query: "write for us" finance, "guest post" investing,
    "insider trading blog", "stock analysis newsletter"
  → Filtro qualita':
    - DA > 20
    - Sito finance/investing (rilevanza tematica)
    - No siti che vendono link
    - Preferenza: blog personali, newsletter indie, siti educativi

INVIARE:
  → Gmail SMTP via n8n (500/giorno, noi ne mandiamo 7-8/giorno)
  → 1 email alla volta con delay 30-120 sec
  → Claude personalizza ogni email (analizza ultimo articolo prospect)
  → Follow-up automatico dopo 5 giorni se no reply
  → Salva tutto in Airtable con status tracking

ROTAZIONE SETTIMANALE:
  Sett 1: blog finance
  Sett 2: newsletter finance
  Sett 3: siti educativi
  Sett 4: contributor/giornalisti
  Poi ricomincia con NUOVI prospect.
  Ri-contatto dopo 30 giorni solo con NUOVO contenuto.
```

### Immagini Articoli

```
OGNI ARTICOLO HA:
1. HERO IMAGE — Nano Banana Pro ($0.04)
   Immagine AI coerente col tema (finanziario/corporate)
   Prompt basato su settore e tema articolo
   NO persone reali, NO testo nell'immagine

2. OG/SOCIAL CARD — Puppeteer (gratis)
   Card branded: logo azienda + ticker + metriche
   Usata come og:image per preview social

3. GRAFICI INTERATTIVI — dentro l'articolo
   TradingView embed + Chart.js custom
   Gratis

4. TABELLE HTML STYLED — comparative, financial data
   Gratis
```

### Workflow n8n Definitivi

```
W1  Keyword Selection          Settimanale (dom)     DataForSEO
W2  Article Generation         3x/giorno             Dexter+Claude→Airtable→Netlify
W3  Data Study Generation      1° e 15° del mese     Cache+Claude→Airtable→Netlify
W4  SEC Filing Monitor         Scala con revenue      Financial Datasets API
W5  Alert Delivery             Dopo W4               Resend+OneSignal+Supabase
W6  Weekly Newsletter          Lunedi' 7AM EST       Beehiiv API
W7  X Auto-Post                Dopo W2/W4            X API Free (no link)
W8  X Engagement Monitor       Ogni 15 min           twitterapi.io→Telegram
W9  Reddit Monitor             Ogni 2 ore            Reddit API→Telegram
W10 Outreach Prospect Finder   Settimanale           Google Search+Hunter/Snov/Apollo
W11 Outreach Email Sender      50/settimana          Gmail SMTP via n8n
W12 Featured Image Gen         Dopo W2               Nano Banana Pro + Puppeteer
W13 Cross-linking Interno      Dopo W2               Aggiorna articoli correlati
W14 SEO Monitoring             Giornaliero           Google Search Console API
W15 Report PDF Generation      On-demand             Stripe webhook→Claude→PDF→Resend
W16 Lead Magnet PDF             Ultimo giorno mese    Auto-generate→R2→Beehiiv notify
```

### W16 — Lead Magnet: Monthly Backtest Report (FREE)

```
NOME: "Insider Buying Backtest Report — Updated [Month Year]"
URL PERMANENTE: insiderbuying.ai/free-report (stesso link sempre, contenuto aggiornato)
FORMATO: PDF 12-14 pagine, design finance professionale
COSTO: ~$5.30/mese (API + Claude + immagini)

STRUTTURA PDF (pagina per pagina):

Pag 1  — Cover
         Titolo grande + "Updated March 2026" + logo + hero image
         Nano Banana Pro ($0.04)

Pag 2  — Executive Summary
         4-5 key finding (es. "CEOs who buy >$1M beat the market
         by +31% in 12 months"). Hook immediato.

Pag 3-4 — Methodology
          Come raccogliamo i dati (SEC Form 4, 2016-2026, N trade
          analizzati, filtri usati). Disclaimer "Not financial advice".
          Costruisce credibilita' massiva.

Pag 5-8 — Key Findings & Backtest Results
          - Performance complessiva insider buy
          - Per conviction score (il nostro AI score)
          - Per settore (tech, healthcare, ecc.)
          - Per dimensione buy ($100k-$500k vs >$1M)
          - Top 10 pattern con migliori performance
          Core value — questo e' quello che la gente vuole.

Pag 9-10 — Current Hot Patterns ([Mese Corrente])
           3-5 pattern specifici che funzionano ORA + esempi reali recenti.
           Timely & actionable.

Pag 11 — Real Examples
         3 case study dettagliati (nome CEO, azienda, data buy,
         cosa e' successo dopo, AI conviction score).

Pag 12 — Our Verdict & Next Steps
         Riassunto + "What this means for you as an investor".
         Transizione verso Pro.

Pag 13 — CTA Pro
         "Unlock real-time alerts with the same AI scoring used
         in this report" → bottone grande verso Pro ($24/mese).
         Offerta primo mese: $19 ("First month $19 with this report").

Pag 14 — About Us + Legal
         Bio breve + disclaimer completi.

WORKFLOW n8n (ultimo giorno del mese):
  1. Financial Datasets API: query backtest aggregate (~$5)
  2. Script: calcola statistiche (performance, percentili, pattern)
  3. Claude Sonnet: scrive report 12-14 pagine con template ($0.15)
  4. Nano Banana Pro: cover + 2-3 immagini interne ($0.16)
  5. Puppeteer: genera PDF da template HTML
  6. Upload su Cloudflare R2 (URL permanente, sovrascrive il precedente)
  7. Beehiiv API: email a tutti subscriber "The [Month] report is ready"
  8. X auto-post: "We just updated our 10-year insider buying backtest.
     641 trades analyzed. Key finding: [stat principale]."

PROMOZIONE (dove il report appare):

  Su ogni articolo dei 3 blog:
    → CTA banner in fondo: "Want the full 10-year backtest?
       Download the updated report →"
    → CTA banner mid-article (NON bloccante, solo visibile)
    → Pagina dedicata: insiderbuying.ai/free-report

  Su X:
    → Tweet pinnato: "We backtested 641 CEO insider buys over
       10 years. Here's what actually worked → link in bio"
    → 10% dei commenti (non 20%): soft mention organica
       "Full backtest data in the monthly report"

  Su Reddit:
    → 15-20% dei commenti value: soft mention
       "Ran the numbers on this — full backtest in the report"
    → MAI link diretto, solo menzione

  In Beehiiv Newsletter:
    → Fine di ogni weekly digest con CTA rotante:
      "Want the full backtest with latest 2026 data? →"
      "We just refreshed our 10-year study. Grab it →"
      "Which insider patterns beat the market? Free report →"

  Sulla pagina /alerts:
    → Banner fisso nella sidebar (NON pop-up)
    → "Download our free 10-year insider buying backtest report"

WELCOME SEQUENCE BEEHIIV (dopo download):
  Giorno 0: Grazie + link PDF + "You're now inside our research circle"
  Giorno 2: "Here's how we calculate the Conviction Score"
  Giorno 5: Soft upsell Pro ("Get the same AI scoring in real-time")
  Giorno 10: Case study (esempio reale con risultati)

REGOLE:
  - Il link PDF non cambia MAI (tutti i backlink restano validi)
  - Il contenuto si aggiorna ogni mese automaticamente
  - NON email gate mid-article (danneggia SEO)
  - NON pop-up sul sito (2005 vibes)
  - L'offerta primo mese $19 e' SOLO per chi scarica il report
```

### Costi Mensili Aggiornati

```
TOTALE LANCIO (Fase 0):           ~$46/mese
  (precedente $41 + $5.30 lead magnet)
TOTALE CON ALERT Fase 1:         ~$53/mese
```
