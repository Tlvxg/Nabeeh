-- ============================================
-- NABEEH v2.0 DATABASE SCHEMA
-- Supabase PostgreSQL
-- Migration 001: Initial schema
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- Trigram search (Arabic)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID generation

-- ============================================
-- TABLE 1: stocks
-- Master stock data (Aramco only for MVP)
-- ============================================
CREATE TABLE IF NOT EXISTS stocks (
    id              SERIAL PRIMARY KEY,
    symbol          TEXT UNIQUE NOT NULL,
    name_ar         TEXT NOT NULL,
    name_en         TEXT NOT NULL,
    sector_ar       TEXT,
    sector_en       TEXT,
    market_cap      BIGINT,
    currency        TEXT NOT NULL DEFAULT 'SAR',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TABLE 2: daily_prices
-- Historical OHLCV data (one row per stock per trading day)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_prices (
    id              SERIAL PRIMARY KEY,
    stock_id        INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    trade_date      DATE NOT NULL,
    open_price      DECIMAL(12,4) NOT NULL,
    high_price      DECIMAL(12,4) NOT NULL,
    low_price       DECIMAL(12,4) NOT NULL,
    close_price     DECIMAL(12,4) NOT NULL,
    adj_close       DECIMAL(12,4) NOT NULL,
    volume          BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(stock_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_stock_date
    ON daily_prices (stock_id, trade_date DESC);

-- ============================================
-- TABLE 3: stock_stats
-- Computed statistics (refreshed daily after market close)
-- ============================================
CREATE TABLE IF NOT EXISTS stock_stats (
    id                  SERIAL PRIMARY KEY,
    stock_id            INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    daily_return_mean   DECIMAL(12,8) NOT NULL,
    daily_return_std    DECIMAL(12,8) NOT NULL,
    annual_return       DECIMAL(10,6),
    annual_volatility   DECIMAL(10,6),
    beta                DECIMAL(8,6),
    sharpe_ratio        DECIMAL(8,6),
    max_drawdown        DECIMAL(10,6),
    var_95              DECIMAL(10,6),
    var_99              DECIMAL(10,6),
    cvar_95             DECIMAL(10,6),
    lookback_days       INT NOT NULL DEFAULT 252,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(stock_id)
);

-- ============================================
-- TABLE 4: news_articles
-- Fetched news articles (before sentiment analysis)
-- ============================================
CREATE TABLE IF NOT EXISTS news_articles (
    id              SERIAL PRIMARY KEY,
    stock_id        INT REFERENCES stocks(id) ON DELETE SET NULL,
    source          TEXT NOT NULL,
    headline_ar     TEXT NOT NULL,
    snippet_ar      TEXT,
    source_url      TEXT,
    author          TEXT,
    published_at    TIMESTAMPTZ NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_analyzed     BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(source, headline_ar)
);

CREATE INDEX IF NOT EXISTS idx_news_stock_date
    ON news_articles (stock_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_unanalyzed
    ON news_articles (is_analyzed) WHERE is_analyzed = false;

-- ============================================
-- TABLE 5: sentiment_scores
-- MARBERTv2 sentiment analysis results
-- ============================================
CREATE TABLE IF NOT EXISTS sentiment_scores (
    id              SERIAL PRIMARY KEY,
    article_id      INT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    stock_id        INT REFERENCES stocks(id) ON DELETE SET NULL,
    sentiment       TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    confidence      DECIMAL(5,4) NOT NULL,
    model_version   TEXT NOT NULL DEFAULT 'marbert-v2-onnx',
    processing_ms   DECIMAL(8,2),
    analyzed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(article_id)
);

CREATE INDEX IF NOT EXISTS idx_sentiment_stock_date
    ON sentiment_scores (stock_id, analyzed_at DESC);

-- ============================================
-- TABLE 6: risk_metrics
-- Pre-computed composite risk metrics
-- ============================================
CREATE TABLE IF NOT EXISTS risk_metrics (
    id                  SERIAL PRIMARY KEY,
    stock_id            INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    overall_score       DECIMAL(4,2) NOT NULL,
    quantitative_score  DECIMAL(4,2) NOT NULL,
    sentiment_score     DECIMAL(4,2) NOT NULL,
    quantitative_weight DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    sentiment_weight    DECIMAL(3,2) NOT NULL DEFAULT 0.30,
    interpretation_ar   TEXT,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(stock_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- Public read access to all market data
-- ============================================

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read stocks" ON stocks FOR SELECT USING (true);
CREATE POLICY "Service write stocks" ON stocks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read prices" ON daily_prices FOR SELECT USING (true);
CREATE POLICY "Service write prices" ON daily_prices FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE stock_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read stats" ON stock_stats FOR SELECT USING (true);
CREATE POLICY "Service write stats" ON stock_stats FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news" ON news_articles FOR SELECT USING (true);
CREATE POLICY "Service write news" ON news_articles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sentiment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sentiment" ON sentiment_scores FOR SELECT USING (true);
CREATE POLICY "Service write sentiment" ON sentiment_scores FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE risk_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read risk" ON risk_metrics FOR SELECT USING (true);
CREATE POLICY "Service write risk" ON risk_metrics FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SEED DATA
-- Insert Aramco as the initial stock
-- ============================================
INSERT INTO stocks (symbol, name_ar, name_en, sector_ar, sector_en)
VALUES ('2222', 'أرامكو السعودية', 'Saudi Aramco', 'الطاقة', 'Energy')
ON CONFLICT (symbol) DO NOTHING;
