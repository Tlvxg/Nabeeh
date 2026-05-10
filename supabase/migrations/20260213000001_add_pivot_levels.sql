-- ============================================
-- NABEEH v2.5 DATABASE MIGRATION
-- Migration 002: Add pivot_levels table
-- Stores classic pivot point support/resistance levels
-- ============================================

-- ============================================
-- TABLE: pivot_levels
-- Daily pivot point S/R levels computed from previous day's H/L/C
-- ============================================
CREATE TABLE IF NOT EXISTS pivot_levels (
    id           SERIAL PRIMARY KEY,
    stock_id     INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    trade_date   DATE NOT NULL,
    pivot_point  DECIMAL(12,4) NOT NULL,
    r1           DECIMAL(12,4) NOT NULL,
    r2           DECIMAL(12,4) NOT NULL,
    r3           DECIMAL(12,4) NOT NULL,
    s1           DECIMAL(12,4) NOT NULL,
    s2           DECIMAL(12,4) NOT NULL,
    s3           DECIMAL(12,4) NOT NULL,
    source_high  DECIMAL(12,4) NOT NULL,
    source_low   DECIMAL(12,4) NOT NULL,
    source_close DECIMAL(12,4) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(stock_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_pivot_levels_stock_date
    ON pivot_levels (stock_id, trade_date DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- Public read, service-role write (same pattern as daily_prices)
-- ============================================
ALTER TABLE pivot_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pivots" ON pivot_levels
    FOR SELECT USING (true);

CREATE POLICY "Service write pivots" ON pivot_levels
    FOR ALL USING (true) WITH CHECK (true);
