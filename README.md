# Nabeeh (نبيه)

Saudi stock risk analysis platform. Combines quantitative models (VaR, GARCH, Monte Carlo) with Arabic news sentiment to produce one risk score per Tadawul stock.

## What it does

- Tracks 4 Tadawul stocks (Aramco, SABIC, Al Rajhi, STC) plus the TASI index.
- Pulls daily prices, fetches Arabic financial news from Argaam, and runs Arabic sentiment analysis on every article.
- Produces one risk score (0–100) per stock every trading day.
- Explains the score in plain Arabic using an AI model.
- Sends a threaded email alert to premium users when the score moves enough to matter.

## How it was built

- **Frontend**: React for the dashboard, Arabic RTL, deployed on Vercel.
- **Backend**: FastAPI in Python, deployed on Railway, with a scheduler that runs the daily pipeline.
- **Database**: Supabase (PostgreSQL) with row-level security.
- **AI**: Arabic sentiment model (MARBERTv2) for news, DeepSeek for chat and Arabic risk explanations.
- **Market data**: yfinance for prices, Argaam for news.

## Documentation

- Architecture diagrams, data flow, database schema, and API reference: see [ARCHITECTURE.md](ARCHITECTURE.md).
- Folder-by-folder code map: see [catalog.md](catalog.md).

## Authorship

Graduation project (GP2). All code authored by the project team.
