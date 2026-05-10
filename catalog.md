# Catalog — Visual Map of the Repo

A picture-first guide to where everything lives. Read [README.md](README.md) first for the architecture and pipeline. This file is for "I know what I want, where is it?".

Every diagram below renders directly on GitHub. Each box is a real folder or file you can click through to.

---

## 1. Repo at a glance

```mermaid
mindmap
  root((nabeeh))
    Vercel serverless
      api/chat.py
      api/tasi.py
      api/health.py
    Backend FastAPI
      backend/app
      backend/scripts
      backend/models
      backend/Dockerfile
    Frontend SPA
      dashboard/src
      dashboard/public
      dashboard/vite.config.ts
    Database
      supabase/migrations
    Brand
      assets/logo
    Root scripts
      scripts/build.sh
      scripts/verify_pipeline.py
    Config
      README.md
      catalog.md
      vercel.json
      pyproject.toml
```

| Folder | One-line role |
|--------|---------------|
| `api/` | 3 Python serverless functions deployed with the SPA on Vercel. |
| `assets/` | Logo files (light and dark theme, PNG and SVG). |
| `backend/` | FastAPI app. The brain. Deployed to Railway as a Docker container. |
| `dashboard/` | React 19 + Vite TypeScript SPA. The user-facing app. |
| `scripts/` | Build helper for Vercel and operational utilities. |
| `supabase/migrations/` | 11 SQL files. Single source of truth for the database schema. |

---

## 2. Vercel serverless layer

```mermaid
flowchart LR
  api[api/]
  api --> chat["chat.py<br/>AI assistant proxy<br/>(DeepSeek via OpenRouter)"]
  api --> tasi["tasi.py<br/>TASI index quote<br/>(yfinance)"]
  api --> health["health.py<br/>health check"]

  vercel[vercel.json] -.routes.-> chat
  vercel -.routes.-> tasi
  vercel -.routes.-> health

  fe[dashboard services/api.ts] --calls /api/*--> api
```

These are short, edge-friendly functions, not the long-running backend. The dashboard calls them through `/api/*` paths.

---

## 3. Backend layout

```mermaid
flowchart LR
  backend[backend/]
  backend --> docker[Dockerfile]
  backend --> railway[railway.toml]
  backend --> req[requirements.txt]
  backend --> envex[.env.example]
  backend --> app[app/]
  backend --> bscripts[scripts/]
  backend --> models[models/]

  app --> main["main.py<br/>FastAPI entry"]
  app --> cfg["config.py<br/>Pydantic settings"]
  app --> db["database.py<br/>Supabase clients"]
  app --> sched["scheduler.py<br/>4 cron jobs"]
  app --> core["core/<br/>shared exceptions"]
  app --> mods[modules/]
  app --> tasks[tasks/]

  bscripts --> seed["seed_stocks.py<br/>insert 4 tickers"]
  bscripts --> backfill["backfill_risk_notes.py<br/>one-shot AI notes"]

  models --> tok["tokenizer<br/>(MARBERT files)"]
```

### Modules (`backend/app/modules/`)

Each module follows the same shape: `router.py` (HTTP routes), `service.py` (logic), `repository.py` (DB access), `schemas.py` (Pydantic models).

```mermaid
flowchart LR
  mods[modules/]
  mods --> prices["prices/<br/>yfinance, daily_prices"]
  mods --> risk["risk/<br/>VaR, GARCH, Monte Carlo"]
  mods --> news["news/<br/>Argaam RSS + pages"]
  mods --> sent["sentiment/<br/>MARBERTv2 ONNX"]
  mods --> asst["assistant/<br/>DeepSeek chat"]
  mods --> alerts["alerts/ (internal)<br/>Resend + RFC-5322"]
  mods --> notes["notes/ (internal)<br/>Arabic narrative + fallback"]

  classDef internal fill:#fef3c7,stroke:#a16207,color:#000
  class alerts,notes internal
```

Yellow boxes have no HTTP router. They are called from inside the backend only.

### Tasks (`backend/app/tasks/`)

The scheduler invokes one task per pipeline stage.

```mermaid
flowchart LR
  scheduler[scheduler.py] --> fp["fetch_prices.py<br/>PIPE-01"]
  scheduler --> cs["compute_stats.py<br/>PIPE-04a"]
  scheduler --> cp["compute_pivots.py<br/>PIPE-04b"]
  scheduler --> np["news_pipeline.py<br/>PIPE-02 + 03"]
  scheduler --> cr["compute_risk.py<br/>PIPE-05 + 06 + 07"]

  startup[main.py lifespan] --> sh["startup_health.py<br/>boot check"]
```

---

## 4. Frontend layout (`dashboard/`)

```mermaid
flowchart LR
  dash[dashboard/]
  dash --> pkg[package.json]
  dash --> vite[vite.config.ts]
  dash --> idx[index.html]
  dash --> pub[public/]
  dash --> src[src/]

  src --> entry["main.tsx + App.tsx<br/>entry + router"]
  src --> pages["pages/<br/>11 routes"]
  src --> comps["components/"]
  src --> hooks["hooks/<br/>19 custom hooks"]
  src --> svc["services/<br/>supabase-queries.ts<br/>api.ts"]
  src --> utils["utils/<br/>indicator math,<br/>signals, markdown"]
  src --> cfg["config/<br/>constants,<br/>supabase client,<br/>registries"]
  src --> layouts["layouts/<br/>DashboardLayout"]
  src --> providers["providers/<br/>Auth, Theme"]
  src --> workers["workers/<br/>Monte Carlo"]
  src --> types["types/"]
  src --> styles["styles/"]
```

### Pages (`dashboard/src/pages/`)

```mermaid
flowchart LR
  router[App.tsx router]
  router --> public[public routes]
  router --> auth[auth routes]
  router --> protected[protected routes]
  router --> misc[misc]

  public --> landing["LandingPage<br/>/"]
  public --> nf["NotFoundPage<br/>*"]

  auth --> login["LoginPage<br/>/login"]
  auth --> reg["RegisterPage<br/>/register"]

  protected --> dashp["DashboardPage<br/>/dashboard"]
  protected --> search["SearchPage<br/>/search"]
  protected --> detail["StockDetailPage<br/>/stock/:symbol"]
  protected --> news["NewsPage<br/>/news"]
  protected --> chat["ChatbotPage<br/>/chat"]

  misc --> settings["SettingsPage<br/>/settings"]
  misc --> upgrade["UpgradePage<br/>/upgrade"]
```

### Components (`dashboard/src/components/`)

Grouped by what they do. Names are exact filenames (drop the `.tsx`).

```mermaid
mindmap
  root((components))
    Charts
      CandlestickChart
      MonteCarloChart
      SentimentTrendChart
      RiskScoreGauge
    Risk panels
      RiskMetricsPanel
      RiskBreakdown
      RiskCustomizer
      IndicatorPanel
      IndicatorCustomizer
      IndicatorPeriodSelector
      MCHorizonSelector
    Stock info
      StockTable
      StockLogo
      CompanyInfoCard
      WatchlistSection
    Market and news
      SentimentBar
      SignalSummaryCard
      NewsCard
    AI surfaces
      NabeehNotes
      ChatWidget
    Layout
      Header
      Sidebar
      RouteGuard
    Branding
      NabeehAILogo
      UpgradePrompt
    UI primitives
      ui/badge
      ui/button
      ui/card
      ui/chart
```

### Hooks (`dashboard/src/hooks/`)

```mermaid
mindmap
  root((19 hooks))
    Data fetching
      useActiveStocks
      useAllStocksSummary
      useRiskMetrics
      useStockHistory
      useStockPrice
      useStockStats
      useSentimentSummary
      useNewsWithSentiment
      useTASIIndex
      useMarketStatus
    Computation
      useRiskScore
      useIndicatorResults
      useMonteCarloSimulation
      useServerMonteCarlo
    State and prefs
      useAuth
      useTheme
      useUserProfile
      useWatchlist
      useAnalysisPrefs
```

---

## 5. Database schema timeline (`supabase/migrations/`)

11 SQL files. Apply in alphabetical order to a fresh Supabase project. Filename prefix = `YYYYMMDD` of when it was added.

```mermaid
flowchart LR
  M1[2026-02-09<br/>initial schema] --> M2[2026-02-13<br/>pivot levels]
  M2 --> M3[2026-02-13<br/>MC paths jsonb]
  M3 --> M4[2026-02-13<br/>52w range]
  M4 --> M5[2026-02-24<br/>user_profiles]
  M5 --> M6[2026-02-24<br/>user_watchlist]
  M6 --> M7[2026-02-24<br/>user prefs jsonb]
  M7 --> M8[2026-02-24<br/>profile insert RLS]
  M8 --> M9[2026-04-11<br/>stock descriptions]
  M9 --> M10[2026-04-18<br/>risk history]
  M10 --> M11[2026-05-01<br/>risk_notes + sent_alerts]
```

| Migration | Adds |
|-----------|------|
| `20260209000001_initial_schema.sql` | `stocks`, `daily_prices`, `stock_stats`, `news_articles`, `sentiment_scores`, `risk_metrics`, RLS policies, indexes. |
| `20260213000001_add_pivot_levels.sql` | Pivot point columns on `stock_stats`. |
| `20260213000002_extend_risk_metrics_add_mc_results.sql` | `monte_carlo_paths` (jsonb) on `risk_metrics`. |
| `20260213000003_add_52_week_range_to_stock_stats.sql` | `week_52_high`, `week_52_low` on `stock_stats`. |
| `20260224000001_user_profiles.sql` | `user_profiles` table. |
| `20260224000002_user_watchlist.sql` | `user_watchlist` table. |
| `20260224000003_user_profile_preferences.sql` | `preferences` jsonb column on `user_profiles`. |
| `20260224000004_user_profiles_insert_policy.sql` | RLS insert policy for self-service profile creation. |
| `20260411000001_add_stock_descriptions.sql` | `description_ar` on `stocks`. |
| `20260418000001_risk_metrics_allow_history.sql` | Drops unique constraint on `risk_metrics(stock_id)` so history accumulates. |
| `20260501000001_risk_notes_and_sent_alerts.sql` | `risk_notes` + `sent_alerts` tables. Powers AI narratives and threaded email alerts. |

---

## 6. Root scripts and config

```mermaid
flowchart LR
  root[repo root]
  root --> scripts[scripts/]
  root --> cfg[config files]

  scripts --> build["build.sh<br/>Vercel build entry"]
  scripts --> seed["seed_stocks.py<br/>insert 4 tickers"]
  scripts --> seed2["seed_stock_descriptions.py<br/>fill description_ar"]
  scripts --> verify["verify_pipeline.py<br/>smoke test all stages"]

  cfg --> vercel["vercel.json<br/>SPA + serverless routing"]
  cfg --> vignore[".vercelignore<br/>excludes backend/"]
  cfg --> gignore[".gitignore"]
  cfg --> pyver[".python-version<br/>(3.10)"]
  cfg --> pyproj["pyproject.toml<br/>(ruff config)"]
  cfg --> uv["uv.lock"]
  cfg --> rreq["requirements.txt<br/>(empty marker)"]
```

---

## How to use this catalog

- **Looking for a specific feature?** Find the section above (backend, frontend, migrations) and click through the diagram nodes.
- **Adding a new module?** Match the existing pattern in the matching diagram (modules follow `router/service/repository/schemas`, hooks group by data-fetching / computation / state).
- **Adding a new migration?** Drop the SQL file into `supabase/migrations/` with the next `YYYYMMDD` prefix and add it to the timeline above.
