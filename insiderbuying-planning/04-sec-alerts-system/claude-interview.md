# Interview Transcript — 04 SEC Alerts System

## Q1: Come fetchare i Form 4 dalla Financial Datasets API?

**Domanda**: La Financial Datasets API richiede un ticker per ogni query, non ha un endpoint bulk. Quale strategia preferisci?

**Opzioni presentate**:
1. Ibrido: SEC EDGAR RSS gratuito + Financial Datasets per dettagli
2. Watchlist S&P 500 (500 ticker ogni 15 min)
3. Investigare endpoint bulk non documentato

**Risposta utente**: "Qual'è la migliore? Spiegami pro e contro."

**Analisi fornita e decisione**:
- Opzione 1 (Ibrido) raccomandata — SEC EDGAR RSS è la stessa fonte usata da WhaleWisdom e Insider Monkey (servizi top-tier). Latenza < 1 min dalla pubblicazione del filing. Zero costo per il feed RSS. Financial Datasets usato solo per arricchire i filing scoperti (non query cicliche su 500 ticker).
- Opzione 2 costosa in API calls e ridondante
- **Decisione finale**: Ibrido (RSS + Financial Datasets per enrichment)

---

## Q2: Le tabelle Supabase/Airtable esistono già?

**Risposta utente**: "Non mi ricordo, controlla tu."

**Risultato ricerca**: Migration file `20260326000000_insiderbuying_schema.sql` esiste ed è completo. Tabelle definite:
- `profiles` (subscription_tier: free/pro)
- `subscriptions` (status: active/canceled/past_due/trialing)
- `insider_alerts` (ticker, company_name, insider_name, insider_title, transaction_type, shares, price_per_share, total_value, filing_date, significance_score, ai_analysis, cluster_id, is_cluster_buy, raw_filing_data JSONB, created_at)
- `user_alert_preferences` (user_id, email_enabled, push_enabled, min_significance_score, watched_tickers text[], sectors text[])
- Realtime già abilitato su `insider_alerts`
- RLS policies già definite

**Status**: Schema SQL pronto ma NON eseguito su Supabase prod — va applicato (oppure già fatto nella sezione 01).

---

## Q3: Come distinguiamo Free vs Pro in W5?

**Risposta utente**: "Supabase subscriptions table"

**Decisione**: W5 query `profiles.subscription_tier = 'pro'` (campo diretto, evita JOIN) o `subscriptions WHERE status='active'`. Usare `profiles.subscription_tier` per semplicità — aggiornato dallo Stripe webhook.

---

## Q4: Track record insider — quanto approfondito?

**Domanda**: Verificare solo il numero di acquisti passati o controllare se i trade hanno preceduto rally?

**Risposta utente**: "Dettagliata, ma quanto ci costa al mese?"

**Analisi costi**:
- Yahoo Finance public API per price check: GRATUITO (zero key)
- Volume: ~600 price check/mese (solo filing score >= 4)
- Costo extra: $0/mese

**Decisione finale**: Track record dettagliata con Yahoo Finance (gratuito) per verificare rally post-acquisto. Logica: prendi filing passati dell'insider da Supabase, confronta prezzo filing_date con prezzo +30gg, calcola hit rate %.

---

## Q5: Scheduling W4 — frequenza?

**Domanda**: Due workflow separati vs uno con logica interna?

**Risposta utente**: "Due workflow separati, quanto ci costano?"

**Analisi costi**: Nessun costo aggiuntivo — n8n self-hosted. I due workflow Schedule trigger sono gratuiti.

**Decisione finale**: Due workflow n8n:
- W4-market: schedule ogni 15 min, attivo 9:30-16:00 EST (Mon-Fri)
- W4-afterhours: schedule ogni 60 min, attivo fuori market hours + weekend

---

## Q6: OneSignal già installato sul sito?

**Risposta utente**: "Non so."

**Risultato ricerca**: OneSignal è GIÀ integrato:
- Componente `OneSignalInit.tsx` in layout.tsx (caricato su ogni pagina)
- Package `react-onesignal` installato
- Middleware esclude già `OneSignalSDKWorker.js` dal redirect auth
- `NEXT_PUBLIC_ONESIGNAL_APP_ID` env var già presente

**Status**: OneSignal SDK già caricato. Service worker: verificare se `OneSignalSDKWorker.js` è nel `/public` folder del sito.

---

## Q7: Blur logic della AI analysis già implementata?

**Risposta utente**: "Non so, controlla tu."

**Risultato ricerca**: La blur CSS esiste nella `/alerts page` (linea 220: `blur-[4px] select-none`), ma è STATICA — applica il blur a TUTTI gli utenti indipendentemente dal tier.

**Da implementare**: Aggiungere check `user.subscription_tier === 'pro'` per mostrare ai_analysis senza blur agli utenti Pro.

---

## Q8: Claude API Key configurata in n8n?

**Risposta utente**: "Non lo so, controlla tu."

**Risultato ricerca**: `CLAUDE_API_KEY=` definita nel `.env` del sito ma **vuota** (no valore). Nell'environment n8n VPS: da verificare/aggiungere. La sezione 01-infrastructure spec elenca `CLAUDE_API_KEY=` come env var da configurare.

**Azione necessaria**: Aggiungere `CLAUDE_API_KEY=<key>` ai docker-compose env vars del VPS n8n.

---

## Q9: Error handling per W4?

**Domanda**: Cosa fare se Financial Datasets API fallisce?

**Risposta utente**: "Entrambi" (retry 3x + Telegram alert se > 5 errori)

**Decisione finale**:
- Retry 3x con exponential backoff (1s, 3s, 9s)
- Se il filing fallisce definitivamente: log in Airtable con status='failed', continue
- Se > 5 filing falliscono in una singola run → send Telegram message al chat del content pipeline (stesso bot)

---

## Q10: Cluster detection — re-alert gli utenti?

**Domanda**: Quando 2+ insider comprano stesso titolo in 7gg, mandate un secondo alert?

**Risposta utente**: "Sì, manda un secondo alert 'CLUSTER DETECTED'"

**Decisione finale**: Quando viene rilevato un cluster:
1. Aggiorna i filing esistenti con `cluster_id` e `is_cluster_buy = true`
2. Crea un NUOVO record in `insider_alerts` di tipo "cluster" (transaction_type = 'cluster')
3. Invia nuovo alert W5 con subject "🔥 CLUSTER BUY DETECTED: {ticker} — {N} insiders"
4. Significance score del cluster = max(score singoli) + 3 (come da spec)

---

## Q11: Airtable base — creare o usare esistente?

**Risposta utente**: "Va creata: includi la struttura completa nel piano"

**Decisione finale**: Il piano include la struttura completa dell'Airtable Insider_Alerts table con tutti i campi.

---

## Decisioni finali riassunte

| Decisione | Scelta |
|---|---|
| API strategy | Ibrido: SEC EDGAR RSS + Financial Datasets enrichment |
| Dedup key | Composite: ticker + insider_name + transaction_date + transaction_shares |
| Track record | Dettagliata via Yahoo Finance (gratuito) |
| Scheduling | Due workflow: W4-market (15min) + W4-afterhours (60min) |
| Error handling | Retry 3x + Telegram alert se > 5 errori/run |
| Cluster alerts | Nuovo alert separato "CLUSTER DETECTED" |
| Free vs Pro detection | profiles.subscription_tier via Supabase service role |
| OneSignal status | Già integrato nel sito (react-onesignal) |
| Blur logic | Esiste ma non subscription-aware — va aggiornata |
| Airtable base | Creare da zero con struttura completa nel piano |
| Claude API in n8n | Aggiungere ANTHROPIC_API_KEY all'env VPS |
