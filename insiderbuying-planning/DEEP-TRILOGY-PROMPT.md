# Prompt per /deep-project

Copia tutto sotto la linea `---` e incollalo dopo aver invocato `/deep-project` in una nuova chat.

---

## Progetto: EarlyInsider Content Engine — Implementazione Completa

### Cosa Stiamo Facendo

Abbiamo un SaaS di insider trading intelligence (EarlyInsider.com) con 16+ workflow n8n che generano ~2,500 pezzi di contenuto al mese su 12 categorie. Il codice esiste gia (7 planning unit completati, 515 test passano), ma ha 130 gap di qualita + 11 modifiche infrastrutturali + 27 nuovi tools/metodologie da integrare.

Abbiamo completato 2 round di deep research (10 ricerche parallele su 5 modelli AI) che hanno prodotto:
- Framework qualita 10/10 per ogni categoria
- Prompt ottimali con esempi concreti
- Workflow n8n dettagliati nodo per nodo
- Content strategy (cosa pubblicare, mix, frequenza)
- 15 template visual con design system
- Formula deterministica per alert scoring
- Tools e metodologie gratuite

Ora dobbiamo implementare TUTTO.

### File di Riferimento (LEGGILI TUTTI)

| # | File | Cosa contiene | Perche leggerlo |
|---|------|--------------|-----------------|
| 1 | `ryan_cole/insiderbuying-planning/WORKFLOW-CHANGES.md` | **MASTER FILE** — Tutte le modifiche: Parte A (11 infra), Parte B (130 gap), Parte C (completato), Parte D (27 tools/metodologie), Ordine implementazione P0-P4 | E la roadmap completa. LEGGILO INTERO. |
| 2 | `ryan_cole/insiderbuying-planning/PROMPT-WORKFLOW-FRAMEWORK.md` | Prompt concreti, workflow n8n, quality gate, content strategy per TUTTE 12 le categorie | Contiene i prompt da implementare nel codice |
| 3 | `ryan_cole/insiderbuying-planning/CONTENT-QUALITY-FRAMEWORK.md` | Parametri 10/10 per ogni categoria (target di qualita) | Definisce COSA deve produrre ogni workflow |
| 4 | `ryan_cole/insiderbuying-planning/CONTENT-GAPS-ALL.md` | 130 gap specifici con file:linea e fix esatto per ogni gap | Mappa precisa di cosa cambiare in ogni file |
| 5 | `ryan_cole/insiderbuying-planning/COST-OPTIMIZATION-FINAL.md` | Piano costi ottimizzato ($20/mese), AI routing Claude/DeepSeek | Vincoli di costo e scelta provider AI |
| 6 | `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/` | TUTTI i file di codice attuali (10 file JS) | Il codice da modificare |
| 7 | `ryan_cole/insiderbuying-site/package.json` | Dipendenze attuali | Per sapere cosa installare |

### Architettura Attuale

- **Frontend**: Next.js 16 su Netlify, React 19, TypeScript, Tailwind v4
- **Backend**: n8n self-hosted su VPS Hostinger (condiviso con altro progetto)
- **Database**: Supabase (auth + DB) + NocoDB (content DB, rimpiazza Airtable)
- **AI**: Claude Sonnet 4.6 (contenuto pubblico ~$11/mese) + DeepSeek V3.2 (task interni ~$1/mese)
- **Dati**: SEC EDGAR (Form 4 RSS + XML parsing) + Finnhub free + Alpha Vantage free
- **Visual**: Puppeteer screenshot server + Chart.js + node-canvas (server-side PNG)
- **X Monitoring**: twitterapi.io List polling ($6/mese)
- **Email**: Resend free tier + Gmail SMTP per outreach
- **Push**: OneSignal free tier
- **Newsletter**: Beehiiv free tier
- **PDF**: WeasyPrint (Python)
- **Storage**: Cloudflare R2

### I 10 File di Codice da Modificare

```
n8n/code/insiderbuying/
  generate-article.js      — CAT 1: Articoli blog SEO
  generate-report.js       — CAT 2: Report premium PDF
  generate-lead-magnet.js  — CAT 3: Lead magnet PDF mensile
  reddit-monitor.js        — CAT 4+5+6: Reddit replies + daily thread + DD posts
  x-engagement.js          — CAT 7: X replies
  x-auto-post.js           — CAT 8: X posts
  score-alert.js            — CAT 9: Alert scoring
  analyze-alert.js          — CAT 10: Alert analysis
  weekly-newsletter.js      — CAT 11: Newsletter
  send-outreach.js          — CAT 12: Outreach emails
```

Piu file NUOVI da creare:
```
  edgar-parser.js           — Parser XML Form 4 SEC EDGAR (NUOVO)
  generate-chart.js         — Generazione grafici Chart.js server-side (NUOVO)
  visual-templates.js       — 15 template HTML per visual card/chart (NUOVO)
  content-calendar.js       — Content calendar + freshness checker (NUOVO)
```

### Le Modifiche da Implementare (Raggruppate per Priorita)

#### P0 — BLOCCANTI (fare prima di tutto)
- **A8**: Migrare TUTTI i file da Airtable API a NocoDB API (9 file coinvolti)
- **12.14**: Rimuovere URL dal prompt outreach email (viola regola zero-link)

#### P1 — FONDAMENTA (abilitano tutto il resto)
- **D1.1**: Installare Chart.js + node-canvas sul VPS
- **D1.2**: Installare WeasyPrint sul VPS
- **A3**: Swap AI provider in tutti i file (Claude endpoint per CAT 1,2,3,4,5,6,7 — DeepSeek endpoint per CAT 8,9,10,11,12)
- **A4**: Creare `edgar-parser.js` — parser XML Form 4 SEC EDGAR + modificare `sec-monitor.js`
- **D2.1**: Integrare Alpha Vantage free per earnings calendar (serve per "What to Watch")

#### P2 — VISUAL + CATEGORIE CRITICHE
- **V.1-V.3 + D6**: Creare `generate-chart.js` + `visual-templates.js` — 15 template visual con design system dark navy
- **CAT 4**: Riscrivere prompt Reddit con `SUBREDDIT_TONE_MAP` (5 toni), word limit per sub, structure rotation, daily cap, timing delay, upvoting
- **CAT 7**: Riscrivere X replies con data enrichment, 3 archetipi (Data Bomb/Contrarian/Pattern), screenshot SEC, $CASHTAG, engagement farming
- **CAT 5**: Creare Reddit Daily Thread (NUOVO) — 3 template, pre-market scheduling, weekend recap
- **CAT 6**: Creare Reddit DD Post (NUOVO) — multi-step generation, bear case separato, TLDR last, Imgur upload, AMA comment
- **CAT 9**: Scoring deterministico con formula pesata (6 fattori) + AI refinement ±1 + calibrazione settimanale

#### P3 — QUALITA E MEDIA
- **CAT 1**: Article quality gates (persona nominata, multi-step outline→draft, 14 check, visual placeholders, freshness checker, readability FK 30-50)
- **CAT 2**: Report Premium riscrittura (9 sezioni sequenziali, exec summary last, bear case separato, 5 grafici, WeasyPrint PDF, 5-page preview)
- **CAT 8**: X Posts (4 formati in rotazione, media allegato sempre, 4 slot giornalieri, quote-retweet scheduling, MAX_DAILY=4)
- **CAT 11**: Newsletter (implementare data layer, 6 sezioni, tono "smart friend", A/B subject, segmentazione Free/Pro, P.S. CTA)
- **D7**: Content calendar NocoDB + competitive intelligence RSS

#### P4 — POLISH
- **CAT 3**: Lead Magnet (espandere a 12-15 pagine, losers >500 parole, math verification, 3 grafici, Quick Wins page)
- **CAT 10**: Alert analysis (lunghezza variabile per score, "What to Watch" con data catalyst, prezzo corrente, banned phrases)
- **CAT 12**: Outreach (Cheerio scraping prospect blog, 3 follow-up, warm-up progressivo, email verification, subject domanda)
- **A5-A7, A9-A11**: Swap SEO tools, X monitoring list poll, immagini Puppeteer, VPS condiviso, doppio sitemap

### Vincoli

1. **Budget**: ~$20/mese totale. Claude Sonnet per contenuto pubblico, DeepSeek per task interni. Zero nuovi servizi a pagamento.
2. **Test runner**: Jest (`npx jest`), test in `tests/insiderbuying/`. Ogni modifica deve avere test.
3. **n8n Code Node**: JavaScript puro (no ES modules, no import — usa `require()`). No `fetch` globale — usa `require('https')`.
4. **Target dir**: `ryan_cole/insiderbuying-site/`
5. **Commit per sezione**: ogni sezione completata = 1 commit.
6. **I prompt da usare sono in** `PROMPT-WORKFLOW-FRAMEWORK.md` — non inventarne di nuovi, usa quelli.

### Come Decomporre il Progetto

Suggerisco queste planning unit (ma tu puoi riorganizzare se ha piu senso):

1. **01-airtable-to-nocodb** — Migrazione Airtable → NocoDB (P0, bloccante)
2. **02-visual-engine** — Chart.js + 15 template visual + design system (P1-P2)
3. **03-data-pipeline** — EDGAR parser + Finnhub + Alpha Vantage integration (P1)
4. **04-ai-provider-swap** — Claude + DeepSeek endpoint swap in tutti i file (P1)
5. **05-reddit-engine** — CAT 4 (tone matching) + CAT 5 (daily thread NUOVO) + CAT 6 (DD NUOVO) (P2)
6. **06-x-engine** — CAT 7 (replies con archetipi) + CAT 8 (posts con media) (P2-P3)
7. **07-scoring-analysis** — CAT 9 (formula deterministica) + CAT 10 (What to Watch) (P2-P3)
8. **08-content-generation** — CAT 1 (articles) + CAT 2 (reports) + CAT 3 (lead magnet) (P3-P4)
9. **09-newsletter-outreach** — CAT 11 (newsletter 6 sezioni) + CAT 12 (outreach 3 follow-up) (P3-P4)
10. **10-content-ops** — Content calendar, freshness checker, competitive intelligence, final polish (P4)

Ogni unit dovrebbe avere 4-8 sezioni per /deep-plan.

### Elementi Aggiuntivi da Integrare (scoperti dopo la stesura iniziale)

#### Report Cover Generation (va in unit 02-visual-engine o 08-content-generation)

4 template cover per i report PDF, tutti HTML/CSS → Puppeteer → PNG:

**Template A — Single Stock ($14.99)**: Dark navy full bleed. Ticker 64px hero. Verdict badge glassmorphism (verde BUY / rosso SELL / giallo HOLD). 3 metric card (prezzo, market cap, insider signal 1-5). Hook thesis italic. Abstract network pattern bottom. Company logo da Brandfetch in alto.

**Template B — Sector ($19.99)**: Due zone — editoriale sopra (nome settore + titolo creativo tipo "The AI Arms Race: Who Wins the Next $500B Cycle"), data grid sotto con 6 stock card (ticker + verdict + upside). Gradient bar blu→verde come divisore. Label "SECTOR ANALYSIS" in giallo.

**Template C — Bundle ($24.99-$29.99)**: Hero metric bar glassmorphism (total insider purchases, avg upside, % rated BUY). 10 ticker pill colorati (2 righe da 5, bordo verde/rosso/giallo per verdict). Titolo enfatizza collezione. Page count prominente.

**Template D — Hero Featured (pagina /reports)**: Formato largo 16:9 per web (non PDF). Mesh gradient glows background. Badge "FEATURED REPORT" giallo. Titolo editoriale + 3 glassmorphism stat card. Ticker pill preview + CTA button "READ THE FULL REPORT".

Design system cover: `#0A1128` bg, `#1A2238` secondary, Inter font, glassmorphism card (`rgba(26,34,56,0.6)`, `backdrop-filter: blur(12px)`, `border: 1px solid rgba(255,255,255,0.08)`).

#### Company Logo System (va in unit 02-visual-engine)

**Brandfetch API** (gratuito, no attribution richiesta, 60M+ brand): `https://brandfetch.com/api`. Usato per i riquadri dei report single-stock (NVDA, AAPL, MSFT) e nelle Data Card / visual template ovunque serva il logo aziendale.

Per report non-single-ticker (settore, bundle, S&P 500): generare riquadro con testo abbreviato (es. "AI", "S&P", "DIV") su sfondo brand color, stile UI Avatars.

#### CEO/Insider Photo System (va in unit 02-visual-engine)

Sistema a 3 livelli per le foto degli insider (CEO, CFO, Director):

1. **Wikidata P18** (gratis, CC-BY-SA): Query SPARQL per CEO famosi. ~15-20% coverage. URL: `https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width=300`

2. **Google Knowledge Graph** (gratis, 100K req/giorno): Fallback per insider non su Wikidata. `GET https://kgsearch.googleapis.com/v1/entities:search?query={name}+CEO&types=Person`. Verificare licensing per immagine.

3. **UI Avatars** (gratis, zero setup): Fallback per il ~80% degli insider senza foto pubblica. Genera riquadro con iniziali: `https://ui-avatars.com/api/?name={firstName}+{lastName}&background=0A1128&color=fff&size=128&bold=true`

Le foto/iniziali vanno usate in: Data Card (Template 1), SEC Filing Mini Card (Template 2), Report cover, Alert email, Insider Transaction Table (Template 4).

**Implementazione**: Creare funzione `getInsiderPhoto(name, title)` che prova Wikidata → Google KG → UI Avatars in cascata. Cachare risultato in NocoDB per evitare lookup ripetuti.
