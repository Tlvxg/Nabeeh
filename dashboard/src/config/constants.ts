/** App-wide constants */

export const API_URL = import.meta.env.VITE_API_URL || '/api'

/** Default values for the application */
export const DEFAULTS = {
  /** Default stock symbol (Aramco) */
  STOCK_SYMBOL: '2222',
  /** Default simulation paths */
  SIM_PATHS: 10_000,
  /** Default simulation horizon (trading days) */
  SIM_HORIZON: 252,
  /** Tadawul daily price limit (+/- 10%) */
  DAILY_LIMIT: 0.10,
} as const

/** API version prefix */
export const API_PREFIX = '/api/v1'
