# Catalog — Folder-by-Folder Map

This file is the field guide to the repo. Every top-level folder, every important sub-folder, and every notable file is listed below with a one-line description and a pointer to *what calls it* and *what it depends on*. Read [README.md](README.md) first for the high-level picture.

```
nabeeh/
├── api/                Vercel serverless (Python)
├── assets/             Brand logos
├── backend/            FastAPI app — the heavy lifting
├── dashboard/          React 19 + Vite SPA
├── scripts/            Root-level deploy + DB scripts
├── supabase/           Database migrations
├── README.md           Project overview & setup
├── catalog.md          ← you are here
├── vercel.json         Vercel build / routing config
├── pyproject.toml      Python tooling for root scripts
├── requirements.txt    Empty — backend deps live in backend/
├── uv.lock             uv lockfile (root scripts)
├── .gitignore
├── .vercelignore
└── .python-version
```

---

## `/api/` — Vercel serverless functions

Lightweight Python functions deployed alongside the SPA. Run on demand at the edge, **not** the long-running backend.

| File | Purpose |
|------|---------|
| `chat.py` | AI assistant proxy. Accepts a user message, gathers stock context (price + risk + sentiment) from Supabase, calls OpenRouter `deepseek-v4-pro`, returns the Arabic reply. |
| `tasi.py` | TASI index real-time quote via yfinance. Used by the dashboard market-status banner. |
| `health.py` | Returns `{ "status": "ok" }`. Smoke test from CI / Vercel checks. |

Routing comes from `vercel.json`. The dashboard's `dashboard/src/services/api.ts` calls these via `/api/*` paths.

---

## `/assets/` — Brand assets

| File | Purpose |
|------|---------|
| `logo.png` / `logo.svg` | Light-theme logo |
| `logo-dark.png` / `logo-dark.svg` | Dark-theme logo |

Imported by `dashboard/src/components/NabeehAILogo.tsx` and used in landing/header.

---

## `/backend/` — FastAPI application

The brain. Computes risk, fetches news, runs the sentiment model, sends alert emails. Deployed to Railway as a Docker container.

```
backend/
├── Dockerfile           Build recipe (Python 3.10 slim + deps)
├── railway.toml         Railway runtime config (health check, restart policy)
├── pyproject.toml       Tooling config (ruff, etc.)
├── requirements.txt     Pinned Python deps (FastAPI, supabase-py, yfinance, …)
├── .env.example         Documented environment variables
├── app/                 Application code
├── scripts/             One-shot Python utilities
├── tests/               pytest suite
└── models/              Pre-cached MARBERT tokenizer files
```

### `backend/app/` — application package

| File / Folder | Purpose |
|---------------|---------|
| `main.py` | FastAPI entry: lifespan startup (load MARBERT, fetch initial prices, start scheduler), CORS middleware, mounts the 5 module routers, exposes `/health`. |
| `config.py` | Pydantic `Settings` — every environment variable lives here with a sane default. |
| `database.py` | Two Supabase clients: `_supabase_client` (anon key, RLS-respecting reads) and `_supabase_service` (service-role, RLS-bypassing writes). |
| `scheduler.py` | APScheduler. Defines the 4 cron jobs and the `_has_fresh_prices()` gating helper. |
| `core/` | `exceptions.py` — shared exception classes used across modules. |
| `modules/` | Domain modules (see below). |
| `tasks/` | Scheduler-invoked orchestration scripts (see below). |

### `backend/app/modules/`

Each module is self-contained: `router.py` (FastAPI routes), `service.py` (business logic), `repository.py` (DB access), `schemas.py` (Pydantic request/response models).

| Module | Files | What it does |
|--------|-------|--------------|
| `prices/` | `router`, `service`, `repository`, `schemas`, `providers/{base,factory,yfinance_provider}` | Pluggable market-data providers (currently `yfinance`); upserts `daily_prices`. |
| `risk/` | `router`, `service`, `repository`, `schemas` | VaR (historical + parametric), CVaR, GARCH(1,1), Sharpe/Sortino, beta, max drawdown, Monte Carlo (10 000-path GBM). |
| `news/` | `router`, `service`, `repository`, `schemas` | Argaam RSS (5 feeds + company pages) + GNews; Arabic-keyword stock matching; dedup on `(source, headline_ar)`. |
| `sentiment/` | `router`, `service`, `repository`, `schemas`, `model` | MARBERTv2 → ONNX Runtime; financial keyword boost layer; batch inference (16 articles). |
| `assistant/` | `router`, `service`, `schemas` | OpenRouter (DeepSeek) chat with real-time stock context. |
| `alerts/` | `service`, `schemas`, `template`, `threading` | Composes Resend emails; RFC-5322 deterministic `Message-ID` per `(user, symbol)` so successive alerts thread. **Internal — no router.** |
| `notes/` | `service`, `repository`, `schemas`, `fallback` | Generates the Arabic risk-narrative shown in `NabeehNotes.tsx`. Strict validator + rule-based fallback when AI output is rejected. **Internal — no router.** |

### `backend/app/tasks/`

Procedures invoked by the scheduler (and by `verify_pipeline.py`). Each one is the unit of orchestration for one stage of the pipeline.

| File | Pipeline | Purpose |
|------|----------|---------|
| `fetch_prices.py` | PIPE-01 | Pull OHLCV from yfinance for every active stock; upsert `daily_prices`. |
| `compute_stats.py` | PIPE-04a | Compute daily-return mean/std, annualized vol, 52-week range; upsert `stock_stats`. |
| `compute_pivots.py` | PIPE-04b | Classic pivot points (PP, R1–R3, S1–S3) from latest OHLC; upsert into `stock_stats`. |
| `news_pipeline.py` | PIPE-02 + PIPE-03 | Fetch all sources → dedup → run MARBERT on `is_analyzed = false`. |
| `compute_risk.py` | PIPE-05 + PIPE-06 + PIPE-07 | Composite risk score (40% VaR + 35% vol + 25% sentiment) → MC simulation → AI risk note → optional email alert. |
| `startup_health.py` | bootstrap | Seeds missing tables, validates Supabase connectivity at app startup. |

### `backend/scripts/` — operational scripts

| File | Purpose |
|------|---------|
| `seed_stocks.py` | Insert the 4 covered Tadawul stocks into the `stocks` table (idempotent). Run once after migrations. |
| `backfill_risk_notes.py` | One-shot: walk every active stock, build a `RiskNoteInput` from the latest two `risk_metrics`, call `notes.service.generate()` to populate `risk_notes`. Useful right after launch when the dashboard would otherwise show "no AI note yet". |

### `backend/tests/`

Pytest suite. Tests are organized per use case — naming pattern `test_un<NN>_<feature>.py`.

| File | Covers |
|------|--------|
| `test_un01_search.py` | Stock search (UN-01) |
| `test_un02_risk_level.py` | Risk-level computation (UN-02) |
| `test_un03_risk_explanation.py` | AI risk-note generation + fallback (UN-03) |

Run with `pytest backend/tests` (from repo root, with the backend venv activated).

### `backend/models/`

Cached MARBERTv2 tokenizer + config files (`tokenizer.json`, `vocab.txt`, …). Speeds up first startup; the actual ONNX model weights are downloaded from HuggingFace on first run and cached locally.

---

## `/dashboard/` — React 19 SPA

The user-facing app. Vite-built TypeScript, deployed to Vercel.

```
dashboard/
├── package.json         Dependencies (React 19, Tailwind 4, Recharts, …)
├── vite.config.ts       Build config + dev proxy to localhost:8000
├── tsconfig.json        Strict TS
├── eslint.config.js
├── index.html           Vite root document
├── public/              Static assets shipped as-is
├── .env.example         Documented frontend env vars
└── src/                 Application code
```

### `dashboard/src/`

| File / Folder | Purpose |
|---------------|---------|
| `main.tsx` | App entry — wraps `<App />` in providers. |
| `App.tsx` | React Router routes (see below). |
| `pages/` | One `*.tsx` per route. |
| `components/` | Reusable building blocks (see grouping below). |
| `layouts/` | `DashboardLayout.tsx` — shared header + sidebar shell for protected routes. |
| `providers/` | `AppProviders.tsx` (composes them all), `AuthProvider.tsx` (Supabase session), `ThemeProvider.tsx` (light/dark, Cairo font). |
| `hooks/` | 19 custom hooks (data-fetching, computation, state). |
| `services/` | I/O. `supabase-queries.ts` is the single source of truth for DB reads; `api.ts` calls the FastAPI backend. |
| `utils/` | Pure functions: indicator math, risk formulas, signal generators, markdown rendering. |
| `config/` | App-wide constants and registries (technical indicators, risk metrics, the Supabase client). |
| `lib/` | `utils.ts` — `cn()` helper for Tailwind class merging. |
| `types/` | Shared TS interfaces (`stock.ts`, `chat.ts`, `preferences.ts`). |
| `styles/` | `globals.css` (Tailwind reset + theme variables) and `tokens.css` (design tokens). |
| `workers/` | `montecarlo.worker.ts` — runs Monte Carlo simulation off the main thread. |
| `vite-env.d.ts` | Vite type stubs. |

### `pages/` — 11 routes

| Page | Route | What it does |
|------|-------|--------------|
| `LandingPage.tsx` | `/` | Public marketing page, hero, feature list, CTA. |
| `LoginPage.tsx` | `/login` | Email/password login (Supabase Auth). |
| `RegisterPage.tsx` | `/register` | New-account signup. |
| `DashboardPage.tsx` | `/dashboard` | Stock grid with live risk scores + watchlist. |
| `SearchPage.tsx` | `/search` | Search by symbol or company name. |
| `StockDetailPage.tsx` | `/stock/:symbol` | Candlestick + indicators + Monte Carlo + risk breakdown + sentiment + `NabeehNotes`. |
| `NewsPage.tsx` | `/news` | News feed with sentiment labels. |
| `ChatbotPage.tsx` | `/chat` | Full-page AI assistant. |
| `SettingsPage.tsx` | `/settings` | Theme, language, profile preferences. |
| `UpgradePage.tsx` | `/upgrade` | Premium-tier pitch. |
| `NotFoundPage.tsx` | `*` | 404. |

### `components/` — grouped by concern

**Charts & visualizations**
`CandlestickChart.tsx`, `MonteCarloChart.tsx`, `SentimentTrendChart.tsx`, `RiskScoreGauge.tsx`

**Risk analysis**
`RiskMetricsPanel.tsx`, `RiskBreakdown.tsx`, `RiskCustomizer.tsx`, `IndicatorPanel.tsx`, `IndicatorCustomizer.tsx`, `IndicatorPeriodSelector.tsx`, `MCHorizonSelector.tsx`

**Stock info**
`StockTable.tsx`, `StockLogo.tsx`, `CompanyInfoCard.tsx`, `WatchlistSection.tsx`

**Market & news**
`SentimentBar.tsx`, `SignalSummaryCard.tsx`, `NewsCard.tsx`

**AI surfaces**
`NabeehNotes.tsx` — the Arabic risk narrative on the stock detail page (reads `risk_notes` via `fetchLatestRiskNote`).
`ChatWidget.tsx` — floating chat used outside the `/chat` page.

**Layout & navigation**
`Header.tsx`, `Sidebar.tsx`, `RouteGuard.tsx` (auth gate)

**Branding & upsell**
`NabeehAILogo.tsx`, `UpgradePrompt.tsx`

**UI primitives** (`components/ui/`)
`badge.tsx`, `button.tsx`, `card.tsx`, `chart.tsx` — shadcn-style primitives.

### `hooks/` — 19 hooks, grouped

**Data-fetching (Supabase)**
`useActiveStocks`, `useAllStocksSummary`, `useRiskMetrics`, `useStockHistory`, `useStockPrice`, `useStockStats`, `useSentimentSummary`, `useNewsWithSentiment`, `useTASIIndex`, `useMarketStatus`

**Computation**
`useRiskScore`, `useIndicatorResults`, `useMonteCarloSimulation`, `useServerMonteCarlo`

**State / preferences**
`useAuth`, `useTheme`, `useUserProfile`, `useWatchlist`, `useAnalysisPrefs`

### `services/`

| File | Purpose |
|------|---------|
| `supabase-queries.ts` | Every read against Supabase. Includes the new `fetchLatestRiskNote(symbol)` for AI risk narratives. |
| `api.ts` | HTTP wrapper for the FastAPI backend (`/api/*` paths). |

### `utils/`

| File | Purpose |
|------|---------|
| `indicators.ts` | MA, RSI, MACD, Bollinger Bands, ATR, etc. |
| `riskScore.ts` | Risk-level → color + label mapping; mirrors backend thresholds. |
| `signalFunctions.ts` | Buy/sell signal generation from indicator output. |
| `consensus.ts` | Combines multiple signals into a single recommendation. |
| `renderMarkdown.tsx` | Markdown → JSX (used by `ChatWidget` to render assistant replies). |

### `config/`

| File | Purpose |
|------|---------|
| `constants.ts` | App-level constants (refresh intervals, default symbol, etc.). |
| `supabase.ts` | Supabase client init with build-time env validation. |
| `query-client.ts` | TanStack Query config (cache time, retry policy). |
| `indicatorRegistry.ts` | Catalog of supported technical indicators with metadata. |
| `riskRegistry.ts` | Catalog of risk metrics with display info. |

---

## `/scripts/` — root-level operational scripts

| File | Purpose |
|------|---------|
| `build.sh` | Vercel build entry — `cd dashboard && npm ci && npm run build`, then move output to `dist/`. |
| `seed_stocks.py` | Same as `backend/scripts/seed_stocks.py`, re-exposed at root for convenience. |
| `seed_stock_descriptions.py` | Populate the `description_ar` column for each stock. |
| `verify_pipeline.py` | Smoke test — runs each scheduler job once and reports row counts. Use this after first-time setup. |
| `apply_v3_migrations.sql` | Snapshot of the v3 schema; superseded by `supabase/migrations/`. |

---

## `/supabase/migrations/` — canonical database schema

11 SQL files, applied in alphabetical order. **This is the only database source of truth** — apply these files (and only these files) to a fresh Supabase project.

| File | What it adds |
|------|--------------|
| `20260209000001_initial_schema.sql` | `stocks`, `daily_prices`, `stock_stats`, `news_articles`, `sentiment_scores`, `risk_metrics` + RLS policies + indexes. |
| `20260213000001_add_pivot_levels.sql` | Pivot point columns on `stock_stats`. |
| `20260213000002_extend_risk_metrics_add_mc_results.sql` | `monte_carlo_paths` (jsonb) on `risk_metrics`. |
| `20260213000003_add_52_week_range_to_stock_stats.sql` | `week_52_high`, `week_52_low` on `stock_stats`. |
| `20260224000001_user_profiles.sql` | `user_profiles` table. |
| `20260224000002_user_watchlist.sql` | `user_watchlist` table. |
| `20260224000003_user_profile_preferences.sql` | `preferences` jsonb column on `user_profiles`. |
| `20260224000004_user_profiles_insert_policy.sql` | RLS insert policy for self-service profile creation. |
| `20260411000001_add_stock_descriptions.sql` | `description_ar` on `stocks`. |
| `20260418000001_risk_metrics_allow_history.sql` | Drops the unique constraint on `risk_metrics(stock_id)` so historical rows accumulate. |
| `20260501000001_risk_notes_and_sent_alerts.sql` | `risk_notes` + `sent_alerts` tables; powers AI narratives and threaded email alerts. |

---

## Root configuration files

| File | Purpose |
|------|---------|
| `vercel.json` | SPA rewrite rules (`/* → /index.html`), Python serverless function routing. |
| `.vercelignore` | Excludes `backend/`, `supabase/`, env files, build artifacts from the Vercel upload. |
| `.gitignore` | Excludes secrets, build artifacts, OS files, IDE state. |
| `.python-version` | pyenv pin (Python 3.10). |
| `pyproject.toml` | Tooling for the root scripts (ruff config). |
| `uv.lock` | Lockfile for the root scripts. |
| `requirements.txt` | Empty — backend deps are in `backend/requirements.txt`. Kept as a marker so Vercel doesn't autodetect a Python backend at the repo root. |
