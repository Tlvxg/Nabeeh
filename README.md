# Nabeeh (نبيه)

Saudi stock risk analysis platform.

## How it works

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

**Daily pipeline (Tadawul calendar, UTC):**

```
12:30 ──▶ fetch_prices         (yfinance → daily_prices)
12:35 ──▶ compute_stats        (daily_prices → stock_stats)
12:40 ──▶ compute_risk         (stats + sentiment → risk_metrics)
       │                        ──▶ DeepSeek note → risk_notes
       └──▶ alert if Δscore≥5  ──▶ Resend → sent_alerts

every 30 min ──▶ news_pipeline (Argaam → news_articles → MARBERT → sentiment_scores)
```

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

## More

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — sequence diagram with step-by-step explanation, full database schema, API endpoints, scheduler jobs, AI note flow, email threading.
- **[catalog.md](catalog.md)** — folder-by-folder code map.

Graduation project (GP2).
