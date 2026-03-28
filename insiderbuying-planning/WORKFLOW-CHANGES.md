# Modifiche da applicare ai workflow generati nella sessione notturna

Tutte le modifiche da fare al codice/workflow prodotto la notte del 28/03/2026.
Basate su: sessione di review mattutina + output problem-solver-specialist (COST-OPTIMIZATION-FINAL.md).

## Stato: DA APPLICARE

---

## 1. RIMUOVERE: Data Study PDF (W3)

**Motivo**: Ridondante — il Lead Magnet PDF mensile fa gia lo stesso lavoro di content marketing gratuito.

**File da rimuovere/disabilitare**:
- `n8n/code/insiderbuying/data-study.js`
- `n8n/tests/data-study.test.js`
- Workflow W3 (da non importare su n8n)

**Impatto**: -2 call Sonnet/mese, zero impatto sul business.

---

## 2. AGGIUNGERE: Report Catalog Generator (W17 — nuovo)

**Motivo**: generate-report.js (W15) genera report solo on-demand. I report pre-generati su /reports devono essere creati automaticamente e venduti infinite volte.

**Cosa deve fare W17**:
- Trigger: Schedule, 2 volte a settimana
- Seleziona ticker/settore basandosi su: insider activity score alto, earnings recenti, trend di mercato, keyword SEO demand
- NON solo insider buying — analisi finanziarie complete (revenue, margini, competitor, valuation, verdict)
- Genera report PDF (25-50 pagine) via Claude Sonnet
- Carica su R2
- Aggiunge al catalogo (NocoDB)
- Aggiorna la pagina /reports automaticamente

**Volume**: ~8 report nuovi/mese. Costo AI: ~$1.30/mese.

**Stato**: Serve /deep-plan.

---

## 3. SWAP AI: Smart Routing Claude Sonnet + DeepSeek V3.2

**Vecchio**: Claude Sonnet + Haiku per tutto ($80-150/mese).
**Nuovo**: Claude Sonnet per contenuto pubblico + DeepSeek per task interni ($12/mese).

### Tier 1 — Claude Sonnet 4.6 con prompt caching (~$11/mese)

| Contenuto | Volume/mese | Perche Claude |
|-----------|------------|---------------|
| Articoli finanziari | 45 (1.5/giorno) | Prodotto principale, gente paga per la qualita |
| Report premium | 8 | Prodotto a pagamento, qualita massima |
| Lead Magnet PDF | 1 | Rappresenta il brand |
| Reddit replies | 525 (17/giorno → ridurre a 8-10/giorno) | Redditor detectano AI, shadowban rischio |
| Reddit Daily Thread | 30 | Stessa ragione |
| Reddit posts | 8 | Stessa ragione |
| X replies | 525 (17/giorno) | Sotto tweet di account 50K-500K follower, credibilita |

**Prompt caching**: system prompt (~3K token) cachato, 90% risparmio su input ricorrente.

**File da modificare**:
- `generate-article.js` — endpoint Claude Sonnet + prompt caching
- `generate-report.js` — endpoint Claude Sonnet + prompt caching
- `generate-lead-magnet.js` — endpoint Claude Sonnet
- `reddit-monitor.js` — endpoint Claude Sonnet + prompt caching
- `x-engagement.js` — endpoint Claude Sonnet + prompt caching

### Tier 2 — DeepSeek V3.2 (~$1/mese)

| Contenuto | Volume/mese | Perche DeepSeek |
|-----------|------------|-----------------|
| X posts | 120 (4/giorno) | 280 char, il numero fa tutto, non la prosa |
| Alert scoring | 1,500 | Classificazione numerica pura |
| Alert analysis (score≥4) | 600 | Testo breve e strutturato basato su dati |
| Newsletter | 4 | Template con teaser 2 frasi per articolo |
| Outreach emails | 200 | 150 parole, formula semplice |

**File da modificare**:
- `x-auto-post.js` — swap a DeepSeek endpoint
- `score-alert.js` — swap a DeepSeek endpoint
- `analyze-alert.js` — swap a DeepSeek endpoint
- `weekly-newsletter.js` — swap a DeepSeek endpoint
- `send-outreach.js` — swap a DeepSeek endpoint

---

## 4. SWAP DATI FINANZIARI: Financial Datasets → SEC EDGAR + Finnhub

**Vecchio**: Financial Datasets API ($50-100/mese).
**Nuovo**: SEC EDGAR diretto ($0) + Finnhub free ($0).

**Come funziona**:
- Poll EDGAR RSS ogni 30s per nuovi Form 4 filing
- Parse XML di ogni filing: insider name, title, shares, price, date, ticker, transaction type
- Finnhub free per prezzo azioni corrente e profilo azienda

**Edge case da gestire nel parser XML**:
- Form 4/A (amended filing) — sovrascrive filing originale
- Derivative transactions (opzioni, RSU) — filtrare o flaggare separatamente
- Transazioni multiple per filing — ogni filing puo avere N transazioni
- Prezzo $0 — regali/opzioni esercitate, non sono veri "buy"

**File da modificare**:
- `sec-monitor.js` — cambiare fonte da Financial Datasets a EDGAR RSS + XML parsing
- Creare `edgar-parser.js` — parser XML Form 4 (~100-150 righe)
- `score-alert.js` — verificare che i campi input matchino il nuovo formato
- `analyze-alert.js` — verificare campi input

---

## 5. SWAP SEO: DataForSEO → Ahrefs Free + Google KP + Ubersuggest

**Vecchio**: DataForSEO ($50-100/mese).
**Nuovo**: Ahrefs Free + Google Keyword Planner + Ubersuggest free ($0).

**Come funziona**:
- Ahrefs Free Keyword Generator: KD score + related keywords (illimitato)
- Google Keyword Planner: volumi in range (account Ads $0 spend)
- Ubersuggest free: 3 ricerche/giorno con volume esatto

**Limitazione accettata**: volumi in range (1K-10K) non numeri esatti. Per sito nuovo basta.

**File da modificare**:
- `select-keyword.js` — cambiare fonte da DataForSEO API a scraping/API Ahrefs + GKP

---

## 6. SWAP X MONITORING: twitterapi.io List Polling ($26 → $6)

**Vecchio**: Poll individuale 25 account ogni 5 min ($26/mese).
**Nuovo**: X List timeline polling + frequenza variabile ($6/mese).

**Come funziona**:
- Crea una List privata su X con tutti i 25 account
- 1 singola API call restituisce i tweet recenti di TUTTI i membri
- Frequenza variabile:
  - Mercato aperto (9:30-16:00 EST, Lun-Ven): ogni 5 min
  - Extended hours (16-20): ogni 15 min
  - Notte + weekend: ogni 60 min

**File da modificare**:
- `x-engagement.js` — cambiare da poll individuale a List timeline endpoint

---

## 7. SWAP IMMAGINI: kie.ai → Puppeteer OG Cards ($10 → $0)

**Vecchio**: kie.ai Nano Banana Pro ($10/mese, 90 hero images AI).
**Nuovo**: Puppeteer OG cards come hero image ($0).

**Template**: sfondo dark navy, ticker symbol, verdict badge (colore per tipo), metriche chiave, branding InsiderBuying.ai. Stile Unusual Whales / Seeking Alpha.

**File da modificare**:
- `generate-image.js` — rimuovere kie.ai API call, usare solo Puppeteer screenshot
- Creare template HTML per hero image (se diverso da OG card)

---

## 8. MIGRARE: Airtable → NocoDB (BLOCCANTE PER IL LANCIO)

**Motivo**: Airtable free = 1,200 record. Con 50 alert/giorno colpisci il limite in 24 giorni. NocoDB e self-hosted sul VPS, illimitato, gratis.

**Tabelle da migrare**:
- `Insider_Alerts` (29 campi) → NocoDB
- `Monitor_State` (5 campi) → NocoDB
- Qualsiasi altra tabella Airtable usata dai workflow (X_Engagement_Log, Outreach_Log, Outreach_Prospects, ecc.)

**File da modificare** (tutti i file che chiamano Airtable API):
- `sec-monitor.js` — read/write Insider_Alerts + Monitor_State
- `score-alert.js` — update Insider_Alerts
- `analyze-alert.js` — update Insider_Alerts
- `write-persistence.js` — write Insider_Alerts
- `deliver-alert.js` — read Insider_Alerts
- `x-auto-post.js` — read/write X_Engagement_Log
- `x-engagement.js` — read/write X_Engagement_Log
- `send-outreach.js` — read/write Outreach_Prospects
- `find-prospects.js` — write Outreach_Prospects
- Qualsiasi altro file che importa/usa Airtable

**NocoDB API**: REST API compatibile, endpoint `GET/POST/PATCH /api/v2/tables/{tableId}/records`. Token auth via header `xc-token`.

**Priorita**: ALTA — fare PRIMA del lancio, altrimenti il sistema si rompe dopo 24 giorni.

---

## 9. VPS CONDIVISO: Hostinger Toxic or Nah ($20 → $0)

**Motivo**: VPS Hostinger gia pagato per Toxic or Nah. n8n e gia li. InsiderBuying aggiunge ~500MB RAM extra.

**Requisito**: VPS deve avere 4GB+ RAM totale.

**Azione**: Verificare RAM disponibile con `free -h` sul VPS. Se <4GB, serve upgrade VPS (Hetzner CX22 a $5.30/mese come alternativa dedicata).

---

## 10. RIDURRE: Reddit volume (17/giorno → 8-10/giorno)

**Motivo**: 17 reply/giorno dallo stesso account rischia shadowban su subreddit piccoli (r/Dividends, r/InsiderTrades). r/wallstreetbets tollera piu volume, altri no.

**Implementazione**: ridurre il cap in `reddit-monitor.js` da 17 a 8-10 reply/giorno. Distribuire tra subreddit diversi (max 2-3 reply per subreddit/giorno).

---

## 11. FIX: Rimuovere doppio sitemap (Q3 dalla sessione notturna)

**Motivo**: La sessione notturna ha tenuto sia `sitemap.ts` (runtime) che `next-sitemap` (build-time). Due sitemap confondono Google.

**Azione**: Rimuovere `sitemap.ts`, tenere solo `next-sitemap` (genera al build, include articoli dinamici).

**File da rimuovere**:
- `src/app/sitemap.ts` (o dovunque sia il sitemap runtime)

**File da verificare**:
- `next-sitemap.config.js` — assicurarsi che fetchi gli slug articoli da NocoDB al build time

---

## Riepilogo

| # | Modifica | Tipo | Priorita | Risparmio |
|---|---------|------|----------|-----------|
| 1 | Rimuovere Data Study (W3) | Rimuovere | Media | -$0.30/mese |
| 2 | Aggiungere Report Catalog (W17) | Nuovo workflow | Media | Revenue aggiuntiva |
| 3 | Smart routing Claude/DeepSeek | Swap AI | Alta | -$70-140/mese |
| 4 | EDGAR + Finnhub | Swap dati | Alta | -$50-100/mese |
| 5 | Ahrefs Free + GKP | Swap SEO | Alta | -$50-100/mese |
| 6 | X List polling | Swap monitoring | Alta | -$20/mese |
| 7 | Puppeteer hero images | Swap immagini | Media | -$10/mese |
| 8 | Airtable → NocoDB | Migrazione | **BLOCCANTE** | -$0-20/mese |
| 9 | VPS condiviso | Infra | Alta | -$20/mese |
| 10 | Reddit volume cap | Config | Bassa | Previene shadowban |

**Risultato**: da $62-77/mese → **$20/mese** con $30 margine per crescita.
