-- Add 52-week high/low columns to stock_stats table
-- These are computed from daily_prices (max high_price, min low_price over 365 days)

ALTER TABLE stock_stats
  ADD COLUMN IF NOT EXISTS week_52_high numeric,
  ADD COLUMN IF NOT EXISTS week_52_low numeric;
