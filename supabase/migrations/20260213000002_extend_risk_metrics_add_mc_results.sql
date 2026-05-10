-- ============================================
-- NABEEH v2.5 DATABASE SCHEMA UPDATE
-- Migration 003: Extend risk_metrics + create monte_carlo_results
-- Purpose: Pre-computed risk metrics and Monte Carlo simulation storage
-- ============================================

-- ============================================
-- EXTEND risk_metrics table with raw risk data columns
-- ============================================
ALTER TABLE risk_metrics
  ADD COLUMN IF NOT EXISTS var_95_hist NUMERIC,
  ADD COLUMN IF NOT EXISTS var_99_hist NUMERIC,
  ADD COLUMN IF NOT EXISTS cvar_95 NUMERIC,
  ADD COLUMN IF NOT EXISTS vol_30d NUMERIC,
  ADD COLUMN IF NOT EXISTS vol_252d NUMERIC,
  ADD COLUMN IF NOT EXISTS ewma_vol NUMERIC,
  ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC,
  ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS sortino_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS beta NUMERIC,
  ADD COLUMN IF NOT EXISTS lookback_days INTEGER,
  ADD COLUMN IF NOT EXISTS sr_break_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sr_break_level TEXT,
  ADD COLUMN IF NOT EXISTS trigger TEXT DEFAULT 'scheduled';

-- ============================================
-- CREATE monte_carlo_results table
-- Stores pre-computed Monte Carlo simulation results
-- ============================================
CREATE TABLE IF NOT EXISTS monte_carlo_results (
  id                SERIAL PRIMARY KEY,
  stock_id          INTEGER NOT NULL REFERENCES stocks(id),
  percentiles       JSONB NOT NULL,           -- {p5: [...], p25: [...], p50: [...], p75: [...], p95: [...]}
  mc_var_95         NUMERIC NOT NULL,
  mc_var_99         NUMERIC NOT NULL,
  mc_cvar_95        NUMERIC NOT NULL,
  days              INTEGER NOT NULL DEFAULT 252,
  paths             INTEGER NOT NULL DEFAULT 10000,
  annual_volatility NUMERIC,
  daily_drift       NUMERIC,
  data_points_used  INTEGER,
  elapsed_ms        NUMERIC,
  trigger           TEXT DEFAULT 'scheduled',  -- 'scheduled' | 'sr_break' | 'manual'
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stock_id)                             -- only keep latest result per stock
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_mc_results_stock ON monte_carlo_results(stock_id);

-- RLS: public read, service role write
ALTER TABLE monte_carlo_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read monte_carlo_results" ON monte_carlo_results
  FOR SELECT USING (true);
CREATE POLICY "Service write monte_carlo_results" ON monte_carlo_results
  FOR ALL USING (true) WITH CHECK (true);
