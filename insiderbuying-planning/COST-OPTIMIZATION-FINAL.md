# InsiderBuying.ai — Piano Costi Ottimizzato Finale

## Content Generation: Modello AI per Categoria

| # | Categoria | Cosa | Volume/mese | Modello | Costo/mese |
|---|-----------|------|-------------|---------|------------|
| 1 | **Articoli finanziari** | Blog post 800-3000 parole, dati SEC, verdict | 45 (1.5/giorno) | **Claude Sonnet** | ~$3.00 |
| 2 | **Report premium** | Report venduti su earlyinsider.com/reports | 8 | **Claude Sonnet** | ~$1.30 |
| 3 | **Lead Magnet PDF** | Aggiornamento mensile per subscriber newsletter | 1 | **Claude Sonnet** | ~$0.15 |
| 4 | **Reddit replies** | Risposte a post/commenti nei subreddit finance | 525 (17/giorno) | **Claude Sonnet** | ~$3.10 |
| 5 | **Reddit Daily Thread** | Commento analisi giornaliera nei thread fissi dei mod | 30 (1/giorno) | **Claude Sonnet** | ~$0.55 |
| 6 | **Reddit posts** | Post standalone nei subreddit target | 8 (1 ogni 3-4 giorni) | **Claude Sonnet** | ~$0.17 |
| 7 | **X replies** | Reply veloci (entro 3-5 min) ai 25 account finance | 525 (17/giorno) | **Claude Sonnet** | ~$3.00 |
| 8 | **X posts** | Tweet propri con dati insider, ticker, alert | 120 (4/giorno) | **DeepSeek V3.2** | ~$0.05 |
| 9 | **Alert scoring** | Score significatività 1-10 per ogni Form 4 filing | 1,500 | **DeepSeek V3.2** | ~$0.20 |
| 10 | **Alert analysis** | Testo analisi per alert score ≥4 | 600 | **DeepSeek V3.2** | ~$0.50 |
| 11 | **Newsletter** | Riassunto settimanale per Beehiiv | 4 | **DeepSeek V3.2** | ~$0.02 |
| 12 | **Outreach emails** | Email personalizzate a finance blogger | 200 | **DeepSeek V3.2** | ~$0.02 |

---

## Perché Claude vs DeepSeek per Ogni Riga

### Claude Sonnet (righe 1-7) — tutto ciò che viene letto da umani che possono detectare AI

- **Articoli + Report + Lead Magnet**: sono il prodotto. Gente PAGA per i report. Qualità massima non negoziabile
- **Reddit (tutto)**: i redditor di r/wallstreetbets e r/ValueInvesting sono i migliori AI detector al mondo. Un commento che puzza di bot = downvote + "nice ChatGPT comment bro" + shadowban dell'account. A 15-20 reply/giorno servono toni diversi per ogni subreddit (degenerato su WSB, analitico su ValueInvesting). Solo Sonnet cattura queste sfumature
- **X replies**: queste vanno sotto i tweet di gente con 50K-500K follower. Se la reply sembra un bot, il tuo account viene ignorato/bloccato. E siccome devi essere tra i primi 5-10 reply, la qualità deve essere alta al primo colpo. $3/mese per proteggere la credibilità dell'account è niente

### DeepSeek V3.2 (righe 8-12) — task dove il dato fa il lavoro, non la prosa

- **X posts**: i TUOI tweet. 280 char con "$NVDA: 3 insiders bought $12M this week." Il numero fa tutto
- **Alert scoring**: classificazione numerica pura, zero scrittura
- **Alert analysis**: testo breve e strutturato basato su dati
- **Newsletter**: template con teaser 2 frasi per articolo
- **Outreach**: 150 parole, formula semplice

---

## Riepilogo Costi AI

| Tier | Modello | Costo/mese |
|------|---------|------------|
| Tier 1 | Claude Sonnet 4.6 (con prompt caching) | **~$11** |
| Tier 2 | DeepSeek V3.2 | **~$1** |
| **Totale AI** | | **~$12/mese** |

---

## Tutti i Costi: Vecchio Piano vs Nuovo Piano

### Costi a pagamento

| # | Voce | Vecchio Costo | Nuovo Costo | Soluzione | Impatto qualità |
|---|------|---------------|-------------|-----------|----------------|
| 1 | **VPS** | $20 | **$0** | Condividi Hostinger esistente (Toxic or Nah). n8n + NocoDB + Puppeteer + 16 workflow InsiderBuying. ~500MB RAM extra, serve VPS con 4GB+ | Nessuno (1/10) |
| 2 | **X/Twitter monitoring** | $26 | **$6** | twitterapi.io con List timeline polling (1 call per tutti i 25 account) + frequenza variabile: ogni 5 min mercato aperto, 15 min extended, 60 min notte/weekend | Nessuno (1/10) — stessi dati, stessa latenza durante mercato |
| 3 | **Immagini hero blog** | $10 | **$0** | Puppeteer OG cards come hero image. Template: sfondo dark navy, ticker symbol, verdict badge, metriche chiave, branding InsiderBuying.ai. Puppeteer già sul VPS per OG image generation | Minimo (2/10) — finance blog preferiscono dati visuali a immagini AI generiche |
| 4 | **AI — Claude Sonnet 4.6** | — | **$11** | Articoli finanziari, report premium, lead magnet PDF, Reddit (replies + daily thread + posts), X replies. Con prompt caching (90% risparmio input) | Massima qualità dove serve |
| 5 | **AI — DeepSeek V3.2** | — | **$1** | X posts, alert scoring, alert analysis, newsletter, outreach emails. Con batch API (50% sconto) per task non real-time | Sufficiente — task dove il dato fa il lavoro, non la prosa |
| 6 | **Cloudflare R2** | $2 | **$2** | Storage permanente per video, immagini, asset. Nessuna alternativa migliore | N/A |
| | **Subtotale pagamento** | **$62-77** | **$20** | | |

### Costi $0 (free tier / government data)

| # | Voce | Servizio | Cosa fa | Limite free | Quando lo colpisci |
|---|------|----------|---------|-------------|-------------------|
| 7 | **Database + Auth** | Supabase | PostgreSQL + auth utenti + API REST | 500MB DB, 50K auth users | Anni |
| 8 | **Hosting frontend** | Netlify | Next.js SSR, CDN, deploy automatico | 100GB bandwidth/mese | ~50K visite/mese |
| 9 | **Email transazionali** | Resend | Alert email ai Pro subscriber + email verifica/reset | 100 email/giorno | **50 Pro user x 3 alert = 150/giorno → mese 2-3** |
| 10 | **Push notifications** | OneSignal | Push browser/mobile per alert real-time | 10K subscriber | Anni |
| 11 | **Newsletter** | Beehiiv | Newsletter settimanale, landing page, analytics | 2,500 subscriber | 6-12 mesi |
| 12 | **Dati prezzo azioni** | Finnhub | Quote real-time, profilo azienda, fundamentals | 60 call/min | Mai (volume basso) |
| 13 | **Dati SEC filing** | SEC EDGAR | RSS feed Form 4 + XML parsing diretto | Illimitato (government data) | Mai |
| 14 | **SEO keyword research** | Ahrefs Free + Google KP + Ubersuggest | KD score, volume (range), related keywords, 3 ricerche/giorno esatte | Illimitato (Ahrefs/GKP), 3/giorno (Ubersuggest) | Mai |
| 15 | **Content DB** | NocoDB (self-hosted) | Database contenuti, workflow state, log engagement. Rimpiazza Airtable | Illimitato (self-hosted sul VPS) | Mai |
| 16 | **Payments** | Stripe | Subscription Pro $24/mese o $228/anno | 2.9% + $0.30 per transazione (nessun costo fisso) | Mai — Stripe non ha fee mensili |
| | **Subtotale free** | | | **$0** | |

### NON usiamo (eliminati dal piano)

| Voce | Vecchio Costo | Perché eliminato | Rimpiazzato da |
|------|---------------|------------------|----------------|
| Financial Datasets API | $50-100 | EDGAR è la fonte originale, Financial Datasets prende da lì | SEC EDGAR diretto (RSS + XML) + Finnhub free |
| DataForSEO | $50-100 | Per sito nuovo i range bastano, volume esatto non serve | Ahrefs Free + Google KP + Ubersuggest |
| X API Basic tier | $200 | Quota 50K tweet/mese si esaurisce in ore con 25 account | twitterapi.io con List polling ($6/mese) |
| kie.ai Nano Banana | $10 | Finance blog non hanno bisogno di immagini AI generate | Puppeteer OG cards ($0) |
| Airtable | $0 ora, $20 dopo 24 giorni | 1,200 record limit, con 50 alert/giorno esplode in 24 giorni | NocoDB self-hosted ($0, illimitato) |
| VPS dedicato | $20 | Hostinger già pagato per Toxic or Nah, ha spazio | VPS condiviso ($0 incrementale) |

---

## Tabella Costi Finale

| Voce | Costo/mese |
|------|------------|
| VPS (shared Hostinger) | $0 |
| twitterapi.io (List poll + frequenza variabile) | $6 |
| Claude Sonnet 4.6 (articoli, report, lead magnet, Reddit, X replies) | $11 |
| DeepSeek V3.2 (X posts, alert, newsletter, outreach) | $1 |
| Cloudflare R2 | $2 |
| Puppeteer OG cards (hero images) | $0 |
| Supabase + Netlify + Resend + OneSignal + Beehiiv | $0 |
| Finnhub + SEC EDGAR + SEO tools | $0 |
| NocoDB (self-hosted, rimpiazza Airtable) | $0 |
| Stripe | $0 fisso (solo % su transazioni) |
| **TOTALE** | **~$20/mese** |

**Budget: $50/mese. Margine: $30 per crescita futura.**

Quando il business cresce, i primi upgrade saranno:
- **Resend** → $20/mese (Growth tier, 50K email/mese) — quando hai ~50 Pro subscriber
- **Beehiiv** → $39/mese (Scale tier) — quando superi 2,500 subscriber newsletter
- Entrambi coperti dalla revenue Pro a quel punto

---

## Dettagli Ottimizzazioni

### 1. VPS — da $20 → $0
Condividi il VPS Hostinger che già paghi per Toxic or Nah. n8n è già lì, NocoDB + 16 workflow extra = ~500MB RAM in più. Se il VPS ha 4GB+ RAM, ci sta. Alternativa dedicata: Hetzner CX22 a $5.30/mese.

### 2. X/Twitter Monitoring — da $26 → $6
X List timeline polling. Crei una List privata con tutti i 25 account. Una singola API call restituisce i tweet recenti di TUTTI i membri. Combinato con frequenza variabile:
- Mercato aperto (9:30-16:00 EST, Lun-Ven): ogni 5 min
- Extended hours (16-20): ogni 15 min
- Notte + weekend: ogni 60 min

### 3. Immagini — da $10 → $0
Puppeteer OG cards come hero image. Template: sfondo dark navy, ticker symbol, verdict badge, metriche chiave, branding. È quello che fanno Unusual Whales e Seeking Alpha.

### 4. AI — Smart Routing con Prompt Caching
Claude Sonnet con prompt caching: il system prompt (~3K token) viene cachato dopo la prima call. Cache read = $0.30/1M vs $3/1M input normale = 90% risparmio su input ricorrente.

### 5. SEC EDGAR — $0 (confermato)
XML parsing Form 4 robusto. Edge case da gestire: Form 4/A (amended), derivative transactions, transazioni multiple per filing, prezzo $0 (regali/opzioni).

### 6. SEO — $0 (confermato)
Ahrefs Free + Google Keyword Planner (range) + Ubersuggest free (3/giorno, volume esatto). Per sito nuovo i range bastano.

### 7. Airtable → NocoDB — CRITICO
Free tier Airtable = 1,200 record. Con 50 alert/giorno colpisci il limite in 24 giorni. Migrare TUTTO a NocoDB (self-hosted, unlimited) prima del lancio.

---

## Warning: Limiti Free Tier da Monitorare

| Servizio | Limite Free | Quando lo colpisci |
|----------|-------------|-------------------|
| Resend | 100 email/giorno | 50 Pro user × 3 alert = 150/giorno → mese 2-3 |
| Beehiiv | 2,500 subscriber | 6-12 mesi |
| Supabase | 500MB DB | Anni |
| Netlify | 100GB bandwidth | ~50K visite/mese |
| Airtable | 1,200 record | **24 GIORNI** → migrare a NocoDB |

Quando colpisci Resend/Beehiiv avrai già revenue dai subscriber Pro per coprire l'upgrade.
