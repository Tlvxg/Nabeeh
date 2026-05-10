/**
 * TypeScript types for stock data, matching backend Pydantic schemas.
 * @see backend/app/modules/prices/schemas.py
 */

/** Current stock price data (matches StockPriceResponse). */
export interface StockPrice {
  symbol: string
  name_ar: string
  name_en: string
  price: number
  change: number
  change_percent: number
  volume: number
  market_cap: number | null
  currency: string
  last_updated: string
  day_high: number | null
  day_low: number | null
  prev_close: number | null
  week_52_high: number | null
  week_52_low: number | null
  sector_ar: string | null
  description_ar: string | null
  description_en: string | null
}

/** Single OHLCV data point (matches OHLCVItem). */
export interface OHLCVItem {
  date: string
  open: number
  high: number
  low: number
  close: number
  adj_close: number
  volume: number
}

/** Historical OHLCV data response (matches OHLCVResponse). */
export interface OHLCVResponse {
  symbol: string
  period: string
  interval: string
  count: number
  data: OHLCVItem[]
}

/** Computed stock statistics (matches StockStatsResponse). */
export interface StockStats {
  symbol: string
  daily_return_mean: number
  daily_return_std: number
  annual_return: number
  annual_volatility: number
  beta: number | null
  lookback_days: number
  updated_at: string
}

/** Market open/closed status. */
export interface MarketStatus {
  is_open: boolean
  status_ar: string
  next_open: string | null
}

/** TASI index data (matches TASIIndexResponse). */
export interface TASIIndex {
  value: number
  change: number
  change_percent: number
  volume: number
  trades: number | null
  day_high: number | null
  day_low: number | null
  prev_close: number | null
  last_updated: string
}

/** Monte Carlo simulation result (matches MonteCarloResponse). */
export interface MonteCarloResult {
  symbol: string
  percentiles: {
    p5: number[]
    p25: number[]
    p50: number[]
    p75: number[]
    p95: number[]
  }
  mc_var_95: number
  mc_var_99: number
  mc_cvar_95: number
  days: number
  paths: number
  elapsed_ms: number
  annual_volatility?: number
  daily_drift?: number
  data_points_used?: number
}

/** Single news article enriched with sentiment data (matches NewsWithSentimentResponse). */
export interface NewsWithSentiment {
  id: number
  source: string
  headline_ar: string
  snippet_ar: string | null
  source_url: string | null
  published_at: string
  sentiment: string | null   // "positive" | "negative" | "neutral" | null
  confidence: number | null
  stock_symbol: string | null
  stock_name_ar: string | null
}

/** Aggregate sentiment breakdown for a stock's news (matches SentimentSummaryResponse). */
export interface SentimentSummary {
  total_articles: number
  positive_count: number
  negative_count: number
  neutral_count: number
  positive_pct: number
  negative_pct: number
  neutral_pct: number
  avg_confidence: number
}

/** VaR confidence level detail. */
export interface VaRConfidenceLevel {
  historical: number
}

/** GARCH forecast single day. */
export interface GARCHForecastDay {
  day: number
  vol_annualized: number
}

/** Aggregated risk metrics summary (matches RiskSummaryResponse). */
export interface RiskMetrics {
  symbol: string
  var: {
    symbol: string
    confidence_levels: Record<string, VaRConfidenceLevel>
    cvar_95: number
    lookback_days: number
  }
  volatility: {
    symbol: string
    vol_30d: number
    vol_252d: number
    ewma_vol: number
    lookback_days: number
  }
  drawdown: {
    symbol: string
    max_drawdown: number
    peak_date: string
    trough_date: string
    recovery_date: string | null
  }
  ratios: {
    symbol: string
    sharpe_ratio: number
    sortino_ratio: number
    risk_free_rate: number
  }
  garch: {
    symbol: string
    converged: boolean
    forecast_days: GARCHForecastDay[]
    params: { omega: number; alpha: number; beta: number } | null
    fallback_ewma: number | null
  } | null
  beta: {
    symbol: string
    beta: number
    benchmark: string
    lookback_days: number
  } | null
}
