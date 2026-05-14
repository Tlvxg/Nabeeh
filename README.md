# Nabeeh (نبيه)

**Saudi stock risk analysis platform with Arabic-first explanations.**

Nabeeh combines classical financial risk models (Value at Risk, GARCH, Monte Carlo) with Arabic news sentiment analysis to produce a single, easy-to-understand risk score for Tadawul stocks. The dashboard is built in Arabic and uses right-to-left layout throughout. Where most retail risk tools show traders a wall of metrics, Nabeeh distills everything into one number on a 0–100 scale and explains it in plain Arabic.

## Problem and motivation

Beginner investors on Tadawul face two practical problems. First, the metrics that professionals use to judge risk — VaR, volatility, beta, drawdown — are dense and almost always presented in English. Second, the news that moves Saudi stocks is published in Arabic on outlets like Argaam, but the sentiment tools that financial platforms ship with are trained on English-language news from foreign markets, so they miss the signal.

Nabeeh addresses both gaps. It runs the same risk math that institutional tools use, but renders the result as one risk score with a plain-Arabic explanation. And it analyses Arabic financial news using a model (MARBERTv2) trained specifically on Arabic text, so the sentiment signal is actually relevant to the Saudi market.

## What Nabeeh does

- Tracks four Tadawul stocks — Saudi Aramco (2222), SABIC (2010), Al Rajhi Bank (1120), STC (7010) — plus the TASI index.
- Downloads daily price data and computes the full risk picture every trading day: VaR at 95%, annualised volatility, GARCH(1,1) forecast, 10,000-path Monte Carlo simulation, Sharpe and Sortino ratios, max drawdown, beta against TASI, and pivot points.
- Pulls Arabic financial news from Argaam (five RSS feeds plus per-company news pages) and scores every article for sentiment using MARBERTv2 on ONNX Runtime.
- Combines the quantitative metrics (weighted 75%) with the recent sentiment (weighted 25%) into a single risk score from 0 to 100.
- Generates a short Arabic explanation of the score using DeepSeek, validated against strict rules so the model never gives investment advice or hallucinates numbers.
- Sends a threaded email alert to premium users when the score moves enough to matter, using RFC-5322 message IDs so successive updates collapse into one Gmail conversation per stock.
- Offers an Arabic AI chat assistant that answers questions about specific stocks with real-time price and risk context.

## How the system works

The backend runs as a scheduled pipeline rather than computing things on demand, so the dashboard always loads instantly:

1. **12:30 UTC** — Daily prices fetched from Yahoo Finance for the four stocks and TASI.
2. **12:35 UTC** — Statistics, volatility, VaR, and pivot levels computed from the price history.
3. **12:40 UTC** — The composite risk score and Monte Carlo simulation are computed. DeepSeek is prompted for an Arabic explanation, which is validated and saved (or replaced with a rule-based fallback if validation fails). Premium users with material score changes get a threaded email.
4. **Every 30 minutes, every day** — Arabic news is fetched from Argaam, deduplicated, and any unscored article is run through MARBERTv2.

The React dashboard reads everything directly from Supabase using row-level security. Users see prices, charts, the risk score, the Arabic explanation, sentiment trends, and recent news. The chat assistant goes through the backend so it can enrich each question with current stock context before forwarding it to the AI model.

The architecture diagram, a sequence-diagram walkthrough of every step above, and the full database schema are in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## How it was built

- **Frontend**: React (TypeScript) for the dashboard, Arabic RTL throughout, deployed on Vercel.
- **Backend**: FastAPI in Python, running in a Docker container on Railway, with APScheduler driving the daily pipeline.
- **Database**: Supabase (PostgreSQL) with Row-Level Security policies — public read for market data, owner-only access for user data.
- **Arabic sentiment**: MARBERTv2 converted to ONNX Runtime so it runs on CPU without a GPU.
- **AI explanations and chat**: DeepSeek-v4-pro via OpenRouter.
- **Market data**: yfinance for OHLCV and the TASI index.
- **News**: Argaam (RSS feeds plus per-company news pages).
- **Email alerts**: Resend with RFC-5322 thread-aware Message-IDs.

## Risk score

The composite score (0–100) is computed once per trading day and stored, so the dashboard never has to recompute it:

| Block | Weight | Inputs |
|-------|--------|--------|
| Quantitative | 75% | VaR 95% (40%), annualised volatility (35%); GARCH, max drawdown, beta, Sharpe, Sortino computed for context |
| Sentiment | 25% | Average MARBERT sentiment over the last 14 days of news |

| Score | Level | Colour |
|-------|-------|--------|
| 0–33 | Low | Green |
| 34–66 | Medium | Yellow |
| 67–100 | High | Red |

These thresholds are the single source of truth — the frontend reads them from the same risk score the backend wrote.

## Project scope

This was developed as a graduation project (GP2). The covered stocks are deliberately limited to four large-cap Tadawul names plus the index, because the goal was to demonstrate end-to-end depth — daily pipeline, Arabic sentiment model, AI explanation, threaded alerts — rather than coverage breadth. Adding a new stock requires only a row in the `stocks` table; the pipeline picks it up on the next scheduled run.

The system has been deployed and is publicly reachable: the dashboard runs on Vercel, the backend on Railway, and Supabase hosts the database. All three are shared between the development and demo environments.

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Architecture diagram, end-to-end sequence diagram with step-by-step explanations, full database schema, API endpoints, scheduler jobs, AI note generation flow, email threading rules, and the risk score formula.
- **[catalog.md](catalog.md)** — Folder-by-folder code map covering the backend modules, the React pages, components, hooks, and services, the SQL migrations, and every script.

## Authorship

Graduation project (GP2). All code authored by the project team.

External libraries are used under their respective licenses; see `backend/requirements.txt` and `dashboard/package.json`.
