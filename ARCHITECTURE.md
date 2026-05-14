# Nabeeh — Architecture and Technical Reference

This document is the deep technical reference for Nabeeh. It contains the architecture overview, the end-to-end data flow with a sequence diagram, the full database schema, every API endpoint, the scheduler jobs, and the math behind the risk score.

For a short overview of what Nabeeh is, see [README.md](README.md). For the folder-by-folder code map, see [catalog.md](catalog.md).

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Backend Pipeline](#backend-pipeline)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Backend Modules](#backend-modules)
7. [Scheduler Jobs](#scheduler-jobs)
8. [AI Risk Notes](#ai-risk-notes)
9. [Email Alert Threading](#email-alert-threading)
10. [Risk Score Calculation](#risk-score-calculation)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL                                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA: Dashboard + Landing Page                     │   │
│  │  Routes: /, /login, /register, /dashboard, /search,      │   │
│  │  /stock/:symbol, /news, /chat, /settings, /upgrade       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Serverless Functions (api/)                              │   │
│  │  chat.py    AI assistant proxy (DeepSeek/OpenRouter)     │   │
│  │  tasi.py    TASI index real-time data (yfinance)         │   │
│  │  health.py  Health check                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
            │                                │
            │  Supabase JS SDK               │  REST API
            ▼                                ▼
┌──────────────────────┐         ┌──────────────────────────────────┐
│      SUPABASE        │         │            RAILWAY               │
│                      │         │                                  │
│  PostgreSQL DB       │◄────────│  FastAPI Backend                 │
│  Auth (users)        │         │  ├── prices module (yfinance)    │
│  Row-Level Security  │         │  ├── risk module (VaR, GARCH, MC)│
│                      │         │  ├── news module (Argaam RSS)    │
│  Tables:             │         │  ├── sentiment (MARBERTv2 ONNX)  │
│  - stocks            │         │  ├── assistant (DeepSeek chat)   │
│  - daily_prices      │         │  ├── alerts (Resend + threading) │
│  - stock_stats       │         │  ├── notes (AI Arabic narrative) │
│  - news_articles     │         │  └── APScheduler (cron jobs)     │
│  - sentiment_scores  │         │                                  │
│  - risk_metrics      │         │  Docker container, Python 3.10   │
│  - risk_notes        │         └──────────────────────────────────┘
│  - sent_alerts       │                       │
│  - user_profiles     │             ┌─────────┴──────────┐
│  - user_watchlist    │             │   External APIs    │
└──────────────────────┘             │  - yfinance        │
                                     │  - Argaam RSS      │
                                     │  - OpenRouter      │
                                     │  - Resend (email)  │
                                     └────────────────────┘
```

## Backend Pipeline

How a single trading day flows through the system:

```mermaid
sequenceDiagram
    autonumber
    participant SCHED as APScheduler
    participant BE as FastAPI Backend
    participant YF as yfinance
    participant ARG as Argaam (RSS + pages)
    participant OR as OpenRouter
    participant DB as Supabase Postgres
    participant RS as Resend
    participant FE as React Frontend

    Note over SCHED,DB: Stage 1: PIPE-01 fetch_prices (12:30 UTC, Sun to Thu)
    SCHED->>BE: trigger fetch_prices
    BE->>YF: GET OHLCV for 4 stocks + TASI
    YF-->>BE: prices
    BE->>DB: UPSERT daily_prices

    Note over SCHED,DB: Stage 2: PIPE-04 compute_stats + pivots (12:35 UTC, Sun to Thu)
    SCHED->>BE: trigger compute_stats_and_pivots
    BE->>DB: SELECT daily_prices (fresh-prices gate)
    DB-->>BE: rows
    BE->>DB: UPSERT stock_stats (vol, VaR, pivots, 52w range)

    Note over SCHED,DB: Stage 3: PIPE-02/03 news + sentiment (every 30 min, all days)
    SCHED->>BE: trigger news_pipeline
    BE->>ARG: fetch 5 RSS feeds + 4 company pages
    ARG-->>BE: articles
    BE->>DB: INSERT news_articles (dedup by source + headline)
    BE->>DB: SELECT articles where is_analyzed = false
    DB-->>BE: unanalyzed rows
    BE->>BE: MARBERT ONNX inference (batch of 16)
    BE->>DB: INSERT sentiment_scores

    Note over SCHED,RS: Stage 4: PIPE-05/06/07 risk + AI note + alert (12:40 UTC, Sun to Thu)
    SCHED->>BE: trigger compute_risk
    BE->>DB: SELECT stats, sentiment, prices
    DB-->>BE: rows
    BE->>BE: VaR + Monte Carlo + composite score
    BE->>OR: prompt for Arabic risk note
    OR-->>BE: JSON note
    BE->>BE: validate (Arabic ratio, digits, banned tokens)
    BE->>DB: UPSERT risk_metrics + risk_notes
    alt risk_score_delta >= 5
        BE->>RS: send threaded email (RFC-5322 Message-ID)
        RS-->>BE: delivery ack
        BE->>DB: INSERT sent_alerts
    else risk_score_delta < 5
        Note right of BE: email skipped, DB row still written
    end

    Note over FE,OR: Stage 5: user browses dashboard or chats
    FE->>DB: SELECT via Supabase JS SDK (RLS public read)
    DB-->>FE: market data
    FE->>BE: POST /api/v1/assistant/chat
    BE->>OR: chat with stock context
    OR-->>BE: reply
    BE-->>FE: reply
```

### How to read the diagram

A few quick conventions before the step-by-step:

- **Solid arrow (`→`)**: one component is calling another, sending data or asking for something.
- **Dashed arrow (`-->`)**: the reply coming back.
- **Numbered circle on the left of an arrow**: the step number. Match it to the table below.
- **Stage banner**: the grey bar that opens each block tells you when the stage runs and which scheduled job kicks it off.
- **`alt` block in Stage 4**: this is an if/else fork. Only one of the two paths runs at a time. The condition inside the square brackets `[ ]` is what decides which path runs. We use it because alerts are only sent when the score actually moved enough to matter.

### What each arrow means

The numbers below match the numbered arrows in the diagram.

**Stage 1: Price ingest (12:30 UTC, Sun to Thu)**

This stage downloads the latest stock prices once a day so the rest of the system has fresh data to work with.

| Step | What's happening |
|------|------------------|
| 1 | The internal scheduler wakes up at 12:30 UTC and tells the backend to run the `fetch_prices` job. |
| 2 | The backend calls Yahoo Finance and asks for today's prices for the 4 Tadawul stocks and the TASI index. It asks for OHLCV data: opening price, daily high, daily low, closing price, and trading volume. |
| 3 | Yahoo Finance sends the price rows back. |
| 4 | The backend saves the rows into the `daily_prices` table. If a row for that stock and date already exists, it updates it instead of duplicating it. |

**Stage 2: Stats and pivots (12:35 UTC, Sun to Thu)**

Five minutes after prices land, this stage crunches the numbers that everything else depends on (volatility, VaR, support/resistance levels, the 52-week range).

| Step | What's happening |
|------|------------------|
| 5 | At 12:35 UTC the scheduler triggers the `compute_stats_and_pivots` job. The arrow goes scheduler → backend, kicking the job off. |
| 6 | The backend asks the database for each stock's recent price history. The "fresh-prices gate" is a safety check: if a stock has no price row from the last 5 days (weekend, holiday, or Yahoo Finance failed), the job skips that stock so a stale risk score never gets written later. |
| 7 | The database returns the price rows it has on file. |
| 8 | The backend now runs the math and saves the results into the `stock_stats` table. It computes: **vol** = how much the price moves day to day (annualized volatility), **VaR** = the worst loss expected on a normal bad day at 95% confidence, **pivots** = the support and resistance levels traders watch (PP, R1 to R3, S1 to S3), and the **52-week range** = the highest and lowest price over the last year. |

**Stage 3: News and sentiment (every 30 minutes, every day)**

This stage runs on a faster cadence because news doesn't follow Tadawul trading hours. It pulls Arabic financial articles, scores their tone with an Arabic BERT model, and saves the results.

| Step | What's happening |
|------|------------------|
| 9 | Every 30 minutes the scheduler triggers the `news_pipeline` job. This one runs on Fridays and Saturdays too because Argaam publishes outside Tadawul hours. |
| 10 | The backend pulls articles from Argaam: 5 RSS feeds (general market, market pulse, companies, analysis and reports, petrochemicals and industry) plus the per-company news pages for the 4 covered stocks. |
| 11 | Argaam returns the article headlines, dates, and links. |
| 12 | The backend saves new articles into the `news_articles` table. Duplicates are blocked by a database constraint on (source, headline). |
| 13 | The backend asks the database for any articles that have not been scored yet (`is_analyzed = false`). This guarantees the same article is never analyzed twice. |
| 14 | The database returns the unscored articles. |
| 15 | The backend feeds the articles to MARBERTv2 (an Arabic BERT model) running on ONNX Runtime, in batches of 16 for speed. Each article gets a sentiment label (positive, negative, neutral) and a confidence score from 0 to 1. |
| 16 | The backend saves the scores into the `sentiment_scores` table. |

**Stage 4: Risk score, AI note, email alert (12:40 UTC, Sun to Thu)**

This is the main pipeline. It combines yesterday's stats with the last 14 days of sentiment, produces a single risk score per stock, asks DeepSeek to write a short Arabic explanation, and (only if the score actually moved) sends a threaded email to premium users.

| Step | What's happening |
|------|------------------|
| 17 | At 12:40 UTC the scheduler triggers the `compute_risk` job. |
| 18 | The backend pulls three things from the database: the latest `stock_stats`, the last 14 days of `sentiment_scores`, and recent `daily_prices`. |
| 19 | The database returns the rows. |
| 20 | The backend computes the composite risk score (75% from quantitative metrics like volatility and VaR, 25% from sentiment) and runs a 10,000-path Monte Carlo simulation to estimate the price distribution 30 days out. |
| 21 | The backend sends a strict Arabic prompt to OpenRouter (running DeepSeek) asking for a structured JSON note: a headline, a few paragraphs, and watch points. |
| 22 | OpenRouter returns the JSON note. |
| 23 | The backend validates the response. Three checks must pass: at least 60% of the characters are Arabic, every paragraph contains a digit (so the note is grounded in real numbers), and banned tokens like اشتري or توصية are rejected (we never give investment advice). If any check fails, a hand-written rule-based generator is used instead. |
| 24 | The backend writes the score into `risk_metrics` and the AI note into `risk_notes`. The dashboard reads these tables, so the user always sees the freshest numbers and narrative. |

Now the **`alt` block** decides whether to send an email:

| Step | What's happening |
|------|------------------|
| | **Path A — score moved 5 points or more (`risk_score_delta >= 5`)** |
| 25 | The backend sends an email through Resend. The Message-ID is generated deterministically from (user, symbol) plus the date, and the In-Reply-To header points at the previous email for that user and symbol. This makes Gmail group all of a user's alerts for one stock into a single thread instead of cluttering the inbox. |
| 26 | Resend confirms delivery. |
| 27 | The backend logs the send into the `sent_alerts` table so the next email can chain back to this one. |
| | **Path B — score moved less than 5 points (`risk_score_delta < 5`)** |
| | No email is sent (the difference is too small to justify pinging the user), but the new score and note from step 24 are already saved in the database. The dashboard still shows the update. |

**Stage 5: User browses or chats with the assistant**

This is the live request path. Most reads go straight from the React frontend to Supabase. The chat assistant takes a different path because it needs to enrich the question with context before sending it to the AI.

| Step | What's happening |
|------|------------------|
| 28 | The user opens a page in the React dashboard. The frontend calls Supabase directly using the JS SDK and the anonymous key. Row-Level Security policies on Supabase decide what data the user is allowed to see. |
| 29 | Supabase returns the data the page asked for (prices, stats, risk score, news, AI note). |
| 30 | When the user asks the assistant a question, the frontend POSTs the question to `/api/v1/assistant/chat` on the backend. |
| 31 | The backend builds a stock-aware context block (latest price, current risk score, sentiment summary, top news headlines) and forwards the user question plus that context to OpenRouter. |
| 32 | OpenRouter returns the AI reply. |
| 33 | The backend forwards the reply back to the frontend, which renders it in the chat panel. |

### Key behaviors

- `_has_fresh_prices()` gate: `compute_stats` and `compute_risk` skip a stock if no row exists in `daily_prices` from the last 5 calendar days. This handles weekends, holidays, and yfinance outages so stale risk scores never get written.
- News pipeline runs every 30 minutes on all days, because Argaam publishes outside Tadawul hours. Sentiment analysis only runs on `is_analyzed = false` rows so it never re-processes.
- Alert gating: risk-score deltas smaller than `ALERT_MIN_SCORE_DELTA` (default 5) are written to the DB but do not trigger an email. This prevents inbox fatigue.
- AI risk notes are generated in the same `compute_risk` pass, so the dashboard always has a current narrative when a user opens a stock.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7 |
| UI Components | Radix UI, Recharts, Lucide icons, shadcn/ui primitives |
| State | TanStack React Query, React Context |
| Backend | FastAPI, Python 3.10, Uvicorn |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (email/password) |
| ML Model | MARBERTv2 (Arabic sentiment) on ONNX Runtime, CPU |
| AI Chat and Notes | OpenRouter, DeepSeek-v4-pro |
| Market Data | yfinance (Tadawul OHLCV + TASI index) |
| News Sources | Argaam RSS (5 feeds) + Argaam company news pages |
| Email | Resend API (RFC-5322 thread-aware alerts) |
| Scheduler | APScheduler, cron triggers aligned to Tadawul hours |
| Hosting | Vercel (frontend + serverless), Railway (backend Docker) |

## Database Schema

PostgreSQL on Supabase with Row-Level Security. Public read for market data, authenticated write only for user-owned rows.

### Market data tables

```
stocks                     daily_prices               stock_stats
├── id (PK)                ├── id (PK)                ├── id (PK)
├── symbol (unique)        ├── stock_id (FK)          ├── stock_id (FK, unique)
├── name_ar                ├── trade_date             ├── daily_return_mean
├── name_en                ├── open / high / low      ├── daily_return_std
├── sector_ar / sector_en  ├── close / adj_close      ├── annual_return / volatility
├── market_cap             ├── volume                 ├── beta
├── description_ar         └── unique(stock_id,date)  ├── sharpe_ratio / sortino_ratio
├── is_active                                         ├── max_drawdown
└── currency                                          ├── var_95 / var_99 / cvar_95
                                                      ├── pivot_pp / r1 / r2 / r3
                                                      ├── pivot_s1 / s2 / s3
                                                      └── week_52_high / week_52_low
```

### News and sentiment

```
news_articles                       sentiment_scores
├── id (PK)                         ├── id (PK)
├── stock_id (FK, nullable)         ├── article_id (FK, unique)
├── source                          ├── stock_id (FK)
├── headline_ar / snippet_ar        ├── sentiment (positive|negative|neutral)
├── source_url                      ├── confidence (0 to 1)
├── published_at                    ├── model_version
├── is_analyzed                     ├── processing_ms
└── unique(source, headline_ar)     └── analyzed_at
```

### Risk, AI narrative, alert log

```
risk_metrics                        risk_notes                     sent_alerts
├── id (PK)                         ├── id (PK)                    ├── id (PK)
├── stock_id (FK)                   ├── stock_id (FK)              ├── user_id (FK auth.users)
├── overall_score (0 to 100)        ├── headline_ar                ├── symbol
├── quantitative_score              ├── paragraphs_ar (jsonb[])    ├── message_id (RFC-5322)
├── sentiment_score                 ├── watch_points_ar (jsonb[])  ├── in_reply_to
├── quant / sentiment weights       ├── source (ai|fallback)       ├── references_chain
├── interpretation_ar               ├── model_used                 ├── computed_at
├── monte_carlo_paths (jsonb)       ├── computed_at                ├── overall_score
├── computed_at                     └── unique(stock_id,           └── delivered_at
└── (multi-row, history allowed)        computed_at)
```

### User data

```
user_profiles                       user_watchlist                user_search_history
├── id (PK)                         ├── id (PK)                   ├── id (PK)
├── user_id (FK auth.users)         ├── user_id (FK)              ├── user_id (FK)
├── plan (free|premium)             ├── stock_id (FK)             ├── stock_symbol
├── email_alerts_enabled            ├── created_at                ├── searched_at
├── theme_preference                └── unique(user_id, stock_id) └── unique(user_id, stock_symbol)
├── dashboard_preferences (jsonb)
├── created_at
└── updated_at
```

Migrations live in [`supabase/migrations/`](supabase/migrations/). Apply them in alphabetical order.

## API Endpoints

### FastAPI (Railway)

All module routers are mounted under `/api/v1/` in [`backend/app/main.py`](backend/app/main.py).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | App health check |
| GET | `/api/v1/prices/{symbol}` | Latest OHLCV for a stock |
| GET | `/api/v1/prices/{symbol}/history` | Historical price series |
| GET | `/api/v1/risk/{symbol}` | Composite risk score with breakdown |
| GET | `/api/v1/risk/{symbol}/monte-carlo` | 10,000-path GBM simulation |
| GET | `/api/v1/news/{symbol}` | News articles for a stock |
| POST | `/api/v1/news/refresh` | Trigger a news fetch (admin) |
| GET | `/api/v1/sentiment/{symbol}` | Aggregated sentiment summary |
| POST | `/api/v1/sentiment/analyze` | Run MARBERT on unanalyzed articles |
| POST | `/api/v1/assistant/chat` | AI chat with stock context |
| GET | `/api/v1/assistant/health` | Assistant config status |

### Vercel serverless functions

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/chat` | AI chat proxy (DeepSeek via OpenRouter) |
| GET | `/api/tasi` | TASI index real-time data |

## Backend Modules

Located in [`backend/app/modules/`](backend/app/modules/).

| Module | Purpose | Has router |
|--------|---------|------------|
| `prices/` | Fetch OHLCV from yfinance, store in `daily_prices`, compute stats and pivot levels. | yes |
| `risk/` | VaR (historical and parametric), CVaR, GARCH(1,1), Monte Carlo (10,000 paths), Sharpe, Sortino, beta, max drawdown. | yes |
| `news/` | Argaam RSS feeds and Argaam company news pages. Arabic-keyword stock matching, dedup on `(source, headline_ar)`. | yes |
| `sentiment/` | MARBERTv2 on ONNX Runtime, financial keyword boost layer, batch inference (16 articles per batch). | yes |
| `assistant/` | OpenRouter (DeepSeek) chat with real-time stock context (price, risk, sentiment, news). | yes |
| `alerts/` | Email alert composition, RFC-5322 threading, Resend send. | internal |
| `notes/` | Generate Arabic risk-narrative notes via OpenRouter. Strict validator with rule-based fallback. | internal |

## Scheduler Jobs

Defined in [`backend/app/scheduler.py`](backend/app/scheduler.py). Times are in UTC. Tadawul calendar (Sun to Thu) unless noted.

| Job | Schedule | Pipeline | Reads | Writes |
|-----|----------|----------|-------|--------|
| `fetch_prices` | cron 12:30, Sun to Thu | PIPE-01 | yfinance | `daily_prices` |
| `compute_stats_and_pivots` | cron 12:35, Sun to Thu | PIPE-04 | `daily_prices` | `stock_stats` |
| `news_pipeline` | every 30 min, all days | PIPE-02 + PIPE-03 | Argaam RSS + company pages, `news_articles` | `news_articles`, `sentiment_scores` |
| `compute_risk` | cron 12:40, Sun to Thu | PIPE-05 + PIPE-06 + PIPE-07 | `daily_prices`, `stock_stats`, `sentiment_scores` | `risk_metrics`, `risk_notes`, `sent_alerts` |

Both `compute_stats_and_pivots` and `compute_risk` call `_has_fresh_prices(stock_id)` first. They skip the stock if no price row exists from the last 5 calendar days.

## AI Risk Notes

The `notes` module generates a short Arabic explanation of why a risk score changed. It is displayed in the `NabeehNotes` component on the stock detail page.

Generation flow (`backend/app/modules/notes/service.py`):

1. Build a `RiskNoteInput` from the current and previous `risk_metrics` rows. Includes delta, VaR%, vol%, sentiment%, price change%, and S/R break flag.
2. Call OpenRouter `deepseek-v4-pro` with `response_format: json_object`, reasoning disabled, and an Arabic system prompt that forbids investment advice.
3. Validate strictly:
   - JSON parses (strips code fences if needed).
   - Schema is `{ headline, paragraphs[], watch_points[] }` with bounds (4 to 200 chars headline, 2 to 4 paragraphs, 1 to 5 watch points).
   - Arabic-character ratio above 60% per segment.
   - Every paragraph contains at least one digit (numeric grounding).
   - Banned tokens are rejected: `اشتري`, `ابيع`, `بِع`, `توصية`, `نصيحة استثمارية`.
4. On any validation failure, the code falls back to `notes/fallback.py` (rule-based deterministic generator).

The result is upserted into `risk_notes` with `source = 'ai'` or `source = 'fallback'`.

## Email Alert Threading

The `alerts` module sends Resend emails when a stock's risk score crosses `ALERT_MIN_SCORE_DELTA`. Successive alerts for the same `(user, symbol)` pair are threaded into one Gmail or Apple Mail conversation using deterministic RFC-5322 message IDs (`backend/app/modules/alerts/threading.py`).

| Header | First send | Subsequent sends |
|--------|-----------|------------------|
| `Message-ID` | unique-this-send | unique-this-send |
| `In-Reply-To` | (none) | last-sent ID |
| `References` | (none) | root + chain (up to 5 prior) |
| Subject | `تنبيه نبيه - <symbol>` | `Re: تنبيه نبيه - <symbol>` |

Outgoing alerts are persisted in `sent_alerts` for auditability and to construct the `References` chain on the next send.

## Risk Score Calculation

The composite risk score (0 to 100) combines two blocks. Weights live in `backend/app/tasks/compute_risk.py`.

- Quantitative (75%)
  - 40% from VaR 95% (historical)
  - 35% from annualized volatility
  - Max drawdown, GARCH forecast, beta, Sharpe, and Sortino are computed for context
- Sentiment (25%): average MARBERT sentiment over the last 14 days of news for that stock

Risk levels:

| Score | Level | Color |
|-------|-------|-------|
| 0 to 33 | Low | green |
| 34 to 66 | Medium | yellow |
| 67 to 100 | High | red |

These thresholds are mirrored in the frontend (`dashboard/src/utils/riskScore.ts`, `RiskScoreGauge.tsx`, `RiskBreakdown.tsx`).
