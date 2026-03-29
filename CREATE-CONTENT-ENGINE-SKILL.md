# Prompt per creare la skill /content-engine

Copia tutto sotto la linea `---` e incollalo in una nuova chat Claude Code.

---

## Task

Devo creare una Claude Code skill chiamata `/content-engine` che standardizza il processo completo di content strategy, prompt design, e workflow architecture per qualsiasi business.

Questa skill combina 3 framework che ho gia costruito in sessioni precedenti:

### Framework 1: Psychological Framework (GIA ESISTENTE)
File: `ryan_cole/PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md`
Leggi questo file INTERO. Copre: psicologia del target, trust architecture, conversion architecture, tone of voice, naming strategy, emotional journey, anti-pattern detection. 10 fasi complete.

### Framework 2: Content Quality 10/10 (GIA ESISTENTE)
File: `ryan_cole/insiderbuying-planning/CONTENT-QUALITY-FRAMEWORK.md`
Leggi questo file INTERO. Copre: parametri 10/10 per 12 categorie di contenuto (articoli, report, Reddit, X, newsletter, outreach, alert, ecc.) con best-in-class, algoritmo piattaforma, AI detection, conversione, errori fatali.

### Framework 3: Prompt & Workflow Design (IN PROGRESS)
File: `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-PROMPTS-WORKFLOWS.md`
Leggi questo file INTERO. Copre: prompt design per ogni categoria, n8n workflow architecture, content strategy (cosa pubblicare), tools/metodologie/risorse, visual template design.

### Cosa deve fare la skill `/content-engine`

La skill deve orchestrare TUTTO il processo dall'idea al contenuto implementato. Il flusso completo e:

```
/content-engine @progetto

FASE 0 — Input
  Intervista: business model, target, canali, budget, cosa esiste gia

FASE 1 — Psychological Framework
  Applica il framework da PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md:
  - 3 ricerche parallele (landscape competitivo, psicologia target, pattern copy)
  - Sintesi: core insight, 3 pilastri psicologici, tone of voice
  - Trust architecture (5 layer)
  - Conversion architecture (4 gate)
  - Page-by-page strategy
  - Naming, emotional journey, anti-pattern, metriche

FASE 2 — Identifica Categorie di Contenuto
  Basandosi sul business model + canali, identifica TUTTE le categorie
  di contenuto necessarie (articoli, social posts, newsletter, email, alert, ecc.)
  Per ognuna definisci: scopo, risultato, chi lo legge, dove appare, volume

FASE 3 — RICERCA 1: Parametri 10/10 per Ogni Categoria
  Per ogni categoria, lancia ricerche parallele su 5 AI model
  (Gemini Flash, Gemini Flash-Lite, OpenAI gpt-4.1-mini, Perplexity, Claude Opus)
  con le 5 domande:
  1. Best-in-class (chi e come)
  2. Algoritmo/piattaforma (cosa premia e penalizza)
  3. AI/Bot detection (come evitare)
  4. Conversione (cosa funziona)
  5. Errori fatali (cosa NON fare mai)

  Cross-reference le risposte → Framework qualita definitivo

FASE 4 — RICERCA 2: Come Raggiungere il 10/10
  Per ogni categoria, lancia ricerche parallele con:
  - Prompt design ottimale (system prompt, user prompt, few-shot, examples)
  - n8n workflow architecture (nodi, branching, retry, validazione)
  - Content strategy (COSA pubblicare, mix topic, frequenza, timing)
  - Tools/metodologie/risorse (API gratuite, librerie, prompt techniques)
  - Visual template design (layout, colori, HTML/CSS)

  Cross-reference → Piano implementazione

FASE 5 — Gap Analysis
  Se esiste codice: confronta ogni file di generazione con i parametri 10/10
  Se non esiste: genera la spec per ogni workflow

FASE 6 — Piano Implementazione
  Ordine di implementazione con priorita P0-P4
  Per ogni modifica: file, cosa cambiare, perche, impatto

OUTPUT:
  - CONTENT-QUALITY-FRAMEWORK.md (parametri 10/10 per ogni categoria)
  - CONTENT-GAPS-ALL.md (gap analysis se codice esiste)
  - WORKFLOW-CHANGES.md (tutte le modifiche con priorita)
  - PROMPTS/ directory con prompt ottimale per ogni categoria
  - VISUAL-TEMPLATES/ directory con HTML/CSS per ogni template visual
  - Psychological framework deliverables (design spec, copy strategy)
```

### Requisiti della skill

1. Deve essere una Claude Code skill in `~/.claude/skills/content-engine/`
2. Deve usare lo script `run-deep-research.py` (gia esistente in `ryan_cole/insiderbuying-planning/`) per lanciare le ricerche parallele — adattarlo per essere riutilizzabile
3. Deve integrare il Psychological Framework (FASE 1) PRIMA del content design (FASE 2-4) — la psicologia del target informa il tono e lo stile di ogni categoria
4. Deve supportare il vincolo budget (es. "max $50/mese") che influenza la scelta di AI model e tools
5. Deve generare prompt CONCRETI e COPIABILI per ogni categoria, non descrizioni generiche
6. Deve essere applicabile a QUALSIASI business (non solo finance/insider trading)

### File da leggere per costruire la skill

1. `ryan_cole/PSYCHOLOGICAL-FRAMEWORK-METHODOLOGY.md` — il framework psicologico completo (10 fasi)
2. `ryan_cole/insiderbuying-planning/CONTENT-QUALITY-FRAMEWORK.md` — esempio di output FASE 3 (parametri 10/10)
3. `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-PROMPTS-WORKFLOWS.md` — esempio di prompt per FASE 4
4. `ryan_cole/insiderbuying-planning/DEEP-RESEARCH-CONTENT-QUALITY.md` — esempio di prompt per FASE 3
5. `ryan_cole/insiderbuying-planning/CONTENT-GAPS-ALL.md` — esempio di output FASE 5 (gap analysis)
6. `ryan_cole/insiderbuying-planning/WORKFLOW-CHANGES.md` — esempio di output FASE 6 (piano implementazione)
7. `ryan_cole/insiderbuying-planning/COST-OPTIMIZATION-FINAL.md` — esempio di ottimizzazione costi
8. `ryan_cole/insiderbuying-planning/run-deep-research.py` — script per ricerche parallele multi-AI
9. `ryan_cole/insiderbuying-planning/research-results/` — esempio di output delle ricerche

### Come procedere

1. Leggi TUTTI i file elencati sopra
2. Comprendi il flusso completo che abbiamo fatto per EarlyInsider (e il template)
3. Crea la skill `/content-engine` che generalizza questo flusso per qualsiasi business
4. La skill deve produrre gli stessi deliverable di qualita che abbiamo prodotto per EarlyInsider, ma per qualsiasi progetto
5. Includi lo script `run-deep-research.py` adattato come utility della skill
6. Testa la skill verificando che il flusso sia completo e non manchi nessun step
