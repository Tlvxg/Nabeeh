/**
 * StockLogo — displays a stock's logo by symbol.
 * Stocks with PNG logos show the full image. Others use a branded circle.
 */

import { useState } from 'react'
import './StockLogo.css'

/** Known stock brand colors (for circle fallback). */
const BRAND_COLORS: Record<string, string> = {
  '2222': '#006233', // Aramco green
  '1120': '#003B71', // Al Rajhi blue
  '2010': '#003D6B', // SABIC navy
  '7010': '#4F008C', // STC purple
}

/** Stocks that have a real PNG logo in /assets/logos/. */
const HAS_PNG_LOGO = new Set(['2222', '1120', '2010', '7010'])

/** Base URL from Vite config (always "/"). */
const BASE = import.meta.env.BASE_URL

interface StockLogoProps {
  symbol: string
  size?: number
  className?: string
}

export function StockLogo({ symbol, size = 40, className = '' }: StockLogoProps) {
  const [imgError, setImgError] = useState(false)

  // If no PNG logo or image failed to load → branded circle
  if (!HAS_PNG_LOGO.has(symbol) || imgError) {
    const bg = BRAND_COLORS[symbol] ?? 'var(--color-primary)'
    return (
      <span
        className={`stock-logo stock-logo--fallback ${className}`}
        style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      >
        {symbol.slice(0, 2)}
      </span>
    )
  }

  return (
    <img
      src={`${BASE}assets/logos/${symbol}.png?v=2`}
      alt={symbol}
      width={size}
      height={size}
      className={`stock-logo ${className}`}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  )
}
