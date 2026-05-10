/**
 * Supabase query layer — typed functions for direct database reads.
 *
 * Replaces backend API calls for price, history, stats, risk, MC, news, and sentiment data.
 * All functions return data matching existing TypeScript types exactly.
 */

import { supabase } from '../config/supabase.ts'
import type { AnalysisPreferences } from '../types/preferences.ts'
import { DEFAULT_PREFS } from '../types/preferences.ts'

// ---------------------------------------------------------------------------
// User profile types
// ---------------------------------------------------------------------------

export interface UserProfile {
  plan: 'free' | 'premium'
  email_alerts_enabled: boolean
  theme_preference: 'light' | 'dark'
  /**
   * Analysis dashboard preferences (indicator toggles, risk toggles, MC horizon).
   * Stored as JSONB in user_profiles.dashboard_preferences.
   * May be undefined/null if column hasn't been added yet or user has no prefs.
   */
  dashboard_preferences?: AnalysisPreferences
}

import type {
  StockPrice,
  OHLCVItem,
  OHLCVResponse,
  StockStats,
  RiskMetrics,
  MonteCarloResult,
  NewsWithSentiment,
  SentimentSummary,
} from '../types/stock.ts'

// ---------------------------------------------------------------------------
// 0. Active stocks list
// ---------------------------------------------------------------------------

/**
 * Fetch all active stocks from the database.
 * Used by dashboard, sidebar, and search to dynamically list available stocks.
 */
export async function fetchActiveStocks(): Promise<{
  id: number
  symbol: string
  name_ar: string
  name_en: string
  sector: string
  description_ar: string | null
  description_en: string | null
}[]> {
  const { data, error } = await supabase
    .from('stocks')
    .select('id, symbol, name_ar, name_en, sector_ar, sector_en, description_ar, description_en')
    .eq('is_active', true)
    .order('symbol')
  if (error) throw new Error(`Failed to fetch stocks: ${error.message}`)
  return (data ?? []).map(row => ({
    id: row.id as number,
    symbol: row.symbol as string,
    name_ar: row.name_ar as string,
    name_en: row.name_en as string,
    sector: (row.sector_ar as string) ?? (row.sector_en as string) ?? '',
    description_ar: (row.description_ar as string | null) ?? null,
    description_en: (row.description_en as string | null) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Helper: stock ID cache (stock IDs never change at runtime)
// ---------------------------------------------------------------------------

const stockIdCache = new Map<string, number>()

/**
 * Resolve a stock symbol (e.g. "2222") to its `stocks.id` primary key.
 * Caches results in-memory so repeated calls avoid extra queries.
 */
export async function getStockIdBySymbol(symbol: string): Promise<number> {
  const cached = stockIdCache.get(symbol)
  if (cached !== undefined) return cached

  const { data, error } = await supabase
    .from('stocks')
    .select('id')
    .eq('symbol', symbol)
    .single()

  if (error || !data) {
    throw new Error(`Stock not found for symbol "${symbol}": ${error?.message ?? 'no data'}`)
  }

  stockIdCache.set(symbol, data.id as number)
  return data.id as number
}

// ---------------------------------------------------------------------------
// 1. Stock price (latest + previous day)
// ---------------------------------------------------------------------------

/**
 * Fetch the current stock price by reading the two most recent daily_prices
 * rows joined with stock metadata from the `stocks` table.
 */
export async function fetchStockPriceFromSupabase(symbol: string): Promise<StockPrice> {
  // Fetch stock metadata
  const { data: stock, error: stockErr } = await supabase
    .from('stocks')
    .select('id, symbol, name_ar, name_en, market_cap, currency, sector_ar, description_ar, description_en')
    .eq('symbol', symbol)
    .single()

  if (stockErr || !stock) {
    throw new Error(`Stock lookup failed for "${symbol}": ${stockErr?.message ?? 'not found'}`)
  }

  // Cache the stock ID while we have it
  stockIdCache.set(symbol, stock.id as number)

  // Fetch the two most recent price rows
  const { data: prices, error: priceErr } = await supabase
    .from('daily_prices')
    .select('*')
    .eq('stock_id', stock.id)
    .order('trade_date', { ascending: false })
    .limit(2)

  if (priceErr) {
    throw new Error(`Price query failed for "${symbol}": ${priceErr.message}`)
  }

  if (!prices || prices.length === 0) {
    throw new Error(`No price data found for "${symbol}"`)
  }

  const latest = prices[0]
  const prev = prices.length > 1 ? prices[1] : null

  const closePrice = Number(latest.close_price)
  const prevClose = prev ? Number(prev.close_price) : null
  const change = prevClose !== null ? closePrice - prevClose : 0
  const changePct = prevClose !== null && prevClose !== 0
    ? (change / prevClose) * 100
    : 0

  // Fetch 52-week range from stock_stats
  const { data: stats } = await supabase
    .from('stock_stats')
    .select('week_52_high, week_52_low')
    .eq('stock_id', stock.id)
    .single()

  return {
    symbol: stock.symbol as string,
    name_ar: stock.name_ar as string,
    name_en: stock.name_en as string,
    price: closePrice,
    change,
    change_percent: changePct,
    volume: Number(latest.volume),
    market_cap: stock.market_cap !== null ? Number(stock.market_cap) : null,
    currency: stock.currency as string,
    last_updated: latest.trade_date as string,
    day_high: Number(latest.high_price),
    day_low: Number(latest.low_price),
    prev_close: prevClose,
    week_52_high: stats?.week_52_high ? Number(stats.week_52_high) : null,
    week_52_low: stats?.week_52_low ? Number(stats.week_52_low) : null,
    sector_ar: (stock.sector_ar as string | null) ?? null,
    description_ar: (stock.description_ar as string | null) ?? null,
    description_en: (stock.description_en as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// 2. Stock history (OHLCV)
// ---------------------------------------------------------------------------

/**
 * Fetch historical OHLCV data from Supabase `daily_prices`.
 *
 * @param symbol  Stock symbol (e.g. "2222")
 * @param days    Number of most-recent trading days to return. Omit for all data.
 */
export async function fetchStockHistoryFromSupabase(
  symbol: string,
  days?: number,
): Promise<OHLCVResponse> {
  const stockId = await getStockIdBySymbol(symbol)

  let query = supabase
    .from('daily_prices')
    .select('*')
    .eq('stock_id', stockId)
    .order('trade_date', { ascending: false })

  if (days !== undefined) {
    query = query.limit(days)
  }

  const { data: rows, error } = await query

  if (error) {
    throw new Error(`History query failed for "${symbol}": ${error.message}`)
  }

  if (!rows || rows.length === 0) {
    return { symbol, period: days ? `${days}d` : 'all', interval: '1d', count: 0, data: [] }
  }

  // Rows came DESC; reverse to ASC for charting
  const sorted = rows.reverse()

  const data: OHLCVItem[] = sorted.map((r) => ({
    date: r.trade_date as string,
    open: Number(r.open_price),
    high: Number(r.high_price),
    low: Number(r.low_price),
    close: Number(r.close_price),
    adj_close: Number(r.adj_close),
    volume: Number(r.volume),
  }))

  return {
    symbol,
    period: days ? `${days}d` : 'all',
    interval: '1d',
    count: data.length,
    data,
  }
}

// ---------------------------------------------------------------------------
// 3. Stock stats
// ---------------------------------------------------------------------------

/**
 * Fetch computed statistics from Supabase `stock_stats` table.
 */
export async function fetchStockStatsFromSupabase(symbol: string): Promise<StockStats> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('stock_stats')
    .select('*')
    .eq('stock_id', stockId)
    .single()

  if (error || !data) {
    throw new Error(`Stats query failed for "${symbol}": ${error?.message ?? 'no data'}`)
  }

  return {
    symbol,
    daily_return_mean: Number(data.daily_return_mean),
    daily_return_std: Number(data.daily_return_std),
    annual_return: Number(data.annual_return),
    annual_volatility: Number(data.annual_volatility),
    beta: data.beta !== null ? Number(data.beta) : null,
    lookback_days: Number(data.lookback_days),
    updated_at: data.updated_at as string,
  }
}

// ---------------------------------------------------------------------------
// 4. Risk metrics (pre-computed)
// ---------------------------------------------------------------------------

/**
 * Fetch aggregated risk metrics from Supabase `risk_metrics` table.
 * Maps the flat DB row into the nested RiskMetrics type expected by components.
 */
export async function fetchRiskMetricsFromSupabase(symbol: string): Promise<RiskMetrics> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('risk_metrics')
    .select('*')
    .eq('stock_id', stockId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(`Risk metrics not found for "${symbol}": ${error?.message ?? 'no data'}`)
  }

  return {
    symbol,
    var: {
      symbol,
      confidence_levels: {
        '95': {
          historical: Number(data.var_95_hist),
        },
        '99': {
          historical: Number(data.var_99_hist),
        },
      },
      cvar_95: Number(data.cvar_95),
      lookback_days: Number(data.lookback_days),
    },
    volatility: {
      symbol,
      vol_30d: Number(data.vol_30d),
      vol_252d: Number(data.vol_252d),
      ewma_vol: Number(data.ewma_vol),
      lookback_days: Number(data.lookback_days),
    },
    drawdown: {
      symbol,
      max_drawdown: Number(data.max_drawdown),
      peak_date: '',     // not stored in pre-computed
      trough_date: '',   // not stored in pre-computed
      recovery_date: null,
    },
    ratios: {
      symbol,
      sharpe_ratio: Number(data.sharpe_ratio),
      sortino_ratio: Number(data.sortino_ratio),
      risk_free_rate: 0.05, // hardcoded same as backend
    },
    garch: null, // GARCH not pre-computed (stripped in Phase 12)
    beta: {
      symbol,
      beta: Number(data.beta),
      benchmark: '^TASI.SR',
      lookback_days: Number(data.lookback_days),
    },
  }
}

// ---------------------------------------------------------------------------
// 5. Monte Carlo results (pre-computed)
// ---------------------------------------------------------------------------

/**
 * Fetch pre-computed Monte Carlo simulation results from Supabase.
 */
export async function fetchMonteCarloFromSupabase(symbol: string): Promise<MonteCarloResult> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('monte_carlo_results')
    .select('*')
    .eq('stock_id', stockId)
    .single()

  if (error || !data) {
    throw new Error(`Monte Carlo results not found for "${symbol}": ${error?.message ?? 'no data'}`)
  }

  return {
    symbol,
    percentiles: data.percentiles as MonteCarloResult['percentiles'], // JSONB — already typed
    mc_var_95: Number(data.mc_var_95),
    mc_var_99: Number(data.mc_var_99),
    mc_cvar_95: Number(data.mc_cvar_95),
    days: data.days as number,
    paths: data.paths as number,
    elapsed_ms: Number(data.elapsed_ms),
    annual_volatility: Number(data.annual_volatility),
    daily_drift: Number(data.daily_drift),
    data_points_used: data.data_points_used as number,
  }
}

// ---------------------------------------------------------------------------
// 6. News articles with sentiment (joined)
// ---------------------------------------------------------------------------

/**
 * Fetch news articles with their sentiment labels and stock info from Supabase.
 * Joins news_articles ← sentiment_scores and news_articles → stocks.
 *
 * Only returns articles matched to a supported stock (stock_id IS NOT NULL)
 * unless a specific stockId is provided.
 */
export async function fetchNewsWithSentimentFromSupabase(
  limit = 1000,
  stockId?: number,
): Promise<NewsWithSentiment[]> {
  let query = supabase
    .from('news_articles')
    .select('*, sentiment_scores(sentiment, confidence), stocks!inner(symbol, name_ar, is_active)')
    .eq('stocks.is_active', true)
    .not('stock_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (stockId !== undefined) {
    query = query.eq('stock_id', stockId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`News query failed: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return []
  }

  return data.map((row) => {
    // sentiment_scores is a single object (article_id has UNIQUE constraint)
    // or an array depending on Supabase's inference — handle both
    const rawSent = row.sentiment_scores as
      | { sentiment: string; confidence: string | number }
      | { sentiment: string; confidence: string | number }[]
      | null
    const score = rawSent == null
      ? null
      : Array.isArray(rawSent)
        ? (rawSent.length > 0 ? rawSent[0] : null)
        : rawSent

    // stocks is a single object (many-to-one: many articles → one stock)
    const rawStock = row.stocks as
      | { symbol: string; name_ar: string }
      | null

    return {
      id: row.id as number,
      source: row.source as string,
      headline_ar: row.headline_ar as string,
      snippet_ar: (row.snippet_ar as string | null) ?? null,
      source_url: (row.source_url as string | null) ?? null,
      published_at: row.published_at as string,
      sentiment: score?.sentiment ?? null,
      confidence: score?.confidence != null ? Number(score.confidence) : null,
      stock_symbol: rawStock?.symbol ?? null,
      stock_name_ar: rawStock?.name_ar ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// 7. Sentiment summary (aggregated client-side)
// ---------------------------------------------------------------------------

/**
 * Fetch and aggregate sentiment scores for a stock from Supabase.
 * Returns a SentimentSummary with counts and percentages.
 */
export async function fetchSentimentSummaryFromSupabase(
  symbol: string,
): Promise<SentimentSummary> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('sentiment_scores')
    .select('sentiment, confidence')
    .eq('stock_id', stockId)

  if (error) {
    throw new Error(`Sentiment query failed for "${symbol}": ${error.message}`)
  }

  // If no sentiment scores exist, return zeroed-out summary
  if (!data || data.length === 0) {
    return {
      total_articles: 0,
      positive_count: 0,
      negative_count: 0,
      neutral_count: 0,
      positive_pct: 0,
      negative_pct: 0,
      neutral_pct: 0,
      avg_confidence: 0,
    }
  }

  let positive = 0
  let negative = 0
  let neutral = 0
  let totalConf = 0

  for (const row of data) {
    const sent = row.sentiment as string
    if (sent === 'positive') positive++
    else if (sent === 'negative') negative++
    else neutral++
    totalConf += Number(row.confidence ?? 0)
  }

  const total = data.length

  return {
    total_articles: total,
    positive_count: positive,
    negative_count: negative,
    neutral_count: neutral,
    positive_pct: total > 0 ? (positive / total) * 100 : 0,
    negative_pct: total > 0 ? (negative / total) * 100 : 0,
    neutral_pct: total > 0 ? (neutral / total) * 100 : 0,
    avg_confidence: total > 0 ? totalConf / total : 0,
  }
}

// ---------------------------------------------------------------------------
// 8. Pre-computed risk score
// ---------------------------------------------------------------------------

/** Shape of the pre-computed risk score returned from Supabase. */
export interface SupabaseRiskScore {
  overall_score: number
  quantitative_score: number
  sentiment_score: number
  interpretation_ar: string
  var_95_hist: number | null
  vol_252d: number | null
}

/**
 * Fetch the pre-computed composite risk score from Supabase risk_metrics.
 * Also fetches raw VaR and volatility for individual component breakdown.
 */
export async function fetchRiskScoreFromSupabase(symbol: string): Promise<SupabaseRiskScore> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('risk_metrics')
    .select('overall_score, quantitative_score, sentiment_score, interpretation_ar, var_95_hist, vol_252d')
    .eq('stock_id', stockId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(`Risk score not found for "${symbol}": ${error?.message ?? 'no data'}`)
  }

  return {
    overall_score: Number(data.overall_score),
    quantitative_score: Number(data.quantitative_score),
    sentiment_score: Number(data.sentiment_score),
    interpretation_ar: (data.interpretation_ar as string) ?? 'غير متاح',
    var_95_hist: data.var_95_hist != null ? Number(data.var_95_hist) : null,
    vol_252d: data.vol_252d != null ? Number(data.vol_252d) : null,
  }
}

// ---------------------------------------------------------------------------
// 8b. Risk score pair (current + previous for NabeehNotes narrative)
// ---------------------------------------------------------------------------

export interface RiskScoreRecord {
  overall_score: number
  var_95_hist: number
  vol_252d: number
  sentiment_score: number
  sr_break_detected: boolean
  sr_break_level: string | null
  computed_at: string
}

/**
 * Fetch the 2 most recent risk_metrics records for a stock.
 * Returns current + previous for old-vs-new narrative comparison.
 */
export async function fetchRiskScorePair(symbol: string): Promise<{
  current: RiskScoreRecord
  previous: RiskScoreRecord | null
}> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('risk_metrics')
    .select('overall_score, var_95_hist, vol_252d, sentiment_score, sr_break_detected, sr_break_level, computed_at')
    .eq('stock_id', stockId)
    .order('computed_at', { ascending: false })
    .limit(2)

  if (error || !data || data.length === 0) {
    throw new Error(`Risk score pair not found for "${symbol}": ${error?.message ?? 'no data'}`)
  }

  const mapRow = (row: typeof data[0]): RiskScoreRecord => ({
    overall_score: Number(row.overall_score),
    var_95_hist: Number(row.var_95_hist ?? -0.02),
    vol_252d: Number(row.vol_252d ?? 0.2),
    sentiment_score: Number(row.sentiment_score ?? 50),
    sr_break_detected: (row.sr_break_detected as boolean) ?? false,
    sr_break_level: (row.sr_break_level as string | null) ?? null,
    computed_at: row.computed_at as string,
  })

  return {
    current: mapRow(data[0]),
    previous: data.length > 1 ? mapRow(data[1]) : null,
  }
}

// ---------------------------------------------------------------------------
// 8c. AI-generated risk note (NabeehNotes — single source of truth)
// ---------------------------------------------------------------------------

export interface RiskNoteRecord {
  id: number
  computed_at: string
  overall_score: number
  prev_score: number | null
  headline_ar: string
  paragraphs_ar: string[]
  watch_points_ar: string[]
  source: 'ai' | 'fallback'
  model_used: string | null
}

/**
 * Fetch the most recent AI-generated risk note for a stock.
 * Returns null if no note exists — caller should fall back to client-side rules.
 */
export async function fetchLatestRiskNote(symbol: string): Promise<RiskNoteRecord | null> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('risk_notes')
    .select('id, computed_at, overall_score, prev_score, headline_ar, paragraphs_ar, watch_points_ar, source, model_used')
    .eq('stock_id', stockId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: Number(data.id),
    computed_at: data.computed_at as string,
    overall_score: Number(data.overall_score),
    prev_score: data.prev_score != null ? Number(data.prev_score) : null,
    headline_ar: (data.headline_ar as string) ?? '',
    paragraphs_ar: Array.isArray(data.paragraphs_ar) ? (data.paragraphs_ar as string[]) : [],
    watch_points_ar: Array.isArray(data.watch_points_ar) ? (data.watch_points_ar as string[]) : [],
    source: ((data.source as string) === 'ai' ? 'ai' : 'fallback'),
    model_used: (data.model_used as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// 9. All stocks summary (batch — dashboard table)
// ---------------------------------------------------------------------------

/** Summary row for one stock — used by the dashboard table. */
export interface StockSummaryRow {
  symbol: string
  name_ar: string
  name_en: string
  sector: string
  price: number | null
  change_percent: number | null
  risk_score: number | null
  risk_label_ar: string | null
  market_cap: number | null
}

/**
 * Batch-fetch all active stocks with latest price and risk score.
 * Uses 3 Supabase queries instead of N per-stock calls.
 */
export async function fetchAllStocksSummary(): Promise<StockSummaryRow[]> {
  // Query 1: All active stocks (with sector)
  const { data: stocks, error: stocksErr } = await supabase
    .from('stocks')
    .select('id, symbol, name_ar, name_en, sector_ar, sector_en, market_cap')
    .eq('is_active', true)
    .order('symbol')
  if (stocksErr) throw new Error(`Failed to fetch stocks: ${stocksErr.message}`)
  if (!stocks || stocks.length === 0) return []

  const stockIds = stocks.map(s => s.id as number)

  // Query 2: Risk metrics for all stocks (overall_score, interpretation_ar)
  const { data: risks } = await supabase
    .from('risk_metrics')
    .select('stock_id, overall_score, interpretation_ar')
    .in('stock_id', stockIds)

  // Build risk lookup map
  const riskMap = new Map<number, { score: number; label: string }>()
  if (risks) {
    for (const r of risks) {
      riskMap.set(r.stock_id as number, {
        score: Number(r.overall_score),
        label: r.interpretation_ar as string,
      })
    }
  }

  // Query 3: Latest 2 days of daily_prices for all stocks
  // Fetch recent prices — limit to 2 * stockCount to get ~2 rows per stock
  const { data: prices } = await supabase
    .from('daily_prices')
    .select('stock_id, close_price, trade_date')
    .in('stock_id', stockIds)
    .order('trade_date', { ascending: false })
    .limit(stocks.length * 2)

  // Group prices by stock_id, compute latest price + change %
  const priceMap = new Map<number, { price: number; changePct: number }>()
  if (prices) {
    // Group by stock_id
    const grouped = new Map<number, typeof prices>()
    for (const p of prices) {
      const sid = p.stock_id as number
      if (!grouped.has(sid)) grouped.set(sid, [])
      grouped.get(sid)!.push(p)
    }
    // For each stock, take latest 2 rows, compute change
    for (const [sid, rows] of grouped) {
      // Already sorted desc by trade_date from query
      const latest = Number(rows[0].close_price)
      const prev = rows.length > 1 ? Number(rows[1].close_price) : null
      const changePct = prev && prev !== 0 ? ((latest - prev) / prev) * 100 : 0
      priceMap.set(sid, { price: latest, changePct })
    }
  }

  // Merge into summary rows
  return stocks.map(s => {
    const sid = s.id as number
    const priceData = priceMap.get(sid)
    const riskData = riskMap.get(sid)
    return {
      symbol: s.symbol as string,
      name_ar: s.name_ar as string,
      name_en: s.name_en as string,
      sector: (s.sector_ar as string) ?? (s.sector_en as string) ?? '',
      price: priceData?.price ?? null,
      change_percent: priceData?.changePct ?? null,
      risk_score: riskData?.score ?? null,
      risk_label_ar: riskData?.label ?? null,
      market_cap: s.market_cap != null ? Number(s.market_cap) : null,
    }
  })
}

// ---------------------------------------------------------------------------
// 10. User profile (subscription plan)
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's subscription plan from user_profiles.
 *
 * Self-healing: if the profile row is missing (RLS misfire, missing trigger,
 * cleanup bug, etc.), a default `{ plan: 'free' }` row is auto-created and
 * re-read. Real database errors (not "row missing") are logged and surface as
 * `null` so callers can distinguish transient failures from first-load states.
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('plan, email_alerts_enabled, theme_preference, dashboard_preferences')
    .eq('user_id', userId)
    .maybeSingle()

  // If a real error occurred (not just "no row"), surface it by returning null
  if (error) {
    console.error('[fetchUserProfile] select error:', error.message)
    return null
  }

  if (!data) {
    // Row missing — auto-create a default profile and re-read
    const { error: insertErr } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId, plan: 'free' })

    if (insertErr) {
      console.error('[fetchUserProfile] auto-create failed:', insertErr.message)
      return null
    }

    const { data: retry, error: retryErr } = await supabase
      .from('user_profiles')
      .select('plan, email_alerts_enabled, theme_preference, dashboard_preferences')
      .eq('user_id', userId)
      .maybeSingle()

    if (retryErr || !retry) return null

    return {
      plan: retry.plan as UserProfile['plan'],
      email_alerts_enabled: (retry.email_alerts_enabled as boolean) ?? true,
      theme_preference: (retry.theme_preference as 'light' | 'dark') ?? 'light',
      dashboard_preferences: (retry.dashboard_preferences as AnalysisPreferences | null | undefined) ?? undefined,
    }
  }

  // dashboard_preferences is JSONB — may be null if column doesn't exist yet or not set
  const rawPrefs = data.dashboard_preferences as AnalysisPreferences | null | undefined

  return {
    plan: data.plan as UserProfile['plan'],
    email_alerts_enabled: (data.email_alerts_enabled as boolean) ?? true,
    theme_preference: (data.theme_preference as 'light' | 'dark') ?? 'light',
    dashboard_preferences: rawPrefs ?? undefined,
  }
}

/**
 * Update the user's notification/theme preferences.
 * Accepts partial updates — only the provided fields are written.
 */
export async function updateUserPreferences(
  userId: string,
  prefs: Partial<Pick<UserProfile, 'email_alerts_enabled' | 'theme_preference'>>,
): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .update({ ...prefs, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to update preferences: ${error.message}`)
  }
}

/**
 * Update the user's subscription plan (e.g. free → premium).
 *
 * Uses `upsert` with `onConflict: 'user_id'` so a missing profile row gets
 * created instead of being a silent `.update()` no-op. Returns the fully
 * materialized `UserProfile` so callers can optimistically write it into the
 * React Query cache. Throws if the write doesn't land (0 rows returned).
 */
export async function updateUserPlan(
  userId: string,
  plan: 'free' | 'premium',
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId, plan, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('plan, email_alerts_enabled, theme_preference, dashboard_preferences')
    .single()

  if (error || !data) {
    throw new Error(`Failed to update user plan: ${error?.message ?? 'no row returned'}`)
  }

  return {
    plan: data.plan as UserProfile['plan'],
    email_alerts_enabled: (data.email_alerts_enabled as boolean) ?? true,
    theme_preference: (data.theme_preference as 'light' | 'dark') ?? 'light',
    dashboard_preferences: (data.dashboard_preferences as AnalysisPreferences | null | undefined) ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// 11. Watchlist
// ---------------------------------------------------------------------------

/**
 * Fetch the user's watchlist stock symbols, ordered by most recently added.
 */
export async function fetchWatchlist(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('stock_symbol')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch watchlist: ${error.message}`)
  }

  return (data ?? []).map(row => row.stock_symbol as string)
}

/**
 * Add a stock to the user's watchlist.
 * Uses upsert to gracefully handle duplicate adds (no error on re-add).
 */
export async function addToWatchlist(userId: string, stockSymbol: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlist')
    .upsert(
      { user_id: userId, stock_symbol: stockSymbol },
      { onConflict: 'user_id,stock_symbol' },
    )

  if (error) {
    throw new Error(`Failed to add to watchlist: ${error.message}`)
  }
}

/**
 * Remove a stock from the user's watchlist.
 */
export async function removeFromWatchlist(userId: string, stockSymbol: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('stock_symbol', stockSymbol)

  if (error) {
    throw new Error(`Failed to remove from watchlist: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// 12. Search History
// ---------------------------------------------------------------------------

/**
 * Fetch the user's recent search history, ordered most recent first.
 */
export async function fetchSearchHistory(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_search_history')
    .select('stock_symbol')
    .eq('user_id', userId)
    .order('searched_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new Error(`Failed to fetch search history: ${error.message}`)
  }

  return (data ?? []).map(row => row.stock_symbol as string)
}

/**
 * Add a stock to the user's search history (upsert to update timestamp if exists).
 */
export async function addToSearchHistory(userId: string, stockSymbol: string): Promise<void> {
  const { error } = await supabase
    .from('user_search_history')
    .upsert(
      { user_id: userId, stock_symbol: stockSymbol, searched_at: new Date().toISOString() },
      { onConflict: 'user_id,stock_symbol' },
    )

  if (error) {
    throw new Error(`Failed to add to search history: ${error.message}`)
  }
}

/**
 * Clear all search history for a user.
 */
export async function clearSearchHistory(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_search_history')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to clear search history: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// 13. Analysis preferences (dashboard_preferences JSONB)
// ---------------------------------------------------------------------------
//
// NOTE: The `dashboard_preferences` JSONB column must exist on `user_profiles`.
// If it doesn't exist yet, run this migration in Supabase SQL editor:
//
//   ALTER TABLE user_profiles
//     ADD COLUMN IF NOT EXISTS dashboard_preferences JSONB DEFAULT NULL;
//
// The functions below handle null/missing gracefully by falling back to DEFAULT_PREFS.
// ---------------------------------------------------------------------------

/**
 * Fetch the user's analysis preferences from user_profiles.dashboard_preferences.
 * Returns DEFAULT_PREFS if no preferences are stored or column is null.
 */
export async function fetchAnalysisPrefs(userId: string): Promise<AnalysisPreferences> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('dashboard_preferences')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    // User profile missing — return defaults (safe fallback)
    return { ...DEFAULT_PREFS }
  }

  const raw = data.dashboard_preferences as AnalysisPreferences | null | undefined

  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFS }
  }

  // Merge with defaults to fill any missing fields (forward-compatible)
  return {
    indicators: {
      rsi: raw.indicators?.rsi ?? DEFAULT_PREFS.indicators.rsi,
      macd: raw.indicators?.macd ?? DEFAULT_PREFS.indicators.macd,
      bollinger: raw.indicators?.bollinger ?? DEFAULT_PREFS.indicators.bollinger,
    },
    risk: {
      var: raw.risk?.var ?? DEFAULT_PREFS.risk.var,
      volatility: raw.risk?.volatility ?? DEFAULT_PREFS.risk.volatility,
      drawdown: raw.risk?.drawdown ?? DEFAULT_PREFS.risk.drawdown,
    },
    indicatorPeriod: raw.indicatorPeriod ?? DEFAULT_PREFS.indicatorPeriod,
    mcHorizon: raw.mcHorizon ?? DEFAULT_PREFS.mcHorizon,
  }
}

/**
 * Upsert the user's analysis preferences into user_profiles.dashboard_preferences.
 * Accepts partial updates — reads current prefs first, deep-merges, then writes back.
 * Always sets updated_at to current timestamp.
 */
export async function upsertAnalysisPrefs(
  userId: string,
  partial: Partial<AnalysisPreferences>,
): Promise<void> {
  // Read current preferences (or defaults if none stored)
  const current = await fetchAnalysisPrefs(userId)

  // Deep-merge partial into current
  const merged: AnalysisPreferences = {
    indicators: {
      ...current.indicators,
      ...(partial.indicators ?? {}),
    },
    risk: {
      ...current.risk,
      ...(partial.risk ?? {}),
    },
    indicatorPeriod: partial.indicatorPeriod ?? current.indicatorPeriod,
    mcHorizon: partial.mcHorizon ?? current.mcHorizon,
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({
      dashboard_preferences: merged as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to update analysis preferences: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// 14. Event detection (S/R break status + sentiment shift)
// ---------------------------------------------------------------------------

/** Shape of the S/R break status returned from risk_metrics. */
export interface SRBreakStatus {
  detected: boolean
  level: string | null
  computedAt: string | null
}

/**
 * Fetch the latest S/R break status for a stock from risk_metrics.
 * Returns { detected: false } if no data or no break detected.
 */
export async function fetchSRBreakStatus(symbol: string): Promise<SRBreakStatus> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('risk_metrics')
    .select('sr_break_detected, sr_break_level, computed_at')
    .eq('stock_id', stockId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return { detected: false, level: null, computedAt: null }
  }

  return {
    detected: data.sr_break_detected ?? false,
    level: data.sr_break_level ?? null,
    computedAt: data.computed_at ?? null,
  }
}

/** Shape of the latest sentiment shift data. */
export interface SentimentShift {
  currentSentiment: 'positive' | 'negative' | 'neutral'
  articleCount: number
  latestAt: string | null
}

/**
 * Fetch the dominant sentiment from the last 10 sentiment scores for a stock.
 * Used for staleness detection — if sentiment shifts after an evaluation was
 * generated, the evaluation is stale.
 */
export async function fetchLatestSentimentShift(symbol: string): Promise<SentimentShift> {
  const stockId = await getStockIdBySymbol(symbol)

  const { data, error } = await supabase
    .from('sentiment_scores')
    .select('sentiment, analyzed_at')
    .eq('stock_id', stockId)
    .order('analyzed_at', { ascending: false })
    .limit(10)

  if (error || !data || data.length === 0) {
    return { currentSentiment: 'neutral', articleCount: 0, latestAt: null }
  }

  // Determine dominant sentiment from last 10 articles
  const pos = data.filter(d => d.sentiment === 'positive').length
  const neg = data.filter(d => d.sentiment === 'negative').length
  const dominant = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral'

  return {
    currentSentiment: dominant as 'positive' | 'negative' | 'neutral',
    articleCount: data.length,
    latestAt: data[0]?.analyzed_at ?? null,
  }
}

