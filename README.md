# Nabeeh (نبيه)

Nabeeh is a Saudi stock risk analysis platform built for the Tadawul market. It combines classical financial risk models — Value at Risk, GARCH, Monte Carlo, volatility, and beta — with Arabic news sentiment analysis to produce a single risk score per stock. The dashboard is Arabic-first and uses right-to-left layout throughout, so beginner investors can read a clear explanation of risk in their own language instead of decoding English financial metrics.

The system currently covers four large-cap Tadawul stocks — Saudi Aramco (2222), SABIC (2010), Al Rajhi Bank (1120), and STC (7010) — plus the TASI index for beta calculation.

## Features

- **Composite risk score (0–100)** per stock, recomputed every trading day.
- **Arabic news sentiment** using MARBERTv2 on ONNX Runtime, scoring articles from Argaam RSS feeds and company news pages.
- **Daily quantitative pipeline** that computes VaR (95% and 99%), CVaR, GARCH(1,1), 10,000-path Monte Carlo simulation, Sharpe and Sortino ratios, max drawdown, beta against TASI, and pivot levels.
- **AI-generated Arabic risk explanations** via DeepSeek-v4-pro, with strict validation (Arabic ratio, numeric grounding, banned-token filter) and a rule-based fallback so the user never sees a bad note.
- **Threaded email alerts** when the risk score moves enough to matter, using deterministic RFC-5322 Message-IDs so successive updates collapse into one Gmail thread per stock.
- **Arabic AI chat assistant** that answers questions about a specific stock, enriched with current price, risk, and sentiment context.
- **Authenticated user accounts** with free and premium tiers, watchlists, and a search history.

## Architecture

The system is split across three managed platforms. The React frontend lives on Vercel and reads market data straight from Supabase using the JS SDK and a public anonymous key, with Row-Level Security policies controlling what each user can see. The FastAPI backend runs in a Docker container on Railway and is the only component that writes to the database. A scheduler inside the backend runs the daily pipeline at fixed times aligned to the Tadawul trading calendar. External services — Yahoo Finance for prices, Argaam for news, OpenRouter for AI, and Resend for email — are all called from the backend, never from the browser.

```
┌─────────────────────────────────────────────────────────────────┐
│                          VERCEL                                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA — Dashboard + Landing (Arabic RTL)            │   │
│  │  /, /login, /register, /dashboard, /search,              │   │
│  │  /stock/:symbol, /news, /chat, /settings, /upgrade       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
            │                                │
            │  Supabase JS SDK               │  REST API
            ▼                                ▼
┌──────────────────────┐         ┌──────────────────────────────────┐
│      SUPABASE        │         │            RAILWAY               │
│                      │         │                                  │
│  PostgreSQL          │◄────────│  FastAPI Backend                 │
│  Auth (users)        │         │  ├── prices    (yfinance)        │
│  Row-Level Security  │         │  ├── risk      (VaR, GARCH, MC)  │
│                      │         │  ├── news      (Argaam RSS)      │
│  Tables:             │         │  ├── sentiment (MARBERTv2 ONNX)  │
│  - stocks            │         │  ├── assistant (DeepSeek chat)   │
│  - daily_prices      │         │  ├── alerts    (Resend threading)│
│  - stock_stats       │         │  ├── notes     (AI Arabic notes) │
│  - news_articles     │         │  └── APScheduler (cron jobs)     │
│  - sentiment_scores  │         │                                  │
│  - risk_metrics      │         │  Docker, Python 3.10             │
│  - risk_notes        │         └──────────────────────────────────┘
│  - sent_alerts       │                       │
│  - user_profiles     │             ┌─────────┴──────────┐
│  - user_watchlist    │             │   External APIs    │
│  - user_search_…     │             │  - yfinance        │
└──────────────────────┘             │  - Argaam RSS      │
                                     │  - OpenRouter      │
                                     │  - Resend (email)  │
                                     └────────────────────┘
```

The backend is organised into seven modules under `backend/app/modules/`. Five of them — prices, risk, news, sentiment, and assistant — expose HTTP routers. The remaining two — alerts and notes — are internal services that the scheduler invokes during the daily pipeline. The complete sequence diagram of how data flows through these modules each day is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router |
| UI | Radix UI, Recharts, Lucide icons, shadcn/ui |
| State | TanStack React Query, React Context |
| Backend | FastAPI, Python 3.10, Uvicorn |
| Database | Supabase (PostgreSQL) + Row-Level Security |
| Auth | Supabase Auth |
| Arabic sentiment | MARBERTv2 on ONNX Runtime (CPU) |
| AI chat + notes | DeepSeek-v4-pro via OpenRouter |
| Market data | yfinance (4 Tadawul stocks + TASI) |
| News | Argaam RSS + company pages |
| Email | Resend (RFC-5322 threaded alerts) |
| Scheduler | APScheduler |
| Hosting | Vercel (frontend) + Railway (backend) |

## Documentation

For the full sequence diagram of the daily pipeline, the database schema, the API reference, the AI note validation rules, and the email threading scheme, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

For a folder-by-folder map of the backend modules, the React pages and components, the hooks and services, the SQL migrations, and the scripts, see **[catalog.md](catalog.md)**.

## Authorship

Graduation project (GP2). All code authored by the project team. External libraries are used under their respective licenses (see `backend/requirements.txt` and `dashboard/package.json`).
