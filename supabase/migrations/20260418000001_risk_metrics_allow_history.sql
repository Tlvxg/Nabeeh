-- Allow multiple risk_metrics rows per stock for historical comparison.
-- The backend keeps only the 2 most recent rows per stock.
-- Frontend queries use ORDER BY computed_at DESC LIMIT 1/2.

ALTER TABLE risk_metrics DROP CONSTRAINT IF EXISTS risk_metrics_stock_id_key;

CREATE INDEX IF NOT EXISTS idx_risk_metrics_stock_computed
  ON risk_metrics (stock_id, computed_at DESC);
