# Prompt per creare la skill /business-engine

Copia tutto sotto la linea `---` e incollalo in una nuova chat Claude Code.

---

## Task

Devo creare una Claude Code skill chiamata `/business-engine` — un framework completo per partire da un'idea e arrivare ad avere tutto sviluppato e ottimizzato nelle minime parti. Applicabile a QUALSIASI business idea.

Questo framework standardizza un processo che ho gia testato e perfezionato sul progetto EarlyInsider.com (insider trading SaaS). Ogni fase ha prodotto deliverable concreti e funzionanti. Ora devo trasformarlo in un framework riutilizzabile.

## Il Processo Completo (testato su EarlyInsider)

```
/business-engine @idea

FASE 0 — Idea Validation
FASE 1 — Psychological Framework
FASE 2 — Product Architecture
FASE 3 — Cost Optimization
FASE 4 — Content Engine (Ricerca 1: Parametri 10/10)
FASE 5 — Content Engine (Ricerca 2: Come raggiungere il 10/10)
FASE 6 — Growth Engine
FASE 7 — Implementation (deep-plan → deep-implement)
FASE 8 — Optimization Loop
```

## I 2 Prompt di Ricerca Testati (DA STANDARDIZZARE)

Ho 2 prompt di ricerca che funzionano eccezionalmente bene. Vengono lanciati in parallelo su 5 modelli AI (Gemini Flash, Gemini Flash-Lite, OpenAI gpt-4.1-mini, Perplexity sonar-deep-research, Claude Opus) e i risultati vengono cross-referenziati per creare il framework definitivo.

Questi 2 prompt sono il CUORE del sistema. Devono essere standardizzati come template con variabili, mantenendo ESATTAMENTE la stessa struttura e livello di dettaglio.

### PROMPT DI RICERCA 1 — "Parametri 10/10"
File originale: `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-CONTENT-QUALITY.md`
**Leggi questo file INTERO.** Questo prompt definisce COSA deve avere ogni categoria di contenuto per essere 10/10. Le 5 domande per categoria sono:
1. Best-in-class (chi e come)
2. Algoritmo/piattaforma (cosa premia e penalizza)
3. AI/Bot detection (come evitare)
4. Conversione (cosa funziona)
5. Errori fatali (cosa NON fare mai)

Piu domande specifiche per ogni categoria individuale.

Output: parametri 10/10 definitivi per ogni categoria con consensus multi-modello.

### PROMPT DI RICERCA 2 — "Come raggiungere il 10/10"
File originale: `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-PROMPTS-WORKFLOWS.md`
**Leggi questo file INTERO.** Questo prompt definisce COME raggiungere il 10/10 per ogni categoria. Copre 5 aree:
1. **Prompt design** — system prompt, user prompt, few-shot examples, output format
2. **n8n Workflow Architecture** — nodi, branching, retry, validazione, step paralleli vs sequenziali
3. **Content Strategy** — COSA pubblicare, mix topic, frequenza, timing, selezione argomenti
4. **Tools/Metodologie/Risorse** — API gratuite, librerie, prompt techniques, anti-AI detection (vincolo: max $5-10/mese extra totale)
5. **Visual Template Design** — layout, colori, HTML/CSS per ogni tipo di visual

Piu domande specifiche per ogni categoria e per ogni template visual.

Output: prompt concreti copiabili, workflow n8n dettagliati, content calendar, lista tools.

## Framework Esistenti da Integrare

### Framework Psicologico (GIA ESISTENTE)
File: `ryan_cole/PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md`
**Leggi questo file INTERO.** 10 fasi complete: input → deep research (3 ricerche parallele) → sintesi strategica (core insight, 3 pilastri psicologici, tone of voice) → trust architecture (5 layer) → conversion architecture (4 gate) → page-by-page strategy → naming → emotional journey → anti-pattern → metriche.

## File da Leggere (TUTTI)

Questi file sono i deliverable reali prodotti per EarlyInsider. Servono come ESEMPIO di cosa il framework deve produrre:

| # | File | Cosa e | Ruolo nel framework |
|---|------|--------|-------------------|
| 1 | `ryan_cole/PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md` | Framework psicologico 10 fasi | FASE 1 — template |
| 2 | `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-CONTENT-QUALITY.md` | Prompt ricerca 1 (parametri 10/10) | FASE 4 — template prompt |
| 3 | `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-PROMPTS-WORKFLOWS.md` | Prompt ricerca 2 (come raggiungere 10/10) | FASE 5 — template prompt |
| 4 | `ryan_cole/insiderbuying-planning/CONTENT-QUALITY-FRAMEWORK.md` | Output ricerca 1 (framework qualita) | FASE 4 — esempio output |
| 5 | `ryan_cole/insiderbuying-planning/CONTENT-GAPS-ALL.md` | Gap analysis (130 gap) | FASE 7 — esempio output |
| 6 | `ryan_cole/insiderbuying-planning/WORKFLOW-CHANGES.md` | Piano modifiche completo | FASE 7 — esempio output |
| 7 | `ryan_cole/insiderbuying-planning/COST-OPTIMIZATION-FINAL.md` | Ottimizzazione costi ($350→$20) | FASE 3 — esempio output |
| 8 | `ryan_cole/insiderbuying-planning/run-deep-research.py` | Script ricerche parallele 5 AI | Utility — da generalizzare |
| 9 | `ryan_cole/insiderbuying-planning/research-results/` | Output 5 ricerche parallele | Esempio risultati grezzi |
| 10 | `ryan_cole/insiderbuying-planning/MANUAL-STEPS.md` | Checklist step manuali | FASE 7 — esempio output |
| 11 | `ryan_cole/insiderbuying-planning/QUESTIONS.md` | Decisioni autonome documentate | Template per decisioni |
| 12 | `ryan_cole/earlyinsider-psychological-framework.md` | Framework psicologico EarlyInsider | FASE 1 — esempio output |

## Come Deve Funzionare la Skill

### Struttura della skill
```
~/.claude/skills/business-engine/
  skill.md                          — entry point della skill
  templates/
    research-1-quality-params.md    — template prompt ricerca 1 (standardizzato)
    research-2-implementation.md    — template prompt ricerca 2 (standardizzato)
    psychological-framework.md      — template framework psicologico
  scripts/
    run-deep-research.py            — script ricerche parallele (generalizzato)
    cross-reference-results.py      — script per cross-referenziare risultati
```

### I template di ricerca

I 2 prompt di ricerca (file #2 e #3 sopra) devono essere convertiti in template con variabili. Le variabili sono:

```
{{BUSINESS_NAME}}          — nome del business/brand
{{BUSINESS_DESCRIPTION}}   — cosa fa (1-2 frasi)
{{PRODUCTS}}               — lista prodotti con pricing
{{TARGET_AUDIENCE}}        — chi e il target (eta, comportamento, cosa usano)
{{CHANNELS}}               — canali di distribuzione (blog, X, Reddit, newsletter, ecc.)
{{AI_STACK}}               — quali AI model usa e per cosa
{{INFRASTRUCTURE}}         — stack tecnico (Next.js, n8n, Supabase, ecc.)
{{BUDGET_CONSTRAINT}}      — budget massimo mensile
{{CONTENT_CATEGORIES}}     — tabella categorie di contenuto (generata in FASE 2)
{{CONTENT_TYPES}}          — tipi di contenuto (insider activity, earnings, ecc.)
{{VISUAL_TEMPLATES}}       — tabella template visual necessari
{{DIFFERENTIATOR}}         — cosa li distingue dai competitor
```

**CRITICO**: La struttura delle domande (5 domande per categoria, domande specifiche per categoria, sezione visual, sezione tools, sezione content strategy, sezione n8n workflow) deve rimanere IDENTICA ai file originali. Solo i riferimenti specifici a EarlyInsider/insider trading vengono sostituiti con le variabili.

### Flusso della skill

```
FASE 0 — Input
  Intervista con l'utente (5 domande base + follow-up)
  Output: business brief completo

FASE 1 — Psychological Framework
  Applica PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md
  3 ricerche parallele (landscape, psicologia target, pattern copy)
  Output: positioning, pilastri psicologici, tone of voice, trust architecture

FASE 2 — Product Architecture
  Stack tecnologico, DB schema, API, pricing model
  Output: architettura tecnica

FASE 3 — Cost Optimization
  Budget constraint → provider ottimali
  Usa lo stesso approccio di COST-OPTIMIZATION-FINAL.md
  Output: tabella costi ottimizzata con alternative gratuite/economiche

FASE 4 — Content Engine: Ricerca 1 (Parametri 10/10)
  Identifica categorie di contenuto basandosi su canali + prodotti
  Compila template research-1-quality-params.md con variabili del progetto
  Lancia run-deep-research.py su 5 modelli AI in parallelo
  Cross-reference risultati
  Output: CONTENT-QUALITY-FRAMEWORK.md

FASE 5 — Content Engine: Ricerca 2 (Come raggiungere il 10/10)
  Compila template research-2-implementation.md con variabili
  Lancia run-deep-research.py su 5 modelli AI in parallelo
  Cross-reference risultati
  Output: prompt concreti, workflow n8n, content strategy, visual templates

FASE 6 — Growth Engine
  SEO strategy, social strategy, outreach, newsletter, referral
  Basato su output FASE 4+5 (cosa pubblicare dove e quando)
  Output: growth plan con metriche target

FASE 7 — Implementation
  Se codice esiste: gap analysis (come CONTENT-GAPS-ALL.md)
  Se non esiste: deep-plan → deep-implement per ogni componente
  Output: codice implementato, test, deploy

FASE 8 — Optimization Loop
  Metriche → analisi → gap → fix → iterate
  Output: processo continuo di miglioramento
```

### Requisiti NON NEGOZIABILI

1. **I 2 template di ricerca devono mantenere ESATTAMENTE lo stesso livello di dettaglio dei file originali** — stesse 5 domande macro, stesse domande specifiche per categoria, stessa sezione visual, stessa sezione tools con vincolo budget, stessa sezione content strategy, stessa sezione n8n workflow. Solo i riferimenti a EarlyInsider diventano variabili.

2. **Lo script run-deep-research.py deve essere generalizzato** — accetta il prompt come input, le API key come env var, salva risultati nella directory del progetto.

3. **Il cross-reference dei risultati deve seguire lo stesso pattern** — consensus (3+ modelli concordano), unique insights (1-2 modelli, ma valido), divergences (modelli discordano), specific data points, best-in-class.

4. **Il framework psicologico (FASE 1) deve essere integrato** — il tone of voice e i pilastri psicologici informano il content engine (FASE 4-5). Non sono separati.

5. **Budget-aware** — il vincolo budget (FASE 3) influenza la scelta di AI model e tools (FASE 4-5). Se il budget e $20/mese, i prompt usano DeepSeek. Se e $200/mese, usano Claude per tutto.

6. **Applicabile a QUALSIASI business** — SaaS, e-commerce, agenzia, personal brand, app consumer, newsletter, marketplace. Le categorie di contenuto cambiano, il framework no.

## Come Procedere

1. **Leggi TUTTI i 12 file** elencati sopra — sono gli esempi reali
2. **Comprendi il flusso completo** che abbiamo fatto per EarlyInsider
3. **Identifica cosa e specifico** di EarlyInsider vs cosa e universale
4. **Crea i template standardizzati** dei 2 prompt di ricerca (il cuore)
5. **Crea la skill** con entry point, template, scripts
6. **Generalizza run-deep-research.py** per accettare qualsiasi prompt
7. **Testa mentalmente** applicando il framework a 2-3 business diversi (es. fitness app, B2B SaaS, e-commerce) per verificare che funzioni
8. **Documenta** come usare la skill con esempio completo
