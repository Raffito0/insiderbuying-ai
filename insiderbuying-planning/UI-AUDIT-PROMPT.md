# Prompt per UI Audit + Typography Fix

Copia tutto sotto la linea `---` e incollalo in una nuova chat Claude Code.

---

## Task

Devo fare un audit completo e fixare i problemi di leggibilita del sito earlyinsider.com. Il problema principale: testo troppo piccolo in diverse sezioni, specialmente su mobile.

## Il Brand

**EarlyInsider.com** — SaaS di insider trading intelligence. Manda alert in tempo reale quando insider (CEO, CFO, Director) comprano/vendono azioni (SEC Form 4 filings). Ha anche blog SEO, report premium a pagamento ($14.99-$29.99), e newsletter.

**Target audience**: Retail investor americano, 25-55 anni, investe attivamente in azioni individuali. Vuole un edge informativo basato su dati SEC pubblici. Non e un trader professionista ma e informato e prende decisioni autonome.

**Tono del brand**: Autorevole ma accessibile. Dati-driven, non hype. Premium ma non corporate — come un analista senior che ti parla da amico. Dark navy (#0A1128 primario, #1A2238 secondario) con accenti verdi/rossi per buy/sell.

**Font**: Montaga per titoli editoriali (serif, elegante), Inter/system-ui per body text (sans-serif, leggibile).

**Design reference**: Il sito deve sembrare un mix tra Morningstar (autorevole, dati-denso) e Unusual Whales (moderno, dark theme, fintech). NON deve sembrare un blog generico o un sito WordPress template.

## Il Sito

**Framework**: Next.js 16, React 19, Tailwind v4, SSR su Netlify
**Codice**: `ryan_cole/insiderbuying-site/`

**Pagine principali** (tutte da auditare):
- `/` — Homepage (hero, features, how it works, pricing preview, testimonials, CTA)
- `/pricing` — Pagina pricing con toggle monthly/annual
- `/alerts` — Feed alert insider trading (blur per free user)
- `/reports` — Catalogo report premium con grid di card
- `/blog` — Lista articoli
- `/blog/[slug]` — Articolo singolo
- `/about` — Chi siamo
- `/faq` — FAQ
- `/how-it-works` — Spiegazione del servizio
- `/methodology` — Come funziona lo scoring
- `/free-report` — Landing page lead magnet
- `/login` — Login
- `/signup` — Signup

## Problemi Noti

1. **Testo troppo piccolo** — diverse sezioni hanno font-size sotto 14px, illeggibile su mobile
2. **Gerarchia tipografica debole** — in alcune pagine non e chiaro cosa e H1, H2, body text
3. **Spacing inconsistente** — padding/margin diversi tra sezioni simili
4. **Mobile readability** — su iPhone/Android alcune card hanno testo che richiede zoom

## Cosa Fare

### Step 1: Lancia `/audit` su tutte le pagine
Audit completo: accessibility, typography, responsive, spacing, contrast ratio, touch targets.

### Step 2: Lancia `/typeset` per fixare la tipografia
Fixare: font-size minimo 16px per body text mobile, gerarchia chiara H1→H2→H3→body→caption, line-height adeguata (1.5-1.7 per body), letter-spacing.

### Step 3: Lancia `/adapt` per fixare il responsive
Verificare tutti i breakpoint: mobile (375px), tablet (768px), desktop (1024px+). Ogni pagina deve essere leggibile senza zoom su iPhone SE (375px).

### Step 4: Lancia `/polish` per il pass finale
Spacing, alignment, consistency tra pagine.

## Vincoli e Direzione

**NON toccare**:
- Colori del brand (navy, verde, rosso, giallo)
- Font Montaga per i titoli
- Layout strutturale delle pagine

**Direzione estetica**:
Il sito deve essere **elegante e raffinato** — come un report di Morningstar o Goldman Sachs, non un blog consumer. Questo significa: typography precisa, spacing generoso ma non eccessivo, gerarchia chiara, niente che sembri "grosso" o "urlato". Il brand e premium e data-driven.

**Reference di sizing** (come punto di partenza, non regola rigida):
- Morningstar: 14px body mobile, gerarchia sottile
- Bloomberg: 15px body, spacing tight ma leggibile
- Seeking Alpha: 15px body, card-based layout pulito
- ARK Invest: 15px body, titoli bold ma eleganti

**Le skill devono decidere autonomamente** le scelte migliori per:
- Font sizing e scaling tra mobile/tablet/desktop
- Line-height e letter-spacing per ogni livello gerarchico
- Padding e margin delle sezioni
- Dimensione e padding dei pulsanti (proporzionati, non enormi)
- Card padding e spacing interno
- Spacing tra sezioni
- Contrast ratio (WCAG AA come minimo)
- Touch target size (accessibili ma non oversize)
- Qualsiasi altro dettaglio che migliora la leggibilita e l'eleganza

L'unica regola assoluta: **niente deve richiedere zoom per essere letto su iPhone SE (375px)**. Ma la soluzione non deve essere "ingrandisci tutto" — deve essere "calibra tutto con precisione".

## File da Leggere

- `ryan_cole/insiderbuying-site/src/app/page.tsx` — Homepage
- `ryan_cole/insiderbuying-site/src/app/pricing/page.tsx` — Pricing
- `ryan_cole/insiderbuying-site/src/app/alerts/page.tsx` — Alerts
- `ryan_cole/insiderbuying-site/src/app/reports/page.tsx` — Reports
- `ryan_cole/insiderbuying-site/src/app/blog/page.tsx` — Blog
- `ryan_cole/insiderbuying-site/src/app/about/page.tsx` — About
- `ryan_cole/insiderbuying-site/src/app/faq/page.tsx` — FAQ
- `ryan_cole/insiderbuying-site/src/app/how-it-works/page.tsx` — How It Works
- `ryan_cole/insiderbuying-site/src/app/globals.css` o CSS principale — design tokens, variabili, font-size base
- `ryan_cole/insiderbuying-site/tailwind.config.ts` — configurazione Tailwind (se esiste)

Framework psicologico del brand (per capire il tono visivo): `ryan_cole/earlyinsider-psychological-framework.md`
